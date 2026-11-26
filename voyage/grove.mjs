import * as THREE from "./vendor/three.module.min.js";

const RIDGE = 10;
const BANK = 7.4;
const EAST_TRAIL = 6.35;
const TOP = 5.4;
const TREE = [0, -8.0];
const ALTAR = [0, -5.5];
const EXIT = [0, -15];
const LANDING = [0, 3];
const WEST_SEED = [-9, -9];
const TAKEOFF = [0, 10.45];

function randomFrom(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
}

function boundary(x, z) {
  return Math.abs(z) <= 22.4 && Math.abs(x) <= 21.6 - Math.max(0, Math.abs(z) - 14) * 0.57;
}

function creek(x, z) {
  return z > BANK && z < RIDGE && x < EAST_TRAIL;
}

function basinHeight(x, z) {
  const west = 1.62 * Math.exp(-((x + 10.2) ** 2 + (z + 9.8) ** 2) / 30);
  const knolls = 0.22 * Math.sin((x + z) * 0.28) ** 2 * Math.min(1, Math.abs(x) / 7);
  return west + knolls;
}

function heightAt(x, z) {
  if (z >= RIDGE) return TOP;
  if (creek(x, z)) return 0;
  const bottom = basinHeight(x, z);
  if (x >= EAST_TRAIL && z > -4) {
    const rise = THREE.MathUtils.clamp((z + 4) / (RIDGE + 4), 0, 1);
    return bottom + (TOP - bottom) * rise;
  }
  return bottom;
}

function point([x, z]) {
  return { x, y: heightAt(x, z), z };
}

function mesh(group, geometry, material, at, scale = [1, 1, 1], casts = false) {
  const result = new THREE.Mesh(geometry, material);
  result.position.set(...at);
  result.scale.set(...scale);
  result.castShadow = casts;
  result.receiveShadow = true;
  group.add(result);
  return result;
}

function standard(color, extras = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.92, ...extras });
}

function batch(group, geometry, entries, { casts = false, glow = false } = {}) {
  const material = glow ? new THREE.MeshBasicMaterial({ color: 0xffffff }) : standard(0xffffff);
  const output = new THREE.InstancedMesh(geometry, material, entries.length);
  const anchor = new THREE.Object3D();
  const shade = new THREE.Color();
  entries.forEach(({ at, size, color, swing = 0, lean = 0 }, index) => {
    anchor.position.set(...at);
    anchor.scale.set(...size);
    anchor.rotation.set(lean, swing, lean * 0.2);
    anchor.updateMatrix();
    output.setMatrixAt(index, anchor.matrix);
    output.setColorAt(index, shade.set(color));
  });
  output.castShadow = casts;
  output.receiveShadow = !glow;
  group.add(output);
  return output;
}

