import assert from "node:assert/strict";
import test from "node:test";
import { createCombat, HEROES } from "../voyage/combat-rules.mjs";
import { MAX_DUEL_PACKET_BYTES } from "../voyage/duel-link.mjs";

function attack(match, side, slot) {
  assert.equal(match.cast(side, slot), true);
  assert.equal(match.botAnswer(side, true), true);
}

const lastEvent = (match, kind) => match.read().events.findLast((event) => event.kind === kind);

test("seven casters retain shared tiers and have distinctive signatures", () => {
  assert.deepEqual(Object.keys(HEROES), ["gale", "warden", "ember", "tide", "thorn", "echo", "frost"]);
  for (const definition of Object.values(HEROES)) {
    assert.equal(definition.skills.length, 4);
    assert.deepEqual(definition.skills.slice(0, 3).map(({ damage }) => damage), [10, 20, 36]);
    assert.deepEqual(definition.skills.slice(0, 3).map(({ cooldown }) => cooldown), [2.5, 5.5, 10]);
    assert.deepEqual(definition.skills.slice(0, 3).map(({ style }) => style), ["bolt", "wave", "area"]);
  }
  assert.deepEqual(Object.values(HEROES).map(({ skills }) => skills.map(({ effect }) => effect)), [
    ["evade", "haste", "pierce", "dash-haste"],
    ["shield", "cleanse-shield", "shield-heal", "shield-cleanse"],
    ["heal", "burn", "heal-burn", "rekindle"],
    ["wash", "undertow", "riptide", "maelstrom"],
    ["briar", "bark", "bramble", "grove"],
    ["resonance", "refrain", "harmonic", "overtone"],
    ["chill", "shatter", "whiteout", "glacier"],
  ]);
  const duel = createCombat({ signatures: [true, false] });
  assert.deepEqual(duel.read().fighters.map(({ signature }) => signature), [true, false]);
  assert.equal(duel.cast(1, 3), false);
  assert.equal(duel.cast(0, 3), true);
  assert.equal(duel.read(0).pending.slot, 3);
});

test("every grade and tier offers three unique choices and the valid answer launches a shot", () => {
  const answers = {
    k: ["2", "3", "1", "1"],
    p12: ["4", "2", "5", "5"],
    p34: ["6", "3", "2", "2"],
    p56: ["3", "6", "34", "34"],
    s1: ["−1", "2", "−2", "−2"],
    s23: ["12", "2", "3", "3"],
  };
  for (const [route, expected] of Object.entries(answers)) {
    for (const [slot, choice] of expected.entries()) {
      const match = createCombat({ heroes: ["warden", "gale"], signatures: [true, false], route, random: () => 0 });
      assert.equal(match.cast(0, slot), true);
      const pending = match.read(0).pending;
      assert.ok(pending.question.length > 0, `${route} tier ${slot}`);
      assert.equal(new Set(pending.choices).size, 3);
      assert.deepEqual(Object.keys(pending), ["slot", "question", "choices", "seconds"]);
      assert.equal(match.read(1).pending, null);
      assert.equal(match.read().pending, null);
      assert.ok(Object.isFrozen(pending.choices));
      assert.notEqual(pending.choices.indexOf(choice), -1, `${route} tier ${slot}`);
      assert.equal(match.answer(0, pending.choices.indexOf(choice)), true);
      assert.equal(match.read(1).fighters[1].hp, 100);
      assert.equal(match.read().attacks.length, 1);
      match.tick(2.1);
      assert.equal(match.read(1).fighters[1].hp, 100 - HEROES.warden.skills[slot].damage);
    }
  }
});

