import { ROUTES, restoreProgress, totalExperience } from "./progression.mjs";

export const CHAPTERS = Object.freeze([
  Object.freeze({ id: "coast", title: "Alderreach Coast", reward: 60 }),
  Object.freeze({ id: "grove", title: "Windwood Basin", reward: 100 }),
  Object.freeze({ id: "summit", title: "Highwatch Summit", reward: 140 }),
]);

const routeIds = new Set(ROUTES.map(({ id }) => id));

export function openCampaign(raw, legacy) {
  const old = restoreProgress(typeof legacy === "string" ? { chosen: legacy } : legacy);
  const chosen = routeIds.has(raw?.chosen) ? raw.chosen : old.chosen;
  const routes = {};
  let carriedXP = 0;
  if (!routeIds.has(raw?.chosen)) {
    let credited = 0;
    for (const id of routeIds) {
      if (old.steps[id]?.includes("complete")) {
        routes[id] = { best: 1, checkpoint: 1 };
        credited += CHAPTERS[0].reward;
      }
    }
    carriedXP = Math.max(0, totalExperience(old) - credited);
  } else if (Number.isInteger(raw.carriedXP) && raw.carriedXP >= 0 && raw.carriedXP <= 600) {
    carriedXP = raw.carriedXP;
  }
  for (const id of routeIds) {
    const track = raw?.routes?.[id];
    if (!track || !Number.isInteger(track.best) || track.best < 0 || track.best > CHAPTERS.length) continue;
    const checkpoint = Number.isInteger(track.checkpoint) && track.checkpoint >= 0 && track.checkpoint <= track.best
      ? track.checkpoint : track.best;
    routes[id] = { best: track.best, checkpoint };
  }
  const home = raw?.home === true && routes[chosen]?.checkpoint === CHAPTERS.length;
  return { chosen, routes, home, carriedXP };
}

export function currentTrack(campaign) {
  return campaign.routes[campaign.chosen] ?? { best: 0, checkpoint: 0 };
}

export function chooseTrack(campaign, route) {
  return routeIds.has(route) && campaign.chosen !== route ? { ...campaign, chosen: route, home: false } : campaign;
}

export function replayTrack(campaign) {
  const track = currentTrack(campaign);
  if (track.checkpoint !== CHAPTERS.length) return campaign;
  return { ...campaign, home: false, routes: { ...campaign.routes, [campaign.chosen]: { ...track, checkpoint: 0 } } };
}

export function returnHome(campaign) {
  return currentTrack(campaign).checkpoint === CHAPTERS.length ? { ...campaign, home: true } : campaign;
}

export function finishChapter(campaign, chapter) {
  const track = currentTrack(campaign);
  const chapterIndex = CHAPTERS.findIndex(({ id }) => id === chapter);
  if (chapterIndex < 0 || chapterIndex !== track.checkpoint) return { campaign, gained: 0 };
  const checkpoint = chapterIndex + 1;
  const best = Math.max(track.best, checkpoint);
  return {
    campaign: { ...campaign, routes: { ...campaign.routes, [campaign.chosen]: { best, checkpoint } } },
    gained: best > track.best ? CHAPTERS[chapterIndex].reward : 0,
  };
}

export function campaignXP(campaign) {
  return (campaign.carriedXP ?? 0) + Object.values(campaign.routes).reduce((xp, { best }) => xp +
    CHAPTERS.slice(0, best).reduce((total, { reward }) => total + reward, 0), 0);
}

export function travelSkills(campaign) {
  const furthest = Math.max(0, ...Object.values(campaign.routes).map(({ best }) => best));
  return { glide: furthest >= 1, lift: furthest >= 2 };
}
