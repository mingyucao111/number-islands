# Number Islands · 数字群岛

[Play Number Islands](https://mingyucao111.github.io/number-islands/) · [My Harbour](https://mingyucao111.github.io/number-islands/harbour.html) · [Arcade](https://mingyucao111.github.io/number-islands/arcade.html) · [Teacher Workshop](https://mingyucao111.github.io/number-islands/workshop.html)

A Singapore maths adventure from K1 to Secondary 3. Collect six lighthouse parts in the story, start a shipping business, or visit the arcade. Play immediately in a browser and continue on the same device.

## Play

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

Open `index.html` to play locally, or use the live link above. On an eligible browser, install the web app from the browser menu. For iOS, Android and signed native builds, see [Mobile setup](MOBILE.md).

```sh
node --test
```

Tests cover curriculum bounds, Lumi’s policy, the harbour economy, arcade generators, PPTX decoding, local lesson generation and mocked model responses. The public game and player progress use local browser storage and have no student accounts or analytics. The repository uses GitHub Pages with no web build step.
