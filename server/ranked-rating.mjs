import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { ROUTES } from "../voyage/progression.mjs";

const gradeIds = new Set(ROUTES.map(({ id }) => id));
const initialRating = 1000;
const placementGames = 3;
const eloK = 32;
const ranks = [[0, "Bronze"], [1050, "Silver"], [1200, "Gold"], [1400, "Platinum"], [1600, "Diamond"]];
const colors = ["Amber", "Azure", "Blue", "Coral", "Emerald", "Gold", "Green", "Ivory", "Jade", "Lilac",
  "Mint", "Peach", "Pearl", "Rose", "Ruby", "Silver", "Teal", "Violet"];
const wildlife = ["Badger", "Crane", "Dolphin", "Finch", "Fox", "Gecko", "Hare", "Heron", "Koala", "Koi",
  "Otter", "Owl", "Panda", "Puffin", "Robin", "Sparrow", "Turtle", "Wren"];

const validId = (value) => typeof value === "string" && /^[a-zA-Z0-9._:-]{1,96}$/.test(value);
const tokenHash = (token) => createHash("sha256").update(token).digest();
const newToken = () => randomBytes(32).toString("base64url");

function ranking({ name, rating = initialRating, games = 0, wins = 0 }) {
  const rank = games < placementGames ? "Placement" : ranks.findLast(([threshold]) => rating >= threshold)[1];
  return { rating, rank, games, wins, name };
}

function ratingDelta(firstTeam, secondTeam, winner) {
  const [first, second] = [firstTeam, secondTeam]
    .map((team) => team.reduce((sum, { rating }) => sum + rating / team.length, 0));
  const expected = 1 / (1 + 10 ** ((second - first) / 400));
  const score = winner === "draw" ? .5 : winner === 0 ? 1 : 0;
  const delta = Math.round(eloK * (score - expected));
  const minimum = (team) => Math.min(...team.map(({ rating }) => rating));
  return Math.max(-minimum(firstTeam), Math.min(minimum(secondTeam), delta)) || 0;
}

function ratingRange(joinedAt, now) {
  return Math.min(400, 100 + 25 * Math.floor(Math.max(0, now - joinedAt) / 5000));
}

function eligibleEntry(entry) {
  return entry && validId(entry.id) && gradeIds.has(entry.route) && Number.isSafeInteger(entry.rating)
    && entry.rating >= 0 && Number.isFinite(entry.joinedAt);
}

export function takePair(entries, now = Date.now()) {
  if (!entries?.[Symbol.iterator] || !Number.isFinite(now)) return null;
  const ordered = [...entries].filter(eligibleEntry).sort((first, second) => first.joinedAt - second.joinedAt);
  const ranges = ordered.map(({ joinedAt }) => ratingRange(joinedAt, now));
  for (let index = 0; index < ordered.length; index++) {
    const first = ordered[index];
    let rival = null;
    let closest = Infinity;
    for (let next = index + 1; next < ordered.length; next++) {
      const candidate = ordered[next];
      if (candidate.route !== first.route || candidate.id === first.id) continue;
      const distance = Math.abs(first.rating - candidate.rating);
      if (distance <= Math.min(ranges[index], ranges[next]) && distance < closest) {
        rival = candidate;
        closest = distance;
        if (!distance) break;
      }
    }
    if (rival) return [first, rival];
  }
  return null;
}

