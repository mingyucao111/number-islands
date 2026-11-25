import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "../voyage/vendor/three.module.min.js";
import { createQuest } from "../voyage/mission.mjs";
import { ROUTES } from "../voyage/progression.mjs";
import { buildWorld } from "../voyage/world.mjs";

const keeper = { x: 0, y: 0, z: 17 };
const winch = { x: 3, y: 0, z: 1 };
const lens = { x: 5, y: 0, z: -13 };
const beacon = { x: -10, y: 4.5, z: -23 };
const weightLocations = [
  { x: -5, y: 0, z: 10 },
  { x: 7, y: 0, z: 9 },
  { x: -6, y: 0, z: 3 },
];

function game(profile) {
  const scene = new THREE.Scene();
  const player = {
    hand: null,
    setCarried(object) {
      if (this.hand) scene.attach(this.hand);
      this.hand = object;
    },
  };
  const quest = createQuest({
    scene,
    profile,
    world: {
      canWalk: () => true,
      heightAt: (x, z) => x <= -8 && z <= -22 ? 4.5 : 0,
    },
  });
  return { scene, player, quest };
}

test("The Last Light can be completed by carrying cargo, crossing the open gate and seating the lens", () => {
  const { scene, player, quest } = game();
  const stage = () => quest.state.stage;
  assert.equal(stage(), "meet");
  assert.equal(quest.getPrompt({ x: 0, y: 0, z: 24 }), null);
  assert.equal(quest.canPass(0, -5), false);
  assert.equal(quest.interact(lens, player), false);
  assert.match(quest.getPrompt(keeper).label, /Keeper Nessa/);
  assert.equal(quest.interact(keeper, player), true);
  assert.equal(stage(), "weights");
  for (const index of [0, 1]) {
    assert.equal(quest.interact(weightLocations[index], player), true);
    assert.equal(quest.state.carriedMarks, index + 2);
    assert.equal(player.hand, scene.getObjectByName("weight-" + (index + 2)));
    assert.equal(quest.interact(winch, player), true);
    assert.equal(player.hand, null);
  }
  assert.equal(quest.state.load, 5);
  assert.equal(stage(), "lens");
  assert.equal(quest.canPass(0, -5), true);
  assert.equal(quest.canPass(6, -5), false);
  assert.equal(quest.interact(lens, player), true);
  assert.equal(stage(), "beacon");
  assert.equal(player.hand, scene.getObjectByName("Fresnel Lens"));
  assert.equal(quest.interact({ ...beacon, y: 0 }, player), false);
  assert.equal(quest.interact(beacon, player), true);
  assert.equal(player.hand, null);
  assert.equal(stage(), "complete");
  assert.equal(scene.getObjectByName("Fresnel Lens").parent.name, "Beacon Lens Mount");
  assert.equal(quest.goalForCompass(), null);
  assert.doesNotThrow(() => quest.update(0.016, 1));
});

test("A player can undo an overweight load and recover by setting a weight down", () => {
  const { player, quest } = game();
  quest.interact(keeper, player);
  for (const index of [0, 2, 1]) {
    quest.interact(weightLocations[index], player);
    quest.interact(winch, player);
  }
  assert.equal(quest.state.load, 6);
  assert.equal(quest.canPass(0, -5), false);
  assert.match(quest.getPrompt(winch).label, /Take the last weight/);
  quest.interact(winch, player);
  assert.equal(quest.state.carriedMarks, 3);
  const west = { x: 1, y: 0, z: 4 };
  quest.interact(west, player);
  assert.equal(quest.state.carried, null);
  quest.interact(winch, player);
  assert.equal(quest.state.carriedMarks, 1);
  quest.interact({ x: 5, y: 0, z: 4 }, player);
  quest.interact(west, player);
  quest.interact(winch, player);
  assert.equal(quest.state.load, 5);
  assert.equal(quest.state.gateOpen, true);
});

test("Grade profiles have visually sourced, reachable loads, and route changes reset the gate and cargo", () => {
  const { player, quest } = game();
  for (const route of ROUTES) {
    quest.setProfile(route, player);
    assert.equal(quest.state.profile, route.id);
    assert.equal(quest.state.target, route.target);
    assert.equal(quest.state.load, 0);
    assert.equal(quest.state.gateOpen, false);
    assert.equal(player.hand, null);
    quest.interact(keeper, player);
    const mask = [1, 2, 3, 4, 5, 6, 7].find((candidate) =>
      route.marks.reduce((load, item, index) => load + (candidate & (1 << index) ? item : 0), 0) === route.target);
    assert.ok(mask);
    for (const [index, position] of weightLocations.entries()) {
      if (!(mask & (1 << index))) continue;
      const label = route.marks[index] === 1 ? "one mark" : route.marks[index] + " marks";
      assert.ok(quest.getPrompt(position).label.endsWith(label));
      quest.interact(position, player);
      quest.interact(winch, player);
    }
    assert.equal(quest.state.load, route.target);
    assert.equal(quest.state.gateOpen, true);
  }
  quest.interact(lens, player);
  assert.throws(() => quest.setProfile({ id: "bad", marks: [2, 4, 6], target: 3 }, player), /cannot balance/);
  assert.equal(quest.state.carried, "lens");
  quest.reset(player);
  assert.equal(quest.state.stage, "meet");
  assert.equal(quest.state.carried, null);
  assert.equal(player.hand, null);
});

function reachable(world, gate, start, destination) {
  const edge = 0.5;
  const queue = [start];
  const visited = new Set([start.join(",")]);
  for (let index = 0; index < queue.length; index++) {
    const [x, z] = queue[index];
    if (x === destination[0] && z === destination[1]) return true;
    for (const [dx, dz] of [[0, edge], [0, -edge], [edge, 0], [-edge, 0]]) {
      const [nx, nz] = [x + dx, z + dz];
      const key = [nx, nz].join(",");
      if (visited.has(key) || !world.canWalk(nx, nz) || !gate(nx, nz)) continue;
      if (Math.abs(world.heightAt(x, z) - world.heightAt(nx, nz)) > 0.45) continue;
      visited.add(key);
      queue.push([nx, nz]);
    }
  }
  return false;
}

test("World collision leaves a physical route to every prop and up to the beacon", () => {
  const scene = new THREE.Scene();
  const world = buildWorld(scene);
  const quest = createQuest({ scene, world });
  const player = { setCarried() {} };
  const landing = [0, 24];
  for (const { x, z } of [keeper, ...weightLocations, winch]) {
    assert.ok(reachable(world, quest.canPass, landing, [x, z]), `Cannot reach ${x},${z}`);
  }
  assert.equal(reachable(world, quest.canPass, landing, [lens.x, lens.z]), false);
  quest.interact(keeper, player);
  for (const index of [0, 1]) {
    quest.interact(weightLocations[index], player);
    quest.interact(winch, player);
  }
  assert.ok(reachable(world, quest.canPass, landing, [lens.x, lens.z]));
  assert.ok(reachable(world, quest.canPass, [lens.x, lens.z], [beacon.x, beacon.z]));
  assert.equal(world.heightAt(beacon.x, beacon.z), 4.5);
});
