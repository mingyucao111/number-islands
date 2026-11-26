import * as THREE from "./vendor/three.module.min.js";
import { HEROES } from "./combat-rules.mjs";
import { APPEARANCE_FIELDS, defaultAppearance, normalizeAppearance } from "./appearance.mjs";
import { createFaceRig } from "./face-rig.mjs";
import { SIGNATURE_LEVEL, SIGNATURE_PRICE } from "./hero-growth.mjs";

const get = (id) => document.getElementById(id);
const roles = {
  gale: ["Wind scout", "Move quickly, shorten recharges and cut through shields."],
  warden: ["Stone guardian", "Raise wards, clear embers and help your teammate stay in the fight."],
  ember: ["Ember keeper", "Restore health and leave embers that keep damaging your rival."],
  tide: ["Wave breaker", "Wash away enemy shields and slow their skill recharges."],
  thorn: ["Briar ranger", "Mark rivals so the next allied strike hits harder."],
  echo: ["Moon duelist", "Reach distant rivals and speed a nearby ally's skills."],
  frost: ["Winter striker", "Chill rivals, then follow with a shattering strike."],
};

function createPortrait(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.14;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, .1, 15);
  camera.position.set(0, .10, -3.10);
  camera.lookAt(0, -.11, 0);
  const key = new THREE.DirectionalLight(0xffebc9, 2.1);
  key.position.set(-2, 3, -3);
  const rim = new THREE.DirectionalLight(0xb0e6ff, 1.4);
  rim.position.set(2, 2, 3);
  scene.add(new THREE.HemisphereLight(0xf4fff0, 0x557263, 2.4), key, rim);

  const bust = new THREE.Group();
  const face = createFaceRig({ hero: "gale", appearance: defaultAppearance("gale") });
  bust.add(face.root);
  const fabric = new THREE.MeshStandardMaterial({ color: HEROES.gale.color, roughness: .87, flatShading: true });
  const brass = new THREE.MeshStandardMaterial({ color: 0xf0d397, metalness: .28, roughness: .47 });
  const shoulders = new THREE.Mesh(new THREE.CylinderGeometry(.21, .63, .72, 10), fabric);
  shoulders.position.y = -.70;
  shoulders.scale.z = .69;
  const collar = new THREE.Mesh(new THREE.TorusGeometry(.22, .045, 8, 20), brass);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = -.37;
  const pin = new THREE.Mesh(new THREE.OctahedronGeometry(.092), brass);
  pin.position.set(-.08, -.57, -.21);
  bust.add(shoulders, collar, pin);
  scene.add(bust);

  let width = 0;
  let height = 0;
  let angle = 0;
  function draw() {
    const w = Math.max(1, canvas.clientWidth);
    const h = Math.max(1, canvas.clientHeight);
    if (width !== w || height !== h) {
      width = w;
      height = h;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    bust.rotation.y = angle;
    renderer.render(scene, camera);
  }
  return {
    draw,
    turn(difference) {
      angle = THREE.MathUtils.clamp(angle + difference, -1.45, 1.45);
      draw();
    },
    update(hero, appearance) {
      face.setAppearance(hero.id, appearance);
      fabric.color.set(hero.color).multiplyScalar(.72);
      draw();
    },
  };
}

