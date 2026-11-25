(() => {
  "use strict";

  const deckReader = window.NumberIslandsDeck;
  const lessons = window.NumberIslandsLessons;
  const get = (id) => document.getElementById(id);
  const input = get("deck-file");
  const preview = get("mission-preview");
  const status = get("upload-status");
  const aiButton = get("ai-generate");
  const dropZone = get("drop-zone");
  const sample = get("sample");
  let currentDeck;
  let active;
  let availability = "unavailable";

  function describe(task) {
    if (task.kind === "load") {
      return task.starting === undefined ? `Load ${task.target} crates`
        : `Move cargo · ${task.starting} ${task.change < 0 ? "−" : "+"} ${Math.abs(task.change)}`;
    }
    if (task.kind === "fraction") return `Match ferry loads · ${task.numerator}/${task.denominator} → ?/${task.splitInto}`;
    if (task.kind === "grid") return `Build a deck · ${task.rows} × ${task.cols}`;
    return `Balance the crane · ${task.coefficient}x ${task.constant < 0 ? "−" : "+"} ${Math.abs(task.constant)} = ${task.rhs}`;
  }

  function begin() {
    active?.abort();
    active = new AbortController();
    preview.hidden = true;
    get("empty-missions").hidden = false;
    get("share-status").textContent = "";
    aiButton.disabled = true;
    return active;
  }

  function showPreview(recipe, provider) {
    const address = new URL("index.html", location.href);
    address.hash = "lesson=" + lessons.encode(recipe);
    const shareAddress = location.protocol === "file:" || location.hostname === "localhost"
      ? new URL(address.hash, "https://mingyucao111.github.io/number-islands/") : address;
    get("preview-title").textContent = recipe.title;
    get("engine-status").textContent = provider === "chrome" ? "Prepared with on-device AI. Review the missions before sharing."
      : "Prepared with built-in maths templates. Review the missions before sharing.";
    get("mission-list").replaceChildren(...recipe.tasks.map((task) => {
      const item = document.createElement("li");
      item.textContent = describe(task);
      return item;
    }));
    get("play-lesson").href = address.href;
    get("student-link").value = shareAddress.href;
    get("empty-missions").hidden = true;
    preview.hidden = false;
  }

  async function refreshAI() {
    try { availability = await lessons.aiAvailability(); } catch { availability = "unavailable"; }
    get("ai-state").textContent = availability === "available" ? "On-device AI is ready."
      : availability === "downloadable" || availability === "downloading" ? "Compatible browser. First use may download the local model."
        : "On-device AI is unavailable here. Built-in maths templates work in this browser.";
    aiButton.disabled = !currentDeck || availability === "unavailable";
    aiButton.textContent = availability === "downloadable" || availability === "downloading"
      ? "Set up browser AI" : "Generate with browser AI";
  }

  async function generate(controller, mode) {
    status.textContent = mode === "ai" ? "Preparing missions with on-device AI…" : "Creating missions from the slides…";
    const result = await lessons.generate(currentDeck, { mode, signal: controller.signal });
    if (controller.signal.aborted) return;
    showPreview(result.recipe, result.provider);
    status.textContent = `${result.recipe.tasks.length} playable ${result.recipe.tasks.length === 1 ? "mission" : "missions"} ready to review.`;
  }

  async function open(fileOrPromise) {
    const controller = begin();
    currentDeck = null;
    status.textContent = "Reading the PowerPoint on this device…";
    try {
      const deck = await deckReader.read(await fileOrPromise);
      if (controller.signal.aborted) return;
      currentDeck = deck;
      await generate(controller, availability === "available" ? "ai" : "instant");
    } catch (error) {
      if (!controller.signal.aborted) status.textContent = error.message || "The lesson could not be created.";
    } finally {
      if (!controller.signal.aborted) void refreshAI();
    }
  }

  input.addEventListener("change", () => {
    const file = input.files[0];
    if (file) void open(file);
    input.value = "";
  });
  for (const name of ["dragenter", "dragover"]) {
    dropZone.addEventListener(name, (event) => {
      event.preventDefault();
      dropZone.classList.add("drag-over");
    });
  }
  dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
  dropZone.addEventListener("drop", (event) => {
    event.preventDefault();
    dropZone.classList.remove("drag-over");
    const file = event.dataTransfer.files[0];
    if (file) void open(file);
  });
  sample.addEventListener("click", () => {
    const exampleDeck = {
      title: "Harbour Maths",
      slides: [
        { number: 1, text: "Count the cargo\nThere are 7 crates aboard. Load 5 more.\n7 + 5 = ?" },
        { number: 2, text: "Match the load\nDivide an equal-length ferry into eighths.\n3/4 = ?/8" },
        { number: 3, text: "Build a deck\nFind the area of a rectangle that is 5 m by 4 m.\n5 × 4 rectangle area" },
        { number: 4, text: "Balance the crane\nFind the value of x that balances both sides.\n3x + 4 = 25" },
      ],
    };
    if (location.protocol === "file:") {
      const controller = begin();
      currentDeck = exampleDeck;
      void generate(controller, "instant").catch((error) => {
        if (!controller.signal.aborted) status.textContent = error.message;
      }).finally(() => { if (!controller.signal.aborted) void refreshAI(); });
      return;
    }
    void open(fetch("samples/harbour-maths.pptx").then(async (response) => {
      if (!response.ok) throw new Error("The sample could not be opened. Try choosing a PowerPoint.");
      return new File([await response.blob()], "harbour-maths.pptx");
    }));
  });
  aiButton.addEventListener("click", async () => {
    if (!currentDeck) return;
    const controller = begin();
    try {
      if (availability === "downloadable" || availability === "downloading") {
        status.textContent = "Preparing the on-device model…";
        const ready = await lessons.prepareAI({ signal: controller.signal, onProgress: (portion) => {
          if (!controller.signal.aborted) status.textContent = `Preparing the on-device model · ${Math.round(portion * 100)}%`;
        } });
        if (!ready) { await generate(controller, "instant"); return; }
      }
      await generate(controller, "ai");
    } catch (error) {
      if (!controller.signal.aborted) status.textContent = error.message;
    } finally {
      if (!controller.signal.aborted) void refreshAI();
    }
  });
  get("copy-link").addEventListener("click", async () => {
    const field = get("student-link");
    try {
      await navigator.clipboard.writeText(field.value);
      get("share-status").textContent = "Student link copied.";
    } catch {
      field.focus();
      field.select();
      get("share-status").textContent = "The link is selected. Copy it to share.";
    }
  });
  void refreshAI();
})();
