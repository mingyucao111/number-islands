import * as THREE from "./vendor/three.module.min.js";

const SPAWN = Object.freeze({ x: 0, z: 20, yaw: 0 });
const LIFT = { x: 0, z: 1 };
const HIGH = 4.5;
const LENS = { x: -3, z: -8.5 };
const BEACON = { x: 0, z: -14.1 };
const EXIT = Object.freeze({ x: 5.5, y: HIGH, z: -13 });
const VANES = [{ x: 5.5, z: 12, label: "east vane" }, { x: -5.5, z: 10, label: "west vane" }];
const LOW_ISLAND = [
  [-17, 21], [-18.7, 14], [-15.7, 6.4], [-9.6, 3], [-5, -0.5],
  [-3.8, -1.6], [3.9, -1.6], [6.5, 0.5], [12.8, 3.6], [17.6, 10.1],
  [18.1, 18.2], [14, 24], [6, 27.1], [-6, 26.6],
];
const HIGH_ISLAND = [
  [-7.0, -4.5], [6.6, -4.5], [8.2, -8.4], [8.1, -15.6], [4.3, -18.1],
  [-2, -19], [-7.3, -17.2], [-8.5, -11.8], [-8.2, -7.7],
];

function inside(outline, x, z) {
  let within = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const [a, b] = outline[i];
    const [c, d] = outline[j];
    if ((b > z) !== (d > z) && x < (c - a) * (z - b) / (d - b) + a) within = !within;
  }
  return within;
}

const CUBE = new THREE.BoxGeometry();
const DISK = new THREE.CylinderGeometry(1, 1, 1, 12);
const ROCK = new THREE.DodecahedronGeometry(1, 0);
const LEAF = new THREE.ConeGeometry(1, 1, 9);
const GEM = new THREE.IcosahedronGeometry(0.38, 0);

function standard(color) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.87 });
}

function draw(parent, geometry, material, x, y, z, sx, sy, sz) {
  const item = new THREE.Mesh(geometry, material);
  item.position.set(x, y, z);
  item.scale.set(sx, sy, sz);
  parent.add(item);
  return item;
}

function batch(parent, geometry, material, models) {
  if (!models.length) return;
  const instances = new THREE.InstancedMesh(geometry, material, models.length);
  const point = new THREE.Object3D();
  for (const [index, model] of models.entries()) {
    const [x, y, z, sx, sy, sz, rotation = 0, tint] = model;
    point.position.set(x, y, z);
    point.scale.set(sx, sy, sz);
    point.rotation.y = rotation;
    point.updateMatrix();
    instances.setMatrixAt(index, point.matrix);
    if (tint !== undefined) instances.setColorAt(index, new THREE.Color(tint));
  }
  instances.castShadow = true;
  instances.receiveShadow = true;
  parent.add(instances);
}

function makeLand(parent, outline, top, bottom, topColor, sideColor) {
  const points = outline.map(([x, z]) => new THREE.Vector2(x, z));
  const triangles = THREE.ShapeUtils.triangulateShape(points, []);
  const surface = [];
  for (const face of triangles) {
    for (const index of [face[0], face[2], face[1]]) {
      surface.push(points[index].x, top, points[index].y);
    }
  }
  const topGeometry = new THREE.BufferGeometry();
  topGeometry.setAttribute("position", new THREE.Float32BufferAttribute(surface, 3));
  topGeometry.computeVertexNormals();
  const topMaterial = standard(topColor);
  topMaterial.side = THREE.DoubleSide;
  const topMesh = draw(parent, topGeometry, topMaterial, 0, 0, 0, 1, 1, 1);
  topMesh.receiveShadow = true;

  const bank = [];
  const colors = [];
  const clear = new THREE.Color(sideColor);
  for (const [index, [x, z]] of outline.entries()) {
    const [nx, nz] = outline[(index + 1) % outline.length];
    const split = top - Math.min(0.52, (top - bottom) / 3);
    for (const [upper, lower, darkness] of [[top, split, 1.00], [split, bottom, 0.68]]) {
      bank.push(x, upper, z, x, lower, z, nx, upper, nz,
        x, lower, z, nx, lower, nz, nx, upper, nz);
      const color = clear.clone().multiplyScalar(darkness * (0.97 - (index % 3) * 0.09));
      for (let vertex = 0; vertex < 6; vertex++) colors.push(color.r, color.g, color.b);
    }
  }
  const sides = new THREE.BufferGeometry();
  sides.setAttribute("position", new THREE.Float32BufferAttribute(bank, 3));
  sides.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  sides.computeVertexNormals();
  const walls = draw(parent, sides, new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.92, side: THREE.DoubleSide,
  }), 0, 0, 0, 1, 1, 1);
  walls.castShadow = true;
  walls.receiveShadow = true;
}

