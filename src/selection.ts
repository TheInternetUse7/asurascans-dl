import type { SChapter } from "./types.js";

const NUMBER_PATTERN = /^\d+(?:\.\d+)?$/;
const RANGE_PATTERN = /^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/;

function compareChapterNumbers(a: SChapter, b: SChapter): number {
  return a.number - b.number;
}

export function selectChapters(chapters: SChapter[], selector: string): SChapter[] {
  const trimmed = selector.trim().toLowerCase();

  if (!trimmed || trimmed === "all") {
    return [...chapters].sort(compareChapterNumbers);
  }

  if (trimmed === "latest") {
    if (chapters.length === 0) {
      return [];
    }

    const latest = [...chapters].sort((a, b) => b.number - a.number)[0];
    return latest ? [latest] : [];
  }

  const selected = new Map<string, SChapter>();

  for (const token of selector.split(",").map((part) => part.trim()).filter(Boolean)) {
    const rangeMatch = RANGE_PATTERN.exec(token);

    if (rangeMatch) {
      const start = Number(rangeMatch[1]);
      const end = Number(rangeMatch[2]);
      const min = Math.min(start, end);
      const max = Math.max(start, end);

      for (const chapter of chapters) {
        if (chapter.number >= min && chapter.number <= max) {
          selected.set(chapter.numberText, chapter);
        }
      }

      continue;
    }

    if (!NUMBER_PATTERN.test(token)) {
      throw new Error(`Invalid chapter selector token: "${token}"`);
    }

    const exact = chapters.find((chapter) => chapter.number === Number(token));
    if (!exact) {
      throw new Error(`Chapter ${token} was not found.`);
    }

    // Key by the rendered chapter number so mixed selectors never duplicate the same chapter.
    selected.set(exact.numberText, exact);
  }

  return [...selected.values()].sort(compareChapterNumbers);
}