test("incorrect answers and deadlines cost cooldown without launching any attack", () => {
  const match = createCombat({ route: "p12", random: () => 0 });
  assert.equal(match.cast(0, 0), true);
  assert.equal(match.cast(1, 2), true);
  assert.equal(match.cast(0, 1), false);
  assert.equal(match.read(0).pending.seconds, 9);
  assert.equal(match.read(1).pending.seconds, 16);
  assert.equal(match.answer(0, -1), false);
  assert.equal(match.answer(0, 0), true);
  assert.equal(match.read(0).events.at(-1).kind, "miss");
  assert.deepEqual(match.read().fighters.map(({ hp }) => hp), [100, 100]);
  assert.deepEqual(match.read().fighters[0].cooldowns, [2.5, 0, 0, 0]);
  assert.deepEqual(match.read().attacks, []);
  match.tick(2.49);
  assert.equal(match.cast(0, 0), false);
  match.tick(0.02);
  assert.equal(match.cast(0, 0), true);
  match.tick(16 - match.read().time);
  assert.equal(match.read(1).pending, null);
  assert.equal(match.answer(1, 0), false);
  assert.ok(match.read().events.some(({ kind, side }) => side === 0 && kind === "timeout"));
  assert.equal(match.read().events.at(-1).kind, "timeout");
  assert.equal(match.read().fighters[1].cooldowns[2], 10);
  assert.deepEqual(match.read().fighters.map(({ hp }) => hp), [100, 100]);
  assert.deepEqual(match.read().attacks, []);
});

test("Warden shields immediately and Gale's dash softens one incoming strike", () => {
  const match = createCombat({ heroes: ["warden", "gale"] });
  attack(match, 0, 2);
  assert.equal(match.read().fighters[0].shield, 13);
  assert.equal(match.read().fighters[1].hp, 100);
  match.tick(1.25);
  attack(match, 1, 0);
  assert.equal(lastEvent(match, "dash").side, 1);
  match.tick(1.1);
  assert.equal(match.read().fighters[0].hp, 100);
  assert.equal(match.read().fighters[0].shield, 3);
  attack(match, 0, 1);
  match.tick(1.6);
  assert.equal(match.read().fighters[1].hp, 49);
  assert.equal(lastEvent(match, "evade").amount, 5);
  attack(match, 0, 0);
  match.tick(1.1);
  assert.equal(match.read().fighters[1].hp, 39);
});

test("Whirlstep only shortens Gale's other cooldowns and cannot go past ready", () => {
  const match = createCombat({ heroes: ["gale", "ember"] });
  attack(match, 0, 0);
  attack(match, 0, 2);
  attack(match, 1, 0);
  attack(match, 0, 1);
  const first = match.read();
  assert.deepEqual(first.fighters[0].cooldowns, [0.5, 5.5, 8, 0]);
  assert.deepEqual(first.fighters[1].cooldowns, [2.5, 0, 0, 0]);
  assert.equal(lastEvent(match, "haste").amount, 4);

  const edge = createCombat({ heroes: ["gale", "ember"] });
  attack(edge, 0, 0);
  edge.tick(1.5);
  attack(edge, 0, 1);
  assert.deepEqual(edge.read().fighters[0].cooldowns, [0, 5.5, 0, 0]);
  assert.equal(lastEvent(edge, "haste").amount, 1);
  assert.equal(edge.cast(0, 0), true);
});

test("Skybreak only pierces shields when its ground strike hits", () => {
  const match = createCombat({ heroes: ["gale", "warden"] });
  attack(match, 1, 0);
  attack(match, 1, 1);
  attack(match, 1, 2);
  assert.equal(match.read().fighters[1].shield, 22);
  attack(match, 0, 2);
  assert.equal(match.read().fighters[1].hp, 100);
  match.tick(2);
  assert.equal(match.read().fighters[1].hp, 74);
  assert.equal(match.read().fighters[1].shield, 12);
  const hit = match.read().events.find(({ kind, side }) => kind === "hit" && side === 0);
  assert.equal(hit.effect, "pierce");
  assert.equal(hit.amount, 26);
  assert.equal(hit.absorbed, 10);
  assert.equal(hit.pierced, 12);
  attack(match, 0, 0);
  match.tick(1.1);
  assert.equal(match.read().fighters[1].shield, 2);
  assert.equal(match.read().fighters[1].hp, 74);

  const smallShield = createCombat({ heroes: ["gale", "warden"] });
  attack(smallShield, 1, 0);
  attack(smallShield, 0, 2);
  smallShield.tick(1.25);
  assert.equal(smallShield.read().fighters[1].hp, 64);
  assert.equal(smallShield.read().fighters[1].shield, 4);
});