function countBy(items, key) {
  const counts = new Map();
  for (const item of items) {
    const value = item?.[key];
    if (validId(value)) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

function adjacentTeam(teams, team, range) {
  let low = 0;
  let high = teams.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (teams[middle].rating < team.rating) low = middle + 1;
    else high = middle;
  }
  let left = low - 1;
  let right = low;
  while (left >= 0 || right < teams.length) {
    const before = left < 0 ? Infinity : team.rating - teams[left].rating;
    const after = right === teams.length ? Infinity : teams[right].rating - team.rating;
    if (Math.min(before, after) > range) break;
    const candidate = before < after ? teams[left--] : teams[right++];
    if (candidate.players.every((player) => !team.players.includes(player))) return candidate;
  }
  return null;
}

export function takeDuo(entries, now = Date.now()) {
  if (!entries?.[Symbol.iterator] || !Number.isFinite(now)) return null;
  const waiting = [...entries];
  const idCounts = countBy(waiting, "id");
  const partyCounts = countBy(waiting, "partyId");
  const ordered = waiting.filter((entry) => eligibleEntry(entry) && idCounts.get(entry.id) === 1
    && (entry.partyId == null || partyCounts.get(entry.partyId) === 2))
    .sort((first, second) => first.joinedAt - second.joinedAt)
    .map((entry) => ({ entry, range: ratingRange(entry.joinedAt, now), teams: [] }));
  const parties = new Map();
  const grades = new Map(ROUTES.map(({ id }) => [id, { solo: [], teamsByRange: new Map() }]));

  function addTeam(first, second, range) {
    const rating = first.entry.rating / 2 + second.entry.rating / 2;
    const team = { players: [first, second], rating, range };
    first.teams.push(team);
    const buckets = grades.get(first.entry.route).teamsByRange;
    if (!buckets.has(range)) buckets.set(range, []);
    buckets.get(range).push(team);
  }

  for (const player of ordered) {
    const { entry } = player;
    const grade = grades.get(entry.route);
    if (entry.partyId != null) {
      const partner = parties.get(entry.partyId);
      if (!partner) parties.set(entry.partyId, player);
      else if (partner.entry.route === entry.route) addTeam(partner, player, player.range);
    } else {
      for (const partner of grade.solo) {
        if (Math.abs(partner.entry.rating - entry.rating) <= player.range) addTeam(partner, player, player.range);
      }
      grade.solo.push(player);
    }
  }

  // Each team contains an older and newer entry. In a range bucket, only teams
  // sharing one of those two players can come before the closest usable rival.
  for (const { teamsByRange } of grades.values()) {
    for (const teams of teamsByRange.values()) teams.sort((first, second) => first.rating - second.rating);
  }
  for (const player of ordered) {
    const { teamsByRange } = grades.get(player.entry.route);
    let best = null;
    let smallestGap = Infinity;
    for (const team of player.teams) {
      for (const [range, rivals] of teamsByRange) {
        const rival = adjacentTeam(rivals, team, Math.min(team.range, range));
        if (!rival) continue;
        const gap = Math.abs(team.rating - rival.rating);
        if (!gap) return [team, rival].map(({ players }) => players.map(({ entry }) => entry));
        if (gap < smallestGap) {
          smallestGap = gap;
          best = [team, rival];
        }
      }
    }
    if (best) return best.map(({ players }) => players.map(({ entry }) => entry));
  }
  return null;
}

export function createRankedStore(path = ":memory:") {
  const database = new DatabaseSync(path, { timeout: 5000 });
  const statements = setup(database);

  function transaction(work) {
    database.exec("BEGIN IMMEDIATE");
    try {
      const result = work();
      database.exec("COMMIT");
      return result;
    } catch (error) {
      if (database.isTransaction) database.exec("ROLLBACK");
      throw error;
    }
  }

  function createGuest() {
    const id = randomUUID();
    const token = newToken();
    const hash = tokenHash(token);
    for (let attempt = 0; attempt < 16; attempt++) {
      const name = `${colors[randomInt(colors.length)]} ${wildlife[randomInt(wildlife.length)]} ${randomInt(1000, 10000)}`;
      if (statements.insertGuest.run(id, name, hash).changes) return { token, id, name };
    }
    throw new Error("Unable to assign a ranked guest name");
  }

  function getGuest(token) {
    if (typeof token !== "string" || !/^[a-zA-Z0-9_-]{43}$/.test(token)) return null;
    const guest = statements.guestByToken.get(tokenHash(token));
    return guest ? { id: guest.id, name: guest.name } : null;
  }

  function profile(id, route, mode = "solo") {
    const ladder = statements.ladders.get(mode);
    if (!ladder || !gradeIds.has(route) || !validId(id)) return null;
    const row = ladder.profile.get(route, id);
    if (!row) return null;
    return ranking({ name: row.name, rating: row.rating ?? undefined, games: row.games ?? undefined, wins: row.wins ?? undefined });
  }

  function leaderboard(route, cap = 20, mode = "solo") {
    const ladder = statements.ladders.get(mode);
    if (!ladder || !gradeIds.has(route) || !Number.isFinite(cap) || cap < 1) return [];
    return ladder.leaders.all(route, placementGames, Math.min(100, Math.floor(cap))).map(ranking);
  }

  function record(id, route, players, winner, reason, mode) {
    const ladder = statements.ladders.get(mode);
    const outcome = winner === "draw" ? -1 : winner;
    const previous = ladder.match.get(id);
    if (previous) {
      return previous.route === route && players.every((player, index) => player === previous[ladder.playerColumns[index]])
        && previous.winner === outcome ? JSON.parse(previous.results) : null;
    }
    const profiles = players.map((player) => profile(player, route, mode));
    if (profiles.some((profile) => !profile)) return null;
    const teamSize = players.length / 2;
    const delta = ratingDelta(profiles.slice(0, teamSize), profiles.slice(teamSize), winner);
    const results = profiles.map((old, index) => {
      const player = players[index];
      const side = index < teamSize ? 0 : 1;
      const change = side === 0 ? delta : -delta || 0;
      const updated = ranking({ name: old.name, rating: old.rating + change, games: old.games + 1,
        wins: old.wins + Number(winner === side) });
      ladder.writeRating.run(player, route, updated.rating, updated.games, updated.wins);
      return { id: player, delta: change, profile: updated };
    });
    ladder.writeMatch.run(id, route, ...players, outcome, typeof reason === "string" ? reason.slice(0, 80) : "",
      JSON.stringify(results));
    return results;
  }

  function settle(input) {
    const { id, route, players, winner, reason, mode = "solo" } = input ?? {};
    if (winner !== 0 && winner !== 1 && winner !== "draw") return null;
    if (!validId(id) || !gradeIds.has(route) || !Array.isArray(players)) return null;
    const ladder = statements.ladders.get(mode);
    if (!ladder || players.length !== ladder.playerColumns.length) return null;
    const ids = Array.from(players, (player) => player?.id);
    if (!ids.every(validId) || new Set(ids).size !== ids.length) return null;
    return transaction(() => record(id, route, ids, winner, reason, mode));
  }

  return { createGuest, getGuest, profile, leaderboard, settle, close() { database.close(); } };
}

function setup(database) {
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = FULL;
    CREATE TABLE IF NOT EXISTS ranked_guests (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      token_hash BLOB NOT NULL UNIQUE CHECK (length(token_hash) = 32)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS ranked_ratings (
      guest_id TEXT NOT NULL REFERENCES ranked_guests(id),
      route TEXT NOT NULL,
      rating INTEGER NOT NULL CHECK (rating >= 0),
      games INTEGER NOT NULL CHECK (games >= 0),
      wins INTEGER NOT NULL CHECK (wins >= 0 AND wins <= games),
      PRIMARY KEY (guest_id, route)
    ) STRICT;
    CREATE INDEX IF NOT EXISTS ranked_leaders ON ranked_ratings (route, rating DESC, wins DESC, guest_id);
    CREATE TABLE IF NOT EXISTS ranked_matches (
      id TEXT PRIMARY KEY,
      route TEXT NOT NULL,
      first_id TEXT NOT NULL REFERENCES ranked_guests(id),
      second_id TEXT NOT NULL REFERENCES ranked_guests(id) CHECK (second_id <> first_id),
      winner INTEGER NOT NULL CHECK (winner IN (-1, 0, 1)),
      reason TEXT NOT NULL,
      results TEXT NOT NULL
    ) STRICT;
  `);
  const duoColumns = ["first_id", "second_id", "third_id", "fourth_id"];
  database.exec(`
    CREATE TABLE IF NOT EXISTS ranked_duo_ratings (
      guest_id TEXT NOT NULL REFERENCES ranked_guests(id),
      route TEXT NOT NULL,
      rating INTEGER NOT NULL CHECK (rating >= 0),
      games INTEGER NOT NULL CHECK (games >= 0),
      wins INTEGER NOT NULL CHECK (wins >= 0 AND wins <= games),
      PRIMARY KEY (guest_id, route)
    ) STRICT;
    CREATE INDEX IF NOT EXISTS ranked_duo_leaders ON ranked_duo_ratings (route, rating DESC, wins DESC, guest_id);
    CREATE TABLE IF NOT EXISTS ranked_duo_matches (
      id TEXT PRIMARY KEY,
      route TEXT NOT NULL,
      ${duoColumns.map((column) => `${column} TEXT NOT NULL REFERENCES ranked_guests(id)`).join(",\n      ")},
      winner INTEGER NOT NULL CHECK (winner IN (-1, 0, 1)),
      reason TEXT NOT NULL,
      results TEXT NOT NULL
    ) STRICT;
  `);
  return {
    insertGuest: database.prepare("INSERT INTO ranked_guests (id, name, token_hash) VALUES (?, ?, ?) ON CONFLICT(name) DO NOTHING"),
    guestByToken: database.prepare("SELECT id, name FROM ranked_guests WHERE token_hash = ?"),
    ladders: new Map([
      ["solo", prepareLadder(database, "ranked", ["first_id", "second_id"])],
      ["duo", prepareLadder(database, "ranked_duo", duoColumns)],
    ]),
  };
}

function prepareLadder(database, tablePrefix, playerColumns) {
  const fields = ["id", "route", ...playerColumns, "winner", "reason", "results"];
  const placeholders = fields.map(() => "?").join(", ");
  return {
    playerColumns,
    profile: database.prepare(`SELECT g.name, r.rating, r.games, r.wins FROM ranked_guests g
      LEFT JOIN ${tablePrefix}_ratings r ON r.guest_id = g.id AND r.route = ? WHERE g.id = ?`),
    leaders: database.prepare(`SELECT g.name, r.rating, r.games, r.wins FROM ${tablePrefix}_ratings r
      JOIN ranked_guests g ON g.id = r.guest_id WHERE r.route = ? AND r.games >= ?
      ORDER BY r.rating DESC, r.wins DESC, r.guest_id LIMIT ?`),
    match: database.prepare(`SELECT route, ${playerColumns.join(", ")}, winner, results FROM ${tablePrefix}_matches WHERE id = ?`),
    writeRating: database.prepare(`INSERT INTO ${tablePrefix}_ratings (guest_id, route, rating, games, wins) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(guest_id, route) DO UPDATE SET rating = excluded.rating, games = excluded.games, wins = excluded.wins`),
    writeMatch: database.prepare(`INSERT INTO ${tablePrefix}_matches (${fields.join(", ")}) VALUES (${placeholders})`),
  };
}
