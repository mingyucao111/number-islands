import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { WebSocket } from "ws";
import { createRankedServer } from "../server/ranked-server.mjs";

const SITE = "https://mingyucao111.github.io";

async function fixture(testCase, options = {}) {
  let now = 1_000;
  const game = createRankedServer({ now: () => now, ...options });
  game.server.listen(0, "127.0.0.1");
  await once(game.server, "listening");
  const port = game.server.address().port;
  const endpoint = `ws://127.0.0.1:${port}/ranked`;
  const sockets = [];
  testCase.after(async () => {
    sockets.forEach((wire) => wire.terminate());
    await game.close();
  });

  async function open(origin = SITE) {
    const socket = new WebSocket(endpoint, { origin });
    sockets.push(socket);
    const inbox = [];
    socket.on("message", (message) => inbox.push(JSON.parse(message.toString())));
    await once(socket, "open");
    return {
      socket, inbox,
      send(message) { socket.send(JSON.stringify(message)); },
      async take(type, check = () => true) {
        for (let attempt = 0; attempt < 200; attempt++) {
          const index = inbox.findIndex((message) => message.type === type && check(message));
          if (index >= 0) return inbox.splice(index, 1)[0];
          await delay(10);
        }
        throw new Error(`Expected ranked message of type ${type}`);
      },
    };
  }

  async function guest(token) {
    const client = await open();
    client.send({ type: "auth", version: 1, ...(token && { token }) });
    const ready = await client.take("ready");
    assert.ok(/^[a-zA-Z0-9_-]{43}$/u.test(ready.token));
    assert.match(ready.name, /^[A-Za-z]+ [A-Za-z]+ \d{4}$/u);
    return { ...client, ready };
  }

  function step(ms) {
    now += ms;
  }

  return { game, endpoint, port, open, guest, step };
}

async function join(client, route, hero) {
  client.send({ type: "queue", route, hero });
  assert.equal((await client.take("queued")).route, route);
}

async function paired(left, right, route = "k") {
  const leftMatch = await left.take("match");
  const rightMatch = await right.take("match");
  assert.equal(leftMatch.matchId, rightMatch.matchId);
  assert.equal(leftMatch.route, route);
  assert.equal(leftMatch.side, 0);
  assert.equal(rightMatch.side, 1);
  return leftMatch.matchId;
}

async function spell(client, slot) {
  client.send({ type: "cast", slot });
  const { state } = await client.take("state", ({ state: sample }) => sample.pending?.slot === slot);
  const { pending } = state;
  const stars = [...pending.question.matchAll(/✦/gu)].length;
  const lost = Number(pending.question.match(/(\d+) sparks fly away/u)?.[1]) || 0;
  const choice = pending.choices.indexOf(String(stars - lost));
  assert.notEqual(choice, -1);
  client.send({ type: "answer", slot: choice });
  await client.take("state", ({ state: sample }) => !sample.pending
    && sample.events.some(({ kind, side, slot: launched }) => kind === "launch" && side === 0 && launched === slot));
}

async function board(client, route) {
  client.send({ type: "board", route });
  return client.take("board", ({ route: incoming }) => incoming === route);
}

async function expectRefusal(url, origin, status) {
  const socket = new WebSocket(url, { origin });
  const refused = new Promise((resolve, reject) => {
    socket.on("error", () => {});
    socket.once("open", () => { socket.terminate(); reject(new Error("Unexpected WebSocket upgrade.")); });
    socket.once("unexpected-response", (_request, response) => {
      response.resume();
      socket.on("error", () => {});
      socket.close();
      resolve(response.statusCode);
    });
  });
  assert.equal(await refused, status);
}

