/**
 * The Lesson Pack: what the learner takes away from the call.
 *
 * Every line here is assembled by code from notebook entries. Exercises are
 * built from templates over the learner's own corrected sentences, so a gap-fill
 * always has exactly one defensible answer - the word the tutor actually used.
 * No generation means no invented vocabulary and no exercise whose answer key
 * disagrees with the lesson.
 */

import { ERROR_TYPE_LABELS, type ErrorType, type Notebook } from "./types";

export interface Flashcard {
  front: string;
  back: string;
  /** The term in the learner's own language, when one could be produced. */
  translation?: string;
  tentative: boolean;
}

export interface Exercise {
  prompt: string;
  answer: string;
  hint: string;
}

export interface ProgressComparison {
  previousLessonId: string;
  previousMistakeCount: number;
  currentMistakeCount: number;
  resolvedErrorTypes: string[];
  persistentErrorTypes: string[];
}

export interface LessonPack {
  lessonId: string;
  learnerName: string;
  tutorName: string;
  summary: string;
  correctedSentences: Array<{
    said: string;
    corrected: string;
    errorType: string;
    tentative: boolean;
  }>;
  flashcards: Flashcard[];
  exercises: Exercise[];
  checklist: string[];
  nextTopics: string[];
  progress?: ProgressComparison;
}

function countByType(notebook: Notebook): Map<ErrorType, number> {
  const counts = new Map<ErrorType, number>();
  for (const m of notebook.mistakes) {
    counts.set(m.errorType, (counts.get(m.errorType) ?? 0) + 1);
  }
  return counts;
}

function summarise(notebook: Notebook): string {
  const counts = countByType(notebook);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  const parts = [
    `${notebook.learnerName} spoke with ${notebook.tutorName} across ${notebook.turns.length} turns.`,
  ];
  if (notebook.mistakes.length > 0) {
    parts.push(
      `${notebook.mistakes.length} correction${notebook.mistakes.length === 1 ? "" : "s"} came up` +
        (top ? `, most often on ${ERROR_TYPE_LABELS[top[0]].toLowerCase()}.` : "."),
    );
  }
  if (notebook.vocabulary.length > 0) {
    parts.push(
      `${notebook.vocabulary.length} new expression${notebook.vocabulary.length === 1 ? "" : "s"} went into the notebook.`,
    );
  }
  if (notebook.goals.length > 0) parts.push("A learning goal was set.");
  return parts.join(" ");
}

/**
 * Turn a corrected sentence into a gap-fill.
 *
 * The blanked word is the one the correction changed. We diff the learner's
 * sentence against the tutor's, so the gap lands on the actual teaching point
 * rather than on a random word.
 */
/**
 * The words of `corrected` that do not line up with `said`.
 *
 * A set difference is not enough. "It was busy week, a lot of meetings." ->
 * "A busy week." teaches the missing article, but "a" already occurs later in
 * the learner's sentence, so every word of the correction looks familiar and a
 * set difference finds no change at all. Aligning the two sequences and taking
 * what falls outside the longest common subsequence finds the inserted "A"
 * where a bag of words cannot.
 */
function unalignedIndices(said: string[], corrected: string[]): number[] {
  const rows = said.length;
  const cols = corrected.length;
  const lengths: number[][] = Array.from({ length: rows + 1 }, () =>
    new Array<number>(cols + 1).fill(0),
  );

  for (let i = 1; i <= rows; i += 1) {
    for (let j = 1; j <= cols; j += 1) {
      lengths[i][j] =
        said[i - 1] === corrected[j - 1]
          ? lengths[i - 1][j - 1] + 1
          : Math.max(lengths[i - 1][j], lengths[i][j - 1]);
    }
  }

  const aligned = new Set<number>();
  let i = rows;
  let j = cols;
  while (i > 0 && j > 0) {
    if (said[i - 1] === corrected[j - 1]) {
      aligned.add(j - 1);
      i -= 1;
      j -= 1;
    } else if (lengths[i - 1][j] >= lengths[i][j - 1]) {
      i -= 1;
    } else {
      j -= 1;
    }
  }

  return corrected.map((_, index) => index).filter((index) => !aligned.has(index));
}

/**
 * Turn a corrected sentence into a gap-fill.
 *
 * The blanked word is the one the correction introduced, so the gap lands on the
 * teaching point rather than on a random word.
 */
