import { createCombat, HEROES } from "../voyage/combat-rules.mjs";
import { ROUTES } from "../voyage/progression.mjs";

const ARENA_RADIUS = 12;
const CAST_RANGE = 13;
const POSE_METRES_PER_MS = 13.35 / 1000;
const INITIAL_POSE_ALLOWANCE = .24;
const MAX_POSE_ALLOWANCE = 3.2;
const STATE_INTERVAL_MS = 100;
const DISCONNECT_GRACE_MS = 10_000;
const FORFEIT_MINIMUM_PLAY_MS = 30_000;
const IDLE_EXPIRY_MS = 45_000;
const MAX_MATCH_MS = 6 * 60_000;
const MAX_FRAME_MS = 1_000;
const EPSILON = 1e-6;

function keysAre(value, fields) {
  return Object.keys(value).length === fields.length && fields.every((field) => Object.hasOwn(value, field));
}

function classify(packet) {
  if (!packet || typeof packet !== "object" || Array.isArray(packet)) return null;
  if (packet.type === "pose" && keysAre(packet, ["type", "x", "z"])
    && Number.isFinite(packet.x) && Number.isFinite(packet.z)
    && Math.hypot(packet.x, packet.z) <= ARENA_RADIUS + EPSILON) return "pose";
  if ((packet.type === "cast" || packet.type === "answer") && keysAre(packet, ["type", "slot"])
    && Number.isInteger(packet.slot) && packet.slot >= 0 && packet.slot <= 2) return packet.type;
  return null;
}

function validTimestamp(value) {
  return Number.isFinite(value) && value >= 0;
}

function participant(source, side, clock) {
  if (!source || typeof source.id !== "string" || !source.id || source.id.length > 160
    || typeof source.hero !== "string" || !Object.hasOwn(HEROES, source.hero)
    || typeof source.name !== "string" || !source.name.trim() || source.name.length > 80) {
    throw new TypeError("Ranked players need an ID, known hero and display name.");
  }
  return {
    details: Object.freeze({ id: source.id, name: source.name, hero: source.hero }),
    side, pose: { x: 0, z: side === 0 ? 5 : -5 },
    allowance: INITIAL_POSE_ALLOWANCE,
    poseClock: clock,
    disconnectedAt: null,
    attempted: false,
  };
}