function randomFrom(seed) {
  let value = seed;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 2 ** 32;
  };
}

function decor(root) {
  const rng = randomFrom(9251);
  const waterMaterial = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } },
    vertexShader: `
      varying vec2 lake;
      void main() {
        lake = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float time;
      varying vec2 lake;
      void main() {
        float waves = sin(lake.x * 0.15 + lake.y * 0.36 + time * 0.82)
          + sin(lake.x * 0.34 - lake.y * 0.57 - time * 0.34);
        float foamy = smoothstep(1.80, 1.99, waves);
        vec3 water = mix(vec3(.32,.62,.55), vec3(.46,.72,.59), smoothstep(-1.7, 1.7, waves));
        float horizon = smoothstep(24.0, 74.0, length(lake));
        gl_FragColor = vec4(mix(water + .20 * foamy,vec3(.66,.79,.65),horizon),1.0);
      }
    `,
  });
  const water = draw(root, new THREE.PlaneGeometry(170, 170), waterMaterial, 0, -0.78, 0, 1, 1, 1);
  water.rotation.x = -Math.PI / 2;
  makeLand(root, LOW_ISLAND, 0, -1.6, 0x95b775, 0x82987a);
  makeLand(root, HIGH_ISLAND, HIGH, -2.0, 0xa0b687, 0x858889);

  // Weathered stone traces connect the two vanes to the wind berth and carry the trail across the roof.
  const tiles = [];
  const edges = [];
  for (let i = 0; i < 22; i++) {
    const z = 20.5 - i * 0.94;
    tiles.push([Math.sin(i * 0.26) * .19, .025, z, 1.72, .08, .87, (rng() - .5) * .08, i % 3 ? 0xb2ad90 : 0xc3bd9e]);
  }
  for (const side of [-1, 1]) {
    for (let i = 1; i < 7; i++) {
      const x = side * i * 0.79;
      tiles.push([x, .035, side === 1 ? 12 + (6 - i) * .13 : 10 + (6 - i) * .17, .72, .08, .80, (rng() - .5) * .1, 0xb7ac8e]);
    }
  }
  for (let i = 0; i < 11; i++) {
    tiles.push([Math.sin(i * .4) * .28, HIGH + .025, -5.32 - i * .92, 1.52, .08, .84, (rng() - .5) * .07, 0xd1c5a5]);
  }
  for (let i = 0; i < 6; i++) {
    tiles.push([i * .9, HIGH + .025, -13.0, .83, .08, .95, .07, 0xbcbea3]);
    if (i < 4) tiles.push([-i * .89, HIGH + .025, -8.5, .84, .08, .91, -.09, 0xbcbea3]);
  }
  for (const side of [-1, 1]) {
    for (let section = 0; section < 16; section++) {
      const z = -7.4 - section * .57;
      const x = side * (side === 1 ? 6.6 : 7.2);
      if (side === 1 && z < -11.4 && z > -14.5) continue;
      edges.push([x, HIGH + .33, z, .46, .67, .56, 0, section % 2 ? 0xb8b7a5 : 0xacae9c]);
    }
  }
  batch(root, CUBE, standard(0xffffff), [...tiles, ...edges]);

  const crowns = [];
  const trunks = [];
  const stones = [];
  const flower = [];
  for (let index = 0; index < 260; index++) {
    const x = (rng() * 2 - 1) * 17.5;
    const z = -18 + rng() * 44;
    const highLand = inside(HIGH_ISLAND, x, z);
    if (!highLand && !inside(LOW_ISLAND, x, z)) continue;
    if (Math.abs(x) < (highLand ? 4.7 : 7.2) && z > -17) continue;
    if (Math.abs(x - EXIT.x) < 1.4 && Math.abs(z - EXIT.z) < 1.65) continue;
    const floor = highLand ? HIGH : 0;
    const weight = 0.36 + rng() * .63;
    if (rng() < .25) {
      trunks.push([x, floor + weight * .6, z, .13 * weight, 1.2 * weight, .13 * weight, 0, 0x8a7863]);
      for (let layer = 0; layer < 3; layer++) {
        const spread = weight * (0.76 - layer * .13);
        crowns.push([x, floor + weight * (1.2 + .47 * layer), z, spread, weight * (1.34 - .19 * layer),
          spread, rng() * 6, layer ? 0x85a36c : 0x6a8a60]);
      }
    } else if (rng() < .6) {
      stones.push([x, floor + weight * .24, z, weight * .74, weight * .52, weight * .67, rng() * 6, 0x9a9d82]);
    } else {
      flower.push([x, floor + .07, z, weight * .16, .07, weight * .16, rng() * 6, index % 2 ? 0xffdd9b : 0xe4ccdc]);
    }
  }
  batch(root, DISK, standard(0xffffff), trunks);
  batch(root, LEAF, standard(0xffffff), crowns);
  batch(root, ROCK, standard(0xffffff), stones);
  batch(root, GEM, standard(0xffffff), flower);
  return waterMaterial;
}

