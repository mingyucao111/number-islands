import * as THREE from "./vendor/three.module.min.js";

const LIMIT = 12;
const TEAM = Object.freeze({
  gale: { robe: 0x2a796b, hood: 0x3f9784, cape: 0x398774, trim: 0xace2c5, light: 0xade9d1 },
  warden: { robe: 0x84632b, hood: 0xa88543, cape: 0x91703e, trim: 0xf5cc76, light: 0xffdea0 },
  ember: { robe: 0x943e37, hood: 0xb95a4d, cape: 0xa64c3f, trim: 0xffb789, light: 0xffae7d },
});
const LIFE = Object.freeze({ strike: 0.44, shield: 0.87, heal: 1.00, burn: 0.66, dash: 0.52 });
const TAU = Math.PI * 2;

function randomFrom(seed) {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
}

function material(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...extra });
}

function add(host, geo, mat, at, size = [1, 1, 1], cast = false) {
  const item = new THREE.Mesh(geo, mat);
  item.position.set(...at);
  item.scale.set(...size);
  item.castShadow = cast;
  item.receiveShadow = true;
  host.add(item);
  return item;
}

function batch(host, geo, entries, cast = false) {
  const items = new THREE.InstancedMesh(geo, material(0xffffff), entries.length);
  const pose = new THREE.Object3D();
  const color = new THREE.Color();
  entries.forEach(({ at, size, shade, yaw = 0 }, index) => {
    pose.position.set(...at);
    pose.scale.set(...size);
    pose.rotation.set(0, yaw, 0);
    pose.updateMatrix();
    items.setMatrixAt(index, pose.matrix);
    items.setColorAt(index, color.set(shade));
  });
  items.castShadow = cast;
  items.receiveShadow = true;
  host.add(items);
  return items;
}

function circleBand(host, inner, outer, color, y) {
  const geometry = new THREE.RingGeometry(inner, outer, 96).rotateX(-Math.PI / 2);
  return add(host, geometry, material(color, { metalness: 0.17, roughness: 0.72 }), [0, y, 0]);
}

function makeCourt(host, random) {
  const plateau = new THREE.CylinderGeometry(13.3, 15.65, 3.92, 48, 1);
  add(host, plateau, material("#657d58"), [0, -2.02, 0]);
  add(host, new THREE.CylinderGeometry(13.48, 13.4, 0.12, 52), material("#83a25d"), [0, -0.078, 0]);
  const stone = new THREE.CylinderGeometry(12.58, 12.7, 0.26, 52);
  add(host, stone, material("#777c65"), [0, -0.13, 0], [1, 1, 1]);
  const positions = [];
  const tones = [];
  const floorInk = ["#a9ab8d", "#a0a78a", "#acb098", "#aeb294", "#9fa68a"].map((tone) => new THREE.Color(tone));
  const annuli = [0.0, 2.76, 5.42, 8.72, 12.48];
  const wedges = [15, 22, 29, 41];
  for (let band = 0; band < wedges.length; band++) {
    const slices = wedges[band];
    const step = TAU / slices;
    for (let part = 0; part < slices; part++) {
      const start = (part + band * 0.3) * step + 0.009;
      const end = start + step - 0.018;
      const inR = annuli[band] + (band === 0 ? 0 : 0.035);
      const outR = annuli[band + 1] - 0.035;
      const a = [Math.sin(start) * inR, 0.004, Math.cos(start) * inR];
      const b = [Math.sin(end) * inR, 0.004, Math.cos(end) * inR];
      const c = [Math.sin(start) * outR, 0.004, Math.cos(start) * outR];
      const d = [Math.sin(end) * outR, 0.004, Math.cos(end) * outR];
      const color = floorInk[Math.floor(random() * floorInk.length)].clone().multiplyScalar(0.9 + random() * 0.16);
      if (band !== 0) {
        positions.push(...a, ...c, ...b);
        for (let i = 0; i < 3; i++) tones.push(color.r, color.g, color.b);
      }
      positions.push(...c, ...d, ...b);
      for (let i = 0; i < 3; i++) tones.push(color.r, color.g, color.b);
    }
  }
  const surface = new THREE.BufferGeometry();
  surface.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  surface.setAttribute("color", new THREE.Float32BufferAttribute(tones, 3));
  surface.computeVertexNormals();
  add(host, surface, material(0xffffff, { vertexColors: true, side: THREE.DoubleSide }), [0, 0, 0]);

  circleBand(host, 11.73, 11.78, "#9c8858", 0.018);
  circleBand(host, 12.25, 12.39, "#686d54", 0.02);
  circleBand(host, 2.32, 2.39, "#977e4d", 0.014);
  circleBand(host, 1.78, 1.83, "#a48f5a", 0.013);
  const dial = [];
  for (let i = 0; i < 16; i++) {
    const yaw = i / 16 * TAU;
    dial.push({ at: [Math.sin(yaw) * 2.13, 0.025, Math.cos(yaw) * 2.13],
      size: [i % 4 === 0 ? 0.12 : 0.055, 0.012, i % 4 === 0 ? 0.34 : 0.12],
      shade: i % 4 === 0 ? "#8e7b52" : "#a48f65", yaw });
  }
  for (let i = 0; i < 8; i++) {
    const yaw = i / 8 * TAU;
    const length = i % 2 ? 0.59 : 1.31;
    dial.push({ at: [Math.sin(yaw) * length * 0.47, 0.026, Math.cos(yaw) * length * 0.47],
      size: [i % 2 ? 0.055 : 0.104, 0.015, length], shade: i % 2 ? "#9a875f" : "#6e795b", yaw });
  }
  batch(host, new THREE.BoxGeometry(), dial);
  for (const [i, z] of [-5, 5].entries()) {
    const starting = circleBand(host, 0.72, 0.762, i === 0 ? "#b09058" : "#629583", 0.022);
    starting.position.z = z;
  }
}

