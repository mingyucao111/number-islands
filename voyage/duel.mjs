import { HEROES, createCombat } from "./combat-rules.mjs";
import { createDuelArena } from "./duel-arena.mjs";
import { ROUTES } from "./progression.mjs";

const get = (id) => document.getElementById(id);
const knownHero = (hero) => typeof hero === "string" && Object.hasOwn(HEROES, hero);
const validSlot = (slot) => Number.isInteger(slot) && slot >= 0 && slot < 3;
const effectNames = Object.freeze({
  evade: "Dash / evade", haste: "Faster recharge", pierce: "Pierce shield", shield: "Shield",
  "cleanse-shield": "Cleanse / shield", "shield-heal": "Shield / heal", heal: "Heal", burn: "Ember damage", "heal-burn": "Heal / embers",
});
const exitRadius = 1.55;

function readSnapshot(state) {
  if (!state || typeof state !== "object" || !Array.isArray(state.fighters) || state.fighters.length !== 2
    || ![null, 0, 1, "draw"].includes(state.winner) || !Number.isFinite(state.time) || state.time < 0) return null;
  if (state.fighters.some((fighter) => !fighter || !knownHero(fighter.hero)
    || !Number.isFinite(fighter.hp) || fighter.hp < 0 || fighter.hp > 100
    || !Number.isFinite(fighter.shield) || fighter.shield < 0 || fighter.shield > 25
    || !Array.isArray(fighter.cooldowns) || fighter.cooldowns.length !== 3
    || fighter.cooldowns.some((cd) => !Number.isFinite(cd) || cd < 0 || cd > 12))) return null;
  if (state.pending !== null && (!state.pending || typeof state.pending.question !== "string"
    || state.pending.question.length > 200 || !validSlot(state.pending.slot)
    || !Array.isArray(state.pending.choices) || state.pending.choices.length !== 3
    || state.pending.choices.some((choice) => typeof choice !== "string" || choice.length > 32)
    || !Number.isFinite(state.pending.seconds) || state.pending.seconds < 0 || state.pending.seconds > 20)) return null;
  if (!Array.isArray(state.events) || state.events.length > 32
    || state.events.some((event) => !event || typeof event.kind !== "string" || event.kind.length > 16
      || !Number.isSafeInteger(event.id) || event.id < 1
      || (event.kind !== "victory" && event.side !== 0 && event.side !== 1))) return null;
  return state;
}

function label(element, value) {
  if (element.textContent !== value) element.textContent = value;
}

