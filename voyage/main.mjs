import * as THREE from "./vendor/three.module.min.js";
import { buildWorld } from "./world.mjs";
import { createPlayer } from "./player.mjs";
import { createQuest } from "./mission.mjs";
import { createSoundscape } from "./audio.mjs";
import { ROUTES, rankFor } from "./progression.mjs";
import { CHAPTERS, campaignXP, chooseTrack, currentTrack, finishChapter, openCampaign, replayTrack, returnHome, travelSkills } from "./campaign.mjs";
import { createGrove } from "./grove.mjs";
import { createSummit } from "./summit.mjs";
import { buildPassage, buildWaystones } from "./waystones.mjs";

const SAVE = "number-islands-campaign-v1";
const LEGACY_SAVE = "number-islands-last-light-v1";
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

const coastExit = Object.freeze({ x: 10, y: 0, z: -23 });
const replayBell = Object.freeze({ x: 3.4, y: 0, z: 20.1 });

function closeTo(position, point, radius) {
  return point && Math.abs(position.y - point.y) < 1.45
    && Math.hypot(position.x - point.x, position.z - point.z) <= radius;
}

function readSaved(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}

function createCoast(root, route, home) {
  const world = buildWorld(root);
  const quest = createQuest({ scene: root, world, profile: route });
  const stones = buildWaystones(root, ROUTES, world);
  const ferry = buildPassage(root, coastExit, "Windwood crossing");
  const bell = home ? buildPassage(root, replayBell, "Voyage bell") : null;
  if (home) quest.restoreComplete();
  ferry.visible = false;
  return {
    spawn, exit: home ? null : coastExit, stones, state: quest.state, home,
    heightAt: world.heightAt,
    canWalk: (x, z) => world.canWalk(x, z) && quest.canPass(x, z),
    getPrompt: quest.getPrompt,
    interact: quest.interact,
    goalForCompass: quest.goalForCompass,
    update(dt, time) {
      world.update(dt, time);
      quest.update(dt, time);
      ferry.visible = quest.state.complete && !home;
      ferry.update(time);
      bell?.update(time);
      stones.forEach((stone) => stone.update(time, stone.id === route.id));
    },
  };
}

function disposeRegion(group) {
  if (!group) return;
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  group.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!material) continue;
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const texture of textures) texture.dispose();
}

