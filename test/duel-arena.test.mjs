import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "../voyage/vendor/three.module.min.js";
import { createDuelArena } from "../voyage/duel-arena.mjs";

test("the duel arena shares mirrored starts and a stable world boundary", () => {
  const front = createDuelArena(new THREE.Group(), { side: 0 });
  const back = createDuelArena(new THREE.Group(), { side: 1 });
  assert.deepEqual(front.spawn, { x: 0, z: 5, yaw: 0 });
  assert.deepEqual(back.spawn, { x: 0, z: -5, yaw: Math.PI });
  assert.equal(front.heightAt(0, 0), 0);
  for (const [x, z, inside] of [[3.8, 7, true], [-7, 7, true], [0, 12.1, false], [-40, 0, false], [Infinity, 3, false]]) {
    assert.equal(front.canWalk(x, z), inside);
    assert.equal(back.canWalk(-x, -z), inside);
  }
});

test("rival interpolates and rejects invalid movement while the effect pool remains bounded", () => {
  const root = new THREE.Group();
  const arena = createDuelArena(root, { side: 0, rivalHero: "gale" });
  const rival = root.getObjectByName("Rival guardian");
  assert.equal(rival.position.z, -5);
  arena.setRival({ x: 7, z: -4, hero: "ember", move: "dash" });
  arena.update(0.07, 0.1);
  assert.ok(rival.position.x > 0 && rival.position.x < 7);
  const newX = rival.position.x;
  arena.setRival({ x: Infinity, z: Infinity });
  arena.update(0.07, 0.17);
  assert.ok(rival.position.x > newX && rival.position.x < 7);
  const count = () => {
    let n = 0;
    root.traverse(() => n++);
    return n;
  };
  const nodes = count();
  const effects = ["strike", "heal", "shield", "dash", "burn"];
  for (let index = 0; index < 100; index++) {
    arena.pulse({ kind: effects[index % 5], side: index % 2, hero: "ember", target: { x: 3, z: 0 }, origin: { x: -2, z: 3 } });
    arena.update(0.02, index * 0.02 + 0.2);
  }
  assert.equal(count(), nodes);
  assert.ok(Number.isFinite(rival.rotation.y));
});

function attack(id, options = {}) {
  return { id, side: 0, slot: 0, hero: "gale", style: "bolt", x: -1, z: 3, radius: 0.48,
    directionX: 0, directionZ: -1, origin: { x: -1, z: 3 }, destination: { x: -1, z: -8 },
    progress: 0, seconds: 1.35, phase: "windup", ...options };
}

function visibleHazards(root) {
  const result = [];
  root.traverse((item) => {
    if (item.name === "Spell footprint" && item.visible) result.push(item);
  });
  return result;
}

test("spell visuals preserve identity, align to real radius and clear stale hazards", () => {
  const root = new THREE.Group();
  const arena = createDuelArena(root);
  arena.setAttacks([attack(7), attack(7, { x: 12 })]);
  arena.update(0.01, 0.1);
  const [sameView] = visibleHazards(root);
  assert.equal(visibleHazards(root).length, 1);
  assert.equal(sameView.userData.phase, "windup");
  assert.equal(sameView.position.x, -1);
  assert.equal(sameView.children[0].scale.x, 0.48);
  assert.equal(sameView.children[2].visible, true);
  arena.setAttacks([attack(7, { z: -3.2, progress: 0.39, seconds: 0.62, phase: "projectile" }),
    attack(8, { hero: "ember", style: "wave", radius: 1.21, phase: "projectile" })]);
  arena.update(0.01, 0.2);
  assert.equal(visibleHazards(root).length, 2);
  assert.equal(visibleHazards(root).find((item) => item.userData.attackId === 7), sameView);
  assert.equal(sameView.position.z, -3.2);
  assert.equal(sameView.children[2].visible, false);
  assert.equal(visibleHazards(root).find((item) => item.userData.attackId === 8).children[0].scale.x, 1.21);
  arena.setAttacks([attack(8, { radius: Infinity })]);
  assert.equal(visibleHazards(root).length, 0);
});

test("reduced motion keeps the area boundary and a readable shrinking countdown", () => {
  const root = new THREE.Group();
  const arena = createDuelArena(root, { reduceMotion: true });
  const storm = attack(9, { style: "area", phase: "telegraph", x: 5, z: -5, radius: 2.8, seconds: 1.6 });
  arena.setAttacks([storm]);
  arena.update(0.016, 0.2);
  const [view] = visibleHazards(root);
  const footprint = view.children[0];
  const indicator = footprint.children[3];
  const before = indicator.scale.x;
  arena.setAttacks([{ ...storm, progress: 0.65, seconds: 0.56 }]);
  arena.update(0.016, 0.3);
  assert.equal(view.position.x, 5);
  assert.equal(view.position.z, -5);
  assert.equal(footprint.scale.x, storm.radius);
  assert.ok(indicator.scale.x < before);
  assert.equal(indicator.visible, true);
  arena.setAttacks(Array.from({ length: 40 }, (_, index) => attack(index + 1)));
  assert.equal(visibleHazards(root).length, 12);
  arena.setAttacks([]);
  assert.equal(visibleHazards(root).length, 0);
});
