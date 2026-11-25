(() => {
  "use strict";

  function matchCargo(numerator, denominator, splitInto, title = "Balance the ferries") {
    const matchingSlots = numerator * splitInto / denominator;
    return {
      kind: "fraction",
      title,
      prompt: "Load Ferry B so the two equal-length ferries carry the same share.",
      hint: "Line up the left ends. Find the Ferry B slot where the cargo reaches as far as it does on Ferry A.",
      explain: `${numerator}/${denominator} = ${matchingSlots}/${splitInto}. The filled lengths match because both ferries represent the same-sized whole.`,
      numerator,
      denominator,
      splitInto,
    };
  }

  function tileLanding(height, width) {
    return {
      kind: "grid",
      title: "Build the landing",
      prompt: `Starting in the top-left corner, lay a rectangle of tiles ${height} rows deep and ${width} columns wide.`,
      hint: "Give every row the same number of tiles. Start again at the left edge for each new row.",
      explain: `${height} equal rows × ${width} tiles per row = ${height * width} square tiles.`,
      rows: 6,
      cols: 6,
      target: height * width,
      rectangle: [height, width],
    };
  }

  function trimRope(metres, centimetresUsed) {
    const total = metres * 100;
    return {
      kind: "number",
      title: "Trim the mooring rope",
      prompt: `A rope is ${metres} m long. Cut off ${centimetresUsed} cm to tie up the ferry. How many centimetres of rope are left?`,
      hint: "Change the whole rope into centimetres first. A metre is 100 centimetres.",
      explain: `${metres} m = ${total} cm, and ${total} − ${centimetresUsed} = ${total - centimetresUsed} cm.`,
      model: `${metres} m − ${centimetresUsed} cm = ? cm`,
      answer: total - centimetresUsed,
      unit: "cm",
    };
  }

  function mixCrystals(blueParts, clearParts, sets) {
    const total = (blueParts + clearParts) * sets;
    return {
      kind: "number",
      title: "Mix the lens crystals",
      prompt: `The blue-to-clear ratio is ${blueParts} : ${clearParts}. With ${total} crystals in the mix, how many should be clear?`,
      hint: "Add the two parts of the ratio to find how many equal groups there are. Then find the size of one group.",
      explain: `${total} ÷ (${blueParts} + ${clearParts}) = ${sets} crystals per part. The clear crystals take ${clearParts} parts, so ${clearParts} × ${sets} = ${clearParts * sets}.`,
      model: `Blue : clear = ${blueParts} : ${clearParts}`,
      answer: clearParts * sets,
      unit: "crystals",
    };
  }

  function polishCrystals(total, percent) {
    return {
      kind: "build",
      title: "Polish the crystals",
      prompt: `The lens needs ${percent}% of a box of ${total} crystals. Set that many crystals aside for polishing.`,
      hint: percent === 10
        ? "Ten per cent is one tenth. Divide the number of crystals by 10."
        : `Find 10% by dividing the number of crystals by 10. Then use those groups to make ${percent}%.`,
      explain: `10% of ${total} is ${total / 10}. So ${percent}% is ${percent / 10} × ${total / 10} = ${total * percent / 100} crystals.`,
      max: 20,
      target: total * percent / 100,
      token: "💎",
      unit: "crystals",
    };
  }

  function packCase(length, width, height) {
    return {
      kind: "number",
      title: "Pack the lens case",
      prompt: `The case is ${length} cm long, ${width} cm wide and ${height} cm high inside. How many 1 cm cubes fit without gaps?`,
      hint: "Work out the number of cubes in one flat layer. Then count how many layers fit.",
      explain: `One layer holds ${length} × ${width} = ${length * width} cubes. With ${height} layers, the case holds ${length * width * height} cubes.`,
      model: `${length} cm × ${width} cm × ${height} cm`,
      answer: length * width * height,
      unit: "cubes",
    };
  }

  const ferryHarbour = {
    id: "harbour",
    band: "P3–P4",
    title: "Ferry Harbour",
    icon: "⛴️",
    theme: "water",
    story: "The lens parts are waiting across the harbour. Balance the ferries and repair the landing so the parts can reach shore.",
    part: "Turning gear",
    missions: [
      matchCargo(1, 2, 4, "Load the first ferry"),
      matchCargo(4, 6, 9, "Split the cargo again"),
      tileLanding(3, 4),
      trimRope(6, 245),
      {
        kind: "choices",
        title: "Fit the harbour gate",
        prompt: "Use exactly 18 square tiles to make a rectangle. Its outside edge must be 18 tile sides long. Which rectangle fits?",
        hint: "Multiply the rows and columns for the number of tiles. Count two long sides and two short sides for the outside edge.",
        explain: "3 × 6 = 18 tiles. The outer edge is 3 + 6 + 3 + 6 = 18 tile sides.",
        options: ["2 rows × 9 columns", "3 rows × 6 columns", "4 rows × 5 columns", "3 rows × 5 columns"],
        answer: "3 rows × 6 columns",
      },
    ],
    practice(random) {
      switch (random(0, 2)) {
        case 0: {
          const simplifiedDenominator = random(2, 4);
          const simplifiedNumerator = random(1, simplifiedDenominator - 1);
          const scale = random(2, 3);
          return matchCargo(
            simplifiedNumerator * scale,
            simplifiedDenominator * scale,
            simplifiedDenominator * (5 - scale),
          );
        }
        case 1:
          return tileLanding(random(2, 5), random(2, 6));
        default:
          return trimRope(random(3, 9), random(101, 299));
      }
    },
  };

  const coralWorkshop = {
    id: "reef",
    band: "P5–P6",
    title: "Coral Workshop",
    icon: "🪸",
    theme: "coral",
    story: "Take the gear to the workshop. Mix the crystals, polish the glass and pack a new lens for the lighthouse.",
    part: "Signal lens",
    missions: [
      mixCrystals(2, 3, 5),
      polishCrystals(40, 30),
      packCase(5, 4, 3),
      {
        kind: "choices",
        title: "Set the light interval",
        prompt: "The fallback light flashes 12 times in 3 minutes at a steady rate. Which setting gives the same rate?",
        hint: "Find how many flashes there are in 1 minute. Check each setting against that rate.",
        explain: "12 ÷ 3 = 4 flashes per minute. In 5 minutes at the same rate, there are 4 × 5 = 20 flashes.",
        options: ["16 flashes in 5 min", "20 flashes in 4 min", "20 flashes in 5 min", "24 flashes in 5 min"],
        answer: "20 flashes in 5 min",
      },
      {
        kind: "number",
        title: "Finish the signal lens",
        prompt: "You need 2 litres of polishing liquid. Cleaner makes up 15% of the mix. How many millilitres of cleaner go in?",
        hint: "Use 1 litre = 1,000 ml. Then work out 10% and 5% of the full amount.",
        explain: "2 litres = 2,000 ml. 10% is 200 ml and 5% is 100 ml. Together they make 300 ml.",
        model: "15% of 2 litres = ? ml",
        answer: 300,
        unit: "ml",
      },
    ],
    practice(random) {
      switch (random(0, 2)) {
        case 0:
          return mixCrystals(random(1, 3), random(2, 5), random(2, 9));
        case 1:
          return polishCrystals(random(2, 5) * 10, random(1, 4) * 10);
        default:
          return packCase(random(3, 8), random(2, 6), random(2, 7));
      }
    },
  };

  window.NUMBER_ISLANDS_PRIMARY = [ferryHarbour, coralWorkshop];
})();
