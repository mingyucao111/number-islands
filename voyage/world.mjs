import * as THREE from "./vendor/three.module.min.js";

const SOUTH = [
  [-20.6, 2], [-18.8, -2.5], [-14.8, -4.0], [-8.1, -3.7], [-4.7, -3.35],
  [4.7, -3.35], [11.4, -4.35], [17.1, -3.25], [20.4, 0.3], [21.1, 7.4],
  [19.4, 14.7], [17.7, 20.7], [12.6, 23.4], [5.4, 25.25], [-4.7, 25.3],
  [-9.1, 23.4], [-14.5, 23.5], [-18.6, 20.1], [-21.4, 12.4],
];
const NORTH = [
  [-20.7, -10.2], [-17.5, -7.8], [-12.1, -6.4], [-5.6, -7.2], [5.8, -7.15],
  [11.2, -6.9], [17.8, -8.4], [21.3, -12.4], [19.6, -19.3], [16.3, -25.5],
  [10.7, -28.6], [3.7, -31.8], [-4.7, -31.1], [-12.5, -30.1], [-17.4, -27.3],
  [-21.5, -21.1], [-22.2, -14.3],
];

const RAMP = { start: 2, end: -8, z: -22, halfWidth: 1.44, peak: 4.5 };
const DECK = { minX: -12.25, maxX: -8, minZ: -24.55, maxZ: -20.57 };
const TOWER = { x: -10.15, z: -22.9 };
const COAST_HEIGHT = -1.3;

function randomFrom(seed) {
  let value = seed;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function inside(x, z, outline) {
  let hit = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const [xa, za] = outline[i];
    const [xb, zb] = outline[j];
    if ((za > z) !== (zb > z) && x < ((xb - xa) * (z - za)) / (zb - za) + xa) hit = !hit;
  }
  return hit;
}

function onDeck(x, z) {
  return x >= DECK.minX && x <= DECK.maxX && z >= DECK.minZ && z <= DECK.maxZ;
}

function onRamp(x, z) {
  return x <= RAMP.start && x >= RAMP.end && Math.abs(z - RAMP.z) <= RAMP.halfWidth;
}

function floorAt(x, z) {
  if (onDeck(x, z)) return RAMP.peak;
  if (onRamp(x, z)) return (RAMP.start - x) * RAMP.peak / (RAMP.start - RAMP.end);
  return 0;
}

function landAt(x, z) {
  const bridge = Math.abs(x) < 4.4 && z >= -8.05 && z <= -2.95;
  const jetty = Math.abs(x) < 2.35 && z >= 23 && z < 28.5;
  return bridge || jetty || inside(x, z, SOUTH) || inside(x, z, NORTH);
}

function surface(positions, { colors, uv } = {}) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  if (colors) geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  if (uv) geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.computeVertexNormals();
  return geometry;
}

