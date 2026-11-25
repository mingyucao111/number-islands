import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

function evaluate(filename, scope) {
  const source = readFileSync(new URL(`../${filename}`, import.meta.url), "utf8");
  runInNewContext(source, scope, { filename, timeout: 500 });
}

const window = {};
const browserScope = { window };
for (const file of ["chapters-early.js", "chapters-primary.js", "chapters-secondary.js", "chapters-finale.js"]) {
  evaluate(file, browserScope);
}
const chapters = [...window.NUMBER_ISLANDS_EARLY, ...window.NUMBER_ISLANDS_PRIMARY, ...window.NUMBER_ISLANDS_SECONDARY];
const finale = window.NUMBER_ISLANDS_FINALE;

const agentScope = {};
evaluate("agent.js", agentScope);
const agent = agentScope.NumberIslandsAgent;

function assertText(value, label) {
  assert.ok(typeof value === "string" && value.trim().length > 0, `${label} must be non-empty text`);
}

function assertInteger(value, min, max, label) {
  assert.ok(Number.isInteger(value) && value >= min && value <= max, `${label} must be an integer from ${min} to ${max}`);
}

function verifyMission(mission, chapter) {
  const label = `${chapter} / ${mission.title}`;
  for (const key of ["title", "prompt", "hint", "explain"]) assertText(mission[key], `${label} ${key}`);

  switch (mission.kind) {
    case "build":
      assertInteger(mission.max, 1, 20, `${label} max capacity`);
      assertInteger(mission.target, 0, mission.max, `${label} target`);
      assertText(mission.token, `${label} token`);
      assertText(mission.unit, `${label} unit`);
      if (mission.clue !== undefined) assertInteger(mission.clue, 0, 20, `${label} clue count`);
      break;
    case "grid":
      assertInteger(mission.rows, 1, 6, `${label} rows`);
      assertInteger(mission.cols, 1, 6, `${label} columns`);
      assertInteger(mission.target, 0, mission.rows * mission.cols, `${label} goal tiles`);
      if (mission.rectangle !== undefined) {
        assert.ok(Array.isArray(mission.rectangle) && mission.rectangle.length === 2, `${label} rectangle needs two dimensions`);
        const [height, width] = mission.rectangle;
        assertInteger(height, 1, mission.rows, `${label} rectangle height`);
        assertInteger(width, 1, mission.cols, `${label} rectangle width`);
        assert.equal(mission.target, height * width, `${label} rectangle must use the target tile count`);
      }
      break;
    case "fraction": {
      const { numerator, denominator, splitInto } = mission;
      assertInteger(denominator, 2, 12, `${label} reference denominator`);
      assertInteger(splitInto, 2, 12, `${label} student denominator`);
      assertInteger(numerator, 1, denominator - 1, `${label} reference numerator`);
      assert.notEqual(denominator, splitInto, `${label} must use unequal denominators`);
      assertInteger(numerator * splitInto / denominator, 1, splitInto - 1, `${label} student numerator`);
      break;
    }
    case "number":
      assert.ok(Number.isFinite(mission.answer), `${label} response must be a finite number`);
      if (mission.unit !== undefined) assertText(mission.unit, `${label} unit`);
      if (mission.model !== undefined) assertText(mission.model, `${label} model`);
      break;
    case "balance":
      for (const key of ["coefficient", "constant", "rhs"]) {
        assert.ok(Number.isSafeInteger(mission[key]), `${label} ${key} must be a safe integer`);
      }
      assert.notEqual(mission.coefficient, 0, `${label} equation must have one solution`);
      assertInteger(mission.answer, -9, 12, `${label} dial position`);
      assert.equal(mission.coefficient * mission.answer + mission.constant, mission.rhs, `${label} dial must balance the equation`);
      break;
    case "coordinate":
      assertInteger(mission.x, -4, 4, `${label} x coordinate`);
      assertInteger(mission.y, -4, 4, `${label} y coordinate`);
      break;
    case "choices":
    case "pattern":
      assert.ok(Array.isArray(mission.options), `${label} needs choices`);
      assertInteger(mission.options.length, 2, 4, `${label} choices`);
      mission.options.forEach((option) => assertText(option, `${label} choice label`));
      assert.equal(new Set(mission.options).size, mission.options.length, `${label} needs distinct choices`);
      assert.ok(mission.options.includes(mission.answer), `${label} answer must be a choice`);
      if (mission.kind === "pattern") {
        const { sequence } = mission;
        assert.ok(Array.isArray(sequence) && sequence.length >= 4, `${label} needs at least two repeats`);
        sequence.forEach((token) => assertText(token, `${label} pattern token`));
        const periods = Array.from({ length: Math.floor(sequence.length / 2) }, (_, index) => index + 1);
        const period = periods.find((length) => sequence.every((token, index) => token === sequence[index % length]));
        assert.ok(period !== undefined, `${label} needs a repeating unit`);
        assert.equal(mission.answer, sequence[sequence.length % period], `${label} must continue the repeating pattern`);
      }
      break;
    default:
      assert.fail(`${label} uses unsupported mission kind ${mission.kind}`);
  }
}

