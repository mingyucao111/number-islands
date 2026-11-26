import assert from "node:assert/strict";
import test from "node:test";
import { createCombat, HEROES } from "../voyage/combat-rules.mjs";

function attack(match, side, slot) {
  assert.equal(match.cast(side, slot), true);
  assert.equal(match.botAnswer(side, true), true);
}

test("three selectable casters have distinct effects at shared damage and cooldown tiers", () => {
  assert.deepEqual(Object.keys(HEROES), ["gale", "warden", "ember"]);
  for (const definition of Object.values(HEROES)) {
    assert.equal(definition.skills.length, 3);
    assert.deepEqual(definition.skills.map(({ damage }) => damage), [10, 20, 36]);
    assert.deepEqual(definition.skills.map(({ cooldown }) => cooldown), [2.5, 5.5, 10]);
  }
  assert.deepEqual(Object.values(HEROES).map(({ skills }) => skills.map(({ effect }) => effect)), [
    ["evade", "haste", "pierce"],
    ["shield", "cleanse-shield", "shield-heal"],
    ["heal", "burn", "heal-burn"],
  ]);
});

test("every grade and tier offers three unique choices with the mathematically correct answer", () => {
  const answers = {
    k: ["2", "3", "1"],
    p12: ["4", "2", "5"],
    p34: ["6", "3", "2"],
    p56: ["3", "6", "34"],
    s1: ["−1", "2", "−2"],
    s23: ["12", "2", "3"],
  };
  for (const [route, expected] of Object.entries(answers)) {
    for (const [slot, choice] of expected.entries()) {
      const match = createCombat({ route, random: () => 0 });
      assert.equal(match.cast(0, slot), true);
      const pending = match.read(0).pending;
      assert.ok(pending.question.length > 0, `${route} tier ${slot}`);
      assert.equal(new Set(pending.choices).size, 3);
      assert.deepEqual(Object.keys(pending), ["slot", "question", "choices", "seconds"]);
      assert.equal(match.read(1).pending, null);
      assert.equal(match.read().pending, null);
      assert.ok(Object.isFrozen(pending.choices));
      assert.notEqual(pending.choices.indexOf(choice), -1, `${route} tier ${slot}`);
      assert.equal(match.answer(0, pending.choices.indexOf(choice)), true);
      assert.equal(match.read(1).fighters[1].hp, 100 - HEROES.gale.skills[slot].damage);
    }
  }
});

test("incorrect answers and deadlines cost only their own skill cooldown, and both sides can open a spell", () => {
  const match = createCombat({ route: "p12", random: () => 0 });
  assert.equal(match.cast(0, 0), true);
  assert.equal(match.cast(1, 2), true);
  assert.equal(match.cast(0, 1), false);
  assert.equal(match.read(0).pending.seconds, 9);
  assert.equal(match.read(1).pending.seconds, 16);
  assert.equal(match.answer(0, -1), false);
  assert.equal(match.answer(0, 0), true);
  assert.equal(match.read(0).events.at(-1).kind, "miss");
  assert.deepEqual(match.read().fighters.map(({ hp }) => hp), [100, 100]);
  assert.deepEqual(match.read().fighters[0].cooldowns, [2.5, 0, 0]);
  match.tick(2.49);
  assert.equal(match.cast(0, 0), false);
  match.tick(0.02);
  assert.equal(match.cast(0, 0), true);
  match.tick(16 - match.read().time);
  assert.equal(match.read(1).pending, null);
  assert.equal(match.answer(1, 0), false);
  assert.ok(match.read().events.some(({ kind, side }) => side === 0 && kind === "timeout"));
  assert.equal(match.read().events.at(-1).kind, "timeout");
  assert.equal(match.read().fighters[1].cooldowns[2], 10);
  assert.deepEqual(match.read().fighters.map(({ hp }) => hp), [100, 100]);
});

test("Warden absorbs damage and Gale softens one incoming strike", () => {
  const match = createCombat({ heroes: ["warden", "gale"] });
  attack(match, 0, 2);
  assert.equal(match.read().fighters[0].shield, 13);
  attack(match, 1, 0);
  assert.equal(match.read().fighters[0].hp, 100);
  assert.equal(match.read().fighters[0].shield, 3);
  attack(match, 0, 1);
  assert.equal(match.read().fighters[1].hp, 49);
  const evaded = match.read().events.find(({ kind }) => kind === "evade");
  assert.equal(evaded.amount, 5);
  attack(match, 0, 0);
  assert.equal(match.read().fighters[1].hp, 39);
});

test("Whirlstep only shortens Gale's other cooldowns and cannot go past ready", () => {
  const match = createCombat({ heroes: ["gale", "ember"] });
  attack(match, 0, 0);
  attack(match, 0, 2);
  attack(match, 1, 0);
  attack(match, 0, 1);
  const first = match.read();
  assert.deepEqual(first.fighters[0].cooldowns, [0.5, 5.5, 8]);
  assert.deepEqual(first.fighters[1].cooldowns, [2.5, 0, 0]);
  assert.equal(first.events.at(-1).kind, "haste");
  assert.equal(first.events.at(-1).amount, 4);

  const edge = createCombat({ heroes: ["gale", "ember"] });
  attack(edge, 0, 0);
  edge.tick(1.5);
  attack(edge, 0, 1);
  assert.deepEqual(edge.read().fighters[0].cooldowns, [0, 5.5, 0]);
  assert.equal(edge.read().events.at(-1).amount, 1);
  assert.equal(edge.cast(0, 0), true);
});

