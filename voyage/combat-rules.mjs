const HEALTH = 100;
const MAX_SHIELD = 25;
const MAX_ATTACKS = 12;
const EPSILON = 1e-7;
const TEAM_CAST_RANGE = 13;
const SUPPORT_RADIUS = 6.5;
const COMBO_DAMAGE = 4;
const COMBO_WINDOW = 3;
const COOLDOWN_LIMIT = 14;
const TIERS = Object.freeze([
  { damage: 10, cooldown: 2.5, window: 9, style: "bolt" },
  { damage: 20, cooldown: 5.5, window: 12, style: "wave" },
  { damage: 36, cooldown: 10, window: 16, style: "area" },
]);
const PATHS = Object.freeze({
  bolt: Object.freeze({ speed: 12, windup: .18, reach: 14, radius: .48, endRadius: .48 }),
  wave: Object.freeze({ speed: 8.1, windup: .28, reach: 14, radius: .90, endRadius: 1.42 }),
  area: Object.freeze({ duration: 1.25, radius: 2.25 }),
});

function freezeSkill({ path, impact, support, ...skill }) {
  return Object.freeze({ ...skill, ...(path && { path: Object.freeze(path) }),
    ...(impact && { impact: Object.freeze(impact) }), ...(support && { support: Object.freeze(support) }) });
}

function hero(id, name, color, spells, signature) {
  const skills = spells.map(([skillName, effect, power, description, settings], slot) => {
    const { damage, cooldown, window, style } = TIERS[slot];
    return freezeSkill({ name: skillName, effect, power, description, damage, cooldown, window, style, ...settings });
  });
  skills.push(freezeSkill({ ...signature, window: 16 }));
  return Object.freeze({ id, name, color, skills: Object.freeze(skills) });
}

