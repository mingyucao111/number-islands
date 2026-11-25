(function installPotionGame(scope) {
  "use strict";

  const ingredients = [
    { id: "moon", label: "Moon Drops", icon: "🌙", rgb: [92, 157, 250] },
    { id: "star", label: "Star Sparks", icon: "✦", rgb: [255, 147, 128] },
  ];
  const garden = [
    { title: "Mothlight Seed", icon: "🌱", description: "A tiny light flickers under the soil." },
    { title: "Tidebell Bloom", icon: "🪻", description: "The bells open and glow blue along the path." },
    { title: "Lantern Orchid", icon: "🌸", description: "Its petals light the whole night garden." },
  ];

  function makeRecipes(seed) {
    const flip = seed % 2 === 1;
    const first = flip ? 1 : 2;
    const second = 3 - first;
    const totalMl = 40 + (seed % 3) * 10;
    const moonMl = (totalMl + (flip ? -10 : 10)) / 2;
    return [
      {
        title: "Wake the seed",
        order: "Match the recipe card. Brew exactly 3 scoops.",
        recipe: `Moon Drops : Star Sparks = ${first} : ${second}`,
        hint: "The ratio gives the number of scoops of each ingredient in one batch.",
        measure: 1,
        unit: "scoop",
        goal: [first, second],
      },
      {
        title: "Open the tidebells",
        order: "Make a double batch. Keep the same blend for exactly 6 scoops.",
        recipe: `Moon Drops : Star Sparks = ${first} : ${second}`,
        hint: "A double batch doubles both amounts. If you double just one, the blend changes.",
        measure: 1,
        unit: "scoop",
        goal: [first * 2, second * 2],
      },
      {
        title: "Light the orchid",
        order: `Brew ${totalMl} mL. Moon Drops must measure 10 mL ${flip ? "less" : "more"} than Star Sparks.`,
        recipe: "Each pour adds 5 mL",
        hint: "Set aside 10 mL for the ingredient with more. Split the remaining measure equally.",
        measure: 5,
        unit: "mL",
        goal: [moonMl / 5, (totalMl - moonMl) / 5],
      },
    ];
  }

  function measureLabel(amount, recipe) {
    if (recipe.unit === "mL") return `${amount * recipe.measure} mL`;
    return `${amount} ${amount === 1 ? "scoop" : "scoops"}`;
  }

  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function action(text, handler, className = "potion-button") {
    const button = element("button", text, className);
    button.type = "button";
    button.addEventListener("click", handler);
    return button;
  }

  function mount(container, { home, seed, onComplete } = {}) {
    const practiceSeed = Number.isSafeInteger(seed) ? Math.abs(seed) : 0;
    const recipes = makeRecipes(practiceSeed);
    const screen = element("section", undefined, "potion-screen");
    const header = element("header", undefined, "potion-header");
    const back = action("← Arcade", () => home?.(), "potion-button potion-back");
    const title = element("h1", "Potion Garden");
    header.append(back, title);
    const body = element("div", undefined, "potion-body");
    const trail = element("ol", undefined, "potion-garden");
    trail.setAttribute("aria-label", "Night garden");
    screen.append(header, body, trail);
    container.replaceChildren(screen);
    let index = 0;
    let moves = 0;
    let reported = false;

    function updateGarden(harvested) {
      trail.replaceChildren();
      for (const [step, specimen] of garden.entries()) {
        const item = element("li", undefined, step < harvested ? "potion-grown" : "");
        const icon = element("span", step < harvested ? specimen.icon : "✧");
        icon.setAttribute("aria-hidden", "true");
        item.append(icon, element("span", step < harvested ? specimen.title : "Unlit garden bed"));
        trail.append(item);
      }
    }

    function brew() {
      const recipe = recipes[index];
      const goalTotal = recipe.goal.reduce((sum, value) => sum + value, 0);
      const amounts = [0, 0];
      let stirs = 0;
      let waitingForNext = false;
      const card = element("section", undefined, "potion-card");
      const stageTitle = element("h2", recipe.title);
      stageTitle.tabIndex = -1;
      card.append(
        element("p", `Recipe ${index + 1} of ${recipes.length}`, "potion-stage"),
        stageTitle,
        element("p", recipe.order, "potion-instruction"),
        element("p", recipe.recipe, "potion-recipe"),
      );

      const instruction = element("p", "Drag or tap a jar to pour. Stir when your blend is ready.", "potion-help");
      const bench = element("div", undefined, "potion-bench");
      const jars = element("div", undefined, "potion-jars");
      const scene = element("div", undefined, "potion-scene");
      const cauldron = element("div", undefined, "potion-cauldron");
      cauldron.dataset.cauldron = "";
      cauldron.setAttribute("aria-hidden", "true");
      const liquid = element("div", undefined, "potion-fluid");
      const bubbles = element("div", undefined, "potion-bubbles");
      bubbles.append(element("i"), element("i"), element("i"));
      cauldron.append(liquid, bubbles);
      const meter = element("p", "", "potion-meter");
      meter.setAttribute("aria-live", "polite");
      scene.append(cauldron, meter);
      bench.append(jars, scene);

      const feedback = element("p", "", "potion-feedback");
      feedback.dataset.potionFeedback = "";
      feedback.setAttribute("role", "status");
      const controls = element("div", undefined, "potion-controls");
      const stirButton = action("Stir the cauldron", stir, "potion-button potion-primary");
      stirButton.dataset.stir = "";
      const hintButton = action("Recipe hint", () => { feedback.textContent = recipe.hint; });
      const nextButton = action(index === recipes.length - 1 ? "See the night garden →" : "Grow the next plant →", next, "potion-button potion-primary");
      nextButton.hidden = true;
      nextButton.dataset.potionNext = "";
      controls.append(stirButton, hintButton, nextButton);

      const jarControls = ingredients.map((ingredient, position) => {
        const jar = element("div", undefined, `potion-jar potion-jar-${ingredient.id}`);
        const illustration = element("span", ingredient.icon, "potion-jar-icon");
        illustration.setAttribute("aria-hidden", "true");
        const pour = action(undefined, () => change(position, 1), "potion-pour");
        pour.dataset.pour = ingredient.id;
        pour.setAttribute("aria-label", `Pour ${ingredient.label}`);
        pour.draggable = true;
        pour.append(illustration, element("span", ingredient.label), element("span", "+ Pour", "potion-small"));
        pour.addEventListener("dragstart", (event) => {
          if (event.dataTransfer) {
            event.dataTransfer.setData("text/plain", `potion:${ingredient.id}`);
            event.dataTransfer.effectAllowed = "copy";
          }
        });
        const amount = element("span", "", "potion-amount");
        const remove = action("−", () => change(position, -1), "potion-button potion-remove");
        remove.dataset.remove = ingredient.id;
        remove.setAttribute("aria-label", `Remove one measure of ${ingredient.label}`);
        const footer = element("div", undefined, "potion-jar-footer");
        footer.append(amount, remove);
        jar.append(pour, footer);
        jars.append(jar);
        return { pour, amount, remove };
      });

      cauldron.addEventListener("dragover", (event) => {
        if (waitingForNext) return;
        event.preventDefault();
        cauldron.classList.add("potion-drop-ready");
      });
      cauldron.addEventListener("dragleave", () => cauldron.classList.remove("potion-drop-ready"));
      cauldron.addEventListener("drop", (event) => {
        event.preventDefault();
        cauldron.classList.remove("potion-drop-ready");
        const value = event.dataTransfer?.getData("text/plain");
        const position = ingredients.findIndex(({ id }) => value === `potion:${id}`);
        if (position >= 0) change(position, 1);
      });

      let pointerStart;
      cauldron.addEventListener("pointerdown", (event) => {
        if (!event.isPrimary || waitingForNext) return;
        pointerStart = { id: event.pointerId, x: event.clientX, y: event.clientY, distance: 0 };
        cauldron.setPointerCapture?.(event.pointerId);
      });
      cauldron.addEventListener("pointermove", (event) => {
        if (pointerStart?.id !== event.pointerId) return;
        pointerStart.distance += Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
        pointerStart.x = event.clientX;
        pointerStart.y = event.clientY;
      });
      cauldron.addEventListener("pointerup", (event) => {
        if (pointerStart?.id !== event.pointerId) return;
        const distance = pointerStart.distance + Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
        pointerStart = undefined;
        if (distance >= 28) stir();
      });
      cauldron.addEventListener("pointercancel", () => { pointerStart = undefined; });

      function total() {
        return amounts[0] + amounts[1];
      }

      function change(position, amount) {
        if (waitingForNext || amounts[position] + amount < 0) return;
        if (amount > 0 && total() >= goalTotal + 2) {
          feedback.textContent = "The cauldron is full. Remove a measure before pouring.";
          return;
        }
        amounts[position] += amount;
        moves++;
        stirs = 0;
        feedback.textContent = "";
        render();
      }

      function render() {
        const count = total();
        const blend = count ? ingredients[0].rgb.map((base, component) => {
          return Math.round((base * amounts[0] + ingredients[1].rgb[component] * amounts[1]) / count);
        }) : [66, 45, 98];
        cauldron.style.setProperty("--potion-liquid", `rgb(${blend.join(" ")})`);
        cauldron.style.setProperty("--potion-fill", `${Math.min(92, 20 + count * 72 / (goalTotal + 1))}%`);
        cauldron.dataset.stirs = String(stirs);
        cauldron.classList.toggle("potion-awake", waitingForNext);
        meter.textContent = `${measureLabel(count, recipe)} in the cauldron`;
        for (const [i, control] of jarControls.entries()) {
          control.amount.textContent = measureLabel(amounts[i], recipe);
          control.pour.disabled = waitingForNext;
          control.remove.disabled = waitingForNext || amounts[i] <= 0;
        }
        stirButton.textContent = stirs ? `Stir again (${stirs}/3)` : "Stir the cauldron";
      }

      function stir() {
        if (waitingForNext) return;
        moves++;
        if (amounts[0] !== recipe.goal[0] || amounts[1] !== recipe.goal[1]) {
          if (total() < goalTotal) {
            feedback.textContent = `Add ${measureLabel(goalTotal - total(), recipe)} to reach the target.`;
          } else if (total() > goalTotal) {
            feedback.textContent = `Remove ${measureLabel(total() - goalTotal, recipe)} to reach the target.`;
          } else {
            feedback.textContent = "The total is right. Swap some of one ingredient for the other to match the recipe.";
          }
          return;
        }
        stirs++;
        if (stirs === 3) {
          waitingForNext = true;
          feedback.textContent = garden[index].description;
          stirButton.hidden = true;
          hintButton.hidden = true;
          nextButton.hidden = false;
          updateGarden(index + 1);
          nextButton.focus();
        } else {
          feedback.textContent = "The blend is right. Keep stirring or swipe across the cauldron.";
        }
        render();
      }

      function next() {
        if (!waitingForNext) return;
        if (index + 1 === recipes.length) {
          finish();
        } else {
          index++;
          brew();
        }
      }

      const lab = element("div", undefined, "potion-lab");
      lab.append(instruction, bench, controls, feedback);
      body.replaceChildren(card, lab);
      render();
      updateGarden(index);
      stageTitle.focus();
    }

    function finish() {
      const summary = element("section", undefined, "potion-finish");
      const top = element("h2", "The garden is glowing!");
      top.tabIndex = -1;
      summary.append(
        element("span", "✦", "potion-finish-spark"),
        top,
        element("p", "All three plants are awake. Your lantern orchids are lighting the way home."),
        action("Play again", () => { index = 0; moves = 0; reported = false; brew(); }, "potion-button potion-primary"),
        action("← Arcade", () => home?.()),
      );
      body.replaceChildren(summary);
      updateGarden(garden.length);
      top.focus();
      if (!reported) {
        reported = true;
        onComplete?.({ mode: "potion", moves, seed: practiceSeed });
      }
    }

    brew();
    return screen;
  }

  scope.NumberIslandsPotion = Object.freeze({ mount, makeRecipes });
})(globalThis);
