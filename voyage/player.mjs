import * as THREE from "./vendor/three.module.min.js";

const WALK_SPEED = 4.25;
const RUN_SPEED = 7.1;
const GRAVITY = 16;
const STEP_UP = 0.43;
const STEP_DOWN = 0.58;

const motionKeys = new Set([
  "KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
  "ShiftLeft", "ShiftRight", "KeyQ", "KeyR", "KeyE", "Space",
]);

const smoothing = (rate, dt) => 1 - Math.exp(-rate * dt);
const lerp = (from, to, amount) => from + (to - from) * amount;
const wrapAngle = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
const clamp = (value, lower, upper) => Math.max(lower, Math.min(upper, value));

function createExplorer() {
  const fabric = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.86, flatShading: true });
  const leaf = fabric(0x315944);
  const hoodMaterial = fabric(0x69835c);
  const linen = fabric(0xe4cb87);
  const ochre = fabric(0xbd8c50);
  const leather = fabric(0x76513b);
  const sole = fabric(0x352d2b);
  const trouser = fabric(0x44534d);
  const face = fabric(0xe5b58a);
  const eye = fabric(0x3a2d29);
  const brass = new THREE.MeshStandardMaterial({ color: 0xf2c36a, roughness: 0.42, metalness: 0.34 });
  const headShape = new THREE.SphereGeometry(1, 14, 10);
  const limbShape = new THREE.CapsuleGeometry(1, 1, 4, 12);
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const root = new THREE.Group();
  const model = new THREE.Group();
  root.name = "Keeper of the Last Light";
  root.add(model);

  function mesh(parent, geometry, material, position, scale, shadows = true) {
    const part = new THREE.Mesh(geometry, material);
    part.position.set(...position);
    part.scale.set(...scale);
    part.castShadow = shadows;
    parent.add(part);
    return part;
  }

  const torso = new THREE.CylinderGeometry(0.225, 0.305, 0.52, 14);
  mesh(model, torso, leaf, [0, 1.02, 0.01], [1, 1, 0.73]);
  mesh(model, headShape, hoodMaterial, [0, 1.29, 0.015], [0.321, 0.105, 0.21]);
  const belt = new THREE.CylinderGeometry(0.281, 0.284, 0.079, 14);
  mesh(model, belt, leather, [0, 0.91, 0.007], [1, 1, 0.76]);
  mesh(model, cube, brass, [0.02, 0.91, -0.208], [0.084, 0.067, 0.027], false);
  mesh(model, headShape, linen, [0, 1.32, -0.065], [0.194, 0.094, 0.191]);
  mesh(model, headShape, hoodMaterial, [0, 1.54, 0.036], [0.278, 0.3, 0.264]);
  mesh(model, headShape, leaf, [0, 1.515, -0.114], [0.228, 0.232, 0.14]);
  mesh(model, headShape, face, [0, 1.501, -0.178], [0.176, 0.184, 0.111]);
  mesh(model, headShape, face, [0, 1.482, -0.279], [0.035, 0.035, 0.038], false);
  for (const side of [-1, 1]) {
    mesh(model, headShape, eye, [side * 0.067, 1.525, -0.279], [0.019, 0.022, 0.011], false);
  }
  mesh(model, headShape, leather, [0, 1.43, -0.277], [0.032, 0.011, 0.009], false);
  const clasp = mesh(model, headShape, brass, [0.159, 1.32, -0.203], [0.043, 0.043, 0.019], false);
  clasp.rotation.z = -0.2;

  const satchel = new THREE.Group();
  satchel.position.set(-0.307, 0.944, 0.086);
  satchel.rotation.z = -0.18;
  model.add(satchel);
  mesh(satchel, cube, leather, [0, -0.085, 0.013], [0.17, 0.222, 0.215]);
  mesh(satchel, cube, ochre, [0, -0.01, 0.09], [0.175, 0.082, 0.095]);
  mesh(satchel, headShape, brass, [0, -0.055, 0.147], [0.029, 0.029, 0.017], false);
  const strap = mesh(model, cube, leather, [-0.095, 1.126, -0.183], [0.052, 0.42, 0.028], false);
  strap.rotation.z = -0.51;

  const legs = [];
  const arms = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.123, 0.785, 0.025);
    model.add(leg);
    legs.push(leg);
    mesh(leg, limbShape, trouser, [0, -0.267, 0], [0.106, 0.176, 0.113]);
    mesh(leg, limbShape, leather, [0, -0.577, 0.004], [0.106, 0.095, 0.101]);
    mesh(leg, cube, leather, [0, -0.683, -0.062], [0.215, 0.136, 0.319]);
    mesh(leg, cube, sole, [0, -0.756, -0.062], [0.219, 0.052, 0.324], false);

    const arm = new THREE.Group();
    arm.position.set(side * 0.253, 1.256, 0.007);
    arm.rotation.z = side * 0.19;
    model.add(arm);
    arms.push(arm);
    mesh(arm, limbShape, leaf, [0, -0.16, 0], [0.088, 0.128, 0.091]);
    mesh(arm, limbShape, leather, [0, -0.304, 0], [0.076, 0.066, 0.079]);
    mesh(arm, headShape, face, [0, -0.413, -0.019], [0.072, 0.083, 0.07]);
  }

  const capeMaterial = new THREE.MeshStandardMaterial({
    side: THREE.DoubleSide, roughness: 0.88, vertexColors: true,
  });
  const capeRows = 12;
  const capeColumns = 12;
  const capeGeometry = new THREE.PlaneGeometry(1, 1, capeColumns, capeRows);
  const positions = capeGeometry.attributes.position;
  const tones = [];
  for (let row = 0; row <= capeRows; row++) {
    for (let column = 0; column <= capeColumns; column++) {
      const trim = column === 0 || column === capeColumns || row >= capeRows - 1;
      const seam = column === Math.floor(capeColumns / 2);
      const badge = Math.abs(column - capeColumns / 2) + Math.abs(row - 4) <= 1;
      const base = trim || badge ? 0xdfaf62 : seam ? 0x6c8562 : 0x436d54;
      const color = new THREE.Color(base);
      if (!trim && column % 2 === 0) color.multiplyScalar(0.84);
      tones.push(color.r, color.g, color.b);
    }
  }
  capeGeometry.setAttribute("color", new THREE.Float32BufferAttribute(tones, 3));
  const cape = new THREE.Mesh(capeGeometry, capeMaterial);
  cape.frustumCulled = false;
  cape.castShadow = true;
  model.add(cape);

  const cargo = new THREE.Group();
  cargo.name = "Carried cargo";
  cargo.position.set(0.56, 0.94, -0.31);
  model.add(cargo);

  function animateCape(time, speed, glide) {
    for (let row = 0; row <= capeRows; row++) {
      const drape = row / capeRows;
      for (let col = 0; col <= capeColumns; col++) {
        const lateral = col / capeColumns * 2 - 1;
        const flare = glide * drape * 0.48;
        const width = lerp(0.23, 0.377, drape) + flare;
        const scallop = Math.cos(lateral * Math.PI * 3.4) * 0.037 * drape;
        const wind = Math.sin(time * (3.9 + speed * 0.18) - drape * 4 + lateral * 2.4) * 0.038 * drape;
        const y = 1.31 - drape * 0.93 - Math.abs(lateral) * 0.075 + glide * drape * 0.65;
        const z = 0.16 + drape * (0.084 + speed * 0.035 + glide * 0.16) - lateral ** 2 * 0.085 + scallop + wind;
        positions.setXYZ(row * (capeColumns + 1) + col, lateral * width, y, z);
      }
    }
    positions.needsUpdate = true;
    capeGeometry.computeVertexNormals();
  }

  animateCape(0, 0, 0);
  return { root, model, arms, legs, cargo, animateCape };
}

