const HEALTH = 100;
const MAX_SHIELD = 25;
const TIERS = Object.freeze([
  { damage: 10, cooldown: 2.5, window: 9 },
  { damage: 20, cooldown: 5.5, window: 12 },
  { damage: 36, cooldown: 10, window: 16 },
]);

function hero(id, name, color, spells) {
  const skills = spells.map(([skillName, effect, power, description], slot) => {
    const { damage, cooldown } = TIERS[slot];
    return Object.freeze({ name: skillName, effect, power, description, damage, cooldown });
  });
  return Object.freeze({ id, name, color, skills: Object.freeze(skills) });
}

export const HEROES = Object.freeze({
  gale: hero("gale", "Gale", "#74d6bd", [
    ["Gust Step", "evade", 0.28, "Strike, then soften the next hit within 4 seconds."],
    ["Whirlstep", "haste", 2, "Strike and shorten each other skill's cooldown by 2 seconds."],
    ["Skybreak", "pierce", 12, "Strike past up to 12 shield points, leaving those points intact."],
  ]),
  warden: hero("warden", "Warden", "#e0bc70", [
    ["Lantern Guard", "shield", 4, "Strike and gain a 4-point shield."],
    ["Ivory Bastion", "cleanse-shield", 5, "Strike, clear active embers and gain a 5-point shield."],
    ["Sunwall", "shield-heal", 13, "Strike, gain a 13-point shield and restore up to 6 health."],
  ]),
  ember: hero("ember", "Ember", "#ee947d", [
    ["Hearth Spark", "heal", 4, "Strike and restore up to 4 health."],
    ["Cinder Trail", "burn", 2, "Strike and leave a glow that deals 2 damage each second for 3 seconds."],
    ["Phoenix Ring", "heal-burn", 3, "Strike, restore up to 8 health and leave a 3-second glow."],
  ]),
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
    const { question, answer, min = -Infinity } = generate(slot, pick);
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

function makeFighter(choice, fallback) {
  const definition = typeof choice === "string" && Object.hasOwn(HEROES, choice) ? HEROES[choice] : HEROES[fallback];
  return { definition, hp: HEALTH, shield: 0, evasion: null, readyAt: [0, 0, 0], pending: null, embers: [] };
}

function validSide(side) {
  return side === 0 || side === 1;
}

export function createCombat({ heroes = ["gale", "ember"], route = "p12", random = Math.random } = {}) {
  if (typeof random !== "function") throw new TypeError("Combat expects a random function.");
  const questionFor = questionsFor(random, route);
  const fighters = [makeFighter(heroes?.[0], "gale"), makeFighter(heroes?.[1], "ember")];
  let time = 0;
  let winner = null;
  let sequence = 0;
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
    emit(winner, "victory");
    return true;
  }

  function damage(side, amount, effect, slot, glow = false) {
    const target = 1 - side;
    const opponent = fighters[target];
    let impact = amount;
    if (!glow && opponent.evasion && opponent.evasion.expires > time) {
      const resisted = Math.floor(impact * opponent.evasion.reduction);
      impact -= resisted;
      opponent.evasion = null;
      emit(target, "evade", { target: side, amount: resisted, effect: "evade" });
    }
    const pierced = effect === "pierce" ? Math.min(opponent.shield, impact, fighters[side].definition.skills[slot].power) : 0;
    const absorbed = Math.min(opponent.shield - pierced, impact - pierced);
    opponent.shield -= absorbed;
    const dealt = Math.min(opponent.hp, impact - absorbed);
    opponent.hp -= dealt;
    emit(side, glow ? "burn" : "hit", { target, slot, amount: dealt, absorbed, effect, ...(pierced > 0 && { pierced }) });
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

  function activate(side, slot, skill) {
    const fighter = fighters[side];
    const { effect, power } = skill;
    switch (effect) {
      case "shield":
        shield(side, power, slot);
        break;
      case "cleanse-shield": {
        const cleared = fighter.embers.length;
        fighter.embers = [];
        if (cleared > 0) emit(side, "cleanse", { amount: cleared, slot, effect: "cleanse" });
        shield(side, power, slot);
        break;
      }
      case "shield-heal":
        shield(side, power, slot);
        heal(side, 6, slot);
        break;
      case "evade": {
        const existing = fighter.evasion?.expires > time ? fighter.evasion.reduction : 0;
        fighter.evasion = { reduction: Math.max(existing, power), expires: time + 4 };
        break;
      }
      case "haste": {
        let amount = 0;
        for (const [index, readyAt] of fighter.readyAt.entries()) {
          if (index === slot || readyAt <= time) continue;
          const shortened = Math.max(time, readyAt - power);
          amount += readyAt - shortened;
          fighter.readyAt[index] = shortened;
        }
        if (amount > 0) emit(side, "haste", { amount, slot, effect });
        break;
      }
      case "heal":
        heal(side, power, slot);
        break;
      case "burn":
      case "heal-burn":
        if (effect === "heal-burn") heal(side, 8, slot);
        if (fighters[1 - side].hp > 0) {
          fighters[1 - side].embers.push({ side, slot, amount: power, next: time + 1, left: 3 });
        }
        break;
    }
  }

  function cast(side, slot) {
    if (!validSide(side) || !Number.isInteger(slot) || !TIERS[slot] || winner !== null) return false;
    const fighter = fighters[side];
    if (fighter.pending || fighter.readyAt[slot] > time) return false;
    fighter.pending = { ...questionFor(slot), slot, deadline: time + TIERS[slot].window };
    emit(side, "cast", { slot, effect: fighter.definition.skills[slot].effect });
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
    damage(side, skill.damage, skill.effect, slot);
    activate(side, slot, skill);
    endIfNeeded();
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
    for (;;) {
      let next = Infinity;
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
          damage(ember.side, ember.amount, "burn", ember.slot, true);
          ember.next += 1;
          ember.left--;
        }
        fighter.embers = fighter.embers.filter(({ left }) => left > 0);
      }
      if (endIfNeeded()) return;
    }
    time = end;
  }

  function read(side) {
    const privatePending = validSide(side) ? fighters[side].pending : null;
    return Object.freeze({
      fighters: Object.freeze(fighters.map((fighter) => Object.freeze({
        hp: fighter.hp,
        hero: fighter.definition.id,
        shield: fighter.shield,
        cooldowns: Object.freeze(fighter.readyAt.map((readyAt) => Math.max(0, readyAt - time))),
      }))),
      pending: privatePending ? Object.freeze({
        slot: privatePending.slot,
        question: privatePending.question,
        choices: privatePending.choices,
        seconds: Math.max(0, privatePending.deadline - time),
      }) : null,
      winner,
      events,
      time,
    });
  }

  return Object.freeze({ cast, answer, botAnswer, tick, read });
}