function makeRim(host, random) {
  const standing = [];
  const crowns = [];
  const ferns = [];
  const rocks = [];
  const torches = [];
  const wood = [];
  const leaf = [];
  for (let index = 0; index < 34; index++) {
    const angle = index / 34 * TAU;
    const x = Math.cos(angle) * 13.02;
    const z = Math.sin(angle) * 13.02;
    const tall = index % 6 === 2;
    const h = tall ? 1.29 : 0.19 + random() * 0.22;
    const shade = ["#9d9f82", "#858b72", "#91997b"][index % 3];
    standing.push({ at: [x, h * 0.47, z], size: [tall ? 0.52 : 0.36, h, tall ? 0.49 : 0.34], shade, yaw: angle });
    if (tall) {
      crowns.push({ at: [x, h + 0.07, z], size: [0.72, 0.19, 0.67], shade: "#a4a285" });
      torches.push({ at: [x, h + 0.23, z], size: [0.20, 0.19, 0.20], shade: "#f4cd80", yaw: angle });
    }
  }
  for (let i = 0; i < 86; i++) {
    const angle = random() * TAU;
    const range = 12.75 + random() * 1.26;
    const x = Math.cos(angle) * range;
    const z = Math.sin(angle) * range;
    const h = random() * 0.24;
    ferns.push({ at: [x, h * 0.54 - 0.063, z], size: [0.13, h + 0.037, 0.13],
      shade: i % 5 === 0 ? "#d5c479" : "#719b52", yaw: angle });
  }
  for (let i = 0; i < 31; i++) {
    const angle = i / 31 * TAU;
    const x = Math.cos(angle) * (15 + 0.6 * random());
    const z = Math.sin(angle) * (15 + 0.6 * random());
    const size = 0.55 + random() * 0.57;
    rocks.push({ at: [x, -2.4 - random() * 0.49, z], size: [size, size * 1.31, size], shade: "#738169", yaw: angle });
  }
  const trees = [[-13.5, -7.7], [-15.45, -8.1], [-12.9, -9.9], [-8.25, -13.35],
    [8.2, -13.45], [10.38, -12.39], [13.85, 8.1], [-13.8, 8.6],
    [12.3, 10.2], [7.35, 14.3], [-8.9, 13.8]];
  for (const [i, [x, z]] of trees.entries()) {
    const base = -0.42 - random() * 0.28;
    const root = 0.84 + random() * 0.75;
    rocks.push({ at: [x, base - 0.1, z], size: [1.20, 0.70, 1.05], shade: "#748660", yaw: i });
    wood.push({ at: [x, base + root / 2, z], size: [0.21, root, 0.23], shade: "#785e43", yaw: i });
    for (let layer = 0; layer < 3; layer++) {
      const broad = 1.11 - layer * 0.215;
      leaf.push({ at: [x, base + root * 0.86 + layer * 0.47, z], size: [broad, 1.49, broad],
        shade: ["#547c55", "#6c8c55", "#638a5b"][layer], yaw: i * 0.28 + layer });
    }
  }
  batch(host, new THREE.BoxGeometry(), [...standing, ...crowns], true);
  batch(host, new THREE.DodecahedronGeometry(0.65), rocks);
  const lights = batch(host, new THREE.IcosahedronGeometry(0.72), torches);
  lights.material.emissive.set("#cd9f59");
  lights.material.emissiveIntensity = 0.65;
  batch(host, new THREE.ConeGeometry(0.42, 1, 3), ferns);
  batch(host, new THREE.CylinderGeometry(0.48, 0.63, 1, 7), wood, true);
  batch(host, new THREE.ConeGeometry(0.82, 1, 8), leaf, true);
}

