import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { createRankedStore, takePair } from "../server/ranked-rating.mjs";

function ranked(t, path) {
  const store = createRankedStore(path);
  t.after(() => store.close());
  return store;
}

function match(id, route, first, second, winner) {
  return { id, route, players: [first, second], winner, reason: "completed" };
}

test("guest tokens authenticate only their guest and profiles expose a generated alias", (t) => {
  const store = ranked(t);
  const first = store.createGuest();
  const second = store.createGuest();
  assert.notEqual(first.id, second.id);
  assert.notEqual(first.token, second.token);
  assert.notEqual(first.name, second.name);
  assert.match(first.name, /^[A-Za-z]+ [A-Za-z]+ [0-9]+$/);
  assert.deepEqual(store.getGuest(first.token), { id: first.id, name: first.name });
  assert.deepEqual(store.getGuest(second.token), { id: second.id, name: second.name });
  for (const invalid of [undefined, {}, first.id, first.token + "x", "x".repeat(43)]) assert.equal(store.getGuest(invalid), null);
  assert.deepEqual(store.profile(first.id, "k"), { rating: 1000, rank: "Placement", games: 0, wins: 0, name: first.name });
  assert.equal(store.profile("unknown", "k"), null);
});

test("ranked results apply Elo to both players, calibrate on three games and keep grade bands separate", (t) => {
  const store = ranked(t);
  const first = store.createGuest();
  const second = store.createGuest();
  const result = store.settle(match("first", "p12", first, second, 0));
  assert.deepEqual(result.map(({ id, delta, profile }) => [id, delta, profile.rating, profile.games, profile.wins]), [
    [first.id, 16, 1016, 1, 1], [second.id, -16, 984, 1, 0],
  ]);
  assert.equal(result[0].profile.rank, "Placement");
  const rematch = store.settle(match("rematch", "p12", first, second, 1));
  assert.deepEqual(rematch.map(({ delta, profile }) => [delta, profile.rating, profile.wins]), [[-17, 999, 1], [17, 1001, 1]]);
  assert.deepEqual(store.leaderboard("p12", 10), []);
  const draw = store.settle(match("draw", "p12", first, second, "draw"));
  assert.deepEqual(draw.map(({ delta, profile }) => [delta, profile.rank, profile.games, profile.wins]), [[0, "Bronze", 3, 1], [0, "Bronze", 3, 1]]);
  assert.deepEqual(store.leaderboard("p12", 1), [{ rating: 1001, rank: "Bronze", games: 3, wins: 1, name: second.name }]);
  assert.deepEqual(store.leaderboard("p34", 10), []);
  for (const route of ["k", "p34", "p56", "s1", "s23"]) assert.equal(store.profile(first.id, route).rating, 1000);
  assert.equal(store.profile(first.id, "P1"), null);
  assert.deepEqual(store.leaderboard("P1", 10), []);
});

test("wins move profiles above the Bronze boundary and the leaderboard returns only safe profile fields", (t) => {
  const store = ranked(t);
  const first = store.createGuest();
  const second = store.createGuest();
  for (let index = 0; index < 3; index++) store.settle(match(`win-${index}`, "s23", first, second, 0));
  assert.equal(store.profile(first.id, "s23").rank, "Bronze");
  store.settle(match("win-four", "s23", first, second, 0));
  assert.deepEqual(store.leaderboard("s23", 999).map(({ name, rank, wins }) => [name, rank, wins]), [[first.name, "Silver", 4], [second.name, "Bronze", 0]]);
  assert.deepEqual(Object.keys(store.leaderboard("s23", 1)[0]).sort(), ["games", "name", "rank", "rating", "wins"]);
});

test("unrated, conflicting or invalid results do not change standings", (t) => {
  const store = ranked(t);
  const first = store.createGuest();
  const second = store.createGuest();
  const third = store.createGuest();
  for (const input of [
    null,
    match("cancelled", "s1", first, second, null),
    match("different-route", "s24", first, second, 0),
    match("no-opponent", "s1", first, { id: "unknown" }, 0),
    match("same-id", "s1", first, first, 0),
    match("invalid-outcome", "s1", first, second, "0"),
  ]) assert.equal(store.settle(input), null);
  assert.equal(store.profile(first.id, "s1").games, 0);
  store.settle(match("known", "s1", first, second, 0));
  assert.equal(store.settle(match("known", "s1", first, third, 0)), null);
  assert.equal(store.settle(match("known", "s1", first, second, 1)), null);
  assert.equal(store.profile(first.id, "s1").games, 1);
  assert.equal(store.profile(third.id, "s1").games, 0);
});

