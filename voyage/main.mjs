import * as THREE from "./vendor/three.module.min.js";
import { buildWorld } from "./world.mjs";
import { createPlayer } from "./player.mjs";
import { createQuest } from "./mission.mjs";
import { createSoundscape } from "./audio.mjs";
import { ROUTES, earnMilestone, nextRoute, rankFor, restoreProgress, totalExperience } from "./progression.mjs";

const SAVE = "number-islands-last-light-v1";
const spawn = { x: 0, z: 24, yaw: 0 };
const get = (id) => document.getElementById(id);

function addSky(scene) {
  const sun = new THREE.Vector3(-.66, .40, -.58).normalize();
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { sun: { value: sun } },
    vertexShader: `
      varying vec3 direction;
      void main() {
        direction = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 sun;
      varying vec3 direction;
      void main() {
        vec3 ray = normalize(direction);
        float horizon = smoothstep(-0.04, 0.65, ray.y);
        vec3 colour = mix(vec3(0.81, 0.88, 0.74), vec3(0.33, 0.61, 0.61), horizon);
        float sunBeam = max(dot(ray, sun), 0.0);
        colour += vec3(0.21, 0.17, 0.09) * pow(sunBeam, 13.0);
        colour += vec3(0.88, 0.72, 0.43) * pow(sunBeam, 470.0);
        gl_FragColor = vec4(colour, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(125, 32, 20), material);
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  scene.add(sky);
  return sky;
}

function lightScene(scene, mobile) {
  const skyLight = new THREE.HemisphereLight(0xfff2cb, 0x617c66, 1.75);
  const direct = new THREE.DirectionalLight(0xffe4a7, 2.0);
  direct.position.set(-29, 31, -15);
  direct.castShadow = true;
  direct.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
  direct.shadow.camera.left = -33;
  direct.shadow.camera.right = 33;
  direct.shadow.camera.top = 37;
  direct.shadow.camera.bottom = -37;
  direct.shadow.camera.near = .8;
  direct.shadow.camera.far = 90;
  direct.shadow.normalBias = .11;
  direct.shadow.bias = -.0005;
  direct.shadow.radius = 2;
  scene.add(skyLight, direct, direct.target);
}

export function startVoyage() {
  const canvas = get("world");
  const mobile = matchMedia("(pointer: coarse)").matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.35 : 1.65));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .99;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xacccb6);
  scene.fog = new THREE.FogExp2(0xc5d8b9, .012);
  const world = buildWorld(scene);
  const sky = addSky(scene);
  lightScene(scene, mobile);
  const camera = new THREE.PerspectiveCamera(57, 1, .09, 175);
  const quest = createQuest({ scene, world, profile: ROUTES[0] });
  const terrain = {
    heightAt: world.heightAt,
    canWalk(x, z) { return world.canWalk(x, z) && quest.canPass(x, z); },
  };
  const player = createPlayer({ scene, camera, canvas, world: terrain, spawn });
  const sound = createSoundscape();
  const projection = new THREE.Vector3();
  const viewDirection = new THREE.Vector3();
  const cameraToMarker = new THREE.Vector3();
  const cursor = get("interaction");
  const journal = get("objective");
  const routeSelect = get("route-select");
  const title = get("title-screen");
  const overlay = get("pause-screen");
  const finale = get("ending-screen");
  const hud = get("hud");
  const begin = get("begin");
  let progress;
  try { progress = restoreProgress(JSON.parse(localStorage.getItem(SAVE))); }
  catch { progress = restoreProgress(null); }
  let active = ROUTES.find(({ id }) => id === progress.chosen) ?? ROUTES[0];
  let phase = "title";
  let priorStage = "";
  let noticeUntil = 0;
  let lastNotice = "";
  let earned = 0;
  let lastTime = performance.now();
  let lastHud = 0;
  let reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  function persist() {
    try { localStorage.setItem(SAVE, JSON.stringify(progress)); } catch { /* memory-only if local storage is blocked */ }
  }

  function resize() {
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.fov = width < height ? 64 : 57;
    camera.updateProjectionMatrix();
  }

  function refreshRanks() {
    const xp = totalExperience(progress);
    get("rank-name").textContent = rankFor(xp).name;
    get("rank-xp").textContent = `${xp} XP`;
  }

  function routeSummary() {
    const route = ROUTES.find(({ id }) => id === routeSelect.value) ?? ROUTES[0];
    const completed = (progress.steps[route.id] ?? []).includes("complete");
    const experience = totalExperience(progress);
    get("route-details").textContent = `${completed ? "Voyage completed" : route.name} · ${rankFor(experience).name} · ${experience} XP`;
  }

  function loadRoutes() {
    routeSelect.replaceChildren(...ROUTES.map((route) => {
      const option = document.createElement("option");
      option.value = route.id;
      option.textContent = `${route.grade}  ·  ${route.name}${(progress.steps[route.id] ?? []).includes("complete") ? "  ✓" : ""}`;
      return option;
    }));
    routeSelect.value = active.id;
    routeSummary();
  }

  function setPhase(next) {
    phase = next;
    title.hidden = next !== "title";
    overlay.hidden = next !== "paused";
    finale.hidden = next !== "ending";
    hud.hidden = next !== "active";
    canvas.dataset.phase = next;
    if (next === "active") canvas.focus({ preventScroll: true });
  }

  function start(route) {
    active = route;
    progress.chosen = route.id;
    persist();
    quest.setProfile(route, player);
    player.reset();
    player.setWindGlide(totalExperience(progress) >= 100);
    get("hud-route").textContent = `${route.name} · ${route.grade}`;
    earned = 0;
    priorStage = "";
    noticeUntil = 0;
    lastNotice = "";
    setPhase("active");
    void sound.start();
    refreshRanks();
    noteStage(performance.now());
    refreshHud(performance.now());
  }

  function showTitle() {
    quest.reset(player);
    player.reset();
    loadRoutes();
    setPhase("title");
    begin.focus({ preventScroll: true });
  }

  function complete() {
    const next = nextRoute(active.id);
    get("next-route").hidden = !next;
    get("next-route").textContent = next ? `Next route · ${next.grade}` : "Next route";
    get("ending-progress").textContent = `${earned ? "+" + earned + " XP · " : ""}Wind gliding unlocked. Jump and hold to ride the air.`;
    player.setWindGlide(true);
    sound.play("complete");
    setPhase("ending");
    get("explore").focus({ preventScroll: true });
  }

  function noteStage(now) {
    const state = quest.state;
    if (priorStage === state.stage) return;
    priorStage = state.stage;
    canvas.dataset.stage = priorStage;
    const gain = earnMilestone(progress, active.id, priorStage);
    if (gain.earned) {
      progress = gain.progress;
      earned += gain.earned;
      persist();
      refreshRanks();
      if (priorStage !== "complete") sound.play("advance");
    }
    if (priorStage === "complete") {
      noticeUntil = now + 2800;
      complete();
    }
  }

  function interact() {
    if (phase !== "active" || !quest.interact(player.position, player)) return;
    sound.play();
    const now = performance.now();
    noticeUntil = now + 3700;
    noteStage(now);
    refreshHud(now);
  }

  function markerInFront(loc, verticalOffset) {
    projection.set(loc.x, (loc.y ?? 0) + verticalOffset, loc.z);
    camera.getWorldDirection(viewDirection);
    cameraToMarker.copy(projection).sub(camera.position);
    if (cameraToMarker.dot(viewDirection) <= 0) return false;
    projection.project(camera);
    return Math.abs(projection.x) < .86 && Math.abs(projection.y) < .86;
  }

  function refreshHud(now) {
    if (phase !== "active") return;
    const state = quest.state;
    if (journal.textContent !== state.objective) journal.textContent = state.objective;
    const load = get("quest-load");
    load.hidden = state.stage !== "weights";
    if (!load.hidden) {
      get("counterweight").textContent = `Winch ${state.load} / ${state.target}`;
      get("load-meter").style.setProperty("--meter", `${100 * Math.min(1, state.load / state.target)}%`);
    }
    const carry = get("carry-status");
    carry.hidden = !state.carried;
    if (!carry.hidden) carry.textContent = state.carried === "lens" ? "Carrying the lighthouse lens" : `Carrying a ${state.carriedMarks}-mark weight`;
    const notice = get("notice");
    if (state.notice !== lastNotice) {
      lastNotice = state.notice;
      notice.textContent = lastNotice;
    }
    notice.hidden = !state.notice || now > noticeUntil;

    const pos = player.position;
    const goal = quest.goalForCompass(pos);
    const compass = get("quest-compass");
    compass.hidden = !goal;
    if (goal) {
      camera.getWorldDirection(viewDirection);
      const heading = Math.atan2(goal.x - pos.x, -(goal.z - pos.z)) - Math.atan2(viewDirection.x, -viewDirection.z);
      get("bearing").style.setProperty("--bearing", `${heading}rad`);
      get("distance").textContent = `${Math.round(Math.hypot(goal.x - pos.x, (goal.y ?? 0) - pos.y, goal.z - pos.z))} m`;
    }
    const prompt = quest.getPrompt(pos);
    cursor.hidden = !prompt;
    if (prompt) {
      cursor.querySelector("span").textContent = prompt.label;
      if (markerInFront(prompt.loc, 1.55)) {
        cursor.style.left = `${50 + projection.x * 50}%`;
        cursor.style.top = `${50 - projection.y * 50}%`;
      } else {
        cursor.style.left = "50%";
        cursor.style.top = mobile ? "63%" : "72%";
      }
    }
    canvas.dataset.position = [pos.x, pos.y, pos.z].map((value) => value.toFixed(2)).join(",");
    canvas.dataset.drawCalls = String(renderer.info.render.calls);
  }

  function draw(now) {
    const dt = Math.min(.047, (now - lastTime) / 1000);
    lastTime = now;
    if (phase === "active") {
      player.update(dt);
      if (player.takeInteract()) interact();
      if (now - lastHud >= 85) {
        lastHud = now;
        refreshHud(now);
      }
    }
    const time = reduceMotion ? 12.0 : now * .001;
    world.update(dt, time);
    quest.update(dt, time);
    sky.position.copy(camera.position);
    renderer.render(scene, camera);
    requestAnimationFrame(draw);
  }

  routeSelect.addEventListener("change", routeSummary);
  begin.addEventListener("click", () => start(ROUTES.find(({ id }) => id === routeSelect.value) ?? ROUTES[0]));
  cursor.addEventListener("click", interact);
  get("pause").addEventListener("click", () => { setPhase("paused"); get("continue").focus(); });
  get("continue").addEventListener("click", () => setPhase("active"));
  get("restart").addEventListener("click", () => start(active));
  get("return-title").addEventListener("click", showTitle);
  get("end-title").addEventListener("click", showTitle);
  get("explore").addEventListener("click", () => setPhase("active"));
  get("next-route").addEventListener("click", () => {
    const next = nextRoute(active.id);
    if (next) start(next);
  });
  get("toggle-audio").addEventListener("click", (event) => {
    const muted = sound.toggle();
    event.currentTarget.setAttribute("aria-pressed", String(muted));
    event.currentTarget.setAttribute("aria-label", muted ? "Unmute ambient audio" : "Mute ambient audio");
    event.currentTarget.textContent = muted ? "Muted" : "Sound";
  });
  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || get("controls").open) return;
    if (phase === "active") { setPhase("paused"); get("continue").focus(); }
    else if (phase === "paused") setPhase("active");
  });
  window.addEventListener("resize", resize, { passive: true });
  matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", (event) => { reduceMotion = event.matches; });

  loadRoutes();
  resize();
  renderer.render(scene, camera);
  begin.textContent = "Begin the voyage  →";
  begin.disabled = false;
  canvas.dataset.phase = phase;
  requestAnimationFrame(draw);
}