function grassTexture(random) {
  const width = 128;
  const data = new Uint8Array(width * width * 4);
  for (let y = 0; y < width; y++) {
    for (let x = 0; x < width; x++) {
      const index = (x + y * width) * 4;
      const grain = (random() - 0.5) * 10;
      const mottling = 4 * Math.sin(x * Math.PI / 16) * Math.cos(y * Math.PI / 32);
      data[index] = 117 + mottling + grain;
      data[index + 1] = 154 + mottling + grain;
      data[index + 2] = 75 + grain;
      data[index + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, width, width);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function makeTerrain(group, outline, grass, random, offset = [0, 0], height = 0) {
  const points = outline.map(([x, z]) => new THREE.Vector2(x + offset[0], z + offset[1]));
  const faces = THREE.ShapeUtils.triangulateShape(points, []);
  const cap = [];
  const uv = [];
  for (const [a, b, c] of faces) {
    const p = points[a];
    const q = points[b];
    const r = points[c];
    const signed = (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    for (const vertex of signed < 0 ? [p, q, r] : [p, r, q]) {
      cap.push(vertex.x, height, vertex.y);
      uv.push(vertex.x / 6.5, vertex.y / 6.5);
    }
  }
  const plate = new THREE.Mesh(surface(cap, { uv }), grass);
  plate.receiveShadow = true;
  group.add(plate);

  const center = points.reduce((total, point) => total.add(point), new THREE.Vector2()).divideScalar(points.length);
  const bands = [height - 0.03, height - 0.34, height - 0.79, height - 1.37, height - 2.8];
  const palette = ["#6b7c50", "#7f8064", "#a08d73", "#718577", "#5e786d"].map((value) => new THREE.Color(value));
  const wall = [];
  const colors = [];
  function cliffVertex(point, layer, color) {
    const scale = [1, 1.01, 1.02, 1.035, 1.048][layer];
    wall.push(center.x + (point.x - center.x) * scale, bands[layer], center.y + (point.y - center.y) * scale);
    colors.push(color.r, color.g, color.b);
  }
  for (let segment = 0; segment < points.length; segment++) {
    const start = points[segment];
    const end = points[(segment + 1) % points.length];
    const tone = 0.84 + random() * 0.28;
    for (let layer = 0; layer < bands.length - 1; layer++) {
      const top = palette[layer].clone().multiplyScalar(tone);
      const bottom = palette[layer + 1].clone().multiplyScalar(tone);
      cliffVertex(start, layer, top);
      cliffVertex(end, layer, top);
      cliffVertex(start, layer + 1, bottom);
      cliffVertex(end, layer, top);
      cliffVertex(end, layer + 1, bottom);
      cliffVertex(start, layer + 1, bottom);
    }
  }
  const rocks = new THREE.Mesh(surface(wall, { colors }), new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.94, side: THREE.DoubleSide,
  }));
  rocks.receiveShadow = true;
  group.add(rocks);
}

function makeWater(group) {
  const water = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uNear: { value: new THREE.Color("#508b75") },
        uDeep: { value: new THREE.Color("#2b6965") },
        uLight: { value: new THREE.Color("#b8cbaa") },
      },
    ]),
    fog: true,
    vertexShader: `
      varying vec3 worldPoint;
      #include <fog_pars_vertex>
      void main() {
        worldPoint = (modelMatrix * vec4(position, 1.0)).xyz;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: `
      varying vec3 worldPoint;
      uniform float uTime;
      uniform vec3 uNear;
      uniform vec3 uDeep;
      uniform vec3 uLight;
      #include <fog_pars_fragment>
      void main() {
        vec2 p = worldPoint.xz;
        float swell = sin(p.x * .20 + p.y * .18 + uTime * .24);
        float drift = cos(p.x * .09 - p.y * .25 - uTime * .35);
        float colour = .54 + swell * .21 + drift * .13;
        float crest = sin(p.x * 1.0 + p.y * 1.82 - uTime * 1.14 + sin(p.x * .23 + uTime * .25) * 1.2);
        float lace = smoothstep(.84, .99, crest) * (.35 + drift * .24);
        float highlight = smoothstep(-.5, .95, swell + .05) * .08;
        vec3 ink = mix(uDeep, uNear, colour);
        gl_FragColor = vec4(mix(ink, uLight, lace * .25 + highlight), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  });
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), water);
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.y = COAST_HEIGHT;
  group.add(ocean);
  return water;
}

function path(group, points, width, colour) {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0.013, z)));
  const material = new THREE.MeshStandardMaterial({ color: colour, roughness: 1 });
  const vertices = [];
  function edge(t, side) {
    const point = curve.getPoint(t);
    const along = curve.getTangent(t);
    const radius = width * (1 + 0.09 * Math.sin(t * 39) + 0.065 * Math.cos(t * 72));
    return [point.x + along.z * radius * side, point.y, point.z - along.x * radius * side];
  }
  const steps = 100;
  for (let step = 0; step < steps; step++) {
    const a = step / steps;
    const b = (step + 1) / steps;
    const left = edge(a, -1);
    const right = edge(a, 1);
    const nextLeft = edge(b, -1);
    const nextRight = edge(b, 1);
    vertices.push(...left, ...nextLeft, ...right, ...right, ...nextLeft, ...nextRight);
  }
  material.side = THREE.DoubleSide;
  const road = new THREE.Mesh(surface(vertices), material);
  road.receiveShadow = true;
  group.add(road);
}

