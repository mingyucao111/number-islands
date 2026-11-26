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

function ranking({ name, rating = initialRating, games = 0, wins = 0 }) {
  const rank = games < placementGames ? "Placement" : ranks.findLast(([threshold]) => rating >= threshold)[1];
  return { rating, rank, games, wins, name };
}

function ratingDelta(first, second, winner) {
  const expected = 1 / (1 + 10 ** ((second - first) / 400));
  const score = winner === "draw" ? .5 : winner === 0 ? 1 : 0;
  const delta = Math.round(eloK * (score - expected));
  return Math.max(-first, Math.min(second, delta)) || 0;
}

function ratingRange(joinedAt, now) {
  return Math.min(400, 100 + 25 * Math.floor(Math.max(0, now - joinedAt) / 5000));
}

export function takePair(entries, now = Date.now()) {
  if (!entries?.[Symbol.iterator] || !Number.isFinite(now)) return null;
  const ordered = [...entries].filter((entry) => entry && validId(entry.id) && gradeIds.has(entry.route)
    && Number.isSafeInteger(entry.rating) && entry.rating >= 0 && Number.isFinite(entry.joinedAt))
    .sort((first, second) => first.joinedAt - second.joinedAt);
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

export function createRankedStore(path = ":memory:") {
  const database = new DatabaseSync(path, { timeout: 5000 });
  const statements = setup(database);

  function createGuest() {
    const id = randomUUID();
    const token = randomBytes(32).toString("base64url");
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

  function profile(id, route) {
    if (!gradeIds.has(route) || !validId(id)) return null;
    const row = statements.profile.get(route, id);
    if (!row) return null;
    return ranking({ name: row.name, rating: row.rating ?? undefined, games: row.games ?? undefined, wins: row.wins ?? undefined });
  }

  function leaderboard(route, cap = 20) {
    if (!gradeIds.has(route) || !Number.isFinite(cap) || cap < 1) return [];
    return statements.leaders.all(route, placementGames, Math.min(100, Math.floor(cap))).map(ranking);
  }

  function record(id, route, firstId, secondId, winner, reason) {
    const outcome = winner === "draw" ? -1 : winner;
    const previous = statements.match.get(id);
    if (previous) {
      return previous.route === route && previous.first_id === firstId && previous.second_id === secondId
        && previous.winner === outcome ? JSON.parse(previous.results) : null;
    }
    const first = profile(firstId, route);
    const second = profile(secondId, route);
    if (!first || !second) return null;
    const delta = ratingDelta(first.rating, second.rating, winner);
    const results = [[firstId, first, delta], [secondId, second, -delta || 0]].map(([player, old, change], side) => {
      const updated = ranking({ name: old.name, rating: old.rating + change, games: old.games + 1,
        wins: old.wins + Number(winner === side) });
      statements.writeRating.run(player, route, updated.rating, updated.games, updated.wins);
      return { id: player, delta: change, profile: updated };
    });
    statements.writeMatch.run(id, route, firstId, secondId, outcome, typeof reason === "string" ? reason.slice(0, 80) : "",
      JSON.stringify(results));
    return results;
  }

  function settle(input) {
    const { id, route, players, winner, reason } = input ?? {};
    if (winner !== 0 && winner !== 1 && winner !== "draw") return null;
    if (!validId(id) || !gradeIds.has(route) || !Array.isArray(players) || players.length !== 2) return null;
    const [firstId, secondId] = players.map((player) => player?.id);
    if (!validId(firstId) || !validId(secondId) || firstId === secondId) return null;
    database.exec("BEGIN IMMEDIATE");
    try {
      const result = record(id, route, firstId, secondId, winner, reason);
      database.exec("COMMIT");
      return result;
    } catch (error) {
      if (database.isTransaction) database.exec("ROLLBACK");
      throw error;
    }
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
  return {
    insertGuest: database.prepare("INSERT INTO ranked_guests (id, name, token_hash) VALUES (?, ?, ?) ON CONFLICT(name) DO NOTHING"),
    guestByToken: database.prepare("SELECT id, name FROM ranked_guests WHERE token_hash = ?"),
    profile: database.prepare(`SELECT g.name, r.rating, r.games, r.wins FROM ranked_guests g
      LEFT JOIN ranked_ratings r ON r.guest_id = g.id AND r.route = ? WHERE g.id = ?`),
    leaders: database.prepare(`SELECT g.name, r.rating, r.games, r.wins FROM ranked_ratings r
      JOIN ranked_guests g ON g.id = r.guest_id WHERE r.route = ? AND r.games >= ?
      ORDER BY r.rating DESC, r.wins DESC, r.guest_id LIMIT ?`),
    match: database.prepare("SELECT route, first_id, second_id, winner, results FROM ranked_matches WHERE id = ?"),
    writeRating: database.prepare(`INSERT INTO ranked_ratings (guest_id, route, rating, games, wins) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(guest_id, route) DO UPDATE SET rating = excluded.rating, games = excluded.games, wins = excluded.wins`),
    writeMatch: database.prepare("INSERT INTO ranked_matches (id, route, first_id, second_id, winner, reason, results) VALUES (?, ?, ?, ?, ?, ?, ?)"),
  };
}
