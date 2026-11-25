import assert from "node:assert/strict";
import test from "node:test";
import "../lesson-agent.js";

const { generate, validateRecipe, encode, decode, aiAvailability } = globalThis.NumberIslandsLessons;
const deck = (...lines) => ({ title: "Private Teacher Filename", slides: lines.map((text, index) => ({ number: index + 1, text })) });

test("generates bounded playable missions from the maths actually shown on the slides", async () => {
  const result = await generate(deck(
    "Slide 1 • Add and subtract\n4 + 3 = 7\n14 − 6 = 8",
    "Equivalent fractions\n4/6 = ?/9",
    "Area of a rectangle\n3 × 5",
    "Linear equations\n3x + 4 = 16",
  ));
  assert.equal(result.provider, "rules");
  assert.equal(result.recipe.title, "Maths Harbour Expedition");
  assert.deepEqual(result.recipe.tasks, [
    { kind: "load", target: 7, starting: 4, change: 3 },
    { kind: "load", target: 8, starting: 14, change: -6 },
    { kind: "fraction", numerator: 4, denominator: 6, splitInto: 9 },
    { kind: "grid", rows: 3, cols: 5 },
    { kind: "balance", coefficient: 3, constant: 4, rhs: 16 },
  ]);
  assert.doesNotMatch(encode(result.recipe), /Private/);
});

test("recognises common Chinese mathematical notation and English fraction words", async () => {
  const result = await generate(deck(
    "等值分数\n三分之一改写成九分之？",
    "长方形的面积\n3行，每行4个正方形",
    "加减法\n十二减去四",
    "Equivalent fractions\nTwo thirds in sixths.",
  ));
  assert.deepEqual(result.recipe.tasks, [
    { kind: "fraction", numerator: 1, denominator: 3, splitInto: 9 },
    { kind: "grid", rows: 3, cols: 4 },
    { kind: "load", target: 8, starting: 12, change: -4 },
    { kind: "fraction", numerator: 2, denominator: 3, splitInto: 6 },
  ]);
});

test("does not turn unrelated slide prose, multi-step equations or invalid arithmetic into tasks", async () => {
  for (const text of ["Welcome. Workshop date: 2026-11-25.", "Learn verbs and nouns.",
    "Algebra: x + 3 = 5 + x", "Galley exercise: 3 + 4 + 5", "5 + 4 = 19", "7 - 3.5 = 3.5"]) {
    await assert.rejects(generate(deck(text)), /No matching maths/);
  }
  await assert.rejects(generate(deck("  ")), /no readable teaching text/);
});

test("recognises natural arithmetic and area wording while retaining the source quantities", async () => {
  const result = await generate(deck(
    "Add six to eight.\nSubtract four from thirteen.",
    "Area of a rectangular deck. Length is 5 m and width is 4 m.",
    "Equivalent fractions\n4/6 is the same as how many ninths?",
  ));
  assert.deepEqual(result.recipe.tasks, [
    { kind: "load", target: 14, starting: 8, change: 6 },
    { kind: "load", target: 9, starting: 13, change: -4 },
    { kind: "grid", rows: 5, cols: 4 },
    { kind: "fraction", numerator: 4, denominator: 6, splitInto: 9 },
  ]);
});

