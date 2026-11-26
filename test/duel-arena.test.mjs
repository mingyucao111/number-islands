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
