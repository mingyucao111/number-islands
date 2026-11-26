import * as THREE from "./vendor/three.module.min.js";

export const stonePositions = Object.freeze([
  Object.freeze([-3.9, 20.6]), Object.freeze([-6.3, 21]), Object.freeze([-8.7, 22.1]),
  Object.freeze([-11.1, 21.45]), Object.freeze([-13.5, 21.05]), Object.freeze([-15.7, 20]),
]);

function makeLabel(text, width = 256) {
  const surface = document.createElement("canvas");
  surface.width = width;
  surface.height = 96;
  const context = surface.getContext("2d");
  context.fillStyle = "#203b30";
  context.beginPath();
  context.roundRect(7, 12, width - 14, 70, 18);
  context.fill();
  context.strokeStyle = "#e9c875";
  context.lineWidth = 3;
  context.stroke();
  context.fillStyle = "#fff4d6";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = "700 33px Georgia";
  context.fillText(text, width / 2, 47);
  const texture = new THREE.CanvasTexture(surface);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthWrite: false }));
  sprite.scale.set(width / 160, .62, 1);
  return sprite;
}

function stoneBase(root, point) {
  const stone = new THREE.Mesh(new THREE.CylinderGeometry(.48, .64, .72, 7), new THREE.MeshStandardMaterial({ color: 0x7d8c70, roughness: .98 }));
  stone.position.set(point.x, point.y + .35, point.z);
  stone.castShadow = true;
  stone.receiveShadow = true;
  root.add(stone);
}

export function buildWaystones(root, routes, terrain) {
  return routes.map((route, index) => {
    const [x, z] = stonePositions[index];
    const y = terrain.heightAt(x, z);
    const point = { x, y, z };
    stoneBase(root, point);

    const stone = new THREE.Mesh(new THREE.OctahedronGeometry(.28, 0),
      new THREE.MeshStandardMaterial({ color: 0xebc677, emissive: 0x73551c, emissiveIntensity: .2, roughness: .38 }));
    stone.scale.set(.8, 1.2, .8);
    stone.position.set(x, y + 1.22, z);
    root.add(stone);
    const label = makeLabel(route.grade);
    label.position.set(x, y + 1.85, z);
    root.add(label);
    return {
      id: route.id, point, label: route.grade,
      update(time, selected) {
        stone.rotation.y = time * .6 + index;
        stone.position.y = y + 1.22 + Math.sin(time * 1.8 + index) * .08;
        stone.material.emissiveIntensity = selected ? .63 : .15;
      },
    };
  });
}

export function buildPassage(root, point, text, tint = 0xe0ba69) {
  const group = new THREE.Group();
  group.position.set(point.x, point.y, point.z);
  const stone = new THREE.MeshStandardMaterial({ color: 0x74836d, roughness: .95 });
  const border = new THREE.MeshStandardMaterial({ color: tint, emissive: tint, emissiveIntensity: .41, roughness: .66 });
  for (const side of [-1, 1]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(.42, 2.1, .52), stone);
    pillar.position.set(side * 1.12, 1.04, 0);
    pillar.castShadow = true;
    group.add(pillar);
  }
  const arch = new THREE.Mesh(new THREE.TorusGeometry(1.1, .15, 8, 24, Math.PI), stone);
  arch.position.y = 2.06;
  group.add(arch);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(.7, .043, 7, 36), border);
  rim.position.y = 1.32;
  group.add(rim);
  if (text) {
    const label = makeLabel(text, 340);
    label.position.y = 3.66;
    group.add(label);
  }
  root.add(group);
  return {
    set visible(value) { group.visible = value; },
    update(time) { rim.rotation.y = time * .44; rim.position.y = 1.32 + Math.sin(time * 2.1) * .11; },
  };
}

export function buildHeroShrines(root, heroes, terrain) {
  const locations = [[4.4, 22], [7, 21.8], [9.6, 21]];
  return [heroes.gale, heroes.warden, heroes.ember].map((hero, index) => {
    const [x, z] = locations[index];
    const y = terrain.heightAt(x, z);
    const point = { x, y, z };
    stoneBase(root, point);
    const colour = [0x6fdfc3, 0xf5cb72, 0xffa589][index];
    const symbol = new THREE.Mesh(index === 1 ? new THREE.DodecahedronGeometry(.33) : new THREE.OctahedronGeometry(.36),
      new THREE.MeshStandardMaterial({ color: colour, emissive: colour, emissiveIntensity: .18, roughness: .4 }));
    const name = makeLabel(hero.name, 292);
    symbol.position.set(x, y + 1.08, z);
    name.position.set(x, y + 1.88, z);
    root.add(symbol, name);
    return { hero, point, update(time, selected) {
      symbol.rotation.y = time * .74 + index;
      symbol.position.y = y + 1.1 + Math.sin(time * 2 + index) * .08;
      symbol.material.emissiveIntensity = selected ? .58 : .16;
    } };
  });
}

export function buildHeroMirror(root, point) {
  const mirror = new THREE.Group();
  mirror.position.set(point.x, point.y, point.z);
  stoneBase(mirror, { x: 0, y: 0, z: 0 });
  const frame = new THREE.Mesh(new THREE.TorusGeometry(.67, .072, 9, 42),
    new THREE.MeshStandardMaterial({ color: 0xe8c58a, metalness: .3, roughness: .33 }));
  frame.scale.y = 1.18;
  frame.position.y = 1.34;
  const surface = new THREE.Mesh(new THREE.CircleGeometry(.63, 42),
    new THREE.MeshStandardMaterial({ color: 0x4d9e86, emissive: 0x3b7a69, emissiveIntensity: .48,
      roughness: .27, metalness: .18, side: THREE.DoubleSide }));
  surface.scale.y = 1.18;
  surface.position.y = 1.34;
  const spark = new THREE.Mesh(new THREE.OctahedronGeometry(.14),
    new THREE.MeshStandardMaterial({ color: 0xe0f4bb, emissive: 0xb6eca0, emissiveIntensity: .53 }));
  spark.position.set(0, 1.35, .18);
  const label = makeLabel("Hero Mirror", 304);
  label.position.y = 2.57;
  mirror.add(frame, surface, spark, label);
  root.add(mirror);
  return {
    update(time) {
      spark.rotation.y = time * 1.1;
      spark.position.y = 1.35 + Math.sin(time * 1.6) * .09;
    },
  };
}