export function startVoyage() {
  const canvas = get("world");
  const coarse = matchMedia("(pointer: coarse)").matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !coarse, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.35 : 1.65));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .99;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xacccb6);
  scene.fog = new THREE.FogExp2(0xc5d8b9, .012);
  const sky = addSky(scene);
  lightScene(scene, coarse);
  const camera = new THREE.PerspectiveCamera(57, 1, .09, 175);
  const sound = createSoundscape();
  const projected = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const offset = new THREE.Vector3();
  const hud = get("hud");
  const cursor = get("interaction");
  let campaign = openCampaign(readSaved(SAVE), readSaved(LEGACY_SAVE));
  let route = currentRoute();
  let group;
  let region;
  let index;
  let player;
  let paused = false;
  let noticeUntil = 0;
  let notice = "";
  let bannerUntil = 0;
  let lastTime = performance.now();
  let lastHud = 0;
  let reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const terrain = {
    heightAt(x, z) { return region.heightAt(x, z); },
    canWalk(x, z) { return region.canWalk(x, z); },
    canGlide(x, z, y) { return region.canGlide?.(x, z, y) ?? false; },
    windAt(x, z, y) { return region.windAt?.(x, z, y) ?? 0; },
  };

  function currentRoute() { return ROUTES.find(({ id }) => id === campaign.chosen) ?? ROUTES[0]; }

  function save() {
    try { localStorage.setItem(SAVE, JSON.stringify(campaign)); } catch { /* play without a persistent checkpoint */ }
  }

  function resize() {
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.fov = width < height ? 64 : 57;
    camera.updateProjectionMatrix();
  }

  function announce(text, duration = 3900) {
    notice = text;
    noticeUntil = performance.now() + duration;
  }

  function showBanner(eyebrow, title, line, duration = 2200) {
    const banner = get("chapter-banner");
    banner.querySelector("p").textContent = eyebrow;
    banner.querySelector("h1").textContent = title;
    banner.querySelector("span").textContent = line;
    banner.hidden = false;
    bannerUntil = performance.now() + duration;
  }

  function refreshGrowth() {
    const xp = campaignXP(campaign);
    const skills = travelSkills(campaign);
    player?.setWindGlide(skills.glide);
    player?.setWindLift(skills.lift);
    get("rank-name").textContent = rankFor(xp).name;
    get("rank-xp").textContent = `${xp} XP`;
    get("skills").textContent = [skills.glide && "Glide", skills.lift && "Ride the wind"].filter(Boolean).join(" · ");
  }

  function loadRegion(chapterIndex, { home = false, complete = false } = {}) {
    player?.setCarried(null);
    if (group) {
      scene.remove(group);
      disposeRegion(group);
    }
    route = currentRoute();
    index = chapterIndex;
    group = new THREE.Group();
    scene.add(group);
    if (index === 0) region = createCoast(group, route, home);
    else if (index === 1) region = createGrove(group, { route });
    else region = createSummit(group, { route });
    if (complete) region.restoreComplete?.();

    const arrival = complete ? (region.completedSpawn ?? { x: 0, z: -9, yaw: 0 }) : region.spawn;
    if (!player) player = createPlayer({ scene, camera, canvas, world: terrain, spawn: arrival });
    else player.reset(arrival);
    refreshGrowth();
    canvas.dataset.region = CHAPTERS[index].id;
    canvas.dataset.route = route.id;
    canvas.dataset.phase = "active";
    get("region-name").textContent = CHAPTERS[index].title;
    get("hud-route").textContent = `${route.name} · ${route.grade}`;
    hud.hidden = false;
    cursor.hidden = true;
    notice = "";
    noticeUntil = 0;
    canvas.focus({ preventScroll: true });
    showBanner(home ? "Homecoming" : "The Last Light", CHAPTERS[index].title,
      home ? "The ships are safe. Another voyage waits by the pier." : route.name);
    if (index === 0 && !home) announce("Route stones are left of the landing trail. Keeper Nessa waits up ahead.", 5200);
    refreshHud(performance.now());
  }

  function resumeTrack() {
    const checkpoint = currentTrack(campaign).checkpoint;
    if (campaign.home) loadRegion(0, { home: true });
    else if (checkpoint >= CHAPTERS.length) loadRegion(2, { complete: true });
    else loadRegion(checkpoint);
  }

  function passageAction(position) {
    if (!region.state.complete || !closeTo(position, region.exit, 1.65)) return null;
    return { type: "exit", label: ["Cross to Windwood", "Climb to Highwatch", "Return to Alderreach"][index], loc: region.exit };
  }

  function pierAction(position) {
    if (index !== 0 || region.state.carried) return null;
    if (region.home && closeTo(position, replayBell, 1.55)) {
      return { type: "replay", label: "Ring the voyage bell", loc: replayBell };
    }
    const stone = region.stones.find(({ point }) => closeTo(position, point, 1.15));
    if (!stone) return null;
    return { type: "route", id: stone.id, label: `Set sail at ${stone.label}`, loc: stone.point };
  }

  function interactionAt() {
    const position = player.position;
    return passageAction(position) ?? pierAction(position) ?? region.getPrompt(position);
  }

  function onChapterComplete() {
    const result = finishChapter(campaign, CHAPTERS[index].id);
    campaign = result.campaign;
    save();
    refreshGrowth();
    sound.play("complete");
    const award = result.gained ? `+${result.gained} XP · ` : "";
    if (index === 0) announce(award + "Glide unlocked. Hold jump while falling to ride the breeze.", 5800);
    else if (index === 1) announce(award + "Wind lift unlocked. Hold jump in a current to rise.", 5800);
    else showBanner("Journey complete", "The lights return", award + "Beacon Guardian • The ships are home.", 5700);
  }

  function interact() {
    const action = interactionAt();
    if (!action) return;
    if (action.type === "exit") {
      if (index >= CHAPTERS.length - 1) {
        campaign = returnHome(campaign);
        save();
        loadRegion(0, { home: true });
      } else loadRegion(index + 1);
      sound.play("advance");
      return;
    }
    if (action.type === "replay") {
      campaign = replayTrack(campaign);
      save();
      resumeTrack();
      sound.play("advance");
      return;
    }
    if (action.type === "route") {
      const next = chooseTrack(campaign, action.id);
      if (next !== campaign) {
        campaign = next;
        save();
        resumeTrack();
      } else announce(`${route.grade} is your current route.`);
      sound.play("advance");
      return;
    }
    const wasComplete = region.state.complete;
    if (region.interact(player.position, player)) {
      if (!wasComplete && region.state.complete) onChapterComplete();
      else {
        sound.play("use");
        if (region.state.notice) announce(region.state.notice);
      }
      refreshHud(performance.now());
    }
  }

  function describeGoal() {
    if (region.home) return "The light has returned. Explore the coast or ring the voyage bell to begin again.";
    if (!region.state.complete) return region.state.objective;
    return ["Follow the shore to the Windwood crossing.", "Take the forest path to Highwatch.",
      "The ships are home. Return through the arch, or explore the summit."][index];
  }

  function setText(element, text) {
    if (element.textContent !== text) element.textContent = text;
  }

  function refreshHud(now) {
    const { state } = region;
    const position = player.position;
    setText(get("objective"), describeGoal());
    const load = get("quest-load");
    load.hidden = index !== 0 || state.stage !== "weights";
    if (!load.hidden) {
      setText(get("counterweight"), `Winch ${state.load} / ${state.target}`);
      get("load-meter").style.setProperty("--meter", `${100 * Math.min(1, state.load / state.target)}%`);
    }
    const cargo = get("carry-status");
    cargo.hidden = !state.carried;
    if (!cargo.hidden) setText(cargo, state.carriedLabel || (state.carried === "lens" ? "Carrying the lens" : `Carrying a ${state.carriedMarks}-mark weight`));
    const status = get("notice");
    status.hidden = !notice || now > noticeUntil;
    if (!status.hidden) setText(status, notice);
    const banner = get("chapter-banner");
    if (!banner.hidden && now > bannerUntil) banner.hidden = true;

    const goal = (state.complete && region.exit) || region.goalForCompass(position);
    get("quest-compass").hidden = !goal;
    if (goal) {
      camera.getWorldDirection(direction);
      const angle = Math.atan2(goal.x - position.x, position.z - goal.z) - Math.atan2(direction.x, -direction.z);
      get("bearing").style.setProperty("--bearing", `${angle}rad`);
      setText(get("distance"), `${Math.round(Math.hypot(goal.x - position.x, (goal.y ?? 0) - position.y, goal.z - position.z))} m`);
    }

    const prompt = interactionAt();
    cursor.hidden = !prompt;
    if (prompt) {
      setText(cursor.querySelector("span"), prompt.label);
      projected.set(prompt.loc.x, prompt.loc.y + 1.48, prompt.loc.z);
      camera.getWorldDirection(direction);
      const inFront = offset.copy(projected).sub(camera.position).dot(direction) > 0;
      projected.project(camera);
      if (inFront && Math.abs(projected.x) < .86 && Math.abs(projected.y) < .86) {
        cursor.style.left = `${50 + projected.x * 50}%`;
        cursor.style.top = `${50 - projected.y * 50}%`;
      } else {
        cursor.style.left = "50%";
        cursor.style.top = coarse ? "63%" : "72%";
      }
    }
    canvas.dataset.stage = state.stage;
    canvas.dataset.position = [position.x, position.y, position.z].map((value) => value.toFixed(2)).join(",");
  }

  function draw(now) {
    const dt = Math.min(.047, (now - lastTime) / 1000);
    lastTime = now;
    if (!paused) {
      player.update(dt);
      if (player.takeInteract()) interact();
      if (player.takeRecovery()) announce("The wind carried you back to safe ground.");
    }
    const time = reduceMotion ? 12 : now * .001;
    region.update(dt, time);
    if (now - lastHud >= 85) {
      lastHud = now;
      refreshHud(now);
    }
    sky.position.copy(camera.position);
    renderer.render(scene, camera);
    requestAnimationFrame(draw);
  }

  window.addEventListener("keydown", (event) => {
    if (event.code === "Escape") {
      paused = !paused;
      player.setEnabled(!paused);
      get("paused").hidden = !paused;
    }
    if (event.code === "KeyM" && !event.repeat) announce(sound.toggle() ? "Sound muted" : "Sound on");
  });
  window.addEventListener("keydown", () => void sound.start(), { once: true });
  window.addEventListener("pointerdown", () => void sound.start(), { once: true });
  window.addEventListener("resize", resize, { passive: true });
  matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", (event) => { reduceMotion = event.matches; });
  resize();
  resumeTrack();
  save();
  renderer.render(scene, camera);
  get("load-message").hidden = true;
  requestAnimationFrame(draw);
}