function makeWindgates(host) {
  const posts = [];
  const cloths = [];
  const stone = material("#9b9f82");
  const arch = new THREE.TorusGeometry(1.89, 0.22, 7, 21, Math.PI);
  const beam = new THREE.BoxGeometry();
  for (const z of [-12.94, 12.94]) {
    const archHeight = 2.59;
    add(host, arch, stone, [0, archHeight, z], [1, 1, 1.4], true);
    const clothInk = material(z < 0 ? "#b9995a" : "#649682", { side: THREE.DoubleSide });
    for (const side of [-1, 1]) {
      const x = side * 1.89;
      posts.push({ at: [x, 0.31, z], size: [1.04, 0.62, 0.94], shade: "#8b9072" });
      posts.push({ at: [x, 1.50, z], size: [0.61, 2.1, 0.55], shade: "#aaac8a" });
      posts.push({ at: [x, archHeight + 0.04, z], size: [0.84, 0.20, 0.69], shade: "#9c9c7a" });
      const geometry = new THREE.PlaneGeometry(0.54, 1.08, 5, 6);
      const banner = add(host, geometry, clothInk, [x, 1.91, z * 0.969]);
      banner.frustumCulled = false;
      cloths.push({ position: geometry.attributes.position, phase: side * 1.2 + z * 0.08 });
    }
  }
  batch(host, beam, posts, true);
  return (time) => {
    for (const { position, phase } of cloths) {
      for (let i = 0; i < position.count; i++) {
        const x = position.getX(i);
        const y = position.getY(i);
        const loose = 0.5 - y / 1.08;
        position.setZ(i, Math.sin(time * 3.8 + x * 8 + y * 3.8 + phase) * loose * 0.17);
      }
      position.needsUpdate = true;
    }
  };
}

function makeLandscape(host) {
  const pair = [
    { at: [0, -4.1, -26], size: [24, 2.25, 7], shade: "#72977c", yaw: 0.13 },
    { at: [-22, -4.05, -28], size: [15, 5.7, 12.5], shade: "#7d9982", yaw: 0.12 },
    { at: [20, -4.0, -31], size: [15, 7.2, 11], shade: "#8aa488", yaw: -0.35 },
    { at: [-13, -3.6, -33], size: [10.5, 9.6, 9.1], shade: "#7b9b87", yaw: 0.2 },
    { at: [14, -3.9, -39], size: [19, 8.4, 11], shade: "#81a397", yaw: 0.41 },
    { at: [34, -3.9, 14], size: [12.5, 7.9, 13], shade: "#8fa88b", yaw: -0.22 },
    { at: [-32, -4, 14.5], size: [13.1, 5.6, 14.3], shade: "#8ba486", yaw: 0.21 },
    { at: [13, -4, 32], size: [19, 4.4, 13], shade: "#89a68b", yaw: 0.32 },
    { at: [-15, -4, 32.5], size: [17, 9.3, 11], shade: "#82a288", yaw: -0.2 },
  ];
  batch(host, new THREE.IcosahedronGeometry(1, 1), pair);
  const sheet = new THREE.ShaderMaterial({
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { now: { value: 0 } }]),
    vertexShader: `
      varying vec3 world;
      #include <fog_pars_vertex>
      void main() {
        world = (modelMatrix * vec4(position,1.)).xyz;
        vec4 mvPosition = modelViewMatrix * vec4(position,1.);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: `
      varying vec3 world;
      uniform float now;
      #include <fog_pars_fragment>
      void main() {
        float swell = sin(world.x * .16 + world.z * .21 + now * .26);
        float ripple = sin(world.z * 1.86 + world.x * .82 - now * 1.2 + swell * 1.9);
        float light = .46 + swell * .17 + smoothstep(.84,.98,ripple) * .13;
        vec3 sea = mix(vec3(.063,.246,.211),vec3(.22,.53,.43),light);
        sea += vec3(.052,.069,.048) * (1.-smoothstep(14.5,19.,length(world.xz)));
        gl_FragColor = vec4(sea,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  });
  const sea = add(host, new THREE.PlaneGeometry(200, 200), sheet, [0, -2.69, 0]);
  sea.rotation.x = -Math.PI / 2;
  return sheet;
}