test("Skybreak pierces up to 12 shield points and preserves the ignored points", () => {
  const match = createCombat({ heroes: ["gale", "warden"] });
  attack(match, 1, 0);
  attack(match, 1, 1);
  attack(match, 1, 2);
  assert.equal(match.read().fighters[1].shield, 22);
  attack(match, 0, 2);
  assert.equal(match.read().fighters[1].hp, 74);
  assert.equal(match.read().fighters[1].shield, 12);
  const hit = match.read().events.at(-1);
  assert.equal(hit.kind, "hit");
  assert.equal(hit.effect, "pierce");
  assert.equal(hit.amount, 26);
  assert.equal(hit.absorbed, 10);
  assert.equal(hit.pierced, 12);
  attack(match, 0, 0);
  assert.equal(match.read().fighters[1].shield, 2);
  assert.equal(match.read().fighters[1].hp, 74);

  const smallShield = createCombat({ heroes: ["gale", "warden"] });
  attack(smallShield, 1, 0);
  attack(smallShield, 0, 2);
  assert.equal(smallShield.read().fighters[1].hp, 64);
  assert.equal(smallShield.read().fighters[1].shield, 4);
});

test("Ivory Bastion clears stacked embers and Sunwall shields plus restores health", () => {
  const match = createCombat({ heroes: ["warden", "ember"] });
  attack(match, 1, 1);
  attack(match, 1, 2);
  match.tick(1);
  assert.equal(match.read().fighters[0].hp, 39);
  attack(match, 0, 1);
  assert.equal(match.read().fighters[0].shield, 5);
  const cleared = match.read().events.find(({ kind }) => kind === "cleanse");
  assert.equal(cleared.amount, 2);
  match.tick(3);
  assert.equal(match.read().fighters[0].hp, 39);
  assert.equal(match.read().fighters[0].shield, 5);
  assert.equal(match.read().events.filter(({ kind }) => kind === "burn").length, 2);
  attack(match, 0, 2);
  assert.equal(match.read().fighters[0].hp, 45);
  assert.equal(match.read().fighters[0].shield, 18);
  assert.equal(match.read().events.at(-1).kind, "heal");
  assert.equal(match.read().events.at(-1).amount, 6);
});

test("Ember's healing is capped and the correct fire spell produces three scheduled impacts", () => {
  const match = createCombat({ heroes: ["ember", "warden"] });
  attack(match, 1, 0);
  assert.equal(match.read().fighters[0].hp, 90);
  attack(match, 0, 2);
  assert.equal(match.read().fighters[0].hp, 98);
  assert.equal(match.read().fighters[1].hp, 68);
  match.tick(0.9);
  assert.equal(match.read().fighters[1].hp, 68);
  match.tick(0.1);
  assert.equal(match.read().fighters[1].hp, 65);
  match.tick(2);
  assert.equal(match.read().fighters[1].hp, 59);
  assert.equal(match.read().events.filter(({ kind }) => kind === "burn").length, 3);
  attack(match, 0, 0);
  assert.equal(match.read().fighters[0].hp, 100);
});

test("victory closes both prompts, and simultaneous final glows can produce a draw", () => {
  const finished = createCombat();
  assert.equal(finished.cast(1, 2), true);
  attack(finished, 0, 2);
  attack(finished, 0, 1);
  attack(finished, 0, 0);
  finished.tick(10);
  attack(finished, 0, 2);
  assert.equal(finished.read().winner, 0);
  assert.equal(finished.read(1).pending, null);
  assert.equal(finished.cast(1, 0), false);
  assert.equal(finished.read().events.at(-1).kind, "victory");

  const tied = createCombat({ heroes: ["ember", "ember"] });
  for (let round = 0; round < 3; round++) {
    attack(tied, 0, 1);
    attack(tied, 1, 1);
    tied.tick(5.5);
  }
  assert.deepEqual(tied.read().fighters.map(({ hp }) => hp), [22, 22]);
  attack(tied, 0, 1);
  attack(tied, 1, 1);
  tied.tick(1);
  assert.equal(tied.read().winner, "draw");
  assert.deepEqual(tied.read().fighters.map(({ hp }) => hp), [0, 0]);
});

test("snapshots cannot mutate the duel and idle or invalid clock updates do not spend time", () => {
  const match = createCombat({ route: { toString: null }, heroes: [false, "invalid"], random: () => 3 });
  const initial = match.read();
  assert.throws(() => { initial.fighters[0].hp = -100; }, TypeError);
  assert.deepEqual(initial.fighters.map(({ hero }) => hero), ["gale", "ember"]);
  assert.equal(match.cast("0", 0), false);
  assert.equal(match.cast(0, 3), false);
  assert.equal(match.cast(0, 0), true);
  const timer = match.read(0).pending.seconds;
  match.tick(0);
  match.tick(-1);
  match.tick(Symbol("invalid"));
  assert.equal(match.read(0).pending.seconds, timer);
  assert.equal(match.botAnswer(0, "true"), false);
  assert.equal(match.answer(2, 1), false);
});