function makesVane(root, spec, stone, metal, previousTurns) {
  const pole = new THREE.Group();
  pole.position.set(spec.x, 0, spec.z);
  root.add(pole);
  draw(pole, DISK, stone, 0, .14, 0, .78, .28, .78);
  draw(pole, DISK, metal, 0, 1.18, 0, .10, 2.36, .10);
  const hinge = new THREE.Group();
  hinge.position.y = 2.32;
  pole.add(hinge);
  draw(hinge, CUBE, metal, 0, 0, 0, 2.30, .10, .09);
  const tail = draw(hinge, LEAF, metal, -1.23, 0, 0, .24, .49, .23);
  tail.rotation.z = Math.PI / 2;
  const rotor = new THREE.Group();
  rotor.position.x = .86;
  hinge.add(rotor);
  const cloth = new THREE.MeshStandardMaterial({
    color: 0xd69472, roughness: 0.7, side: THREE.DoubleSide,
  });
  for (let flap = 0; flap < 4; flap++) {
    const pivot = new THREE.Group();
    pivot.rotation.x = flap * Math.PI / 2;
    rotor.add(pivot);
    draw(pivot, CUBE, metal, 0, .34, 0, .055, .71, .057);
    draw(pivot, new THREE.PlaneGeometry(.16, .34), cloth, .095, .44, .013, 1, 1, 1);
  }
  draw(pole, DISK, stone, 0, .35, .33, .26, .38, .26);
  draw(pole, CUBE, metal, .27, .53, .37, .39, .06, .07);
  return { ...spec, hinge, rotor, cloth, remaining: previousTurns, rotation: -previousTurns * Math.PI / 4 };
}