test("Ivory Bastion clears embers while Sunwall restores health and raises a shield", () => {
  const match = createCombat({ heroes: ["warden", "ember"] });
  attack(match, 1, 1);
  attack(match, 1, 2);
  match.tick(2.5);
  assert.equal(match.read().fighters[0].hp, 39);
  attack(match, 0, 1);
  assert.equal(match.read().fighters[0].shield, 5);
  assert.equal(lastEvent(match, "cleanse").amount, 2);
  match.tick(3);
  assert.equal(match.read().fighters[0].hp, 39);
  assert.equal(match.read().fighters[0].shield, 5);
  assert.equal(match.read().events.filter(({ kind }) => kind === "burn").length, 2);
  attack(match, 0, 2);
  assert.equal(match.read().fighters[0].hp, 45);
  assert.equal(match.read().fighters[0].shield, 18);
  assert.equal(lastEvent(match, "heal").amount, 6);
});

test("Ember's healing is immediate and capped while embers start after an impact", () => {
  const match = createCombat({ heroes: ["ember", "warden"] });
  attack(match, 1, 0);
  match.tick(1.05);
  assert.equal(match.read().fighters[0].hp, 90);
  attack(match, 0, 2);
  assert.equal(match.read().fighters[0].hp, 98);
  assert.equal(match.read().fighters[1].hp, 100);
  match.tick(1.25);
  assert.equal(match.read().fighters[1].hp, 68);
  match.tick(0.9);
  assert.equal(match.read().fighters[1].hp, 68);
  match.tick(0.101);
  assert.equal(match.read().fighters[1].hp, 65);
  match.tick(2);
  assert.equal(match.read().fighters[1].hp, 59);
  assert.equal(match.read().events.filter(({ kind }) => kind === "burn").length, 3);
  attack(match, 0, 0);
  assert.equal(match.read().fighters[0].hp, 100);
});

test("a bolt does not tunnel through a target even in one long simulation step", () => {
  const match = createCombat();
  attack(match, 0, 0);
  const start = match.read().attacks[0];
  assert.equal(start.phase, "windup");
  assert.deepEqual(start.origin, { x: 0, z: 5 });
  assert.deepEqual(start.destination, { x: 0, z: -5 });
  assert.equal(start.directionZ, -1);
  assert.equal(lastEvent(match, "launch").attackId, start.id);
  match.tick(.4);
  const flying = match.read().attacks[0];
  assert.equal(flying.phase, "projectile");
  assert.ok(flying.progress > 0 && flying.z < 5);
  assert.equal(match.read().fighters[1].hp, 100);
  match.tick(4);
  assert.deepEqual(match.read().attacks, []);
  assert.equal(lastEvent(match, "hit").attackId, start.id);
  assert.equal(match.read().fighters[1].hp, 90);
});

test("near the caster, a lateral step evades the narrow bolt but not the wide wave", () => {
  for (const slot of [0, 1]) {
    const match = createCombat();
    assert.equal(match.setPose(0, { x: 0, z: 2 }), true);
    assert.equal(match.setPose(1, { x: 0, z: -.5 }), true);
    match.tick(.1);
    attack(match, 0, slot);
    const shot = match.read().attacks[0];
    assert.equal(match.setPose(1, { x: .72, z: -.5 }), true);
    assert.deepEqual(match.read().attacks[0].destination, shot.destination);
    match.tick(3);
    const outcome = lastEvent(match, slot === 0 ? "dodge" : "hit");
    assert.equal(outcome.attackId, shot.id);
    assert.equal(match.read().fighters[1].hp, slot === 0 ? 100 : 80);
  }
});