test("round-trips compact UTF-8 links and rejects extra, unsafe or unsolvable fields", () => {
  const recipe = { title: "等值分数", tasks: [{ kind: "fraction", numerator: 1, denominator: 3, splitInto: 9 }] };
  const token = encode(recipe);
  assert.match(token, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(decode(token), recipe);
  assert.throws(() => decode("not a valid link"), /invalid format/);
  assert.throws(() => decode("A".repeat(2401)), /invalid format/);
  assert.throws(() => validateRecipe({ ...recipe, title: "\u202eInvalid" }), /title/);
  assert.throws(() => validateRecipe({ ...recipe, tasks: [{ ...recipe.tasks[0], html: "<div>" }] }), /unsupported/);
  assert.throws(() => validateRecipe({ ...recipe, tasks: [{ kind: "fraction", numerator: 1, denominator: 3, splitInto: 8 }] }), /unsolvable/);
  assert.throws(() => validateRecipe({ ...recipe, tasks: [{ kind: "balance", coefficient: 3, constant: 1, rhs: 11 }] }), /unsolvable/);
  assert.throws(() => validateRecipe({ ...recipe, tasks: [{ kind: "load", target: 5, starting: 12, change: -4 }] }), /unsolvable/);
});

test("optionally uses installed Chrome AI through a constrained request and validates source-grounded results", async (t) => {
  const original = globalThis.LanguageModel;
  t.after(() => { globalThis.LanguageModel = original; });
  let destroyed = false;
  globalThis.LanguageModel = {
    async availability(options) {
      assert.deepEqual(options.expectedInputs, [{ type: "text", languages: ["en"] }]);
      return "available";
    },
    async create(options) {
      assert.equal(options.initialPrompts[0].role, "system");
      assert.match(options.initialPrompts[0].content, /evidence only/);
      return {
        async prompt(prompt, options) {
          assert.deepEqual(JSON.parse(prompt).slides[0].number, 1);
          assert.equal(options.responseConstraint.additionalProperties, false);
          return JSON.stringify({ activities: [
            { kind: "load", slide: 1, values: [8, 6] },
            { kind: "grid", slide: 2, values: [8, 6] },
            { kind: "load", slide: 1, values: [19, 1] },
            { kind: "load", slide: 12, values: [8] },
          ] });
        },
        destroy() { destroyed = true; },
      };
    },
  };
  assert.equal(await aiAvailability(), "available");
  const { recipe, provider } = await generate(deck("Addition\nCombine eight lanterns with six spare lanterns."), { mode: "ai" });
  assert.equal(provider, "chrome");
  assert.deepEqual(recipe.tasks, [{ kind: "load", target: 14, starting: 8, change: 6 }]);
  assert.ok(destroyed);
});

test("uses deterministic extraction when the model reverses an explicit operation", async (t) => {
  const original = globalThis.LanguageModel;
  t.after(() => { globalThis.LanguageModel = original; });
  globalThis.LanguageModel = {
    async availability() { return "available"; },
    async create() {
      return {
        async prompt() {
          return JSON.stringify({ activities: [{ kind: "load", slide: 1, values: [9, 4] }] });
        },
      };
    },
  };
  const { provider, recipe } = await generate(deck("Subtraction: 9 - 4"), { mode: "ai" });
  assert.equal(provider, "rules");
  assert.deepEqual(recipe.tasks, [{ kind: "load", target: 5, starting: 9, change: -4 }]);
});

test("falls back with a clear provider when no model is ready or the response is unusable", async (t) => {
  const original = globalThis.LanguageModel;
  t.after(() => { globalThis.LanguageModel = original; });
  globalThis.LanguageModel = {
    async availability() { return "downloadable"; },
    async create() { throw new Error("Should not start a model download."); },
  };
  const sample = deck("1/2 = 2/4");
  assert.equal((await generate(sample, { mode: "ai" })).provider, "rules");
  globalThis.LanguageModel = {
    async availability() { return "available"; },
    async create() {
      return { async prompt() { return "{bad}}"; }, destroy() {} };
    },
  };
  assert.equal((await generate(sample, { mode: "ai" })).provider, "rules");
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(generate(sample, { mode: "ai", signal: abort.signal }), { name: "AbortError" });
});

test("limits repeated activities and generates variations for explicit lesson objectives", async () => {
  const repeated = Array.from({ length: 20 }, (_, i) => `${i % 10 + 1} + 3`);
  const result = await generate(deck(...repeated));
  assert.equal(result.recipe.tasks.length, 6);
  const objective = await generate(deck("Equivalent fractions represent the same share of a whole."));
  assert.equal(objective.recipe.tasks.length, 3);
  const counting = await generate(deck("Count objects up to 10"));
  assert.deepEqual(counting.recipe.tasks, [{ kind: "load", target: 8 }, { kind: "load", target: 10 }]);
});