export const HEROES = Object.freeze({
  gale: hero("gale", "Gale", "#74d6bd", [
    ["Gust Step", "evade", 0.28, "Strike, then soften the next hit within 4 seconds."],
    ["Whirlstep", "haste", 2, "Strike and shorten each other skill's cooldown by 2 seconds."],
    ["Skybreak", "pierce", 12, "Strike past up to 12 shield points, leaving those points intact."],
  ], { name: "Slipstream", effect: "dash-haste", power: 3, damage: 24, cooldown: 9, style: "wave",
    description: "Dash, evade part of the next strike and quicken other skills. Send out a wide gust.",
    path: { radius: .98, endRadius: 1.60 } }),
  warden: hero("warden", "Warden", "#e0bc70", [
    ["Lantern Guard", "shield", 4, "Strike and gain a 4-point shield."],
    ["Ivory Bastion", "cleanse-shield", 5, "Strike, clear active embers and gain a 5-point shield."],
    ["Sunwall", "shield-heal", 13, "Strike, gain a 13-point shield and restore up to 6 health."],
  ], { name: "Moonwall", effect: "shield-cleanse", power: 16, damage: 28, cooldown: 13, style: "area",
    description: "Clear embers and gain a 16-point shield. Mark a wider ring of moonlight.",
    path: { duration: 1.60, radius: 2.80 } }),
  ember: hero("ember", "Ember", "#ee947d", [
    ["Hearth Spark", "heal", 4, "Strike and restore up to 4 health."],
    ["Cinder Trail", "burn", 2, "Strike and leave a glow that deals 2 damage each second for 3 seconds."],
    ["Phoenix Ring", "heal-burn", 3, "Strike, restore up to 8 health and leave a 3-second glow."],
  ], { name: "Phoenix Bloom", effect: "rekindle", power: 4, damage: 29, cooldown: 12, style: "bolt",
    description: "Restore up to 10 health. A fast spark leaves embers for 4 seconds if it hits.",
    path: { speed: 13.5, windup: .20, radius: .56, endRadius: .56 } }),
  tide: hero("tide", "Tide", "#66b4e8", [
    ["Foam Lash", "wash", 0, "On hit, wash away up to 3 shield before dealing damage.", { impact: { strip: 3 } }],
    ["Undertow", "undertow", 0, "On hit, add 1.25s to the enemy's longest active cooldown.", { impact: { delay: 1.25 } }],
    ["Riptide", "riptide", 0, "On hit, remove up to 6 shield and add 1.75s to the longest active cooldown.",
      { impact: { strip: 6, delay: 1.75 } }],
  ], { name: "Maelstrom", effect: "maelstrom", damage: 29, cooldown: 12, style: "area",
    description: "On hit, remove up to 8 shield and add 1s to every active enemy cooldown in the ring.",
    impact: { strip: 8, delay: 1, delayAll: true }, path: { radius: 2.75, duration: 1.5 } }),
  thorn: hero("thorn", "Thorn", "#a2c76e", [
    ["Briar Pin", "briar", 0, "Mark the enemy for 5s. Your next hit in 1v1 or your teammate's next hit in 2v2 gains 5 damage.",
      { impact: { mark: 5, markSeconds: 5 } }],
    ["Bark Mantle", "bark", 0, "Gain 6 shield and give a teammate within 6.5m 3 shield before the wave launches.",
      { support: { shield: 6 } }],
    ["Bramble Snare", "bramble", 0, "Mark enemies hit for 5s. Your next hit in 1v1 or your teammate's next hit in 2v2 gains 8 damage.",
      { impact: { mark: 8, markSeconds: 5 }, path: { radius: 2.45 } }],
  ], { name: "Groveheart", effect: "grove", damage: 28, cooldown: 12.5, style: "area",
    description: "Gain 9 shield and give a teammate within 6.5m 5 shield. Mark enemies hit for 6s. Your next hit in 1v1 or your teammate's next hit in 2v2 gains 8 damage.",
    impact: { mark: 8, markSeconds: 6 }, support: { shield: 9 }, path: { radius: 2.7, duration: 1.55 } }),
  echo: hero("echo", "Echo", "#bf9cf3", [
    ["Resonance", "resonance", 0, "A fast bolt travels up to 17m and deals up to 3 damage through shields.",
      { impact: { pierce: 3 }, path: { speed: 16, windup: .15, reach: 17, radius: .4, endRadius: .4 } }],
    ["Refrain", "refrain", 0, "Shorten your other cooldowns by 1s and a teammate's by 2s within 6.5m. Wave travels up to 16m.",
      { support: { recharge: 1, allyRecharge: 2 }, path: { speed: 9.5, reach: 16, radius: .78, endRadius: 1.13 } }],
    ["Harmonic Ring", "harmonic", 0, "A tight ring deals up to 9 damage through shields, leaving those points intact.",
      { impact: { pierce: 9 }, path: { radius: 2 } }],
  ], { name: "Overtone", effect: "overtone", damage: 28, cooldown: 11.5, style: "bolt",
    description: "Shorten your other cooldowns by 1.5s and a teammate's by 2.5s within 6.5m. A 17m bolt deals up to 5 damage through shields.",
    impact: { pierce: 5 }, support: { recharge: 1.5, allyRecharge: 2.5 },
    path: { speed: 15, windup: .17, reach: 17, radius: .49, endRadius: .49 } }),
  frost: hero("frost", "Frost", "#9fe3ef", [
    ["Chill Needle", "chill", 0, "Chill an enemy for 4s. The next skill they use while chilled takes 1.25s longer to recharge.",
      { impact: { chillSeconds: 4, chillRecharge: 1.25 } }],
    ["Shatter Wave", "shatter", 0, "Break up to 9 shield on hit. Consume active chill for 5 bonus damage.",
      { impact: { strip: 9, shatter: 5 } }],
    ["Whiteout", "whiteout", 0, "Chill enemies hit for 5s. Their next skill used while chilled takes 1.5s longer to recharge.",
      { impact: { chillSeconds: 5, chillRecharge: 1.5 }, path: { radius: 2.45 } }],
  ], { name: "Glacier Bell", effect: "glacier", damage: 30, cooldown: 12.5, style: "area",
    description: "Break up to 12 shield and deal 7 extra damage to chilled targets. Apply fresh 4s chill that adds 1.25s to their next cooldown.",
    impact: { strip: 12, shatter: 7, chillSeconds: 4, chillRecharge: 1.25 }, path: { radius: 2.65, duration: 1.55 } }),
});

const pretty = (value) => String(value).replace("-", "−");

function kindergarten(slot, pick) {
  const first = pick(2, slot === 2 ? 7 : 5);
  const second = pick(1, slot === 2 ? 3 : 4);
  const stars = (count) => Array(count).fill("✦").join(" ");
  if (slot === 0) return { question: `Count the sparks: ${stars(first)}`, answer: first, min: 0 };
  if (slot === 1) return { question: `How many sparks altogether? ${stars(first)} + ${stars(second)}`, answer: first + second, min: 0 };
  const removed = Math.min(second, first - 1);
  return { question: `${stars(first)}  ·  ${removed} sparks fly away. How many stay?`, answer: first - removed, min: 0 };
}