test("the swept test also detects a target that crosses the shot between two pose samples", () => {
  const match = createCombat();
  attack(match, 0, 0);
  match.setPose(1, { x: -1, z: -1.45 });
  match.tick(.7);
  assert.equal(match.read().fighters[1].hp, 100);
  match.setPose(1, { x: 1, z: -1.55 });
  match.tick(.06);
  assert.equal(match.read().fighters[1].hp, 90);
});

test("a hard spell marks fixed ground and nearby Ember damage never follows a dodge", () => {
  const match = createCombat({ heroes: ["ember", "warden"] });
  attack(match, 0, 2);
  const mark = match.read().attacks[0];
  assert.equal(mark.phase, "telegraph");
  assert.equal(mark.radius, 2.25);
  match.setPose(1, { x: 2.6, z: -5 });
  match.tick(1.22);
  assert.equal(match.read().fighters[1].hp, 100);
  assert.deepEqual({ x: match.read().attacks[0].x, z: match.read().attacks[0].z }, { x: 0, z: -5 });
  match.tick(4);
  assert.equal(lastEvent(match, "burst").attackId, mark.id);
  assert.equal(lastEvent(match, "dodge").attackId, mark.id);
  assert.equal(lastEvent(match, "burn"), undefined);
  assert.equal(match.read().fighters[1].hp, 100);
});

test("signature geometry and immediate personal benefits are distinct", () => {
  const gale = createCombat({ heroes: ["gale", "ember"], signatures: [true, false] });
  attack(gale, 0, 2);
  attack(gale, 0, 3);
  assert.equal(lastEvent(gale, "dash").slot, 3);
  assert.equal(gale.read().fighters[0].cooldowns[2], 7);
  assert.equal(gale.read().attacks.at(-1).style, "wave");
  assert.equal(gale.read().attacks.at(-1).radius, .98);
  assert.equal(gale.read().fighters[1].hp, 100);

  const warden = createCombat({ heroes: ["warden", "ember"], signatures: [true, false] });
  attack(warden, 0, 3);
  const moon = warden.read().attacks[0];
  assert.equal(moon.radius, 2.8);
  assert.equal(moon.seconds, 1.6);
  assert.equal(warden.read().fighters[0].shield, 16);
  warden.setPose(1, { x: 2.5, z: -5 });
  warden.tick(1.6);
  assert.equal(warden.read().fighters[1].hp, 72);

  const ember = createCombat({ heroes: ["ember", "gale"], signatures: [true, false] });
  attack(ember, 1, 0);
  ember.tick(1.05);
  attack(ember, 0, 3);
  assert.equal(ember.read().fighters[0].hp, 100);
  assert.equal(ember.read().attacks[0].style, "bolt");
  assert.equal(ember.read().attacks[0].radius, .56);
  ember.tick(5);
  assert.equal(ember.read().events.filter(({ kind }) => kind === "burn").length, 4);
});

test("victory closes both prompts, and simultaneous final embers can produce a draw", () => {
  const finished = createCombat();
  assert.equal(finished.cast(1, 2), true);
  attack(finished, 0, 2);
  attack(finished, 0, 1);
  attack(finished, 0, 0);
  finished.tick(10);
  attack(finished, 0, 2);
  finished.tick(1.25);
  assert.equal(finished.read().winner, 0);
  assert.equal(finished.read(1).pending, null);
  assert.deepEqual(finished.read().attacks, []);
  assert.equal(finished.cast(1, 0), false);
  assert.equal(finished.read().events.at(-1).kind, "victory");

  const tied = createCombat({ heroes: ["ember", "ember"] });
  for (let round = 0; round < 3; round++) {
    attack(tied, 0, 1);
    attack(tied, 1, 1);
    tied.tick(5.5);
  }
  assert.deepEqual(tied.read().fighters.map(({ hp }) => hp), [22, 22]);
  attack(tied, 0, 1);
  attack(tied, 1, 1);
  tied.tick(2.5);
  assert.equal(tied.read().winner, "draw");
  assert.deepEqual(tied.read().fighters.map(({ hp }) => hp), [0, 0]);
});

