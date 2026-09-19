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
  getLessonParticipants,
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
  learnerName?: string,
): Notebook {
  const learner = getLearner(learnerId) ?? ensureLearner();
  const notebook = emptyNotebook(lessonId, learnerName ?? learner.name, tutorName);
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

/**
 * Whose lesson this is, asked of the database rather than guessed.
 *
 * This used to scan only the demo learner's lessons, which was true before
 * accounts and silently wrong after. The damage was invisible and total: on a
 * restart, a real account's lesson resolved to nobody, so it was never taken
 * back into the working set, and `persist` - which writes only what it holds -
 * saved nothing. Turns were judged and thrown away, and the notebook simply
 * stopped filling while the lesson carried on.
 */
function lessonLearnerId(lessonId: string): string | null {
  return getLessonParticipants(lessonId)?.learnerId ?? null;
}

export function learnerIdFor(lessonId: string): string | null {
  return live.get(lessonId)?.learnerId ?? lessonLearnerId(lessonId);
}

/**
 * Point the working copy at a different learner, and keep the name in step.
 *
 * A tutor's lesson is opened before anyone joins, so it starts with a
 * placeholder learner. Updating only the stored row left the working copy
 * holding the old name - and the working copy is what every response is built
 * from, so a joining learner saw the tutor's name on their own video tile, on
 * their own turns in the transcript, and at the top of the notebook.
 */
export function reassignLesson(lessonId: string, learnerId: string, name: string): void {
  const held = live.get(lessonId);
  if (!held) return;
  held.learnerId = learnerId;
  held.notebook.learnerName = name;
  saveNotebook(held.notebook, learnerId);
}

/**
 * One lesson, one writer at a time.
 *
 * Both people in a lesson post their turns to the same endpoint, and both are
 * folded into the same in-memory notebook. `processTurn` reads that notebook -
 * the context window, the recent learner turns, the open mistakes - across
 * several awaits and then writes to it, so two turns arriving together could
 * each read the state the other was midway through changing: a correction
 * judged against a transcript that did not yet contain the sentence it
 * corrected, or two turns appended in the order their judgments happened to
 * finish rather than the order they were spoken.
 *
 * This serialises the folding, not the judging. Each turn still costs one round
 * trip, so the queue never grows faster than the lesson does.
 */
const writing = new Map<string, Promise<unknown>>();

export function withLesson<T>(lessonId: string, work: () => Promise<T>): Promise<T> {
  // Runs on either outcome, so one failed turn does not block every turn behind it.
  const queued = (writing.get(lessonId) ?? Promise.resolve()).then(work, work);

  const settled = queued.then(
    () => undefined,
    () => undefined,
  );
  writing.set(lessonId, settled);

  /* Dropped once the lesson's queue has drained, so a server that has seen
     thousands of lessons is not still holding a promise for each of them. The
     identity check leaves a queue alone if another turn has already joined it. */
  void settled.then(() => {
    if (writing.get(lessonId) === settled) writing.delete(lessonId);
  });

  return queued;
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
