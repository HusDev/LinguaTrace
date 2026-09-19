/**
 * The live lesson, held in memory while it runs and written through to storage.
 *
 * Both, not either. In-memory keeps the hot path fast while turns arrive every
 * few seconds; writing through after each turn means a refresh mid-lesson
 * resumes, and the lesson survives the server restarting. The database is the
 * record; this is the working copy.
 */

import {
  createLessonRow,
  endLesson as markLessonEnded,
  getLearner,
  listLessons,
  loadNotebook,
  saveNotebook,
  upsertLearner,
  type LearnerRecord,
} from "./db";
import { emptyNotebook, type Notebook } from "./types";
import type { AccountRecord } from "./db";

const live = new Map<string, { notebook: Notebook; learnerId: string }>();

/** The demo learner, until the app has accounts. */
export const DEFAULT_LEARNER: LearnerRecord = {
  id: "learner-ana",
  name: "Ana",
  nativeLanguage: "Spanish",
  targetLanguage: "English",
};

export function ensureLearner(learner: LearnerRecord = DEFAULT_LEARNER): LearnerRecord {
  const existing = getLearner(learner.id);
  if (existing) return existing;
  upsertLearner(learner);
  return learner;
}

/**
 * Mirror an account into the learner table.
 *
 * Lessons and their entries key off a learner id, and that stays true for
 * accounts: an account simply becomes the learner it refers to. Keeping the two
 * tables in step here means nothing downstream had to learn about accounts.
 */
export function upsertLearnerFromAccount(account: AccountRecord): void {
  upsertLearner({
    id: account.id,
    name: account.name,
    nativeLanguage: account.nativeLanguage,
    targetLanguage: account.targetLanguage,
  });
}

export function createLesson(
  lessonId: string,
  learnerId: string,
  tutorName: string,
  tutorId?: string,
): Notebook {
  const learner = getLearner(learnerId) ?? ensureLearner();
  const notebook = emptyNotebook(lessonId, learner.name, tutorName);
  createLessonRow(lessonId, learner.id, tutorName, tutorId);
  live.set(lessonId, { notebook, learnerId: learner.id });
  return notebook;
}

/** The working copy, restored from storage if this process has not seen it. */
export function getLesson(lessonId: string): Notebook | undefined {
  const held = live.get(lessonId);
  if (held) return held.notebook;

  const stored = loadNotebook(lessonId);
  if (!stored) return undefined;
  const learnerId = lessonLearnerId(lessonId);
  if (learnerId) live.set(lessonId, { notebook: stored, learnerId });
  return stored;
}

function lessonLearnerId(lessonId: string): string | null {
  for (const learner of [DEFAULT_LEARNER.id]) {
    if (listLessons(learner).some((l) => l.id === lessonId)) return learner;
  }
  return null;
}

export function learnerIdFor(lessonId: string): string | null {
  return live.get(lessonId)?.learnerId ?? lessonLearnerId(lessonId);
}

/** Persist the lesson as it stands. Called after every judged turn. */
export function persist(lessonId: string): void {
  const held = live.get(lessonId);
  if (!held) return;
  saveNotebook(held.notebook, held.learnerId);
}

export function finishLesson(lessonId: string): void {
  persist(lessonId);
  markLessonEnded(lessonId);
}

/**
 * The learner's previous lesson, for the progress comparison.
 *
 * Now a real lookup rather than whatever happened to be in memory, so progress
 * survives a restart and means what it says.
 */
export function previousLesson(learnerId: string, currentLessonId: string) {
  const earlier = listLessons(learnerId).find(
    (l) => l.id !== currentLessonId && l.endedAt !== null,
  );
  return earlier ? (loadNotebook(earlier.id) ?? undefined) : undefined;
}