test("many simultaneous casts keep a bounded snapshot inside the wire limit", () => {
  const match = createCombat({ heroes: ["gale", "gale"], signatures: [true, true] });
  let direction = 1;
  for (let round = 0; round < 42; round++) {
    match.setPose(0, { x: -direction * 13.45679, z: 5.171 });
    match.setPose(1, { x: direction * 13.45679, z: -5.181 });
    for (const side of [0, 1]) {
      for (const slot of [0, 2, 3, 1, 0]) {
        if (match.cast(side, slot)) match.botAnswer(side, true);
      }
    }
    const snapshot = match.read(0);
    assert.ok(snapshot.attacks.length <= 12);
    assert.ok(snapshot.events.length <= 32);
    assert.ok(Buffer.byteLength(JSON.stringify({ type: "state", route: "p12", state: snapshot }), "utf8") <= MAX_DUEL_PACKET_BYTES);
    direction *= -1;
    match.setPose(0, { x: -direction * 13.45679, z: 5.171 });
    match.setPose(1, { x: direction * 13.45679, z: -5.181 });
    match.tick(2.2);
  }
  assert.equal(match.read().events.length, 32);
});

test("snapshots cannot mutate the duel and invalid clock or pose updates are rejected", () => {
  const match = createCombat({ route: { toString: null }, heroes: [false, "invalid"], random: () => 3 });
  const initial = match.read();
  assert.throws(() => { initial.fighters[0].hp = -100; }, TypeError);
  assert.deepEqual(initial.fighters.map(({ hero }) => hero), ["gale", "ember"]);
  assert.equal(match.cast("0", 0), false);
  assert.equal(match.cast(0, 3), false);
  assert.equal(match.cast(0, 0), true);
  const timer = match.read(0).pending.seconds;
  match.tick(0);
  match.tick(-1);
  match.tick(Symbol("invalid"));
  assert.equal(match.read(0).pending.seconds, timer);
  assert.equal(match.setPose(0, { x: NaN, z: 0 }), false);
  assert.equal(match.setPose(1, { x: 1000, z: 0 }), false);
  assert.equal(match.botAnswer(0, "true"), false);
  assert.equal(match.answer(2, 1), false);
});

test("duos track each fighter, keep prompts private and target the closest living enemy by default", () => {
  const combat = createCombat({ heroes: ["gale", "warden", "ember", "gale"] });
  assert.deepEqual(combat.read().fighters.map(({ team, hp }) => [team, hp]), [[0, 100], [0, 100], [1, 100], [1, 100]]);
  assert.equal(combat.cast(0, 0, 1), false);
  assert.equal(combat.cast(4, 0, 2), false);
  assert.equal(combat.cast(0, 0, 2), true);
  assert.equal(combat.read(0).pending.target, 2);
  for (const side of [1, 2, 3]) assert.equal(combat.read(side).pending, null);
  assert.equal(combat.botAnswer(0, true), true);
  assert.equal(combat.read().attacks[0].target, 2);
  assert.equal(combat.cast(1, 0), true);
  assert.equal(combat.read(1).pending.target, 2);
  assert.equal(combat.cast(3, 0), true);
  assert.equal(combat.read(3).pending.target, 0);
});

test("nearby teammates receive shielding, healing and haste, and concentrated shots earn a combo", () => {
  const combat = createCombat({ heroes: ["warden", "ember", "gale", "gale"] });
  attack(combat, 3, 0);
  combat.tick(2);
  assert.equal(combat.read().fighters[0].hp, 90);
  attack(combat, 0, 0);
  assert.deepEqual(combat.read().fighters.map(({ shield }) => shield), [4, 2, 0, 0]);
  assert.equal(combat.cast(1, 0, 3), true);
  combat.botAnswer(1, true);
  assert.equal(combat.read().fighters[0].hp, 92);
  assert.equal(lastEvent(combat, "heal").target, 0);
  combat.setPose(1, { x: 5, z: 8 });
  attack(combat, 0, 1);
  assert.equal(combat.read().fighters[1].shield, 2);
  combat.tick(2);
  assert.ok(combat.read().events.some(({ kind, side, ally, target, amount }) =>
    kind === "combo" && side === 1 && ally === 0 && target === 3 && amount === 4));

  const winds = createCombat({ heroes: ["gale", "gale", "warden", "ember"] });
  attack(winds, 1, 1);
  attack(winds, 0, 1);
  assert.equal(winds.read().fighters[1].cooldowns[1], 4.5);
  assert.deepEqual([lastEvent(winds, "haste").side, lastEvent(winds, "haste").target], [0, 1]);
});