function buildWind(root) {
  const updraft = new THREE.Group();
  updraft.position.set(0, 0, -0.42);
  root.add(updraft);
  const color = 0xe2ffd3;
  const helixMaterial = new THREE.LineBasicMaterial({
    color, transparent: true, opacity: .34, depthWrite: false,
  });
  const spirals = new THREE.Group();
  updraft.add(spirals);
  for (let strand = 0; strand < 4; strand++) {
    const path = [];
    for (let point = 0; point <= 80; point++) {
      const step = point / 80;
      const angle = step * Math.PI * 4 + Math.PI * strand / 2;
      const radius = 1.19 + .92 * Math.sin(Math.PI * step);
      path.push(new THREE.Vector3(Math.sin(angle) * radius, -0.12 + step * 9.1, Math.cos(angle) * radius * 1.42));
    }
    spirals.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(path), helixMaterial));
  }
  const count = 80;
  const positions = new THREE.Float32BufferAttribute(new Float32Array(count * 3), 3);
  positions.setUsage(THREE.DynamicDrawUsage);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", positions);
  const motes = new THREE.Points(geometry, new THREE.PointsMaterial({
    color: 0xf0fff1, size: 0.11, transparent: true, opacity: 0.84, depthWrite: false,
  }));
  motes.frustumCulled = false;
  updraft.add(motes);
  const rng = randomFrom(281);
  const seeds = Array.from({ length: count }, () => [rng() * 9.25, rng() * Math.PI * 2, .9 + rng() * 1.2]);
  updraft.visible = false;
  return {
    show(visible) { updraft.visible = visible; },
    update(time) {
      if (!updraft.visible) return;
      spirals.rotation.y = time * .38;
      for (const [index, [height, orientation, radius]] of seeds.entries()) {
        const y = (height + time * (3.25 + radius * .45)) % 9.25;
        const angle = orientation + y * .59 + time * .95;
        positions.setXYZ(index, Math.sin(angle) * radius, y, Math.cos(angle) * radius * 1.42);
      }
      positions.needsUpdate = true;
    },
  };
}

function buildAltar(root, stone, metal) {
  const altar = new THREE.Group();
  altar.position.set(BEACON.x, HIGH, BEACON.z);
  root.add(altar);
  draw(altar, DISK, stone, 0, .13, 0, 1.47, .25, 1.47);
  draw(altar, DISK, stone, 0, .40, 0, 1.08, .27, 1.08);
  draw(altar, DISK, metal, 0, .64, 0, .81, .25, .81);
  const pearl = new THREE.MeshStandardMaterial({
    color: 0xeace79, emissive: 0xffc552, emissiveIntensity: 0.06, roughness: .24,
  });
  draw(altar, DISK, pearl, 0, .81, 0, .59, .11, .59);

  for (const side of [-1, 1]) {
    draw(altar, DISK, stone, side * 1.9, .21, -.78, .38, .42, .38);
    draw(altar, DISK, metal, side * 1.9, 1.27, -.78, .13, 2.12, .13);
    draw(altar, GEM, pearl, side * 1.9, 2.58, -.78, .63, .63, .63);
  }
  const flame = draw(altar, GEM, pearl, 0, 1.59, 0, 1.33, 1.68, 1.33);
  flame.visible = false;
  const shine = new THREE.PointLight(0xffdf8c, 0, 23, 1.5);
  shine.position.y = 1.78;
  altar.add(shine);
  const beamMaterial = new THREE.MeshBasicMaterial({
    color: 0xffdf89, transparent: true, opacity: 0, depthWrite: false,
    side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  });
  const beam = draw(altar, new THREE.ConeGeometry(1.7, 19, 24, 1, true),
    beamMaterial, 0, 10.34, 0, 1, 1, 1);
  beam.rotation.z = Math.PI;
  const arch = new THREE.Group();
  arch.position.set(EXIT.x, EXIT.y, EXIT.z);
  arch.rotation.y = -.16;
  root.add(arch);
  for (const side of [-1, 1]) {
    draw(arch, CUBE, stone, side * .94, .21, 0, .53, .42, .64);
    draw(arch, CUBE, stone, side * .94, 1.24, 0, .37, 2.10, .45);
  }
  for (let index = 0; index <= 8; index++) {
    const angle = index * Math.PI / 8;
    const block = draw(arch, CUBE, stone, .94 * Math.cos(angle), 2.12 + .86 * Math.sin(angle), 0, .33, .37, .47);
    block.rotation.z = angle;
  }
  const returnRune = draw(arch, GEM, pearl, 0, 2.33, .26, 1.07, 1.07, 1.07);
  const boundary = new THREE.Mesh(new THREE.RingGeometry(0.78, 0.86, 24),
    new THREE.MeshBasicMaterial({ color: 0xffe293, transparent: true, opacity: 0.59, side: THREE.DoubleSide, depthWrite: false }));
  boundary.rotation.x = -Math.PI / 2;
  boundary.position.y = .09;
  arch.add(boundary);
  arch.visible = false;
  return { altar, pearl, flame, shine, beam, beamMaterial, arch, returnRune };
}