function earlyPrimary(slot, pick) {
  const first = pick(2, 9);
  const second = pick(2, 9);
  if (slot === 0) return { question: `${first} + ${second} = ?`, answer: first + second, min: 0 };
  if (slot === 1) return { question: `${first + second} − ${second} = ?`, answer: first, min: 0 };
  const baskets = pick(2, 5);
  const inEach = pick(3, 6);
  const leave = pick(1, 4);
  return { question: `${baskets} baskets each hold ${inEach} shells. ${leave} shells are given away. How many remain?`, answer: baskets * inEach - leave, min: 0 };
}

function middlePrimary(slot, pick) {
  const a = pick(3, 9);
  const b = pick(2, 8);
  if (slot === 0) return { question: `${a} × ${b} = ?`, answer: a * b, min: 0 };
  if (slot === 1) return { question: `${a * b} ÷ ${b} = ?`, answer: a, min: 0 };
  const bottom = pick(2, 4);
  const top = pick(1, bottom - 1);
  const multiple = pick(2, 3);
  return { question: `${top}/${bottom} = ?/${bottom * multiple}`, answer: top * multiple, min: 0 };
}

function upperPrimary(slot, pick) {
  if (slot === 0) {
    const base = pick(3, 12) * 4;
    return { question: `25% of ${base} = ?`, answer: base / 4, min: 0 };
  }
  if (slot === 1) {
    const first = pick(2, 4);
    const second = first + pick(1, 3);
    const scale = pick(2, 6);
    return { question: `Green to gold is ${first}:${second}. There are ${first * scale} green. How many gold?`, answer: second * scale, min: 0 };
  }
  const price = pick(4, 12) * 10;
  const fee = pick(2, 8);
  return { question: `A ${price}-shell sail is 20% off. Then add a ${fee}-shell fee. What is the total?`, answer: price * 0.8 + fee, min: 0 };
}

function firstSecondary(slot, pick) {
  const first = -pick(3, 13);
  const second = pick(2, 12);
  if (slot === 0) return { question: `${pretty(first)} + ${second} = ?`, answer: first + second };
  const x = slot === 1 ? pick(2, 9) : -pick(2, 9);
  const scale = (slot === 1 ? 1 : -1) * pick(2, 5);
  return { question: `${pretty(scale)}x + ${second} = ${pretty(scale * x + second)}. Find x.`, answer: x };
}

function upperSecondary(slot, pick) {
  if (slot === 0) {
    const base = pick(2, 5);
    const second = pick(2, 7);
    return { question: `${base}³ + ${second}² = ?`, answer: base ** 3 + second ** 2, min: 0 };
  }
  if (slot === 1) {
    const run = pick(2, 5);
    const slope = pick(2, 7) * (pick(0, 1) ? -1 : 1);
    return { question: `A line moves right ${run} and its y changes by ${pretty(run * slope)}. What is the gradient?`, answer: slope };
  }
  const hi = pick(3, 9);
  const lo = pick(2, 7);
  return { question: `What is the positive root of (x − ${hi})(x + ${lo}) = 0?`, answer: hi, min: 1 };
}

const QUESTION_BANK = Object.freeze({
  k: kindergarten,
  p12: earlyPrimary,
  p34: middlePrimary,
  p56: upperPrimary,
  s1: firstSecondary,
  s23: upperSecondary,
});

function questionsFor(random, route) {
  function pick(min, max) {
    const sample = random();
    const unit = Number.isFinite(sample) ? Math.min(1 - Number.EPSILON, Math.max(0, sample)) : 0;
    return min + Math.floor(unit * (max - min + 1));
  }
  const generate = typeof route === "string" && Object.hasOwn(QUESTION_BANK, route) ? QUESTION_BANK[route] : QUESTION_BANK.p12;
  return (slot) => {
    const { question, answer, min = -Infinity } = generate(Math.min(slot, 2), pick);
    const wrongGap = pick(1, Math.min(6, Math.max(2, Math.abs(answer))));
    const values = [answer, answer + wrongGap, answer - wrongGap < min ? answer + wrongGap + 1 : answer - wrongGap];
    for (let i = values.length - 1; i > 0; i--) {
      const other = pick(0, i);
      [values[i], values[other]] = [values[other], values[i]];
    }
    return {
      question, answerIndex: values.indexOf(answer), choices: Object.freeze(values.map(pretty)),
    };
  };
}

export function combatSpawn(side, teamMode = false) {
  const north = teamMode ? side >= 2 : side === 1;
  const x = teamMode ? (side === 1 || side === 2 ? 2.3 : -2.3) : 0;
  return { x, z: north ? -5 : 5, yaw: north ? Math.PI : 0 };
}