export function createHeroGallery({ appearanceFor, heroProgress, onSave, onTrain, onDismiss }) {
  const dialog = get("hero-gallery");
  const list = get("gallery-heroes");
  const canvas = get("gallery-preview");
  const status = get("gallery-status");
  const save = get("gallery-save");
  const train = get("gallery-train");
  const choices = new Map();
  const drafts = new Map();
  let selected = "gale";
  let starting = selected;
  let preview;
  let drawingUnavailable = false;
  let drag;

  for (const hero of Object.values(HEROES)) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.hero = hero.id;
    button.textContent = hero.name;
    button.style.setProperty("--hero-color", hero.color);
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", () => {
      selected = hero.id;
      status.textContent = "";
      refresh();
    });
    list.append(button);
  }

  const fields = get("gallery-face-fields");
  for (const field of APPEARANCE_FIELDS) {
    const row = document.createElement("label");
    const title = document.createElement("span");
    title.textContent = field.label;
    row.append(title);
    if (field.swatches) {
      const color = document.createElement("span");
      color.className = "gallery-swatch";
      color.setAttribute("aria-hidden", "true");
      title.append(" ", color);
    }
    const select = document.createElement("select");
    select.dataset.faceField = field.id;
    field.options.forEach((label, index) => select.add(new Option(label, String(index))));
    select.addEventListener("change", () => {
      const draft = normalizeAppearance(selected, { ...currentFace(), [field.id]: Number(select.value) });
      drafts.set(selected, draft);
      setSwatch(field, select);
      showPortrait();
      status.textContent = "";
    });
    choices.set(field.id, select);
    row.append(select);
    fields.append(row);
  }

  function currentFace() { return drafts.get(selected) ?? normalizeAppearance(selected, appearanceFor(selected)); }

  function setSwatch(field, select) {
    if (!field.swatches) return;
    select.parentElement.querySelector(".gallery-swatch").style.backgroundColor = field.swatches[Number(select.value)];
  }

  function showPortrait() {
    const appearance = currentFace();
    canvas.dataset.hero = selected;
    canvas.dataset.appearance = JSON.stringify(appearance);
    preview?.update(HEROES[selected], appearance);
  }

  function refresh() {
    const hero = HEROES[selected];
    const [role, description] = roles[selected];
    get("gallery-name").textContent = hero.name;
    get("gallery-role").textContent = role;
    get("gallery-info").textContent = description;
    save.textContent = selected === starting ? "Save appearance" : `Play as ${hero.name}`;
    for (const button of list.children) button.setAttribute("aria-pressed", String(button.dataset.hero === selected));
    const appearance = currentFace();
    for (const field of APPEARANCE_FIELDS) {
      const select = choices.get(field.id);
      select.value = String(appearance[field.id]);
      setSwatch(field, select);
    }
    const progress = heroProgress(selected);
    const skills = get("gallery-skills");
    skills.replaceChildren(...hero.skills.map((spell, index) => {
      const row = document.createElement("li");
      const name = document.createElement("strong");
      name.textContent = `${index + 1} · ${spell.name}`;
      const mechanic = document.createElement("span");
      mechanic.textContent = `${spell.damage} damage · ${spell.cooldown}s cooldown`;
      const description = document.createElement("p");
      description.textContent = spell.description;
      if (index === 3 && !progress.signature) {
        mechanic.textContent += ` · Unlock at Lv ${SIGNATURE_LEVEL}`;
      }
      row.append(name, mechanic, description);
      return row;
    }));
    train.hidden = !progress.canLearn;
    train.textContent = `Learn ${hero.skills[3].name} · ${SIGNATURE_PRICE} gold`;
    showPortrait();
  }

  train.addEventListener("click", async () => {
    const hero = selected;
    train.disabled = true;
    try {
      const learned = await onTrain(hero);
      if (!dialog.open || hero !== selected) return;
      if (learned) status.textContent = `${HEROES[hero].skills[3].name} learned.`;
      else status.textContent = "You need enough gold to learn this skill.";
      refresh();
    } finally {
      train.disabled = false;
    }
  });
  save.addEventListener("click", () => {
    onSave(selected, currentFace());
    dialog.close();
  });
  get("gallery-reset").addEventListener("click", () => {
    drafts.set(selected, defaultAppearance(selected));
    refresh();
    status.textContent = "Default features restored. Save to keep them.";
  });
  get("gallery-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    if (dialog.open) return;
    drag = undefined;
    drafts.clear();
    onDismiss();
  });
  canvas.addEventListener("pointerdown", (event) => {
    if (!preview || event.button !== 0) return;
    drag = { pointer: event.pointerId, x: event.clientX };
    canvas.setPointerCapture?.(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (event.pointerId !== drag?.pointer) return;
    preview.turn(-(event.clientX - drag.x) * .009);
    drag.x = event.clientX;
  });
  for (const event of ["pointerup", "pointercancel", "lostpointercapture"]) {
    canvas.addEventListener(event, () => { drag = undefined; });
  }
  canvas.addEventListener("keydown", (event) => {
    if (!preview || !["ArrowLeft", "ArrowRight"].includes(event.code)) return;
    event.preventDefault();
    preview.turn(event.code === "ArrowLeft" ? -.17 : .17);
  });
  new ResizeObserver(() => { if (dialog.open) preview?.draw(); }).observe(canvas);

  return {
    isOpen: () => dialog.open,
    open(id) {
      if (dialog.open) return;
      drafts.clear();
      selected = id;
      starting = id;
      status.textContent = "";
      dialog.showModal();
      if (!preview && !drawingUnavailable) {
        try { preview = createPortrait(canvas); } catch { drawingUnavailable = true; }
      }
      if (drawingUnavailable) status.textContent = "The portrait preview is unavailable on this device.";
      refresh();
      list.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
    },
  };
}
