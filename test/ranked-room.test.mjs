import assert from "node:assert/strict";
import test from "node:test";
import { createRankedRoom } from "../server/ranked-room.mjs";

const pair = [
  { id: "alpha", hero: "gale", name: "Alder" },
  { id: "bravo", hero: "ember", name: "Birch" },
];

function session(overrides = {}) {
  const sent = [];
  const results = [];
  const room = createRankedRoom({
    id: "room-1", route: "k", players: pair, now: 0,
    send: (id, packet) => sent.push({ id, packet }),
    onFinish: (result) => results.push(result),
    ...overrides,
  });
  const latest = (id, type) => sent.findLast(({ id: who, packet }) => who === id && packet.type === type)?.packet;
  return { room, sent, results, latest };
}

function spell(room, latest, side, slot, now) {
  assert.equal(room.message(side, { type: "cast", slot }, now), true);
  const pending = latest(side, "state").state.pending;
  const stars = [...pending.question.matchAll(/✦/gu)].length;
  const lost = Number(pending.question.match(/(\d+) sparks fly away/u)?.[1]) || 0;
  const answer = pending.choices.indexOf(String(stars - lost));
  assert.notEqual(answer, -1);
  assert.equal(room.message(side, { type: "answer", slot: answer }, now), true);
}

test("ranked snapshots wait for first tick and keep each pending question private", () => {
  const { room, sent, latest } = session();
  assert.deepEqual(sent, []);
  room.tick(0);
  assert.equal(sent.length, 2);
  assert.equal(latest("alpha", "state").route, "k");
  assert.deepEqual(latest("bravo", "state").state.fighters.map(({ hp, signature }) => [hp, signature]), [[100, false], [100, false]]);
  room.tick(55);
  assert.equal(sent.length, 2);
  room.tick(100);
  assert.equal(sent.length, 4);
  assert.equal(room.message("alpha", { type: "cast", slot: 0 }, 120), true);
  const local = latest("alpha", "state").state;
  assert.match(local.pending.question, /Count the sparks/u);
  assert.equal(latest("bravo", "state").state.pending, null);
  assert.doesNotMatch(JSON.stringify(local), /answerIndex/u);
  room.tick(200);
  assert.equal(latest("bravo", "state").state.pending, null);
});

test("ranked accepts only its matched players and never allows client outcomes or signatures", () => {
  const { room, sent, results } = session();
  for (const packet of [
    null, [], { type: "victory", winner: 0 }, { type: "state", winner: 0 },
    { type: "answer", slot: 0, correct: true }, { type: "cast", slot: 3 },
    { type: "answer", slot: 3 }, { type: "cast", slot: "0" }, { type: "pose", x: NaN, z: 0 },
    { type: "pose", x: 12.1, z: 0 }, { type: "pose", x: 0, z: 5, side: 1 },
  ]) {
    assert.equal(room.message("alpha", packet, 1), false);
  }
  assert.equal(room.message("intruder", { type: "cast", slot: 0 }, 1), false);
  assert.deepEqual(sent, []);
  assert.deepEqual(results, []);
  room.tick(100);
  assert.equal(room.message("alpha", { type: "cast", slot: 0 }, 99), false);
  assert.equal(room.message("alpha", { type: "answer", slot: 0 }, 100), false);
  assert.equal(room.message("alpha", { type: "cast", slot: 0 }, 100), true);
});

test("ranked movement admits an honest dodge without allowing same-time speed amplification", () => {
  const { room, sent, latest } = session();
  assert.equal(room.message("alpha", { type: "pose", x: 2.9, z: 5 }, 0), false);
  assert.equal(room.message("alpha", { type: "pose", x: 1.26, z: 5 }, 100), true);
  assert.deepEqual(latest("bravo", "pose"), { type: "pose", x: 1.26, z: 5 });
  assert.equal(latest("alpha", "pose"), undefined);
  assert.equal(room.message("alpha", { type: "pose", x: 1.41, z: 5 }, 100), true);
  const delivered = sent.length;
  for (let count = 0; count < 5; count++) {
    assert.equal(room.message("alpha", { type: "pose", x: 1.61, z: 5 }, 100), false);
  }
  assert.equal(sent.length, delivered);
  assert.equal(room.message("alpha", { type: "pose", x: 9, z: 5 }, 4000), false);
});