function instanceMeshes(group, geometry, items, { roughness = 0.9, shadow = false } = {}) {
  if (!items.length) return;
  const material = new THREE.MeshStandardMaterial({ roughness, color: "#ffffff" });
  const mesh = new THREE.InstancedMesh(geometry, material, items.length);
  const transform = new THREE.Object3D();
  const color = new THREE.Color();
  for (const [index, { at, size, tint, turn = 0, tilt = 0, roll = 0 }] of items.entries()) {
    transform.position.set(...at);
    transform.rotation.set(tilt, turn, roll);
    transform.scale.set(...size);
    transform.updateMatrix();
    mesh.setMatrixAt(index, transform.matrix);
    mesh.setColorAt(index, color.set(tint));
  }
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  group.add(mesh);
}

function structures(group, blockers) {
  const walls = [];
  const beams = [];
  const roofs = [];
  const windows = [];
  const stones = [];
  function plank(at, size, tint, turn = 0) {
    beams.push({ at, size, tint, turn });
  }

  function cottage(x, z, width, depth, tint, turn) {
    const wall = { at: [x, 1.29, z], size: [width, 2.65, depth], tint, turn };
    walls.push(wall);
    roofs.push({ at: [x, 2.64, z], size: [width + 0.65, 1.37, depth + 0.72], tint: turn ? "#7d6750" : "#885d47", turn });
    const front = z + depth / 2 + 0.025;
    const cream = "#c3aa79";
    plank([x, 0.24, front], [width + 0.08, 0.23, 0.18], cream);
    plank([x, 2.4, front], [width + 0.12, 0.18, 0.16], cream);
    for (const direction of [-1, 1]) {
      plank([x + direction * (width / 2 - 0.08), 1.32, front], [0.18, 2.65, 0.17], "#594f38");
      windows.push({ at: [x + direction * width * 0.29, 1.58, front + 0.055], size: [0.68, 0.71, 0.14], tint: "#d7a968" });
      plank([x + direction * width * 0.29, 1.60, front + 0.14], [0.04, 0.67, 0.07], "#614d35");
    }
    windows.push({ at: [x, 0.98, front + 0.064], size: [1.04, 1.87, 0.15], tint: "#566f55" });
    stones.push({ at: [x, 0.08, front + 0.31], size: [1.43, 0.17, 0.62], tint: "#a99c7c" });
    blockers.push({ x, z, halfX: width / 2, halfZ: depth / 2 });
  }

  cottage(-11.2, 16, 5.05, 3.8, "#c3b58a", 0);
  cottage(11.75, 15.25, 4.2, 3.25, "#bac49b", 0);
  cottage(10.65, -17.4, 3.95, 3.25, "#c9c297", 0);
  for (let index = 0; index < 12; index++) {
    const x = -11.6 + index * 0.56;
    stones.push({ at: [x, 0.22, 19.5 - 0.07 * index], size: [0.51, 0.52, 0.49], tint: index % 3 ? "#a89c7e" : "#8c957a", turn: (index % 4 - 1.5) * 0.05 });
  }

  for (const x of [-1.87, 1.87]) {
    for (const z of [23, 25.5, 27.7]) {
      plank([x, -0.75, z], [0.36, 2.65, 0.38], "#735e4a");
      plank([x, 0.39, z], [0.26, 0.78, 0.25], "#aa875f");
    }
  }
  for (let index = 0; index < 14; index++) {
    plank([0, -0.098, 23.15 + index * 0.39], [4.35, 0.2, 0.35], index % 3 ? "#a98459" : "#a57d51");
  }

  for (const x of [-3.95, 3.95]) {
    for (const z of [-7.6, -5.15, -3.18]) {
      stones.push({ at: [x, -0.6, z], size: [0.99, 1.6, 0.76], tint: "#867e68" });
      stones.push({ at: [x, 0.35, z], size: [0.44, 0.70, 0.47], tint: "#a29c82" });
    }
    plank([x, 0.52, -5.35], [0.18, 0.19, 4.75], "#857253");
  }
  for (let row = 0; row < 9; row++) {
    for (let column = 0; column < 13; column++) {
      const offset = row % 2 ? 0.016 : -0.016;
      stones.push({
        at: [-3.9 + column * 0.648 + offset, -0.063, -7.71 + row * 0.54],
        size: [0.625, 0.128, 0.526],
        tint: ["#a99d83", "#b2a78a", "#b0ab8e", "#988d76"][(column * 7 + row * 11) % 4],
      });
    }
  }

  const rampRun = RAMP.start - RAMP.end;
  const slope = Math.atan(RAMP.peak / rampRun);
  const runPerPlank = rampRun / 36;
  for (let number = 0; number < 36; number++) {
    const x = RAMP.start - (number + 0.5) * runPerPlank;
    plank([x, floorAt(x, RAMP.z) - 0.085, RAMP.z],
      [runPerPlank - 0.013, 0.18, RAMP.halfWidth * 2],
      number % 4 ? "#ad885f" : "#9f7e57");
  }
  for (const side of [-1, 1]) {
    const z = RAMP.z + side * (RAMP.halfWidth + 0.04);
    for (const x of [1.7, -0.2, -2.1, -4.1, -6.1, -7.92]) {
      plank([x, floorAt(x, RAMP.z) + 0.36, z], [0.16, 0.84, 0.16], "#806943");
      if (x <= -3) plank([x, (floorAt(x, RAMP.z) - 0.11) / 2, z], [0.23, floorAt(x, RAMP.z), 0.23], "#796144");
    }
    beams.push({ at: [(RAMP.start + RAMP.end) / 2, RAMP.peak / 2 + 0.75, z],
      size: [Math.hypot(rampRun, RAMP.peak), 0.13, 0.16], tint: "#947958", roll: -slope });
  }

  const deckWidth = DECK.maxX - DECK.minX;
  const deckDepth = DECK.maxZ - DECK.minZ;
  const deckX = (DECK.maxX + DECK.minX) / 2;
  const deckZ = (DECK.maxZ + DECK.minZ) / 2;
  for (let i = 0; i < 14; i++) {
    const z = DECK.minZ + (i + 0.5) * deckDepth / 14;
    plank([deckX, RAMP.peak - 0.12, z], [deckWidth, 0.26, deckDepth / 14 - 0.014], i % 3 ? "#9e7e59" : "#b48e65");
  }
  for (const z of [DECK.minZ + 0.115, DECK.maxZ - 0.115]) {
    for (const x of [-12.09, -10.65, -9.3, -8.15]) {
      plank([x, RAMP.peak + 0.39, z], [0.14, 0.86, 0.14], "#5f6648");
    }
    plank([deckX, RAMP.peak + 0.80, z], [deckWidth, 0.15, 0.16], "#766e4c");
  }
  plank([DECK.minX + 0.1, RAMP.peak + 0.80, deckZ], [0.14, 0.15, deckDepth], "#766e4c");
  for (const x of [-11.68, -8.73]) {
    for (const z of [-24.05, -21.74]) {
      plank([x, RAMP.peak + 1.64, z], [0.19, 3.3, 0.20], "#8c7653");
      plank([x, RAMP.peak + 0.27, z], [0.40, 0.57, 0.4], "#a5a083");
    }
  }

  function towerCylinder(top, bottom, height, y, color) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(top, bottom, height, 16),
      new THREE.MeshStandardMaterial({ color, roughness: 0.89 }));
    mesh.position.set(TOWER.x, y, TOWER.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  towerCylinder(1.7, 1.85, 0.44, 0.21, "#818b73");
  towerCylinder(1.48, 1.69, 1.46, 1.17, "#d7d3b3");
  towerCylinder(1.35, 1.48, 0.95, 2.37, "#b76d56");
  towerCylinder(1.21, 1.35, 1.38, 3.53, "#d8d5b7");
  towerCylinder(1.42, 1.27, 0.29, 4.34, "#a89672");
  towerCylinder(0.16, 2.01, 1.14, 8.24, "#a86551");
  towerCylinder(2.025, 2.01, 0.11, 7.68, "#725e45");
  towerCylinder(0.075, 0.075, 0.44, 8.94, "#736a50");
  windows.push({ at: [TOWER.x, 1.12, TOWER.z + 1.58], size: [0.66, 1.37, 0.13], tint: "#657860" });
  windows.push({ at: [TOWER.x, 3.28, TOWER.z + 1.29], size: [0.45, 0.66, 0.10], tint: "#637a64" });

  const roofFaces = [
    -0.5, 0, -0.5, 0.5, 0, -0.5, 0, 1, -0.5,
    0.5, 0, 0.5, -0.5, 0, 0.5, 0, 1, 0.5,
    -0.5, 0, 0.5, -0.5, 0, -0.5, 0, 1, -0.5,
    -0.5, 0, 0.5, 0, 1, -0.5, 0, 1, 0.5,
    0.5, 0, -0.5, 0.5, 0, 0.5, 0, 1, 0.5,
    0.5, 0, -0.5, 0, 1, 0.5, 0, 1, -0.5,
  ];
  const outwardRoof = [];
  for (let offset = 0; offset < roofFaces.length; offset += 9) {
    outwardRoof.push(...roofFaces.slice(offset, offset + 3), ...roofFaces.slice(offset + 6, offset + 9), ...roofFaces.slice(offset + 3, offset + 6));
  }
  instanceMeshes(group, surface(outwardRoof), roofs, { shadow: true });
  instanceMeshes(group, new THREE.BoxGeometry(), walls, { shadow: true });
  instanceMeshes(group, new THREE.BoxGeometry(), windows);
  instanceMeshes(group, new THREE.BoxGeometry(), stones, { shadow: true });
  instanceMeshes(group, new THREE.BoxGeometry(), beams, { shadow: true });
}

