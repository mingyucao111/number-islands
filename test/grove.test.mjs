import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "../voyage/vendor/three.module.min.js";
import { createGrove } from "../voyage/grove.mjs";

test("Windwood has a physical glide gap and a continuous trail to both seedlights", () => {
  for (const id of ["k", "p12", "p34", "p56", "s1", "s23"]) {
    const grove = createGrove(new THREE.Group(), { route: { id } });
    const path = [[0, 18], [9.5, 18], [9.5, -4], [0, -4], [0, 3], [0, -5.5], [-9, -9], [0, -5.5], [0, -15]];
    for (let i = 1; i < path.length; i++) {
      const [start, finish] = [path[i - 1], path[i]];
      let previous;
      for (let step = 0; step <= 100; step++) {
        const x = THREE.MathUtils.lerp(start[0], finish[0], step / 100);
        const z = THREE.MathUtils.lerp(start[1], finish[1], step / 100);
        assert.equal(grove.canWalk(x, z), true, `Route ${id} blocked at ${x},${z}`);
        const height = grove.heightAt(x, z);
        if (previous !== undefined) assert.ok(Math.abs(previous - height) < 0.24);
        previous = height;
      }
    }
    assert.equal(grove.canWalk(0, 8.7), false);
    assert.equal(grove.canGlide(0, 8.7, 3), true);
    assert.equal(grove.canGlide(16, 8.7, 3), false);
    assert.equal(grove.canGlide(0, 8.7, 0), false);
  }
});

test("Windwood requires two pickups and two plants to reveal its exit", () => {
  const root = new THREE.Group();
  const grove = createGrove(root);
  const positionAt = (x, z) => new THREE.Vector3(x, grove.heightAt(x, z), z);
  const carry = [];
  const player = { setCarried: (object) => carry.push(object) };
  const altar = positionAt(0, -5.5);
  assert.equal(grove.interact(altar, player), false);
  assert.match(grove.getPrompt(positionAt(0, 3))?.label, /Lift the Silver Seedlight/);
  assert.equal(grove.interact(positionAt(0, 3), player), true);
  assert.equal(carry[0]?.isGroup, true);
  assert.equal(grove.getPrompt(positionAt(-9, -9)), null);
  assert.equal(grove.interact(altar, player), true);
  assert.equal(carry[1], null);
  assert.equal(grove.state.complete, false);
  assert.match(grove.getPrompt(positionAt(-9, -9))?.label, /Lift the Amber Seedlight/);
  assert.equal(grove.interact(positionAt(-9, -9), player), true);
  assert.equal(grove.interact(altar, player), true);
  assert.equal(grove.state.complete, true);
  assert.equal(grove.state.deposited, 2);
  assert.equal(grove.getPrompt(altar), null);
  assert.deepEqual(grove.goalForCompass(altar), grove.exit);
  grove.update(1 / 60, 5);
});