function makeRival(host, hero) {
  const group = new THREE.Group();
  const rig = new THREE.Group();
  group.name = "Rival guardian";
  group.add(rig);
  host.add(group);
  const cloth = {
    robe: material(0xffffff),
    hood: material(0xffffff),
    cape: material(0xffffff, { side: THREE.DoubleSide }),
    trim: material(0xffffff, { metalness: 0.21, roughness: 0.55 }),
  };
  const skin = material(0xd8ae84);
  const dark = material(0x3b463b);
  const boots = material(0x594938);
  const visor = material(0x303f37);
  const ball = new THREE.SphereGeometry(1, 12, 8);
  const block = new THREE.BoxGeometry();
  const round = new THREE.CapsuleGeometry(1, 1, 3, 9);
  add(rig, new THREE.CylinderGeometry(0.24, 0.32, 0.53, 11), cloth.robe, [0, 1.02, 0.01], [1, 1, 0.74], true);
  add(rig, ball, cloth.hood, [0, 1.54, 0.035], [0.274, 0.293, 0.249], true);
  add(rig, ball, visor, [0, 1.53, -0.15], [0.21, 0.199, 0.123]);
  add(rig, ball, skin, [0, 1.488, -0.226], [0.142, 0.119, 0.057]);
  add(rig, ball, cloth.trim, [0, 1.635, -0.157], [0.207, 0.046, 0.137]);
  add(rig, ball, cloth.trim, [0, 1.308, -0.19], [0.068, 0.068, 0.038]);
  add(rig, block, cloth.trim, [0, 0.885, -0.198], [0.178, 0.063, 0.059]);

  const capePath = new THREE.Shape();
  capePath.moveTo(-0.23, 0.19);
  capePath.quadraticCurveTo(-0.48, -0.47, -0.42, -0.78);
  capePath.quadraticCurveTo(0, -0.88, 0.43, -0.78);
  capePath.quadraticCurveTo(0.46, -0.46, 0.23, 0.19);
  const cape = add(rig, new THREE.ShapeGeometry(capePath, 10), cloth.cape, [0, 1.22, 0.196], [1, 1, 1], true);
  cape.rotation.x = -0.25;

  const legs = [];
  const arms = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.133, 0.79, 0.02);
    rig.add(leg);
    legs.push(leg);
    add(leg, round, dark, [0, -0.22, 0], [0.112, 0.162, 0.113], true);
    add(leg, block, boots, [0, -0.69, -0.036], [0.23, 0.164, 0.32], true);
    add(leg, round, boots, [0, -0.51, 0.03], [0.103, 0.1, 0.101]);
    const arm = new THREE.Group();
    arm.position.set(side * 0.23, 1.225, 0.005);
    arm.rotation.z = side * 0.23;
    rig.add(arm);
    arms.push(arm);
    add(arm, ball, cloth.trim, [0, -0.055, 0], [0.112, 0.104, 0.098], true);
    add(arm, round, cloth.robe, [0, -0.215, 0], [0.073, 0.116, 0.076], true);
    add(arm, ball, skin, [0, -0.417, -0.018], [0.057, 0.074, 0.071]);
  }
  const halo = add(group, new THREE.RingGeometry(0.47, 0.502, 27).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffffff, depthWrite: false, transparent: true, opacity: 0.64 }), [0, 0.027, 0]);

  let equipped;
  function dress(id) {
    const heroId = typeof id === "string" && Object.hasOwn(TEAM, id) ? id : "warden";
    if (heroId === equipped) return;
    equipped = heroId;
    for (const [key, part] of Object.entries(cloth)) part.color.setHex(TEAM[equipped][key]);
    halo.material.color.setHex(TEAM[equipped].light);
  }
  dress(hero);
  return { group, rig, legs, arms, cape, dress };
}