test("team projectiles and ground spells can hit exposed enemies but cannot damage allies", () => {
  const combat = createCombat({ heroes: ["gale", "gale", "gale", "gale"] });
  combat.setPose(0, { x: 0, z: 4 });
  combat.setPose(1, { x: 0, z: 2 });
  combat.setPose(2, { x: 0, z: -4 });
  combat.setPose(3, { x: 0, z: -3.3 });
  combat.tick(.1);
  assert.equal(combat.cast(0, 0, 2), true);
  combat.botAnswer(0, true);
  combat.tick(2);
  assert.deepEqual(combat.read().fighters.map(({ hp }) => hp), [100, 100, 100, 90]);
  assert.equal(lastEvent(combat, "hit").target, 3);
  combat.setPose(1, { x: 0, z: -3.7 });
  attack(combat, 0, 2);
  combat.tick(2);
  assert.deepEqual(combat.read().fighters.map(({ hp }) => hp), [100, 100, 64, 54]);
});

test("a duo stays in play with one teammate down, then settles on a second knockout", () => {
  const combat = createCombat({ heroes: ["gale", "gale", "gale", "gale"] });
  assert.equal(combat.cast(2, 2), true);
  for (const slot of [0, 1, 2]) {
    assert.equal(combat.cast(0, slot, 2), true);
    combat.botAnswer(0, true);
  }
  combat.tick(10);
  assert.equal(combat.cast(0, 2, 2), true);
  combat.botAnswer(0, true);
  combat.tick(2);
  assert.equal(combat.read().fighters[2].hp, 0);
  assert.equal(combat.read(2).pending, null);
  assert.equal(combat.read().winner, null);
  assert.equal(combat.cast(2, 0), false);
  assert.equal(combat.setPose(2, { x: 0, z: 0 }), false);
  assert.equal(combat.cast(0, 0, 2), false);
  for (const slot of [0, 1, 2]) {
    if (slot === 2) combat.tick(8);
    attack(combat, 0, slot);
  }
  assert.equal(combat.read().attacks.at(-1).target, 3);
  combat.tick(10);
  attack(combat, 0, 2);
  combat.tick(2);
  assert.equal(combat.read().winner, 0);
  assert.deepEqual(combat.read().fighters.map(({ hp }) => hp), [100, 100, 0, 0]);
});

test("four active fighters cannot overflow the ranked snapshot or its projectile capacity", () => {
  const combat = createCombat({ heroes: ["gale", "warden", "ember", "gale"], signatures: [true, true, true, true] });
  for (const side of [0, 1, 2, 3]) {
    for (const slot of [0, 1, 2]) attack(combat, side, slot);
  }
  assert.equal(combat.read().attacks.length, 12);
  assert.equal(combat.cast(3, 3), false);
  const snapshot = combat.read(3);
  assert.ok(snapshot.events.length <= 32);
  assert.ok(Buffer.byteLength(JSON.stringify({ type: "state", route: "s23", state: snapshot })) <= MAX_DUEL_PACKET_BYTES);
});

test("Tide erodes wards permanently and Undertow only slows the longest active recharge", () => {
  const wash = createCombat({ heroes: ["tide", "warden"] });
  attack(wash, 1, 2);
  attack(wash, 0, 0);
  wash.tick(1.1);
  assert.equal(lastEvent(wash, "strip").amount, 3);
  assert.equal(wash.read().fighters[1].shield, 0);
  assert.equal(wash.read().fighters[1].hp, 100);

  const undertow = createCombat({ heroes: ["tide", "warden"] });
  for (const slot of [1, 2]) {
    assert.equal(undertow.cast(1, slot), true);
    undertow.botAnswer(1, false);
  }
  attack(undertow, 0, 1);
  undertow.tick(2);
  assert.deepEqual(undertow.read().fighters[1].cooldowns, [0, 3.5, 9.25, 0]);
  assert.equal(lastEvent(undertow, "delay").amount, 1.25);
});