export function createArenaDuel(root, { route, hero, connection, player, sound, onExit }) {
  const solo = !connection;
  const side = connection?.side ?? 0;
  const remoteSide = 1 - side;
  let enemy = hero === "warden" ? "ember" : "warden";
  const map = createDuelArena(root, { side, rivalHero: enemy });
  const other = { x: 0, z: side === 0 ? -5 : 5 };
  const exit = { x: 0, y: 0, z: side === 0 ? 10 : -10 };
  let combat = solo ? createCombat({ heroes: [hero, enemy], route }) : null;
  let snapshot = combat?.read(side) ?? null;
  let matchRoute = route;
  let left = false;
  let disposed = false;
  let pendingAnswer = false;
  let clock = 0;
  let nextMessage = 0;
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

  function transmit() {
    if (disposed || !connection) return;
    connection.send({ type: "pose", x: playerPosition().x, z: playerPosition().z });
    if (combat) connection.send({ type: "state", route: matchRoute, state: combat.read(remoteSide) });
  }

  function handlePacket({ message, closed }) {
    if (disposed) return;
    if (closed) {
      left = true;
      pendingAnswer = false;
      return;
    }
    if (message.type === "hello" && knownHero(message.hero)) {
      if (combat) return;
      enemy = message.hero;
      if (side === 0) {
        combat = createCombat({ heroes: [hero, enemy], route });
        snapshot = combat.read(side);
        transmit();
      }
    } else if (message.type === "pose" && Number.isFinite(message.x) && Number.isFinite(message.z)
      && map.canWalk(message.x, message.z)) {
      other.x = message.x;
      other.z = message.z;
    } else if (message.type === "state" && side === 1) {
      const received = readSnapshot(message.state);
      if (!received || (snapshot && received.time < snapshot.time)
        || received.fighters[side].hero !== hero || !ROUTES.some((item) => item.id === message.route)) return;
      matchRoute = message.route;
      const wasPending = snapshot?.pending;
      snapshot = received;
      if (!received.pending || !wasPending || received.pending.slot !== wasPending.slot || received.pending.question !== wasPending.question) {
        pendingAnswer = false;
      }
      enemy = received.fighters[remoteSide].hero;
    } else if (side === 0 && combat && !left && validSlot(message.slot)) {
      if (message.type === "cast" && close(13)) combat.cast(remoteSide, message.slot);
      if (message.type === "answer") combat.answer(remoteSide, message.slot);
      snapshot = combat.read(side);
      transmit();
    }
  }

  function keyboard(event) {
    if (disposed || event.repeat || event.altKey || event.metaKey || event.ctrlKey
      || !/^Digit[123]$/.test(event.code) || event.target?.matches("textarea, input, select")) return;
    event.preventDefault();
    use(Number(event.code.slice(-1)) - 1);
  }

  function use(slot) {
    if (!snapshot || left || snapshot.winner !== null || !validSlot(slot) || pendingAnswer) return;
    const isAnswer = Boolean(snapshot.pending);
    if (!isAnswer && (!close(13) || snapshot.fighters[side].cooldowns[slot] > 0.01)) {
      if (!close(13)) showStatus("Move closer to your rival.");
      return;
    }
    if (combat) {
      if (isAnswer) combat.answer(side, slot);
      else combat.cast(side, slot);
      snapshot = combat.read(side);
      transmit();
    } else {
      pendingAnswer = isAnswer && connection.send({ type: "answer", slot });
      if (!isAnswer) connection.send({ type: "cast", slot });
    }
    canvasFocus();
    paint();
  }

  function canvasFocus() { get("world").focus({ preventScroll: true }); }

  function paint() {
    const local = snapshot?.fighters[side];
    const rival = snapshot?.fighters[remoteSide];
    const mode = solo ? "Practice duel" : "Friend duel";
    label(get("duel-battle-name"), mode);
    label(get("duel-you"), displayName(local?.hero ?? hero));
    label(get("duel-rival"), displayName(rival?.hero ?? enemy));
    fillMeter("you", local);
    fillMeter("rival", rival);
    const active = Boolean(snapshot) && !left && snapshot.winner === null;
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
      const text = `${skill.damage} dmg · ${remaining > .01 ? Math.ceil(remaining) + "s left" : skill.cooldown + "s CD"}`;
      button.disabled = !active || Boolean(pending) || remaining > .01;
      button.title = `${["Easy", "Medium", "Hard"][index]} · ${skill.description}`;
      button.dataset.tier = ["easy", "medium", "hard"][index];
      label(button.querySelector("strong"), skill.name);
      label(button.querySelector("span"), text + " · " + effectNames[skill.effect]);
      button.style.setProperty("--cooldown", `${100 * remaining / skill.cooldown}%`);
      button.setAttribute("aria-label", `${skill.name}, ${text}. ${effectNames[skill.effect] ?? skill.effect}.`);
    });
    const message = left ? "Your friend disconnected. The return arch is behind you."
      : !snapshot ? "Meeting your rival…"
        : !active ? `${snapshot.winner === "draw" ? "A draw." : snapshot.winner === side ? "You won!" : "Your rival won."} Head to the return arch.`
          : pending ? `Answer to cast ${HEROES[hero].skills[pending.slot].name}.`
            : statusUntil > clock ? status : "1 quick · 2 medium · 3 powerful";
    label(get("duel-log"), message);
    get("world").dataset.duelWinner = snapshot?.winner === null || snapshot?.winner === undefined ? "" : String(snapshot.winner);
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
      if (event.kind === "hit") {
        map.pulse({ kind: "strike", side: event.side, hero: who, origin: from, target: to });
        if (event.effect === "evade") {
          map.pulse({ kind: "dash", side: event.side, hero: who, target: from });
          if (event.side === side) player().dashToward?.(to.x, to.z);
        }
        const target = event.side === side ? "Rival" : "You";
        const amount = Number.isFinite(event.amount) ? event.amount : 0;
        const pierced = Number.isFinite(event.pierced) && event.pierced > 0 ? ` ${event.pierced} shield pierced.` : "";
        showStatus(amount ? `${target} lost ${amount} HP.${pierced}` : `${target === "You" ? "Your" : "Rival's"} ward caught the strike.`);
        sound.play("use");
      } else if (["burn", "heal", "shield", "evade"].includes(event.kind)) {
        map.pulse({
          kind: event.kind === "evade" ? "dash" : event.kind,
          side: event.side, hero: who, origin: from, target: event.kind === "burn" ? to : from,
        });
      } else if (event.kind === "haste" || event.kind === "cleanse") {
        map.pulse({ kind: event.kind === "haste" ? "dash" : "heal", side: event.side, hero: who, target: from });
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
    const speed = distance > 6 ? 2 : .92;
    const nextX = other.x + Math.cos(drift) * speed * dt;
    const nextZ = other.z + Math.sin(drift) * speed * dt;
    if (map.canWalk(nextX, nextZ)) { other.x = nextX; other.z = nextZ; }
    if (botReplyAt && clock >= botReplyAt) {
      combat.botAnswer(remoteSide, Math.random() < [.69, .58, .48][botSlot]);
      botReplyAt = 0;
      botCastAt = clock + 2.35 + Math.random() * 1.15;
    } else if (!botReplyAt && clock >= botCastAt && close(13)) {
      const requested = Math.random() >= .79 ? 2 : Math.random() >= .47 ? 1 : 0;
      for (const slot of [requested, 0, 1, 2]) {
        if (!combat.cast(remoteSide, slot)) continue;
        botSlot = slot;
        botReplyAt = clock + [1.4, 2.1, 2.8][slot];
        break;
      }
    }
  }

  function update(dt, time) {
    clock += dt;
    if (combat && !left) {
      combat.tick(dt);
      snapshot = combat.read(side);
      if (solo) {
        runRival(dt);
        snapshot = combat.read(side);
      }
    }
    map.setRival({ ...other, hero: enemy });
    animateEvents();
    map.update(dt, time);
    if (clock >= nextMessage) {
      nextMessage = clock + .12;
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
    delete document.body.dataset.duel;
    delete get("world").dataset.duelWinner;
  }

  window.addEventListener("keydown", keyboard, { signal: flags.signal });
  spells.forEach((button, index) => button.addEventListener("click", () => use(index), { signal: flags.signal }));
  answers.forEach((button, index) => button.addEventListener("click", () => use(index), { signal: flags.signal }));
  connection?.listen(handlePacket);
  connection?.send({ type: "hello", hero });
  ui.hidden = false;
  document.body.dataset.duel = "true";
  paint();

  return { ...map, exit, getPrompt, update, dispose, leave: onExit };
}
