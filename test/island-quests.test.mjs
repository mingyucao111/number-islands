import assert from "node:assert/strict";
import test from "node:test";
import "../island-quests.js";

const quests = globalThis.NumberIslandsQuests;

test("the cabin has a varied deterministic layout with a solution for every task", () => {
  const layouts = new Set();
  for (let i = 0; i < 100; i++) {
    const seed = `harbour-${i}`;
    const puzzle = quests.puzzle("hunt", seed);
    assert.deepEqual(quests.puzzle("hunt", seed), puzzle);
    const { props, lantern, supplies, flag } = puzzle;
    assert.equal(new Set(props.map(({ id }) => id)).size, 16);
    assert.equal(props.filter(({ type, value }) => type === "lantern" && value === lantern).length, 1);
    assert.ok(props.some((chest) => chest.type === "chest" &&
      props.some((shell) => shell.type === "shell" && chest.value + shell.value === supplies)));
    assert.equal(props.filter(({ type, value }) => type === "flag" && value === flag).length, 1);
    assert.equal(flag % 2, 0);
    layouts.add(props.map(({ id }) => id).join(","));
  }
  assert.ok(layouts.size > 90);
});

test("the vault weights and wheels are physically reachable for every seed", () => {
  const combinations = new Set();
  const sums = new Set([2 + 3, 2 + 5, 2 + 7, 3 + 5, 3 + 7, 5 + 7]);
  for (let i = 0; i < 100; i++) {
    const puzzle = quests.puzzle("escape", i);
    assert.deepEqual(quests.puzzle("escape", String(i)), puzzle);
    assert.ok(sums.has(puzzle.target));
    assert.ok(puzzle.left >= 1 && puzzle.left <= 3);
    assert.equal(puzzle.right, puzzle.left * puzzle.factor);
    assert.ok(puzzle.right <= 9);
    combinations.add(JSON.stringify(puzzle));
  }
  assert.ok(combinations.size > 18);
  assert.throws(() => quests.puzzle("typo", 2), RangeError);
});