test("Riptide strips ward and slows one cooldown, while Maelstrom delays every active cooldown", () => {
  for (const [slot, strip, cooldowns] of [
    [2, 6, [.5, 0, 9.75, 0]],
    [3, 8, [1.5, 0, 9, 0]],
  ]) {
    const combat = createCombat({ heroes: ["tide", "warden"], signatures: [true, false] });
    attack(combat, 1, 0);
    attack(combat, 1, 2);
    attack(combat, 0, slot);
    combat.tick(2);
    assert.equal(lastEvent(combat, "strip").amount, strip);
    assert.deepEqual(combat.read().fighters[1].cooldowns, cooldowns);
  }
});

test("Thorn's briars add damage once, with a distinct allied trigger in 2v2", () => {
  const solo = createCombat({ heroes: ["thorn", "gale"] });
  attack(solo, 0, 0);
  solo.tick(1.1);
  assert.ok(solo.read().fighters[1].briarSeconds > 0);
  attack(solo, 0, 1);
  assert.equal(solo.read().fighters[0].shield, 6);
  solo.tick(2);
  assert.equal(solo.read().fighters[1].hp, 65);
  assert.equal(lastEvent(solo, "briar-hit").amount, 5);
  assert.equal(solo.read().fighters[1].briarSeconds, undefined);

  const team = createCombat({ heroes: ["thorn", "gale", "gale", "gale"] });
  const strike = (side, slot) => {
    assert.equal(team.cast(side, slot, 3), true);
    team.botAnswer(side, true);
  };
  strike(0, 0);
  team.tick(1.1);
  strike(0, 1);
  assert.equal(team.read().fighters[1].shield, 3);
  team.tick(2);
  assert.ok(team.read().fighters[3].briarSeconds > 0);
  strike(1, 0);
  team.tick(1.2);
  assert.equal(team.read().fighters[3].briarSeconds, undefined);
  assert.deepEqual([lastEvent(team, "briar-hit").side, lastEvent(team, "briar-hit").amount], [1, 5]);
  assert.equal(team.read().fighters[2].hp, 100);
});

test("Bramble applies the stronger mark, while Grove also protects nearby allies", () => {
  const combat = createCombat({ heroes: ["thorn", "gale", "gale", "gale"], signatures: [true] });
  attack(combat, 0, 2);
  combat.tick(1.3);
  assert.equal(lastEvent(combat, "briar").amount, 8);
  attack(combat, 0, 3);
  assert.deepEqual(combat.read().fighters.map(({ shield }) => shield), [9, 5, 0, 0]);
  combat.tick(1.6);
  assert.ok(combat.read().fighters[3].briarSeconds > 5);
  assert.equal(lastEvent(combat, "briar").slot, 3);
});

test("Echo's fast bolts reach farther and bypass ward without stripping the bypassed points", () => {
  const ranged = createCombat({ heroes: ["echo", "warden"] });
  ranged.setPose(0, { x: 0, z: 8 });
  ranged.setPose(1, { x: 0, z: -8 });
  attack(ranged, 1, 2);
  attack(ranged, 0, 0);
  ranged.tick(1.22);
  assert.equal(ranged.read().fighters[1].hp, 97);
  assert.equal(ranged.read().fighters[1].shield, 6);
  assert.equal(lastEvent(ranged, "hit").pierced, 3);

  const harmonic = createCombat({ heroes: ["echo", "warden"] });
  attack(harmonic, 1, 2);
  attack(harmonic, 0, 2);
  harmonic.tick(1.3);
  assert.equal(harmonic.read().fighters[1].shield, 9);
  const struck = harmonic.read().events.find(({ kind, side }) => kind === "hit" && side === 0);
  assert.equal(struck.effect, "harmonic");
  assert.equal(struck.pierced, 9);

  const overtone = createCombat({ heroes: ["echo", "warden"], signatures: [true] });
  attack(overtone, 1, 2);
  attack(overtone, 0, 3);
  overtone.tick(1.15);
  assert.equal(overtone.read().fighters[1].shield, 5);
  assert.equal(lastEvent(overtone, "hit").pierced, 5);
});

