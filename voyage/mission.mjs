import * as THREE from "./vendor/three.module.min.js";

const KEEPER = [0, 17];
const PALLET = [3, 1];
const LENS = [5, -13];
const BEACON = [-10, -23];
const GATE_Z = -5;
const DEFAULT_PROFILE = { id: "standard", marks: [2, 3, 1], target: 5 };
const WEIGHT_STATIONS = [
  { id: "weight-2", name: "copper", x: -5, z: 10, color: 0xbe7552 },
  { id: "weight-3", name: "teal", x: 7, z: 9, color: 0x4b9789 },
  { id: "weight-1", name: "ochre", x: -6, z: 3, color: 0xc7a460 },
];
const BOX = new THREE.BoxGeometry(1, 1, 1);
const SPHERE = new THREE.SphereGeometry(1, 9, 7);
const CYLINDER = new THREE.CylinderGeometry(1, 1, 1, 10);
const TORUS = new THREE.TorusGeometry(1, 0.065, 6, 20);

function matte(color, roughness = 0.8) {
  return new THREE.MeshStandardMaterial({ color, roughness });
}

function metal(color) {
  return new THREE.MeshStandardMaterial({ color, metalness: 0.43, roughness: 0.49 });
}

function meshAt(parent, shape, material, x, y, z, sx, sy, sz, shadow = false) {
  const item = new THREE.Mesh(shape, material);
  item.position.set(x, y, z);
  item.scale.set(sx, sy, sz);
  item.castShadow = shadow;
  item.receiveShadow = shadow;
  parent.add(item);
  return item;
}

function box(parent, material, x, y, z, sx, sy, sz, shadow = false) {
  return meshAt(parent, BOX, material, x, y, z, sx, sy, sz, shadow);
}

function round(parent, material, x, y, z, sx, sy, sz) {
  return meshAt(parent, SPHERE, material, x, y, z, sx, sy, sz);
}

function post(parent, material, x, y, z, radius, height, shadow = false) {
  return meshAt(parent, CYLINDER, material, x, y, z, radius, height, radius, shadow);
}

function inspectProfile(profile) {
  if (!profile) return { ...DEFAULT_PROFILE, marks: [...DEFAULT_PROFILE.marks] };
  const { id, marks, target } = profile;
  if (typeof id !== "string" || !id || !Array.isArray(marks) || marks.length !== 3
    || marks.some((mark) => !Number.isInteger(mark) || mark < 1 || mark > 99)
    || !Number.isInteger(target) || target < 1 || target > 99) {
    throw new TypeError("A voyage profile needs three positive weight marks and a target.");
  }
  const subsets = [0];
  for (const mark of marks) subsets.push(...subsets.map((load) => load + mark));
  if (!subsets.includes(target)) throw new RangeError("That voyage profile cannot balance the winch.");
  return { id, marks: [...marks], target };
}

function createKeeper(palette) {
  const figure = new THREE.Group();
  figure.name = "Keeper Nessa";
  const { iron, leather, cream, gold } = palette;
  const coat = matte(0x456d55);
  const lining = matte(0x2e5342);
  const skin = matte(0xe2aa80);
  const scarf = matte(0xd28b51);
  const silver = matte(0xc1b6a0);

  for (const sign of [-1, 1]) {
    box(figure, iron, sign * 0.16, 0.105, 0.054, 0.20, 0.21, 0.32);
    box(figure, leather, sign * 0.15, 0.31, 0, 0.18, 0.34, 0.21);
    const sleeve = round(figure, lining, sign * 0.31, 0.77, 0.00, 0.115, 0.32, 0.14);
    sleeve.rotation.z = sign * 0.19;
    round(figure, skin, sign * 0.35, 0.53, 0.045, 0.085, 0.09, 0.082);
  }
  const tunic = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.35, 0.57, 9), coat);
  tunic.position.y = 0.75;
  tunic.castShadow = true;
  figure.add(tunic);
  post(figure, leather, 0, 0.77, 0, 0.30, 0.078);
  box(figure, gold, 0, 0.77, 0.30, 0.12, 0.09, 0.028);
  post(figure, scarf, 0, 1.075, 0.01, 0.22, 0.11);
  box(figure, scarf, 0.09, 0.985, 0.20, 0.12, 0.24, 0.044).rotation.z = -0.16;
  const head = new THREE.Group();
  head.position.y = 1.21;
  figure.add(head);
  round(head, skin, 0, 0.01, 0, 0.19, 0.23, 0.172);
  round(head, silver, 0, 0.08, -0.07, 0.19, 0.19, 0.13);
  for (const sign of [-1, 1]) {
    round(head, cream, sign * 0.072, 0.035, 0.146, 0.037, 0.026, 0.022);
    round(head, iron, sign * 0.066, 0.034, 0.163, 0.015, 0.018, 0.012);
    round(head, skin, sign * 0.18, -0.005, 0, 0.026, 0.053, 0.033);
    box(head, silver, sign * 0.074, 0.084, 0.155, 0.053, 0.015, 0.018).rotation.z = -sign * 0.18;
  }
  round(head, skin, 0, -0.023, 0.163, 0.036, 0.041, 0.042);
  box(head, leather, 0, -0.078, 0.145, 0.057, 0.012, 0.018);
  post(head, lining, 0, 0.14, -0.015, 0.32, 0.058);
  post(head, coat, 0, 0.234, -0.027, 0.203, 0.16);
  post(head, scarf, 0, 0.176, -0.028, 0.209, 0.039);
  const staff = new THREE.Group();
  staff.position.set(-0.47, 0, 0.085);
  staff.rotation.z = -0.04;
  figure.add(staff);
  post(staff, leather, 0, 0.74, 0, 0.044, 1.48);
  round(staff, gold, 0, 1.53, 0, 0.10, 0.12, 0.09);
  return { figure, head };
}

