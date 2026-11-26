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

test("doubles has four fixed starts and each remote fighter has an independent state", () => {
  const starts = [
    { x: -2.3, z: 5, yaw: 0 }, { x: 2.3, z: 5, yaw: 0 },
    { x: 2.3, z: -5, yaw: Math.PI }, { x: -2.3, z: -5, yaw: Math.PI },
  ];
  starts.forEach((start, side) => {
    const root = new THREE.Group();
    const arena = createDuelArena(root, { side, teamMode: true });
    assert.deepEqual(arena.spawn, start);
    assert.equal(root.getObjectByName("Arena fighter " + side), undefined);
    starts.forEach((remoteStart, remoteSide) => {
      if (remoteSide === side) return;
      const fighter = root.getObjectByName("Arena fighter " + remoteSide);
      assert.deepEqual(fighter.position.toArray(), [remoteStart.x, 0, remoteStart.z]);
      assert.equal(fighter.rotation.y, remoteStart.yaw);
      const role = Math.floor(side / 2) === Math.floor(remoteSide / 2) ? "Ally beacon" : "Opponent beacon";
      assert.ok(fighter.getObjectByName(role));
    });
  });

  const root = new THREE.Group();
  const arena = createDuelArena(root, { side: 0, teamMode: true, reduceMotion: true });
  const ally = root.getObjectByName("Arena fighter 1");
  const foeOne = root.getObjectByName("Arena fighter 2");
  const foeTwo = root.getObjectByName("Arena fighter 3");
  arena.setFighter(1, { x: 4, z: 4, hero: "ember", targeted: true });
  arena.setFighter(2, { x: 1, z: -1, hero: "gale", targeted: true, down: false });
  arena.setFighter(3, { x: -3, z: -3, down: true, targeted: true });
  arena.playCast("wave", { x: 4, z: -4 }, 2);
  arena.update(0.1, 0.1);
  assert.ok(ally.position.x > 2.3 && ally.position.x < 4);
  assert.ok(foeOne.position.z > -5 && foeOne.position.z < -1);
  assert.ok(foeTwo.position.x < -2.3 && foeTwo.position.x > -3);
  assert.equal(ally.getObjectByName("Selected target"), undefined);
  assert.equal(foeOne.getObjectByName("Selected target").visible, true);
  assert.equal(foeTwo.getObjectByName("Selected target").visible, false);
  assert.equal(foeTwo.getObjectByName("Opponent beacon").visible, false);
  assert.ok(foeTwo.children[0].rotation.z > 0.5);
  assert.notEqual(foeOne.getObjectByName("Casting arm").rotation.x, foeTwo.getObjectByName("Casting arm").rotation.x);
});

test("new heroes have matched uniforms and remote faces take bounded appearance updates", () => {
  const root = new THREE.Group();
  const looks = [{ side: 1, hero: "tide", appearance: { skin: 0 } }, { side: 2, hero: "thorn" }, { side: 3, hero: "echo" }];
  const arena = createDuelArena(root, { side: 0, teamMode: true, roster: looks });
  const tide = root.getObjectByName("Arena fighter 1");
  const thorn = root.getObjectByName("Arena fighter 2");
  const echo = root.getObjectByName("Arena fighter 3");
  const coat = fighter => fighter.getObjectByName("Guardian coat").material.color.getHex();
  assert.equal(new Set([coat(tide), coat(thorn), coat(echo)]).size, 3);
  const face = tide.getObjectByName("Guardian face");
  const hand = tide.getObjectByName("Guardian hand");
  assert.ok(face?.isGroup);
  const before = hand.material.color.getHex();
  arena.setFighter(1, { x: 4, z: 4, appearance: { skin: 6, hair: 6 } });
  assert.notEqual(hand.material.color.getHex(), before);
  const dark = hand.material.color.getHex();
  for (let i = 0; i < 50; i++) arena.setFighter(1, { x: 4, z: 4, hero: "tide", appearance: { skin: 6, hair: 6 } });
  assert.equal(tide.getObjectByName("Guardian face"), face);
  assert.equal(hand.material.color.getHex(), dark);
  arena.setFighter(1, { hero: "frost", appearance: { skin: 1000 } });
  assert.notEqual(hand.material.color.getHex(), dark);
  assert.equal(new Set([coat(tide), coat(thorn), coat(echo)]).size, 3);
});
