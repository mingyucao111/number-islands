import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket, WebSocketServer } from "ws";
import { HEROES } from "../voyage/combat-rules.mjs";
import { ROUTES } from "../voyage/progression.mjs";
import { createRankedRoom } from "./ranked-room.mjs";
import { createRankedStore, takePair } from "./ranked-rating.mjs";

const SITES = new Set(["https://mingyucao111.github.io", "capacitor://localhost", "ionic://localhost"]);
const GRADES = new Set(ROUTES.map(({ id }) => id));
const LOCALHOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const MAX_SOCKETS = 160;
const MAX_QUEUE = 120;
const QUEUE_LIFETIME_MS = 2 * 60_000;
const MAX_GUESTS_PER_MINUTE = 160;
const MAX_PENDING_BYTES = 256 * 1024;
const RATE_CAP = 56;
const RATE_PER_MS = 30 / 1000;
const AUTH_MS = 6000;
const FRAME_MS = 50;

function keysAre(value, fields) {
  return Object.keys(value).length === fields.length && fields.every((field) => Object.hasOwn(value, field));
}

function originGuard(configured) {
  if (configured !== undefined) {
    const values = typeof configured === "string" ? configured.split(",") : [...configured];
    const exact = new Set(values.map((item) => String(item).trim()).filter(Boolean));
    return (origin) => typeof origin === "string" && exact.has(origin) && origin !== "null";
  }
  return (origin) => {
    if (typeof origin !== "string") return false;
    if (SITES.has(origin)) return true;
    try {
      const parsed = new URL(origin);
      return origin === parsed.origin && (parsed.protocol === "http:" || parsed.protocol === "https:")
        && LOCALHOSTS.has(parsed.hostname);
    } catch {
      return false;
    }
  };
}