function makeEffects(host) {
  const flatRing = new THREE.TorusGeometry(0.8, 0.034, 7, 35).rotateX(-Math.PI / 2);
  const shortArc = new THREE.TorusGeometry(1.03, 0.038, 7, 30, Math.PI * 0.95)
    .rotateZ(Math.PI * 0.53).rotateX(-Math.PI / 2);
  const sphere = new THREE.SphereGeometry(1, 20, 12, 0, TAU, 0, Math.PI * 0.51);
  const mote = new THREE.OctahedronGeometry(0.11);
  const pool = Array.from({ length: 10 }, () => {
    const space = new THREE.Group();
    host.add(space);
    space.visible = false;
    const effectInk = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, opacity: 0.8 });
    const auraInk = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, opacity: 0.2,
      side: THREE.DoubleSide });
    const halo = add(space, flatRing, effectInk, [0, 0.12, 0]);
    const aura = add(space, sphere, auraInk, [0, 0.16, 0]);
    const sparks = new THREE.InstancedMesh(mote,
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, opacity: 0.9 }), 10);
    sparks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    sparks.frustumCulled = false;
    space.add(sparks);
    return { space, halo, aura, sparks, age: 0, kind: "", start: new THREE.Vector2(), end: new THREE.Vector2() };
  });
  let cursor = 0;
  const stamp = new THREE.Object3D();

  function trigger(kind, tint, origin, target) {
    const fx = pool[cursor];
    cursor = (cursor + 1) % pool.length;
    fx.kind = kind;
    fx.age = 0;
    fx.start.set(origin.x, origin.z);
    fx.end.set(target.x, target.z);
    fx.space.position.set(origin.x, 0, origin.z);
    fx.space.rotation.y = Math.atan2(target.x - origin.x, target.z - origin.z);
    fx.space.visible = true;
    fx.halo.geometry = kind === "strike" || kind === "dash" ? shortArc : flatRing;
    fx.halo.material.color.setHex(tint);
    fx.sparks.material.color.setHex(tint);
    fx.aura.material.color.setHex(tint);
    fx.aura.visible = kind === "shield";
  }

  function step(dt) {
    for (const fx of pool) {
      if (!fx.space.visible) continue;
      fx.age += dt;
      const t = fx.age / LIFE[fx.kind];
      if (t >= 1) { fx.space.visible = false; continue; }
      const fade = (1 - t) ** 0.64;
      const spread = 0.25 + t * 1.95;
      const fly = fx.kind === "strike" ? 1 - (1 - t) ** 3 : fx.kind === "dash" ? t * 0.72 : 1;
      fx.space.position.x = THREE.MathUtils.lerp(fx.start.x, fx.end.x, fly);
      fx.space.position.z = THREE.MathUtils.lerp(fx.start.y, fx.end.y, fly);
      fx.halo.position.y = fx.kind === "heal" ? 0.21 + t * 1.76 : fx.kind === "strike" ? 0.84 : 0.12;
      fx.halo.scale.setScalar(fx.kind === "shield" ? 1.27 + t * 0.54 : spread);
      fx.halo.material.opacity = 0.86 * fade;
      fx.aura.scale.setScalar(0.48 + Math.min(1, t * 6) * 0.88 + t * 0.21);
      fx.aura.material.opacity = fade * 0.24;
      fx.sparks.material.opacity = fade;
      for (let i = 0; i < fx.sparks.count; i++) {
        const angle = i / fx.sparks.count * TAU + t * (fx.kind === "heal" ? 3.4 : 0.54);
        const flyOut = spread * (0.55 + (i % 3) * 0.18);
        const climb = fx.kind === "heal" ? 0.13 + (0.7 + i % 3 * 0.21) * t
          : fx.kind === "shield" ? 0.22 + Math.sin(angle) ** 2 * (0.8 + t) : 0.21 + Math.sin(t * Math.PI) * (0.54 + i % 3 * 0.19);
        stamp.position.set(Math.cos(angle) * flyOut, climb, Math.sin(angle) * flyOut);
        stamp.scale.setScalar(Math.max(0.13, fade * (fx.kind === "burn" ? 0.9 : 0.61)));
        stamp.rotation.set(t * 2, angle, t * 2.4);
        stamp.updateMatrix();
        fx.sparks.setMatrixAt(i, stamp.matrix);
      }
      fx.sparks.instanceMatrix.needsUpdate = true;
    }
  }
  return { trigger, step };
}

function legalPosition(position) {
  if (!Number.isFinite(position?.x) || !Number.isFinite(position?.z)) return null;
  const length = Math.hypot(position.x, position.z);
  const scale = length > LIMIT ? LIMIT / length : 1;
  return { x: position.x * scale, z: position.z * scale };
}

function sidePoint(side) {
  return { x: 0, z: side === 1 ? -5 : 5, yaw: side === 1 ? Math.PI : 0 };
}