function scenicPlants(group, blockers, random) {
  const trunks = [];
  const crowns = [];
  const stones = [];
  const grass = [];
  const blooms = [];
  const species = ["#537e52", "#618b57", "#6e9557", "#4b795a", "#5d8a68"];
  const petal = ["#dbc877", "#efe6bd", "#de9b83", "#c6b7cc"];
  function nearRoute(x, z) {
    const bridge = Math.abs(x) < 5.8 && z < 3.8 && z > -10.5;
    const dock = Math.abs(x) < 4.4 && z > 19.5;
    const ramp = x < 4.0 && x > -14.1 && z < -18.0 && z > -26.6;
    const objective = (Math.abs(x) < 8.4 && z > 0.2 && z < 18) || (x < 8.1 && x > -2.0 && z < -10.0 && z > -17.5);
    return bridge || dock || ramp || objective;
  }
  function tree(x, z, height, tint) {
    const turn = random() * Math.PI * 2;
    const trunk = height * 0.25;
    trunks.push({ at: [x, trunk / 2, z], size: [0.26, trunk, 0.26], tint: "#806544", turn });
    for (let step = 0; step < 3; step++) {
      const width = height * (0.55 - step * 0.105);
      crowns.push({
        at: [x, height * (0.43 + step * 0.17), z], size: [width, height * 0.53, width],
        tint: new THREE.Color(tint).multiplyScalar(0.9 + step * 0.075).getHex(),
        turn: turn + step * 0.75,
      });
    }
    if (height > 2.3) blockers.push({ x, z, radius: 0.33 });
  }

  for (let tryIndex = 0; tryIndex < 270; tryIndex++) {
    const x = (random() - 0.5) * 42;
    const z = -31 + random() * 57;
    if (!landAt(x, z) || nearRoute(x, z) || floorAt(x, z) !== 0) continue;
    if (blockers.some((obstacle) => Math.hypot(obstacle.x - x, obstacle.z - z) < (obstacle.radius ? 1.0 : 3.9))) continue;
    if (tryIndex % 3) {
      tree(x, z, 2.1 + random() * 2.65, species[Math.floor(random() * species.length)]);
    } else {
      const size = 0.45 + random() * 0.95;
      stones.push({ at: [x, 0.22 * size, z], size: [size, size * 0.74, size * 0.9], tint: "#899481", turn: random() * 3 });
      if (size > 0.84) blockers.push({ x, z, radius: size * 0.6 });
    }
  }

  for (let index = 0; index < 840; index++) {
    const x = (random() - 0.5) * 41;
    const z = -31.1 + random() * 58.5;
    if (!landAt(x, z) || !landAt(x + 0.34, z + 0.34) || (nearRoute(x, z) && Math.abs(x) < 3.4) || floorAt(x, z) > 0.05) continue;
    if (Math.abs(x) < 4.4 && z >= -8.05 && z <= -2.95) continue;
    const height = 0.14 + random() * 0.2;
    const turn = random() * Math.PI;
    grass.push({ at: [x, height * 0.45, z], size: [0.19, height, 0.105], tint: species[index % species.length], turn, tilt: 0.16 - random() * 0.32 });
    if (index % 9 === 0) {
      blooms.push({ at: [x, height + 0.04, z], size: [0.09, 0.065, 0.09], tint: petal[index % petal.length] });
    }
  }
  instanceMeshes(group, new THREE.CylinderGeometry(0.45, 0.65, 1, 6), trunks);
  instanceMeshes(group, new THREE.ConeGeometry(0.72, 1, 7), crowns, { shadow: true });
  instanceMeshes(group, new THREE.DodecahedronGeometry(0.76, 0), stones, { shadow: true });
  instanceMeshes(group, new THREE.ConeGeometry(0.5, 1, 3), grass);
  instanceMeshes(group, new THREE.IcosahedronGeometry(0.6, 0), blooms);
}

