/**
 * Folding Jev's judgments into the notebook.
 *
 * This is the policy layer: thresholds, pairing, and de-duplication live here,
 * not in the question definitions. Keeping raw probabilities out of the notebook
 * and policy out of `jev.ts` means a threshold change is a code change with no
 * new inference, and the same judgments can feed a different presentation.
 *
 * The judgments arrive through a `Judge`, which defaults to the real model. The
 * seam exists so that this file - where the mistakes that reach the learner's
 * page are actually made - can be tested without a key and without the network.
 */

import {
  CHOICE_FLOOR,
  TURN_DEADLINE_MS,
  type JudgeOptions,
  type TurnSelections,
  type TurnSignals,
  certaintyFor,
  classifyTurn,
  contextSentence,
  contextWindow,
  pairingWindow,
  selectSpans,
} from "./jev";
import { translateTerm } from "./translate";
import type {
  Certainty,
  MistakeEntry,
  Notebook,
  Provenance,
  Turn,
} from "./types";

/** What changed on this turn, so the UI can animate only the new lines. */
export interface TurnResult {
  turnId: string;
  added: string[];
  signals: Record<string, number>;
}

/**
 * Everything `processTurn` asks of a model, in one place.
 *
 * Policy is the part of this app most worth testing and was the part least
 * testable: every decision below sat behind a live API call. Naming the calls
 * as an interface costs one parameter and makes the pairing, the banding and
 * the de-duplication checkable offline.
 */
export interface Judge {
  classifyTurn(
    turn: Turn,
    context: ReturnType<typeof contextWindow>,
    options?: JudgeOptions,
  ): Promise<TurnSignals>;
  selectSpans(
    turn: Turn,
    context: ReturnType<typeof contextWindow>,
    recentLearnerTurns: Turn[],
    options?: JudgeOptions,
  ): Promise<TurnSelections>;
  translateTerm(
    term: string,
    context: string,
    targetLanguage: string,
    nativeLanguage: string,
  ): Promise<string | null>;
}

/** The real thing. */
export const liveJudge: Judge = { classifyTurn, selectSpans, translateTerm };

function prov(turnIds: string[], score: number, certainty: Certainty): Provenance {
  return { turnIds, score, certainty };
}

let counter = 0;
function id(prefix: string) {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}

/**
 * Has this already been heard?
 *
 * Two microphones in one room hear both people, so the same sentence arrives
 * twice - once from each side, each labelled with whoever owns that stream. The
 * second copy is not a second turn: it is an echo, and writing it up doubles
 * every correction and attributes half of them to the wrong person.
 *
 * Compared across speakers on purpose, because the wrong attribution is exactly
 * what an echo produces.
 */
const ECHO_WINDOW_MS = 25_000;
const ECHO_LOOKBACK = 6;

/**
 * How alike two turns must read before one is dismissed as the other's echo.
 *
 * This used to demand that they be identical, which sounded safe and was not.
 * The two copies are produced by two different transcription sessions listening
 * to two different audio paths - one a raw microphone, the other the same voice
 * after a speaker, a room and a network - and they draw their fragment
 * boundaries independently. They agree on the words and disagree on a filler, a
 * comma, a trailing "um". So the check almost never fired where it was needed,
 * and both copies were written up: the exact fault it was added to prevent.
 */
const ECHO_SIMILARITY = 0.85;

/**
 * How different in length two turns may be and still be one utterance.
 *
 * The guard against the opposite mistake. A learner repeating the tutor back is
 * drilling, not echoing, and that is a real turn which the notebook should
 * judge - so a loose word-overlap test on its own would start swallowing the
 * most deliberate practice in the lesson. Two transcripts of one utterance are
 * close to the same length; a drill and its prompt often are not, and the
 * length test is the cheap half of telling them apart.
 */
const ECHO_LENGTH_RATIO = 0.75;

