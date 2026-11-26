import { HEROES, createCombat } from "./combat-rules.mjs";
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
});
const styleNames = Object.freeze({ bolt: "Bolt", wave: "Wave", area: "Area" });
const knownStyle = (style) => typeof style === "string" && Object.hasOwn(styleNames, style);
const tiers = ["Easy", "Medium", "Hard", "Signature"];
const exitRadius = 1.55;

function point(value) {
  return value && Number.isFinite(value.x) && Math.abs(value.x) <= 42
    && Number.isFinite(value.z) && Math.abs(value.z) <= 42;
}

function readSnapshot(state) {
  if (!state || typeof state !== "object" || !Array.isArray(state.fighters) || state.fighters.length !== 2
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
      || (event.kind !== "victory" && event.side !== 0 && event.side !== 1))) return null;
  if (!Array.isArray(state.attacks) || state.attacks.length > 12
    || state.attacks.some((attack) => !point(attack) || !point(attack.origin) || !point(attack.destination)
      || !Number.isSafeInteger(attack.id) || attack.id < 1 || !knownHero(attack.hero) || !validSlot(attack.slot)
      || (attack.side !== 0 && attack.side !== 1) || !knownStyle(attack.style)
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

export function createArenaDuel(root, { route, hero, progress, connection, player, sound, onExit, onComplete }) {
  const solo = !connection;
  const side = connection?.side ?? 0;
  const remoteSide = 1 - side;
  let enemy = hero === "warden" ? "ember" : "warden";
  const map = createDuelArena(root, { side, rivalHero: enemy });
  const other = { x: 0, z: side === 0 ? -5 : 5 };
  const exit = { x: 0, y: 0, z: side === 0 ? 10 : -10 };
  const signature = progress.signature;
  const dodgeCooldown = progress.dodgeCooldown;
  let combat = solo ? createCombat({ heroes: [hero, enemy], route, signatures: [signature, signature] }) : null;
  let snapshot = combat?.read(side) ?? null;
  let matchRoute = route;
  let left = false;
  let disposed = false;
  let pendingAnswer = false;
  let versionMismatch = false;
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

  const playerPosition = () => {
    const p = player().position;
    return { x: p.x, z: p.z };
  };
  const displayName = (id) => HEROES[id]?.name ?? "";
  const battlePosition = (whichSide) => whichSide === side ? playerPosition() : other;
  const close = (limit) => {
    const current = playerPosition();
    return Math.hypot(current.x - other.x, current.z - other.z) <= limit;
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
      return;
    }
    if (message.type === "hello" && knownHero(message.hero)) {
      if (message.version !== matchVersion || typeof message.signature !== "boolean") {
        versionMismatch = true;
        return;
      }
      if (combat || snapshot || versionMismatch) return;
      enemy = message.hero;
      if (side === 0) {
        combat = createCombat({ heroes: [hero, enemy], route, signatures: [signature, message.signature] });
        syncPose();
        snapshot = combat.read(side);
        transmit();
      }
    } else if (message.type === "pose" && Number.isFinite(message.x) && Number.isFinite(message.z)
      && map.canWalk(message.x, message.z)) {
      other.x = message.x;
      other.z = message.z;
    } else if (message.type === "state" && side === 1) {
      const received = readSnapshot(message.state);
      if (!received || versionMismatch || (snapshot && received.time < snapshot.time)
        || received.fighters[side].hero !== hero || received.fighters[side].signature !== signature
        || !ROUTES.some((item) => item.id === message.route)) return;
      matchRoute = message.route;
      const wasPending = snapshot?.pending;
      snapshot = received;
      if (!received.pending || !wasPending || received.pending.slot !== wasPending.slot || received.pending.question !== wasPending.question) {
        pendingAnswer = false;
      }
      enemy = received.fighters[remoteSide].hero;
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
    if (!/^Digit[1234]$/.test(event.code)) return;
    event.preventDefault();
    use(Number(event.code.slice(-1)) - 1);
  }

  function isActive() { return Boolean(snapshot) && !left && !versionMismatch && snapshot.winner === null; }

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
      if (!isAnswer) connection.send({ type: "cast", slot });
    }
    canvasFocus();
    animateEvents();
    paint();
  }

  function canvasFocus() { get("world").focus({ preventScroll: true }); }

  function settle() {
    if (finished || snapshot?.winner == null) return;
    finished = true;
    const outcome = snapshot.winner === "draw" ? "draw" : snapshot.winner === side ? "win" : "loss";
    void Promise.resolve(onComplete(outcome, solo ? "practice" : "friend")).then((value) => {
      result = value;
      if (!disposed) paint();
    });
  }

  function paint() {
    const local = snapshot?.fighters[side];
    const rival = snapshot?.fighters[remoteSide];
    const mode = solo ? "Practice duel" : "Friend duel";
    label(get("duel-battle-name"), mode);
    label(get("duel-you"), `${displayName(local?.hero ?? hero)} · Lv ${progress.level}`);
    label(get("duel-rival"), displayName(rival?.hero ?? enemy));
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
      const text = locked ? signatureCostLabel : `${styleNames[skill.style]} · ${skill.damage} dmg · ${remaining > 0 ? Math.ceil(remaining) + "s left" : skill.cooldown + "s CD"}`;
      button.disabled = !active || Boolean(pending) || locked || remaining > 0;
      button.title = locked ? `Train this skill at your hero stone with ${SIGNATURE_PRICE} gold at level ${SIGNATURE_LEVEL}.` : `${tiers[index]} · ${skill.description}`;
      button.dataset.tier = tiers[index].toLowerCase();
      button.dataset.locked = String(locked);
      label(button.querySelector("strong"), skill.name);
      label(button.querySelector("span"), locked ? text : text + " · " + (effectNames[skill.effect] ?? ""));
      button.style.setProperty("--cooldown", `${100 * remaining / skill.cooldown}%`);
      button.setAttribute("aria-label", `${skill.name}, ${text}. ${effectNames[skill.effect] ?? skill.effect}.`);
    });
    const winner = snapshot?.winner;
    const ended = winner != null;
    const position = playerPosition();
    const danger = active && snapshot.attacks.some((attack) => attack.side !== side && attack.phase === "telegraph"
      && Math.hypot(position.x - attack.x, position.z - attack.z) <= attack.radius + .4);
    const message = ended ? `${winner === "draw" ? "A draw." : winner === side ? "You won!" : "Your rival won."} Head to the return arch.`
      : versionMismatch ? "Both players need to refresh the game before duelling."
        : left ? "Your friend disconnected. The return arch is behind you."
          : !snapshot ? "Meeting your rival…"
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
    label(get("duel-controls"), active ? `WASD move · F ${dodgeIn ? "dodge in " + dodgeIn + "s" : "dodge"} · ${signature ? "1–4" : "1–3"} cast` : "");
    get("duel-skills").hidden = ended;
    get("duel-result").hidden = !ended;
    if (ended) paintRewards();
    get("world").dataset.duelWinner = snapshot?.winner === null || snapshot?.winner === undefined ? "" : String(snapshot.winner);
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
    label(get(`duel-${which}-hp`), `${hp} HP${shield ? " +" + shield + " shield" : ""}`);
  }

  function animateEvents() {
    for (const event of snapshot?.events ?? []) {
      if (event.id <= lastEvent) continue;
      lastEvent = event.id;
      const from = battlePosition(event.side);
      const to = battlePosition(1 - event.side);
      const who = snapshot.fighters[event.side]?.hero;
      const impact = point(event) ? event : to;
      if (event.kind === "launch" && knownStyle(event.style) && point(event.destination)) {
        const source = point(event.origin) ? event.origin : from;
        if (event.side === side) player().playSpell(event.style, event.destination);
        else map.playCast(event.style, event.destination);
        map.pulse({ kind: "cast", side: event.side, hero: who, origin: source, target: source });
        sound.play(event.style);
      } else if (event.kind === "hit") {
        map.pulse({ kind: "strike", side: event.side, hero: who, origin: impact, target: impact });
        const target = event.side === side ? "Rival" : "You";
        const amount = Number.isFinite(event.amount) ? event.amount : 0;
        const pierced = Number.isFinite(event.pierced) && event.pierced > 0 ? ` ${event.pierced} shield pierced.` : "";
        showStatus(amount ? `${target} lost ${amount} HP.${pierced}` : `${target === "You" ? "Your" : "Rival's"} ward caught the strike.`);
        if (event.style !== "area") sound.play("impact");
      } else if (event.kind === "burst") {
        const radius = Number.isFinite(event.radius) && event.radius > 0 && event.radius <= 4 ? event.radius : 2.25;
        map.pulse({ kind: "burst", side: event.side, hero: who, origin: impact, target: impact, radius });
        sound.play("impact");
      } else if (event.kind === "dodge") {
        if (event.side === side) showStatus("Your rival dodged the spell.");
        else {
          map.pulse({ kind: "dodge", side, hero, origin: to, target: to });
          showStatus("Dodged!");
        }
      } else if (event.kind === "dash") {
        map.pulse({ kind: "dash", side: event.side, hero: who, target: from });
        if (event.side === side && clock >= dodgeReadyAt - dodgeCooldown + .27) player().dashToward(to.x, to.z);
      } else if (["burn", "heal", "shield", "evade", "haste", "cleanse"].includes(event.kind)) {
        const position = event.kind === "burn" ? to : from;
        map.pulse({
          kind: event.kind === "evade" ? "dodge" : event.kind,
          side: event.side, hero: who, origin: position, target: position,
        });
      } else if ((event.kind === "miss" || event.kind === "timeout") && event.side === side) {
        showStatus(event.kind === "miss" ? "Incorrect answer. The skill is cooling down." : "Time ran out. The skill is cooling down.");
      } else if (event.kind === "cast" && event.side !== side) {
        showStatus(`${displayName(enemy)} is preparing a skill.`);
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
    map.setRival({ ...other, hero: enemy });
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
  connection?.listen(handlePacket);
  connection?.send({ type: "hello", hero, signature, version: matchVersion });
  ui.hidden = false;
  document.body.dataset.duel = "true";
  paint();

  return { ...map, exit, getPrompt, update, dispose, leave: onExit };
}
