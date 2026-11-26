import * as THREE from "./vendor/three.module.min.js";
import { EYE_COLORS, HAIR_COLORS, normalizeAppearance, SKIN_TONES } from "./appearance.mjs";

const contours = [
  { width: .292, height: .323, depth: .26, brow: .03, jaw: -.10 },
  { width: .268, height: .353, depth: .261, brow: .02, jaw: -.13 },
  { width: .283, height: .333, depth: .252, brow: .16, jaw: -.24 },
  { width: .288, height: .324, depth: .258, brow: -.01, jaw: .17 },
  { width: .294, height: .340, depth: .257, brow: -.12, jaw: -.16 },
];
const eyeShapes = [[.063, .048, 0], [.069, .036, -.11], [.067, .025, .04], [.058, .054, -.06], [.063, .043, .12]];
const browShapes = [[.012, -.002, .009], [.026, .004, .008], [.015, .008, .013], [.004, -.006, .010], [.018, -.012, .008]];
const hairlines = [[.98, 2.13, .08], [.91, 2.39, .03], [.91, 2.66, .05], [.96, 2.65, .12], [.93, 2.29, -.02], [.90, 2.24, .035], [.94, 2.15, -.10]];

const coloured = (base, glow, weight) => new THREE.Color(base).lerp(new THREE.Color(glow), weight);
const vector = ([x, y, z]) => new THREE.Vector3(x, y, z);

function widthAt(form, ratio) {
  return form.width * (1 + form.brow * Math.max(0, ratio) + form.jaw * Math.max(0, -ratio));
}

