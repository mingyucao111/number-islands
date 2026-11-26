import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "../voyage/vendor/three.module.min.js";
import { createPlayer } from "../voyage/player.mjs";

function simulate(world, spawn = { x: 0, z: 2 }) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  const document = new EventTarget();
  const events = new EventTarget();
  document.querySelector = () => null;
  document.defaultView = events;
  const canvas = new EventTarget();
  canvas.ownerDocument = document;
  const player = createPlayer({ scene, camera, canvas, world, spawn });
  return {
    player,
    press(code, on = true) {
      const event = new Event(on ? "keydown" : "keyup", { cancelable: true });
      Object.defineProperty(event, "code", { value: code });
      events.dispatchEvent(event);
    },
    frames(count) {
      for (let frame = 0; frame < count; frame++) player.update(1 / 60);
    },
  };
}

test("jump cannot cross a locked gate and a region reset becomes the new starting point", () => {
  let gateOpen = false;
  const world = {
    canWalk(x, z) { return Math.abs(x) < 8 && Math.abs(z) < 12 && (z > 0 || gateOpen); },
    heightAt(_, z) { return Math.min(1.6, Math.max(0, -z * 0.42)); },
  };
  const { player, press, frames } = simulate(world);
  player.setWindGlide(true);
  press("KeyW");
  press("Space");
  frames(34);
  assert.ok(player.position.z > 0 && player.position.z < 0.1);
  gateOpen = true;
  frames(75);
  assert.ok(player.position.z < -2 && player.position.y > 0.8);
  player.reset({ x: 1, z: 4, yaw: Math.PI / 2 });
  assert.deepEqual(player.position.toArray(), [1, 0, 4]);
  press("KeyW");
  frames(13);
  assert.ok(player.position.x < 0.5);
  player.reset();
  assert.deepEqual(player.position.toArray(), [1, 0, 4]);
  assert.throws(() => player.reset({ z: 19 }), /walkable ground/);
  assert.deepEqual(player.position.toArray(), [1, 0, 4]);
  player.setEnabled(false);
  press("KeyW");
  press("KeyE");
  frames(15);
  assert.deepEqual(player.position.toArray(), [1, 0, 4]);
  assert.equal(player.takeInteract(), false);
  player.dispose();
});

test("intentionally flying over a wide creek can fall and recover at the last safe location", () => {
  const terrain = {
    canWalk(x, z) { return Math.abs(x) < 6 && (z >= 0 || z <= -12); },
    canGlide(x, z, y) { return Math.abs(x) < 2 && z < 0 && z > -12 && y > -1; },
    heightAt(_, z) { return z >= 0 || z <= -12 ? 0 : NaN; },
  };
  const { player, press, frames } = simulate(terrain, { x: 0, z: 0.6 });
  press("KeyW");
  press("Space");
  frames(27);
  assert.ok(player.position.z >= 0, "glide permission should be required");
  player.reset();
  player.setWindGlide(true);
  press("KeyW");
  frames(20);
  assert.ok(player.position.z >= 0, "walking must not enter the creek");
  const edge = player.position.z;
  press("Space");
  frames(16);
  assert.ok(player.position.z < -0.4 && player.position.y > 0.35, "the jump must cross into the creek");
  press("KeyW", false);
  press("Space", false);
  frames(90);
  assert.equal(player.takeRecovery(), true);
  assert.equal(player.takeRecovery(), false);
  assert.deepEqual(player.position.toArray(), [0, 0, edge]);
  player.dispose();
});

test("a powered updraft lets the player glide to a higher terrace and has a height cap", () => {
  const terrain = {
    canWalk(x, z) { return Math.abs(x) < 6 && (z >= 0 || z <= -2.8); },
    canGlide(x, z, y) { return Math.abs(x) < 2 && z < 0 && z > -2.8 && y > 0.35; },
    heightAt(_, z) { return z <= -2.8 ? 4.5 : 0; },
    windAt(x, z) { return Math.abs(x) < 2 && z > -1 ? 5.7 : 0; },
  };
  const { player, press, frames } = simulate(terrain);
  player.setWindGlide(true);
  press("Space");
  frames(90);
  assert.equal(player.position.y, 0, "lift is a separate unlock");
  player.reset();
  player.setWindLift(true);
  press("Space");
  frames(180);
  assert.ok(player.position.y > 8.9 && player.position.y <= 9.001);
  press("KeyW");
  frames(82);
  assert.ok(player.position.z < -2.8 && player.position.y > 4.5);
  press("KeyW", false);
  press("Space", false);
  frames(90);
  assert.ok(player.position.z < -2.8 && player.position.y === 4.5);
  assert.equal(player.takeRecovery(), false);
  player.dispose();
});

test("arena dodge follows held movement and respects terrain", () => {
  const ground = { canWalk: (x, z) => Math.abs(x) < 2 && Math.abs(z) < 6, heightAt: () => 0 };
  const { player, press, frames } = simulate(ground);
  press("KeyD");
  assert.equal(player.dodge(), true);
  press("KeyD", false);
  frames(18);
  assert.ok(player.position.x > 1.5 && player.position.x < 2);
  assert.equal(player.position.z, 2);
  player.reset();
  assert.equal(player.dodge(), true);
  frames(18);
  assert.ok(player.position.z > 4);
  player.setEnabled(false);
  assert.equal(player.dodge(), false);
  player.dispose();
});
