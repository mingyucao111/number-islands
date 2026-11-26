/* Number Islands only caches public, same-origin game assets. */
const CACHE_PREFIX = "number-islands-shell-";
const CACHE_NAME = CACHE_PREFIX + "2026-11-26.6";
const BASE = new URL(self.registration.scope);
const core = [
  "index.html", "expeditions.html", "islands.css", "storybook.css", "storybook-home.css", "islands.js", "agent.js",
  "voyage/entry.js", "voyage/voyage.css", "voyage/main.mjs", "voyage/audio.mjs", "voyage/progression.mjs",
  "voyage/campaign.mjs", "voyage/waystones.mjs", "voyage/grove.mjs", "voyage/summit.mjs",
  "voyage/duel.css", "voyage/duel.mjs", "voyage/duel-lobby.mjs", "voyage/duel-link.mjs", "voyage/duel-arena.mjs", "voyage/combat-rules.mjs", "voyage/hero-growth.mjs",
  "voyage/ranked-lobby.mjs",
  "voyage/appearance.mjs", "voyage/face-rig.mjs", "voyage/hero-gallery.mjs", "voyage/wardrobe.css",
  "voyage/world.mjs", "voyage/player.mjs", "voyage/mission.mjs", "voyage/vendor/three.module.min.js", "voyage/vendor/three.core.min.js",
  "chapters-early.js", "chapters-primary.js", "chapters-secondary.js", "chapters-finale.js",
  "manifest.webmanifest", "icons/islands-192.png", "icons/islands-512.png", "icons/apple-touch-icon.png",
];
const extras = [
  "fraction-ferries.html",
  "island-quests.js", "quests.css", "potion-game.js", "potion.css",
  "workshop.html", "workshop.js", "lesson-agent.js", "deck-reader.js", "samples/harbour-maths.pptx",
  "harbour.html", "harbour.css", "harbour-game.js", "harbour-rules.js",
  "arcade.html", "arcade.js", "arcade.css",
  "pwa.js",
];
const staticPaths = new Set([...core, ...extras]);

function address(path) {
  return new URL(path, BASE).href;
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(core.map((path) => new Request(address(path), { cache: "reload" })));
    await Promise.allSettled(extras.map((path) => cache.add(new Request(address(path), { cache: "reload" }))));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== BASE.origin || !url.pathname.startsWith(BASE.pathname)) return;
  const path = url.pathname.slice(BASE.pathname.length) || "index.html";
  if (!staticPaths.has(path)) return;
  const key = address(path);
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const response = await fetch(event.request);
      if (!response.ok) return (await cache.match(key)) ?? response;
      if (new URL(response.url || key).origin === BASE.origin) {
        try {
          await cache.put(key, response.clone());
        } catch {
          // Storage may be full. The online response remains usable.
        }
      }
      return response;
    } catch {
      return (await cache.match(key)) ?? Response.error();
    }
  })());
});
