import { copyFile, lstat, mkdir, mkdtemp, realpath, rename, rm } from "node:fs/promises";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

const nativeRoot = fileURLToPath(new URL("../", import.meta.url));
const webRoot = await realpath(fileURLToPath(new URL("../../", import.meta.url)));
const output = join(nativeRoot, "www");

// The native bundle ships public game resources only. Keep this list in sync with the web release.
const files = [
  "index.html", "expeditions.html", "islands.css", "storybook.css", "storybook-home.css", "islands.js", "agent.js",
  "voyage/entry.js", "voyage/voyage.css", "voyage/main.mjs", "voyage/audio.mjs", "voyage/progression.mjs",
  "voyage/campaign.mjs", "voyage/waystones.mjs", "voyage/grove.mjs", "voyage/summit.mjs",
  "voyage/duel.css", "voyage/duel.mjs", "voyage/duel-lobby.mjs", "voyage/duel-link.mjs", "voyage/duel-arena.mjs", "voyage/combat-rules.mjs", "voyage/hero-growth.mjs",
  "voyage/ranked-lobby.mjs",
  "voyage/world.mjs", "voyage/player.mjs", "voyage/mission.mjs", "voyage/vendor/three.module.min.js", "voyage/vendor/three.core.min.js", "voyage/vendor/LICENSE-three.txt",
  "chapters-early.js", "chapters-primary.js", "chapters-secondary.js", "chapters-finale.js",
  "island-quests.js", "quests.css",
  "harbour.html", "harbour.css", "harbour-game.js", "harbour-rules.js",
  "arcade.html", "arcade.css", "arcade.js",
  "potion-game.js", "potion.css",
  "workshop.html", "workshop.js", "deck-reader.js", "lesson-agent.js", "fraction-ferries.html",
  "samples/harbour-maths.pptx",
  "icons/apple-touch-icon.png", "icons/islands-192.png", "icons/islands-512.png",
  "manifest.webmanifest", "pwa.js", "sw.js",
];

async function exportWebAssets() {
  const scratch = await mkdtemp(join(nativeRoot, ".web-build-"));
  const staged = join(scratch, "new");
  const previous = join(scratch, "previous");
  let movedPrevious = false;
  let preserveScratch = false;

  try {
    await mkdir(staged);
    for (const file of files) {
      const source = join(webRoot, file);
      let entry;
      try {
        entry = await lstat(source);
      } catch (error) {
        if (error.code === "ENOENT") throw new Error(`Missing web asset: ${file}`);
        throw error;
      }
      if (!entry.isFile() || !(await realpath(source)).startsWith(webRoot + sep)) {
        throw new Error(`Expected a regular web asset: ${file}`);
      }
      const destination = join(staged, file);
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(source, destination);
    }
    try {
      await rename(output, previous);
      movedPrevious = true;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    try {
      await rename(staged, output);
    } catch (error) {
      if (movedPrevious) {
        try {
          await rename(previous, output);
        } catch {
          preserveScratch = true;
          throw new Error(`The previous bundle is still in ${previous}.`, { cause: error });
        }
      }
      throw error;
    }
    console.log(`Prepared ${files.length} public game assets in native/www.`);
  } finally {
    if (!preserveScratch) await rm(scratch, { recursive: true, force: true });
  }
}

try {
  await exportWebAssets();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