test("a rounded draw returns an exact replayable zero for either side", (t) => {
  const store = ranked(t);
  const first = store.createGuest();
  const second = store.createGuest();
  store.settle(match("start", "p56", first, second, 0));
  store.settle(match("rematch", "p56", first, second, 1));
  const input = match("even-draw", "p56", second, first, "draw");
  const result = store.settle(input);
  assert.deepEqual(result.map(({ delta }) => delta), [0, 0]);
  assert.deepEqual(store.settle(input), result);
});

test("guest authentication and the original settlement survive closing and reopening SQLite", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "number-islands-ranking-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, "ranked.sqlite");
  const initial = createRankedStore(path);
  const first = initial.createGuest();
  const second = initial.createGuest();
  const input = match("durable-match", "k", first, second, 0);
  const original = initial.settle(input);
  initial.settle(match("later-result", "k", first, second, 1));
  initial.close();
  assert.equal(readFileSync(path).includes(first.token), false);
  const next = ranked(t, path);
  assert.deepEqual(next.getGuest(first.token), { id: first.id, name: first.name });
  assert.deepEqual(next.settle(input), original);
  assert.equal(next.profile(first.id, "k").games, 2);
  assert.equal(next.profile(second.id, "k").games, 2);
});

test("rating cannot cross zero and actual Elo transferred still sums to zero", () => {
  const directory = mkdtempSync(join(tmpdir(), "number-islands-floor-"));
  try {
    const path = join(directory, "ranked.sqlite");
    const initial = createRankedStore(path);
    const first = initial.createGuest();
    const second = initial.createGuest();
    initial.close();
    const fixture = new DatabaseSync(path);
    fixture.prepare("INSERT INTO ranked_ratings (guest_id, route, rating, games, wins) VALUES (?, 'k', 2, 3, 0)").run(first.id);
    fixture.prepare("INSERT INTO ranked_ratings (guest_id, route, rating, games, wins) VALUES (?, 'k', 5, 3, 0)").run(second.id);
    fixture.close();
    const store = createRankedStore(path);
    try {
      const result = store.settle(match("floor", "k", first, second, 1));
      assert.deepEqual(result.map(({ delta, profile }) => [delta, profile.rating]), [[-2, 0], [2, 7]]);
    } finally { store.close(); }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

const entry = (id, rating, joinedAt = 0, route = "k") => ({ id, rating, joinedAt, route });

test("matchmaking pairs only known, identical grade bands with distinct players", () => {
  const first = entry("player1", 1030);
  const second = entry("player2", 1005, 0, "p12");
  const samePlayer = entry("player1", 1010);
  const invalid = entry("third", 1030, 0, "s24");
  assert.equal(takePair([first, second, samePlayer, invalid], 500_000), null);
  const valid = entry("player4", 1001);
  assert.deepEqual(takePair([first, second, samePlayer, invalid, valid], 500_000), [first, valid]);
});

test("rating gaps widen for both waiting players, with a hard cap", () => {
  const first = entry("first", 1000);
  const second = entry("second", 1200);
  assert.equal(takePair([first, second], 19_999), null);
  assert.deepEqual(takePair([first, second], 20_000), [first, second]);
  const recent = entry("recent", 1200, 18_000);
  assert.equal(takePair([first, recent], 20_000), null);
  assert.deepEqual(takePair([recent, first], 38_000), [first, recent]);
  assert.equal(takePair([first, entry("distant", 1401)], 500_000), null);
});

test("the longest waiting compatible player gets the closest available rival", () => {
  const oldest = entry("oldest", 1000);
  const nearby = entry("new-nearby", 1005, 8000);
  const earlier = entry("earlier", 1090, 1000);
  const unpairable = entry("unpairable", 900, 0, "p12");
  assert.deepEqual(takePair([nearby, earlier, unpairable, oldest], 9000), [oldest, nearby]);
});