function distantDetails(group) {
  const hills = [
    { at: [-35, -0.7, -39], size: [16, 8, 11], tint: "#73957d", turn: 0.4 },
    { at: [-40, -1.1, -43], size: [10, 11, 10], tint: "#729385", turn: 0.8 },
    { at: [-28, -0.8, -37], size: [12, 5.7, 9], tint: "#86a083", turn: 0.2 },
    { at: [36, -1.2, -46], size: [11, 13, 9], tint: "#729c80", turn: 0.9 },
    { at: [43, -1, -41], size: [14, 8.5, 11], tint: "#7c9d80", turn: 0.4 },
    { at: [52, -1, -39], size: [11, 5.8, 8], tint: "#8ba889", turn: 1.1 },
    { at: [29, -1, 35], size: [13, 4.8, 9], tint: "#88a182", turn: 0.6 },
  ];
  instanceMeshes(group, new THREE.IcosahedronGeometry(1, 1), hills);
}

function shoreTide(group, outline) {
  const center = outline.reduce(([sx, sz], [x, z]) => [sx + x, sz + z], [0, 0]).map((value) => value / outline.length);
  const shoreline = new THREE.CatmullRomCurve3(outline.map(([x, z]) =>
    new THREE.Vector3(x, COAST_HEIGHT + 0.022, z)), true, "centripetal");
  const positions = [];
  function crest(t, outer) {
    const point = shoreline.getPoint(t);
    const tangent = shoreline.getTangent(t);
    const distance = 0.56 + 0.13 * Math.sin(t * 104) + (outer ? 0.12 : 0.0);
    let nx = tangent.z;
    let nz = -tangent.x;
    if ((point.x - center[0]) * nx + (point.z - center[1]) * nz < 0) { nx = -nx; nz = -nz; }
    return [point.x + nx * distance, point.y, point.z + nz * distance];
  }
  const count = 190;
  for (let index = 0; index < count; index++) {
    const start = index / count;
    const end = (index + 1) / count;
    const a = crest(start, false);
    const b = crest(end, false);
    const c = crest(start, true);
    const d = crest(end, true);
    positions.push(...a, ...b, ...c, ...c, ...b, ...d);
  }
  const line = new THREE.Mesh(surface(positions), new THREE.MeshBasicMaterial({
    color: "#c5d3ad", opacity: 0.34, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  }));
  group.add(line);
}