function floorSurface(group) {
  const xStops = Array.from({ length: 49 }, (_, i) => -24 + i).concat(EAST_TRAIL).sort((a, b) => a - b);
  const zStops = Array.from({ length: 49 }, (_, i) => -24 + i).concat(BANK).sort((a, b) => a - b);
  const vertices = [];
  const colors = [];
  const northGrass = new THREE.Color("#799d57");
  const ridgeGrass = new THREE.Color("#9ab464");
  const trailColor = new THREE.Color("#b8b07d");
  const shade = new THREE.Color("#638e6c");

  function vertex(x, z, centreX, centreZ) {
    const fromNorth = centreZ < RIDGE && centreX < EAST_TRAIL;
    const y = fromNorth ? basinHeight(x, z) : heightAt(x, z);
    vertices.push(x, y, z);
    const trailX = 9.45 + 0.85 * Math.sin(z * 0.19);
    const lowerTrail = z < BANK && (Math.abs(x + Math.sin(z * 0.47)) < 0.84 || (x < -4 && x > -10 && Math.abs(z - x) < 1.15));
    const overRidge = z >= 10 && Math.abs(x) < 1.65;
    const sideTrail = centreX >= EAST_TRAIL && Math.abs(x - trailX) < 1.45;
    const f = Math.sin(x * 0.83 - z * 0.54) * 0.03 + Math.sin(z * 0.61 + x * 0.38) * 0.055;
    const color = (centreZ > RIDGE ? ridgeGrass : northGrass).clone().lerp(shade, Math.max(0.0, Math.abs(x) / 35 + f));
    if (lowerTrail || overRidge || sideTrail) color.lerp(trailColor, 0.58);
    color.multiplyScalar(1.0 + f);
    colors.push(color.r, color.g, color.b);
  }

  for (let row = 1; row < zStops.length; row++) {
    const minZ = zStops[row - 1];
    const maxZ = zStops[row];
    const cz = (minZ + maxZ) / 2;
    for (let col = 1; col < xStops.length; col++) {
      const minX = xStops[col - 1];
      const maxX = xStops[col];
      const cx = (minX + maxX) / 2;
      if (!boundary(cx, cz) || creek(cx, cz)) continue;
      if ((row + col) % 2 === 0) {
        vertex(minX, minZ, cx, cz);
        vertex(minX, maxZ, cx, cz);
        vertex(maxX, minZ, cx, cz);
        vertex(maxX, minZ, cx, cz);
        vertex(minX, maxZ, cx, cz);
        vertex(maxX, maxZ, cx, cz);
      } else {
        vertex(minX, minZ, cx, cz);
        vertex(minX, maxZ, cx, cz);
        vertex(maxX, maxZ, cx, cz);
        vertex(minX, minZ, cx, cz);
        vertex(maxX, maxZ, cx, cz);
        vertex(maxX, minZ, cx, cz);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  mesh(group, geometry, standard(0xffffff, { vertexColors: true }), [0, 0, 0]);

  const layers = ["#849366", "#858b64", "#756f55", "#81735f", "#695e53"];
  const cliff = new THREE.BoxGeometry();
  for (let row = 0; row < layers.length; row++) {
    const strip = mesh(group, cliff, standard(layers[row]), [-6.86, TOP - row * 1.08 - 0.56, RIDGE + row * 0.045],
      [26.42, 1.11, 0.54]);
    strip.receiveShadow = true;
  }
  // The lower creek is separated from the grassy trail by slim, continuous banks.
  mesh(group, cliff, standard("#8a8c6e"), [-7.5, -0.24, BANK], [27.67, 0.49, 0.56]);
}

function makeCreek(group) {
  const waterMaterial = new THREE.ShaderMaterial({
    transparent: false,
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { t: { value: 0 } }]),
    vertexShader: `
      varying vec3 wp;
      #include <fog_pars_vertex>
      void main() {
        wp = (modelMatrix * vec4(position,1.)).xyz;
        vec4 mvPosition = modelViewMatrix * vec4(position,1.);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: `
      varying vec3 wp;
      uniform float t;
      #include <fog_pars_fragment>
      void main() {
        float ribs = sin(wp.x * 2.1 + wp.z * 9.2 + sin(wp.x * .72 + t * .6) * .9 - t * 2.8);
        float foam = smoothstep(.75,.98,ribs) * .35 + .18 * sin(wp.x * .35 + t * .56);
        vec3 green = vec3(.065,.285,.198);
        vec3 light = vec3(.31,.55,.40);
        gl_FragColor = vec4(mix(green, light, .34 + foam), 1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  });
  const water = mesh(group, new THREE.PlaneGeometry(30.2, RIDGE - BANK + 0.5), waterMaterial,
    [-8.74, -0.2, (RIDGE + BANK) / 2]);
  water.rotation.x = -Math.PI / 2;
  return waterMaterial;
}

function groveShelves(group, random, blocked) {
  const trunk = [];
  const canopies = [];
  const rock = [];
  const blades = [];
  const petals = [];
  const trees = ["fern", "lily", "sage", "pine"];
  const greens = ["#49784c", "#608958", "#4e805b", "#799a54", "#659a6b"];
  function isTrail(x, z) {
    return Math.abs(x) < 3.1 || Math.abs(x - 9.4) < 2.3 ||
      Math.hypot(x - WEST_SEED[0], z - WEST_SEED[1]) < 3.1 ||
      (z < -4.4 && z > -10.8 && x > -9 && x < 0) ||
      (z >= 10 && z < 19.4 && x > 0 && x < 10) ||
      (z > -4.8 && z < -3.1 && x > 0 && x < 10) ||
      Math.hypot(x, z + 8) < 4.3;
  }
  for (let index = 0; index < 260; index++) {
    const x = (random() - 0.5) * 44;
    const z = (random() - 0.5) * 45;
    if (!boundary(x, z) || creek(x, z) || isTrail(x, z)) continue;
    if (blocked.some(({ x: px, z: pz }) => Math.hypot(px - x, pz - z) < 1.25)) continue;
    const y = heightAt(x, z);
    const yaw = random() * Math.PI;
    const green = greens[index % greens.length];
    const variant = trees[Math.floor(random() * trees.length)];
    if (variant === "sage") {
      const size = 0.16 + random() * 1.45;
      rock.push({ at: [x, y + size * 0.23, z], size: [size * 1.32, size * 0.61, size], color: "#87916e", swing: yaw });
      if (size > 0.6) blocked.push({ x, z, radius: size * 0.87 });
      continue;
    }
    const stem = 0.93 + random() * 2.1;
    trunk.push({ at: [x, y + stem * 0.5, z], size: [0.26, stem, 0.27], color: "#735e45", swing: yaw });
    for (let leaf = 0; leaf < 4; leaf++) {
      const phase = leaf * 2.04 + yaw;
      const size = (leaf === 0 ? 1.31 : 0.86) + stem * 0.29;
      const distance = leaf === 0 ? 0.08 : 0.60;
      canopies.push({
        at: [x + Math.sin(phase) * distance, y + stem + (leaf === 0 ? 0.72 : 0.25), z + Math.cos(phase) * distance],
        size: [size, size * (variant === "pine" ? 1.32 : 0.68), size * 0.95],
        color: green,
        swing: phase,
      });
    }
    blocked.push({ x, z, radius: 0.31 });
  }
  for (let index = 0; index < 780; index++) {
    const x = (random() - 0.5) * 44;
    const z = (random() - 0.5) * 45;
    if (!boundary(x, z) || creek(x, z)) continue;
    const y = heightAt(x, z);
    const h = 0.15 + random() * 0.24;
    const angle = random() * 2 * Math.PI;
    blades.push({ at: [x, y + h * 0.39, z], size: [0.18, h, 0.12], color: greens[index % greens.length], lean: 0.13, swing: angle });
    if (index % 5 === 0) petals.push({
      at: [x, y + h, z],
      size: [0.07, 0.064, 0.071],
      color: ["#f0d88d", "#efe5b6", "#cea18e", "#a6c9a5"][(index / 5) % 4],
    });
  }
  batch(group, new THREE.CylinderGeometry(0.67, 1, 1, 7), trunk, { casts: true });
  batch(group, new THREE.DodecahedronGeometry(0.9), canopies, { casts: true });
  batch(group, new THREE.DodecahedronGeometry(0.8), rock, { casts: true });
  batch(group, new THREE.ConeGeometry(0.7, 1, 3), blades);
  batch(group, new THREE.IcosahedronGeometry(1), petals, { glow: true });
}

function roots(root, material, axis, width) {
  const path = new THREE.CatmullRomCurve3(axis.map((p) => new THREE.Vector3(...p)));
  const tube = mesh(root, new THREE.TubeGeometry(path, 16, width, 7, false), material, [0, 0, 0], [1, 1, 1], true);
  tube.receiveShadow = true;
  return tube;
}

function makeTree(group) {
  const floor = point(TREE);
  const tree = new THREE.Group();
  tree.position.set(floor.x, floor.y, floor.z);
  group.add(tree);
  const bark = standard("#88654b");
  const underside = standard("#695540");
  const crown = standard("#517b48");
  const bright = standard("#739c56");
  const leaf = new THREE.IcosahedronGeometry(1, 1);
  for (const side of [-1, 1]) {
    roots(tree, bark, [[side * 1.4, 0, 0], [side * 1.55, 1.33, -0.05], [side * 1.48, 2.7, 0.08],
      [side * 1.05, 4.4, -0.12], [side * 0.62, 5.28, -0.34]], 0.58);
    roots(tree, underside, [[side * 1.75, 0.35, -0.2], [side * 2.0, 0.47, 0.86], [side * 2.8, 0.32, 1.7], [side * 3.7, 0.0, 2.35]], 0.28);
    roots(tree, underside, [[side * 1.55, 0.5, 0], [side * 2.0, 0.25, -1.18], [side * 2.78, 0.14, -2.45]], 0.25);
    roots(tree, bark, [[side * 1.17, 3.4, 0], [side * 2.1, 4.2, -0.13], [side * 2.5, 5.3, -0.43], [side * 3.5, 5.72, -0.51]], 0.29);
    mesh(tree, leaf, crown, [side * 2.05, 5.58, -0.44], [2.3, 1.32, 1.47], true);
    mesh(tree, leaf, bright, [side * 3.45, 5.81, -0.87], [1.52, 0.94, 1.48], true);
    mesh(tree, leaf, bright, [side * 1.09, 6.69, -0.7], [1.75, 1.03, 1.66], true);
  }
  roots(tree, bark, [[-1.1, 4.57, -0.15], [-0.48, 4.89, -0.24], [0, 5.07, -0.23], [0.58, 4.95, -0.14], [1.18, 4.47, -0.12]], 0.32);
  mesh(tree, leaf, crown, [0, 6.22, 0.59], [2.15, 1.18, 1.58], true);
  const bud = new THREE.MeshBasicMaterial({ color: "#ae9271" });
  const budOrb = new THREE.SphereGeometry(0.17, 9, 6);
  const buds = [[-1.58, 1.12, 0.45], [-1.32, 2.42, 0.55], [1.46, 1.53, 0.55], [1.41, 2.94, 0.60], [-0.93, 4.74, 0.25],
    [0.20, 4.94, 0.15], [1.12, 4.64, 0.27]];
  buds.forEach((at) => mesh(tree, budOrb, bud, at, [1, 0.8, 0.8]));
  return bud;
}

function makeOverlook(zone) {
  const pieces = [];
  const box = new THREE.BoxGeometry();
  for (let strip = 0; strip < 9; strip++) {
    pieces.push({ at: [0, TOP - 0.035, RIDGE + 0.14 + strip * 0.25], size: [3.95, 0.11, 0.22], color: "#997953" });
  }
  for (const side of [-1, 1]) {
    for (const z of [10.2, 11.22, 12.22]) {
      pieces.push({ at: [side * 2.03, TOP + 0.4, z], size: [0.14, 0.8, 0.14], color: "#67563d" });
    }
    pieces.push({ at: [side * 2.03, TOP + 0.72, 11.19], size: [0.11, 0.13, 2.08], color: "#67563d" });
  }
  batch(zone, box, pieces, { casts: true });
}

function makeSeed(zone, [x, z], index, color) {
  const loc = point([x, z]);
  const stone = standard(index ? "#9a9d74" : "#8c9d75");
  const base = mesh(zone, new THREE.CylinderGeometry(0.72, 0.94, 0.24, 11), stone, [x, loc.y + 0.12, z]);
  base.castShadow = true;
  const orb = new THREE.Group();
  const glow = new THREE.MeshBasicMaterial({ color });
  const seed = mesh(orb, new THREE.IcosahedronGeometry(0.25, 1), glow, [0, 0, 0], [0.82, 1.39, 0.82]);
  const petal = standard(color, { emissive: color, emissiveIntensity: 0.3, metalness: 0.08 });
  for (let i = 0; i < 6; i++) {
    const turn = 2 * Math.PI * i / 6;
    const at = [Math.cos(turn) * 0.255, -0.11, Math.sin(turn) * 0.255];
    const leaf = mesh(orb, new THREE.SphereGeometry(0.115, 5, 4), petal, at, [1.38, 0.47, 1.1]);
    leaf.rotation.y = -turn;
  }
  const haloMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.62, depthWrite: false });
  const halo = mesh(orb, new THREE.TorusGeometry(0.36, 0.013, 6, 23), haloMat, [0, 0, 0]);
  halo.rotation.x = Math.PI * 0.5;
  orb.position.set(x, loc.y + 0.73, z);
  zone.add(orb);
  return { index, orb, seed, loc, name: index ? "Amber Seedlight" : "Silver Seedlight", status: "ground" };
}

function makeAltar(zone) {
  const at = point(ALTAR);
  const base = new THREE.Group();
  base.position.set(at.x, at.y, at.z);
  zone.add(base);
  const grey = standard("#838f70");
  const slate = standard("#647263");
  mesh(base, new THREE.CylinderGeometry(1.04, 1.18, 0.26, 10), slate, [0, 0.13, 0], [1, 1, 1], true);
  mesh(base, new THREE.CylinderGeometry(0.76, 0.83, 0.39, 10), grey, [0, 0.40, 0], [1, 1, 1], true);
  const sockets = [-0.37, 0.37].map((x) => {
    const socket = new THREE.Group();
    socket.position.set(x, 0.64, 0);
    const cup = mesh(socket, new THREE.TorusGeometry(0.21, 0.04, 6, 16), grey, [0, 0, 0]);
    cup.rotation.x = Math.PI / 2;
    base.add(socket);
    return socket;
  });
  return sockets;
}

function makeExit(zone) {
  const at = point(EXIT);
  const group = new THREE.Group();
  group.position.set(at.x, at.y, at.z);
  zone.add(group);
  const stone = standard("#838a6a");
  const pillar = new THREE.BoxGeometry();
  for (const side of [-1, 1]) {
    const sidePiece = mesh(group, pillar, stone, [side * 1.65, 0.61, 0], [0.61, 1.28, 0.45], true);
    sidePiece.rotation.z = side * 0.075;
  }
  const crown = mesh(group, new THREE.TorusGeometry(1.66, 0.27, 8, 23, Math.PI), stone, [0, 1.21, 0]);
  crown.castShadow = true;
  const rim = new THREE.MeshBasicMaterial({ color: "#daa282", transparent: true, opacity: 0.27, depthWrite: false });
  const ring = mesh(group, new THREE.TorusGeometry(1.45, 0.027, 6, 36, Math.PI), rim, [0, 1.29, 0.04]);
  const veil = new THREE.MeshBasicMaterial({ color: "#b8eac3", transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  mesh(group, new THREE.CircleGeometry(1.24, 28), veil, [0, 1.3, 0], [1, 1.14, 1]);
  return { rim, veil, ring };
}

function windMarks(zone) {
  const material = new THREE.MeshBasicMaterial({ color: "#b8ead0", transparent: true, opacity: 0.33, depthWrite: false });
  const geometry = new THREE.ConeGeometry(0.085, 0.42, 5);
  const air = new THREE.InstancedMesh(geometry, material, 18);
  air.frustumCulled = false;
  air.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const strand = new THREE.Object3D();
  strand.rotation.x = -Math.PI / 2;
  zone.add(air);
  return (time) => {
    for (let i = 0; i < air.count; i++) {
      const phase = i / air.count;
      const cycle = (time * 0.39 + phase) % 1;
      const x = (i % 6 - 2.5) * 0.78;
      const y = 2.65 + (i % 3) * 0.52;
      strand.position.set(x + Math.sin(cycle * Math.PI + phase) * 0.20,
        y + Math.sin(cycle * Math.PI) * 0.60, RIDGE + 0.54 - cycle * 3.7);
      strand.scale.setScalar(Math.sin(Math.PI * cycle));
      strand.updateMatrix();
      air.setMatrixAt(i, strand.matrix);
    }
    air.instanceMatrix.needsUpdate = true;
  };
}

export function createGrove(root, { route } = {}) {
  if (!root?.isObject3D) throw new TypeError("Windwood requires a Three.js chapter root.");
  const zone = new THREE.Group();
  zone.name = "Windwood Basin";
  root.add(zone);
  const seedKey = 4513 + String(route?.id ?? "").split("").reduce((sum, letter) => sum + letter.charCodeAt(0), 0);
  const random = randomFrom(seedKey);
  const blocked = [];
  const spawn = { x: 0, z: 18, yaw: 0 };
  const exit = point(EXIT);
  const altar = point(ALTAR);
  const state = {
    stage: "seeds",
    objective: "Find both Seedlights and bring them to the Hollow Tree.",
    notice: "Jump and hold to glide from the overlook. The east trail also leads down.",
    carried: null,
    carriedLabel: "",
    complete: false,
    deposited: 0,
  };

  floorSurface(zone);
  const water = makeCreek(zone);
  groveShelves(zone, random, blocked);
  const treeBud = makeTree(zone);
  makeOverlook(zone);
  const wind = windMarks(zone);
  const sockets = makeAltar(zone);
  const frame = makeExit(zone);
  const seeds = [
    makeSeed(zone, LANDING, 0, "#ccebc2"),
    makeSeed(zone, WEST_SEED, 1, "#f5d283"),
  ];

  function canWalk(x, z) {
    if (!Number.isFinite(x) || !Number.isFinite(z) || !boundary(x, z) || creek(x, z)) return false;
    return !blocked.some(({ x: bx, z: bz, radius }) => Math.hypot(x - bx, z - bz) < radius);
  }

  function canGlide(x, z, y) {
    return creek(x, z) && Math.abs(x) < 5.8 && Number.isFinite(y) && y > 0.08 && y < TOP + 3;
  }

  function windAt(x, z) {
    return Math.hypot(x, z + 13) < 1.8 ? 5.7 : 0;
  }

  function within(position, destination, limit) {
    if (Math.abs(position.y - destination.y) > 1.26) return false;
    return Math.hypot(position.x - destination.x, position.z - destination.z) <= limit;
  }

  let carriedSeed = null;
  function pendingAction(position) {
    if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y) || !Number.isFinite(position.z) || state.complete) return null;
    if (carriedSeed && within(position, altar, 2.0)) return { kind: "plant", label: "Plant the Seedlight", loc: altar };
    if (carriedSeed) return null;
    const seed = seeds.filter((item) => item.status === "ground" && within(position, item.loc, 1.65))
      .sort((a, b) => Math.hypot(a.loc.x - position.x, a.loc.z - position.z) - Math.hypot(b.loc.x - position.x, b.loc.z - position.z))[0];
    return seed ? { kind: "lift", seed, label: "Lift the " + seed.name, loc: seed.loc } : null;
  }

  function getPrompt(position) {
    const action = pendingAction(position);
    return action ? { label: action.label, loc: action.loc } : null;
  }

  function interact(position, player) {
    const action = pendingAction(position);
    if (!action) return false;
    if (action.kind === "lift") {
      carriedSeed = action.seed;
      carriedSeed.status = "carried";
      state.carried = "seedlight";
      state.carriedLabel = carriedSeed.name;
      state.objective = "Carry the " + carriedSeed.name + " to the Hollow Tree.";
      state.notice = "The Seedlight warms in your hands.";
      player?.setCarried(carriedSeed.orb);
    } else {
      player?.setCarried(null);
      const socket = sockets[state.deposited];
      socket.add(carriedSeed.orb);
      carriedSeed.orb.position.set(0, 0.19, 0);
      carriedSeed.orb.rotation.set(0, 0, 0);
      carriedSeed.orb.scale.setScalar(0.85);
      carriedSeed.status = "planted";
      carriedSeed = null;
      state.carried = null;
      state.carriedLabel = "";
      state.deposited++;
      if (state.deposited === seeds.length) {
        state.stage = "complete";
        state.complete = true;
        state.objective = "Follow the lit arch to the highlands.";
        state.notice = "The Hollow Tree is awake. Its wind opens the way ahead.";
        treeBud.color.set("#f5db88");
      } else {
        state.objective = "One Seedlight remains. Search the rocky rise to the west.";
        state.notice = "Warm light runs along the roots.";
        treeBud.color.set("#c2ceb2");
      }
    }
    return true;
  }

  function goalForCompass(position) {
    if (state.complete) return exit;
    if (carriedSeed) return altar;
    if (position && position.z > RIDGE + 0.85 && position.y > 2.9 && Math.abs(position.x) < 5.8) return point(TAKEOFF);
    let nearest;
    for (const seed of seeds) {
      if (seed.status !== "ground") continue;
      if (!nearest || !position || Math.hypot(position.x - seed.loc.x, position.z - seed.loc.z) <
          Math.hypot(position.x - nearest.loc.x, position.z - nearest.loc.z)) nearest = seed;
    }
    return nearest?.loc ?? altar;
  }

  function update(dt, time) {
    water.uniforms.t.value = time;
    for (const seed of seeds) {
      if (seed.status === "carried") continue;
      const wave = Math.sin(time * 1.8 + seed.index * 2.0);
      seed.seed.rotation.y = time * 0.8 + seed.index;
      seed.orb.position.y = seed.status === "ground"
        ? seed.loc.y + 0.72 + wave * 0.08 : 0.2 + wave * 0.045;
    }
    wind(time);
    frame.veil.opacity = THREE.MathUtils.damp(frame.veil.opacity, state.complete ? 0.41 : 0, 1.9, dt);
    frame.rim.color.set(state.complete ? "#cdeabd" : "#b0a78d");
    frame.rim.opacity = state.complete ? 0.82 + Math.sin(time * 2.3) * 0.11 : 0.32;
    frame.ring.position.z = state.complete ? Math.sin(time * 2) * 0.04 : 0.04;
  }

  return { spawn, exit, heightAt, canWalk, canGlide, windAt, state, getPrompt, interact, goalForCompass, update };
}
