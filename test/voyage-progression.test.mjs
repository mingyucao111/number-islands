import assert from "node:assert/strict";
import test from "node:test";
import { ROUTES, earnMilestone, nextRoute, rankFor, restoreProgress, totalExperience } from "../voyage/progression.mjs";

test("six selectable grade bands have distinct, achievable winch targets", () => {
  assert.deepEqual(ROUTES.map(({ grade }) => grade), ["K1–K2", "P1–P2", "P3–P4", "P5–P6", "Sec 1", "Sec 2–3"]);
  assert.equal(new Set(ROUTES.map(({ id }) => id)).size, ROUTES.length);
  assert.equal(new Set(ROUTES.map(({ target }) => target)).size, ROUTES.length);

  let previousTarget = 0;
  for (const { id, marks, target } of ROUTES) {
    assert.equal(marks.length, 3, id);
    assert.ok(marks.every((mark) => Number.isInteger(mark) && mark > 0), id);
    assert.ok(target > previousTarget, id);
    previousTarget = target;
    const possibleLoads = new Set([0]);
    for (const mark of marks) {
      for (const load of [...possibleLoads]) possibleLoads.add(load + mark);
    }
    assert.ok(possibleLoads.has(target), id);
  }
});

test("hydration retains the started grade and recognised milestones for several routes", () => {
  const raw = {
    chosen: "s1",
    steps: {
      s1: ["weights", "weights", "lens", "invalid", ["beacon"]],
      k: ["complete"],
      p12: "complete",
      unknownRoute: ["beacon"],
    },
  };
  assert.deepEqual(restoreProgress(JSON.parse(JSON.stringify(raw))), {
    chosen: "s1",
    steps: { k: ["complete"], s1: ["weights", "lens"] },
  });
  assert.deepEqual(restoreProgress({ chosen: "unknownRoute", steps: null }), { chosen: ROUTES[0].id, steps: {} });
  assert.deepEqual(restoreProgress(null), { chosen: ROUTES[0].id, steps: {} });
});

test("repeating milestones cannot earn XP twice but another route has independent progress", () => {
  const starting = restoreProgress({ chosen: "p34" });
  const lowered = earnMilestone(starting, "p34", "weights");
  assert.equal(lowered.earned, 10);
  assert.equal(totalExperience(starting), 0);
  const repeated = earnMilestone(lowered.progress, "p34", "weights");
  assert.deepEqual(repeated, { progress: lowered.progress, earned: 0 });
  const another = earnMilestone(repeated.progress, "s23", "weights");
  assert.equal(another.earned, 10);
  assert.equal(another.progress.chosen, "p34");
  const completed = earnMilestone(another.progress, "p34", "complete");
  assert.equal(totalExperience(completed.progress), 65);
  const restored = restoreProgress(JSON.parse(JSON.stringify(completed.progress)));
  assert.equal(totalExperience(restored), 65);
  assert.equal(earnMilestone(restored, "p34", "complete").earned, 0);
  assert.equal(earnMilestone(restored, "unknownRoute", "complete").earned, 0);
  assert.equal(earnMilestone(restored, "p34", "unknownMilestone").earned, 0);
});

test("rank boundaries and the next route reflect continued exploration", () => {
  assert.equal(rankFor(0).name, "Wayfarer");
  assert.equal(rankFor(24).name, "Wayfarer");
  assert.equal(rankFor(25).name, "Shore Scout");
  assert.equal(rankFor(75).name, "Lantern Keeper");
  assert.equal(rankFor(150).name, "Wind Rider");
  assert.equal(rankFor(300).name, "Beacon Guardian");
  for (let index = 0; index < ROUTES.length - 1; index++) {
    assert.equal(nextRoute(ROUTES[index].id), ROUTES[index + 1]);
  }
  assert.equal(nextRoute(ROUTES.at(-1).id), null);
  assert.equal(nextRoute("unknownRoute"), null);
});
