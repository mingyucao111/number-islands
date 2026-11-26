import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { createRankedStore, takeDuo, takePair } from "../server/ranked-rating.mjs";

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

const party = (partyId, player) => ({ ...player, partyId });

test("four solos fill two teams with the closest team averages and the oldest compatible anchor", () => {
  const oldest = entry("oldest", 1000, 1);
  const strongest = entry("strongest", 1090, 2);
  const third = entry("third", 1040, 3);
  const fourth = entry("fourth", 1050, 4);
  const unavailable = entry("waiting", 2000);
  assert.equal(takeDuo([oldest, strongest, third], 5000), null);
  assert.deepEqual(takeDuo([fourth, strongest, unavailable, third, oldest].values(), 5000), [[oldest, strongest], [third, fourth]]);
});

test("a full party stays together against solo fill, and incomplete or oversized parties do not enter", () => {
  const first = party("party-1", entry("captain", 1010));
  const second = party("party-1", entry("partner", 1190));
  const soloA = entry("solo-a", 1080, 5);
  const soloB = entry("solo-b", 1125, 6);
  assert.deepEqual(takeDuo([soloB, first, soloA, second], 7000), [[first, second], [soloA, soloB]]);
  assert.equal(takeDuo([first, soloA, soloB, entry("solo-c", 1100)], 5000), null);
  assert.equal(takeDuo([first, second, soloA, soloB, party("party-1", entry("excess", 1100))], 5000), null);
  const otherA = party("party-2", soloA);
  const otherB = party("party-2", soloB);
  assert.deepEqual(takeDuo([first, second, otherA, otherB], 5000), [[first, second], [otherA, otherB]]);
});

test("duo respects the newest player's range, the wait cap, distinct accounts and grade boundaries", () => {
  const first = party("party-1", entry("a", 1000));
  const second = party("party-1", entry("b", 1000));
  const third = party("party-2", entry("c", 1200));
  const fourth = party("party-2", entry("d", 1200, 6000));
  assert.equal(takeDuo([first, second, third, fourth], 25999), null);
  assert.deepEqual(takeDuo([first, second, third, fourth], 26000), [[first, second], [third, fourth]]);
  assert.equal(takeDuo([first, second, { ...third, rating: 1500 }, { ...fourth, rating: 1500 }], 500000), null);
  assert.equal(takeDuo([first, second, third, { ...fourth, route: "p12" }], 50000), null);
  assert.equal(takeDuo([first, second, { ...third, route: "p12" }, { ...fourth, route: "p12" }], 50000), null);
  assert.equal(takeDuo([first, second, third, { ...fourth, id: first.id }], 50000), null);
});

function duo(id, players, winner, route = "p34") {
  return { id, route, mode: "duo", players, winner, reason: "completed" };
}

test("duo has a persistent independent ladder and returns only the original four-player settlement", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "number-islands-duo-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, "ranked.sqlite");
  const firstRun = createRankedStore(path);
  const players = Array.from({ length: 4 }, () => firstRun.createGuest());
  const [a, b, c, d] = players;
  firstRun.settle(match("solo-game", "p34", a, b, 1));
  const input = duo("duo-game", players, 0);
  const original = firstRun.settle(input);
  assert.deepEqual(original.map(({ id, delta, profile }) => [id, delta, profile.rating, profile.wins]), [
    [a.id, 16, 1016, 1], [b.id, 16, 1016, 1], [c.id, -16, 984, 0], [d.id, -16, 984, 0],
  ]);
  firstRun.close();

  const reopened = ranked(t, path);
  assert.deepEqual(reopened.settle(input), original);
  assert.equal(reopened.settle(duo(input.id, [a, c, b, d], 0)), null);
  assert.equal(reopened.settle(duo(input.id, players, 1)), null);
  assert.deepEqual(reopened.profile(a.id, "p34", "solo"), { name: a.name, rank: "Placement", rating: 984, games: 1, wins: 0 });
  assert.deepEqual(reopened.profile(a.id, "p34", "duo"), original[0].profile);
  assert.equal(reopened.profile(a.id, "p56", "duo").games, 0);
  assert.equal(reopened.profile(a.id, "p34", "squad"), null);
  assert.deepEqual(reopened.leaderboard("p34", 20, "duo"), []);
  reopened.settle(duo("duo-second", players, 0));
  reopened.settle(duo("duo-third", players, "draw"));
  assert.deepEqual(new Set(reopened.leaderboard("p34", 20, "duo").map(({ name }) => name)), new Set(players.map(({ name }) => name)));
  assert.deepEqual(reopened.leaderboard("p34", 20, "solo"), []);
  assert.deepEqual(reopened.leaderboard("p56", 20, "duo"), []);
});

test("duo rejects partial, repeated or unrated participants atomically", (t) => {
  const store = ranked(t);
  const players = Array.from({ length: 4 }, () => store.createGuest());
  const [a, b, c] = players;
  assert.equal(store.settle(duo("cancelled", players, null)), null);
  assert.equal(store.settle(duo("three-players", players.slice(0, 3), 0)), null);
  assert.equal(store.settle(duo("duplicate", [a, b, c, a], 1)), null);
  assert.equal(store.settle(duo("invalid", [a, b, c, { id: "unknown" }], 0)), null);
  assert.equal(store.settle({ ...duo("wrong-mode", players, 0), mode: "squad" }), null);
  assert.ok(players.every(({ id }) => store.profile(id, "p34", "duo").games === 0));
});

test("duo Elo uses the average team strength and limits the whole team transfer at its weakest player's floor", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "number-islands-team-elo-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, "ranked.sqlite");
  const initial = createRankedStore(path);
  const players = Array.from({ length: 4 }, () => initial.createGuest());
  initial.close();
  const fixture = new DatabaseSync(path);
  const seed = fixture.prepare("INSERT INTO ranked_duo_ratings (guest_id, route, rating, games, wins) VALUES (?, ?, ?, 3, 0)");
  players.forEach(({ id }, index) => {
    seed.run(id, "p34", [900, 1100, 950, 1250][index]);
    seed.run(id, "k", [10, 20, 2, 8][index]);
  });
  fixture.close();
  const store = ranked(t, path);
  assert.deepEqual(store.settle(duo("underdogs", players, 0)).map(({ delta }) => delta), [20, 20, -20, -20]);
  assert.deepEqual(store.settle(duo("team-floor", players, 0, "k")).map(({ delta, profile }) => [delta, profile.rating]), [[2, 12], [2, 22], [-2, 0], [-2, 6]]);
});
