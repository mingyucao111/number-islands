(() => {
  "use strict";
  const view = document.getElementById("harbour-view");
  const rules = window.NumberIslandsRules;
  const key = "number-islands-harbour-v1";
  const tiers = { auto: "Lumi chooses", support: "Gentle", core: "Standard", stretch: "Stretch" };
  let progress = rules.newProgress();
  let override = "auto";

  function loadProgress() {
    try {
      const saved = localStorage.getItem(key);
      if (saved) return rules.restore(JSON.parse(saved));
    } catch { /* play with the current in-memory state */ }
    return progress;
  }

  function saveProgress(next) {
    progress = next;
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* session still works */ }
  }

  const make = (tag, text, className) => {
    const result = document.createElement(tag);
    if (text !== undefined) result.textContent = text;
    if (className) result.className = className;
    return result;
  };
  function control(text, callback, className = "button ghost") {
    const result = make("button", text, className);
    result.type = "button";
    result.addEventListener("click", callback);
    return result;
  }
  function link(text, href) {
    const anchor = make("a", text, "button ghost");
    anchor.href = href;
    return anchor;
  }
  function focus(heading) {
    heading.tabIndex = -1;
    heading.focus();
  }
  function mount(panel) {
    view.replaceChildren(panel);
    window.scrollTo(0, 0);
  }
  function random(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  function portArt() {
    const art = make("div", undefined, "port-art");
    art.setAttribute("aria-hidden", "true");
    art.dataset.boat = progress.boat;
    art.dataset.dock = progress.dock;
    art.append(make("div", undefined, "port-sun"), make("div", undefined, "port-dock"),
      make("div", undefined, "port-hut"), make("div", undefined, "port-hut second"), make("div", undefined, "port-hut third"),
      make("div", "⛵", "boat-icon"));
    return art;
  }

  function port(message = "") {
    progress = loadProgress();
    const tier = override === "auto" ? rules.tierFor(progress, "cargo") : override;
    const wrapper = make("div");
    const banner = make("section", undefined, "port-banner");
    const title = make("h1", "My harbour", "harbour-title");
    const intro = make("div");
    intro.append(make("p", "Your island business", "overline"), title,
      make("p", "Fill your hold, steer to the next island, then spend the shells you earn on a bigger harbour."));
    banner.append(intro, portArt());
    const stats = make("div", undefined, "harbour-stats");
    stats.append(make("span", `Shells ${progress.shells}`, "stat-chip"), make("span", `Boat level ${progress.boat + 1}`, "stat-chip"),
      make("span", `Dock level ${progress.dock + 1}`, "stat-chip"), make("span", `${progress.deliveries} deliveries`, "stat-chip"));
    const announcement = make("p", message, "port-message");
    announcement.setAttribute("role", "status");
    const board = make("div", undefined, "harbour-board");
    const orders = make("section");
    orders.append(make("h2", "Dispatch board"));
    const chooser = make("label", "Difficulty ", "studio-note");
    const select = make("select");
    select.id = "difficulty";
    for (const [value, text] of Object.entries(tiers)) {
      const option = make("option", value === "auto" ? `Lumi chooses · ${tiers[tier]}` : text);
      option.value = value;
      select.append(option);
    }
    select.value = override;
    select.addEventListener("change", () => { override = select.value; port(); document.getElementById("difficulty")?.focus(); });
    chooser.append(select);
    orders.append(chooser);
    const list = make("div", undefined, "contract-list");
    const offers = rules.contracts(progress, tier, random);
    for (const order of offers) {
      const card = make("article", undefined, "port-card");
      card.append(make("p", `${order.route} · ${order.reward} shells`, "overline"),
        make("h3", order.title), make("p", order.prompt), control("Accept order →", () => loadCargo(order), "button cta"));
      card.dataset.contract = order.rule.kind;
      list.append(card);
    }
    orders.append(list);
    const workshop = make("section");
    workshop.append(make("h2", "Shipyard"));
    const upgrades = make("div", undefined, "upgrade-list");
    for (const item of rules.upgrades(progress)) {
      const card = make("article", undefined, "port-card");
      const buy = control(item.cost === null ? "Fully upgraded" : `Upgrade · ${item.cost} shells`, () => {
        const result = rules.upgrade(loadProgress(), item.id);
        saveProgress(result.progress);
        port(result.message);
      });
      buy.disabled = !item.available;
      buy.dataset.upgrade = item.id;
      card.append(make("h3", item.title), make("p", item.effect), buy);
      upgrades.append(card);
    }
    workshop.append(upgrades);
    board.append(orders, workshop);
    wrapper.append(banner, stats, announcement, board);
    mount(wrapper);
    focus(title);
  }

  function screen(label, heading) {
    const wrap = make("div");
    wrap.append(control("← My harbour", () => port(), "ghost-link"));
    const panel = make("section", undefined, "harbour-task");
    const title = make("h1", heading, "screen-title");
    panel.append(make("p", label, "overline"), title);
    wrap.append(panel);
    mount(wrap);
    focus(title);
    return panel;
  }

  function situationalHint(order) {
    const kind = order.rule.kind;
    if (kind === "fraction") return "Split the order into equal groups first, then count the required groups of that cargo.";
    if (kind === "value") return "Make the target value with two kinds. Swapping a crate changes the value without using more space.";
    if (kind === "mix") return "Load the required kind first. Fill the rest of the order with the other cargo.";
    return "Start with an empty hold. Count one crate at a time.";
  }

  function attachPointerDrag(source, hold, icon, delivered) {
    let drag;
    let skipClick = false;
    source.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || !event.isPrimary) return;
      skipClick = false;
      drag = { pointer: event.pointerId, x: event.clientX, y: event.clientY };
      source.setPointerCapture(event.pointerId);
    });
    source.addEventListener("pointermove", (event) => {
      if (drag?.pointer !== event.pointerId) return;
      if (!drag.image && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 9) return;
      if (!drag.image) {
        drag.image = make("span", icon, "drag-preview");
        drag.image.setAttribute("aria-hidden", "true");
        document.body.append(drag.image);
      }
      drag.image.style.left = `${event.clientX}px`;
      drag.image.style.top = `${event.clientY}px`;
    });
    function finish(event, cancelled = false) {
      if (drag?.pointer !== event.pointerId) return;
      if (drag.image) {
        drag.image.remove();
        skipClick = true;
        if (!cancelled && hold.contains(document.elementFromPoint(event.clientX, event.clientY))) delivered();
      }
      drag = undefined;
    }
    source.addEventListener("pointerup", finish);
    source.addEventListener("pointercancel", (event) => finish(event, true));
    source.addEventListener("lostpointercapture", (event) => finish(event, true));
    source.addEventListener("click", (event) => {
      if (!skipClick || event.detail === 0) return;
      event.stopImmediatePropagation();
      skipClick = false;
    }, true);
  }

  function loadCargo(order) {
    const panel = screen(order.route, order.title);
    panel.append(make("p", order.prompt, "task-brief"));
    const board = make("div", undefined, "loading-board");
    const dock = make("section", undefined, "loading-box");
    const boat = make("section", undefined, "loading-box");
    const menu = make("div", undefined, "cargo-menu");
    const hold = make("div", undefined, "hold-slots");
    hold.id = "delivery-hold";
    const count = make("p", undefined, "hold-meta");
    count.setAttribute("aria-live", "polite");
    dock.append(make("h3", "Dock supplies"), menu);
    boat.append(make("h3", "Your hold"), hold, count);
    board.append(dock, boat);
    const brief = make("p", "Drag cargo aboard or tap it to load. Tap any loaded crate to unload it.", "activity-caption");
    const update = make("p", "", "retry-line");
    update.setAttribute("role", "status");
    const guide = make("p", "", "guide");
    guide.hidden = true;
    const actions = make("div", undefined, "button-row");
    const cargo = [];
    let attempts = 0;
    let usedHint = false;
    function refresh() {
      hold.replaceChildren();
      const tapTargets = [];
      for (const [index, item] of cargo.entries()) {
        const crate = control(item.icon, () => {
          cargo.splice(index, 1);
          refresh();
          const next = hold.querySelector("button");
          (next ?? menu.querySelector("button")).focus();
        }, "");
        crate.dataset.cargo = item.id;
        crate.setAttribute("aria-label", `Unload ${item.name.toLowerCase()} crate ${index + 1}`);
        tapTargets.push(crate);
      }
      hold.append(...tapTargets);
      for (let slot = cargo.length; slot < order.capacity; slot++) {
        const empty = make("span", "·");
        empty.setAttribute("aria-hidden", "true");
        hold.append(empty);
      }
      const value = cargo.reduce((sum, item) => sum + item.value, 0);
      count.textContent = `${cargo.length}/${order.capacity} crates${order.rule.kind === "value" ? ` · ${value} trade points` : ""}`;
    }
    for (const item of order.cargo) {
      function add() {
        if (cargo.length === order.capacity) {
          update.textContent = "The hold is full. Unload a crate to make space.";
          return;
        }
        cargo.push(item);
        update.textContent = "";
        refresh();
      }
      const supply = control(`${item.icon} ${item.name}${order.rule.kind === "value" ? ` · ${item.value}` : ""}`, add);
      supply.dataset.good = item.id;
      attachPointerDrag(supply, hold, item.icon, add);
      menu.append(supply);
    }
    function showHint() {
      usedHint = true;
      guide.textContent = "Lumi · " + situationalHint(order);
      guide.hidden = false;
    }
    actions.append(control("Cast off →", () => {
      const counts = Object.fromEntries(order.cargo.map(({ id }) => [id, cargo.filter((item) => item.id === id).length]));
      const checked = rules.checkLoad(order, counts);
      if (!checked.ok) {
        attempts++;
        update.textContent = checked.message;
        if (attempts >= 2) showHint();
        return;
      }
      sail(order, counts, { attempts, usedHint });
    }, "button cta"), control("Ask Lumi for a hint", showHint));
    panel.append(brief, board, actions, update, guide);
    refresh();
  }

  const maps = {
    Shoreline: { start: [3, 0], end: [1, 5], reefs: ["1,2", "2,2", "2,4"] },
    "Coral Channel": { start: [3, 0], end: [0, 5], reefs: ["0,2", "1,1", "1,3", "2,3", "2,5"] },
    "Beacon Crossing": { start: [3, 0], end: [0, 5], reefs: ["0,1", "1,1", "2,1", "2,3", "3,3", "1,5"] },
  };
  const directions = {
    ArrowUp: [-1, 0, "↑", "Sail north"], ArrowLeft: [0, -1, "←", "Sail west"],
    ArrowDown: [1, 0, "↓", "Sail south"], ArrowRight: [0, 1, "→", "Sail east"],
  };

  function sail(order, counts, evidence) {
    const panel = screen(order.route, "Take the helm");
    const chart = make("div", undefined, "ship-chart");
    chart.tabIndex = 0;
    chart.setAttribute("aria-label", "Sailing chart. Arrow keys steer towards the golden pier.");
    const message = make("p", "Use the arrow buttons or keyboard. Sail around the reefs to the golden pier.", "task-brief");
    message.setAttribute("role", "status");
    const helm = make("div", undefined, "helm");
    const course = maps[order.route];
    let [row, col] = course.start;
    let docked = false;
    const same = (point, r, c) => point[0] === r && point[1] === c;
    function draw() {
      chart.replaceChildren();
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 6; c++) {
          const ship = row === r && col === c;
          const pier = same(course.end, r, c);
          const reef = course.reefs.includes(`${r},${c}`);
          const cell = make("span", ship ? "⛵" : pier ? "⚑" : reef ? "◆" : "·", ship ? "ship" : pier ? "pier" : reef ? "reef" : "");
          cell.setAttribute("aria-hidden", "true");
          chart.append(cell);
        }
      }
      chart.dataset.position = `${row},${col}`;
      chart.dataset.destination = `${course.end[0]},${course.end[1]}`;
    }
    function steer(delta) {
      if (docked) return;
      const nextRow = row + delta[0];
      const nextCol = col + delta[1];
      if (nextRow < 0 || nextRow >= 4 || nextCol < 0 || nextCol >= 6 || course.reefs.includes(`${nextRow},${nextCol}`)) {
        message.textContent = "That way is blocked. Try a different course.";
        return;
      }
      row = nextRow;
      col = nextCol;
      draw();
      message.textContent = `Boat at row ${row + 1}, column ${col + 1}.`;
      if (!same(course.end, row, col)) return;
      docked = true;
      const result = rules.claimContract(loadProgress(), order, counts);
      if (!result.ok) { port(result.message); return; }
      saveProgress(rules.observe(result.progress, "cargo", evidence));
      showReward(result.reward);
    }
    for (const delta of Object.values(directions)) {
      const input = control(delta[2], () => steer(delta));
      input.setAttribute("aria-label", delta[3]);
      helm.append(input);
    }
    chart.addEventListener("keydown", (event) => {
      if (!Object.hasOwn(directions, event.key)) return;
      event.preventDefault();
      steer(directions[event.key]);
    });
    panel.append(message, chart, helm);
    draw();
    chart.focus();
  }

  function showReward(reward) {
    const panel = screen("Charter complete", "Cargo delivered!");
    const icon = make("span", "⛵", "reward-ship");
    icon.setAttribute("aria-hidden", "true");
    const tier = rules.tierFor(progress, "cargo");
    panel.classList.add("solved-panel");
    const actions = make("div", undefined, "button-row");
    actions.append(control("Back to the dispatch board →", () => port(), "button cta"), link("Explore the arcade", "arcade.html"));
    panel.append(icon, make("p", `+${reward} shells. You have ${progress.shells} to build up your harbour.`, "task-brief"),
      make("p", `Lumi’s next suggestion: ${tiers[tier]} cargo orders.`), actions);
  }

  port();
})();