function skinGeometry(form) {
  const geometry = new THREE.SphereGeometry(1, 28, 22);
  const positions = geometry.attributes.position;
  for (let index = 0; index < positions.count; index++) {
    const height = positions.getY(index);
    positions.setXYZ(index, positions.getX(index) * widthAt(form, height), height * form.height, positions.getZ(index) * form.depth);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function scalpGeometry(form, style) {
  const [front, back, part] = hairlines[style];
  const rings = 12;
  const sides = 40;
  const positions = [];
  const indices = [];
  for (let ring = 0; ring <= rings; ring++) {
    for (let side = 0; side <= sides; side++) {
      const angle = side / sides * Math.PI * 2;
      const facing = (1 + Math.cos(angle)) / 2;
      const limit = back + (front - back) * facing ** .75 + Math.sin(angle) * part * facing;
      const pitch = ring / rings * limit;
      const level = Math.cos(pitch);
      const radius = Math.sin(pitch);
      positions.push(Math.sin(angle) * radius * (widthAt(form, level) + .018), level * (form.height + .026) + .013,
        -Math.cos(angle) * radius * (form.depth + .022) + .001);
      if (ring && side) {
        const prev = (ring - 1) * (sides + 1) + side - 1;
        const next = prev + sides + 1;
        indices.push(prev, prev + 1, next, prev + 1, next + 1, next);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function sweptLock(points, radius) {
  const curve = new THREE.CatmullRomCurve3(points.map(vector));
  const rows = 12;
  const sides = 8;
  const frames = curve.computeFrenetFrames(rows, false);
  const positions = [];
  const indices = [];
  for (let row = 0; row <= rows; row++) {
    const time = row / rows;
    const center = curve.getPointAt(time);
    const thickness = radius * (.08 + .92 * Math.sin(Math.PI * time) ** .56) * (1.1 - time * .36);
    for (let side = 0; side <= sides; side++) {
      const angle = side / sides * Math.PI * 2;
      positions.push(...center.clone().addScaledVector(frames.normals[row], Math.cos(angle) * thickness)
        .addScaledVector(frames.binormals[row], Math.sin(angle) * thickness).toArray());
      if (row && side) {
        const prev = (row - 1) * (sides + 1) + side - 1;
        const next = prev + sides + 1;
        indices.push(prev, prev + 1, next, prev + 1, next + 1, next);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function buildHead(root, look) {
  const form = contours[look.face];
  const skin = SKIN_TONES[look.skin];
  const hair = HAIR_COLORS[look.hairColor];
  const color = (tint, roughness = .78) => new THREE.MeshStandardMaterial({ color: tint, roughness });
  const skinMaterial = color(skin);
  const hairMaterial = color(hair, .66);
  const hairHighlight = color(coloured(hair, "#ecddd0", .15), .59);
  const hairShadow = color(coloured(hair, "#211e2f", .23));
  const white = color("#fff3e4", .49);
  const iris = color(EYE_COLORS[look.eyeColor], .46);
  const pupil = color("#241e2d", .36);
  const highlight = new THREE.MeshBasicMaterial({ color: "#fff9ee" });
  const skinShadow = color(coloured(skin, "#82394a", .31));
  const cheeks = color(coloured(skin, "#d9696a", .27));
  const lip = color(coloured(skin, "#642e40", .55));
  const brow = color(coloured(hair, "#3e2933", .42));
  const sphere = new THREE.SphereGeometry(1, 14, 10);

  function mesh(name, geometry, material, position = [0, 0, 0], scale = [1, 1, 1], parent = root) {
    const part = new THREE.Mesh(geometry, material);
    part.name = name;
    part.position.set(...position);
    part.scale.set(...scale);
    parent.add(part);
    return part;
  }
  const rounded = (name, material, position, scale, parent) => mesh(name, sphere, material, position, scale, parent);
  const front = (x, y, extra = 0) => {
    const level = y / form.height;
    const factor = Math.sqrt(Math.max(.02, 1 - level ** 2 - (x / widthAt(form, level)) ** 2));
    return [x, y, -form.depth * factor - extra];
  };
  function line(name, material, points, radius) {
    return mesh(name, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(vector)), 12, radius, 6), material);
  }

  const face = mesh("Face skin", skinGeometry(form), skinMaterial);
  face.castShadow = true;
  for (const side of [-1, 1]) {
    rounded("Ear", skinMaterial, [side * (form.width - .008), -.043, -.002], [.067, .091, .046]).rotation.z = -side * .14;
    rounded("Ear fold", skinShadow, [side * (form.width + .016), -.041, -.036], [.025, .051, .013]);
    const [wide, tall, tilt] = eyeShapes[look.eyes];
    const x = side * .103;
    const y = .028;
    const eye = new THREE.Group();
    eye.name = side < 0 ? "Left eye" : "Right eye";
    eye.position.set(...front(x, y, .009));
    eye.rotation.y = -side * .27;
    eye.rotation.z = -side * tilt;
    root.add(eye);
    rounded("Eye outline", skinShadow, [0, .001, -.002], [wide * 1.075, tall * 1.08, .014], eye);
    rounded("Eye white", white, [0, -.002, -.005], [wide, tall, .016], eye);
    rounded("Iris", iris, [side * -.004, -.004, -.022], [tall * .67, tall * .73, .009], eye);
    rounded("Pupil", pupil, [side * -.004, -.004, -.030], [tall * .39, tall * .50, .006], eye);
    rounded("Eye sparkle", highlight, [-.009, tall * .24, -.036], [tall * .19, tall * .19, .003], eye);
    rounded("Eye sparkle", highlight, [.008, -tall * .18, -.035], [tall * .095, tall * .095, .003], eye);

    const [arch, lean, bold] = browShapes[look.brows];
    const height = .119 + (look.eyes === 3 ? .013 : 0);
    line("Brow", brow, [front(x - side * .054, height - .006, .013), front(x, height + arch, .015),
      front(x + side * .054, height + lean, .010)], bold);
    rounded("Cheek", cheeks, front(side * .178, -.087, .003), [.041, .020, .004]).rotation.y = side * -.49;
  }
  rounded("Nose", skinMaterial, front(0, -.060, .009), [.043, .047, .040]);
  for (const side of [-1, 1]) rounded("Nostril", skinShadow, front(side * .019, -.086, .026), [.008, .005, .004]);

  const expression = look.mouth;
  if (expression >= 2) {
    const wonder = expression === 3;
    rounded("Mouth", lip, front(0, -.164, .010), wonder ? [.028, .025, .012] : [.055, .023, .013]);
    if (!wonder) rounded("Mouth highlight", white, front(0, -.159, .023), [.037, .007, .004]);
  } else {
    const ends = expression === 0 ? -.149 : -.166;
    line("Mouth", lip, [front(-.042, ends, .012), front(0, -.172, .012), front(.043, ends, .012)], .006);
  }
  addMark(look.mark, { color, skin, front, mesh, rounded, line });
  const cap = mesh("Scalp", scalpGeometry(form, look.hair), hairMaterial);
  cap.castShadow = true;
  const lock = (points, radius, material = hairMaterial) => mesh("Hair lock", sweptLock(points, radius), material);
  styleHair(look.hair, { lock, rounded, hairMaterial, hairHighlight, hairShadow, color });
}

function addMark(style, { color, skin, front, mesh, rounded, line }) {
  if (!style) return;
  if (style === 1) {
    const tint = color(coloured(skin, "#793e4b", .53));
    for (const side of [-1, 1]) {
      for (const [x, y, radius] of [[.123, -.070, .007], [.153, -.061, .006], [.179, -.067, .006], [.160, -.089, .0055], [.195, -.092, .005]]) {
        rounded("Freckle", tint, front(side * x, y, .011), [radius, radius, .004]);
      }
    }
    return;
  }
  const tint = color(["", "", "#ebbbec", "#8ddedc", "#c8e77b", "#e3f8ff", "#ffd37c"][style]);
  if (style === 2 || style === 4) {
    const shape = new THREE.Shape();
    if (style === 2) {
      for (let point = 0; point < 10; point++) {
        const angle = point * Math.PI / 5 + Math.PI / 2;
        const radius = point % 2 ? .013 : .029;
        shape[point ? "lineTo" : "moveTo"](Math.cos(angle) * radius, Math.sin(angle) * radius);
      }
      shape.closePath();
    } else {
      shape.moveTo(0, -.024);
      shape.quadraticCurveTo(-.029, .013, .019, .028);
      shape.quadraticCurveTo(.029, -.013, 0, -.024);
    }
    mesh("Cheek mark", new THREE.ShapeGeometry(shape, 10), tint, front(.169, -.083, .016)).rotation.y = Math.PI - .44;
    return;
  }
  if (style === 3) {
    line("Wave mark", tint, [front(.125, -.089, .016), front(.151, -.066, .016), front(.176, -.084, .016), front(.194, -.079, .016)], .006);
    line("Wave mark", tint, [front(.134, -.108, .016), front(.158, -.092, .016), front(.185, -.103, .016)], .004);
    return;
  }
  const x = .165;
  const y = -.084;
  if (style === 6) rounded("Sun mark", tint, front(x, y, .017), [.015, .015, .005]);
  for (let step = 0; step < 6; step++) {
    const angle = step * Math.PI / 3;
    const ray = (radius) => front(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius, .017);
    line("Cheek mark", tint, [ray(style === 5 ? 0 : .021), ray(.025), ray(.031)], .0035);
  }
}

function styleHair(style, { lock, rounded, hairMaterial, hairHighlight, hairShadow, color }) {
  if (style === 0 || style === 6) {
    const direction = style === 0 ? 1 : -1;
    lock([[.17 * direction, .32, -.048], [.085 * direction, .355, -.180], [-.060 * direction, .280, -.226], [-.235 * direction, .169, -.164]], .080);
    lock([[.132 * direction, .365, -.016], [.025 * direction, .386, -.140], [-.115 * direction, .313, -.209], [-.240 * direction, .257, -.139]], .048, hairHighlight);
    lock([[.152 * direction, .319, -.082], [.210 * direction, .230, -.179], [.232 * direction, .126, -.166]], .060);
    if (style === 6) lock([[.177, .320, .042], [.071, .415, -.018], [-.026, .439, -.104], [-.134, .356, -.212]], .048, hairHighlight);
  } else if (style === 1) {
    rounded("Crown knot", hairShadow, [.012, .36, .075], [.103, .071, .100]);
    rounded("Crown knot", hairMaterial, [.013, .418, .079], [.104, .083, .106]);
    const tie = color("#cfaa72", .48);
    rounded("Hair tie", tie, [.012, .374, .081], [.109, .014, .108]);
    lock([[-.231, .163, -.138], [-.122, .253, -.204], [.020, .292, -.214], [.186, .278, -.121]], .036, hairHighlight);
  } else if (style === 2) {
    for (const side of [-1, 1]) {
      lock([[side * .139, .255, .124], [side * .248, .133, .049], [side * .268, -.062, -.031], [side * .205, -.237, -.104]], .081);
      lock([[side * .188, .232, .029], [side * .230, .123, -.114], [side * .217, -.045, -.164]], .073, hairHighlight);
    }
    lock([[.118, .345, -.063], [-.018, .301, -.202], [-.133, .213, -.233], [-.198, .156, -.166]], .078);
  } else if (style === 3) {
    lock([[-.14, .35, -.015], [.018, .328, -.177], [.192, .230, -.162], [.260, .112, -.122]], .078, hairHighlight);
    lock([[.036, .292, .199], [.147, .129, .264], [.147, -.082, .324], [.080, -.273, .263], [.154, -.420, .143]], .097);
    lock([[.084, .269, .227], [.175, .080, .302], [.159, -.114, .338], [.124, -.290, .248]], .035, hairHighlight);
  } else if (style === 4) {
    const tie = color("#c4db81", .53);
    lock([[.187, .308, -.088], [.048, .309, -.203], [-.097, .253, -.217], [-.218, .166, -.148]], .063, hairHighlight);
    for (const side of [-1, 1]) {
      for (let link = 0; link < 5; link++) {
        const twist = (link % 2 ? -.019 : .018) * side;
        rounded("Woven braid", link % 2 ? hairShadow : hairMaterial, [side * (.270 - link * .006) + twist, -.002 - link * .076, .049 - link * .008],
          [.053 - link * .004, .059 - link * .004, .056 - link * .004]).rotation.z = .45 * (link % 2 ? 1 : -1) * side;
      }
      rounded("Braid band", tie, [side * .25, -.334, .016], [.038, .012, .038]);
      rounded("Braid tip", hairMaterial, [side * .247, -.367, .011], [.039, .056, .034]);
    }
  } else {
    for (let tuft = 0; tuft < 9; tuft++) {
      const angle = tuft * Math.PI * 2 / 9;
      const x = Math.sin(angle) * .204;
      const z = Math.cos(angle) * .176;
      rounded("Cloud curl", tuft % 3 ? hairMaterial : hairHighlight, [x, .259 + Math.sin(tuft * 2.1) * .027, z], [.100, .094, .101]);
    }
    rounded("Cloud curl", hairMaterial, [-.021, .346, .018], [.143, .094, .145]);
    lock([[-.153, .320, -.129], [-.144, .307, -.225], [-.083, .225, -.254]], .064, hairHighlight);
  }
}

export function createFaceRig({ hero, appearance } = {}) {
  const root = new THREE.Group();
  root.name = "Face rig";
  let current = "";

  function dispose() {
    const geometries = new Set();
    const materials = new Set();
    root.traverse((item) => {
      if (item.geometry) geometries.add(item.geometry);
      if (item.material) materials.add(item.material);
    });
    root.clear();
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    current = "";
  }

  function setAppearance(id, raw) {
    const look = normalizeAppearance(id, raw);
    const key = Object.values(look).join("/");
    if (key === current) return;
    dispose();
    buildHead(root, look);
    current = key;
  }

  setAppearance(hero, appearance);
  return { root, setAppearance, dispose };
}