function gapFill(said: string, corrected: string): Exercise | null {
  const fixedWords = corrected.split(/\s+/).filter(Boolean);
  const saidWords = said.split(/\s+/).filter(Boolean);
  if (fixedWords.length === 0 || saidWords.length === 0) return null;

  const normalise = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{M}']/gu, "");
  const saidNormalised = saidWords.map(normalise);
  const fixedNormalised = fixedWords.map(normalise);
  const saidSet = new Set(saidNormalised.filter(Boolean));

  /* A correction restates the learner's words; it does not replace them. A
     pairing that fails that test is wrong, and blanking a word of an unrelated
     sentence would ship an exercise teaching nothing.

     Two shapes both count as restating, which is why this is not one ratio:

       - The tutor echoes most of the sentence, as in the article example above,
         keeping two words of three even though the recast is much shorter.
       - The tutor rewrites a short sentence almost entirely. "it finished good"
         -> "it went well" keeps one word of three, but the length is identical.

     A mispairing satisfies neither: no shared words and no matching shape. */
  const shared = fixedNormalised.filter((w) => saidSet.has(w)).length;
  if (shared === 0) return null;

  const overlap = shared / fixedWords.length;
  const shapeRatio =
    Math.min(saidWords.length, fixedWords.length) /
    Math.max(saidWords.length, fixedWords.length);
  if (overlap < 0.5 && shapeRatio < 0.8) return null;

  const changedIndex = unalignedIndices(saidNormalised, fixedNormalised)[0];
  if (changedIndex === undefined) return null;

  const answer = fixedNormalised[changedIndex];
  if (!answer) return null;

  const prompt = fixedWords
    .map((word, i) =>
      i === changedIndex
        ? word.replace(new RegExp(answer, "i"), "_____")
        : word,
    )
    .join(" ");

  return {
    prompt,
    answer: fixedWords[changedIndex].replace(/[^\p{L}\p{M}']/gu, ""),
    hint: `You said "${said}"`,
  };
}

export function buildLessonPack(
  notebook: Notebook,
  previous?: Notebook,
): LessonPack {
  const paired = notebook.mistakes.filter(
    (m): m is typeof m & { corrected: string } => Boolean(m.corrected),
  );

  const correctedSentences = paired.map((m) => ({
    said: m.said,
    corrected: m.corrected,
    errorType: ERROR_TYPE_LABELS[m.errorType],
    tentative:
      m.provenance.certainty === "tentative" ||
      m.correctionProvenance?.certainty === "tentative",
  }));

  const flashcards: Flashcard[] = notebook.vocabulary.map((v) => ({
    front: v.term,
    back: v.context,
    translation: v.translation,
    tentative: v.provenance.certainty === "tentative",
  }));

  const exercises = paired
    .map((m) => gapFill(m.said, m.corrected))
    .filter((e): e is Exercise => e !== null);

  /* The checklist is per error type, not per mistake: three tense slips are one
     thing to practise, not three. */
  const counts = countByType(notebook);
  const checklist = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(
      ([type, n]) =>
        `${ERROR_TYPE_LABELS[type]} - came up ${n} time${n === 1 ? "" : "s"} this lesson`,
    );

  const nextTopics = notebook.practiceTopics.map((p) => p.text);

  let progress: ProgressComparison | undefined;
  if (previous) {
    const previousTypes = new Set(previous.mistakes.map((m) => m.errorType));
    const currentTypes = new Set(notebook.mistakes.map((m) => m.errorType));
    progress = {
      previousLessonId: previous.lessonId,
      previousMistakeCount: previous.mistakes.length,
      currentMistakeCount: notebook.mistakes.length,
      resolvedErrorTypes: [...previousTypes]
        .filter((t) => !currentTypes.has(t))
        .map((t) => ERROR_TYPE_LABELS[t]),
      persistentErrorTypes: [...currentTypes]
        .filter((t) => previousTypes.has(t))
        .map((t) => ERROR_TYPE_LABELS[t]),
    };
  }

  return {
    lessonId: notebook.lessonId,
    learnerName: notebook.learnerName,
    tutorName: notebook.tutorName,
    summary: summarise(notebook),
    correctedSentences,
    flashcards,
    exercises,
    checklist,
    nextTopics,
    progress,
  };
}
