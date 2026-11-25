(() => {
  "use strict";

  const shells = "🐚";
  const lantern = "🏮";
  const shapes = ["🔵", "🟨", "🔺", "🟩"];

  function beachPractice(random) {
    const type = random(0, 2);
    if (type === 2) {
      const start = random(0, shapes.length - 1);
      const first = shapes[start];
      const second = shapes[(start + random(1, shapes.length - 1)) % shapes.length];
      const repeat = random(1, 2);
      const group = repeat === 1 ? [first, second] : [first, first, second];
      return {
        title: "A new trail",
        kind: "pattern",
        prompt: "What comes next?",
        sequence: [...group, ...group],
        options: shapes,
        answer: first,
        hint: "Look for the small group that keeps repeating.",
        explain: `The group ${group.join(" ")} starts again with ${first}.`,
      };
    }

    const clue = random(2, 7);
    const target = clue + type;
    return {
      title: "A fresh shell hunt",
      kind: "build",
      prompt: type === 0 ? "Count the shells. Make a set just like it." : "Count the shells. Make a set with one more.",
      clue,
      target,
      max: 10,
      token: shells,
      unit: "shells",
      hint: type === 0 ? "Point to each shell as you count." : "Make the same set first. Add one more shell.",
      explain: type === 0 ? `Both sets have ${target} shells.` : `One more than ${clue} is ${target}.`,
    };
  }

  function marketPractice(random) {
    const type = random(0, 2);
    if (type === 2) {
      const rowCount = random(2, 4);
      const lanternsPerRow = random(2, 5);
      const target = rowCount * lanternsPerRow;
      return {
        title: "A new lantern wall",
        kind: "grid",
        prompt: `Start at the top left. Fill ${rowCount} rows with ${lanternsPerRow} lanterns in each row.`,
        rows: 5,
        cols: 6,
        rectangle: [rowCount, lanternsPerRow],
        target,
        hint: `Make each row ${lanternsPerRow} tiles long.`,
        explain: `${rowCount} equal groups of ${lanternsPerRow} make ${target} lanterns.`,
      };
    }

    const first = random(6, 12);
    const second = random(2, 7);
    const leaving = type === 1;
    const starting = leaving ? first + second : first;
    const target = leaving ? first : first + second;
    return {
      title: "A new market order",
      kind: "build",
      prompt: leaving
        ? `There are ${starting} lanterns. Take away ${second}. Pack how many are left.`
        : `There are ${starting} lanterns. Add ${second} more. Pack how many there are now.`,
      target,
      max: 20,
      token: lantern,
      unit: "lanterns",
      hint: leaving ? `Start at ${starting} and count back ${second}.` : `Start at ${starting} and count on ${second}.`,
      explain: `${starting} ${leaving ? "−" : "+"} ${second} = ${target}.`,
    };
  }

  window.NUMBER_ISLANDS_EARLY = [
    {
      id: "beach",
      band: "K1–K2",
      title: "Shell Beach",
      icon: "🐚",
      theme: "mint",
      story: "The lighthouse has gone dark. Follow the beach trail and find its first missing part.",
      part: "Shell Lens",
      missions: [
        {
          title: "Shell Hunt",
          kind: "build",
          prompt: "Count the shells. Make a set just like it.",
          clue: 3,
          target: 3,
          max: 6,
          token: shells,
          unit: "shells",
          hint: "Point to each shell as you count.",
          explain: "One, two, three. Both sets have 3 shells.",
        },
        {
          title: "Stars in the Pool",
          kind: "build",
          prompt: "Put 5 sea stars in the pool.",
          target: 5,
          max: 8,
          token: "⭐",
          unit: "sea stars",
          hint: "Add one sea star at a time. Stop at five.",
          explain: "The pool is ready with 5 sea stars.",
        },
        {
          title: "One Extra Shell",
          kind: "build",
          prompt: "Count the shells. Make a set with one more.",
          clue: 4,
          target: 5,
          max: 8,
          token: shells,
          unit: "shells",
          hint: "Match the first set. Then add one more shell.",
          explain: "One more than 4 is 5.",
        },
        {
          title: "Follow the Flags",
          kind: "pattern",
          prompt: "What comes next?",
          sequence: ["🔵", "🟨", "🔵", "🟨"],
          options: ["🟨", "🔵", "🔺"],
          answer: "🔵",
          hint: "Say it with me. Circle, square, circle, square…",
          explain: "Circle and square keep taking turns.",
        },
        {
          title: "The Lens Gate",
          kind: "pattern",
          prompt: "Pick the next shape to open the gate.",
          sequence: ["🔺", "🔺", "🔵", "🔺", "🔺", "🔵", "🔺", "🔺"],
          options: ["🔵", "🔺", "🟨"],
          answer: "🔵",
          hint: "Find the group that repeats. Triangle, triangle, circle.",
          explain: "Two triangles are always followed by a circle.",
        },
      ],
      practice: beachPractice,
    },
    {
      id: "market",
      band: "P1–P2",
      title: "Lantern Market",
      icon: "🏮",
      theme: "sun",
      story: "The lens is safe. Help the market prepare for its evening parade and earn a frame to hold the lens.",
      part: "Lantern Frame",
      missions: [
        {
          title: "Bundles of Ten",
          kind: "choices",
          prompt: "One bundle holds 10 lanterns. How many lanterns are in 2 bundles and 4 loose lanterns?",
          options: ["42", "20", "24", "26"],
          answer: "24",
          hint: "Count the bundles in tens. Then add the loose lanterns.",
          explain: "2 tens and 4 ones make 20 + 4 = 24.",
        },
        {
          title: "Stock the Stall",
          kind: "build",
          prompt: "The stall has 7 lanterns. A maker brings 5 more. Pack all the lanterns.",
          target: 12,
          max: 16,
          token: lantern,
          unit: "lanterns",
          hint: "Start at 7 and count on 5.",
          explain: "7 + 5 = 12 lanterns in all.",
        },
        {
          title: "Parade Pickup",
          kind: "build",
          prompt: "There are 16 lanterns. The parade takes 7. Pack the lanterns that are left.",
          target: 9,
          max: 17,
          token: lantern,
          unit: "lanterns",
          hint: "Start at 16 and count back 7.",
          explain: "16 − 7 = 9 lanterns left.",
        },
        {
          title: "Light the Wall",
          kind: "grid",
          prompt: "Start at the top left. Fill 3 rows with 4 lanterns in each row.",
          rows: 5,
          cols: 5,
          rectangle: [3, 4],
          target: 12,
          hint: "Make each of the first 3 rows 4 tiles long.",
          explain: "Three equal groups of 4 make 4 + 4 + 4 = 12 lanterns.",
        },
        {
          title: "Share the Lights",
          kind: "choices",
          prompt: "Share 15 lanterns equally among 5 stalls. How many lanterns does each stall get?",
          options: ["2", "3", "4", "5"],
          answer: "3",
          hint: "Give each stall one lantern at a time until all 15 are used.",
          explain: "5 stalls with 3 lanterns each makes 15 lanterns.",
        },
      ],
      practice: marketPractice,
    },
  ];
})();