test("Echo's Refrain and Overtone shorten nearby teammate cooldowns more than its own", () => {
  const combat = createCombat({ heroes: ["echo", "gale", "warden", "gale"], signatures: [true] });
  attack(combat, 0, 2);
  attack(combat, 1, 2);
  attack(combat, 0, 1);
  assert.equal(combat.read().fighters[0].cooldowns[2], 9);
  assert.equal(combat.read().fighters[1].cooldowns[2], 8);
  attack(combat, 0, 3);
  assert.equal(combat.read().fighters[0].cooldowns[2], 7.5);
  assert.equal(combat.read().fighters[1].cooldowns[2], 5.5);
  assert.equal(combat.read().fighters[0].cooldowns[3], 11.5);
});

test("Frost's chill modifies the next recharge once and Shatter consumes chill for bonus damage", () => {
  const combat = createCombat({ heroes: ["frost", "warden"] });
  attack(combat, 0, 0);
  combat.tick(1.1);
  assert.ok(combat.read().fighters[1].chillSeconds > 0);
  attack(combat, 1, 2);
  assert.equal(combat.read().fighters[1].cooldowns[2], 11.25);
  attack(combat, 1, 0);
  assert.equal(combat.read().fighters[1].cooldowns[0], 2.5);
  attack(combat, 0, 1);
  combat.tick(2);
  assert.equal(combat.read().fighters[1].chillSeconds, undefined);
  assert.equal(lastEvent(combat, "strip").amount, 9);
  assert.equal(lastEvent(combat, "shatter").amount, 5);
  assert.equal(combat.read().fighters[1].hp, 79);
});

test("Whiteout applies timed chill and Glacier shatters it before applying new chill", () => {
  const combat = createCombat({ heroes: ["frost", "warden"], signatures: [true] });
  attack(combat, 0, 2);
  combat.tick(1.25);
  assert.equal(combat.read().fighters[1].chillSeconds, 5);
  attack(combat, 1, 2);
  attack(combat, 1, 0);
  assert.equal(combat.read().fighters[1].cooldowns[2], 11.5);
  attack(combat, 0, 3);
  combat.tick(1.6);
  assert.equal(lastEvent(combat, "strip").amount, 12);
  assert.equal(lastEvent(combat, "shatter").amount, 7);
  assert.ok(combat.read().fighters[1].chillSeconds > 3.8);
  assert.equal(combat.read().fighters[1].hp, 38);
  combat.tick(4);
  assert.equal(combat.read().fighters[1].chillSeconds, undefined);
});

test("status effects require impact and stacked cooldown delays stay within the wire limit", () => {
  const dodge = createCombat({ heroes: ["frost", "thorn"] });
  assert.equal(dodge.cast(0, 0), true);
  dodge.botAnswer(0, false);
  attack(dodge, 0, 2);
  dodge.setPose(1, { x: 4, z: -5 });
  dodge.tick(2);
  assert.ok(lastEvent(dodge, "dodge"));
  assert.equal(dodge.read().fighters[1].chillSeconds, undefined);

  const team = createCombat({ heroes: ["tide", "tide", "warden", "gale"], signatures: [false, false, true] });
  attack(team, 2, 3);
  for (const side of [0, 1]) {
    assert.equal(team.cast(side, 2, 2), true);
    team.botAnswer(side, true);
  }
  team.tick(1.25);
  assert.equal(team.read().fighters[2].cooldowns[3], 14);
  assert.equal(team.read().fighters[2].cooldowns[1], 0);
});
