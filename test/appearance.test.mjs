import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "../voyage/vendor/three.module.min.js";
import { APPEARANCE_FIELDS, HERO_PALETTES, defaultAppearance, normalizeAppearance } from "../voyage/appearance.mjs";
import { createFaceRig } from "../voyage/face-rig.mjs";

const heroes = ["gale", "warden", "ember", "tide", "thorn", "echo", "frost"];

test("each hero has its own valid stock look and outfit palette", () => {
  const defaults = heroes.map(defaultAppearance);
  assert.equal(new Set(defaults.map((value) => JSON.stringify(value))).size, heroes.length);
  assert.equal(new Set(heroes.map((id) => HERO_PALETTES[id].body)).size, heroes.length);
  for (const [index, look] of defaults.entries()) {
    assert.deepEqual(Object.keys(look), APPEARANCE_FIELDS.map(({ id }) => id));
    assert.deepEqual(normalizeAppearance(heroes[index], look), look);
    const copy = defaultAppearance(heroes[index]);
    assert.notEqual(copy, look);
    for (const { id, options, swatches } of APPEARANCE_FIELDS) {
      assert.ok(options.length >= 4 && look[id] >= 0 && look[id] < options.length);
      if (swatches) assert.equal(swatches.length, options.length);
    }
  }
  assert.deepEqual(defaultAppearance("missing"), defaultAppearance("gale"));
});

test("appearance restores bounded indices only and drops unexpected network or save fields", () => {
  const malicious = Object.assign(Object.create({ face: 2 }), { skin: 1, hair: -1, eyeColor: 999, eyes: 1.9,
    mark: 0, hairColor: "2", brows: Infinity, mouth: null, privateNote: "ignore" });
  const fallback = defaultAppearance("frost");
  assert.deepEqual(normalizeAppearance("frost", malicious), { ...fallback, skin: 1, mark: 0 });
  assert.deepEqual(normalizeAppearance("frost", [1, 2, 3]), fallback);
  assert.deepEqual(normalizeAppearance("frost", null), fallback);
  assert.deepEqual(normalizeAppearance("frost", JSON.parse(JSON.stringify(fallback))), fallback);
});

test("the reusable face rig is centered, changes front features, and disposes replaced geometry and materials", () => {
  const rig = createFaceRig({ hero: "gale" });
  const head = rig.root.getObjectByName("Face skin");
  const eyes = rig.root.getObjectsByProperty("name", "Iris");
  assert.equal(eyes.length, 2);
  rig.root.updateMatrixWorld(true);
  assert.ok(eyes.every((eye) => eye.getWorldPosition(new THREE.Vector3()).z < -.2));
  const originalColor = head.material.color.getHex();
  let released = 0;
  head.geometry.addEventListener("dispose", () => released++);
  head.material.addEventListener("dispose", () => released++);
  rig.setAppearance("gale", { ...defaultAppearance("gale"), face: 3, skin: 6 });
  assert.equal(released, 2);
  const next = rig.root.getObjectByName("Face skin");
  assert.notEqual(next, head);
  assert.notEqual(next.material.color.getHex(), originalColor);
  const extent = new THREE.Box3().setFromObject(rig.root).getSize(new THREE.Vector3());
  assert.ok(extent.x > .5 && extent.y > .55 && extent.z > .45);
  rig.setAppearance("gale", { ...defaultAppearance("gale"), face: 3, skin: 6 });
  assert.equal(rig.root.getObjectByName("Face skin"), next);
  rig.dispose();
  assert.equal(rig.root.children.length, 0);
});
