export const ROUTES = Object.freeze([
  defineRoute("k", "K1–K2", "Pebble Path", [1, 2, 1], 3),
  defineRoute("p12", "P1–P2", "Shore Watch", [2, 3, 1], 5),
  defineRoute("p34", "P3–P4", "Tidekeeper", [3, 4, 2], 6),
  defineRoute("p56", "P5–P6", "Reef Runner", [4, 9, 5], 13),
  defineRoute("s1", "Sec 1", "Windward", [6, 8, 3], 14),
  defineRoute("s23", "Sec 2–3", "Far Beacon", [7, 11, 5], 16),
]);

const milestones = Object.freeze({ weights: 10, lens: 20, beacon: 25, complete: 45 });
const rankTable = Object.freeze([
  { name: "Wayfarer", threshold: 0 },
  { name: "Shore Scout", threshold: 25 },
  { name: "Lantern Keeper", threshold: 75 },
  { name: "Wind Rider", threshold: 150 },
  { name: "Beacon Guardian", threshold: 300 },
]);

function defineRoute(id, grade, name, marks, target) {
  return Object.freeze({ id, grade, name, marks: Object.freeze(marks), target });
}

export function nextRoute(id) {
  const index = ROUTES.findIndex((route) => route.id === id);
  return index === -1 ? null : (ROUTES[index + 1] ?? null);
}

export function restoreProgress(raw) {
  const chosen = ROUTES.find((route) => route.id === raw?.chosen) ?? ROUTES[0];
  const steps = {};
  for (const route of ROUTES) {
    const list = raw?.steps?.[route.id];
    if (Array.isArray(list)) {
      steps[route.id] = [...new Set(list.filter((step) => typeof step === "string" && Object.hasOwn(milestones, step)))];
    }
  }
  return { chosen: chosen.id, steps };
}

export function totalExperience(progress) {
  return ROUTES.reduce((total, route) => total + (progress.steps[route.id] ?? []).reduce((sum, step) => sum + milestones[step], 0), 0);
}

export function rankFor(xp) {
  return rankTable.findLast(({ threshold }) => xp >= threshold) ?? rankTable[0];
}

export function earnMilestone(progress, route, milestone) {
  if (!ROUTES.some(({ id }) => id === route) || !Object.hasOwn(milestones, milestone)) return { progress, earned: 0 };
  const recorded = progress.steps[route] ?? [];
  if (recorded.includes(milestone)) return { progress, earned: 0 };
  return { progress: { ...progress, steps: { ...progress.steps, [route]: [...recorded, milestone] } }, earned: milestones[milestone] };
}