export function createSummit(root, { route } = {}) {
  const water = decor(root);
  const stone = standard(0xbfc1a6);
  const metal = standard(0x617771);
  const brass = standard(0xb8a065);
  const stronger = Number(route?.target) >= 10;
  const vanes = VANES.map((spec, index) => makesVane(root, spec, stone, metal, stronger ? index + 2 : index + 1));
  const wind = buildWind(root);
  const altar = buildAltar(root, stone, brass);

  const plinth = new THREE.Group();
  plinth.position.set(LENS.x, HIGH, LENS.z);
  root.add(plinth);
  draw(plinth, DISK, stone, 0, .12, 0, .55, .22, .55);
  draw(plinth, DISK, metal, 0, .44, 0, .28, .55, .28);
  draw(plinth, DISK, brass, 0, .72, 0, .39, .13, .39);
  const spark = new THREE.Group();
  spark.name = "Highwatch sunstone";
  const gemMaterial = new THREE.MeshStandardMaterial({
    color: 0xffe5a3, emissive: 0xe8a56d, emissiveIntensity: .72, roughness: .26,
  });
  const crystal = draw(spark, GEM, gemMaterial, 0, .38, 0, 1.18, 1.54, 1.18);
  const crown = draw(spark, new THREE.TorusGeometry(.43, .035, 7, 24), brass, 0, .35, 0, 1, 1, 1);
  crown.rotation.x = Math.PI / 2;
  plinth.add(spark);
  spark.position.y = .85;

  const groundRing = new THREE.Mesh(new THREE.RingGeometry(1.45, 1.60, 30),
    new THREE.MeshBasicMaterial({ color: 0xd5d6a2, side: THREE.DoubleSide, transparent: true, opacity: .58 }));
  groundRing.rotation.x = -Math.PI / 2;
  groundRing.position.set(LIFT.x, .07, LIFT.z);
  root.add(groundRing);

  const state = {
    stage: "vanes",
    objective: "Trim the brass wind vanes so they face the updraft.",
    notice: "The high light is dark. Wind can carry you to the terrace.",
    carried: null,
    complete: false,
    returning: false,
    wind: false,
    vanes: 0,
  };
  let light = 0;

  function heightAt(x, z) {
    return inside(HIGH_ISLAND, x, z) ? HIGH : 0;
  }

  function canWalk(x, z) {
    return inside(HIGH_ISLAND, x, z) || inside(LOW_ISLAND, x, z);
  }

  function canGlide(x, z, y) {
    return state.wind && Math.abs(x) <= 5.5 && z >= -6.0 && z <= 2.1 && y >= .1;
  }

  function windAt(x, z) {
    if (!state.wind) return 0;
    const e = Math.max(Math.abs(x) / 2.48, Math.abs(z + .27) / 4.12);
    return e < 1 ? 5.7 * THREE.MathUtils.clamp((1 - e) * 4.25, 0, 1) : 0;
  }

  function location(position) {
    return { x: position.x, y: heightAt(position.x, position.z), z: position.z };
  }

  function close(position, loc, radius) {
    return Math.abs((position.y ?? heightAt(position.x, position.z)) - loc.y) <= 1.3
      && Math.hypot(position.x - loc.x, position.z - loc.z) <= radius;
  }

  function getAction(position) {
    if (!position) return null;
    if (state.stage === "vanes") {
      for (const vane of vanes) {
        const loc = location(vane);
        if (vane.remaining && close(position, loc, 1.7)) return { id: "vane", vane, label: `Turn the ${vane.label}`, loc };
      }
    }
    if (state.stage === "ascent" && close(position, location(LENS), 1.55)) {
      return { id: "lens", label: "Lift the sunstone", loc: location(LENS) };
    }
    if (state.stage === "beacon" && close(position, location(BEACON), 1.55)) {
      return { id: "beacon", label: "Crown the high light", loc: location(BEACON) };
    }
    if (state.complete && close(position, EXIT, 1.55)) {
      return { id: "exit", label: "Return to Alderreach", loc: EXIT };
    }
    return null;
  }

  function getPrompt(position) {
    const action = getAction(position);
    return action ? { label: action.label, loc: action.loc } : null;
  }

  function ignite() {
    altar.altar.add(spark);
    spark.position.set(0, .81, 0);
    spark.rotation.set(0, 0, 0);
    altar.arch.visible = true;
    state.stage = "complete";
    state.complete = true;
    state.carried = null;
    state.objective = "The high light is burning. Follow its arch back to Alderreach.";
    state.notice = "The far islands answer. Highwatch shines again.";
  }

  function align(vane) {
    vane.remaining = 0;
    vane.rotation = 0;
    vane.cloth.color.setHex(0xe8d084);
  }

  function restoreComplete() {
    for (const vane of vanes) align(vane);
    state.vanes = vanes.length;
    state.wind = true;
    state.returning = false;
    wind.show(true);
    ignite();
    light = 1;
    altar.flame.visible = true;
    altar.shine.intensity = 45;
    altar.beamMaterial.opacity = .15;
  }

  function interact(position, player) {
    const action = getAction(position);
    if (!action) return false;
    if (action.id === "vane") {
      const { vane } = action;
      vane.remaining--;
      vane.rotation = -vane.remaining * Math.PI / 4;
      if (vane.remaining === 0) {
        align(vane);
        state.vanes++;
        if (state.vanes === vanes.length) {
          state.stage = "ascent";
          state.wind = true;
          state.objective = "Stand in the wind. Hold jump to rise and steer north onto the high terrace.";
          state.notice = "The vanes are aligned. Ride the updraft to the old terrace.";
          wind.show(true);
        } else {
          state.notice = "This vane is aligned. Find the other one.";
        }
      } else {
        state.notice = "The sails are catching. Keep turning the vane to face the wind.";
      }
    } else if (action.id === "lens") {
      state.stage = "beacon";
      state.carried = "sunstone";
      state.objective = "Carry the sunstone to the high light.";
      state.notice = "Sunstone recovered. Follow the stone trail north.";
      player.setCarried(spark);
    } else if (action.id === "beacon") {
      player.setCarried(null);
      ignite();
    } else {
      state.returning = true;
    }
    return true;
  }

  function goalForCompass(position) {
    if (state.stage === "vanes") return location(vanes.find((vane) => vane.remaining) ?? VANES[0]);
    if (state.stage === "ascent") {
      if ((position?.y ?? 0) >= HIGH - .24 || (position?.z ?? 1) < -4.5) return location(LENS);
      return location(LIFT);
    }
    if (state.stage === "beacon") return location(BEACON);
    return EXIT;
  }

  function update(dt, time) {
    water.uniforms.time.value = time;
    for (const vane of vanes) {
      vane.hinge.rotation.y = THREE.MathUtils.damp(vane.hinge.rotation.y, vane.rotation, 7, dt);
      vane.rotor.rotation.x = time * (vane.remaining ? 0.4 : 3.3);
    }
    wind.update(time);
    if (state.stage === "vanes" || state.stage === "ascent") {
      spark.position.y = .94 + Math.sin(time * 2.15) * .075;
      crystal.rotation.y = time * .65;
    }
    if (state.complete) {
      light = THREE.MathUtils.damp(light, 1, 3, dt);
      altar.pearl.emissiveIntensity = 0.06 + light * 1.5;
      altar.shine.intensity = 45 * light;
      altar.beamMaterial.opacity = .17 * light;
      altar.flame.visible = light > .28;
      altar.flame.rotation.y = time * 0.63;
      altar.returnRune.rotation.y = time * .65;
    }
  }
  return { spawn: SPAWN, heightAt, canWalk, canGlide, windAt, state, getPrompt, interact, goalForCompass, update, exit: EXIT, restoreComplete };
}