function normalise(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/** How much two normalised utterances share, as a fraction of the longer one. */
export function similarity(a: string, b: string): number {
  const left = normalise(a).split(" ").filter(Boolean);
  const right = normalise(b).split(" ").filter(Boolean);
  if (left.length === 0 || right.length === 0) return 0;

  /* Multiset overlap, so a repeated word only counts as often as both said it. */
  const counts = new Map<string, number>();
  for (const word of left) counts.set(word, (counts.get(word) ?? 0) + 1);

  let shared = 0;
  for (const word of right) {
    const left = counts.get(word) ?? 0;
    if (left > 0) {
      shared += 1;
      counts.set(word, left - 1);
    }
  }

  return shared / Math.max(left.length, right.length);
}

export function isEcho(notebook: Notebook, turn: Turn): boolean {
  const spoken = normalise(turn.text);
  if (spoken.length < 8) return false;
  const spokenWords = spoken.split(" ").filter(Boolean).length;

  return notebook.turns.slice(-ECHO_LOOKBACK).some((earlier) => {
    if (Math.abs(turn.at - earlier.at) >= ECHO_WINDOW_MS) return false;

    /* One person saying the same thing twice is repetition, and repeating
       yourself in a language lesson is usually the point. An echo is the other
       microphone, so it always arrives under the other name. */
    if (earlier.speaker === turn.speaker) return false;

    const earlierWords = normalise(earlier.text).split(" ").filter(Boolean).length;
    const ratio =
      Math.min(spokenWords, earlierWords) / Math.max(spokenWords, earlierWords);
    if (ratio < ECHO_LENGTH_RATIO) return false;

    return similarity(turn.text, earlier.text) >= ECHO_SIMILARITY;
  });
}

/**
 * An unpaired mistake a tutor correction could be fixing.
 *
 * Bounded to the turns the model was actually shown. The fallback used to be
 * "the newest mistake anywhere in the notebook that has no correction yet",
 * which quietly made every old unresolved mistake a candidate for every later
 * correction - and then overwrote its text. A learner would open the page and
 * read a sentence they never said, struck through, next to a correction of
 * something else entirely. A correction may only land on a mistake drawn from a
 * turn the pairing question could see.
 */
export function openMistake(
  notebook: Notebook,
  eligibleTurnIds: Set<string>,
  said?: string,
): MistakeEntry | undefined {
  const candidates = notebook.mistakes.filter(
    (m) =>
      !m.corrected &&
      m.provenance.turnIds.some((turnId) => eligibleTurnIds.has(turnId)),
  );
  if (candidates.length === 0) return undefined;

  /* When the tutor's turn named which sentence it was fixing, that name has to
     match something. It used to fall through to "the newest open mistake"
     regardless, which is what turned a correction of an unflagged sentence into
     a rewrite of an unrelated one. No match now means no target, and the caller
     writes the tutor's own version as a new entry instead. */
  if (said) {
    const wanted = normalise(said);
    return candidates.find((m) => {
      const held = normalise(m.said);
      return held === wanted || held.includes(wanted) || wanted.includes(held);
    });
  }

  /* No name to match on: the pairing found a corrected form but could not say
     which sentence it fixed. The newest open mistake in the window the model
     was shown is the best available guess, and it is bounded. */
  return candidates[candidates.length - 1];
}

/** Narrowing a quote is an improvement; replacing it with another is the bug. */
function narrows(existing: string, replacement: string): boolean {
  const from = normalise(existing);
  const to = normalise(replacement);
  return to.length > 0 && from.includes(to);
}

export interface LessonLanguages {
  native: string;
  target: string;
}

export interface ProcessOptions {
  languages?: LessonLanguages;
  /** Swapped out in tests. Defaults to the real model. */
  judge?: Judge;
  /** The turn's whole budget. Shortened in tests so they need not wait it out. */
  deadlineMs?: number;
  /**
   * Called when a late-arriving gloss changes the notebook after the response
   * has already gone out, so the caller can write the lesson through again.
   */
  onLateUpdate?: () => void;
}

/**
 * Judge one turn and write what it earned into the notebook.
 *
 * Mutates `notebook` in place and returns a summary of what was added. Turns
 * already processed are skipped, so a reconnect or a replay cannot double-write.
 */
export async function processTurn(
  notebook: Notebook,
  turn: Turn,
  options: ProcessOptions = {},
): Promise<TurnResult> {
  const {
    languages,
    judge = liveJudge,
    onLateUpdate,
    deadlineMs = TURN_DEADLINE_MS,
  } = options;
  const added: string[] = [];
  if (notebook.processedTurnIds.includes(turn.id)) {
    return { turnId: turn.id, added, signals: {} };
  }

  /* An echo is not a turn. It is dropped before it reaches the transcript, so
     the lesson does not show the same sentence under two names - the sentence
     itself is not lost, it is already on the page under whoever actually said
     it. The client drops its own optimistic copy when this comes back. */
  if (isEcho(notebook, turn)) {
    notebook.processedTurnIds.push(turn.id);
    return { turnId: turn.id, added, signals: { echo: 1 } };
  }

  const index = notebook.turns.findIndex((t) => t.id === turn.id);
  const position = index === -1 ? notebook.turns.length : index;
  if (index === -1) notebook.turns.push(turn);
  notebook.processedTurnIds.push(turn.id);

  const context = contextWindow(notebook.turns, position);
  const learnerWindow = pairingWindow(notebook.turns, position);
  const eligibleTurnIds = new Set(learnerWindow.map((t) => t.id));

  /* One deadline for the whole turn, not one per request. The judgments and
     the selections are independent, so they go together: the turn costs one
     round trip, and a lesson cannot run minutes ahead of its own notebook. */
  const deadline = AbortSignal.timeout(deadlineMs);
  let signals: TurnSignals;
  let selections: TurnSelections;
  try {
    [signals, selections] = await Promise.all([
      judge.classifyTurn(turn, context, { signal: deadline }),
      judge.selectSpans(turn, context, learnerWindow, { signal: deadline }),
    ]);
  } catch (error) {
    /* Only the deadline is handled here. A turn that ran out of time is still a
       turn: it stays in the transcript and says so, because a line that
       silently gains nothing is indistinguishable from an app that has stopped
       working. Anything else - a missing key, a rejected request - is a fault
       the lesson's owner needs told about, so it goes up to the route and is
       reported rather than disguised as slowness. */
    if (!deadline.aborted) throw error;
    return { turnId: turn.id, added, signals: { timedOut: 1 } };
  }

  /* A learner error opens a mistake entry, which a later tutor turn may complete.
     It is typed straight away rather than left in the "other" bucket: in solo
     practice no tutor ever corrects it, and an untyped mistake makes both the
     notebook heading and the practice list meaningless. */
  const errorCertainty = certaintyFor(signals.containsError);
  if (turn.speaker === "learner" && errorCertainty) {
    /* `null` is the classifier saying the sentence is fine, which it previously
       had no way to say. A turn that scrapes past the tentative floor and then
       cannot be assigned a real error type is not a mistake; it is a guess, and
       a guess written down as a mistake is what the learner reads as being
       wrong about something they got right. */
    const classified = selections.learnerError;
    if (classified) {
      notebook.mistakes.push({
        id: id("mistake"),
        said: turn.text,
        errorType: classified.errorType,
        severity: classified.severity,
        provenance: prov([turn.id], signals.containsError, errorCertainty),
      });
      added.push("mistake");
    }
  }

  /* A tutor correction needs the pairing, which was asked speculatively
     alongside the judgment rather than in a second round trip after it. */
  const pairing = selections.correction;
  const correctionCertainty =
    turn.speaker === "tutor" && pairing
      ? /* Banded on the calibrated probability that a correction happened, not
           on how concentrated the span picks were. Those are different
           quantities on different scales, and reading one as the other is why a
           three-way choice used to look more certain than a twenty-four-way one
           that meant more. */
        certaintyFor(Math.min(signals.isCorrection, pairing.confidence))
      : null;

  if (pairing?.corrected && correctionCertainty && pairing.spanConfidence >= CHOICE_FLOOR) {
    const score = Math.min(signals.isCorrection, pairing.confidence);
    const target = openMistake(notebook, eligibleTurnIds, pairing.original);
    if (target) {
      target.corrected = pairing.corrected;
      target.errorType = pairing.errorType;
      target.severity = pairing.severity;
      /* Only ever narrow the quote to the sentence that was wrong. Swapping it
         for a different sentence is how a learner ends up reading words they
         never spoke. */
      if (pairing.original && narrows(target.said, pairing.original)) {
        target.said = pairing.original;
      }
      target.correctionProvenance = prov([turn.id], score, correctionCertainty);
      added.push("correction");
    } else if (pairing.original) {
      /* The tutor corrected something we never flagged. Trust the tutor, and
         write a new entry rather than repainting an unrelated one. */
      notebook.mistakes.push({
        id: id("mistake"),
        said: pairing.original,
        corrected: pairing.corrected,
        errorType: pairing.errorType,
        severity: pairing.severity,
        provenance: prov([turn.id], score, correctionCertainty),
        correctionProvenance: prov([turn.id], score, correctionCertainty),
      });
      added.push("mistake", "correction");
    }
  }

  const vocabCertainty = certaintyFor(signals.introducesVocabulary);
  const picked = selections.vocabulary;
  if (turn.speaker === "tutor" && vocabCertainty && picked) {
    const duplicate = notebook.vocabulary.some(
      (v) => v.term.toLowerCase() === picked.term.toLowerCase(),
    );
    if (!duplicate) {
      const context = contextSentence(turn.text, picked.term);
      const entry = {
        id: id("vocab"),
        term: picked.term,
        context,
        translation: undefined as string | undefined,
        /* The band comes from the calibrated judgment that a word was being
           taught. The pick's own confidence is a floor applied in `jev.ts`,
           not a number to show the learner. */
        provenance: prov([turn.id], signals.introducesVocabulary, vocabCertainty),
      };
      notebook.vocabulary.push(entry);
      added.push("vocabulary");

      /* The gloss is generated, not selected - the learner's own language is
         not in the transcript. It is kept in its own field so it can never be
         mistaken for something the tutor said, and a failure here costs the
         translation, never the word.

         It is also the only thing in the pipeline that genuinely needs an
         earlier answer, so it cannot be batched with anything. It therefore
         runs after the word is already written rather than in front of it:
         waiting on a second provider to answer before showing a word the tutor
         has already said made a slow dictionary into a slow notebook. */
      if (languages) {
        void judge
          .translateTerm(picked.term, context, languages.target, languages.native)
          .then((translation) => {
            if (!translation) return;
            entry.translation = translation;
            onLateUpdate?.();
          })
          .catch(() => {
            /* A missing gloss is the documented outcome, not an error. */
          });
      }
    }
  }

  /* Explanations are quoted whole, so they need no selection. */
  const grammarCertainty = certaintyFor(signals.isGrammarExplanation);
  if (grammarCertainty) {
    notebook.grammar.push({
      id: id("grammar"),
      text: turn.text,
      provenance: prov([turn.id], signals.isGrammarExplanation, grammarCertainty),
    });
    added.push("grammar");
  }

  /* Goals and practice notes are quoted from the sentence that states them
     rather than the whole turn, and fall back to the turn when no sentence was
     picked confidently enough to be worth narrowing to. */
  const goalCertainty = certaintyFor(signals.statesGoal);
  if (goalCertainty) {
    notebook.goals.push({
      id: id("goal"),
      text: selections.goal ?? turn.text,
      provenance: prov([turn.id], signals.statesGoal, goalCertainty),
    });
    added.push("goal");
  }

  const practiceCertainty = certaintyFor(signals.flagsPracticeNeed);
  if (practiceCertainty) {
    notebook.practiceTopics.push({
      id: id("practice"),
      text: selections.practice ?? turn.text,
      provenance: prov([turn.id], signals.flagsPracticeNeed, practiceCertainty),
    });
    added.push("practice");
  }

  return {
    turnId: turn.id,
    added,
    signals: signals as unknown as Record<string, number>,
  };
}
