const HEALTH = 100;
const MAX_SHIELD = 25;
const MAX_ATTACKS = 12;
const EPSILON = 1e-7;
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

function hero(id, name, color, spells, signature) {
  const skills = spells.map(([skillName, effect, power, description], slot) => {
    const { damage, cooldown, window, style } = TIERS[slot];
    return Object.freeze({ name: skillName, effect, power, description, damage, cooldown, window, style });
  });
  skills.push(Object.freeze({ ...signature, path: Object.freeze(signature.path), window: 16 }));
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

function makeFighter(choice, fallback, side, signature) {
  const definition = typeof choice === "string" && Object.hasOwn(HEROES, choice) ? HEROES[choice] : HEROES[fallback];
  const pose = { x: 0, z: side === 0 ? 5 : -5 };
  return { definition, signature, pose, sampled: pose, hp: HEALTH, shield: 0, evasion: null,
    readyAt: [0, 0, 0, 0], pending: null, embers: [] };
}

function validSide(side) {
  return side === 0 || side === 1;
}

function copyPoint({ x, z }) {
  return Object.freeze({ x: Math.round(x * 1000) / 1000, z: Math.round(z * 1000) / 1000 });
}

function aim(from, to, side) {
  const x = to.x - from.x;
  const z = to.z - from.z;
  const length = Math.hypot(x, z);
  return length > EPSILON ? { x: x / length, z: z / length } : { x: 0, z: side === 0 ? -1 : 1 };
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

function awaitImpact(shot, targetFrame, time, end) {
  if (shot.style === "area") {
    if (shot.endsAt > end) return null;
    const target = sample(targetFrame, shot.endsAt);
    const landed = Math.hypot(target.x - shot.destination.x, target.z - shot.destination.z) <= shot.path.radius + EPSILON;
    return { shot, at: shot.endsAt, landed };
  }
  const start = Math.max(shot.startsAt, time);
  const finish = Math.min(shot.endsAt, end);
  if (start > finish) return null;
  const split = targetFrame.start + targetFrame.duration;
  let touch = null;
  if (start < split) touch = collisionAlong(shot, targetFrame, start, Math.min(split, finish), true);
  if (touch === null && split <= finish) touch = collisionAlong(shot, targetFrame, Math.max(split, start), finish, false);
  if (touch !== null) return { shot, at: touch, landed: true };
  return shot.endsAt <= end ? { shot, at: shot.endsAt, landed: false } : null;
}

export function createCombat({ heroes = ["gale", "ember"], route = "p12", random = Math.random, signatures = [false, false] } = {}) {
  if (typeof random !== "function") throw new TypeError("Combat expects a random function.");
  const questionFor = questionsFor(random, route);
  const fighters = [
    makeFighter(heroes?.[0], "gale", 0, signatures?.[0] === true),
    makeFighter(heroes?.[1], "ember", 1, signatures?.[1] === true),
  ];
  const attacks = [];
  let time = 0;
  let winner = null;
  let sequence = 0;
  let attackSequence = 0;
  let events = Object.freeze([]);

  function emit(side, kind, details = {}) {
    events = Object.freeze([...events.slice(-31), Object.freeze({ id: ++sequence, side, kind, ...details })]);
  }

  function endIfNeeded() {
    if (fighters[0].hp > 0 && fighters[1].hp > 0) return false;
    winner = fighters[0].hp === fighters[1].hp ? "draw" : fighters[0].hp > 0 ? 0 : 1;
    for (const fighter of fighters) {
      fighter.pending = null;
      fighter.embers = [];
    }
    attacks.length = 0;
    emit(winner, "victory");
    return true;
  }

  function setPose(side, point) {
    if (!validSide(side) || !point || !Number.isFinite(point.x) || !Number.isFinite(point.z)
      || Math.abs(point.x) > 100 || Math.abs(point.z) > 100) return false;
    fighters[side].pose = { x: point.x, z: point.z };
    return true;
  }

  function damage(side, amount, effect, slot, geometry = null) {
    const target = 1 - side;
    const opponent = fighters[target];
    let impact = amount;
    if (geometry && opponent.evasion && opponent.evasion.expires > time) {
      const resisted = Math.floor(impact * opponent.evasion.reduction);
      impact -= resisted;
      opponent.evasion = null;
      emit(target, "evade", { target: side, amount: resisted, effect: "evade", attackId: geometry.attackId });
    }
    const pierced = effect === "pierce" ? Math.min(opponent.shield, impact, fighters[side].definition.skills[slot].power) : 0;
    const absorbed = Math.min(opponent.shield - pierced, impact - pierced);
    opponent.shield -= absorbed;
    const dealt = Math.min(opponent.hp, impact - absorbed);
    opponent.hp -= dealt;
    emit(side, geometry ? "hit" : "burn", { target, slot, amount: dealt, absorbed, effect, ...geometry,
      ...(pierced > 0 && { pierced }) });
    return dealt;
  }

  function heal(side, max, slot) {
    const fighter = fighters[side];
    const amount = Math.min(HEALTH - fighter.hp, max);
    fighter.hp += amount;
    if (amount > 0) emit(side, "heal", { amount, slot, effect: "heal" });
  }

  function shield(side, max, slot) {
    const fighter = fighters[side];
    const amount = Math.min(max, MAX_SHIELD - fighter.shield);
    fighter.shield += amount;
    if (amount > 0) emit(side, "shield", { amount, slot, effect: "shield" });
  }

  function cleanse(side, slot) {
    const fighter = fighters[side];
    const cleared = fighter.embers.length;
    fighter.embers = [];
    if (cleared > 0) emit(side, "cleanse", { amount: cleared, slot, effect: "cleanse" });
  }

  function dash(side, slot, reduction) {
    const fighter = fighters[side];
    const existing = fighter.evasion?.expires > time ? fighter.evasion.reduction : 0;
    fighter.evasion = { reduction: Math.max(existing, reduction), expires: time + 4 };
    const origin = copyPoint(fighter.pose);
    const destination = copyPoint(fighters[1 - side].pose);
    emit(side, "dash", { slot, effect: "evade", origin, destination });
  }

  function hasten(side, slot, power) {
    let amount = 0;
    for (const [index, readyAt] of fighters[side].readyAt.entries()) {
      if (index === slot || readyAt <= time) continue;
      const shortened = Math.max(time, readyAt - power);
      amount += readyAt - shortened;
      fighters[side].readyAt[index] = shortened;
    }
    if (amount > 0) emit(side, "haste", { amount, slot, effect: "haste" });
  }

  function activate(side, slot, skill) {
    const { effect, power } = skill;
    switch (effect) {
      case "shield":
        shield(side, power, slot);
        break;
      case "cleanse-shield":
      case "shield-cleanse":
        cleanse(side, slot);
        shield(side, power, slot);
        break;
      case "shield-heal":
        shield(side, power, slot);
        heal(side, 6, slot);
        break;
      case "evade":
        dash(side, slot, power);
        break;
      case "dash-haste":
        dash(side, slot, .36);
        hasten(side, slot, power);
        break;
      case "haste":
        hasten(side, slot, power);
        break;
      case "heal":
        heal(side, power, slot);
        break;
      case "heal-burn":
        heal(side, 8, slot);
        break;
      case "rekindle":
        heal(side, 10, slot);
        break;
    }
  }

  function launch(side, slot, skill) {
    const path = { ...PATHS[skill.style], ...skill.path };
    const area = skill.style === "area";
    const travel = area ? path.duration : path.reach / path.speed;
    const startsAt = time + (area ? 0 : path.windup);
    const origin = fighters[side].pose;
    const destination = fighters[1 - side].pose;
    const direction = aim(origin, destination, side);
    const shot = { id: ++attackSequence, side, slot, skill, hero: fighters[side].definition.id, style: skill.style,
      path, origin, destination, direction, travel, startsAt, endsAt: startsAt + travel };
    attacks.push(shot);
    const pathState = describeAttack(shot, time);
    emit(side, "launch", { attackId: shot.id, slot, effect: skill.effect, style: skill.style, origin: pathState.origin,
      destination: pathState.destination, directionX: pathState.directionX, directionZ: pathState.directionZ });
  }

  function finishAttack({ shot, landed }) {
    attacks.splice(attacks.indexOf(shot), 1);
    const { side, slot, id, style, skill } = shot;
    const point = describeAttack(shot, time);
    const geometry = { attackId: id, style, x: point.x, z: point.z, radius: point.radius };
    if (style === "area") emit(side, "burst", { target: 1 - side, slot, effect: skill.effect, ...geometry });
    if (!landed) {
      emit(side, "dodge", { target: 1 - side, slot, effect: skill.effect, ...geometry });
      return;
    }
    const impact = damage(side, skill.damage, skill.effect, slot, geometry);
    if (impact > 0 && ["burn", "heal-burn", "rekindle"].includes(skill.effect) && fighters[1 - side].hp > 0) {
      fighters[1 - side].embers.push({ side, slot, amount: skill.power, next: time + 1, left: skill.effect === "rekindle" ? 4 : 3 });
    }
  }

  function cast(side, slot) {
    if (!validSide(side) || !Number.isInteger(slot) || slot < 0 || slot > 3 || winner !== null) return false;
    const fighter = fighters[side];
    if ((slot === 3 && !fighter.signature) || fighter.pending || fighter.readyAt[slot] > time
      || attacks.length + fighters.filter((candidate) => candidate.pending).length >= MAX_ATTACKS) return false;
    const skill = fighter.definition.skills[slot];
    fighter.pending = { ...questionFor(slot), slot, deadline: time + skill.window };
    emit(side, "cast", { slot, effect: skill.effect });
    return true;
  }

  function resolve(side, correct, timedOut = false) {
    const fighter = fighters[side];
    const slot = fighter.pending.slot;
    const skill = fighter.definition.skills[slot];
    fighter.pending = null;
    fighter.readyAt[slot] = time + skill.cooldown;
    if (!correct) {
      emit(side, timedOut ? "timeout" : "miss", { slot, effect: skill.effect });
      return;
    }
    activate(side, slot, skill);
    launch(side, slot, skill);
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
        const impact = awaitImpact(shot, frames[1 - shot.side], time, end);
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
          damage(ember.side, ember.amount, "burn", ember.slot);
          ember.next += 1;
          ember.left--;
        }
        fighter.embers = fighter.embers.filter(({ left }) => left > 0);
      }
      for (const impact of planned) {
        if (Math.abs(impact.at - time) <= EPSILON) finishAttack(impact);
      }
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
        cooldowns: Object.freeze(fighter.readyAt.map((readyAt) => Math.max(0, readyAt - time))),
      }))),
      pending: privatePending ? Object.freeze({
        slot: privatePending.slot,
        question: privatePending.question,
        choices: privatePending.choices,
        seconds: Math.max(0, privatePending.deadline - time),
      }) : null,
      winner,
      attacks: Object.freeze(attacks.map((shot) => describeAttack(shot, time))),
      events,
      time,
    });
  }

  return Object.freeze({ cast, answer, botAnswer, setPose, tick, read });
}