function makeContactShadow() {
  const size = 32;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const radius = Math.hypot((x + 0.5) / size * 2 - 1, (y + 0.5) / size * 2 - 1);
      const offset = (y * size + x) * 4;
      pixels[offset] = 27;
      pixels[offset + 1] = 40;
      pixels[offset + 2] = 33;
      pixels[offset + 3] = Math.round(185 * Math.max(0, 1 - radius) ** 1.45);
    }
  }
  const map = new THREE.DataTexture(pixels, size, size);
  map.magFilter = THREE.LinearFilter;
  map.minFilter = THREE.LinearFilter;
  map.colorSpace = THREE.SRGBColorSpace;
  map.needsUpdate = true;
  const material = new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.12, 0.92), material);
  shadow.rotation.x = -Math.PI / 2;
  return shadow;
}

export function createPlayer({
  scene, camera, canvas, world, spawn = { x: 0, z: 24, yaw: 0 },
}) {
  const explorer = createExplorer();
  const shadow = makeContactShadow();
  scene.add(explorer.root, shadow);
  const position = explorer.root.position;
  const document = canvas.ownerDocument;
  const view = document.defaultView;
  const signal = new AbortController();
  const listen = (target, name, fn, options = {}) => target?.addEventListener(name, fn, { ...options, signal: signal.signal });

  const keys = new Set();
  const axes = new THREE.Vector2();
  const stick = document.querySelector("[data-voyage-stick]");
  const thumb = stick?.querySelector("[data-voyage-thumb]");
  const interact = document.querySelector("[data-voyage-action]");
  const jumpButton = document.querySelector("[data-voyage-jump]");
  const look = document.querySelector("[data-voyage-look]") ?? canvas;
  const motion = new THREE.Vector2();
  const wanted = new THREE.Vector2();
  const aim = new THREE.Vector3();
  const smoothAim = new THREE.Vector3();
  const cameraTarget = new THREE.Vector3();
  const cameraProbe = new THREE.Vector3();
  let yaw = spawn.yaw ?? 0;
  let pitch = 0.38;
  let yawTarget = yaw;
  let pitchTarget = pitch;
  let poseYaw = yaw;
  let floor = 0;
  let clock = 0;
  let pace = 0;
  let verticalSpeed = 0;
  let glideBlend = 0;
  let windGlide = false;
  let jumpPressed = false;
  let mobileJump = false;
  let actionQueued = false;
  let carried = null;
  let stickPointer = null;
  let lookPointer = null;

  function setCarried(object) {
    if (object === carried) return;
    if (carried) scene.attach(carried);
    carried = object ?? null;
    if (!carried) return;
    explorer.cargo.add(carried);
    carried.position.set(0, 0, 0);
    carried.quaternion.identity();
  }

  function takeInteract() {
    const queued = actionQueued;
    actionQueued = false;
    return queued;
  }

  function setWindGlide(enabled) {
    windGlide = Boolean(enabled);
  }

  function isFormControl(target) {
    return Boolean(target?.closest?.("textarea, input, select, [contenteditable=true]"));
  }

  listen(view, "keydown", (event) => {
    if (!motionKeys.has(event.code) || isFormControl(event.target)) return;
    if (event.code === "Space" && event.target?.closest?.("button")) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    event.preventDefault();
    keys.add(event.code);
    if (event.repeat) return;
    if (event.code === "Space") jumpPressed = true;
    if (event.code === "KeyE") actionQueued = true;
  });
  listen(view, "keyup", (event) => keys.delete(event.code));

  function clearInput() {
    keys.clear();
    axes.set(0, 0);
    stickPointer = null;
    lookPointer = null;
    jumpPressed = false;
    mobileJump = false;
    actionQueued = false;
    if (thumb) thumb.style.translate = "0 0";
  }

  listen(view, "blur", clearInput);
  listen(document, "visibilitychange", () => { if (document.hidden) clearInput(); });
  listen(interact, "click", () => { actionQueued = true; });
  listen(jumpButton, "pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    jumpButton.setPointerCapture?.(event.pointerId);
    jumpPressed = true;
    mobileJump = true;
  });
  for (const event of ["pointerup", "pointercancel", "lostpointercapture"]) {
    listen(jumpButton, event, () => { mobileJump = false; });
  }
  listen(jumpButton, "click", (event) => { if (event.detail === 0) jumpPressed = true; });

  // Both pointer sources work with touch, pen, and mouse.
  function moveStick(event) {
    if (event.pointerId !== stickPointer) return;
    const bounds = stick.getBoundingClientRect();
    const radius = Math.max(16, Math.min(bounds.width, bounds.height) * 0.39);
    axes.set((event.clientX - bounds.left - bounds.width / 2) / radius,
      (event.clientY - bounds.top - bounds.height / 2) / radius).clampLength(0, 1);
    if (thumb) thumb.style.translate = `${axes.x * radius}px ${axes.y * radius}px`;
  }
  listen(stick, "pointerdown", (event) => {
    if (event.button !== 0 || stickPointer !== null) return;
    event.preventDefault();
    stickPointer = event.pointerId;
    stick.setPointerCapture?.(event.pointerId);
    moveStick(event);
  });
  listen(stick, "pointermove", moveStick);
  for (const event of ["pointerup", "pointercancel", "lostpointercapture"]) {
    listen(stick, event, (input) => {
      if (input.pointerId !== stickPointer) return;
      stickPointer = null;
      axes.set(0, 0);
      if (thumb) thumb.style.translate = "0 0";
    });
  }

  listen(look, "contextmenu", (event) => event.preventDefault());
  listen(look, "pointerdown", (event) => {
    if ((event.button !== 0 && event.button !== 2) || lookPointer) return;
    lookPointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    look.setPointerCapture?.(event.pointerId);
    if (event.pointerType !== "touch") canvas.focus?.({ preventScroll: true });
  });
  listen(look, "pointermove", (event) => {
    if (event.pointerId !== lookPointer?.id) return;
    yawTarget = wrapAngle(yawTarget - (event.clientX - lookPointer.x) * 0.0064);
    pitchTarget = clamp(pitchTarget + (event.clientY - lookPointer.y) * 0.0047, 0.16, 0.9);
    lookPointer.x = event.clientX;
    lookPointer.y = event.clientY;
  });
  for (const event of ["pointerup", "pointercancel", "lostpointercapture"]) {
    listen(look, event, (input) => { if (input.pointerId === lookPointer?.id) lookPointer = null; });
  }

  function slide(dx, dz) {
    if (!dx && !dz) return true;
    const x = position.x + dx;
    const z = position.z + dz;
    if (!world.canWalk(x, z)) return false;
    const nextFloor = world.heightAt(x, z);
    if (!Number.isFinite(nextFloor) || nextFloor - floor > STEP_UP || (!windGlide && floor - nextFloor > STEP_DOWN)) {
      return false;
    }
    floor = nextFloor;
    position.x = x;
    position.z = z;
    return true;
  }

  function updateCamera(dt, snap = false) {
    const blend = snap ? 1 : smoothing(8.5, dt);
    const distance = 5.75 + glideBlend * 1.1;
    const horizontal = Math.cos(pitch) * distance;
    aim.set(position.x - 0.85 * Math.sin(yaw), position.y + 1.28, position.z - 0.85 * Math.cos(yaw));
    smoothAim.lerp(aim, blend);
    cameraTarget.set(
      position.x + horizontal * Math.sin(yaw) + 0.63 * Math.cos(yaw),
      position.y + 2 + Math.sin(pitch) * distance,
      position.z + horizontal * Math.cos(yaw) - 0.63 * Math.sin(yaw),
    );

    for (let i = 2; i <= 7; i++) {
      const t = i / 7;
      cameraProbe.lerpVectors(aim, cameraTarget, t);
      const obstruction = world.cameraHeight?.(cameraProbe.x, cameraProbe.z) ?? world.heightAt(cameraProbe.x, cameraProbe.z);
      if (Number.isFinite(obstruction) && obstruction + 0.23 > cameraProbe.y) {
        cameraTarget.y += (obstruction + 0.3 - cameraProbe.y) / t;
      }
    }

    camera.position.lerp(cameraTarget, blend);
    camera.lookAt(smoothAim);
  }

  function reset() {
    clearInput();
    position.set(spawn.x, world.heightAt(spawn.x, spawn.z), spawn.z);
    floor = position.y;
    motion.set(0, 0);
    yaw = spawn.yaw ?? 0;
    yawTarget = poseYaw = yaw;
    pitch = pitchTarget = 0.38;
    verticalSpeed = glideBlend = pace = 0;
    explorer.root.rotation.y = yaw;
    explorer.model.position.y = 0;
    setCarried(null);
    updateShadow();
    updateCamera(0, true);
  }

  function updateShadow() {
    const airborne = Math.max(0, position.y - floor);
    shadow.position.set(position.x, floor + 0.025, position.z);
    shadow.material.opacity = 0.65 / (1 + airborne * 1.9);
    shadow.scale.setScalar(1 + airborne * 0.26);
  }

  function update(delta) {
    const dt = clamp(delta, 0, 0.075);
    if (!dt) return;
    clock += dt;
    if (keys.has("KeyQ")) yawTarget += dt * 1.75;
    if (keys.has("KeyR")) yawTarget -= dt * 1.75;
    yaw = wrapAngle(yaw + wrapAngle(yawTarget - yaw) * smoothing(16, dt));
    pitch = lerp(pitch, pitchTarget, smoothing(16, dt));

    const sideways = Number(keys.has("KeyD") || keys.has("ArrowRight")) - Number(keys.has("KeyA") || keys.has("ArrowLeft")) + axes.x;
    const forward = Number(keys.has("KeyW") || keys.has("ArrowUp")) - Number(keys.has("KeyS") || keys.has("ArrowDown")) - axes.y;
    const running = keys.has("ShiftLeft") || keys.has("ShiftRight");
    const speed = carried ? WALK_SPEED * 0.75 : running ? RUN_SPEED : WALK_SPEED;
    wanted.set(sideways * Math.cos(yaw) - forward * Math.sin(yaw),
      -sideways * Math.sin(yaw) - forward * Math.cos(yaw)).clampLength(0, 1).multiplyScalar(speed);
    motion.lerp(wanted, smoothing(wanted.lengthSq() ? 18 : 23, dt));
    if (motion.lengthSq() < 0.003) motion.set(0, 0);

    const previousFloor = floor;
    const previousX = position.x;
    const previousZ = position.z;
    const grounded = position.y <= floor + 0.035 && verticalSpeed <= 0;
    if (!slide(motion.x * dt, motion.y * dt)) {
      slide(motion.x * dt, 0);
      slide(0, motion.y * dt);
    }
    const moved = Math.hypot(position.x - previousX, position.z - previousZ) / dt;
    const jumpNow = grounded && jumpPressed;
    if (jumpNow) verticalSpeed = carried ? 3.8 : 5.1;
    jumpPressed = false;
    const gliding = windGlide && !carried && verticalSpeed <= 0 && position.y - floor > 0.12
      && (keys.has("Space") || mobileJump);
    glideBlend = lerp(glideBlend, Number(gliding), smoothing(10, dt));

    if (grounded && !jumpNow && previousFloor - floor < STEP_DOWN) {
      position.y = floor;
      verticalSpeed = 0;
    } else {
      verticalSpeed -= dt * (gliding ? GRAVITY * 0.22 : GRAVITY);
      if (gliding) verticalSpeed = Math.max(-1.6, verticalSpeed);
      position.y = Math.max(floor, position.y + verticalSpeed * dt);
      if (position.y === floor) verticalSpeed = 0;
    }

    if (wanted.lengthSq() > 0.05) {
      const desiredYaw = Math.atan2(-wanted.x, -wanted.y);
      poseYaw = wrapAngle(poseYaw + wrapAngle(desiredYaw - poseYaw) * smoothing(14, dt));
    }
    explorer.root.rotation.y = poseYaw;
    const airborne = position.y > floor + 0.085;
    const motionBlend = Math.min(1, moved / WALK_SPEED);
    pace += dt * moved * 3.2;
    explorer.model.position.y = !airborne ? (0.5 - Math.cos(pace * 2) * 0.5) * motionBlend * 0.049 : 0;
    const phase = Math.sin(pace);
    for (let i = 0; i < 2; i++) {
      const direction = i === 0 ? -1 : 1;
      const step = phase * direction * motionBlend;
      const legTarget = airborne ? -0.23 + direction * 0.17 - glideBlend * 0.14 : step * 0.62;
      const hold = carried && i === 1;
      const armTarget = hold ? -1.02 : airborne ? -0.28 - glideBlend * 0.35 : -step * 0.48;
      explorer.legs[i].rotation.x = lerp(explorer.legs[i].rotation.x, legTarget, smoothing(16, dt));
      explorer.arms[i].rotation.x = lerp(explorer.arms[i].rotation.x, armTarget, smoothing(16, dt));
      explorer.arms[i].rotation.z = lerp(explorer.arms[i].rotation.z, direction * (0.19 + glideBlend * 0.83), smoothing(8, dt));
    }
    explorer.animateCape(clock, moved, glideBlend);
    updateShadow();
    updateCamera(dt);
  }

  function dispose() {
    signal.abort();
    setCarried(null);
    explorer.root.removeFromParent();
    shadow.removeFromParent();
    shadow.geometry.dispose();
    shadow.material.map.dispose();
    shadow.material.dispose();
    const geometries = new Set();
    const materials = new Set();
    explorer.root.traverse((object) => {
      if (!object.isMesh) return;
      geometries.add(object.geometry);
      materials.add(object.material);
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
  }

  reset();
  return { position, setCarried, setWindGlide, takeInteract, update, reset, dispose };
}
