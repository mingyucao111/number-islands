import { HEROES } from "./combat-rules.mjs";

const production = "wss://number-islands-ranked-production.up.railway.app/ranked";
const sessionKey = "number-islands-ranked-guest-v1";
const modeKey = "number-islands-ranked-mode-v1";
const get = (id) => document.getElementById(id);

function endpoint() {
  const local = ["127.0.0.1", "localhost"].includes(location.hostname);
  if (local && location.protocol === "http:" && !window.Capacitor?.isNativePlatform?.()) {
    return `ws://${location.hostname}:8787/ranked`;
  }
  return production;
}

function readToken() {
  try { return localStorage.getItem(sessionKey) || null; } catch { return null; }
}

function saveToken(token) {
  try {
    if (token) localStorage.setItem(sessionKey, token);
    else localStorage.removeItem(sessionKey);
  } catch { /* the guest stays active until the page closes */ }
}

function recentMode() {
  try { return localStorage.getItem(modeKey) === "duo" ? "duo" : "solo"; } catch { return "solo"; }
}

function rememberMode(mode) {
  try { localStorage.setItem(modeKey, mode); } catch { /* optional preference */ }
}

function validProfile(profile) {
  return typeof profile?.name === "string" && profile.name.length <= 56
    && typeof profile.rank === "string" && profile.rank.length < 24
    && Number.isSafeInteger(profile.rating) && profile.rating >= 0
    && Number.isSafeInteger(profile.games) && profile.games >= 0;
}

function describe(profile) {
  const tier = profile.games < 3 ? `Placement ${profile.games}/3` : profile.rank;
  return `${tier} · ${profile.rating} Elo`;
}

