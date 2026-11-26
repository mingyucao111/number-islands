import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "../voyage/vendor/three.module.min.js";
import { createSummit } from "../voyage/summit.mjs";

const east = { x: 5.5, y: 0, z: 12 };
const west = { x: -5.5, y: 0, z: 10 };
const launch = { x: 0, y: 0, z: 1 };
const sunstone = { x: -3, y: 4.5, z: -8.5 };
const beacon = { x: 0, y: 4.5, z: -14.1 };

function session(route) {
  const root = new THREE.Group();
  const player = {
    cargo: null,
    setCarried(object) { this.cargo = object; },
  };
  return { root, player, summit: createSummit(root, { route }) };
}

function trimVanes(summit, player) {
  assert.equal(summit.interact(east, player), true);
  assert.equal(summit.interact(west, player), true);
  assert.equal(summit.interact(west, player), true);
}

test("trimming both vanes exposes a wind lane over the gap to the raised terrace", () => {
  const { summit, player } = session();
  assert.deepEqual(summit.spawn, { x: 0, z: 20, yaw: 0 });
  assert.equal(summit.state.stage, "vanes");
  assert.equal(summit.windAt(launch.x, launch.z), 0);
  assert.equal(summit.canGlide(0, -3, 5), false);
  for (const location of [summit.spawn, east, west, launch, sunstone, beacon]) {
    assert.equal(summit.canWalk(location.x, location.z), true);
  }
  assert.equal(summit.canWalk(0, -3), false);
  assert.equal(summit.heightAt(launch.x, launch.z), 0);
  assert.equal(summit.heightAt(sunstone.x, sunstone.z), 4.5);
  assert.match(summit.getPrompt(east).label, /east vane/);
  trimVanes(summit, player);
  assert.equal(summit.state.stage, "ascent");
  assert.equal(summit.state.wind, true);
  assert.equal(summit.getPrompt(east), null);
  assert.ok(summit.windAt(0, 1) >= 5);
  assert.equal(summit.windAt(6, 1), 0);
  assert.equal(summit.canGlide(0, -3, 5), true);
  assert.equal(summit.canGlide(8, -3, 5), false);
  assert.deepEqual(summit.goalForCompass(launch), launch);
  assert.deepEqual(summit.goalForCompass({ ...launch, y: 5 }), sunstone);
});

test("the sunstone is physical cargo, and lighting Highwatch opens the return arch", () => {
  const { root, summit, player } = session();
  assert.equal(summit.interact(sunstone, player), false);
  trimVanes(summit, player);
  assert.equal(summit.getPrompt({ ...sunstone, y: 0 }), null);
  assert.match(summit.getPrompt(sunstone).label, /Lift the sunstone/);
  assert.equal(summit.interact(beacon, player), false);
  assert.equal(summit.interact(sunstone, player), true);
  assert.equal(summit.state.stage, "beacon");
  assert.equal(player.cargo, root.getObjectByName("Highwatch sunstone"));
  assert.equal(summit.interact(beacon, player), true);
  assert.equal(player.cargo, null);
  assert.equal(summit.state.complete, true);
  assert.equal(summit.state.returning, false);
  assert.equal(summit.state.stage, "complete");
  assert.ok(summit.canWalk(summit.exit.x, summit.exit.z));
  assert.match(summit.getPrompt(summit.exit).label, /Return to Alderreach/);
  assert.equal(summit.interact(summit.exit, player), true);
  assert.equal(summit.state.returning, true);
  assert.doesNotThrow(() => summit.update(0.016, 5));
});

test("older routes require more vane turns and restoring victory rebuilds all physical state", () => {
  const { root, summit, player } = session({ id: "s23", target: 16 });
  trimVanes(summit, player);
  assert.equal(summit.state.stage, "vanes");
  assert.equal(summit.state.vanes, 0);
  assert.equal(summit.windAt(0, 1), 0);
  assert.equal(summit.interact(east, player), true);
  assert.equal(summit.interact(west, player), true);
  assert.equal(summit.state.stage, "ascent");
  summit.restoreComplete();
  assert.equal(summit.state.vanes, 2);
  assert.equal(summit.state.complete, true);
  assert.equal(summit.state.returning, false);
  assert.equal(summit.state.carried, null);
  assert.equal(summit.getPrompt(sunstone), null);
  assert.match(summit.getPrompt(summit.exit).label, /Return to Alderreach/);
  assert.equal(root.getObjectByName("Highwatch sunstone").parent.position.y, 4.5);
  summit.interact(summit.exit, player);
  summit.restoreComplete();
  assert.equal(summit.state.returning, false);
});
