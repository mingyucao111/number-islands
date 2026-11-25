(function installGuide(scope) {
  "use strict";

  const tools = Object.freeze({
    acknowledge() {
      return "Try one small change, then check again.";
    },
    showHint({ mission }) {
      return mission.hint;
    },
    explainResult({ mission }) {
      return mission.explain;
    },
    proposePractice({ chapter }) {
      return chapter.id;
    },
  });

  function respond(event, context) {
    let tool;
    switch (event) {
      case "wrong":
        tool = context.attempts >= 2 ? "showHint" : "acknowledge";
        break;
      case "hint":
        tool = "showHint";
        break;
      case "solved":
        tool = context.solved === true ? "explainResult" : "acknowledge";
        break;
      case "practice":
        tool = "proposePractice";
        break;
      default:
        throw new TypeError("Unknown guide event.");
    }
    return Object.freeze({ tool, text: tools[tool](context) });
  }

  function suggestChapter(chapters, progress) {
    if (!chapters.length) return null;
    const isOpen = (chapter) => !progress.passes?.[chapter.id]
      && (progress.completed[chapter.id] ?? 0) < chapter.missions.length;
    if (progress.last) {
      const previous = chapters.find((chapter) => chapter.id === progress.last);
      if (previous && isOpen(previous)) return previous.id;
    }
    const unfinished = chapters.find((chapter) => {
      const count = progress.completed[chapter.id] ?? 0;
      return count > 0 && isOpen(chapter);
    });
    if (unfinished) return unfinished.id;
    return chapters.find(isOpen)?.id
      ?? chapters.at(-1).id;
  }

  function challengeSize(mission) {
    if (mission.kind === "build") return mission.target + (mission.clue === undefined ? 2 : 0);
    if (mission.kind === "pattern") return new Set(mission.sequence).size + mission.sequence.length;
    if (mission.kind === "grid") return mission.target;
    if (mission.kind === "fraction") return mission.denominator + mission.splitInto + (mission.splitInto % mission.denominator ? 5 : 0);
    if (mission.kind === "balance") return Math.abs(mission.coefficient) + Math.abs(mission.constant) + (mission.answer < 0 ? 5 : 0);
    if (mission.kind === "coordinate") return Math.abs(mission.x) + Math.abs(mission.y) + (mission.prompt.includes("=") ? 4 : 0);
    const operands = (mission.model ?? mission.prompt).match(/\d+/g) ?? [];
    return operands.reduce((total, number) => total + Math.log2(1 + Number(number)), 0);
  }

  function practiceMission(chapter, random, practiceNeeds = {}, tier = "core") {
    const preferred = Object.entries(practiceNeeds)
      .filter(([, count]) => Number.isSafeInteger(count) && count > 0)
      .sort(([, left], [, right]) => right - left)[0]?.[0];
    const first = chapter.practice(random);
    if (tier === "core" && (!preferred || first.kind === preferred)) return first;
    const candidates = [first];
    for (let attempt = 0; attempt < 6; attempt++) {
      const candidate = chapter.practice(random);
      if (tier === "core" && candidate.kind === preferred) return candidate;
      candidates.push(candidate);
    }
    if (tier === "core") return first;
    const focused = candidates.filter((mission) => mission.kind === (preferred ?? first.kind));
    if (!focused.length) return first;
    const direction = tier === "stretch" ? 1 : -1;
    return focused.reduce((best, mission) => direction * (challengeSize(mission) - challengeSize(best)) > 0 ? mission : best);
  }

  scope.NumberIslandsAgent = Object.freeze({ respond, suggestChapter, practiceMission });
})(globalThis);