test("real health and WebSocket origin, path, authentication and duplicate-socket checks", async (t) => {
  const { port, endpoint, open, guest } = await fixture(t);
  const health = await fetch(`http://127.0.0.1:${port}/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { ok: true });
  await expectRefusal(endpoint, "https://example.test", 403);
  await expectRefusal(endpoint + "?token=not-a-real-token", SITE, 404);
  const local = await open("http://localhost:8080");
  local.send({ type: "board", route: "k" });
  assert.equal((await local.take("error")).code, "auth-required");
  local.send({ type: "auth", version: 1, token: "invalid" });
  assert.equal((await local.take("error")).code, "invalid-token");
  local.send({ type: "auth", version: 1, name: "A supplied name" });
  assert.equal((await local.take("error")).code, "invalid-auth");
  const active = await guest();
  local.send({ type: "auth", version: 1, token: active.ready.token });
  assert.equal((await local.take("error")).code, "already-online");
});

test("real matchmaking isolates grades and sends private state after each match handshake", async (t) => {
  const { guest, step } = await fixture(t);
  const left = await guest();
  const right = await guest();
  assert.deepEqual((await board(left, "k")).leaders, []);
  await join(left, "k", "gale");
  await join(right, "s1", "warden");
  step(100);
  await delay(75);
  assert.equal(left.inbox.some(({ type }) => type === "match"), false);
  assert.equal(right.inbox.some(({ type }) => type === "match"), false);
  right.send({ type: "cancel" });
  await right.take("canceled");
  await join(right, "k", "warden");
  const match = await paired(left, right);
  assert.ok(match);
  const initialLeft = await left.take("state");
  const initialRight = await right.take("state");
  assert.equal(initialLeft.state.pending, null);
  assert.equal(initialRight.state.pending, null);
  left.send({ type: "cast", slot: 0 });
  const prompt = await left.take("state", ({ state }) => Boolean(state.pending));
  assert.match(prompt.state.pending.question, /Count the sparks/u);
  assert.doesNotMatch(JSON.stringify(prompt), /answerIndex/u);
  step(150);
  const rival = await right.take("state", ({ state }) => state.events.some(({ kind }) => kind === "cast"));
  assert.equal(rival.state.pending, null);
});

test("real authoritative combat, requeue, forfeit and placed leaderboard are persisted per grade", async (t) => {
  const { guest, step } = await fixture(t);
  const left = await guest();
  let right = await guest();
  const rightToken = right.ready.token;
  const initial = (await board(left, "k")).profile;
  assert.deepEqual([initial.rating, initial.rank, initial.games], [1000, "Placement", 0]);
  await join(left, "k", "gale");
  await join(right, "k", "ember");
  const first = await paired(left, right);
  await left.take("state");
  await right.take("state");
  for (const slot of [0, 1, 2]) await spell(left, slot);
  for (let second = 1; second <= 10; second++) {
    step(1000);
    await left.take("state", ({ state }) => state.time >= second);
  }
  await spell(left, 2);
  step(1000);
  await left.take("state", ({ state }) => state.time >= 11);
  step(400);
  const result = await left.take("ranking");
  assert.deepEqual([result.matchId, result.reason, result.outcome, result.delta], [first, "complete", "win", 16]);
  assert.deepEqual([result.profile.games, result.profile.wins, result.profile.rating], [1, 1, 1016]);
  const losing = await right.take("ranking");
  assert.deepEqual([losing.outcome, losing.delta, losing.profile.games], ["loss", -16, 1]);
  assert.deepEqual((await board(left, "k")).leaders, []);
  assert.equal((await board(left, "s1")).profile.games, 0);

  for (let match = 2; match <= 3; match++) {
    await join(left, "k", "gale");
    await join(right, "k", "ember");
    assert.notEqual(await paired(left, right), first);
    left.send({ type: "cast", slot: 0 });
    right.send({ type: "cast", slot: 0 });
    await left.take("state", ({ state }) => state.pending?.slot === 0);
    await right.take("state", ({ state }) => state.pending?.slot === 0);
    right.send({ type: "leave" });
    await once(right.socket, "close");
    await left.take("room-status", ({ status }) => status === "disconnected");
    step(10_000);
    const afterForfeit = await left.take("ranking");
    assert.equal(afterForfeit.reason, "forfeit");
    assert.equal(afterForfeit.outcome, "win");
    assert.equal(afterForfeit.profile.games, match);
    right = await guest(rightToken);
  }
  const official = await board(left, "k");
  assert.equal(official.profile.games, 3);
  assert.equal(official.profile.rank, "Bronze");
  assert.equal(official.leaders[0].name, left.ready.name);
  assert.equal(official.leaders[0].rating, official.profile.rating);
  assert.equal(official.leaders[0].wins, 3);
  assert.equal((await board(right, "k")).profile.games, 3);
  assert.deepEqual((await board(right, "s1")).leaders, []);
});

test("real token reconnect resumes a dropped match but intentional leave cannot re-enter it", async (t) => {
  const { guest, step } = await fixture(t);
  const left = await guest();
  let right = await guest();
  const passport = right.ready.token;
  await join(left, "k", "gale");
  await join(right, "k", "ember");
  const match = await paired(left, right);
  right.socket.terminate();
  await left.take("room-status", ({ status }) => status === "disconnected");
  right = await guest(passport);
  assert.equal((await right.take("match")).matchId, match);
  await left.take("room-status", ({ status }) => status === "connected");
  right.send({ type: "leave" });
  await once(right.socket, "close");
  await left.take("room-status", ({ status }) => status === "disconnected");
  right = await guest(passport);
  right.send({ type: "queue", route: "k", hero: "ember" });
  assert.equal((await right.take("error")).code, "in-match");
  assert.equal(right.inbox.some(({ type }) => type === "match"), false);
  step(10_000);
  const expired = await left.take("ranking");
  assert.deepEqual([expired.reason, expired.outcome, expired.profile.games], ["expired", "expired", 0]);
});
