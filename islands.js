(() => {
  "use strict";

  const query = new URLSearchParams(location.search);
  if (query.has("lesson")) {
    location.replace("fraction-ferries.html" + location.search + location.hash);
    return;
  }

  const chapters = [
    ...window.NUMBER_ISLANDS_EARLY,
    ...window.NUMBER_ISLANDS_PRIMARY,
    ...window.NUMBER_ISLANDS_SECONDARY,
  ];
  const finale = window.NUMBER_ISLANDS_FINALE;
  const guide = window.NumberIslandsAgent;
  const rules = window.NumberIslandsRules;
  const view = document.getElementById("view");
  const storageKey = "number-islands-v1";
  const skillKinds = ["build", "pattern", "grid", "choices", "fraction", "number", "balance", "coordinate"];
  const save = readSave();
  let learner = readLearner();

  function node(tag, text, className) {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
  }

  function button(text, action, className = "button ghost") {
    const control = node("button", text, className);
    control.type = "button";
    control.addEventListener("click", action);
    return control;
  }

  function focusTitle(title) {
    title.tabIndex = -1;
    title.focus();
  }

  function readSave() {
    const fresh = { completed: {}, played: {}, passes: {}, needs: {}, last: null, practice: {}, rescue: 0 };
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) ?? "null");
      if (!stored || typeof stored !== "object") return fresh;
      for (const chapter of chapters) {
        const { id } = chapter;
        const count = stored.completed?.[id];
        if (Number.isInteger(count) && count >= 0 && count <= chapter.missions.length) fresh.completed[id] = count;
        if (Array.isArray(stored.played?.[id])) {
          fresh.played[id] = [...new Set(stored.played[id].filter((index) =>
            Number.isInteger(index) && index >= 0 && index < chapter.missions.length))];
        }
        if (stored.passes?.[id] === true) fresh.passes[id] = true;
        const practice = stored.practice?.[id];
        if (Number.isSafeInteger(practice) && practice > 0) fresh.practice[id] = practice;
        for (const kind of skillKinds) {
          const need = stored.needs?.[id]?.[kind];
          if (Number.isInteger(need) && need > 0 && need <= 9) (fresh.needs[id] ??= {})[kind] = need;
        }
        if (stored.last === id) fresh.last = id;
      }
      if (Number.isInteger(stored.rescue) && stored.rescue >= 0 && stored.rescue <= finale.missions.length) {
        fresh.rescue = stored.rescue;
      }
    } catch {
      // The game still works when browser storage is unavailable.
    }
    return fresh;
  }

  function writeSave() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(save));
    } catch {
      return false;
    }
    return true;
  }

  function readLearner() {
    try { return rules.restore(JSON.parse(localStorage.getItem("number-islands-harbour-v1") ?? "null")); }
    catch { return rules.newProgress(); }
  }

  function assess(chapter, attempts, usedHint) {
    learner = rules.observe(readLearner(), `island:${chapter.id}`, { attempts, usedHint });
    try { localStorage.setItem("number-islands-harbour-v1", JSON.stringify(learner)); } catch { /* optional storage */ }
  }

  function complete(chapter) {
    return save.passes[chapter.id] || (save.completed[chapter.id] ?? 0) === chapter.missions.length;
  }

  function partCount() {
    return chapters.filter(complete).length;
  }

  function random(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  function showScreen(theme) {
    const screen = node("section", undefined, "screen");
    screen.dataset.theme = theme;
    view.replaceChildren(screen);
    window.scrollTo(0, 0);
    return screen;
  }

  function showMap(moveFocus = true) {
    const content = document.getElementById("map-template").content.cloneNode(true);
    view.replaceChildren(content);
    const count = partCount();
    const lit = count === chapters.length;
    view.querySelector(".hero").classList.toggle("is-lit", lit);
    view.querySelector("#story-start").textContent = finale.opening;
    view.querySelector("#parts-total").textContent = `${count} of ${chapters.length} parts found`;
    view.querySelector("#beacon-status").textContent = lit
      ? finale.ending
      : count === chapters.length - 1
        ? finale.almost
        : "Complete an island’s missions to recover a lighthouse part.";
    const rescue = view.querySelector("#rescue");
    rescue.hidden = !lit;
    rescue.textContent = save.rescue === finale.missions.length ? "Replay the night rescue →" : "Play the night rescue →";
    rescue.addEventListener("click", startRescue);
    const last = guide.suggestChapter(chapters, save);
    const resume = view.querySelector("#resume");
    if (lit) {
      resume.textContent = save.rescue > 0 && save.rescue < finale.missions.length ? "Continue the night rescue →" : "Play the night rescue →";
      resume.addEventListener("click", startRescue);
    } else {
      if (save.last) resume.textContent = "Continue the voyage →";
      resume.addEventListener("click", () => {
        const chapter = chapters.find(({ id }) => id === last);
        startMission(chapter, save.completed[chapter.id] ?? 0);
      });
    }
    const grid = view.querySelector("#island-grid");
    for (const chapter of chapters) {
      const card = node("article", undefined, "island-card");
      card.dataset.theme = chapter.theme;
      const route = button(undefined, () => showChapter(chapter), "");
      route.dataset.chapter = chapter.id;
      const icon = node("span", chapter.icon, "island-icon");
      icon.setAttribute("aria-hidden", "true");
      const progress = node("span", undefined, "island-progress");
      const score = save.completed[chapter.id] ?? 0;
      for (let i = 0; i < chapter.missions.length; i++) {
        const dot = node("i", undefined, i < score || save.played[chapter.id]?.includes(i) ? "done" : "");
        dot.setAttribute("aria-hidden", "true");
        progress.append(dot);
      }
      progress.append(node("span", complete(chapter) ? "Part recovered" : `${score}/${chapter.missions.length} missions`));
      route.append(icon, node("span", chapter.band, "island-meta"), node("span", chapter.title, "island-name"), progress);
      card.append(route);
      grid.append(card);
    }

    if (!writeSave()) view.querySelector(".map-footer").firstChild.textContent = "Progress is available for this visit. ";
    if (moveFocus) {
      window.scrollTo(0, 0);
      focusTitle(view.querySelector("#map-title"));
    }
  }

  function mayTryPass(chapter) {
    const index = chapters.indexOf(chapter);
    return !complete(chapter) && chapters.slice(index + 1).some((later) => (save.completed[later.id] ?? 0) > 0);
  }

  function showChapter(chapter) {
    const screen = showScreen(chapter.theme);
    screen.append(button("← Island route", () => showMap(), "ghost-link"));
    const header = node("div", undefined, "screen-header");
    const icon = node("span", chapter.icon, "island-icon");
    icon.setAttribute("aria-hidden", "true");
    const copy = node("div");
    const title = node("h1", chapter.title, "screen-title");
    copy.append(node("p", chapter.band, "overline"), title, node("p", chapter.story, "story-line"));
    header.append(icon, copy);
    screen.append(header);

    const missions = node("ol", undefined, "mission-list");
    const current = save.completed[chapter.id] ?? 0;
    for (const [index, mission] of chapter.missions.entries()) {
      const item = node("li");
      const control = button(undefined, () => startMission(chapter, index), "mission-button");
      control.dataset.mission = String(index);
      control.disabled = index > current && !save.passes[chapter.id];
      const visited = index < current || save.played[chapter.id]?.includes(index);
      const status = visited ? "Completed" : control.disabled ? "Locked" : "Play";
      control.append(node("span", String(index + 1), "mission-number"), node("span", mission.title, "label"), node("span", status, "tag"));
      item.append(control);
      missions.append(item);
    }
    screen.append(missions);

    const buttons = node("div", undefined, "button-row chapter-actions");
    const canTryPass = mayTryPass(chapter);
    if (canTryPass) {
      buttons.append(button("Take a two-puzzle harbour pass", () => startPass(chapter)));
    }
    if (complete(chapter)) {
      buttons.append(button("Try a new practice puzzle", () => startPractice(chapter)));
    }
    screen.append(buttons);
    if (canTryPass) {
      screen.append(node("p", "Solve two puzzles on the first check, without hints, to recover this part.", "coach-recommendation"));
    }
    if (save.passes[chapter.id]) {
      screen.append(node("p", "Your harbour pass recovered this part. You can play any mission here.", "coach-recommendation"));
    }
    focusTitle(title);
  }

  function startMission(chapter, index) {
    save.last = chapter.id;
    writeSave();
    play({ kind: "mission", chapter, questions: chapter.missions, index, clean: true });
  }

  function startPractice(chapter) {
    learner = readLearner();
    const tier = rules.tierFor(learner, `island:${chapter.id}`);
    const first = guide.practiceMission(chapter, random, save.needs[chapter.id], tier);
    play({ kind: "practice", chapter, questions: [first], index: 0, clean: true, tier });
  }

  function startPass(chapter) {
    const practice = chapter.practice(random);
    play({ kind: "pass", chapter, questions: [practice, chapter.missions.at(-1)], index: 0, clean: true });
  }

  function startRescue() {
    const index = save.rescue === finale.missions.length ? 0 : save.rescue;
    play({ kind: "rescue", chapter: finale, questions: finale.missions, index, clean: true });
  }

  function returnToRoute(flow) {
    if (flow.kind === "rescue") showMap();
    else if (flow.kind === "lesson") showClassVoyage(flow.chapter.recipe);
    else showChapter(flow.chapter);
  }

  function play(flow) {
    const { kind, chapter, questions, index } = flow;
    const mission = questions[index];
    const screen = showScreen(chapter.theme);
    screen.append(button(kind === "rescue" ? "← Island route" : `← ${chapter.title}`, () => {
      if (!solved && (attempts > 0 || usedHint) && (kind === "mission" || kind === "practice")) assess(chapter, attempts, usedHint);
      returnToRoute(flow);
    }, "ghost-link"));
    const panel = node("article", undefined, "play-panel");
    const stage = { mission: "Mission", rescue: "Rescue", practice: "Practice", pass: "Harbour pass", lesson: "Stop" }[kind];
    const title = node("h1", mission.title, "screen-title");
    const indexLabel = kind === "practice" ? `Lumi practice · ${{ support: "Supported", core: "Standard", stretch: "Stretch" }[flow.tier]}`
      : `${stage} ${index + 1} of ${questions.length}`;
    panel.append(node("p", `${chapter.band} · ${indexLabel}`, "overline"), title, node("p", mission.prompt, "prompt"));
    const activity = node("div", undefined, "activity");
    const form = node("form");
    const actions = node("div", undefined, "button-row");
    const result = node("p", "", "response");
    result.id = "answer-feedback";
    result.setAttribute("role", "status");
    const coach = node("aside", undefined, "guide");
    coach.hidden = true;
    coach.id = "coach-message";
    coach.setAttribute("aria-live", "polite");
    coach.append(node("strong", "Lumi · Island guide"));
    const coachText = node("p");
    coach.append(coachText);

    const controls = activityControls[mission.kind](activity, mission);
    let attempts = 0;
    let solved = false;
    let usedHint = false;
    const check = node("button", kind === "lesson" ? mission.action : "Check", "button cta");
    check.type = "submit";
    check.id = "check";
    const hint = button("Ask Lumi for a hint", () => {
      usedHint = true;
      showCoach("hint");
      controls.showGuide?.();
      hint.setAttribute("aria-expanded", "true");
    });
    hint.setAttribute("aria-controls", "coach-message");
    hint.setAttribute("aria-expanded", "false");
    const next = button("Continue →", () => advance(flow), "button cta");
    next.id = "next";
    next.hidden = true;

    function showCoach(event) {
      const answer = guide.respond(event, { mission, attempts, solved });
      coach.dataset.tool = answer.tool;
      coachText.textContent = answer.text;
      coach.hidden = false;
    }

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (solved) return;
      const answer = controls.evaluate();
      if (!answer.ready) {
        result.className = "response retry";
        result.textContent = answer.message;
        return;
      }
      if (!answer.correct) {
        attempts++;
        result.className = "response retry";
        result.textContent = answer.message ?? "Try again. You can ask Lumi for a hint.";
        if (attempts >= 2) {
          showCoach("wrong");
          hint.setAttribute("aria-expanded", "true");
        }
        controls.showGuide?.();
        return;
      }
      solved = true;
      flow.clean = flow.clean && attempts === 0 && !usedHint;
      if (kind === "mission" || kind === "practice") assess(chapter, attempts, usedHint);
      recordWin(flow, attempts > 0 || usedHint);
      result.className = "response solved";
      result.textContent = mission.success ?? "Puzzle solved!";
      check.hidden = true;
      hint.hidden = true;
      next.hidden = false;
      for (const input of activity.querySelectorAll("button, input")) input.disabled = true;
      showCoach("solved");
      panel.classList.add("solved-panel");
      next.focus();
    });

    actions.append(check, hint, next);
    form.append(activity, actions, result, coach);
    panel.append(form);
    screen.append(panel);
    focusTitle(title);
  }

  function recordWin(flow, neededHelp) {
    const { kind, chapter, index, questions, clean } = flow;
    if (kind === "lesson") return;
    if (kind === "mission" || kind === "practice") {
      const needs = (save.needs[chapter.id] ??= {});
      const mechanic = questions[index].kind;
      const count = needs[mechanic] ?? 0;
      needs[mechanic] = neededHelp ? Math.min(9, count + 1) : Math.max(0, count - 1);
    }
    if (kind === "mission") {
      const played = (save.played[chapter.id] ??= []);
      if (!played.includes(index)) played.push(index);
      let current = save.completed[chapter.id] ?? 0;
      while (played.includes(current)) current++;
      save.completed[chapter.id] = current;
    } else if (kind === "rescue") {
      save.rescue = Math.max(save.rescue, index + 1);
    } else if (kind === "practice") {
      save.practice[chapter.id] = (save.practice[chapter.id] ?? 0) + 1;
    } else if (clean && index === questions.length - 1) {
      save.passes[chapter.id] = true;
    }
    writeSave();
  }

  function advance(flow) {
    if (flow.index + 1 < flow.questions.length) {
      play({ ...flow, index: flow.index + 1 });
      return;
    }
    showWin(flow);
  }

  function showWin(flow) {
    const { kind, chapter } = flow;
    if (kind === "lesson") {
      const screen = showScreen(chapter.theme);
      const panel = node("article", undefined, "play-panel win-panel solved-panel");
      const title = node("h1", "Class voyage delivered!", "screen-title");
      const actions = node("div", undefined, "button-row");
      actions.append(button("Replay voyage", () => showClassVoyage(chapter.recipe), "button cta"), button("Explore the islands", () => showMap()));
      panel.append(title, node("p", `Your crew completed all ${flow.questions.length} stops.`, "prompt"), actions);
      screen.append(panel);
      focusTitle(title);
      return;
    }
    const screen = showScreen(chapter.theme);
    const panel = node("article", undefined, "play-panel win-panel solved-panel");
    const icon = node("span", kind === "rescue" ? "✦" : chapter.icon, "island-icon");
    icon.setAttribute("aria-hidden", "true");
    const wonPart = kind === "mission" || (kind === "pass" && flow.clean);
    const titleText = kind === "rescue" ? "Every boat made it home!"
      : kind === "practice" ? "Practice puzzle solved"
        : wonPart ? `${chapter.part} recovered!` : "Harbour pass practised";
    const title = node("h1", titleText, "screen-title");
    let message;
    if (kind === "rescue") {
      message = "The harbour is safe. Revisit any island to try a fresh maths challenge.";
    } else if (kind === "practice") {
      message = `Practice puzzles solved on this island: ${save.practice[chapter.id]}.`;
    } else if (wonPart) {
      message = partCount() === chapters.length ? finale.ending : "That part is ready for the lighthouse.";
    } else {
      message = "The pass needs two first-try solutions without hints. You can try the pass again or play this island’s missions.";
    }
    const actions = node("div", undefined, "button-row");
    if (kind === "rescue") {
      actions.append(button("Island route", () => showMap(), "button cta"));
    } else if (kind === "pass" && !flow.clean) {
      actions.append(button("Back to missions", () => showChapter(chapter), "button cta"));
    } else {
      if (partCount() === chapters.length && save.rescue < finale.missions.length && kind !== "practice") {
        actions.append(button("Play the night rescue →", startRescue, "button cta"));
      } else if (kind !== "practice") {
        const nextId = guide.suggestChapter(chapters, save);
        const destination = chapters.find(({ id }) => id === nextId);
        if (destination && !complete(destination)) {
          actions.append(button(`Sail to ${destination.title} →`, () => showChapter(destination), "button cta"));
        }
      }
      const recommendation = guide.respond("practice", { chapter });
      const practiceChapter = chapters.find(({ id }) => id === recommendation.text);
      actions.append(button("Try a new puzzle", () => startPractice(practiceChapter)));
    }
    if (kind !== "rescue") actions.append(button("Island route", () => showMap()));
    panel.append(icon, title, node("p", message, "prompt"), actions);
    screen.append(panel);
    focusTitle(title);
  }

  function stepper(container, label, value, minimum, maximum, display, changed) {
    const controls = node("div", undefined, "stepper");
    const minus = button("−", () => set(value - 1));
    const output = node("output");
    output.setAttribute("aria-label", label);
    const plus = button("+", () => set(value + 1));
    minus.setAttribute("aria-label", `Decrease ${label}`);
    plus.setAttribute("aria-label", `Increase ${label}`);
    controls.append(minus, output, plus);
    container.append(controls);
    function set(nextValue) {
      value = nextValue;
      output.value = display(value);
      minus.disabled = value <= minimum;
      plus.disabled = value >= maximum;
      changed?.(value);
      if (document.activeElement === minus && minus.disabled) plus.focus();
      if (document.activeElement === plus && plus.disabled) minus.focus();
    }
    set(value);
    return { get: () => value, set };
  }

  const canCheck = (correct, message) => ({ ready: true, correct, message });
  const mustPick = (message) => ({ ready: false, message });

  function renderTokens(container, count, token) {
    const elements = Array.from({ length: count }, () => {
      const item = node("span", token);
      item.setAttribute("aria-hidden", "true");
      return item;
    });
    container.replaceChildren(...elements);
  }

  function buildActivity(container, mission) {
    if (mission.clue !== undefined) {
      const clue = node("div", undefined, "tokens");
      clue.setAttribute("role", "img");
      clue.setAttribute("aria-label", `${mission.clue} ${mission.unit}`);
      container.append(node("p", "Count these", "activity-label"), clue);
      renderTokens(clue, mission.clue, mission.token);
    }
    const tray = node("div", undefined, "tokens tray");
    tray.setAttribute("aria-hidden", "true");
    container.append(node("p", "Your collection", "activity-label"), tray);
    const counter = stepper(container, mission.unit, 0, 0, mission.max, String, (count) => {
      renderTokens(tray, count, mission.token);
    });
    return {
      evaluate() {
        const count = counter.get();
        return canCheck(count === mission.target, count < mission.target ? "Add some more." : "Try taking some away.");
      },
    };
  }

  const shapeNames = { "🔵": "blue circle", "🟨": "yellow square", "🔺": "red triangle", "🟩": "green square" };

  function choicesActivity(container, mission) {
    const isPattern = mission.kind === "pattern";
    if (isPattern) {
      const pattern = node("div", undefined, "pattern");
      pattern.setAttribute("role", "img");
      pattern.setAttribute("aria-label", `Pattern: ${mission.sequence.map((item) => shapeNames[item] ?? item).join(", ")}. What comes next?`);
      for (const item of mission.sequence) pattern.append(node("span", item));
      pattern.append(node("span", "?", "pattern-blank"));
      container.append(pattern);
    }
    const choices = node("div", undefined, "choices");
    const choiceButtons = [];
    let selection;
    for (const option of mission.options) {
      const control = button(option, () => {
        selection = option;
        choiceButtons.forEach((item) => item.setAttribute("aria-pressed", String(item === control)));
      }, isPattern ? "button ghost symbol" : "button ghost");
      control.setAttribute("aria-pressed", "false");
      if (isPattern) control.setAttribute("aria-label", shapeNames[option] ?? option);
      control.dataset.option = option;
      choiceButtons.push(control);
      choices.append(control);
    }
    container.append(choices);
    return { evaluate: () => selection === undefined ? mustPick("Choose one to check.") : canCheck(selection === mission.answer) };
  }

  function gridActivity(container, mission) {
    const grid = node("div", undefined, "paint-grid");
    grid.style.setProperty("--cols", mission.cols);
    const selected = new Set();
    const count = node("p", "0 tiles placed", "activity-caption");
    count.setAttribute("aria-live", "polite");
    for (let row = 0; row < mission.rows; row++) {
      for (let col = 0; col < mission.cols; col++) {
        const position = row * mission.cols + col;
        const tile = button("", () => {
          if (selected.has(position)) selected.delete(position);
          else selected.add(position);
          tile.setAttribute("aria-pressed", String(selected.has(position)));
          count.textContent = `${selected.size} ${selected.size === 1 ? "tile" : "tiles"} placed`;
        }, "");
        tile.dataset.tile = String(position);
        tile.setAttribute("aria-label", `Tile, row ${row + 1}, column ${col + 1}`);
        tile.setAttribute("aria-pressed", "false");
        grid.append(tile);
      }
    }
    container.append(grid, count);
    return {
      evaluate() {
        if (selected.size !== mission.target) return canCheck(false, "Check how many tiles you placed.");
        if (mission.rectangle) {
          const [rows, cols] = mission.rectangle;
          for (const position of selected) {
            if (Math.floor(position / mission.cols) >= rows || position % mission.cols >= cols) {
              return canCheck(false, "The number is right. Check the rows and columns from the top left.");
            }
          }
        }
        return canCheck(true);
      },
    };
  }

  function fractionActivity(container, mission) {
    const { numerator, denominator, splitInto } = mission;
    const target = numerator * splitInto / denominator;
    function ferry(name, count) {
      const row = node("div", undefined, "ferry-row");
      const label = node("p", undefined, "ferry-label");
      const amount = node("span");
      label.append(node("span", name), amount);
      const track = node("div", undefined, "ferry-track");
      track.style.setProperty("--parts", count);
      row.append(label, track);
      container.append(row);
      return { track, amount };
    }
    const reference = ferry("Ferry A", denominator);
    const editable = ferry("Ferry B", splitInto);
    reference.amount.textContent = `${numerator}/${denominator}`;
    reference.track.setAttribute("aria-hidden", "true");
    editable.track.style.setProperty("--line-at", `${100 * numerator / denominator}%`);
    for (let index = 1; index <= denominator; index++) {
      reference.track.append(node("span", String(index), index <= numerator ? "filled" : ""));
    }
    const slots = [];
    for (let index = 1; index <= splitInto; index++) {
      const slot = button(String(index), () => cargo.set(index), "");
      slot.setAttribute("aria-label", `Load ${index} of ${splitInto} slots`);
      slot.dataset.slot = String(index);
      slots.push(slot);
      editable.track.append(slot);
    }
    const cargo = stepper(container, "cargo slots", 0, 0, splitInto, (count) => `${count}/${splitInto}`, (count) => {
      editable.amount.textContent = `${count}/${splitInto}`;
      slots.forEach((slot, i) => slot.classList.toggle("filled", i < count));
    });
    container.append(node("p", "Tap a slot to load all the slots from the left.", "activity-caption"));
    return {
      evaluate() {
        const count = cargo.get();
        return canCheck(count === target, count < target ? "Your cargo stops before the dashed line." : "Your cargo reaches past the dashed line.");
      },
      showGuide() { editable.track.classList.add("guide-line"); },
    };
  }

  function numberActivity(container, mission) {
    if (mission.model) container.append(node("p", mission.model, "equation"));
    const answer = node("input");
    answer.type = "number";
    answer.step = "any";
    answer.placeholder = "Your answer";
    answer.setAttribute("aria-label", "Your answer");
    const field = node("div", undefined, "numeric-answer");
    field.append(answer);
    if (mission.unit) field.append(node("span", mission.unit));
    container.append(field);
    return {
      evaluate() {
        return answer.value === "" ? mustPick("Enter an answer to check.")
          : canCheck(Math.abs(answer.valueAsNumber - mission.answer) < 1e-8);
      },
    };
  }

  function signed(value) {
    return String(value).replace("-", "−");
  }

  function coordinateActivity(container, mission) {
    const grid = node("div", undefined, "coord-grid");
    grid.style.setProperty("--cols", 9);
    const selected = node("p", "Choose a point on the grid.", "activity-caption");
    selected.setAttribute("aria-live", "polite");
    let current;
    let xValue;
    let yValue;
    for (let y = 4; y >= -4; y--) {
      for (let x = -4; x <= 4; x++) {
        let label = "";
        if (x === 0 || y === 0) label = signed(x || y);
        const point = button(label, () => {
          current?.setAttribute("aria-pressed", "false");
          current = point;
          current.setAttribute("aria-pressed", "true");
          selected.textContent = `Selected (${signed(x)}, ${signed(y)})`;
          xValue = x;
          yValue = y;
        }, x === 0 && y === 0 ? "origin" : label ? "axis" : "");
        point.setAttribute("aria-label", `Point (${x}, ${y})`);
        point.setAttribute("aria-pressed", "false");
        point.dataset.point = `${x},${y}`;
        grid.append(point);
      }
    }
    container.append(node("p", "x runs left to right. y runs bottom to top.", "activity-label"), grid, selected);
    return { evaluate: () => !current ? mustPick("Choose a point to check.") : canCheck(xValue === mission.x && yValue === mission.y) };
  }

  function balanceActivity(container, mission) {
    const { coefficient, constant, rhs } = mission;
    const sign = constant < 0 ? ` − ${Math.abs(constant)}` : constant ? ` + ${constant}` : "";
    container.append(node("p", `${signed(coefficient)}x${sign} = ${signed(rhs)}`, "equation"));
    const balance = node("div", undefined, "balance-row");
    const left = node("p", undefined, "balance-pan");
    const right = node("p", `Right: ${signed(rhs)}`, "balance-pan");
    balance.append(left, node("span", "⚖"), right);
    container.append(balance);
    const x = stepper(container, "x", 0, -9, 12, (value) => `x = ${signed(value)}`, (value) => {
      left.textContent = `Left: ${signed(coefficient * value + constant)}`;
    });
    return { evaluate: () => canCheck(x.get() === mission.answer, "The sides have different values. Adjust x.") };
  }

  function classCargo(container, mission) {
    const hold = node("div", undefined, "class-hold");
    const countLabel = node("p", undefined, "activity-caption");
    countLabel.setAttribute("role", "status");
    const depot = button("📦 Add one crate", () => update(count + 1), "button ghost cargo-source");
    const unload = button("Remove one crate", () => update(count - 1));
    let count = mission.starting ?? 0;
    depot.draggable = true;
    depot.addEventListener("dragstart", (event) => event.dataTransfer.setData("text/plain", "lesson-crate"));
    hold.addEventListener("dragover", (event) => event.preventDefault());
    hold.addEventListener("drop", (event) => {
      event.preventDefault();
      if (!depot.disabled && event.dataTransfer.getData("text/plain") === "lesson-crate") update(count + 1);
    });
    const slots = Array.from({ length: 20 }, () => node("span", "·"));
    hold.setAttribute("aria-label", "Cargo hold");
    hold.append(...slots);
    const commands = node("div", undefined, "button-row");
    commands.append(depot, unload);
    container.append(node("p", "Cargo hold", "activity-label"), hold, countLabel, commands);
    function update(value) {
      count = Math.min(20, Math.max(0, value));
      countLabel.textContent = `${count} crates aboard`;
      slots.forEach((slot, index) => {
        slot.textContent = index < count ? "📦" : "·";
        slot.classList.toggle("loaded", index < count);
      });
      unload.disabled = count === 0;
      depot.disabled = count === 20;
    }
    update(count);
    return { evaluate: () => canCheck(count === mission.target, count < mission.target ? "There is still space in this order. Load more crates." : "The order has too many crates. Unload some.") };
  }

  function classMission(task) {
    if (task.kind === "load") {
      const change = task.change;
      return { ...task, kind: "cargo", title: "Fill the cargo hold", action: "Send this cargo", success: "Cargo shipped!",
        prompt: change === undefined ? `Load ${task.target} crates for the delivery.`
          : `The ferry starts with ${task.starting} crates. ${change < 0 ? "Unload" : "Load"} ${Math.abs(change)} crates before you set sail.`,
        hint: "Start with the crates already aboard. Move one crate at a time and watch the total.",
        explain: `${task.target} crates reached the next island.` };
    }
    if (task.kind === "fraction") {
      const target = task.numerator * task.splitInto / task.denominator;
      return { ...task, title: "Send matching ferries", action: "Send both ferries", success: "Both ferries set sail!",
        prompt: "Give Ferry B the same share of cargo as Ferry A so the flotilla can leave together.",
        hint: "The boats have the same length. Compare how far the two loads reach.",
        explain: `The two holds carry the same share: ${task.numerator}/${task.denominator} = ${target}/${task.splitInto}.` };
    }
    if (task.kind === "grid") {
      const target = task.rows * task.cols;
      return { ...task, rows: 6, cols: 6, target, rectangle: [task.rows, task.cols], title: "Repair the landing deck", action: "Open the landing deck", success: "Deck repaired!",
        prompt: `From the top left, lay ${task.rows} rows with ${task.cols} tiles in each row. Make a rectangle for the boats to dock.`,
        hint: "Keep every row the same length and line them up from the left.",
        explain: `${task.rows} rows of ${task.cols} tiles cover ${target} square units.` };
    }
    return { ...task, answer: (task.rhs - task.constant) / task.coefficient, title: "Balance the dock crane",
      action: "Lower the crane", success: "The crane lowered safely!", prompt: "Set the counterweight x to balance both sides of the crane.",
      hint: "Undo the fixed amount first. Then divide by the number of equal weights.",
      explain: `Both sides now balance at ${task.rhs}.` };
  }

  function showClassVoyage(recipe) {
    const chapter = { recipe, title: recipe.title, band: "Class voyage", icon: "⛴️", theme: "water" };
    const screen = showScreen(chapter.theme);
    const panel = node("article", undefined, "play-panel win-panel");
    const title = node("h1", chapter.title, "screen-title");
    panel.append(node("p", chapter.band, "overline"), title,
      node("p", `Your crew has ${recipe.tasks.length} ${recipe.tasks.length === 1 ? "stop" : "stops"}. Move cargo and repair the harbour as you sail.`, "prompt"),
      button("Board the ferry →", () => play({ kind: "lesson", chapter, questions: recipe.tasks.map(classMission), index: 0, clean: true }), "button cta"));
    screen.append(panel);
    focusTitle(title);
  }

  const activityControls = {
    build: buildActivity,
    choices: choicesActivity,
    pattern: choicesActivity,
    grid: gridActivity,
    fraction: fractionActivity,
    number: numberActivity,
    coordinate: coordinateActivity,
    balance: balanceActivity,
    cargo: classCargo,
  };

  document.querySelector(".wordmark").addEventListener("click", (event) => {
    event.preventDefault();
    if (location.hash.startsWith("#lesson=")) history.replaceState(null, "", location.pathname + location.search);
    showMap();
  });

  function route() {
    if (!location.hash.startsWith("#lesson=")) { showMap(false); return; }
    try { showClassVoyage(window.NumberIslandsLessons.decode(location.hash.slice(8))); }
    catch {
      showMap(false);
      const notice = node("p", "This voyage link is invalid. You can still explore the islands.", "arcade-sign");
      notice.setAttribute("role", "status");
      view.prepend(notice);
    }
  }
  window.addEventListener("hashchange", route);
  route();
})();
