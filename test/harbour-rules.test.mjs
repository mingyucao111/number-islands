import assert from "node:assert/strict";
import test from "node:test";
import "../harbour-rules.js";

const rules = globalThis.NumberIslandsRules;
const minimum = (min) => min;
const clean = { attempts: 0, usedHint: false };
const assisted = { attempts: 2, usedHint: false };

function seededRandom(seed) {
  return (min, max) => {
    assert.ok(Number.isInteger(min) && Number.isInteger(max) && min <= max, `invalid range ${min} to ${max}`);
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return min + Math.floor(seed / 2 ** 32 * (max - min + 1));
  };
}

function findLoad(contract) {
  for (let lanterns = 0; lanterns <= contract.capacity; lanterns++) {
    for (let fruit = 0; fruit <= contract.capacity - lanterns; fruit++) {
      for (let tiles = 0; tiles <= contract.capacity - lanterns - fruit; tiles++) {
        const trial = { lanterns, fruit, tiles };
        if (rules.checkLoad(contract, trial).ok) return trial;
      }
    }
  }
  assert.fail(`Unsolvable order: ${contract.prompt}`);
}

test("Lumi advances a skill after two independent clean solves and keeps other skills unchanged", () => {
  const empty = rules.newProgress();
  assert.equal(rules.tierFor(empty, "cargo"), "core");
  const first = rules.observe(empty, "cargo", clean);
  assert.equal(rules.tierFor(first, "cargo"), "core");
  const second = rules.observe(first, "cargo", clean);
  assert.equal(rules.tierFor(second, "cargo"), "stretch");
  assert.equal(rules.tierFor(second, "island:beach"), "core");
  assert.deepEqual(empty.profiles, {});
  const recovered = rules.restore(JSON.parse(JSON.stringify(second)));
  assert.equal(rules.tierFor(recovered, "cargo"), "stretch");
});

test("Lumi uses hints and repeated checks as evidence, with one early mistake treated as neutral", () => {
  let state = rules.observe(rules.newProgress(), "island:harbour", clean);
  state = rules.observe(state, "island:harbour", { attempts: 1 });
  state = rules.observe(state, "island:harbour", clean);
  assert.equal(rules.tierFor(state, "island:harbour"), "core");
  state = rules.observe(state, "island:harbour", { attempts: 0, usedHint: true });
  state = rules.observe(state, "island:harbour", assisted);
  assert.equal(rules.tierFor(state, "island:harbour"), "support");

  for (let i = 0; i < 5; i++) state = rules.observe(state, "island:harbour", assisted);
  assert.equal(rules.tierFor(state, "island:harbour"), "support");
  for (let i = 0; i < 8; i++) state = rules.observe(state, "island:harbour", clean);
  assert.equal(rules.tierFor(state, "island:harbour"), "stretch");
  assert.equal(rules.tierFor(state, "island:market"), "core");
  assert.strictEqual(rules.observe(state, "island:harbour", { attempts: -1 }), state);
  assert.strictEqual(rules.observe(state, "invalid skill", clean), state);
});

test("load feedback distinguishes puzzle constraints and keeps all state unchanged on failure", () => {
  const progress = rules.newProgress();
  const [order] = rules.contracts(progress, "support", minimum);
  assert.equal(order.capacity, 6);
  assert.equal(order.rule.kind, "count");
  assert.equal(order.route, "Shoreline");
  assert.ok(rules.checkLoad(order, { lanterns: 2 }).ok);
  assert.match(rules.checkLoad(order, { fruit: 2 }).message, /more crates of lanterns/);
  assert.match(rules.checkLoad(order, { lanterns: 6, fruit: 3 }).message, /boat is full/i);
  assert.ok(!rules.checkLoad(order, { lanterns: -1 }).ok);
  assert.ok(!rules.checkLoad(order, { coins: 2 }).ok);
  const claim = rules.claimContract(progress, order, { fruit: 2 });
  assert.equal(claim.ok, false);
  assert.strictEqual(claim.progress, progress);
  assert.equal(progress.shells, 0);
});

test("a successful run rewards exactly once and expires competing orders from the same board", () => {
  const original = rules.newProgress();
  const board = rules.contracts(original, "core", minimum);
  const [order, alternative] = board;
  const load = findLoad(order);
  const payment = rules.claimContract(original, order, load);
  assert.ok(payment.ok);
  assert.equal(payment.reward, 4);
  assert.equal(payment.progress.shells, 4);
  assert.equal(payment.progress.deliveries, 1);
  assert.equal(payment.progress.sequence, 1);
  assert.equal(original.shells, 0);
  assert.ok(!rules.claimContract(original, order, load).ok);
  assert.ok(!rules.claimContract(original, alternative, findLoad(alternative)).ok);
  assert.ok(!rules.claimContract(payment.progress, order, load).ok);
  assert.ok(!rules.claimContract(original, { ...order, reward: 9999 }, load).ok);
});

test("earning and spending shells changes the size of the boat, routes and choice of orders", () => {
  let state = rules.newProgress();
  assert.deepEqual(rules.upgrades(state).map(({ cost }) => cost), [12, 10]);
  assert.ok(!rules.upgrade(state, "boat").ok);
  assert.ok(!rules.upgrade(state, "constructor").ok);
  for (let i = 0; i < 3; i++) {
    const [order] = rules.contracts(state, "support", minimum);
    state = rules.claimContract(state, order, findLoad(order)).progress;
  }
  const boat = rules.upgrade(state, "boat");
  assert.ok(boat.ok);
  assert.equal(boat.progress.shells, 0);
  assert.equal(boat.progress.boat, 1);
  state = boat.progress;
  for (let i = 0; i < 2; i++) {
    const [order] = rules.contracts(state, "core", minimum);
    assert.equal(order.route, "Coral Channel");
    assert.equal(order.capacity, 8);
    assert.equal(order.reward, 7);
    state = rules.claimContract(state, order, findLoad(order)).progress;
  }
  const dock = rules.upgrade(state, "dock");
  assert.ok(dock.ok);
  assert.equal(dock.progress.shells, 4);
  assert.equal(rules.contracts(dock.progress, "stretch", minimum).length, 3);
});

test("every generated order has a reachable load across all tiers and boat sizes", () => {
  const totalKinds = new Set();
  for (const tier of ["support", "core", "stretch"]) {
    for (let boat = 0; boat <= 2; boat++) {
      const state = rules.restore({ boat, dock: 2 });
      for (let seed = 0; seed < 35; seed++) {
        const orders = rules.contracts(state, tier, seededRandom(seed));
        assert.equal(orders.length, 4);
        assert.equal(new Set(orders.map(({ id }) => id)).size, orders.length);
        for (const order of orders) {
          assert.ok(rules.checkLoad(order, findLoad(order)).ok);
          totalKinds.add(order.rule.kind);
        }
      }
    }
  }
  assert.deepEqual([...totalKinds].sort(), ["count", "fraction", "mix", "value"]);
});

test("restore bounds saved fields and ignores malformed levels and unknown profiles", () => {
  const state = rules.restore({
    shells: -3,
    boat: 9,
    dock: 1,
    deliveries: -1,
    sequence: "7",
    profiles: { "island:reef": { tier: "stretch", run: 100 }, cargo: { tier: "impossible", run: 1 } },
  });
  assert.deepEqual(state, {
    shells: 0,
    boat: 0,
    dock: 1,
    deliveries: 0,
    sequence: 0,
    profiles: { "island:reef": { tier: "stretch", run: 0 } },
  });
});
