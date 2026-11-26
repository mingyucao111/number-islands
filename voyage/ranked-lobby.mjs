import { HEROES } from "./combat-rules.mjs";

const production = "wss://number-islands-ranked-production.up.railway.app/ranked";
const sessionKey = "number-islands-ranked-guest-v1";
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
    queueButton.disabled = Boolean(session.socket) && !session.ready;
    cancelButton.hidden = !session.searching;
  }

  function searchStatus(session) {
    const elapsed = Math.max(0, Math.floor((Date.now() - session.joinedAt) / 1000));
    const waiting = elapsed < 20 ? "Looking for a rival near your rating."
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
    if (!send(session, { type: "queue", route: session.route.id, hero: session.hero })) return;
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
        controls(session);
        status.textContent = "";
        send(session, { type: "board", route: session.route.id });
        if (session.joinOnReady) queue(session);
      } else if (message.type === "board" && message.route === session.route.id) {
        showBoard(message);
      } else if (message.type === "canceled") {
        stopSearch(session);
      } else if (message.type === "match" && message.route === session.route.id && (message.side === 0 || message.side === 1)
        && typeof message.matchId === "string" && typeof message.rivalHero === "string" && Object.hasOwn(HEROES, message.rivalHero)) {
        stopSearch(session);
        session.playing = true;
        current = null;
        dialog.close();
        onEnter({
          kind: "ranked", side: message.side, matchId: message.matchId,
          rivalHero: message.rivalHero, rivalName: message.rivalName,
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
    open(route, hero, again = false) {
      if (dialog.open) return;
      current = { route, hero, joinOnReady: again };
      get("ranked-grade").textContent = route.grade;
      get("ranked-profile").textContent = "";
      board.replaceChildren();
      empty.hidden = true;
      dialog.showModal();
      connect(current);
    },
  };
}
