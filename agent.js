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

  function practiceMission(chapter, random, practiceNeeds = {}) {
    const preferred = Object.entries(practiceNeeds)
      .filter(([, count]) => Number.isSafeInteger(count) && count > 0)
      .sort(([, left], [, right]) => right - left)[0]?.[0];
    const first = chapter.practice(random);
    if (!preferred || first.kind === preferred) return first;
    for (let attempt = 0; attempt < 6; attempt++) {
      const candidate = chapter.practice(random);
      if (candidate.kind === preferred) return candidate;
    }
    return first;
  }

  scope.NumberIslandsAgent = Object.freeze({ respond, suggestChapter, practiceMission });
})(globalThis);