test("cast range is based on the server's last valid poses", () => {
  const { room, latest } = session();
  assert.equal(room.message("alpha", { type: "pose", x: 0, z: 8 }, 1000), true);
  assert.equal(room.message("bravo", { type: "pose", x: 0, z: -8 }, 1000), true);
  assert.equal(room.message("alpha", { type: "cast", slot: 0 }, 1000), false);
  assert.equal(room.message("alpha", { type: "pose", x: 0, z: 6 }, 1200), true);
  assert.equal(room.message("bravo", { type: "pose", x: 0, z: -6 }, 1200), true);
  spell(room, latest, "alpha", 0, 1200);
  assert.equal(latest("bravo", "state").state.fighters[1].hp, 100);
  assert.equal(latest("bravo", "state").state.attacks[0].destination.z, -6);
});

test("only actual combat can settle a room as a completed result, with one callback", () => {
  const { room, latest, results } = session();
  for (const slot of [0, 1, 2]) spell(room, latest, "alpha", slot, 0);
  assert.equal(latest("bravo", "state").state.fighters[1].hp, 100);
  for (let time = 1000; time <= 10_000; time += 1000) room.tick(time);
  assert.equal(latest("bravo", "state").state.fighters[1].hp, 34);
  spell(room, latest, "alpha", 2, 10_000);
  room.tick(11_000);
  room.tick(11_300);
  assert.equal(room.finished, true);
  assert.deepEqual(results, [{ id: "room-1", route: "k", players: pair, winner: 0, reason: "complete" }]);
  assert.equal(latest("bravo", "state").state.winner, 0);
  room.tick(12_000);
  room.disconnect("alpha", 12_000);
  assert.equal(room.message("bravo", { type: "cast", slot: 0 }, 12_000), false);
  assert.equal(results.length, 1);
});

test("a disconnect freezes the clock, permits a reconnect and preserves a pending answer", () => {
  const { room, latest, results } = session();
  assert.equal(room.message("alpha", { type: "cast", slot: 1 }, 0), true);
  assert.equal(room.disconnect("bravo", 10), true);
  assert.deepEqual(latest("alpha", "room-status"), { type: "room-status", status: "disconnected" });
  const deadline = latest("alpha", "state").state.pending.seconds;
  room.tick(7000);
  assert.equal(latest("alpha", "state").state.pending.seconds, deadline);
  assert.equal(room.message("alpha", { type: "answer", slot: 0 }, 8000), false);
  assert.equal(room.reconnect("bravo", 9000), true);
  assert.deepEqual(latest("alpha", "room-status"), { type: "room-status", status: "connected" });
  assert.equal(latest("alpha", "state").state.pending.seconds, deadline);
  room.tick(9100);
  assert.ok(latest("alpha", "state").state.pending.seconds < deadline);
  assert.deepEqual(results, []);
});

test("disconnect grace ends in a started forfeit, an unstarted expiry, or no result if both leave", () => {
  const active = session();
  assert.equal(active.room.message("alpha", { type: "cast", slot: 0 }, 0), true);
  assert.equal(active.room.message("bravo", { type: "cast", slot: 0 }, 0), true);
  active.room.disconnect("alpha", 1000);
  active.room.tick(10_999);
  assert.equal(active.room.finished, false);
  active.room.tick(11_000);
  assert.equal(active.results[0].reason, "forfeit");
  assert.equal(active.results[0].winner, 1);
  assert.equal(active.room.reconnect("alpha", 11_030), false);

  const early = session();
  early.room.disconnect("alpha", 200);
  early.room.tick(10_200);
  assert.equal(early.results[0].reason, "expired");
  assert.equal(early.results[0].winner, null);

  const abandoned = session();
  abandoned.room.message("alpha", { type: "cast", slot: 0 }, 0);
  abandoned.room.message("bravo", { type: "cast", slot: 0 }, 0);
  abandoned.room.disconnect("alpha", 40);
  abandoned.room.disconnect("bravo", 50);
  abandoned.room.tick(10_040);
  assert.equal(abandoned.results[0].reason, "expired");
  assert.equal(abandoned.results[0].winner, null);
});

test("long idle rooms expire unrated and a server scheduling lapse advances at most one second", () => {
  const { room, results, latest } = session();
  room.tick(2500);
  assert.equal(latest("alpha", "state").state.time, 1);
  room.tick(44_999);
  assert.equal(room.finished, false);
  room.tick(45_000);
  assert.equal(room.finished, true);
  assert.equal(results[0].reason, "expired");
  assert.equal(results[0].winner, null);
});