function makeFighter(choice, fallback, side, signature, duo) {
  const definition = typeof choice === "string" && Object.hasOwn(HEROES, choice) ? HEROES[choice] : HEROES[fallback];
  const { x, z } = combatSpawn(side, duo);
  const pose = { x, z };
  return { side, team: duo ? Math.floor(side / 2) : side, definition, signature, pose, sampled: pose,
    hp: HEALTH, shield: 0, evasion: null, recentHit: null, briar: null, chill: null,
    readyAt: [0, 0, 0, 0], pending: null, embers: [] };
}

function copyPoint({ x, z }) {
  return Object.freeze({ x: Math.round(x * 1000) / 1000, z: Math.round(z * 1000) / 1000 });
}

function aim(from, to, team) {
  const x = to.x - from.x;
  const z = to.z - from.z;
  const length = Math.hypot(x, z);
  return length > EPSILON ? { x: x / length, z: z / length } : { x: 0, z: team === 0 ? -1 : 1 };
}

function describeAttack(shot, time) {
  const area = shot.style === "area";
  const windup = !area && time < shot.startsAt;
  const progress = Math.max(0, Math.min(1, (time - shot.startsAt) / shot.travel));
  const move = area ? 0 : progress * shot.path.reach;
  const center = area ? shot.destination
    : { x: shot.origin.x + shot.direction.x * move, z: shot.origin.z + shot.direction.z * move };
  const radius = area ? shot.path.radius : shot.path.radius + (shot.path.endRadius - shot.path.radius) * progress;
  const round = (number) => Math.round(number * 1000) / 1000;
  return Object.freeze({
    id: shot.id, side: shot.side, slot: shot.slot, hero: shot.hero, style: shot.style, effect: shot.skill.effect,
    ...(shot.duo && { target: shot.target }),
    ...copyPoint(center), radius: round(radius), directionX: round(shot.direction.x), directionZ: round(shot.direction.z),
    origin: copyPoint(shot.origin), destination: copyPoint(shot.destination), progress: round(progress),
    seconds: round(Math.max(0, shot.endsAt - time)),
    phase: area ? "telegraph" : windup ? "windup" : "projectile",
  });
}

function sample(frame, at) {
  const through = Math.max(0, Math.min(1, (at - frame.start) / frame.duration));
  return through === 1 ? frame.to
    : { x: frame.from.x + (frame.to.x - frame.from.x) * through, z: frame.from.z + (frame.to.z - frame.from.z) * through };
}

// During one simulation step, find the first intersection of the swept shot and the target path.
function collisionAlong(shot, targetFrame, from, to, targetMoves) {
  const { speed, radius, endRadius } = shot.path;
  const progress = Math.max(0, from - shot.startsAt);
  const radiusSpeed = (endRadius - radius) / shot.travel;
  const currentRadius = radius + radiusSpeed * progress;
  const target = sample(targetFrame, from);
  const projectileX = shot.origin.x + shot.direction.x * speed * progress;
  const projectileZ = shot.origin.z + shot.direction.z * speed * progress;
  const x = projectileX - target.x;
  const z = projectileZ - target.z;
  const vx = shot.direction.x * speed - (targetMoves ? (targetFrame.to.x - targetFrame.from.x) / targetFrame.duration : 0);
  const vz = shot.direction.z * speed - (targetMoves ? (targetFrame.to.z - targetFrame.from.z) / targetFrame.duration : 0);
  const a = vx * vx + vz * vz - radiusSpeed * radiusSpeed;
  const b = 2 * (x * vx + z * vz - currentRadius * radiusSpeed);
  const c = x * x + z * z - currentRadius * currentRadius;
  if (c <= EPSILON) return from;
  const duration = to - from;
  const valid = (root) => root >= -EPSILON && root <= duration + EPSILON;
  if (Math.abs(a) < EPSILON) {
    const entry = -c / b;
    return b < -EPSILON && valid(entry) ? from + Math.max(0, Math.min(duration, entry)) : null;
  }
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  const root = Math.sqrt(discriminant);
  const first = (-b - root) / (2 * a);
  const second = (-b + root) / (2 * a);
  const entries = [first, second].filter(valid);
  return entries.length ? from + Math.max(0, Math.min(duration, ...entries)) : null;
}

function projectileContact(shot, targetFrame, time, end) {
  const start = Math.max(shot.startsAt, time);
  const finish = Math.min(shot.endsAt, end);
  if (start > finish) return null;
  const split = targetFrame.start + targetFrame.duration;
  let touch = null;
  if (start < split) touch = collisionAlong(shot, targetFrame, start, Math.min(split, finish), true);
  if (touch === null && split <= finish) touch = collisionAlong(shot, targetFrame, Math.max(split, start), finish, false);
  return touch;
}

