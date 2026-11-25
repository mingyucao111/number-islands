import assert from "node:assert/strict";
import test from "node:test";
import "../potion-game.js";

const { makeRecipes } = globalThis.NumberIslandsPotion;

test("Potion Garden doubles the original ratio with a larger batch", () => {
  for (const seed of [0, 1, 2, 41, 918, Number.MAX_SAFE_INTEGER]) {
    const [first, double] = makeRecipes(seed);
    assert.equal(first.unit, "scoop");
    assert.equal(first.goal[0] + first.goal[1], 3);
    assert.equal(double.unit, "scoop");
    assert.equal(double.goal[0] + double.goal[1], 6);
    assert.deepEqual(double.goal, first.goal.map((value) => value * 2));
    assert.equal(first.recipe, double.recipe);
    assert.match(first.recipe, new RegExp(`${first.goal[0]} : ${first.goal[1]}$`));
  }
});

test("every seeded final potion has the requested volume and difference in reachable measures", () => {
  const variants = new Set();
  for (let seed = 0; seed < 100; seed++) {
    const recipe = makeRecipes(seed)[2];
    const [moon, star] = recipe.goal.map((count) => count * recipe.measure);
    assert.equal(recipe.unit, "mL");
    assert.equal(recipe.measure, 5);
    assert.ok(recipe.goal.every((count) => Number.isInteger(count) && count > 0));
    assert.match(recipe.order, new RegExp(`Brew ${moon + star} mL`));
    assert.equal(moon - star, seed % 2 === 0 ? 10 : -10);
    assert.match(recipe.order, new RegExp(seed % 2 === 0 ? "10 mL more" : "10 mL less"));
    variants.add(recipe.order);
  }
  assert.equal(variants.size, 6);
});
