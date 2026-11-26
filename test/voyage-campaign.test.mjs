import assert from "node:assert/strict";
import test from "node:test";
import { campaignXP, chooseTrack, currentTrack, finishChapter, openCampaign, replayTrack, returnHome, travelSkills } from "../voyage/campaign.mjs";

test("chapters unlock wind abilities in order, ending at the Guardian rank threshold", () => {
  const first = openCampaign(null);
  assert.equal(first.chosen, "k");
  assert.deepEqual(travelSkills(first), { glide: false, lift: false });
  assert.equal(finishChapter(first, "summit").campaign, first);
  const coast = finishChapter(first, "coast");
  assert.equal(coast.gained, 60);
  assert.deepEqual(travelSkills(coast.campaign), { glide: true, lift: false });
  const grove = finishChapter(coast.campaign, "grove");
  assert.equal(grove.gained, 100);
  assert.deepEqual(travelSkills(grove.campaign), { glide: true, lift: true });
  const end = finishChapter(grove.campaign, "summit");
  assert.equal(end.gained, 140);
  assert.equal(campaignXP(end.campaign), 300);
  assert.equal(currentTrack(end.campaign).checkpoint, 3);
});

test("return and replay keep the player's growth and never award a chapter twice", () => {
  const progress = openCampaign({ chosen: "k", routes: { k: { best: 3, checkpoint: 3 } } });
  const home = returnHome(progress);
  assert.ok(openCampaign(JSON.parse(JSON.stringify(home))).home);
  const replay = replayTrack(home);
  assert.equal(replay.home, false);
  assert.deepEqual(currentTrack(replay), { best: 3, checkpoint: 0 });
  assert.equal(campaignXP(replay), 300);
  assert.equal(finishChapter(replay, "coast").gained, 0);
  assert.equal(replayTrack(replay), replay);
});

test("the waystones choose separate checkpoints and preserve lasting abilities", () => {
  const prior = openCampaign({ chosen: "s23", routes: { s23: { best: 2, checkpoint: 2 } } });
  const selected = chooseTrack(prior, "p12");
  assert.deepEqual(currentTrack(selected), { best: 0, checkpoint: 0 });
  assert.deepEqual(travelSkills(selected), { glide: true, lift: true });
  assert.equal(currentTrack(chooseTrack(selected, "s23")).checkpoint, 2);
  assert.equal(chooseTrack(selected, "bad-route"), selected);
  assert.equal(openCampaign(null, "p34").chosen, "p34");
});

test("a player who restored the lighthouse in the first release keeps their XP and starts in Windwood", () => {
  const legacy = { chosen: "k", steps: { k: ["weights", "lens", "beacon", "complete"] } };
  const migrated = openCampaign(null, legacy);
  assert.deepEqual(currentTrack(migrated), { best: 1, checkpoint: 1 });
  assert.equal(campaignXP(migrated), 100);
  assert.deepEqual(travelSkills(migrated), { glide: true, lift: false });
  assert.equal(campaignXP(openCampaign(JSON.parse(JSON.stringify(migrated)), legacy)), 100);
});
