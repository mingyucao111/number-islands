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

async function join(client, route, hero, mode) {
  client.send({ type: "queue", route, hero, ...(mode && { mode }) });
  const queued = await client.take("queued");
  assert.deepEqual([queued.route, queued.mode], [route, mode]);
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

async function spell(client, slot, { side = 0, target } = {}) {
  const latestCast = (sample) => sample.events.findLast((event) => event.kind === "cast"
    && event.side === side && event.slot === slot);
  client.send({ type: "cast", slot, ...(target !== undefined && { target }) });
  const { state } = await client.take("state", ({ state: sample }) => sample.pending?.slot === slot
    && (latestCast(sample)?.id ?? 0) > (client.lastCast ?? 0));
  const { pending } = state;
  client.lastCast = latestCast(state).id;
  if (target !== undefined) assert.equal(pending.target, target);
  const stars = [...pending.question.matchAll(/✦/gu)].length;
  const lost = Number(pending.question.match(/(\d+) sparks fly away/u)?.[1]) || 0;
  const choice = pending.choices.indexOf(String(stars - lost));
  assert.notEqual(choice, -1);
  client.send({ type: "answer", slot: choice });
  await client.take("state", ({ state: sample }) => !sample.pending
    && sample.events.some((event) => event.kind === "launch" && event.side === side
      && event.slot === slot && event.id > client.lastCast));
}

async function board(client, route, mode) {
  client.send({ type: "board", route, ...(mode && { mode }) });
  return client.take("board", (message) => message.route === route && message.mode === mode);
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

async function matchedDuo(clients, route = "k") {
  const handshakes = await Promise.all(clients.map((client) => client.take("match")));
  const first = handshakes[0];
  assert.deepEqual(handshakes.map(({ side }) => side).sort(), [0, 1, 2, 3]);
  for (const [index, match] of handshakes.entries()) {
    assert.deepEqual([match.matchId, match.route, match.mode], [first.matchId, route, "duo"]);
    assert.deepEqual(match.roster, first.roster);
    assert.equal(match.roster[match.side].name, clients[index].ready.name);
    assert.deepEqual(Object.keys(match.roster[match.side]).sort(), ["hero", "name"]);
  }
  return handshakes;
}

test("four solo entries can form two teams without mixing grade, rank mode or answer prompts", async (t) => {
  const { guest, step } = await fixture(t);
  const clients = await Promise.all(Array.from({ length: 4 }, () => guest()));
  const [first, second, third, fourth] = clients;
  await join(first, "k", "gale", "duo");
  await join(second, "k", "warden", "duo");
  await join(third, "k", "ember", "duo");
  await join(fourth, "p12", "gale", "duo");
  await board(fourth, "p12", "duo");
  assert.ok(clients.every((client) => !client.inbox.some(({ type }) => type === "match")));

  fourth.send({ type: "cancel" });
  await fourth.take("canceled");
  await join(fourth, "k", "gale");
  await board(fourth, "k");
  assert.ok(clients.every((client) => !client.inbox.some(({ type }) => type === "match")));
  fourth.send({ type: "cancel" });
  await fourth.take("canceled");
  await join(fourth, "k", "gale", "duo");
  const [{ side: home }] = await matchedDuo(clients);
  for (const client of clients) {
    const { state } = await client.take("state");
    assert.deepEqual(state.fighters.map(({ team, hp }) => [team, hp]), [[0, 100], [0, 100], [1, 100], [1, 100]]);
  }
  const target = home < 2 ? 2 : 0;
  first.send({ type: "cast", slot: 0, target });
  const { state: privateState } = await first.take("state", ({ state }) => state.pending?.target === target);
  assert.match(privateState.pending.question, /Count the sparks/u);
  assert.doesNotMatch(JSON.stringify(privateState), /answerIndex/u);
  step(150);
  for (const peer of clients.slice(1)) {
    const { state } = await peer.take("state", ({ state }) => state.events.some(({ kind }) => kind === "cast"));
    assert.equal(state.pending, null);
  }
});

test("a premade stays on one team through cancellation, a real math duel and requeue", async (t) => {
  const { guest, step } = await fixture(t);
  const clients = await Promise.all(Array.from({ length: 4 }, () => guest()));
  const [leader, friend, rival, other] = clients;
  leader.send({ type: "party-create", route: "k" });
  const { party: created } = await leader.take("party");
  assert.match(created.code, /^[A-F0-9]{8}$/u);
  assert.deepEqual(created.members, [{ name: leader.ready.name, online: true, ready: false }]);
  friend.send({ type: "party-join", route: "s1", code: created.code });
  assert.equal((await friend.take("error")).code, "party-unavailable");
  friend.send({ type: "party-join", route: "k", code: created.code });
  for (const client of [leader, friend]) {
    const { party } = await client.take("party", ({ party }) => party?.members.length === 2);
    assert.deepEqual(party.members.map(({ name }) => name), [leader.ready.name, friend.ready.name]);
  }
  await join(leader, "k", "gale", "duo");
  await join(friend, "k", "warden", "duo");
  for (const client of [leader, friend]) await client.take("party", ({ party }) => party.members.every(({ ready }) => ready));
  friend.send({ type: "cancel" });
  for (const client of [leader, friend]) {
    await client.take("canceled");
    assert.ok(await client.take("party", ({ party }) => party.code === created.code && party.members.every(({ ready }) => !ready)));
  }
  await join(rival, "k", "gale", "duo");
  await join(other, "k", "gale", "duo");
  await board(other, "k", "duo");
  assert.ok(clients.every((client) => !client.inbox.some(({ type }) => type === "match")));
  await join(leader, "k", "gale", "duo");
  await board(leader, "k", "duo");
  assert.ok(clients.every((client) => !client.inbox.some(({ type }) => type === "match")));
  await join(friend, "k", "warden", "duo");
  const [leaderMatch, friendMatch, rivalMatch, otherMatch] = await matchedDuo(clients);
  const homeTeam = Math.floor(leaderMatch.side / 2);
  assert.equal(Math.floor(friendMatch.side / 2), homeTeam);
  assert.equal(Math.floor(rivalMatch.side / 2), 1 - homeTeam);

  const firstTarget = { side: leaderMatch.side, target: rivalMatch.side };
  const nextTarget = { side: leaderMatch.side, target: otherMatch.side };
  const reachTime = async (second, ms = 1000) => {
    step(ms);
    await leader.take("state", ({ state }) => state.time + 1e-6 >= second);
  };
  for (const slot of [0, 1, 2]) await spell(leader, slot, firstTarget);
  for (let second = 1; second <= 10; second++) await reachTime(second);
  await spell(leader, 2, firstTarget);
  await reachTime(11);
  step(300);
  const { state: knockout } = await leader.take("state", ({ state }) => state.fighters[rivalMatch.side].hp === 0);
  assert.equal(knockout.winner, null);
  assert.ok(clients.every((client) => !client.inbox.some(({ type }) => type === "ranking")));
  for (const slot of [0, 1]) await spell(leader, slot, nextTarget);
  await reachTime(12, 700);
  for (let second = 13; second <= 20; second++) await reachTime(second);
  await spell(leader, 2, nextTarget);
  for (let second = 21; second <= 30; second++) await reachTime(second);
  await spell(leader, 2, nextTarget);
  await reachTime(31);
  step(300);
  for (const [index, client] of clients.entries()) {
    const match = await client.take("ranking");
    assert.deepEqual([match.matchId, match.reason, match.profile.games], [leaderMatch.matchId, "complete", 1]);
    assert.deepEqual([match.outcome, match.delta, match.profile.wins], index < 2 ? ["win", 16, 1] : ["loss", -16, 0]);
    assert.equal((await board(client, "k", "duo")).profile.games, 1);
    assert.equal((await board(client, "k")).profile.games, 0);
    assert.equal((await board(client, "s1", "duo")).profile.games, 0);
  }
  for (const [index, client] of clients.entries()) await join(client, "k", index === 1 ? "warden" : "gale", "duo");
  const [freshLeader, freshFriend] = await matchedDuo(clients);
  assert.notEqual(freshLeader.matchId, leaderMatch.matchId);
  assert.equal(Math.floor(freshLeader.side / 2), Math.floor(freshFriend.side / 2));
});
