import assert from "node:assert/strict";
import { test } from "node:test";
import { awardDuel, heroProgress, learnSignature, openHeroGrowth } from "../voyage/hero-growth.mjs";

const duel = (hero, mode, outcome, matchId = "match-1") => ({ hero, mode, outcome, matchId });

test("every result grants the expected growth only to the participating hero", () => {
  const rewards = {
    practice: { win: [60, 35], draw: [45, 22], loss: [30, 15] },
    friend: { win: [80, 45], draw: [60, 30], loss: [40, 20] },
  };
  for (const [mode, outcomes] of Object.entries(rewards)) {
    for (const [outcome, [xp, coins]] of Object.entries(outcomes)) {
      const starting = openHeroGrowth(null);
      const { state, reward } = awardDuel(starting, duel("ember", mode, outcome));
      assert.deepEqual(reward, { xp, coins, leveledUp: xp >= 55 });
      assert.deepEqual(heroProgress(state, "ember"), {
        level: xp >= 55 ? 2 : 1,
        xp, coins, signature: false,
        dodgeCooldown: 2.8,
        nextLevelXP: xp >= 55 ? 125 : 55,
        canLearn: xp >= 55 && coins >= 30,
      });
      assert.deepEqual(heroProgress(state, "gale"), heroProgress(starting, "gale"));
      assert.deepEqual(heroProgress(state, "warden"), heroProgress(starting, "warden"));
      assert.equal(heroProgress(starting, "ember").xp, 0);
    }
  }
});

test("learning a signature requires that hero's level and coins, and charges exactly once", () => {
  const blank = openHeroGrowth(null);
  assert.equal(learnSignature(blank, "gale"), blank);
  const winner = awardDuel(blank, duel("gale", "practice", "win")).state;
  assert.equal(learnSignature(winner, "ember"), winner);
  const learned = learnSignature(winner, "gale");
  assert.deepEqual(heroProgress(learned, "gale"),
    { level: 2, xp: 60, coins: 5, signature: true, dodgeCooldown: 2.8, nextLevelXP: 125, canLearn: false });
  assert.equal(heroProgress(winner, "gale").coins, 35);
  assert.equal(learnSignature(learned, "gale"), learned);
  const reloaded = openHeroGrowth(JSON.parse(JSON.stringify(learned)));
  assert.equal(heroProgress(reloaded, "gale").signature, true);
  assert.equal(learnSignature(reloaded, "gale"), reloaded);

  const short = openHeroGrowth({ heroes: { gale: { xp: 120, coins: 29 } } });
  assert.equal(learnSignature(short, "gale"), short);
});

test("match settlements are once-only across a saved reload and invalid input is ignored", () => {
  const completed = duel("warden", "friend", "win", "6af173c4-1234-5678-a001-1234567890cf");
  const updated = awardDuel(openHeroGrowth(null), completed).state;
  const saved = openHeroGrowth(JSON.parse(JSON.stringify(updated)));
  assert.deepEqual(awardDuel(saved, completed), { state: saved, reward: null });
  assert.equal(awardDuel(saved, { ...completed, hero: "ember", outcome: "loss" }).state, saved);
  for (const patch of [
    { hero: "__proto__" }, { mode: "ai" }, { outcome: "unsettled" }, { matchId: "" }, { matchId: "x".repeat(97) },
  ]) {
    assert.deepEqual(awardDuel(saved, { ...completed, ...patch }), { state: saved, reward: null });
  }
  assert.deepEqual(awardDuel(saved, null), { state: saved, reward: null });
});

test("level thresholds are absolute, including the last level", () => {
  for (const [xp, level, nextLevelXP] of [
    [0, 1, 55], [54, 1, 55], [55, 2, 125], [124, 2, 125], [125, 3, 230],
    [229, 3, 230], [230, 4, 365], [364, 4, 365], [365, 5, null], [500, 5, null],
  ]) {
    const state = openHeroGrowth({ heroes: { gale: { xp } } });
    assert.deepEqual([heroProgress(state, "gale").level, heroProgress(state, "gale").nextLevelXP], [level, nextLevelXP]);
  }
});

test("higher hero levels shorten the dodge recharge", () => {
  for (const [xp, expected] of [[124, 2.8], [125, 2.65], [230, 2.5], [365, 2.35]]) {
    const state = openHeroGrowth({ heroes: { gale: { xp } } });
    assert.equal(heroProgress(state, "gale").dodgeCooldown, expected);
    assert.equal(heroProgress(state, "ember").dodgeCooldown, 2.8);
  }
});

test("restoration sanitizes hero records and bounds the settlement history", () => {
  const state = openHeroGrowth({
    heroes: {
      gale: { xp: 7, coins: Infinity, signature: true },
      warden: { xp: -9, coins: "450", signature: "true" },
      ember: { xp: 1_000_000_000, coins: 1_000_000_000, signature: true },
      bogus: { xp: 7, coins: 50 },
    },
    settled: [...Array.from({ length: 2000 }, (_, index) => "match-" + index), "match-1999", null, " "],
  });
  assert.deepEqual(Object.keys(state.heroes), ["gale", "warden", "ember", "tide", "thorn", "echo", "frost"]);
  assert.deepEqual(heroProgress(state, "gale"), {
    level: 1, xp: 7, coins: 0, signature: false, dodgeCooldown: 2.8, nextLevelXP: 55, canLearn: false,
  });
  assert.equal(heroProgress(state, "warden").xp, 0);
  assert.equal(heroProgress(state, "warden").coins, 0);
  assert.equal(heroProgress(state, "ember").level, 5);
  assert.equal(heroProgress(state, "ember").signature, true);
  assert.ok(state.heroes.ember.xp < 1_000_000_000);
  assert.ok(state.settled.length <= 512);
  assert.ok(state.settled.includes("match-1999"));
  assert.equal(new Set(state.settled).size, state.settled.length);
  assert.ok(!state.settled.includes(null) && !state.settled.includes(" "));
});