test("six age-band chapters have five solvable missions each and a playable finale", () => {
  assert.deepEqual(chapters.map(({ id }) => id), ["beach", "market", "harbour", "reef", "ridge", "beacon"]);
  assert.equal(finale.id, "rescue");
  for (const key of ["opening", "ending", "almost"]) assertText(finale[key], `Finale ${key}`);
  for (const chapter of [...chapters, finale]) {
    for (const key of ["id", "band", "title", "icon", "theme", "story", "part"]) {
      assertText(chapter[key], `${chapter.id} ${key}`);
    }
    assert.equal(chapter.missions.length, 5, chapter.title);
    assert.ok(new Set(chapter.missions.map(({ kind }) => kind)).size >= 2, `${chapter.title} needs varied play`);
    assert.equal(new Set(chapter.missions.map(({ title }) => title)).size, chapter.missions.length, `${chapter.title} mission titles must be unique`);
    chapter.missions.forEach((mission) => verifyMission(mission, chapter.title));
  }
});

test("all chapter practice generators stay within playable bounds and vary their missions", () => {
  let seed = 519;
  const random = (min, max) => {
    assert.ok(Number.isInteger(min) && Number.isInteger(max) && min <= max, "The generator must request a non-empty integer range");
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return min + Math.floor(seed / 2 ** 32 * (max - min + 1));
  };
  for (const chapter of chapters) {
    assert.equal(typeof chapter.practice, "function", chapter.title);
    const extremes = [chapter.practice((min) => min), chapter.practice((_, max) => max)];
    const sample = Array.from({ length: 200 }, () => chapter.practice(random));
    [...extremes, ...sample].forEach((mission) => verifyMission(mission, chapter.title));
    assert.ok(new Set(sample.map(({ kind }) => kind)).size >= 2, `${chapter.title} practice should vary its mechanic`);
    assert.ok(new Set(sample.map((mission) => JSON.stringify(mission))).size > 3, `${chapter.title} practice should vary its content`);
  }
});

test("the local coach reveals a hint on request or repeated errors and reserves the explanation for a verified solve", () => {
  const mission = Object.freeze({ hint: "Count the shells.", explain: "There are five shells." });
  const context = Object.freeze({ mission, attempts: 1, solved: false });
  const first = agent.respond("wrong", context);
  assert.equal(first.tool, "acknowledge");
  assert.notEqual(first.text, mission.explain);
  assert.equal(agent.respond("wrong", { ...context, attempts: 2 }).text, mission.hint);
  assert.equal(agent.respond("hint", context).tool, "showHint");
  assert.equal(agent.respond("hint", context).text, mission.hint);
  assert.equal(agent.respond("solved", context).tool, "acknowledge");
  assert.equal(agent.respond("solved", { ...context, solved: "true" }).tool, "acknowledge");
  assert.equal(agent.respond("solved", { ...context, solved: true }).text, mission.explain);
  assert.ok(Object.isFrozen(agent) && Object.isFrozen(first));
});

test("the coach suggests only known chapter IDs and rejects unknown actions", () => {
  const practice = agent.respond("practice", { chapter: chapters[0] });
  assert.equal(practice.tool, "proposePractice");
  assert.equal(practice.text, chapters[0].id);
  for (const action of ["fetch", "constructor", "__proto__", "showHint"]) {
    assert.throws(() => agent.respond(action, {}), { name: "TypeError", message: "Unknown guide event." });
  }
  assert.equal(agent.suggestChapter([], {}), null);
  assert.equal(agent.suggestChapter(chapters, { last: "external", completed: {} }), "beach");
  assert.equal(agent.suggestChapter(chapters, { last: "ridge", completed: { ridge: 2, market: 1 } }), "ridge");
  assert.equal(agent.suggestChapter(chapters, { last: "ridge", completed: { ridge: 5, market: 1 } }), "market");
  assert.equal(agent.suggestChapter(chapters, { last: "beach", completed: { beach: 5 } }), "market");
  assert.equal(agent.suggestChapter(chapters, { last: "beach", completed: {}, passes: { beach: true } }), "market");
  const completed = Object.fromEntries(chapters.map(({ id, missions }) => [id, missions.length]));
  assert.equal(agent.suggestChapter(chapters, { completed }), "beacon");
});

test("the coach prefers a puzzle type that needed help and bounds unsuccessful searches", () => {
  let calls = 0;
  const chapter = { practice: () => ({ kind: ++calls === 3 ? "fraction" : "grid" }) };
  const random = (min) => min;
  assert.equal(agent.practiceMission(chapter, random, { grid: 1, fraction: 3 }).kind, "fraction");
  assert.equal(calls, 3);
  calls = 0;
  assert.equal(agent.practiceMission(chapter, random, { build: 2 }).kind, "grid");
  assert.equal(calls, 7);
});
