import { HEROES } from "./combat-rules.mjs";

const HERO_IDS = Object.keys(HEROES);
const LEVEL_XP = [0, 55, 125, 230, 365];
const DODGE_RECHARGE = [2.8, 2.8, 2.65, 2.5, 2.35];
export const SIGNATURE_LEVEL = 2;
export const SIGNATURE_PRICE = 30;
const MAX_BALANCE = 999_999;
const SETTLEMENT_LIMIT = 512;
const REWARDS = {
  practice: { win: [60, 35], loss: [30, 15], draw: [45, 22] },
  friend: { win: [80, 45], loss: [40, 20], draw: [60, 30] },
};
const INITIAL = Object.freeze({ xp: 0, coins: 0, signature: false });

function knownHero(id) {
  return typeof id === "string" && Object.hasOwn(HEROES, id);
}

function matchToken(id) {
  return typeof id === "string" && /^[A-Za-z0-9_:.\-]{1,96}$/.test(id);
}

function safeBalance(value) {
  return Number.isSafeInteger(value) ? Math.max(0, Math.min(value, MAX_BALANCE)) : 0;
}

function levelAt(xp) {
  return LEVEL_XP.findLastIndex((threshold) => threshold <= xp) + 1;
}

function restoreHero(raw) {
  const xp = safeBalance(raw?.xp);
  return Object.freeze({
    xp,
    coins: safeBalance(raw?.coins),
    signature: raw?.signature === true && levelAt(xp) >= SIGNATURE_LEVEL,
  });
}

function makeState(heroes, settled) {
  return Object.freeze({ heroes: Object.freeze(heroes), settled: Object.freeze(settled) });
}

export function openHeroGrowth(raw) {
  const heroes = Object.fromEntries(HERO_IDS.map((id) => [id, restoreHero(raw?.heroes?.[id])]));
  const source = Array.isArray(raw?.settled) ? raw.settled.slice(-SETTLEMENT_LIMIT) : [];
  return makeState(heroes, [...new Set(source.filter(matchToken))]);
}

export function heroProgress(state, id) {
  const known = knownHero(id);
  const { xp, coins, signature } = known ? state.heroes[id] : INITIAL;
  const level = levelAt(xp);
  return {
    level, xp, coins, signature, dodgeCooldown: DODGE_RECHARGE[level - 1], nextLevelXP: LEVEL_XP[level] ?? null,
    canLearn: known && !signature && level >= SIGNATURE_LEVEL && coins >= SIGNATURE_PRICE,
  };
}

export function awardDuel(state, match) {
  const { matchId, hero, mode, outcome } = match ?? {};
  const row = typeof mode === "string" && Object.hasOwn(REWARDS, mode) ? REWARDS[mode] : null;
  const earned = row && typeof outcome === "string" && Object.hasOwn(row, outcome) ? row[outcome] : null;
  if (!earned || !knownHero(hero) || !matchToken(matchId) || state.settled.includes(matchId)) {
    return { state, reward: null };
  }

  const before = state.heroes[hero];
  const after = Object.freeze({
    ...before,
    xp: safeBalance(before.xp + earned[0]),
    coins: safeBalance(before.coins + earned[1]),
  });
  const settled = [...state.settled.slice(1 - SETTLEMENT_LIMIT), matchId];
  return {
    state: makeState({ ...state.heroes, [hero]: after }, settled),
    reward: {
      xp: after.xp - before.xp,
      coins: after.coins - before.coins,
      leveledUp: levelAt(after.xp) > levelAt(before.xp),
    },
  };
}

export function learnSignature(state, id) {
  if (!heroProgress(state, id).canLearn) return state;
  const before = state.heroes[id];
  const learned = Object.freeze({ ...before, coins: before.coins - SIGNATURE_PRICE, signature: true });
  return makeState({ ...state.heroes, [id]: learned }, state.settled);
}
