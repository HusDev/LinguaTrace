/**
 * Views over the notebook that the page displays but does not store.
 *
 * These are all derived, never inferred: counting what the lesson recorded, not
 * asking the model for a second opinion. Keeping them here means the header
 * figures and the practice list cannot drift from the entries they describe.
 */

import { ERROR_TYPE_LABELS, type ErrorType, type Notebook } from "./types";

/** The error type the lesson kept returning to. */
export function lessonFocus(notebook: Notebook): string | null {
  const counts = new Map<ErrorType, number>();
  for (const m of notebook.mistakes) {
    counts.set(m.errorType, (counts.get(m.errorType) ?? 0) + 1);
  }
  /* "Other" is the bucket for errors the taxonomy does not name, so it makes a
     useless heading. Prefer any specific type, and fall back to it only when
     nothing else was recorded. */
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const top = ranked.find(([type]) => type !== "other");
  // With nothing but "other" there is no focus worth naming, and a heading
  // reading "Focus: Other" is worse than no heading.
  return top ? ERROR_TYPE_LABELS[top[0]] : null;
}

export interface PracticeItem {
  label: string;
  /**
   * True when this came up in the previous lesson and not in this one.
   * Absence of evidence over one lesson, so it is shown as progress and never
   * claimed as mastery.
   */
  settled: boolean;
}

/**
 * What the learner should work on, and what has stopped coming up.
 *
 * Error types seen in either lesson form the list. An item is settled when the
 * previous lesson hit it and this one did not.
 */
export function practiceItems(
  notebook: Notebook,
  previous?: Notebook,
): PracticeItem[] {
  const current = new Set(notebook.mistakes.map((m) => m.errorType));
  const before = new Set(previous?.mistakes.map((m) => m.errorType) ?? []);

  const items = [...new Set([...before, ...current])].map((type) => ({
    label: ERROR_TYPE_LABELS[type],
    settled: before.has(type) && !current.has(type),
  }));

  /* Anything the tutor asked for by name belongs on the list too, and is never
     settled by inference - only the tutor can close it. */
  for (const topic of notebook.practiceTopics) {
    items.push({ label: topic.text, settled: false });
  }

  return items.sort((a, b) => Number(a.settled) - Number(b.settled));
}

/**
 * Share of the list that has stopped coming up, or null when there is no
 * previous lesson to compare against - in which case there is no progress to
 * report and the UI should say so rather than show a hopeful zero.
 */
export function settledShare(items: PracticeItem[], hasPrevious: boolean) {
  if (!hasPrevious || items.length === 0) return null;
  return Math.round(
    (items.filter((i) => i.settled).length / items.length) * 100,
  );
}

/** A short, factual progress line, or null when there is nothing to compare. */
export function progressNote(
  notebook: Notebook,
  previous?: Notebook,
): string | null {
  if (!previous) return null;
  const now = notebook.mistakes.length;
  const before = previous.mistakes.length;
  if (before === 0) return null;
  if (now < before) return `${before - now} fewer than last lesson`;
  if (now === before) return "Same as last lesson";
  return `${now - before} more than last lesson`;
}