export function createRankedLobby({ onEnter, onDismiss }) {
  const dialog = get("ranked-lobby");
  const board = get("ranked-leaderboard");
  const empty = get("ranked-empty");
  const status = get("ranked-status");
  const queueButton = get("ranked-queue");
  const cancelButton = get("ranked-cancel");
  const modeSelect = get("ranked-mode");
  const partySection = get("ranked-party");
  const partyStatus = get("ranked-party-status");
  const partyCode = get("ranked-party-code");
  const partyInput = get("ranked-party-input");
  const partyInputLabel = document.querySelector('label[for="ranked-party-input"]');
  const createParty = get("ranked-create-party");
  const joinParty = get("ranked-join-party");
  const leaveParty = get("ranked-leave-party");
  const copyParty = get("ranked-copy-party");
  let current = null;
  let guestToken = readToken();

  function send(session, message) {
    if (session.socket?.readyState !== WebSocket.OPEN) return false;
    session.socket.send(JSON.stringify(message));
    return true;
  }

  function controls(session) {
    queueButton.hidden = session.searching;
    queueButton.textContent = session.socket ? "Find match" : "Reconnect";
    const party = session.party;
    const duo = session.mode === "duo";
    const partyReady = !party || (party.route === session.route.id && party.members.length === 2
      && party.members.every(({ online }) => online));
    queueButton.disabled = Boolean(session.socket) && (!session.ready || (duo && !partyReady));
    cancelButton.hidden = !session.searching;
    modeSelect.disabled = Boolean(session.searching);
    partySection.hidden = !duo;
    partyCode.textContent = party?.code ?? "";
    copyParty.hidden = !party;
    createParty.hidden = Boolean(party);
    joinParty.hidden = Boolean(party);
    partyInput.hidden = Boolean(party);
    if (partyInputLabel) partyInputLabel.hidden = Boolean(party);
    leaveParty.hidden = !party;
    for (const control of [createParty, joinParty, leaveParty, partyInput]) control.disabled = !session.ready || Boolean(session.searching);
    if (party) {
      partyStatus.textContent = party.route !== session.route.id ? "Your party is on a different grade route. Leave it to search here."
        : party.members.length === 1 ? "Share the code with a friend on this grade route."
          : party.members.map(({ name, online, ready }) => `${name} (${!online ? "offline" : ready ? "ready" : "in lobby"})`).join(" · ");
    } else {
      partyStatus.textContent = "Queue on your own for a teammate, or form a party.";
    }
  }

  function searchStatus(session) {
    const elapsed = Math.max(0, Math.floor((Date.now() - session.joinedAt) / 1000));
    const waiting = elapsed < 20 ? (session.mode === "duo" ? "Looking for players near your team's rating." : "Looking for a rival near your rating.")
      : "Expanding the rating range within your grade.";
    status.textContent = `${waiting} ${elapsed}s`;
  }

  function stopSearch(session) {
    session.searching = false;
    session.joinOnReady = false;
    clearInterval(session.timer);
    controls(session);
  }

  function queue(session) {
    if (!send(session, { type: "queue", route: session.route.id, hero: session.hero,
      ...(session.mode === "duo" && { mode: "duo" }),
      ...(session.appearanceSupported && { appearance: session.appearance }) })) return;
    session.searching = true;
    session.joinedAt = Date.now();
    controls(session);
    searchStatus(session);
    clearInterval(session.timer);
    session.timer = setInterval(() => searchStatus(session), 1000);
  }

  function showBoard(message) {
    const profile = message.profile;
    if (validProfile(profile)) get("ranked-profile").textContent = `${profile.name} · ${describe(profile)}`;
    const leaders = Array.isArray(message.leaders) ? message.leaders.slice(0, 20).filter(validProfile) : [];
    board.replaceChildren(...leaders.map((row) => {
      const line = document.createElement("li");
      line.textContent = `${row.name} · ${describe(row)}`;
      return line;
    }));
    empty.hidden = leaders.length > 0;
    empty.textContent = "No placed players yet. Finish three matches to join the board.";
  }

  function requestBoard(session) {
    send(session, { type: "board", route: session.route.id, ...(session.mode === "duo" && { mode: "duo" }) });
  }

  function readParty(party) {
    return party && typeof party.code === "string" && /^[A-F0-9]{8}$/.test(party.code)
      && Array.isArray(party.members) && party.members.length <= 2
      && party.members.every((member) => typeof member?.name === "string" && member.name.length <= 56) ? party : null;
  }

  function validMatch(message) {
    if (typeof message.matchId !== "string" || !Number.isInteger(message.side)) return false;
    if (message.mode === "duo") return message.side >= 0 && message.side < 4 && Array.isArray(message.roster)
      && message.roster.length === 4 && message.roster.every((row) => typeof row?.hero === "string"
        && Object.hasOwn(HEROES, row.hero) && typeof row.name === "string" && row.name.length <= 56);
    return (message.side === 0 || message.side === 1) && typeof message.rivalHero === "string" && Object.hasOwn(HEROES, message.rivalHero);
  }

  function connect(session) {
    status.textContent = "Connecting to Ranked Arena…";
    const socket = new WebSocket(endpoint());
    session.socket = socket;
    controls(session);
    const alarm = setTimeout(() => socket.close(), 35_000);
    socket.addEventListener("open", () => send(session, { type: "auth", version: 1, token: guestToken ?? undefined }));
    socket.addEventListener("message", ({ data }) => {
      if (session.socket !== socket || session.closed || typeof data !== "string" || data.length > 20_000) return;
      let message;
      try { message = JSON.parse(data); } catch { return; }
      if (!message || typeof message.type !== "string") return;
      if (session.playing) {
        session.consumer?.({ message });
        return;
      }
      if (message.type === "ready" && typeof message.token === "string") {
        clearTimeout(alarm);
        guestToken = message.token;
        saveToken(guestToken);
        session.ready = true;
        session.appearanceSupported = message.appearanceVersion === 1;
        controls(session);
        status.textContent = "";
        requestBoard(session);
        if (session.joinOnReady) queue(session);
      } else if (message.type === "board" && message.route === session.route.id && (message.mode ?? "solo") === session.mode) {
        showBoard(message);
      } else if (message.type === "party") {
        session.party = readParty(message.party);
        controls(session);
      } else if (message.type === "canceled") {
        stopSearch(session);
        status.textContent = "Search canceled.";
      } else if (message.type === "match" && message.route === session.route.id && validMatch(message)) {
        stopSearch(session);
        session.playing = true;
        current = null;
        dialog.close();
        onEnter({
          kind: "ranked", side: message.side, matchId: message.matchId, mode: message.mode ?? "solo", roster: message.roster,
          rivalHero: message.rivalHero, rivalName: message.rivalName, rivalAppearance: message.rivalAppearance,
          send: (packet) => send(session, packet),
          listen(handler) { session.consumer = handler; },
          close() {
            send(session, { type: "leave" });
            session.closed = true;
            socket.close();
          },
        });
      } else if (message.type === "error") {
        if (message.code === "already-online" && session.joinOnReady && (session.retries ?? 0) < 3) {
          session.retries = (session.retries ?? 0) + 1;
          session.socket = null;
          socket.close();
          setTimeout(() => { if (current === session && !session.closed && !session.socket) connect(session); }, 500);
          return;
        }
        if (message.code === "invalid-token" && guestToken && !session.retried) {
          guestToken = null;
          saveToken(null);
          session.retried = true;
          socket.close();
          connect(session);
          return;
        }
        stopSearch(session);
        status.textContent = typeof message.message === "string" ? message.message : "Ranked Arena is unavailable. Try again.";
      }
    });
    socket.addEventListener("close", () => {
      clearTimeout(alarm);
      if (session.socket !== socket || session.closed) return;
      session.socket = null;
      session.ready = false;
      if (session.playing) session.consumer?.({ closed: true });
      else {
        stopSearch(session);
        status.textContent = "Ranked Arena is offline. Reconnect to try again.";
      }
    });
  }

  queueButton.addEventListener("click", () => {
    if (!current || current.searching) return;
    if (!current.socket) connect(current);
    else if (current.ready) queue(current);
  });
  cancelButton.addEventListener("click", () => {
    if (!current) return;
    send(current, { type: "cancel" });
    stopSearch(current);
    status.textContent = "Search canceled.";
  });
  modeSelect.addEventListener("change", () => {
    if (!current || current.searching) return;
    current.mode = modeSelect.value === "duo" ? "duo" : "solo";
    rememberMode(current.mode);
    get("ranked-profile").textContent = "";
    board.replaceChildren();
    empty.hidden = true;
    controls(current);
    requestBoard(current);
  });
  createParty.addEventListener("click", () => {
    if (current) send(current, { type: "party-create", route: current.route.id });
  });
  joinParty.addEventListener("click", () => {
    const code = partyInput.value.trim().toUpperCase();
    if (!current) return;
    if (!/^[A-F0-9]{8}$/.test(code)) { status.textContent = "Enter the eight-character party code."; return; }
    send(current, { type: "party-join", route: current.route.id, code });
  });
  leaveParty.addEventListener("click", () => {
    if (current) send(current, { type: "party-leave" });
  });
  copyParty.addEventListener("click", async () => {
    if (!current?.party) return;
    try {
      await navigator.clipboard.writeText(current.party.code);
      status.textContent = "Party code copied.";
    } catch { status.textContent = "Use the code displayed above to invite your teammate."; }
  });
  get("ranked-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    if (!current || dialog.open) return;
    const session = current;
    current = null;
    stopSearch(session);
    session.closed = true;
    session.socket?.close();
    onDismiss();
  });

  return {
    isOpen: () => dialog.open,
    open(route, hero, again = false, mode = recentMode(), appearance) {
      if (dialog.open) return;
      current = { route, hero, appearance, mode, joinOnReady: again };
      modeSelect.value = mode;
      get("ranked-grade").textContent = route.grade;
      get("ranked-profile").textContent = "";
      board.replaceChildren();
      empty.hidden = true;
      dialog.showModal();
      connect(current);
    },
  };
}
