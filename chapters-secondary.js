(() => {
  function signed(value) {
    return value < 0 ? `−${Math.abs(value)}` : String(value);
  }

  function offset(value) {
    if (value === 0) return "";
    return value < 0 ? ` − ${Math.abs(value)}` : ` + ${value}`;
  }

  function point(x, y) {
    return `(${signed(x)}, ${signed(y)})`;
  }

  function ridgePractice(random) {
    const kind = random(0, 2);
    if (kind === 0) {
      const x = random(1, 4);
      const y = random(-4, -1);
      return {
        title: "Fog Marker",
        kind: "coordinate",
        x,
        y,
        prompt: `Place a trail marker at ${point(x, y)}.`,
        hint: "Start at (0, 0). Move horizontally for x, then vertically for y.",
        explain: `Move ${x} right and ${Math.abs(y)} down to reach ${point(x, y)}.`,
      };
    }

    if (kind === 1) {
      const coefficient = random(2, 5);
      const constant = random(2, 8);
      const answer = random(2, 9);
      const rhs = coefficient * answer + constant;
      return {
        title: "Counterweight Test",
        kind: "balance",
        coefficient,
        constant,
        rhs,
        answer,
        prompt: `Set x so the two sides of the lift balance at ${rhs}.`,
        hint: `Subtract ${constant} from both sides before dividing by ${coefficient}.`,
        explain: `${rhs} − ${constant} = ${rhs - constant}, and ${rhs - constant} ÷ ${coefficient} = ${answer}.`,
      };
    }

    const rise = random(7, 19);
    const drop = random(2, 6);
    const depth = random(2, 7);
    const answer = -depth + rise - drop;
    return {
      title: "Winch Test",
      kind: "number",
      answer,
      unit: "m",
      model: `−${depth} + ${rise} − ${drop}`,
      prompt: `The platform starts ${depth} m below sea level, rises ${rise} m, then drops ${drop} m. What is its final height relative to sea level?`,
      hint: "Below sea level is negative. Add the rise and subtract the drop.",
      explain: `−${depth} + ${rise} − ${drop} = ${signed(answer)} m.`,
    };
  }

  function beaconPractice(random) {
    const kind = random(0, 2);
    if (kind === 0) {
      const x = random(-3, 3);
      const y = random(-4, 4);
      const gradient = random(2, 3);
      const intercept = y - gradient * x;
      const formula = `y = ${gradient}x${offset(intercept)}`;
      return {
        title: "Beam Calibration",
        kind: "coordinate",
        x,
        y,
        prompt: `The beam follows ${formula}. Plot the point where x = ${signed(x)}.`,
        hint: "Use the given x in the beam equation to find y before plotting.",
        explain: `Substituting x = ${signed(x)} gives y = ${signed(y)}. The beam passes through ${point(x, y)}.`,
      };
    }

    if (kind === 1) {
      const triples = [[3, 4, 5], [5, 12, 13], [8, 15, 17]];
      const [short, tall, diagonal] = triples[random(0, triples.length - 1)];
      const scale = random(2, 5);
      const base = short * scale;
      const height = tall * scale;
      const answer = diagonal * scale;
      return {
        title: "Brace Workshop",
        kind: "number",
        answer,
        unit: "m",
        model: `c² = ${base}² + ${height}²`,
        prompt: `A brace crosses a rectangular frame ${base} m wide and ${height} m tall. How long is the brace?`,
        hint: "The width and height are the shorter sides of a right-angled triangle. Find its hypotenuse.",
        explain: `The brace is √(${base}² + ${height}²) = ${answer} m.`,
      };
    }

    const left = random(1, 5);
    const right = random(2, 8);
    const answer = `x = −${left} or x = ${right}`;
    const options = [
      answer,
      `x = −${left} or x = ${right + 1}`,
      `x = ${right} only`,
      `x = −${left} only`,
    ];
    for (let index = options.length - 1; index > 0; index--) {
      const swap = random(0, index);
      [options[index], options[swap]] = [options[swap], options[index]];
    }

    return {
      title: "Signal Code",
      kind: "choices",
      answer,
      options,
      prompt: `The backup circuit accepts both roots of (x + ${left})(x − ${right}) = 0. Which pair opens it?`,
      hint: "A product is zero if either factor is zero. Solve each factor separately.",
      explain: `x + ${left} is zero at x = −${left}, and x − ${right} is zero at x = ${right}.`,
    };
  }

  window.NUMBER_ISLANDS_SECONDARY = [
    {
      id: "ridge",
      band: "Sec 1",
      title: "Compass Ridge",
      icon: "🧭",
      theme: "iris",
      story: "Get the lens up the ridge. Guide the lift through the fog and bring the compass to the tower.",
      part: "Guiding compass",
      missions: [
        {
          title: "Raise the Platform",
          kind: "number",
          answer: 5,
          unit: "m",
          model: "−6 + 14 − 3",
          prompt: "The lift starts 6 m below sea level, rises 14 m, then drops 3 m. What is its final height relative to sea level?",
          hint: "Start at −6. Add 14, then subtract 3.",
          explain: "−6 + 14 − 3 = 5, so the lift is 5 m above sea level.",
        },
        {
          title: "Mark the Lookout",
          kind: "coordinate",
          x: -2,
          y: 3,
          prompt: "Put a trail marker at the lookout, (−2, 3).",
          hint: "From (0, 0), the first coordinate tells you how far left or right to go. The second tells you how far down or up.",
          explain: "Move 2 left and 3 up from (0, 0) to reach (−2, 3).",
        },
        {
          title: "Balance the Lift",
          kind: "balance",
          coefficient: 3,
          constant: 4,
          rhs: 19,
          answer: 5,
          prompt: "The lift only moves when both sides have the same value. Adjust x to balance them.",
          hint: "To undo +4, subtract 4 from both sides first.",
          explain: "3x + 4 = 19 gives 3x = 15. Dividing by 3 gives x = 5.",
        },
        {
          title: "Cross the Fog",
          kind: "coordinate",
          x: 1,
          y: -3,
          prompt: "Your ranger is at (−2, 1). Move 3 units right and 4 units down. Mark where the ranger stops.",
          hint: "Moving right adds to x. Moving down subtracts from y.",
          explain: "−2 + 3 = 1 and 1 − 4 = −3. The ranger stops at (1, −3).",
        },
        {
          title: "Set the Compass",
          kind: "balance",
          coefficient: 4,
          constant: 3,
          rhs: -9,
          answer: -3,
          prompt: "Turn the compass dial to an integer x that makes the two readings match. This dial can turn below zero.",
          hint: "Subtract 3 from both sides, then divide by 4. Check the sign.",
          explain: "4x + 3 = −9 gives 4x = −12, so x = −3. The compass points to the tower.",
        },
      ],
      practice: ridgePractice,
    },
    {
      id: "beacon",
      band: "Sec 2–3",
      title: "Beacon Heights",
      icon: "💡",
      theme: "rose",
      story: "The lens is at the tower. Fit the support, align the beam and unlock the circuit to light the lighthouse.",
      part: "Beacon spark",
      missions: [
        {
          title: "Fit the Brace",
          kind: "number",
          answer: 10,
          unit: "m",
          model: "c² = 6² + 8²",
          prompt: "The tower door is 6 m wide and 8 m tall. How long is the brace from one corner to the opposite corner?",
          hint: "The diagonal is the longest side of a right-angled triangle. Take the square root of the sum of the other two squares.",
          explain: "6² + 8² = 100. A length is positive, so the brace is 10 m.",
        },
        {
          title: "Align the Mirror",
          kind: "coordinate",
          x: 2,
          y: 3,
          prompt: "The beam follows y = 2x − 1. Place a mirror on the beam where x = 2.",
          hint: "Find y by substituting 2 for x. Then plot the ordered pair (x, y).",
          explain: "2 × 2 − 1 = 3, so the mirror belongs at (2, 3).",
        },
        {
          title: "Tilt the Beam",
          kind: "number",
          answer: -2,
          model: "Gradient = vertical change ÷ horizontal change",
          prompt: "The beam passes through (−1, 4) and (2, −2). Set the tilt dial to the gradient.",
          hint: "Read both changes in the same direction, from the first point to the second.",
          explain: "The vertical change is −6 and the horizontal change is 3. The gradient is −6 ÷ 3 = −2.",
        },
        {
          title: "Tune the Current",
          kind: "balance",
          coefficient: 7,
          constant: -15,
          rhs: 6,
          answer: 3,
          prompt: "Set x so the lamp receives the target current. Adjust the dial until both readings match.",
          hint: "Add 15 to both sides, then divide by 7.",
          explain: "7x − 15 = 6 gives 7x = 21, so x = 3.",
        },
        {
          title: "Light the Lighthouse",
          kind: "choices",
          answer: "x = −3 or x = 5",
          options: ["x = 3 or x = −5", "x = 5 only", "x = −3 or x = 5", "x = −3 or x = −5"],
          prompt: "The lamp starts when both solutions to (x + 3)(x − 5) = 0 are entered. Choose the two settings.",
          hint: "Either factor can make the product zero. Find which x makes each factor zero.",
          explain: "x + 3 is zero at x = −3. x − 5 is zero at x = 5. The lighthouse shines across the islands!",
        },
      ],
      practice: beaconPractice,
    },
  ];
})();