export function buildWorld(scene) {
  const group = new THREE.Group();
  group.name = "Saffron Reach";
  scene.add(group);
  const random = randomFrom(63679);
  const blockers = [];
  const grass = new THREE.MeshStandardMaterial({ map: grassTexture(random), roughness: 0.99 });
  makeTerrain(group, SOUTH, grass, random);
  makeTerrain(group, NORTH, grass, random);

  // Distant contours give the inlet a visible coast beyond the playable area.
  const distant = new THREE.MeshStandardMaterial({ color: "#8ea78b", roughness: 0.96 });
  const farShape = [[-16, -2], [-10, -7], [4, -8], [15, -3], [14, 2], [5, 6], [-9, 5]];
  makeTerrain(group, farShape, distant, random, [-34, -37], -0.18);
  makeTerrain(group, farShape.map(([x, z]) => [x * 1.26, z * 1.22]), distant, random, [41, -39], -0.26);
  makeTerrain(group, farShape.map(([x, z]) => [x * 0.74, z * 0.72]), distant, random, [30, 36], -0.46);
  distantDetails(group);

  const water = makeWater(group);
  shoreTide(group, NORTH);
  shoreTide(group, SOUTH);
  path(group, [[0, 25.16], [0.4, 21], [-0.3, 16.4], [0.55, 10.5], [0.5, 4.1], [0, -3.4]], 1.93, "#b9ab79");
  path(group, [[0.05, -7.15], [-0.3, -10.2], [1.45, -13.8], [3.4, -17.15], [2.4, -21.9]], 1.66, "#b9ab79");
  path(group, [[-0.2, 17.8], [-3.9, 18.1], [-6.4, 19.32], [-10.8, 18.7]], 0.77, "#b1a171");
  path(group, [[0.38, 21.6], [4.4, 22], [7, 21.8], [9.6, 21], [10.5, 20.2], [12.2, 19.2]], 0.62, "#b5a470");
  path(group, [[9.6, 21], [10.15, 19.25], [9.8, 17]], 0.46, "#b5a470");
  path(group, [[0.25, 13.9], [4.0, 13.2], [7.6, 15.75], [11.3, 17]], 0.68, "#b1a171");
  path(group, [[1.3, -13.8], [4.65, -14.28], [6.7, -15.0], [10.4, -15.55]], 0.64, "#b1a171");
  structures(group, blockers);
  scenicPlants(group, blockers, random);

  function canWalk(x, z) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
    if (x < -20 || x > 20 || z < -30 || z > 28.35 || !landAt(x, z)) return false;
    if (onRamp(x, z) || onDeck(x, z)) return true;
    if (Math.hypot(TOWER.x - x, TOWER.z - z) < 1.75) return false;
    return !blockers.some((item) => item.radius
      ? Math.hypot(item.x - x, item.z - z) < item.radius
      : Math.abs(item.x - x) < item.halfX && Math.abs(item.z - z) < item.halfZ);
  }

  return { heightAt: floorAt, canWalk, update(_dt, time) { water.uniforms.uTime.value = time; } };
}