const SEGMENTS = [
  [0, 0.18, 0.16, 0.039],
  [0.082, 0.091, 0.038, 0.153],
  [0.082, -0.091, 0.038, 0.153],
  [0, -0.18, 0.16, 0.039],
  [-0.082, -0.091, 0.038, 0.153],
  [-0.082, 0.091, 0.038, 0.153],
  [0, 0, 0.16, 0.039],
];
const DIGITS = ["012345", "12", "01346", "01236", "1256", "02356", "023456", "012", "0123456", "012356"];

function showNumber(group, value, material, pips = false) {
  group.clear();
  if (pips && value >= 1 && value <= 5) {
    const spacing = 0.105;
    for (let index = 0; index < value; index++) {
      round(group, material, (index - (value - 1) / 2) * spacing, 0, 0, 0.037, 0.041, 0.019);
    }
    return;
  }
  const digits = String(value);
  for (const [index, digit] of Array.from(digits).entries()) {
    const offset = (index - (digits.length - 1) / 2) * 0.243;
    const bars = DIGITS[Number(digit)];
    for (let i = 0; i < SEGMENTS.length; i++) {
      if (!bars.includes(i)) continue;
      const [x, y, width, height] = SEGMENTS[i];
      box(group, material, offset + x, y, 0, width, height, 0.027);
    }
  }
}

function createWeight(station, palette) {
  const group = new THREE.Group();
  group.name = station.id;
  const body = matte(station.color);
  const deep = body.clone();
  deep.color.multiplyScalar(0.66);
  box(group, body, 0, 0.32, 0, 0.69, 0.61, 0.65, true);
  box(group, deep, 0, 0.274, 0.33, 0.56, 0.29, 0.025);
  box(group, deep, 0, 0.274, -0.33, 0.56, 0.29, 0.025);
  for (const side of [-1, 1]) {
    for (const z of [-0.325, 0.325]) {
      box(group, palette.iron, side * 0.316, 0.323, z, 0.072, 0.65, 0.055);
    }
    box(group, palette.iron, 0, side === 1 ? 0.594 : 0.053, 0, 0.72, 0.073, 0.67);
  }
  box(group, palette.iron, 0, 0.67, 0, 0.28, 0.083, 0.19);
  box(group, palette.gold, 0, 0.716, 0, 0.16, 0.045, 0.11);

  const faces = [];
  for (const direction of [-1, 1]) {
    const mark = new THREE.Group();
    mark.position.set(0, 0.303, 0.354 * direction);
    mark.rotation.y = direction === 1 ? 0 : Math.PI;
    mark.scale.setScalar(0.76);
    group.add(mark);
    faces.push(mark);
  }
  const lid = new THREE.Group();
  lid.position.set(0, 0.64, 0.175);
  lid.rotation.x = -Math.PI / 2;
  lid.scale.setScalar(0.64);
  group.add(lid);
  faces.push(lid);
  function setMarks(marks) {
    for (const face of faces) showNumber(face, marks, palette.mark, true);
  }
  return { group, setMarks };
}