export function createCombat({ heroes = ["gale", "ember"], route = "p12", random = Math.random, signatures = [false, false] } = {}) {
  if (typeof random !== "function") throw new TypeError("Combat expects a random function.");
  const questionFor = questionsFor(random, route);
  const duo = Array.isArray(heroes) && heroes.length === 4;
  const defaults = duo ? ["gale", "ember", "gale", "ember"] : ["gale", "ember"];
  const fighters = defaults.map((fallback, side) => makeFighter(heroes?.[side], fallback, side, signatures?.[side] === true, duo));
  const attacks = [];
  let time = 0;
  let winner = null;
  let sequence = 0;
  let attackSequence = 0;
  let events = Object.freeze([]);

  const validSide = (side) => Number.isInteger(side) && side >= 0 && side < fighters.length;
  const living = (fighter) => fighter.hp > 0;
  const enemiesOf = (side) => fighters.filter((fighter) => fighter.team !== fighters[side].team && living(fighter));

  function targetFor(side, requested, range = duo ? TEAM_CAST_RANGE : Infinity) {
    if (!validSide(side) || !living(fighters[side])) return null;
    const { pose } = fighters[side];
    let nearest = null;
    for (const opponent of enemiesOf(side)) {
      if (requested !== undefined && opponent.side !== requested) continue;
      const distance = Math.hypot(pose.x - opponent.pose.x, pose.z - opponent.pose.z);
      if (distance <= range && (nearest === null || distance < nearest.distance)) nearest = { side: opponent.side, distance };
    }
    return nearest?.side ?? null;
  }

  function emit(side, kind, details = {}) {
    events = Object.freeze([...events.slice(-31), Object.freeze({ id: ++sequence, side, kind, ...details })]);
  }

  function endIfNeeded() {
    const standing = new Set(fighters.filter(living).map(({ team }) => team));
    if (standing.size === 2) return false;
    winner = standing.size === 1 ? standing.values().next().value : "draw";
    for (const fighter of fighters) {
      fighter.pending = null;
      fighter.embers = [];
      fighter.briar = null;
      fighter.chill = null;
    }
    attacks.length = 0;
    emit(winner, "victory");
    return true;
  }

  function setPose(side, point) {
    if (!validSide(side) || !point || !Number.isFinite(point.x) || !Number.isFinite(point.z)
      || Math.abs(point.x) > 100 || Math.abs(point.z) > 100
      || (duo && (!living(fighters[side]) || winner !== null))) return false;
    fighters[side].pose = { x: point.x, z: point.z };
    return true;
  }

  function damage(side, target, amount, effect, slot, geometry = null) {
    const opponent = fighters[target];
    const skill = geometry ? fighters[side].definition.skills[slot] : null;
    const rules = skill?.impact;
    const activeMark = opponent.briar;
    const marked = geometry && activeMark?.expires > time && fighters[activeMark.side].team === fighters[side].team
      && (!duo || activeMark.side !== side);
    const shatter = (opponent.chill?.expires > time && rules?.shatter) || 0;
    const previous = opponent.recentHit;
    const combo = duo && geometry && previous && previous.side !== side && previous.until >= time
      && fighters[previous.side].team === fighters[side].team;
    let impact = amount + (combo ? COMBO_DAMAGE : 0) + (marked ? activeMark.amount : 0) + shatter;
    if (marked) {
      opponent.briar = null;
      emit(side, "briar-hit", { target, slot, amount: activeMark.amount, effect, attackId: geometry.attackId });
    }
    if (shatter) {
      opponent.chill = null;
      emit(side, "shatter", { target, slot, amount: shatter, effect, attackId: geometry.attackId });
    }
    if (geometry && opponent.evasion && opponent.evasion.expires > time) {
      const resisted = Math.floor(impact * opponent.evasion.reduction);
      impact -= resisted;
      opponent.evasion = null;
      emit(target, "evade", { target: side, amount: resisted, effect: "evade", attackId: geometry.attackId });
    }
    if (rules?.strip && opponent.shield > 0) {
      const removed = Math.min(opponent.shield, rules.strip);
      opponent.shield -= removed;
      emit(side, "strip", { target, slot, amount: removed, effect, attackId: geometry.attackId });
    }
    const bypass = effect === "pierce" ? skill?.power : rules?.pierce;
    const pierced = Math.min(opponent.shield, impact, bypass ?? 0);
    const absorbed = Math.min(opponent.shield - pierced, impact - pierced);
    opponent.shield -= absorbed;
    const dealt = Math.min(opponent.hp, impact - absorbed);
    opponent.hp -= dealt;
    emit(side, geometry ? "hit" : "burn", { target, slot, amount: dealt, absorbed, effect, ...geometry,
      ...(pierced > 0 && { pierced }) });
    if (duo && geometry && dealt > 0) {
      opponent.recentHit = { side, until: time + COMBO_WINDOW };
      if (combo) emit(side, "combo", { target, ally: previous.side, amount: Math.min(COMBO_DAMAGE, dealt), slot,
        attackId: geometry.attackId });
    }
    return dealt;
  }

  function buffEvent(side, target, slot, kind, amount) {
    if (amount > 0) emit(side, kind, { amount, slot, effect: kind, ...(duo && { target }) });
  }

  function heal(side, target, max, slot) {
    const fighter = fighters[target];
    const amount = Math.min(HEALTH - fighter.hp, max);
    fighter.hp += amount;
    buffEvent(side, target, slot, "heal", amount);
  }

  function shield(side, target, max, slot) {
    const fighter = fighters[target];
    const amount = Math.min(max, MAX_SHIELD - fighter.shield);
    fighter.shield += amount;
    buffEvent(side, target, slot, "shield", amount);
  }

  function cleanse(side, target, slot) {
    const fighter = fighters[target];
    const cleared = fighter.embers.length;
    fighter.embers = [];
    buffEvent(side, target, slot, "cleanse", cleared);
  }

  function dash(side, target, slot, reduction) {
    const fighter = fighters[side];
    const existing = fighter.evasion?.expires > time ? fighter.evasion.reduction : 0;
    fighter.evasion = { reduction: Math.max(existing, reduction), expires: time + 4 };
    const origin = copyPoint(fighter.pose);
    const destination = copyPoint(fighters[target].pose);
    emit(side, "dash", { slot, effect: "evade", origin, destination, ...(duo && { target }) });
  }

  function hasten(side, target, slot, power) {
    let amount = 0;
    for (const [index, readyAt] of fighters[target].readyAt.entries()) {
      if ((side === target && index === slot) || readyAt <= time) continue;
      const shortened = Math.max(time, readyAt - power);
      amount += readyAt - shortened;
      fighters[target].readyAt[index] = shortened;
    }
    buffEvent(side, target, slot, "haste", amount);
  }

  function affectTarget(side, target, slot, { effect, impact }, attackId) {
    if (!impact) return;
    const opponent = fighters[target];
    const { delay, delayAll, mark, markSeconds, chillSeconds, chillRecharge } = impact;
    if (delay) {
      const { readyAt } = opponent;
      const longest = readyAt.indexOf(Math.max(...readyAt));
      let total = 0;
      for (const [index, deadline] of readyAt.entries()) {
        if (deadline <= time || (!delayAll && index !== longest)) continue;
        const extended = Math.min(time + COOLDOWN_LIMIT, deadline + delay);
        total += extended - deadline;
        readyAt[index] = extended;
      }
      if (total > 0) emit(side, "delay", { target, slot, amount: total, effect, attackId });
    }
    if (mark) {
      opponent.briar = { side, amount: mark, expires: time + markSeconds };
      emit(side, "briar", { target, slot, amount: mark, seconds: markSeconds, effect, attackId });
    }
    if (chillSeconds) {
      opponent.chill = { side, slot, effect, recharge: chillRecharge, expires: time + chillSeconds };
      emit(side, "chill", { target, slot, amount: chillRecharge, seconds: chillSeconds, effect, attackId });
    }
  }

  function activate(side, target, slot, skill) {
    const { effect, power } = skill;
    const { team, pose } = fighters[side];
    const ally = duo && fighters.find((fighter) => fighter.side !== side && fighter.team === team && living(fighter)
      && Math.hypot(fighter.pose.x - pose.x, fighter.pose.z - pose.z) <= SUPPORT_RADIUS);
    const guard = (amount = power) => {
      shield(side, side, amount, slot);
      if (ally) shield(side, ally.side, Math.ceil(amount / 2), slot);
    };
    const restore = (amount) => {
      heal(side, side, amount, slot);
      if (ally) heal(side, ally.side, Math.ceil(amount / 2), slot);
    };
    const quicken = (amount = power, share = amount / 2) => {
      hasten(side, side, slot, amount);
      if (ally) hasten(side, ally.side, slot, share);
    };
    if (skill.support?.shield) guard(skill.support.shield);
    if (skill.support?.recharge) quicken(skill.support.recharge, skill.support.allyRecharge);
    switch (effect) {
      case "shield":
        guard();
        break;
      case "cleanse-shield":
      case "shield-cleanse":
        cleanse(side, side, slot);
        if (ally) cleanse(side, ally.side, slot);
        guard();
        break;
      case "shield-heal":
        guard();
        restore(6);
        break;
      case "evade":
        dash(side, target, slot, power);
        break;
      case "dash-haste":
        dash(side, target, slot, .36);
        quicken();
        break;
      case "haste":
        quicken();
        break;
      case "heal":
        restore(power);
        break;
      case "heal-burn":
        restore(8);
        break;
      case "rekindle":
        restore(10);
        break;
    }
  }

  function launch(side, target, slot, skill) {
    const path = { ...PATHS[skill.style], ...skill.path };
    const area = skill.style === "area";
    const travel = area ? path.duration : path.reach / path.speed;
    const startsAt = time + (area ? 0 : path.windup);
    const origin = fighters[side].pose;
    const destination = fighters[target].pose;
    const direction = aim(origin, destination, fighters[side].team);
    const shot = { id: ++attackSequence, duo, side, target, slot, skill, hero: fighters[side].definition.id, style: skill.style,
      path, origin, destination, direction, travel, startsAt, endsAt: startsAt + travel };
    attacks.push(shot);
    const pathState = describeAttack(shot, time);
    emit(side, "launch", { attackId: shot.id, slot, effect: skill.effect, style: skill.style, origin: pathState.origin,
      destination: pathState.destination, directionX: pathState.directionX, directionZ: pathState.directionZ,
      ...(duo && { target }) });
  }

  function planShot(shot, frames, end) {
    const enemies = enemiesOf(shot.side);
    if (shot.style === "area") {
      if (shot.endsAt > end) return null;
      const targets = [];
      for (const { side } of enemies) {
        const { x, z } = sample(frames[side], shot.endsAt);
        if (Math.hypot(x - shot.destination.x, z - shot.destination.z) <= shot.path.radius + EPSILON) targets.push(side);
      }
      return { shot, at: shot.endsAt, targets };
    }
    let first = null;
    for (const { side } of enemies) {
      const contact = projectileContact(shot, frames[side], time, end);
      if (contact !== null && (first === null || contact < first.at)) first = { shot, at: contact, targets: [side] };
    }
    return first ?? (shot.endsAt <= end ? { shot, at: shot.endsAt, targets: [] } : null);
  }

  function finishAttack({ shot, targets }) {
    attacks.splice(attacks.indexOf(shot), 1);
    const { side, slot, id, style, skill } = shot;
    const point = describeAttack(shot, time);
    const geometry = { attackId: id, style, x: point.x, z: point.z, radius: point.radius };
    if (style === "area") emit(side, "burst", { target: shot.target, slot, effect: skill.effect, ...geometry });
    if (!targets.includes(shot.target)) {
      emit(side, "dodge", { target: shot.target, slot, effect: skill.effect, ...geometry });
    }
    for (const target of targets) {
      if (duo && !living(fighters[target])) continue;
      const impact = damage(side, target, skill.damage, skill.effect, slot, geometry);
      if (!living(fighters[target])) continue;
      affectTarget(side, target, slot, skill, id);
      if (impact > 0 && ["burn", "heal-burn", "rekindle"].includes(skill.effect)) {
        fighters[target].embers.push({ side, slot, amount: skill.power, next: time + 1,
          left: skill.effect === "rekindle" ? 4 : 3 });
      }
    }
  }

  function cast(side, slot, requested) {
    if (!validSide(side) || !Number.isInteger(slot) || slot < 0 || slot > 3 || winner !== null) return false;
    const fighter = fighters[side];
    if ((slot === 3 && !fighter.signature) || fighter.pending || fighter.readyAt[slot] > time
      || attacks.length + fighters.filter((candidate) => candidate.pending).length >= MAX_ATTACKS) return false;
    const target = targetFor(side, requested);
    if (target === null) return false;
    const skill = fighter.definition.skills[slot];
    fighter.pending = { ...questionFor(slot), slot, target, deadline: time + skill.window };
    emit(side, "cast", { slot, effect: skill.effect, ...(duo && { target }) });
    return true;
  }

  function resolve(side, correct, timedOut = false) {
    const fighter = fighters[side];
    const { slot, target } = fighter.pending;
    const skill = fighter.definition.skills[slot];
    fighter.pending = null;
    const chill = fighter.chill;
    const delay = chill?.expires > time ? chill.recharge : 0;
    const cooldown = Math.min(COOLDOWN_LIMIT, skill.cooldown + delay);
    fighter.readyAt[slot] = time + cooldown;
    if (delay > 0) {
      chill.recharge = 0;
      emit(chill.side, "delay", { target: side, slot: chill.slot, amount: cooldown - skill.cooldown, effect: chill.effect });
    }
    if (!correct) {
      emit(side, timedOut ? "timeout" : "miss", { slot, effect: skill.effect, ...(duo && { target }) });
      return;
    }
    const opponent = living(fighters[target]) ? target : targetFor(side, undefined, Infinity);
    if (opponent === null) return;
    activate(side, opponent, slot, skill);
    launch(side, opponent, slot, skill);
  }

  function answer(side, index) {
    if (!validSide(side) || !Number.isInteger(index) || index < 0 || index > 2 || winner !== null) return false;
    const pending = fighters[side].pending;
    if (!pending) return false;
    resolve(side, index === pending.answerIndex);
    return true;
  }

  function botAnswer(side, correct) {
    if (!validSide(side) || typeof correct !== "boolean" || !fighters[side].pending || winner !== null) return false;
    resolve(side, correct);
    return true;
  }

  function clearKnockouts() {
    for (const fighter of fighters) {
      if (living(fighter)) {
        fighter.embers = fighter.embers.filter(({ side }) => living(fighters[side]));
        continue;
      }
      fighter.pending = null;
      fighter.embers = [];
      fighter.briar = null;
      fighter.chill = null;
    }
    for (let index = attacks.length - 1; index >= 0; index--) {
      if (!living(fighters[attacks[index].side])) attacks.splice(index, 1);
    }
  }

  function tick(dt) {
    if (winner !== null || !Number.isFinite(dt) || dt <= 0) return;
    const end = time + dt;
    if (!Number.isFinite(end)) return;
    const frames = fighters.map(({ pose, sampled }) => ({
      from: sampled, to: pose, start: time, duration: Math.max(.001, Math.min(.085, dt)),
    }));
    for (;;) {
      let next = Infinity;
      const planned = [];
      for (const shot of attacks) {
        const impact = planShot(shot, frames, end);
        if (!impact) continue;
        next = Math.min(next, impact.at);
        planned.push(impact);
      }
      for (const fighter of fighters) {
        if (fighter.pending) next = Math.min(next, fighter.pending.deadline);
        for (const ember of fighter.embers) next = Math.min(next, ember.next);
      }
      if (next > end) break;
      time = next;
      for (const [side, fighter] of fighters.entries()) {
        if (fighter.pending?.deadline <= time) resolve(side, false, true);
        for (const ember of fighter.embers) {
          if (ember.next > time) continue;
          damage(ember.side, side, ember.amount, "burn", ember.slot);
          ember.next += 1;
          ember.left--;
        }
        fighter.embers = fighter.embers.filter(({ left }) => left > 0);
      }
      for (const impact of planned) {
        if (Math.abs(impact.at - time) <= EPSILON) finishAttack(impact);
      }
      if (duo) clearKnockouts();
      if (endIfNeeded()) return;
    }
    time = end;
    for (const fighter of fighters) fighter.sampled = fighter.pose;
  }

  function read(side) {
    const privatePending = validSide(side) ? fighters[side].pending : null;
    return Object.freeze({
      fighters: Object.freeze(fighters.map((fighter) => Object.freeze({
        hp: fighter.hp,
        hero: fighter.definition.id,
        shield: fighter.shield,
        signature: fighter.signature,
        ...(duo && { team: fighter.team }),
        cooldowns: Object.freeze(fighter.readyAt.map((readyAt) => Math.min(COOLDOWN_LIMIT, Math.max(0, readyAt - time)))),
        ...(fighter.briar?.expires > time && { briarSeconds: fighter.briar.expires - time }),
        ...(fighter.chill?.expires > time && { chillSeconds: fighter.chill.expires - time }),
      }))),
      pending: privatePending ? Object.freeze({
        slot: privatePending.slot,
        question: privatePending.question,
        choices: privatePending.choices,
        seconds: Math.max(0, privatePending.deadline - time),
        ...(duo && { target: privatePending.target }),
      }) : null,
      winner,
      attacks: Object.freeze(attacks.map((shot) => describeAttack(shot, time))),
      events,
      time,
    });
  }

  return Object.freeze({ cast, answer, botAnswer, setPose, targetFor, tick, read });
}
