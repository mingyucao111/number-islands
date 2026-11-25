(() => {
  "use strict";

  const view = document.getElementById("arcade-view");
  const hunt = window.NumberIslandsQuests;
  const potion = window.NumberIslandsPotion;
  const alphabet = /^([0-9]{1,10})(?:\.([0-9]{1,4}))?$/;
  const cards = [
    ["escape", "🌒", "The Tideglass Vault", "A tide gate locked behind you. Search the room, work the machinery, and reach the hatch."],
    ["hunt", "🧺", "The Cartographer’s Cabin", "Dig through the mapmaker’s things to pack the exact order before the charts leave."],
    ["potion", "🌙", "The Witch’s Moonbrew", "Measure and stir imaginary ingredients to wake a garden. Each recipe changes what grows."],
    ["duel", "⚑", "Cargo duel", "Play the same cabin hunt as a friend. Compare how many moves each of you needed."],
  ];

  function make(tag, value, className) {
    const element = document.createElement(tag);
    if (value !== undefined) element.textContent = value;
    if (className) element.className = className;
    return element;
  }
  function button(text, handler, type = "button ghost") {
    const result = make("button", text, type);
    result.type = "button";
    result.addEventListener("click", handler);
    return result;
  }
  function replace(panel, heading, focus = true) {
    view.replaceChildren(panel);
    window.scrollTo(0, 0);
    if (focus) {
      heading.tabIndex = -1;
      heading.focus();
    }
  }
  function wordmarkHome() {
    if (location.hash.startsWith("#duel=")) history.replaceState(null, "", location.pathname + location.search);
    home();
  }
  function home(focus = true) {
    const wrapper = make("section");
    const hero = make("div", undefined, "arcade-hero");
    const title = make("h1", "Island arcade");
    const copy = make("div");
    copy.append(make("p", "Number Islands", "overline"), title, make("p", "Pick a different way to explore the islands."));
    const art = make("div", "⚓", "arcade-art");
    art.setAttribute("aria-hidden", "true");
    hero.append(copy, art);
    const board = make("div", undefined, "arcade-grid");
    for (const [id, icon, name, description] of cards) {
      const card = make("article", undefined, "arcade-card");
      card.dataset.mode = id;
      const patch = make("span", icon, "arcade-icon");
      patch.setAttribute("aria-hidden", "true");
      const action = id === "escape" ? "Enter the vault" : id === "hunt" ? "Search the cabin" : id === "potion" ? "Visit the witch" : "Open cargo duel";
      card.append(patch, make("h2", name), make("p", description), button(action + " →", () => open(id), "button cta"));
      board.append(card);
    }
    wrapper.append(hero, board);
    replace(wrapper, title, focus);
  }
  function open(id) {
    window.scrollTo(0, 0);
    if (id === "duel") { duelSetup(makeSeed()); return; }
    if (id === "potion") { potion.mount(view, { home: wordmarkHome }); return; }
    hunt.mount(view, id, { home: wordmarkHome });
  }
  function makeSeed() {
    return Math.floor(Math.random() * 4294967296);
  }
  function parseDuel() {
    const value = alphabet.exec(location.hash.slice(6));
    if (!value) return null;
    const seed = Number(value[1]);
    const score = value[2] === undefined ? undefined : Number(value[2]);
    if (seed > 4294967295 || (score !== undefined && score < 1)) return null;
    return { seed, score };
  }
  function duelUrl(seed, score) {
    const address = location.protocol === "file:" || location.hostname === "localhost"
      ? new URL("https://mingyucao111.github.io/number-islands/arcade.html") : new URL(location.href);
    address.hash = "duel=" + seed + (score === undefined ? "" : "." + score);
    return address.href;
  }
  function share(panel, seed, score) {
    const actions = make("div", undefined, "button-row");
    const label = make("label", "Friend link", "duel-label");
    const field = make("input");
    field.type = "url";
    field.readOnly = true;
    field.value = duelUrl(seed, score);
    label.append(field);
    const message = make("p", undefined, "duel-notice");
    message.setAttribute("role", "status");
    actions.append(button("Copy friend link", async () => {
      try {
        await navigator.clipboard.writeText(field.value);
        message.textContent = "Friend link copied.";
      } catch {
        field.focus();
        field.select();
        message.textContent = "Link selected. Copy it to share.";
      }
    }));
    panel.append(label, actions, message);
  }
  function duelPanel(titleText, detail) {
    const wrapper = make("section", undefined, "duel-wrap");
    const panel = make("div", undefined, "arcade-card duel-panel");
    const heading = make("h1", titleText);
    panel.append(make("p", "Cargo duel", "overline"), heading, make("p", detail));
    wrapper.append(button("← Arcade", wordmarkHome, "ghost-link"), panel);
    replace(wrapper, heading);
    return panel;
  }
  function duelSetup(seed, opponent) {
    const intro = opponent === undefined
      ? "Send a friend this hunt. You both search the same cabin layout. The fewest moves wins."
      : `Your friend used ${opponent} moves. Play the same cabin hunt and see what you can do.`;
    const panel = duelPanel("Race through the cabin", intro);
    panel.append(button("Start the hunt →", () => hunt.mount(view, "hunt", {
      seed, home: () => duelSetup(seed, opponent),
      onComplete: ({ moves }) => duelResult(seed, moves, opponent),
    }), "button cta"));
    share(panel, seed, opponent);
  }
  function duelResult(seed, moves, opponent) {
    const result = opponent === undefined ? "Send your result so a friend can try to beat it."
      : moves < opponent ? "You completed it in fewer moves."
        : moves === opponent ? "It’s a tie." : "Your friend completed it in fewer moves.";
    const panel = duelPanel(`${moves} moves`, result);
    if (opponent !== undefined) panel.append(make("p", `Friend’s result: ${opponent} moves.`));
    share(panel, seed, moves);
    panel.append(button("New cabin challenge", () => duelSetup(makeSeed())));
  }
  function route() {
    if (!location.hash.startsWith("#duel=")) { home(false); return; }
    const challenge = parseDuel();
    if (challenge) { duelSetup(challenge.seed, challenge.score); return; }
    home(false);
    const error = make("p", "This friend link is invalid. Start a new cargo duel from the arcade.", "duel-notice");
    error.setAttribute("role", "status");
    view.prepend(error);
  }
  window.addEventListener("hashchange", route);
  route();
})();