function createScale(palette) {
  const group = new THREE.Group();
  group.name = "Tide Gate Winch";
  const { iron, gold, stone, leather, wood } = palette;
  box(group, stone, 0, 0.065, 0, 3.55, 0.13, 1.48, true);
  post(group, iron, 0, 0.36, 0, 0.25, 0.69, true);
  post(group, gold, 0, 0.54, 0, 0.135, 0.44, true);
  const platform = new THREE.Group();
  platform.position.y = 0.60;
  group.add(platform);
  box(platform, iron, 0, -0.065, 0, 3.38, 0.11, 1.25, true);
  for (let index = -1; index <= 1; index++) {
    box(platform, wood, 0, 0.005, index * 0.358, 3.35, 0.07, 0.336, true);
  }
  for (const x of [-1.05, 0, 1.05]) {
    box(platform, leather, x, 0.049, 0, 0.63, 0.039, 0.62);
  }

  const board = new THREE.Group();
  board.position.set(0, 1.08, -0.71);
  group.add(board);
  box(board, iron, 0, 0, 0, 1.47, 0.53, 0.09, true);
  box(board, leather, 0, 0, 0.054, 1.36, 0.42, 0.03);
  box(board, gold, 0, 0, 0.075, 0.026, 0.26, 0.025).rotation.z = -0.28;
  const readout = new THREE.Group();
  const limit = new THREE.Group();
  readout.position.set(-0.32, 0, 0.083);
  limit.position.set(0.31, 0, 0.083);
  readout.scale.setScalar(0.71);
  limit.scale.setScalar(0.71);
  board.add(readout, limit);
  const bright = new THREE.MeshBasicMaterial({ color: 0xf9d67e });
  const warning = new THREE.MeshBasicMaterial({ color: 0xe96c50 });
  const okay = new THREE.MeshBasicMaterial({ color: 0xa2ef9a });
  function refresh(load, target) {
    showNumber(readout, load, load === target ? okay : load > target ? warning : bright, true);
    showNumber(limit, target, palette.mark, true);
  }
  return { group, platform, refresh };
}

function createGate(palette) {
  const group = new THREE.Group();
  group.name = "Harbour Tide Gate";
  const { stone, iron, wood, gold } = palette;
  for (const side of [-1, 1]) {
    const x = side * 4.28;
    box(group, stone, x, 1.53, 0, 0.8, 3.06, 1.21, true);
    box(group, stone, x, 3.08, 0, 0.96, 0.23, 1.32, true);
    box(group, iron, x, 3.32, 0, 0.26, 0.31, 0.26, true);
    round(group, gold, x, 3.56, 0, 0.21, 0.19, 0.21);
    box(group, iron, x - side * 0.45, 1.73, 0, 0.14, 3.44, 0.22);
  }
  box(group, wood, 0, 3.07, 0, 8.08, 0.28, 0.26, true);
  box(group, iron, 0, 3.1, 0.12, 0.83, 0.38, 0.09, true);
  const moving = new THREE.Group();
  group.add(moving);
  for (let i = 0; i <= 12; i++) {
    const x = (i - 6) * 0.607;
    box(moving, iron, x, 1.25, 0, 0.092, 2.5, 0.12, i % 2 === 0);
    const end = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.205, 4), iron);
    end.position.set(x, 0.22, 0);
    end.rotation.z = Math.PI;
    moving.add(end);
  }
  for (const y of [0.44, 1.62, 2.37]) {
    box(moving, wood, 0, y, 0, 7.71, 0.127, 0.214, true);
  }
  const status = new THREE.MeshBasicMaterial({ color: 0xe3765d });
  round(group, status, 0, 3.10, 0.19, 0.12, 0.12, 0.053);
  round(group, status, 0, 3.10, -0.19, 0.12, 0.12, 0.053);
  return { group, moving, status };
}

function createLens(palette) {
  const group = new THREE.Group();
  group.name = "Fresnel Lens";
  const glass = new THREE.MeshStandardMaterial({
    color: 0xfad69a, emissive: 0xe8a74d, emissiveIntensity: 0.37, roughness: 0.26, metalness: 0.21,
  });
  meshAt(group, TORUS, palette.gold, 0, 0.42, 0, 0.41, 0.41, 0.76, true);
  meshAt(group, TORUS, palette.iron, 0, 0.42, 0.061, 0.31, 0.31, 0.41);
  round(group, glass, 0, 0.42, 0.015, 0.315, 0.315, 0.107);
  for (const radius of [0.105, 0.209]) {
    meshAt(group, TORUS, palette.gold, 0, 0.42, 0.116, radius, radius, 0.14);
  }
  box(group, palette.gold, 0, 0.84, 0, 0.21, 0.08, 0.095, true);
  return { group, glass };
}

