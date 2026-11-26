import { HEROES, combatSpawn, createCombat } from "./combat-rules.mjs";
import { normalizeAppearance } from "./appearance.mjs";
import { createDuelArena } from "./duel-arena.mjs";
import { SIGNATURE_LEVEL, SIGNATURE_PRICE } from "./hero-growth.mjs";
import { ROUTES } from "./progression.mjs";

const get = (id) => document.getElementById(id);
const knownHero = (hero) => typeof hero === "string" && Object.hasOwn(HEROES, hero);
const validSlot = (slot) => Number.isInteger(slot) && slot >= 0 && slot < 4;
const validChoice = (choice) => validSlot(choice) && choice < 3;
const matchVersion = 2;
const signatureCostLabel = `Lv ${SIGNATURE_LEVEL} + ${SIGNATURE_PRICE} gold`;
const effectNames = Object.freeze({
  evade: "Dash", haste: "Recharge", pierce: "Pierce shield", shield: "Shield",
  "cleanse-shield": "Cleanse / shield", "shield-heal": "Shield / heal", heal: "Heal", burn: "Ember damage", "heal-burn": "Heal / embers",
  "dash-haste": "Dash / recharge", "shield-cleanse": "Shield / cleanse", rekindle: "Heal / embers",
  wash: "Remove ward", undertow: "Delay skills", riptide: "Break ward / delay", maelstrom: "Heavy ward break",
  briar: "Mark rival", bark: "Guard / mark", bramble: "Heavy mark", grove: "Team guard / mark",
  resonance: "Long reach", refrain: "Recharge ally", harmonic: "Pierce ward", overtone: "Team recharge",
  chill: "Chill", shatter: "Shatter chilled rival", whiteout: "Chill / delay", glacier: "Shatter / delay",
});
const styleNames = Object.freeze({ bolt: "Bolt", wave: "Wave", area: "Area" });
const effectsOnHit = {
  strip: ["strike", "Ward broken"],
  delay: ["cast", "Recharge slowed"],
  briar: ["cleanse", "Briar mark applied"],
  "briar-hit": ["strike", "Briar follow-up"],
  chill: ["shield", "Chilled"],
  shatter: ["strike", "Ice shattered"],
};
const knownStyle = (style) => typeof style === "string" && Object.hasOwn(styleNames, style);
const tiers = ["Easy", "Medium", "Hard", "Signature"];
const exitRadius = 1.55;

function point(value) {
  return value && Number.isFinite(value.x) && Math.abs(value.x) <= 42
    && Number.isFinite(value.z) && Math.abs(value.z) <= 42;
}

function readSnapshot(state, size) {
  if (!state || typeof state !== "object" || !Array.isArray(state.fighters) || state.fighters.length !== size
    || ![null, 0, 1, "draw"].includes(state.winner) || !Number.isFinite(state.time) || state.time < 0) return null;
  if (state.fighters.some((fighter) => !fighter || !knownHero(fighter.hero)
    || !Number.isFinite(fighter.hp) || fighter.hp < 0 || fighter.hp > 100
    || !Number.isFinite(fighter.shield) || fighter.shield < 0 || fighter.shield > 25
    || typeof fighter.signature !== "boolean" || !Array.isArray(fighter.cooldowns) || fighter.cooldowns.length !== 4
    || fighter.cooldowns.some((cd) => !Number.isFinite(cd) || cd < 0 || cd > 14))) return null;
  if (state.pending !== null && (!state.pending || typeof state.pending.question !== "string"
    || state.pending.question.length > 200 || !validSlot(state.pending.slot)
    || !Array.isArray(state.pending.choices) || state.pending.choices.length !== 3
    || state.pending.choices.some((choice) => typeof choice !== "string" || choice.length > 32)
    || !Number.isFinite(state.pending.seconds) || state.pending.seconds < 0 || state.pending.seconds > 20)) return null;
  if (!Array.isArray(state.events) || state.events.length > 32
    || state.events.some((event) => !event || typeof event.kind !== "string" || event.kind.length > 16
      || !Number.isSafeInteger(event.id) || event.id < 1
      || (event.kind !== "victory" && !(Number.isInteger(event.side) && event.side >= 0 && event.side < size)))) return null;
  if (!Array.isArray(state.attacks) || state.attacks.length > 12
    || state.attacks.some((attack) => !point(attack) || !point(attack.origin) || !point(attack.destination)
      || !Number.isSafeInteger(attack.id) || attack.id < 1 || !knownHero(attack.hero) || !validSlot(attack.slot)
      || !Number.isInteger(attack.side) || attack.side < 0 || attack.side >= size || !knownStyle(attack.style)
      || !["windup", "projectile", "telegraph"].includes(attack.phase)
      || !Number.isFinite(attack.radius) || attack.radius <= 0 || attack.radius > 4
      || !Number.isFinite(attack.directionX) || Math.abs(attack.directionX) > 1
      || !Number.isFinite(attack.directionZ) || Math.abs(attack.directionZ) > 1
      || !Number.isFinite(attack.seconds) || attack.seconds < 0 || attack.seconds > 5
      || !Number.isFinite(attack.progress) || attack.progress < 0 || attack.progress > 1)) return null;
  return state;
}

