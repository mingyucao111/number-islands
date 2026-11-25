(function installIslandQuests(scope) {
  "use strict";

  const titles = { hunt: "The Cartographer’s Cabin", escape: "The Tideglass Vault" };
  const objectTypes = {
    lantern: { icon: "🏮", title: "Lantern" },
    chest: { icon: "🧰", title: "Supply chest" },
    shell: { icon: "🐚", title: "Shell packet" },
    flag: { icon: "🚩", title: "Pennant" },
  };
  const weightSizes = [2, 3, 5, 7];

  function randomFor(seed) {
    let state = 2166136261;
    for (const char of String(seed)) state = Math.imul(state ^ char.codePointAt(0), 16777619);
    return (min, max) => {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return min + ((state >>> 0) % (max - min + 1));
    };
  }

  function shuffled(source, random) {
    const result = [...source];
    for (let i = result.length - 1; i > 0; i--) {
      const other = random(0, i);
      [result[i], result[other]] = [result[other], result[i]];
    }
    return result;
  }

  function huntPuzzle(random) {
    const props = Object.keys(objectTypes).flatMap((type) => {
      const values = type === "flag" ? [2, 4, 6, 8] : shuffled([2, 3, 4, 5, 6, 7, 8], random).slice(0, 4);
      return values.map((value) => ({ id: `${type}-${value}`, type, value }));
    });
    const lantern = props.filter(({ type }) => type === "lantern")[random(0, 3)];
    const chest = props.filter(({ type }) => type === "chest")[random(0, 3)];
    const shell = props.filter(({ type }) => type === "shell")[random(0, 3)];
    const flagValue = random(1, 4) * 2;
    return {
      props: shuffled(props, random),
      lantern: lantern.value,
      supplies: chest.value + shell.value,
      flag: flagValue,
    };
  }

  function escapePuzzle(random) {
    const weights = shuffled(weightSizes, random).slice(0, 2);
    const left = random(1, 3);
    const factor = random(2, 3);
    return { target: weights[0] + weights[1], left, right: left * factor, factor };
  }

  function puzzle(mode, seed) {
    const random = randomFor(seed);
    if (mode === "hunt") return huntPuzzle(random);
    if (mode === "escape") return escapePuzzle(random);
    throw new RangeError("Unknown island quest.");
  }

  function element(tag, text, className) {
    const result = document.createElement(tag);
    if (text !== undefined) result.textContent = text;
    if (className) result.className = className;
    return result;
  }

  function button(text, action, className = "button ghost") {
    const result = element("button", text, className);
    result.type = "button";
    result.addEventListener("click", action);
    return result;
  }

  function homeHeading(root, mode, home) {
    const title = element("h1", titles[mode], "iq-title");
    title.tabIndex = -1;
    root.append(button("← Arcade", home, "iq-back"), title);
    return title;
  }

  function status(text, className = "iq-status") {
    const line = element("p", text, className);
    line.setAttribute("role", "status");
    return line;
  }

  function tally(value) {
    const dots = element("span", undefined, "iq-tally");
    dots.setAttribute("aria-hidden", "true");
    for (let i = 0; i < value; i++) dots.append(element("i"));
    return dots;
  }

  function mount(container, mode, { home, seed, onComplete } = {}) {
    if (!Object.hasOwn(titles, mode)) throw new RangeError("Unknown island quest.");
    const replaySeed = seed === undefined || seed === null || seed === "" ? Math.random().toString(36).slice(2, 12) : String(seed).slice(0, 80);
    const scenario = puzzle(mode, replaySeed);
    const root = element("section", undefined, "iq-quest");
    const title = homeHeading(root, mode, home);
    const counter = element("span", "0 moves", "iq-moves");
    root.append(counter);
    container.replaceChildren(root);
    let moves = 0;
    let finished = false;

    function move() {
      if (finished) return false;
      moves += 1;
      counter.textContent = `${moves} ${moves === 1 ? "move" : "moves"}`;
      return true;
    }

    function finish(text) {
      if (finished) return;
      finished = true;
      const panel = element("div", undefined, "iq-win");
      panel.append(
        element("strong", text),
        element("p", `Run complete in ${moves} ${moves === 1 ? "move" : "moves"}.`),
        button("Replay this quest", () => mount(container, mode, { home, seed: replaySeed, onComplete })),
      );
      root.append(panel);
      panel.tabIndex = -1;
      panel.focus();
      onComplete?.({ mode, moves, seed: replaySeed });
    }

    if (mode === "hunt") mountHunt(root, scenario, move, finish);
    else mountEscape(root, scenario, move, finish);
    title.focus();
  }

  function mountHunt(root, scenario, move, finish) {
    root.append(element("p", "Search the cabin, recover three supplies and ready the chart boat.", "iq-intro"));
    const journal = element("div", undefined, "iq-journal");
    const phase = element("strong");
    const objective = element("p");
    journal.append(phase, objective);
    const scene = element("div", undefined, "iq-cabin");
    scene.setAttribute("aria-label", "Cabin search scene");
    const inventory = element("p", "Recovered: nothing yet", "iq-inventory");
    const feedback = status("Select a marked object in the cabin.");
    root.append(journal, scene, inventory, feedback);

    const selected = new Map();
    const recovered = new Set();
    const recoveredNames = [];
    const controls = new Map();
    let step = 0;
    const stories = [
      `Find a lantern stamped with ${scenario.lantern} lights.`,
      `Pick a supply chest and a shell packet. Their markings must add up to ${scenario.supplies}.`,
      `Find the pennant with twice ${scenario.flag / 2} markings.`,
    ];

    function refresh() {
      phase.textContent = step === stories.length ? "Cabin cleared" : `Supply ${step + 1} of ${stories.length}`;
      objective.textContent = stories[step] ?? "Your chart boat is ready to leave.";
      inventory.textContent = `Recovered: ${recoveredNames.join(" · ") || "nothing yet"}`;
      for (const [id, control] of controls) {
        control.disabled = recovered.has(id) || step === stories.length;
        control.setAttribute("aria-pressed", String(selected.has(id)));
        control.classList.toggle("iq-found", recovered.has(id));
      }
    }

    function collect(...props) {
      props.forEach(({ id }) => recovered.add(id));
      recoveredNames.push(["Lantern", "Supply pair", "Signal pennant"][step]);
      selected.clear();
      step += 1;
      refresh();
      feedback.textContent = step === stories.length ? "Supplies aboard." : "Supply recovered. Read the next clue in the journal.";
      if (step === stories.length) finish("The chart boat is ready.");
    }

    function pick(prop) {
      if (!move()) return;
      if (step === 0) {
        if (prop.type === "lantern" && prop.value === scenario.lantern) collect(prop);
        else feedback.textContent = "Look through the lanterns and count the marks.";
      } else if (step === 1) {
        if (!["chest", "shell"].includes(prop.type)) {
          feedback.textContent = "The supply pair needs a chest and a shell packet.";
          return;
        }
        const previous = [...selected.values()].find(({ type }) => type === prop.type);
        if (previous) selected.delete(previous.id);
        if (previous?.id !== prop.id) selected.set(prop.id, prop);
        const pair = [...selected.values()];
        if (pair.length < 2) {
          feedback.textContent = pair.length ? "One supply selected. Find its partner." : "Selection cleared.";
        } else {
          const total = pair[0].value + pair[1].value;
          if (total === scenario.supplies) {
            collect(...pair);
            return;
          }
          feedback.textContent = `These two supplies add up to ${total}. Swap one of them.`;
        }
        refresh();
      } else if (prop.type === "flag" && prop.value === scenario.flag) {
        collect(prop);
      } else {
        feedback.textContent = "Look for a pennant. Count its marks in two equal groups.";
      }
    }

    for (const prop of scenario.props) {
      const type = objectTypes[prop.type];
      const control = button("", () => pick(prop), `iq-object iq-object-${prop.type}`);
      control.dataset.questObject = prop.id;
      control.setAttribute("aria-label", `${type.title}, ${prop.value} markings`);
      const icon = element("span", type.icon, "iq-prop-icon");
      icon.setAttribute("aria-hidden", "true");
      control.append(icon, tally(prop.value));
      controls.set(prop.id, control);
      scene.append(control);
    }
    refresh();
  }

  function mountEscape(root, scenario, move, finish) {
    root.append(element("p", "You are below the lighthouse. Find the tide chart, balance the gate and align the wheels to open the hatch.", "iq-intro"));
    let chartFound = false;
    let weightsFound = false;
    let gateOpen = false;
    let escaped = false;
    const weightsOn = new Set();
    let left = 0;
    let right = 0;
    const scene = element("div", undefined, "iq-vault");
    const feedback = status("Explore the room.");
    const chart = element("div", undefined, "iq-journal");
    chart.hidden = true;
    chart.append(element("strong", "Captain’s tide chart"), element("p", `Gate balance: ${scenario.target} units using exactly two weights. Left wheel: ${scenario.left} notches. The right wheel uses ${scenario.factor} notches for every notch on the left.`));
    const gate = element("div", undefined, "iq-mechanism");
    gate.hidden = true;
    gate.append(element("h2", "Balance the gate"));
    const rail = element("p", "Empty tray", "iq-tray");
    const scale = status("0 units on the tray", "iq-scale");
    const stock = element("div", undefined, "iq-stock");
    const weights = weightSizes.map((value) => {
      const control = button(`${value}`, () => {
        if (!move() || gateOpen) return;
        if (weightsOn.has(value)) weightsOn.delete(value);
        else if (weightsOn.size < 2) weightsOn.add(value);
        else {
          feedback.textContent = "The tray has two slots. Remove a weight before adding another.";
          return;
        }
        updateWeights();
        feedback.textContent = "Try the gate when the tray matches the chart.";
      }, "button ghost iq-weight");
      control.dataset.questWeight = String(value);
      control.setAttribute("aria-label", `${value}-unit weight`);
      stock.append(control);
      return { value, control };
    });
    const testGate = button("Release gate", () => {
      if (!move()) return;
      if (!chartFound) {
        feedback.textContent = "Find the captain’s chart to learn the gate’s balance.";
      } else if (weightsOn.size !== 2 || totalWeight() !== scenario.target) {
        feedback.textContent = "The gate holds. Check both the number of weights and their total.";
      } else {
        gateOpen = true;
        feedback.textContent = "The gate swings open. The tide wheels are clear.";
        updateWeights();
        wheels.hidden = false;
        leftControl.focus();
      }
    }, "button cta");
    testGate.dataset.questGate = "release";
    gate.append(rail, scale, stock, testGate);

    const wheels = element("div", undefined, "iq-mechanism");
    wheels.hidden = true;
    wheels.append(element("h2", "Align the tide wheels"));
    const gauges = element("div", undefined, "iq-gauges");
    const leftMark = element("output");
    const rightMark = element("output");
    const leftControl = wheel("Left", 4, leftMark, () => left, (value) => { left = value; });
    const rightControl = wheel("Right", 9, rightMark, () => right, (value) => { right = value; });
    wheels.append(gauges);
    wheels.append(button("Try the hatch", attemptHatch, "button cta"));
    updateWeights();

    function totalWeight() {
      return [...weightsOn].reduce((sum, value) => sum + value, 0);
    }

    function updateWeights() {
      rail.textContent = weightsOn.size ? [...weightsOn].map((value) => `▣ ${value}`).join("  +  ") : "Empty tray";
      scale.textContent = `${totalWeight()} units on the tray`;
      testGate.disabled = gateOpen;
      for (const { value, control } of weights) {
        control.disabled = gateOpen;
        control.setAttribute("aria-pressed", String(weightsOn.has(value)));
      }
    }

    function wheel(name, max, mark, valueOf, set) {
      const body = element("div", undefined, "iq-wheel");
      const dial = element("span", "✳", "iq-dial");
      dial.setAttribute("aria-hidden", "true");
      mark.textContent = `${name} · 0 notches`;
      function rotate(direction) {
        if (!move()) return;
        set((valueOf() + max + 1 + direction) % (max + 1));
        dial.style.setProperty("--turn", `${valueOf() * (360 / (max + 1))}deg`);
        mark.textContent = `${name} · ${valueOf()} ${valueOf() === 1 ? "notch" : "notches"}`;
        feedback.textContent = "Both wheels move freely.";
      }
      const clockwise = button("+", () => rotate(1));
      clockwise.dataset.questWheel = name.toLowerCase();
      clockwise.setAttribute("aria-label", `Advance the ${name.toLowerCase()} wheel`);
      const anticlockwise = button("−", () => rotate(-1));
      anticlockwise.setAttribute("aria-label", `Reverse the ${name.toLowerCase()} wheel`);
      const controls = element("div", undefined, "iq-wheel-buttons");
      controls.append(anticlockwise, clockwise);
      body.append(dial, mark, controls);
      gauges.append(body);
      return clockwise;
    }

    function attemptHatch() {
      if (!move()) return;
      if (!gateOpen) {
        feedback.textContent = "The weight gate is keeping the hatch locked.";
      } else if (left !== scenario.left || right !== scenario.right) {
        feedback.textContent = "The hatch stays shut. Recheck both notch marks on the tide chart.";
      } else {
        escaped = true;
        feedback.textContent = "You reach the lantern deck before the tide rises.";
        scene.dataset.escaped = "true";
        for (const control of wheels.querySelectorAll("button")) control.disabled = true;
        finish("You escaped the Tideglass Vault.");
      }
    }

    const hotspots = [
      ["window", "◉", "Porthole", () => { feedback.textContent = "The lighthouse staircase is above you, on the other side of the hatch."; }],
      ["chart", "📜", "Rolled chart", () => {
        chartFound = true;
        chart.hidden = false;
        feedback.textContent = "You unroll the captain’s tide chart.";
      }],
      ["locker", "🧰", "Weight locker", () => {
        if (weightsFound) {
          feedback.textContent = "The weights are already beside the gate.";
          return;
        }
        weightsFound = true;
        gate.hidden = false;
        feedback.textContent = "Four weights slide out onto the workbench.";
      }],
      ["buoy", "⚓", "Anchor chain", () => { feedback.textContent = "The anchor chain is fixed to the wall. The gate has its own counterweight."; }],
    ];
    for (const [id, icon, name, action] of hotspots) {
      const control = button("", () => { if (move()) action(); }, `iq-hotspot iq-hotspot-${id}`);
      control.dataset.questHotspot = id;
      const symbol = element("span", icon, "iq-hotspot-symbol");
      symbol.setAttribute("aria-hidden", "true");
      control.append(symbol, element("span", name));
      scene.append(control);
    }
    const hatch = button("↗ Hatch", () => { if (!escaped) attemptHatch(); }, "iq-hotspot iq-hotspot-hatch");
    hatch.dataset.questHotspot = "hatch";
    scene.append(hatch);
    root.append(scene, feedback, chart, gate, wheels);
  }

  scope.NumberIslandsQuests = Object.freeze({ mount, puzzle });
})(globalThis);