export function createDuelArena(root, { side = 0, rivalHero = "warden" } = {}) {
  if (!root?.isObject3D) throw new TypeError("The duel arena requires a Three.js scene.");
  const homeSide = side === 1 ? 1 : 0;
  const spawn = sidePoint(homeSide);
  const away = sidePoint(1 - homeSide);
  const group = new THREE.Group();
  group.name = "Windstone Arena";
  root.add(group);
  const random = randomFrom(17963);
  const water = makeLandscape(group);
  makeCourt(group, random);
  makeRim(group, random);
  const flutter = makeWindgates(group);
  const rival = makeRival(group, rivalHero);
  rival.group.position.set(away.x, 0, away.z);
  rival.group.rotation.y = away.yaw;
  const vfx = makeEffects(group);
  let target = away;
  let requestedYaw = null;
  let stride = 0;
  let gesture = "";
  let gestureAge = 1;

  function setRival(update) {
    const destination = legalPosition(update);
    if (destination) target = destination;
    if (update?.hero !== undefined) rival.dress(update.hero);
    requestedYaw = Number.isFinite(update?.yaw) ? update.yaw : null;
    if (typeof update?.move === "string" && Object.hasOwn(LIFE, update.move)) {
      gesture = update.move;
      gestureAge = 0;
    }
  }

  function pulse({ kind, side: actor = homeSide, hero, target: destination, origin } = {}) {
    if (typeof kind !== "string" || !Object.hasOwn(LIFE, kind)) return;
    const friends = actor === homeSide;
    const position = legalPosition(origin) ?? (friends ? spawn : { x: rival.group.position.x, z: rival.group.position.z });
    const end = legalPosition(destination) ?? position;
    const light = (typeof hero === "string" && Object.hasOwn(TEAM, hero) ? TEAM[hero] : TEAM.gale).light;
    const tint = kind === "heal" ? 0xcce89c : kind === "burn" ? 0xff9b6a : light;
    vfx.trigger(kind, tint, position, end);
    if (!friends) {
      gesture = kind;
      gestureAge = 0;
    }
  }

  function update(dt, time) {
    const step = THREE.MathUtils.clamp(dt, 0, 0.1);
    water.uniforms.now.value = time;
    const place = rival.group.position;
    const dx = target.x - place.x;
    const dz = target.z - place.z;
    const gap = Math.hypot(dx, dz);
    const easing = 1 - Math.exp(-step * 15);
    place.x += dx * easing;
    place.z += dz * easing;
    const look = requestedYaw ?? (gap > 0.045 ? Math.atan2(-dx, -dz) : Math.atan2(place.x, place.z));
    if (Math.abs(place.x) + Math.abs(place.z) > 0.01 || requestedYaw !== null) {
      const turn = look - rival.group.rotation.y;
      rival.group.rotation.y += Math.atan2(Math.sin(turn), Math.cos(turn)) * easing;
    }
    const moving = Math.min(1, gap * 2);
    stride += step * (5 + moving * 6) * moving;
    gestureAge += step;
    const effort = gesture && gestureAge < LIFE[gesture] ? Math.sin(Math.PI * gestureAge / LIFE[gesture]) : 0;
    rival.rig.position.y = moving * (1 - Math.cos(stride * 2)) * 0.039;
    rival.rig.rotation.x = gesture === "dash" ? effort * 0.23 : moving * 0.066;
    rival.cape.rotation.x = -0.25 - moving * 0.12 - effort * 0.085 + Math.sin(time * 3.8) * 0.034;
    for (let i = 0; i < 2; i++) {
      const sign = i * 2 - 1;
      const wave = Math.sin(stride) * sign * moving;
      rival.legs[i].rotation.x = wave * 0.53;
      rival.arms[i].rotation.x = -wave * 0.43
        - (gesture === "strike" && i === 1 ? effort * 1.28 : gesture === "heal" || gesture === "shield" ? effort * 0.53 : 0);
      rival.arms[i].rotation.z = sign * (0.23 + (gesture === "shield" ? effort * 0.42 : 0));
    }
    flutter(time);
    vfx.step(step);
  }

  return {
    spawn,
    heightAt(x, z) { return Number.isFinite(x) && Number.isFinite(z) ? 0 : NaN; },
    canWalk(x, z) { return Number.isFinite(x) && Number.isFinite(z) && Math.hypot(x, z) <= LIMIT; },
    setRival,
    pulse,
    update,
  };
}