function label(element, value) {
  if (element.textContent !== value) element.textContent = value;
}

export function createArenaDuel(root, { route, hero, appearance, progress, connection, player, sound, onExit, onRankedAction, onComplete }) {
  const solo = !connection;
  const ranked = connection?.kind === "ranked";
  const teamMode = ranked && connection.mode === "duo";
  const side = connection?.side ?? 0;
  const size = teamMode ? 4 : 2;
  const teamOf = (playerSide) => teamMode ? Math.floor(playerSide / 2) : playerSide;
  const validSide = (playerSide) => Number.isInteger(playerSide) && playerSide >= 0 && playerSide < size;
  const homeTeam = teamOf(side);
  const opponents = teamMode ? (homeTeam === 0 ? [2, 3] : [0, 1]) : [1 - side];
  const remoteSide = opponents[0];
  const allySide = side ^ 1;
  const roster = teamMode ? connection.roster.map((entry, slot) => ({ ...entry, side: slot,
    appearance: normalizeAppearance(entry.hero, entry.appearance) })) : [];
  const positions = Array.from({ length: size }, (_, slot) => combatSpawn(slot, teamMode));
  const other = positions[remoteSide];
  let targetSide = teamMode ? 3 - side : remoteSide;
  let enemy = teamMode ? roster[targetSide].hero
    : ranked ? connection.rivalHero : hero === "warden" ? "ember" : "warden";
  let rivalAppearance = ranked && !teamMode ? normalizeAppearance(enemy, connection.rivalAppearance) : undefined;
  const map = createDuelArena(root, { side, rivalHero: enemy, rivalAppearance, teamMode, roster });
  const exit = { x: 0, y: 0, z: homeTeam === 0 ? 10 : -10 };
  const signature = !ranked && progress.signature;
  const dodgeCooldown = ranked ? 2.8 : progress.dodgeCooldown;
  let combat = solo ? createCombat({ heroes: [hero, enemy], route, signatures: [signature, signature] }) : null;
  let snapshot = combat?.read(side) ?? null;
  let matchRoute = route;
  let left = false;
  let disposed = false;
  let pendingAnswer = false;
  let versionMismatch = false;
  let roomPaused = false;
  let ranking = null;
  let finished = false;
  let result;
  let clock = 0;
  let nextMessage = 0;
  let nextPose = 0;
  let dodgeReadyAt = 0;
  let lastEvent = 0;
  let status = "Move into range and choose a skill.";
  let statusUntil = 0;
  let botCastAt = 4.15;
  let botReplyAt = 0;
  let botSlot = 0;
  const flags = new AbortController();
  const ui = get("duel-hud");
  const spells = [...ui.querySelectorAll("[data-duel-slot]")];
  const answers = [...ui.querySelectorAll("[data-duel-answer]")];
  const dodgeButton = get("duel-dodge");
  const targetButtons = [get("duel-foe-1"), get("duel-foe-2")];

  const playerPosition = () => {
    const p = player().position;
    return { x: p.x, z: p.z };
  };
  const displayName = (id) => HEROES[id]?.name ?? "";
  const battlePosition = (whichSide) => whichSide === side ? playerPosition() : positions[whichSide] ?? other;
  const isOut = (slot) => snapshot?.fighters[slot]?.hp === 0;
  const localCanMove = () => !roomPaused && (!teamMode || !isOut(side) || snapshot?.winner != null || ranking);
  const close = (limit) => {
    const current = playerPosition();
    const target = positions[targetSide];
    return Math.hypot(current.x - target.x, current.z - target.z) <= limit;
  };

  function showStatus(text) {
    status = text;
    statusUntil = clock + 2.6;
  }

  function syncPose() {
    combat?.setPose(side, playerPosition());
    combat?.setPose(remoteSide, other);
  }

  function sendPose() {
    connection?.send({ type: "pose", ...playerPosition() });
  }

  function transmit() {
    if (!disposed && combat && connection) connection.send({ type: "state", route: matchRoute, state: combat.read(remoteSide) });
  }

  function handlePacket({ message, closed }) {
    if (disposed) return;
    if (closed) {
      left = true;
      pendingAnswer = false;
      if (ranked) player().setEnabled(true);
      return;
    }
    if (ranked && message.type === "room-status") {
      roomPaused = message.status === "disconnected";
      player().setEnabled(Boolean(localCanMove()));
      pendingAnswer = false;
    } else if (ranked && message.type === "self-pose" && point(message) && map.canWalk(message.x, message.z)) {
      player().reset({ x: message.x, z: message.z, yaw: map.spawn.yaw });
    } else if (ranked && message.type === "error" && message.code === "rating-unavailable") {
      ranking = { reason: "expired", outcome: "expired" };
      player().setEnabled(true);
      paint();
    } else if (ranked && message.type === "ranking" && message.matchId === connection.matchId
      && ["win", "loss", "draw", "expired"].includes(message.outcome)) {
      if (ranking) return;
      ranking = message;
      pendingAnswer = false;
      player().setEnabled(true);
      settle();
      paint();
    } else if (!ranked && message.type === "hello") {
      if (message.version !== matchVersion || typeof message.signature !== "boolean" || !knownHero(message.hero)) {
        versionMismatch = true;
        return;
      }
      if (combat || snapshot || versionMismatch) return;
      enemy = message.hero;
      rivalAppearance = normalizeAppearance(enemy, message.appearance);
      if (side === 0) {
        combat = createCombat({ heroes: [hero, enemy], route, signatures: [signature, message.signature] });
        syncPose();
        snapshot = combat.read(side);
        transmit();
      }
    } else if (message.type === "pose" && Number.isFinite(message.x) && Number.isFinite(message.z)
      && map.canWalk(message.x, message.z)) {
      const slot = teamMode ? message.side : remoteSide;
      if (validSide(slot) && slot !== side) {
        positions[slot].x = message.x;
        positions[slot].z = message.z;
      }
    } else if (message.type === "state" && (ranked || side === 1)) {
      const received = readSnapshot(message.state, size);
      if (!received || versionMismatch || (snapshot && received.time < snapshot.time)
        || received.fighters[side].hero !== hero || received.fighters[side].signature !== signature
        || (ranked ? message.route !== route : !ROUTES.some((item) => item.id === message.route))) return;
      matchRoute = message.route;
      const wasPending = snapshot?.pending;
      snapshot = received;
      if (!received.pending || !wasPending || received.pending.slot !== wasPending.slot || received.pending.question !== wasPending.question) {
        pendingAnswer = false;
      }
      if (teamMode) {
        if (isOut(targetSide)) targetSide = opponents.find((slot) => !isOut(slot)) ?? targetSide;
        player().setEnabled(Boolean(localCanMove()));
      }
      enemy = received.fighters[targetSide].hero;
      settle();
    } else if (side === 0 && combat && !left && validSlot(message.slot)) {
      syncPose();
      if (message.type === "cast" && close(13)) combat.cast(remoteSide, message.slot);
      if (message.type === "answer" && validChoice(message.slot)) combat.answer(remoteSide, message.slot);
      snapshot = combat.read(side);
      transmit();
    }
  }

  function keyboard(event) {
    if (disposed || event.repeat || event.altKey || event.metaKey || event.ctrlKey || event.target?.matches("textarea, input, select")) return;
    if (event.code === "KeyF") { event.preventDefault(); dodge(); return; }
    if (teamMode && event.code === "KeyT" && isActive() && !snapshot.pending) {
      event.preventDefault();
      selectTarget(opponents.find((slot) => slot !== targetSide && !isOut(slot)) ?? targetSide);
      return;
    }
    if (!/^Digit[1234]$/.test(event.code)) return;
    event.preventDefault();
    use(Number(event.code.slice(-1)) - 1);
  }

  function isActive() {
    return Boolean(snapshot) && !left && !versionMismatch && !ranking && !roomPaused && !isOut(side) && snapshot.winner === null;
  }

  function selectTarget(slot) {
    if (!teamMode || !isActive() || snapshot.pending || !opponents.includes(slot) || isOut(slot)) return;
    targetSide = slot;
    canvasFocus();
    paint();
  }

  function dodge() {
    if (!isActive() || clock < dodgeReadyAt || !player().dodge()) return;
    dodgeReadyAt = clock + dodgeCooldown;
    const position = playerPosition();
    map.pulse({ kind: "dodge", side, hero, origin: position, target: position });
    canvasFocus();
    paint();
  }

  function use(slot) {
    if (!isActive() || !validSlot(slot) || pendingAnswer) return;
    const isAnswer = Boolean(snapshot.pending);
    if ((isAnswer && !validChoice(slot)) || (!isAnswer && slot === 3 && !signature)) return;
    if (!isAnswer && (!close(13) || snapshot.fighters[side].cooldowns[slot] > 0)) {
      if (!close(13)) showStatus("Move closer to your rival.");
      return;
    }
    if (combat) {
      syncPose();
      if (isAnswer) combat.answer(side, slot);
      else combat.cast(side, slot);
      snapshot = combat.read(side);
      transmit();
    } else {
      sendPose();
      pendingAnswer = isAnswer && connection.send({ type: "answer", slot });
      if (!isAnswer) connection.send(teamMode ? { type: "cast", slot, target: targetSide } : { type: "cast", slot });
    }
    canvasFocus();
    animateEvents();
    paint();
  }

  function canvasFocus() { get("world").focus({ preventScroll: true }); }

  function settle() {
    if (finished || (ranked ? !ranking : snapshot?.winner == null)) return;
    finished = true;
    if (ranked && ranking.reason !== "complete") return;
    const outcome = ranked ? ranking.outcome : snapshot.winner === "draw" ? "draw" : snapshot.winner === side ? "win" : "loss";
    void Promise.resolve(onComplete(outcome, solo ? "practice" : "friend")).then((value) => {
      result = value;
      if (!disposed) paint();
    });
  }

  function paint() {
    const local = snapshot?.fighters[side];
    const rival = snapshot?.fighters[targetSide];
    const mode = teamMode ? "Ranked 2v2" : ranked ? "Ranked duel" : solo ? "Practice duel" : "Friend duel";
    label(get("duel-battle-name"), mode);
    label(get("duel-you"), `${displayName(local?.hero ?? hero)} · Lv ${progress.level}`);
    const rivalHero = displayName(rival?.hero ?? enemy);
    label(get("duel-rival"), teamMode ? roster[targetSide].name
      : ranked && connection.rivalName ? connection.rivalName : rivalHero);
    get("duel-rival").title = ranked ? rivalHero : "";
    fillMeter("you", local);
    fillMeter("rival", rival);
    const active = isActive();
    const pending = active ? snapshot.pending : null;
    get("duel-question").hidden = !pending;
    if (pending) {
      label(get("duel-question-text"), pending.question);
      label(get("duel-seconds"), `${Math.ceil(pending.seconds)}s`);
    }
    answers.forEach((button, index) => {
      if (pending) label(button.querySelector("span"), pending.choices[index]);
      button.disabled = !pending || pendingAnswer;
    });
    HEROES[hero].skills.forEach((skill, index) => {
      const button = spells[index];
      const remaining = local?.cooldowns[index] ?? 0;
      const locked = index === 3 && !signature;
      const text = locked ? (ranked ? "Casual matches" : signatureCostLabel) : `${styleNames[skill.style]} · ${skill.damage} dmg · ${remaining > 0 ? Math.ceil(remaining) + "s left" : skill.cooldown + "s CD"}`;
      button.disabled = !active || Boolean(pending) || locked || remaining > 0;
      button.title = locked ? (ranked ? "Ranked matches use each hero's three base skills."
        : `Train this skill at your hero stone with ${SIGNATURE_PRICE} gold at level ${SIGNATURE_LEVEL}.`) : `${tiers[index]} · ${skill.description}`;
      button.dataset.tier = tiers[index].toLowerCase();
      button.dataset.locked = String(locked);
      label(button.querySelector("strong"), skill.name);
      label(button.querySelector("span"), locked ? text : text + " · " + (effectNames[skill.effect] ?? ""));
      button.style.setProperty("--cooldown", `${100 * remaining / skill.cooldown}%`);
      button.setAttribute("aria-label", `${skill.name}, ${text}. ${effectNames[skill.effect] ?? skill.effect}.`);
    });
    const winner = ranking?.outcome === "win" ? homeTeam : ranking?.outcome === "loss" ? 1 - homeTeam
      : ranking?.outcome === "draw" ? "draw" : snapshot?.winner;
    const ended = winner != null || Boolean(ranking) || (ranked && left);
    const position = playerPosition();
    const danger = active && snapshot.attacks.some((attack) => teamOf(attack.side) !== homeTeam && attack.phase === "telegraph"
      && Math.hypot(position.x - attack.x, position.z - attack.z) <= attack.radius + .4);
    const message = ranking?.outcome === "expired" ? "Match ended without a score."
      : ranked && left && winner == null ? "Connection to Ranked Arena ended."
        : ended ? `${winner === "draw" ? "A draw." : winner === homeTeam ? (teamMode ? "Your team won!" : "You won!")
          : (teamMode ? "The other team won." : "Your rival won.")} ${ranked ? "" : "Head to the return arch."}`.trim()
      : versionMismatch ? "Both players need to refresh the game before duelling."
        : left ? "Your friend disconnected. The return arch is behind you."
          : roomPaused ? "Waiting for your rival to reconnect…"
            : !snapshot ? "Meeting your rival…"
            : teamMode && isOut(side) ? "Knocked out. Your teammate is still fighting."
              : danger ? "Move out of the marked circle!"
              : pending ? `Answer to cast ${HEROES[hero].skills[pending.slot].name}.`
                : statusUntil > clock ? status : "Move out of the path of incoming spells.";
    const log = get("duel-log");
    label(log, message);
    log.dataset.danger = String(danger);
    const dodgeIn = Math.max(0, Math.ceil(dodgeReadyAt - clock));
    dodgeButton.hidden = !active;
    dodgeButton.disabled = dodgeIn > 0;
    dodgeButton.title = `Dodge · ${dodgeCooldown}s recharge`;
    label(dodgeButton.querySelector("small"), dodgeIn ? `${dodgeIn}s` : "Dodge");
    label(get("duel-controls"), active ? `WASD move · F ${dodgeIn ? "dodge in " + dodgeIn + "s" : "dodge"} · ${signature ? "1–4" : "1–3"} cast${teamMode ? " · T target" : ""}` : "");
    get("duel-allies").hidden = !teamMode || ended;
    get("duel-team-targets").hidden = !teamMode || ended;
    if (teamMode && !ended) paintTeams(active && !pending);
    get("duel-skills").hidden = ended;
    get("duel-result").hidden = !ended;
    if (ended && (!ranked || ranking?.reason === "complete")) paintRewards();
    if (ranked && ended) paintRanking();
    for (const id of ["ranked-result", "ranked-again", "ranked-board"]) get(id).hidden = !ranked || !ended;
    get("ranked-again").disabled = ranked && !ranking && !left;
    get("ranked-board").disabled = ranked && !ranking && !left;
    get("world").dataset.duelWinner = winner == null ? "" : String(winner);
  }

  function paintTeams(canTarget) {
    const ally = snapshot?.fighters[allySide];
    label(get("duel-ally-name"), roster[allySide].name);
    label(get("duel-ally-hp"), ally?.hp === 0 ? "Knocked out" : `${ally?.hp ?? 100} HP${ally?.shield ? " +" + ally.shield + " shield" : ""}`);
    for (const [index, button] of targetButtons.entries()) {
      const slot = opponents[index];
      const rival = snapshot?.fighters[slot];
      label(button.querySelector("strong"), roster[slot].name);
      label(button.querySelector("span"), rival?.hp === 0 ? "Knocked out" : `${rival?.hp ?? 100} HP`);
      button.disabled = !canTarget || isOut(slot);
      button.setAttribute("aria-pressed", String(slot === targetSide));
    }
  }

  function paintRanking() {
    if (ranking?.reason !== "complete") {
      label(get("duel-reward"), "");
      label(get("duel-growth"), "");
    }
    const profile = ranking?.profile;
    if (ranking?.outcome !== "expired" && Number.isSafeInteger(profile?.rating) && Number.isSafeInteger(ranking?.delta)) {
      const tier = profile.games < 3 ? `Placement ${profile.games}/3` : profile.rank;
      const delta = ranking.delta >= 0 ? `+${ranking.delta}` : String(ranking.delta);
      label(get("ranked-result"), `${tier} · ${profile.rating} Elo (${delta})`);
    } else {
      label(get("ranked-result"), ranking ? "No change to your rating." : left ? "Check your result on the leaderboard." : "Calculating rating…");
    }
  }

  function paintRewards() {
    label(get("duel-reward"), !result ? "Saving match rewards…"
      : result.reward ? `+${result.reward.xp} XP · +${result.reward.coins} gold` : "Match rewards collected");
    if (!result) { label(get("duel-growth"), ""); return; }
    const { progress: updated, reward } = result;
    const move = HEROES[hero].skills[3].name;
    const unlock = updated.signature ? `${move} learned`
      : updated.canLearn ? `Learn ${move} at your hero stone for ${SIGNATURE_PRICE} gold`
        : `${move} unlocks at Lv ${SIGNATURE_LEVEL} for ${SIGNATURE_PRICE} gold`;
    const xp = updated.nextLevelXP ? ` · ${updated.xp}/${updated.nextLevelXP} XP` : "";
    const perk = reward?.leveledUp && updated.level > 2 ? ` Dodge now recharges in ${updated.dodgeCooldown}s.` : "";
    label(get("duel-growth"), `${reward?.leveledUp ? "Level up! " : ""}${HEROES[hero].name} · Lv ${updated.level}${xp} · ${updated.coins} gold. ${unlock}.${perk}`);
  }

  function fillMeter(which, data) {
    const hp = data?.hp ?? 100;
    const shield = data?.shield ?? 0;
    get(`duel-${which}-bar`).value = hp;
    const condition = data?.chillSeconds > 0 ? " ❄" : data?.briarSeconds > 0 ? " ✦" : "";
    const status = get(`duel-${which}-hp`);
    label(status, `${hp} HP${shield ? " +" + shield + " shield" : ""}${condition}`);
    status.title = data?.chillSeconds > 0 ? "Chilled" : data?.briarSeconds > 0 ? "Marked by briars" : "";
  }

  function animateEvents() {
    for (const event of snapshot?.events ?? []) {
      if (event.id <= lastEvent) continue;
      lastEvent = event.id;
      const from = battlePosition(event.side);
      const target = validSide(event.target) ? event.target : teamMode
        ? (teamOf(event.side) === homeTeam ? targetSide : side) : 1 - event.side;
      const to = battlePosition(target);
      const who = snapshot.fighters[event.side]?.hero;
      const impact = point(event) ? event : to;
      if (event.kind === "launch" && knownStyle(event.style) && point(event.destination)) {
        const source = point(event.origin) ? event.origin : from;
        if (event.side === side) player().playSpell(event.style, event.destination);
        else map.playCast(event.style, event.destination, event.side);
        map.pulse({ kind: "cast", side: event.side, hero: who, origin: source, target: source });
        sound.play(event.style);
      } else if (event.kind === "hit") {
        map.pulse({ kind: "strike", side: event.side, hero: who, origin: impact, target: impact });
        const whoWasHit = target === side ? "You" : teamMode && teamOf(target) === homeTeam ? "Ally" : "Rival";
        const amount = Number.isFinite(event.amount) ? event.amount : 0;
        const pierced = Number.isFinite(event.pierced) && event.pierced > 0 ? ` ${event.pierced} shield pierced.` : "";
        showStatus(amount ? `${whoWasHit} lost ${amount} HP.${pierced}` : `${whoWasHit === "You" ? "Your" : whoWasHit + "'s"} ward caught the strike.`);
        if (event.style !== "area") sound.play("impact");
      } else if (event.kind === "burst") {
        const radius = Number.isFinite(event.radius) && event.radius > 0 && event.radius <= 4 ? event.radius : 2.25;
        map.pulse({ kind: "burst", side: event.side, hero: who, origin: impact, target: impact, radius });
        sound.play("impact");
      } else if (event.kind === "dodge") {
        if (event.side === side) showStatus("Your rival dodged the spell.");
        else if (target === side) {
          map.pulse({ kind: "dodge", side, hero, origin: to, target: to });
          showStatus("Dodged!");
        }
      } else if (event.kind === "dash") {
        map.pulse({ kind: "dash", side: event.side, hero: who, target: from });
        if (event.side === side && clock >= dodgeReadyAt - dodgeCooldown + .27) player().dashToward(to.x, to.z);
      } else if (event.kind === "combo") {
        map.pulse({ kind: "strike", side: event.side, hero: who, origin: to, target: to });
        if (teamOf(event.side) === homeTeam) showStatus(`Team combo! +${event.amount} damage.`);
      } else if (Object.hasOwn(effectsOnHit, event.kind)) {
        const [kind, note] = effectsOnHit[event.kind];
        map.pulse({ kind, side: event.side, hero: who, origin: to, target: to });
        if (event.side === side || target === side) showStatus(note);
      } else if (["burn", "heal", "shield", "evade", "haste", "cleanse"].includes(event.kind)) {
        const helped = ["heal", "shield", "haste", "cleanse"].includes(event.kind);
        const position = event.kind === "burn" || (helped && validSide(event.target)) ? to : from;
        map.pulse({
          kind: event.kind === "evade" ? "dodge" : event.kind,
          side: event.side, hero: who, origin: position, target: position,
        });
        if (teamMode && helped && target === side && event.side !== side) showStatus("Your teammate supported you.");
      } else if ((event.kind === "miss" || event.kind === "timeout") && event.side === side) {
        showStatus(event.kind === "miss" ? "Incorrect answer. The skill is cooling down." : "Time ran out. The skill is cooling down.");
      } else if (event.kind === "cast" && teamOf(event.side) !== homeTeam) {
        showStatus(`${displayName(who ?? enemy)} is preparing a skill.`);
      } else if (event.kind === "victory") {
        sound.play("complete");
      }
    }
  }

  function runRival(dt) {
    if (snapshot?.winner !== null) return;
    const position = playerPosition();
    const distance = Math.hypot(position.x - other.x, position.z - other.z);
    const angle = Math.atan2(position.z - other.z, position.x - other.x);
    const drift = distance > 6 ? angle : distance < 3.1 ? angle + Math.PI : angle + Math.PI / 2;
    const speed = distance > 6 ? 2 : clock % 4 < 2.4 ? .40 : .92;
    const nextX = other.x + Math.cos(drift) * speed * dt;
    const nextZ = other.z + Math.sin(drift) * speed * dt;
    if (map.canWalk(nextX, nextZ)) { other.x = nextX; other.z = nextZ; }
    syncPose();
    if (botReplyAt && clock >= botReplyAt) {
      combat.botAnswer(remoteSide, Math.random() < [.69, .58, .48, .45][botSlot]);
      botReplyAt = 0;
      botCastAt = clock + 2.35 + Math.random() * 1.15;
    } else if (!botReplyAt && clock >= botCastAt && close(13)) {
      const roll = Math.random();
      const requested = signature && roll >= .92 ? 3 : roll >= .79 ? 2 : roll >= .47 ? 1 : 0;
      for (const slot of [requested, 0, 1, 2]) {
        if (!combat.cast(remoteSide, slot)) continue;
        botSlot = slot;
        botReplyAt = clock + [1.4, 2.1, 2.8, 3.1][slot];
        break;
      }
    }
  }

  function update(dt, time, reduceMotion) {
    clock += dt;
    if (combat && !left) {
      syncPose();
      if (solo) runRival(dt);
      combat.tick(dt);
      snapshot = combat.read(side);
    }
    settle();
    if (teamMode) {
      for (const [slot, position] of positions.entries()) {
        if (slot === side) continue;
        map.setFighter(slot, { ...position, hero: roster[slot].hero, appearance: roster[slot].appearance,
          down: isOut(slot), targeted: targetSide === slot });
      }
    } else map.setRival({ ...other, hero: enemy, appearance: rivalAppearance });
    map.setReducedMotion(reduceMotion);
    map.setAttacks(left ? [] : snapshot?.attacks ?? []);
    animateEvents();
    map.update(dt, time);
    if (clock >= nextPose) {
      nextPose = clock + .055;
      sendPose();
    }
    if (clock >= nextMessage) {
      nextMessage = clock + .09;
      transmit();
      paint();
    }
  }

  function getPrompt(position) {
    return Math.abs(position.y) < 1.2 && Math.hypot(position.x - exit.x, position.z - exit.z) <= exitRadius
      ? { label: "Leave the arena", loc: exit } : null;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    flags.abort();
    connection?.close();
    ui.hidden = true;
    dodgeButton.hidden = true;
    delete document.body.dataset.duel;
    delete get("world").dataset.duelWinner;
  }

  window.addEventListener("keydown", keyboard, { signal: flags.signal });
  spells.forEach((button, index) => button.addEventListener("click", () => use(index), { signal: flags.signal }));
  answers.forEach((button, index) => button.addEventListener("click", () => use(index), { signal: flags.signal }));
  dodgeButton.addEventListener("click", dodge, { signal: flags.signal });
  if (teamMode) targetButtons.forEach((button, index) =>
    button.addEventListener("click", () => selectTarget(opponents[index]), { signal: flags.signal }));
  if (ranked) {
    get("ranked-again").addEventListener("click", () => onRankedAction(true), { signal: flags.signal });
    get("ranked-board").addEventListener("click", () => onRankedAction(false), { signal: flags.signal });
  }
  connection?.listen(handlePacket);
  if (!ranked) connection?.send({ type: "hello", hero, appearance, signature, version: matchVersion });
  ui.hidden = false;
  document.body.dataset.duel = "true";
  paint();

  return { ...map, exit, getPrompt, update, dispose, leave: onExit };
}