export function createRankedRoom({ id, route, players, send, onFinish, now = Date.now() } = {}) {
  if (typeof id !== "string" || !id || !ROUTES.some(({ id: candidate }) => candidate === route)
    || !Array.isArray(players) || players.length !== 2 || typeof send !== "function"
    || typeof onFinish !== "function" || !validTimestamp(now)) {
    throw new TypeError("A ranked room needs an ID, route, two players and server callbacks.");
  }
  const fighters = players.map((player, side) => participant(player, side, now));
  if (fighters[0].details.id === fighters[1].details.id) throw new TypeError("Ranked players must be distinct.");
  const byId = new Map(fighters.map((fighter) => [fighter.details.id, fighter]));
  const details = Object.freeze(fighters.map((fighter) => fighter.details));
  const combat = createCombat({ route, heroes: details.map(({ hero }) => hero) });
  let clock = now;
  let playedMs = 0;
  let lastBroadcast = -Infinity;
  let outcome = null;

  const connected = (fighter) => fighter.disconnectedAt === null;
  const allConnected = () => fighters.every(connected);

  function to(fighter, packet) {
    if (!connected(fighter)) return;
    try {
      send(fighter.details.id, packet);
    } catch {
      // Transport adapters report their close event independently of the simulation.
    }
  }

  function stateFor(fighter) {
    to(fighter, { type: "state", route, state: combat.read(fighter.side) });
  }

  function broadcast() {
    lastBroadcast = clock;
    fighters.forEach(stateFor);
  }

  function finish(winner, reason) {
    if (outcome) return;
    outcome = Object.freeze({ id, route, players: details, winner, reason });
    broadcast();
    onFinish(outcome);
  }

  function advance(timestamp) {
    if (outcome || !validTimestamp(timestamp) || timestamp < clock) return false;
    const elapsed = timestamp - clock;
    clock = timestamp;
    const absent = fighters.filter((fighter) => !connected(fighter));
    if (absent.length) {
      const graceOver = absent.some((fighter) => clock - fighter.disconnectedAt >= DISCONNECT_GRACE_MS);
      if (graceOver) {
        const started = fighters.every(({ attempted }) => attempted) || playedMs >= FORFEIT_MINIMUM_PLAY_MS;
        if (absent.length === 1 && started) finish(1 - absent[0].side, "forfeit");
        else finish(null, "expired");
        return false;
      }
    } else if (elapsed > 0) {
      const due = Math.min(elapsed, MAX_FRAME_MS);
      playedMs += due;
      combat.tick(due / 1000);
      const winner = combat.read().winner;
      if (winner !== null) {
        finish(winner, "complete");
        return false;
      }
    }
    if (clock - now >= MAX_MATCH_MS || (clock - now >= IDLE_EXPIRY_MS && !fighters.some(({ attempted }) => attempted))) {
      finish(null, "expired");
      return false;
    }
    return true;
  }

  function move(fighter, { x, z }) {
    const accrued = (clock - fighter.poseClock) * POSE_METRES_PER_MS;
    fighter.allowance = Math.min(MAX_POSE_ALLOWANCE, fighter.allowance + accrued);
    fighter.poseClock = clock;
    const distance = Math.hypot(x - fighter.pose.x, z - fighter.pose.z);
    if (distance > fighter.allowance + EPSILON) return false;
    fighter.allowance = Math.max(0, fighter.allowance - distance);
    if (distance > EPSILON) {
      fighter.pose = { x, z };
      combat.setPose(fighter.side, fighter.pose);
      to(fighters[1 - fighter.side], { type: "pose", x, z });
    }
    return true;
  }

  function message(playerId, packet, timestamp = Date.now()) {
    const fighter = byId.get(playerId);
    const type = classify(packet);
    if (!fighter || !type || !connected(fighter) || !advance(timestamp) || !allConnected()) return false;
    if (type === "pose") return move(fighter, packet);

    const enemy = fighters[1 - fighter.side];
    if (type === "cast") {
      if (Math.hypot(fighter.pose.x - enemy.pose.x, fighter.pose.z - enemy.pose.z) > CAST_RANGE
        || !combat.cast(fighter.side, packet.slot)) return false;
      fighter.attempted = true;
      stateFor(fighter);
    } else {
      if (!combat.answer(fighter.side, packet.slot)) return false;
      broadcast();
    }
    return true;
  }

  function tick(timestamp = Date.now()) {
    if (advance(timestamp) && clock - lastBroadcast >= STATE_INTERVAL_MS) broadcast();
  }

  function disconnect(playerId, timestamp = Date.now()) {
    const fighter = byId.get(playerId);
    if (!fighter || !connected(fighter) || !validTimestamp(timestamp) || !advance(Math.max(clock, timestamp))) return false;
    fighter.disconnectedAt = clock;
    to(fighters[1 - fighter.side], { type: "room-status", status: "disconnected" });
    broadcast();
    return true;
  }

  function reconnect(playerId, timestamp = Date.now()) {
    const fighter = byId.get(playerId);
    if (!fighter || connected(fighter) || !validTimestamp(timestamp) || !advance(Math.max(clock, timestamp))) return false;
    fighter.disconnectedAt = null;
    const enemy = fighters[1 - fighter.side];
    for (const participant of fighters) {
      participant.allowance = INITIAL_POSE_ALLOWANCE;
      participant.poseClock = clock;
    }
    to(fighter, { type: "self-pose", ...fighter.pose });
    to(fighter, { type: "pose", ...enemy.pose });
    to(enemy, { type: "pose", ...fighter.pose });
    if (connected(enemy)) to(enemy, { type: "room-status", status: "connected" });
    else to(fighter, { type: "room-status", status: "disconnected" });
    broadcast();
    return true;
  }

  return Object.freeze({ message, tick, disconnect, reconnect, get finished() { return outcome !== null; } });
}
