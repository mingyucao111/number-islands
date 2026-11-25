# Number Islands · The Last Light

[Play The Last Light](https://mingyucao111.github.io/number-islands/) · [Island Atlas](https://mingyucao111.github.io/number-islands/expeditions.html) · [Teacher Workshop](https://mingyucao111.github.io/number-islands/workshop.html)

A third-person 3D island adventure set on the coast of Alderreach. Control an explorer, meet the lighthouse keeper, carry counterweights to the winch and take the recovered lens up to the beacon. Completing the voyage unlocks gliding. Play in a browser with WebGL 2.

## The Last Light

- **Desktop.** Use WASD or the arrow keys to move, Shift to run, drag to look, E to interact, and Space to jump. Hold Space during the descent after unlocking gliding.
- **Touchscreen.** Use the left stick to move, drag the scene to look and use the two right-hand buttons to jump or interact.
- **Progression.** Start at any of the six bands from K1–K2 to Secondary 2–3. Each is a different version of the winch challenge on the same coast. Milestones earn XP once per route, advance the player’s rank and persist in the current browser. The pier is the start point for each voyage.

The 3D renderer is the MIT-licensed Three.js r183. The scene, character and tasks were built for Number Islands. [Three.js license](voyage/vendor/LICENSE-three.txt)

## Island Atlas

- **Story voyage.** Pick any of the six islands. Recover its lighthouse part and unlock a night rescue. Visit a completed island for more practice, or take a two-puzzle pass on earlier islands after you have made progress on a later one.
- **My Harbour.** Pick an order, drag or tap cargo into the hold, then steer around reefs to the destination. Spend the shells earned from deliveries on a bigger boat and new routes, or on a dock with more orders. Shells are in-game currency.
- **Island Arcade.** Search for the right objects in the cartographer’s cabin, escape the locked Tideglass Vault, or mix and stir imaginary ingredients in the witch’s potion garden.
- **Cargo Duel.** Send someone a link to the same cabin layout. Play on your own devices and send back a result link to compare moves. This is asynchronous play. Results are carried in the link and self-reported.

Lumi maintains a separate profile for each island and for cargo orders. Two consecutive first-try solutions without hints can unlock harder practice. Repeated hints or failed checks can bring back gentler tasks. Time is not used for difficulty. In the harbour you can also pick a difficulty yourself. Story and teacher missions preserve their authored goals.

The age bands provide representative maths topics. Topic timing varies by school and subject level. [MOE early numeracy](https://nel.moe.edu.sg/la/numeracy/overview/) · [MOE primary maths](https://www.moe.gov.sg/-/media/files/primary/2021-primary-mathematics-syllabus-p1-to-p6-updated-october-2025.pdf) · [MOE G2/G3 secondary maths](https://www.moe.gov.sg/-/media/files/secondary/fsbb/syllabus/2020-g2-and-g3-mathematics-syllabuses.pdf)

## Turn a PowerPoint into a game

1. Open [Teacher Workshop](https://mingyucao111.github.io/number-islands/workshop.html) and choose a text-based PowerPoint `.pptx`, or use the four-slide sample written with Claude.
2. The browser reads the slides and builds up to six missions covering supported examples. Review the proposed maths actions and play the voyage.
3. Copy the student link to share the reviewed mission parameters. The deck and its source text stay on the teacher’s device.

Topics currently supported are counting and small-number addition or subtraction, equivalent fractions, rectangular area, and single-variable linear equations. Older `.ppt` files can be saved as `.pptx` in PowerPoint. Export editable maths text when slides only contain screenshots. Uploaded macros and external slide links are never run.

The instant path uses deterministic maths templates. On compatible desktop Chrome, the workshop also supports Gemini Nano through the browser’s on-device Prompt API. Its results pass through a task allowlist, bounds and maths validation. If the model is unavailable or returns unusable output, the workshop runs the instant path. [Chrome Prompt API](https://developer.chrome.com/docs/ai/prompt-api)

For teachers with their own Anthropic API access, the earlier Claude-based fraction author is still available with Node.js 22. The CLI only sends a deliberately selected teaching excerpt and requests one output tool. It validates every fraction before printing JSON that can be pasted into the [classic fraction editor](https://mingyucao111.github.io/number-islands/fraction-ferries.html). [Claude Messages API](https://platform.claude.com/docs/en/api/http/messages)

```sh
node scripts/author-lesson.mjs /path/to/lesson.txt > lesson.generated.json
```

## Install and test

Use the live link above or serve the repository locally with `python3 -m http.server 8000` and open `http://localhost:8000`. On an eligible browser, install the web app from the browser menu. For iOS, Android and signed native builds, see [Mobile setup](MOBILE.md).

```sh
node --test
```

Tests cover curriculum bounds, Lumi’s policy, the harbour economy, arcade generators, PPTX decoding, local lesson generation and mocked model responses. The public game and player progress use local browser storage and have no student accounts or analytics. The repository uses GitHub Pages with no web build step.