function createBeacon(palette) {
  const group = new THREE.Group();
  group.name = "Beacon Lens Mount";
  const pillar = matte(0x8c8770);
  post(group, palette.stone, 0, 0.12, 0, 0.45, 0.24, true);
  post(group, pillar, 0, 0.52, 0, 0.24, 0.78, true);
  post(group, palette.gold, 0, 0.93, 0, 0.36, 0.12, true);
  meshAt(group, TORUS, palette.gold, 0, 1.29, 0, 0.40, 0.40, 0.45, true);
  const lamp = new THREE.PointLight(0xffca74, 0, 20, 1.6);
  lamp.position.y = 1.35;
  group.add(lamp);
  const rotor = new THREE.Group();
  rotor.position.y = 1.37;
  group.add(rotor);
  const beam = new THREE.ShaderMaterial({
    uniforms: { power: { value: 0 } },
    vertexShader: `
      varying float distanceAlong;
      void main() {
        distanceAlong = 0.5 - position.y / 24.0;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float power;
      varying float distanceAlong;
      void main() {
        float fade = pow(max(0.0, 1.0 - distanceAlong), 2.7);
        gl_FragColor = vec4(1.0, 0.70, 0.29, fade * power * 0.23);
      }
    `,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const beamShape = new THREE.ConeGeometry(2.05, 24, 20, 1, true);
  for (const side of [-1, 1]) {
    const ray = new THREE.Mesh(beamShape, beam);
    ray.position.x = side * 12;
    ray.rotation.z = side * Math.PI / 2;
    rotor.add(ray);
  }
  rotor.visible = false;
  return { group, lamp, rotor, beam };
}

export function createQuest({ scene, world, profile } = {}) {
  let configuration = inspectProfile(profile);
  const root = new THREE.Group();
  root.name = "The Last Light · mission";
  scene.add(root);
  const palette = {
    iron: metal(0x324c4b),
    gold: metal(0xd7a753),
    cream: matte(0xffedc8),
    leather: matte(0x6a4b39),
    wood: matte(0x946d4c),
    stone: matte(0x9ca395),
    mark: new THREE.MeshBasicMaterial({ color: 0xffe9a7 }),
  };
  const state = {
    stage: "meet",
    objective: "",
    notice: "",
    carried: null,
    carriedMarks: 0,
    load: 0,
    target: configuration.target,
    profile: configuration.id,
    gateOpen: false,
    complete: false,
  };

  function floor(x, z) {
    const y = world?.heightAt?.(x, z);
    return Number.isFinite(y) ? y : 0;
  }

  function point([x, z]) {
    return { x, y: floor(x, z), z };
  }

  function place(group, [x, z]) {
    root.add(group);
    group.rotation.set(0, 0, 0);
    group.position.set(x, floor(x, z), z);
    group.scale.setScalar(1);
  }

  const keeper = createKeeper(palette);
  const scale = createScale(palette);
  const gate = createGate(palette);
  const lens = createLens(palette);
  const beacon = createBeacon(palette);
  place(keeper.figure, KEEPER);
  place(scale.group, PALLET);
  place(gate.group, [0, GATE_Z]);
  place(beacon.group, BEACON);
  const cradle = new THREE.Group();
  post(cradle, palette.stone, 0, 0.12, 0, 0.36, 0.25, true);
  post(cradle, palette.gold, 0, 0.25, 0, 0.24, 0.06);
  place(cradle, LENS);

  const weights = WEIGHT_STATIONS.map((station) => ({
    ...station, ...createWeight(station, palette), marks: 0, status: "ground",
    ground: [station.x, station.z],
  }));
  const mounted = [];
  let lastPosition;
  let gateHeight = 0;
  let lanternPower = 0;

  const marker = new THREE.Group();
  const halo = new THREE.MeshBasicMaterial({
    color: 0xffd98b, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.44, 0.51, 27), halo);
  ring.rotation.x = -Math.PI / 2;
  marker.add(ring);
  root.add(marker);

  function metric(position, location) {
    if (Math.abs((position.y ?? floor(position.x, position.z)) - location.y) > 1.42) return Infinity;
    return Math.hypot(position.x - location.x, position.z - location.z);
  }

  function weightLabel(weight) {
    return weight.marks === 1 ? "one mark" : weight.marks + " marks";
  }

  function findAction(position) {
    if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.z)) return null;
    const actions = [];
    const offer = (id, label, loc, limit) => {
      const distance = metric(position, loc);
      if (distance <= limit) actions.push({ id, label, loc, distance });
    };
    if (state.stage === "meet") offer("meet", "Speak with Keeper Nessa", point(KEEPER), 2.4);
    if (state.stage === "weights") {
      if (state.carried) {
        offer("load", "Place weight on the winch", point(PALLET), 2.05);
        if (!actions.length && position.z > GATE_Z + 1.5 && (world?.canWalk?.(position.x, position.z) ?? true)) {
          offer("drop", "Set the weight down", point([position.x, position.z]), 1);
        }
      } else {
        for (const weight of weights) {
          if (weight.status === "ground") {
            offer(weight.id, `Lift ${weight.name} weight · ${weightLabel(weight)}`, point(weight.ground), 1.62);
          }
        }
        if (mounted.length) offer("unload", "Take the last weight off the winch", point(PALLET), 2.05);
      }
    }
    if (state.stage === "lens") offer("lens", "Recover the lighthouse lens", point(LENS), 2.05);
    if (state.stage === "beacon") offer("beacon", "Set the lens and light the beacon", point(BEACON), 1.35);
    actions.sort((first, second) => first.distance - second.distance);
    return actions[0] ?? null;
  }

  function getPrompt(position) {
    const action = findAction(position);
    return action ? { label: action.label, loc: action.loc } : null;
  }

  function syncPlatform() {
    state.load = mounted.reduce((total, weight) => total + weight.marks, 0);
    scale.refresh(state.load, state.target);
    for (const [index, weight] of mounted.entries()) {
      scale.platform.add(weight.group);
      weight.group.position.set((index - 1) * 1.05, 0.085, 0);
      weight.group.rotation.set(0, 0, 0);
      weight.group.scale.setScalar(1);
    }
  }

  function lift(weight, player) {
    weight.status = "carried";
    state.carried = weight.id;
    state.carriedMarks = weight.marks;
    player.setCarried(weight.group);
  }

  function loadWeight(player) {
    const weight = weights.find(({ id }) => id === state.carried);
    if (!weight) return;
    player.setCarried(null);
    state.carried = null;
    state.carriedMarks = 0;
    weight.status = "mounted";
    mounted.push(weight);
    syncPlatform();
    if (state.load === state.target) {
      state.stage = "lens";
      state.gateOpen = true;
      state.objective = "Cross the tide gate. Recover the lens from the old storehouse.";
      state.notice = "The winch settles. The tide gate is rising.";
      gate.status.color.setHex(0xa9e6a6);
    } else {
      state.notice = state.load < state.target ? "The winch needs a heavier load." : "The winch sank below its mark. Take a weight off.";
    }
  }

  function interact(position, player) {
    lastPosition = position;
    const action = findAction(position);
    if (!action || !player) return false;
    if (action.id === "meet") {
      state.stage = "weights";
      state.objective = `Balance the winch to ${state.target} marks and open the tide gate.`;
      state.notice = "Keeper Nessa: The winch will lift the gate when its brass marks line up.";
    } else if (action.id === "load") {
      loadWeight(player);
    } else if (action.id === "unload") {
      const weight = mounted.pop();
      syncPlatform();
      lift(weight, player);
      state.notice = "Weight removed. Set it down away from the winch to try a different load.";
    } else if (action.id === "drop") {
      const weight = weights.find(({ id }) => id === state.carried);
      player.setCarried(null);
      weight.status = "ground";
      weight.ground = [position.x, position.z];
      place(weight.group, weight.ground);
      state.carried = null;
      state.carriedMarks = 0;
      state.notice = "Weight set down.";
    } else if (action.id === "lens") {
      state.stage = "beacon";
      state.carried = "lens";
      state.objective = "Follow the rising walk to the lighthouse. Fit the lens at the top.";
      state.notice = "Lens recovered. The keeper's light is within reach.";
      player.setCarried(lens.group);
    } else if (action.id === "beacon") {
      player.setCarried(null);
      beacon.group.add(lens.group);
      lens.group.position.set(0, 0.93, 0);
      lens.group.rotation.set(0, 0, 0);
      lens.group.scale.setScalar(1);
      state.stage = "complete";
      state.carried = null;
      state.complete = true;
      state.objective = "The lighthouse is shining again.";
      state.notice = "The Last Light restored. The harbour is safe.";
    } else {
      const weight = weights.find(({ id }) => id === action.id);
      if (!weight) return false;
      lift(weight, player);
      state.notice = `Carrying the ${weight.name} weight. Take it to the winch.`;
    }
    return true;
  }

  function canPass(x, z) {
    if (Math.abs(z - GATE_Z) > 0.84) return true;
    return state.gateOpen && Math.abs(x) <= 3.78;
  }

  function goalForCompass(position = lastPosition) {
    if (state.stage === "meet") return point(KEEPER);
    if (state.stage === "weights") {
      if (state.carried || !position) return point(PALLET);
      let closest;
      let distance = Infinity;
      for (const weight of weights) {
        if (weight.status !== "ground") continue;
        const loc = point(weight.ground);
        const nextDistance = metric(position, loc);
        if (nextDistance < distance) {
          closest = loc;
          distance = nextDistance;
        }
      }
      return closest ?? point(PALLET);
    }
    if (state.stage === "lens") return point(LENS);
    if (state.stage === "beacon") {
      if (position && position.y < 0.3 && (position.x < 1.4 || Math.abs(position.z + 22) > 1.5)) {
        return point([2.55, -22]);
      }
      return point(BEACON);
    }
    return null;
  }

  function update(dt, time) {
    keeper.head.rotation.y = 0.08 + Math.sin(time * 0.76) * 0.085;
    const liftTarget = state.gateOpen ? 3.33 : 0;
    gateHeight = THREE.MathUtils.damp(gateHeight, liftTarget, 3.6, dt);
    gate.moving.position.y = gateHeight;
    const tilt = THREE.MathUtils.clamp((state.target - state.load) / Math.max(4, state.target) * 0.17, -0.20, 0.20);
    scale.platform.rotation.z = THREE.MathUtils.damp(scale.platform.rotation.z, tilt, 4.5, dt);
    if (state.stage === "lens") {
      lens.group.position.y = floor(...LENS) + 0.24 + Math.sin(time * 2.4) * 0.045;
      lens.group.rotation.y = 0.18 + Math.sin(time * 1.41) * 0.10;
    }
    lanternPower = THREE.MathUtils.damp(lanternPower, state.complete ? 1 : 0, 3.8, dt);
    beacon.rotor.visible = lanternPower > 0.01;
    beacon.rotor.rotation.y = time * 0.40 + 0.91;
    beacon.beam.uniforms.power.value = lanternPower;
    beacon.lamp.intensity = 31 * lanternPower;
    lens.glass.emissiveIntensity = 0.37 + lanternPower * 1.85;
    const goal = goalForCompass();
    marker.visible = !!goal;
    if (goal) {
      marker.position.set(goal.x, goal.y + 0.035, goal.z);
      marker.scale.setScalar(1.11 + Math.sin(time * 2.2) * 0.12);
      halo.opacity = 0.30 + Math.sin(time * 2.2) * 0.11;
    }
  }

  function reset(player) {
    player?.setCarried(null);
    Object.assign(state, {
      stage: "meet", objective: "Follow the landing trail. Find Keeper Nessa.",
      notice: "", carried: null, carriedMarks: 0, load: 0, target: configuration.target,
      profile: configuration.id, gateOpen: false, complete: false,
    });
    lastPosition = undefined;
    mounted.length = 0;
    for (const [index, weight] of weights.entries()) {
      weight.marks = configuration.marks[index];
      weight.ground = [weight.x, weight.z];
      weight.status = "ground";
      place(weight.group, weight.ground);
      weight.setMarks(weight.marks);
    }
    place(lens.group, LENS);
    lens.group.position.y += 0.24;
    gateHeight = 0;
    gate.moving.position.y = 0;
    gate.status.color.setHex(0xe3765d);
    lanternPower = 0;
    beacon.lamp.intensity = 0;
    beacon.beam.uniforms.power.value = 0;
    beacon.rotor.visible = false;
    scale.platform.rotation.z = 0;
    syncPlatform();
  }

  function setProfile(next, player) {
    configuration = inspectProfile(next);
    reset(player);
  }

  reset();
  return { state, getPrompt, interact, canPass, update, reset, setProfile, goalForCompass };
}