function mountedHealth(request, response) {
  if (request.url === "/health" && (request.method === "GET" || request.method === "HEAD")) {
    response.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    response.end(request.method === "GET" ? '{"ok":true}' : undefined);
  } else {
    response.writeHead(404, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    response.end('{"error":"not found"}');
  }
}

function rejectUpgrade(socket, status) {
  const message = status === 403 ? "Forbidden" : status === 503 ? "Service Unavailable" : "Not Found";
  socket.end(`HTTP/1.1 ${status} ${message}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
}

export function createRankedServer({ databasePath = ":memory:", origins, now = Date.now } = {}) {
  if (typeof now !== "function") throw new TypeError("Ranked server needs a clock.");
  const allowed = originGuard(origins);
  const store = createRankedStore(databasePath);
  const server = createServer(mountedHealth);
  server.headersTimeout = 8000;
  server.requestTimeout = 10_000;
  server.maxConnections = 2 * MAX_SOCKETS;
  const wire = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024, perMessageDeflate: false });
  const loggedIn = new Map();
  const queue = new Map();
  const rooms = new Map();
  const activePlayer = new Map();
  const issuance = [];
  let stopping = false;
  let shutdown;

  function send(client, packet) {
    if (!client || client.socket.readyState !== WebSocket.OPEN) return;
    if (client.socket.bufferedAmount > MAX_PENDING_BYTES) {
      client.socket.close(1013, "Network too slow");
      return;
    }
    try { client.socket.send(JSON.stringify(packet)); }
    catch { client.socket.terminate(); }
  }

  function error(client, code, message) {
    send(client, { type: "error", code, message });
  }

  function matchPacket(session, id) {
    const side = session.players[0].id === id ? 0 : 1;
    const rival = session.players[1 - side];
    return { type: "match", matchId: session.id, route: session.route, side, rivalHero: rival.hero, rivalName: rival.name };
  }

  function publishOutcome(result) {
    rooms.delete(result.id);
    for (const { id } of result.players) activePlayer.delete(id);

    let updates;
    try {
      updates = result.winner === null ? null : store.settle(result);
      if (result.winner !== null && !updates) throw new Error("Could not settle rank.");
      for (const [side, { id }] of result.players.entries()) {
        const entry = updates?.find((record) => record.id === id);
        const outcome = result.winner === null ? "expired"
          : result.winner === "draw" ? "draw" : result.winner === side ? "win" : "loss";
        send(loggedIn.get(id), { type: "ranking", matchId: result.id, reason: result.reason, outcome,
          delta: entry?.delta ?? 0, profile: entry?.profile ?? store.profile(id, result.route) });
      }
    } catch {
      for (const { id } of result.players) error(loggedIn.get(id), "rating-unavailable", "This result could not be saved.");
    }
  }

  function matchWaiting(timestamp) {
    for (const [id, entry] of queue) {
      if (timestamp - entry.joinedAt < QUEUE_LIFETIME_MS) continue;
      queue.delete(id);
      error(loggedIn.get(id), "queue-expired", "No compatible rival found this time. You can search again.");
    }
    for (;;) {
      const pair = takePair(queue.values(), timestamp);
      if (!pair) return;
      const [first, second] = pair;
      queue.delete(first.id);
      queue.delete(second.id);
      const clients = pair.map(({ id }) => loggedIn.get(id));
      if (clients.some((client) => client?.socket.readyState !== WebSocket.OPEN)) {
        pair.forEach((entry, index) => {
          if (clients[index]?.socket.readyState === WebSocket.OPEN) queue.set(entry.id, entry);
        });
        continue;
      }

      const id = randomUUID();
      const route = first.route;
      const players = pair.map(({ id: guest, name, hero }) => ({ id: guest, name, hero }));
      const room = createRankedRoom({
        id, route, players, now: timestamp, onFinish: publishOutcome,
        send: (guest, packet) => send(loggedIn.get(guest), packet),
      });
      const session = { id, route, players, room, voluntary: new Set() };
      rooms.set(id, session);
      for (const [side, player] of players.entries()) {
        activePlayer.set(player.id, session);
        send(clients[side], matchPacket(session, player.id));
      }
      room.tick(timestamp);
    }
  }

  function authenticate(client, packet, timestamp) {
    const withToken = Object.hasOwn(packet, "token");
    if (!keysAre(packet, withToken ? ["type", "version", "token"] : ["type", "version"])
      || packet.version !== 1) {
      error(client, "invalid-auth", "Use the current ranked game client.");
      return;
    }
    let guest;
    let token = packet.token;
    if (withToken) {
      guest = store.getGuest(token);
      if (!guest) {
        error(client, "invalid-token", "That guest token is no longer valid.");
        return;
      }
    } else {
      while (issuance.length && timestamp - issuance[0] >= 60_000) issuance.shift();
      if (issuance.length >= MAX_GUESTS_PER_MINUTE) {
        error(client, "busy", "Guest registration is busy. Try again in a minute.");
        return;
      }
      guest = store.createGuest();
      token = guest.token;
      issuance.push(timestamp);
    }
    if (loggedIn.has(guest.id)) {
      error(client, "already-online", "This guest is already connected in another tab.");
      return;
    }

    client.guest = { id: guest.id, name: guest.name };
    clearTimeout(client.authTimer);
    loggedIn.set(guest.id, client);
    send(client, { type: "ready", token, name: guest.name });
    const session = activePlayer.get(guest.id);
    if (session && !session.voluntary.has(guest.id)) {
      session.room.tick(timestamp);
      if (!session.room.finished) {
        send(client, matchPacket(session, guest.id));
        session.room.reconnect(guest.id, timestamp);
      }
    }
  }

  function drop(client, timestamp, voluntary = false) {
    const id = client.guest?.id;
    if (!id || loggedIn.get(id) !== client) return;
    loggedIn.delete(id);
    queue.delete(id);
    const session = activePlayer.get(id);
    if (voluntary) session?.voluntary.add(id);
    session?.room.disconnect(id, timestamp);
  }

  function receive(client, buffer, binary) {
    if (binary || stopping) {
      if (binary) client.socket.close(1003, "Text packets only");
      return;
    }
    const timestamp = now();
    client.credit = Math.min(RATE_CAP, client.credit + Math.max(0, timestamp - client.lastPacket) * RATE_PER_MS);
    client.lastPacket = Math.max(client.lastPacket, timestamp);
    if (client.credit < 1) {
      client.socket.close(1008, "Too many packets");
      return;
    }
    client.credit--;
    let packet;
    try { packet = JSON.parse(buffer.toString()); }
    catch {
      error(client, "invalid-packet", "A ranked packet was unreadable.");
      return;
    }
    if (!packet || typeof packet !== "object" || Array.isArray(packet)) {
      error(client, "invalid-packet", "A ranked packet was unreadable.");
      return;
    }

    if (!client.guest) {
      if (packet.type === "auth") authenticate(client, packet, timestamp);
      else error(client, "auth-required", "Create or restore a ranked guest first.");
      return;
    }

    const { id, name } = client.guest;
    if (loggedIn.get(id) !== client) return;
    const session = activePlayer.get(id);
    if (packet.type === "board" && keysAre(packet, ["type", "route"]) && GRADES.has(packet.route)) {
      const route = packet.route;
      send(client, { type: "board", route, profile: store.profile(id, route), leaders: store.leaderboard(route) });
    } else if (packet.type === "queue" && keysAre(packet, ["type", "route", "hero"])
      && GRADES.has(packet.route) && typeof packet.hero === "string" && Object.hasOwn(HEROES, packet.hero)) {
      if (session) {
        error(client, "in-match", "Finish the current duel before joining the queue.");
        return;
      }
      const prior = queue.get(id);
      if (!prior && queue.size >= MAX_QUEUE) {
        error(client, "busy", "The ranked queue is full. Try again shortly.");
        return;
      }
      const { route, hero } = packet;
      if (!prior || prior.route !== route || prior.hero !== hero) {
        queue.set(id, { id, name, route, hero, rating: store.profile(id, route).rating, joinedAt: timestamp });
      }
      send(client, { type: "queued", route });
      matchWaiting(timestamp);
    } else if (packet.type === "cancel" && keysAre(packet, ["type"])) {
      if (session) error(client, "in-match", "Leave the active duel through its exit.");
      else {
        queue.delete(id);
        send(client, { type: "canceled" });
      }
    } else if (packet.type === "leave" && keysAre(packet, ["type"])) {
      drop(client, timestamp, true);
      client.socket.close(1000, "Left ranked");
    } else if (packet.type === "pose" || packet.type === "cast" || packet.type === "answer") {
      if (!session || session.voluntary.has(id)) return;
      session.room.message(id, packet, timestamp);
    } else {
      error(client, "invalid-packet", "That ranked action is unavailable.");
    }
  }

  wire.on("connection", (socket) => {
    const client = { socket, guest: null, credit: RATE_CAP, lastPacket: now(), live: true, authTimer: null };
    client.authTimer = setTimeout(() => socket.close(1008, "Authentication timed out"), AUTH_MS);
    client.authTimer.unref();
    socket.on("pong", () => { client.live = true; });
    socket.on("message", (buffer, binary) => {
      try { receive(client, buffer, binary); }
      catch { error(client, "server-error", "Ranked play is temporarily unavailable."); }
    });
    socket.on("error", () => { socket.terminate(); });
    socket.on("close", () => {
      clearTimeout(client.authTimer);
      if (!stopping) drop(client, now());
    });
    socket.rankedHeartbeat = () => {
      if (!client.live) socket.terminate();
      else {
        client.live = false;
        socket.ping();
      }
    };
  });

  server.on("upgrade", (request, socket, head) => {
    if (request.url !== "/ranked") rejectUpgrade(socket, 404);
    else if (!allowed(request.headers.origin)) rejectUpgrade(socket, 403);
    else if (stopping || wire.clients.size >= MAX_SOCKETS) rejectUpgrade(socket, 503);
    else wire.handleUpgrade(request, socket, head, (connection) => wire.emit("connection", connection));
  });

  let lastQueueCheck = -Infinity;
  const timer = setInterval(() => {
    const timestamp = now();
    for (const { room } of rooms.values()) room.tick(timestamp);
    if (timestamp - lastQueueCheck >= 300) {
      lastQueueCheck = timestamp;
      matchWaiting(timestamp);
    }
  }, FRAME_MS);
  timer.unref();
  const heartbeat = setInterval(() => {
    for (const socket of wire.clients) {
      if (socket.readyState === WebSocket.OPEN) socket.rankedHeartbeat();
    }
  }, 20_000);
  heartbeat.unref();

  function close() {
    if (shutdown) return shutdown;
    stopping = true;
    clearInterval(timer);
    clearInterval(heartbeat);
    for (const socket of wire.clients) socket.terminate();
    shutdown = Promise.all([
      new Promise((done) => wire.close(() => done())),
      new Promise((done) => server.close(() => done())),
    ]).then(() => store.close());
    server.closeAllConnections?.();
    return shutdown;
  }

  return { server, close };
}

function startFromEnvironment() {
  const port = Number(process.env.PORT || 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid ranked server port.");
  const databasePath = process.env.RANKED_DATABASE
    || join(process.env.RAILWAY_VOLUME_MOUNT_PATH || ".ranked-data", "ranked.sqlite");
  if (databasePath !== ":memory:") mkdirSync(dirname(resolve(databasePath)), { recursive: true });
  const { server, close } = createRankedServer({ databasePath, origins: process.env.RANKED_ORIGINS || undefined });
  server.on("error", () => {
    console.error("Ranked service could not listen.");
    process.exitCode = 1;
    void close();
  });
  server.listen(port, "0.0.0.0", () => console.log(`Ranked service listening on port ${port}.`));
  const stop = () => { void close(); };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { startFromEnvironment(); }
  catch {
    console.error("Ranked service could not start.");
    process.exitCode = 1;
  }
}
