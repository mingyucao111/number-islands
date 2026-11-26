# Number Islands · The Last Light

[Play The Last Light](https://mingyucao111.github.io/number-islands/) · [Island Atlas](https://mingyucao111.github.io/number-islands/expeditions.html) · [Teacher Workshop](https://mingyucao111.github.io/number-islands/workshop.html)

A third-person 3D adventure. Land at Alderreach, awaken the Hollow Tree in Windwood, ride the wind to Highwatch, and carry the light home. The game opens directly inside the world in a browser with WebGL 2.

## The Last Light

- **Desktop.** Use WASD or the arrow keys to move, Shift to run, drag to look, E to interact, and Space to jump. Hold Space during the descent after unlocking gliding.
- **Touchscreen.** Use the left stick to move, drag the scene to look and use the two right-hand buttons to jump or interact.
- **Progression.** Follow the landing trail to begin at K1–K2, or walk to a marked stone beside the pier and interact to choose a band through Secondary 2–3. Clear the coast for gliding, the Hollow Tree for wind lift, then bring the sunstone to Highwatch's beacon for the story ending. The next area opens through a physical arch. Completed chapters record a checkpoint in the current browser, and first clears earn experience once per route. Return to Alderreach after the ending and ring the voyage bell to play the route again.

If you restored the lighthouse in the original single-chapter release, the new campaign carries forward the XP and opens Windwood on that route.

## Windstone Arena

Walk to the hero stones on the right side of the pier. Use **E** or the touch interact button to choose Gale, Warden or Ember. Your outfit and spell kit follow that choice into the arena, and the choice is saved in this browser.

Gale can dash, hurry other spells and pierce a ward. Warden has shields, ember cleansing and warded healing. Ember can heal and leave a damage-over-time glow.

- **Practice:** Walk through the **Practice arena** arch to duel a computer opponent.
- **Friend duel:** Use the **Friend duel** arch. One player creates and shares an invite link. The other opens it, creates a reply code and sends the code back. The host pastes the reply and both enter the same real-time arena. The host’s grade band determines the maths for both players. It uses a direct WebRTC data connection, so some network combinations cannot connect without a relay.
- **Skills:** Move within range and press **1**, **2** or **3** to choose a spell. Use **1–3** to answer the maths question, or tap the skill and answer controls. A correct answer launches a spell in the world. Bolts and waves travel along a line. An area spell marks its impact zone first. Enemy damage requires a hit. Wrong or late answers still use the skill's cooldown.
- **Dodging:** Move while answering with WASD or the touch stick. Press **F** or tap **Dodge** to dash in the direction you are moving. Dodge starts with a 2.8-second recharge, which gets shorter at levels 3–5. Walk to the return arch and interact to leave, or press **Esc**.
- **Hero growth:** A completed practice or friend duel earns XP and gold for the hero you played. A practice win earns 60 XP and 35 gold. At level 2, return to that hero's stone and spend 30 gold to learn their signature spell. **4** or the fourth skill button casts Gale's Slipstream, Warden's Moonwall or Ember's Phoenix Bloom once learned. Hero levels, gold and learned skills are saved in the current browser.

| Skill tier | Base damage | Cooldown |
| --- | ---: | ---: |
| Easy | 10 | 2.5 seconds |
| Medium | 20 | 5.5 seconds |
| Hard | 36 | 10 seconds |

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

Tests cover curriculum bounds, Lumi’s policy, the harbour economy, arcade generators, PPTX decoding, local lesson generation, mocked model responses, arena combat and friend invite transport. The public game and player progress use local browser storage and have no student accounts or analytics. The repository uses GitHub Pages with no web build step.
