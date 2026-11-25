(function installHarbourRules(scope) {
  "use strict";

  const tiers = ["support", "core", "stretch"];
  const movesToAdapt = 2;
  const maxProfiles = 64;
  const maxShells = 1_000_000;
  const maxDeliveries = Number.MAX_SAFE_INTEGER;
  const cargo = Object.freeze([
    Object.freeze({ id: "lanterns", name: "Lanterns", icon: "🏮", value: 2 }),
    Object.freeze({ id: "fruit", name: "Fruit", icon: "🍊", value: 3 }),
    Object.freeze({ id: "tiles", name: "Roof tiles", icon: "🧱", value: 4 }),
  ]);
  const routes = ["Shoreline", "Coral Channel", "Beacon Crossing"];
  const customers = [
    { title: "Pier lantern festival", location: "the festival pier" },
    { title: "Market morning", location: "the floating market" },
    { title: "Roof repair", location: "the boatyard" },
    { title: "Lighthouse supply run", location: "the lighthouse" },
  ];
  const upgradesById = {
    boat: { title: "Build a bigger boat", costs: [12, 24] },
    dock: { title: "Expand the dispatch dock", costs: [10, 18] },
  };
  const issued = new WeakMap();

  function newProgress() {
    return { shells: 0, boat: 0, dock: 0, deliveries: 0, sequence: 0, profiles: {} };
  }

  function boundedInteger(value, minimum, maximum) {
    return Number.isSafeInteger(value) && value >= minimum && value <= maximum;
  }

  function validSkill(skill) {
    return typeof skill === "string" && /^[a-z0-9]+(?:[-:][a-z0-9]+)*$/.test(skill) && skill.length <= 45;
  }

  function restore(raw) {
    const progress = newProgress();
    if (!raw || typeof raw !== "object") return progress;

    if (boundedInteger(raw.shells, 0, maxShells)) progress.shells = raw.shells;
    if (boundedInteger(raw.boat, 0, upgradesById.boat.costs.length)) progress.boat = raw.boat;
    if (boundedInteger(raw.dock, 0, upgradesById.dock.costs.length)) progress.dock = raw.dock;
    if (boundedInteger(raw.deliveries, 0, maxDeliveries)) progress.deliveries = raw.deliveries;
    if (boundedInteger(raw.sequence, 0, maxDeliveries)) progress.sequence = raw.sequence;

    if (raw.profiles && typeof raw.profiles === "object") {
      for (const [skill, profile] of Object.entries(raw.profiles).slice(0, maxProfiles)) {
        if (!validSkill(skill) || !profile || !tiers.includes(profile.tier)) continue;
        const run = boundedInteger(profile.run, -movesToAdapt + 1, movesToAdapt - 1) ? profile.run : 0;
        Object.defineProperty(progress.profiles, skill, {
          value: { tier: profile.tier, run }, enumerable: true, configurable: true, writable: true,
        });
      }
    }
    return progress;
  }

  function ownProfile(progress, skill) {
    return Object.hasOwn(progress.profiles, skill) ? progress.profiles[skill] : { tier: "core", run: 0 };
  }

  function tierFor(progress, skill) {
    return ownProfile(progress, skill).tier;
  }

  function observe(progress, skill, { attempts, usedHint = false } = {}) {
    if (!validSkill(skill) || !Number.isSafeInteger(attempts) || attempts < 0) return progress;
    if (!Object.hasOwn(progress.profiles, skill) && Object.keys(progress.profiles).length >= maxProfiles) return progress;

    const profile = ownProfile(progress, skill);
    const evidence = usedHint || attempts >= 2 ? -1 : attempts === 0 ? 1 : 0;
    const run = Math.sign(profile.run) === evidence ? profile.run + evidence : evidence;
    const shouldAdapt = Math.abs(run) >= movesToAdapt;
    const position = tiers.indexOf(profile.tier);
    const tier = shouldAdapt ? tiers[Math.min(2, Math.max(0, position + evidence))] : profile.tier;
    return { ...progress, profiles: { ...progress.profiles, [skill]: { tier, run: shouldAdapt ? 0 : run } } };
  }

  function capacityFor(boat) {
    return 6 + boat * 2;
  }

  function countContract(preferred, capacity, random) {
    const count = random(2, Math.min(5, capacity));
    return {
      rule: { kind: "count", count, cargoId: preferred.id },
      prompt: `Load exactly ${count} crates of ${preferred.name.toLowerCase()}.`,
    };
  }

  function mixContract(preferred, capacity, random) {
    const count = random(4, capacity);
    const portion = random(1, count - 1);
    return {
      rule: { kind: "mix", count, cargoId: preferred.id, portion },
      prompt: `Load ${count} crates in all. Exactly ${portion} must contain ${preferred.name.toLowerCase()}.`,
    };
  }

  function valueContract(capacity, random, tier) {
    const start = random(0, cargo.length - 1);
    const first = cargo[start];
    const second = cargo[(start + random(1, cargo.length - 1)) % cargo.length];
    const count = random(3, Math.min(capacity, tier === "stretch" ? 10 : 6));
    const firstCount = random(1, count - 1);
    const value = firstCount * first.value + (count - firstCount) * second.value;
    return {
      rule: { kind: "value", value, minKinds: 2 },
      prompt: `Ship cargo worth exactly ${value} trade points. Use at least two kinds of cargo.`,
    };
  }

  function fractionContract(preferred, capacity, random) {
    const denominator = random(2, Math.min(4, Math.floor(capacity / 2)));
    const numerator = random(1, denominator - 1);
    const count = denominator * random(2, Math.floor(capacity / denominator));
    return {
      rule: { kind: "fraction", count, cargoId: preferred.id, numerator, denominator },
      prompt: `Load ${count} crates. ${numerator}/${denominator} of the crates must be ${preferred.name.toLowerCase()}.`,
    };
  }

  function makeContractRule(tier, index, capacity, random) {
    const preferred = cargo[random(0, cargo.length - 1)];
    if (tier === "support") return countContract(preferred, capacity, random);
    if (tier === "stretch" && index % 2 === 0) return fractionContract(preferred, capacity, random);
    if (tier === "core" && index % 2 === 0) return mixContract(preferred, capacity, random);
    return valueContract(capacity, random, tier);
  }

  function contracts(progress, tier, random) {
    const offers = 2 + progress.dock;
    const capacity = capacityFor(progress.boat);
    const start = random(0, customers.length - 1);
    const board = { closed: false };
    return Array.from({ length: offers }, (_, index) => {
      const customer = customers[(start + index) % customers.length];
      const rank = (progress.boat + index) % (progress.boat + 1);
      const { rule, prompt } = makeContractRule(tier, index, capacity, random);
      const offer = Object.freeze({
        id: `${progress.sequence}-${index}`,
        sequence: progress.sequence,
        title: customer.title,
        prompt: `${prompt} Deliver to ${customer.location}.`,
        cargo,
        capacity,
        rule: Object.freeze(rule),
        reward: 4 + rank * 3 + (tier === "stretch" ? 1 : 0),
        route: routes[rank],
      });
      issued.set(offer, board);
      return offer;
    });
  }

  function checkLoad(contract, cargoCounts) {
    const { cargo: goods, capacity, rule } = contract;
    if (!cargoCounts || typeof cargoCounts !== "object" || Array.isArray(cargoCounts)) {
      return { ok: false, message: "Load cargo on your boat first." };
    }
    const counts = goods.map(({ id }) => Object.hasOwn(cargoCounts, id) ? cargoCounts[id] : 0);
    if (Object.keys(cargoCounts).some((id) => !goods.some((good) => good.id === id))
      || counts.some((count) => !boundedInteger(count, 0, capacity))) {
      return { ok: false, message: "Check each crate in the boat hold." };
    }
    const total = counts.reduce((sum, count) => sum + count, 0);
    if (!total) return { ok: false, message: "Load cargo on your boat first." };
    if (total > capacity) return { ok: false, message: "The boat is full. Unload some cargo before you sail." };

    if (rule.kind === "value") {
      const value = counts.reduce((sum, count, index) => sum + count * goods[index].value, 0);
      if (value !== rule.value) {
        const direction = value < rule.value ? "below" : "above";
        return { ok: false, message: `Your cargo is worth ${value} trade points, ${direction} the order.` };
      }
      if (counts.filter((count) => count > 0).length < rule.minKinds) {
        return { ok: false, message: "The value matches. Find a way to include two kinds of cargo." };
      }
    } else {
      if (total !== rule.count) {
        return { ok: false, message: `You have ${total} crates. The order needs ${rule.count} in all.` };
      }
      const selected = goods.findIndex(({ id }) => id === rule.cargoId);
      const expected = rule.kind === "fraction" ? rule.count * rule.numerator / rule.denominator
        : rule.kind === "mix" ? rule.portion : rule.count;
      if (counts[selected] !== expected) {
        const direction = counts[selected] < expected ? "more" : "fewer";
        return { ok: false, message: `The crate total is right. Try ${direction} crates of ${goods[selected].name.toLowerCase()}.` };
      }
    }
    return { ok: true, message: "Cargo matches the order." };
  }

  function claimContract(progress, contract, cargoCounts) {
    const board = issued.get(contract);
    if (!board || board.closed || contract.sequence !== progress.sequence || progress.sequence >= maxDeliveries) {
      return { ok: false, message: "This charter has closed. Choose a new order.", progress, reward: 0 };
    }
    const result = checkLoad(contract, cargoCounts);
    if (!result.ok) return { ...result, progress, reward: 0 };
    board.closed = true;
    const shells = Math.min(maxShells, progress.shells + contract.reward);
    return {
      ok: true,
      message: "Delivery complete!",
      reward: shells - progress.shells,
      progress: {
        ...progress,
        shells,
        deliveries: Math.min(maxDeliveries, progress.deliveries + 1),
        sequence: progress.sequence + 1,
      },
    };
  }

  function describeUpgrade(progress, id) {
    const { title, costs } = upgradesById[id];
    const level = progress[id];
    const cost = costs[level] ?? null;
    const effect = id === "boat"
      ? cost === null ? "10 crates and all three routes" : `${capacityFor(level + 1)} crates and the ${routes[level + 1]} route`
      : cost === null ? "4 orders to choose from" : `${3 + level} orders to choose from`;
    return { id, title, level, max: costs.length, cost, effect, available: cost !== null && progress.shells >= cost };
  }

  function upgrades(progress) {
    return ["boat", "dock"].map((id) => describeUpgrade(progress, id));
  }

  function upgrade(progress, id) {
    if (!Object.hasOwn(upgradesById, id)) return { ok: false, message: "Unknown upgrade.", progress };
    const { cost, effect, available } = describeUpgrade(progress, id);
    if (cost === null) return { ok: false, message: "This upgrade is already complete.", progress };
    if (!available) return { ok: false, message: `Earn ${cost - progress.shells} more shells first.`, progress };
    return {
      ok: true,
      message: `Upgrade complete. You now have ${effect}.`,
      progress: { ...progress, shells: progress.shells - cost, [id]: progress[id] + 1 },
    };
  }

  scope.NumberIslandsRules = Object.freeze({
    newProgress, restore, observe, tierFor, contracts, checkLoad, claimContract, upgrades, upgrade,
  });
})(globalThis);
