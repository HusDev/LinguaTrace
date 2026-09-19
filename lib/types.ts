/**
 * LinguaTrace domain model.
 *
 * A lesson is a stream of `Turn`s. Jev judges each turn, and `notebook.ts`
 * folds those judgments into a `Notebook`. The notebook is the only thing the
 * UI renders and the only input to the Lesson Pack, so every field here is
 * either observed (came off the wire) or inferred (came from Jev) - never both.
 */

export type Speaker = "tutor" | "learner";

/** One utterance, as delivered by the transcript source. */
export interface Turn {
  id: string;
  speaker: Speaker;
  text: string;
  /** Milliseconds from the start of the lesson. */
  at: number;
}

/**
 * How much we trust an inferred entry.
 *
 * Mirrors the confirmed / not-confirmed distinction a good intake agent makes:
 * we would rather show a hedged note than silently drop a real correction, and
 * rather drop a guess than assert something the tutor never said.
 */
export type Certainty = "confirmed" | "tentative";

/**
 * How sure the gate must be that a turn is lesson content before it is judged.
 *
 * Here rather than beside the question that produces it, because the transcript
 * shows what was decided about every turn and so needs the same number the
 * judgment used. `lib/jev.ts` pulls in the model SDK and a server-side key, so
 * the page cannot import it; two copies of a threshold that must agree is worse
 * than one constant in the module both sides already share.
 */
export const LESSON_SPEECH_THRESHOLD = 0.6;

/** Above this, the transcript is too suspect to accuse the learner from. */
export const ASR_ARTEFACT_THRESHOLD = 0.5;

export interface Provenance {
  /** Turns this entry was derived from. */
  turnIds: string[];
  /** The Jev probability or confidence that produced it, 0..1. */
  score: number;
  certainty: Certainty;
}

/** The error taxonomy the notebook groups mistakes by. */
export const ERROR_TYPES = [
  "verb_tense",
  "word_order",
  "preposition",
  "article",
  "word_choice",
  "agreement",
  "plural_form",
  "other",
] as const;

export type ErrorType = (typeof ERROR_TYPES)[number];

export const ERROR_TYPE_LABELS: Record<ErrorType, string> = {
  verb_tense: "Verb tense",
  word_order: "Word order",
  preposition: "Prepositions",
  article: "Articles",
  word_choice: "Word choice",
  agreement: "Subject-verb agreement",
  plural_form: "Plural forms",
  other: "Other",
};

/** A learner mistake, optionally paired with the tutor's correction. */
export interface MistakeEntry {
  id: string;
  /** What the learner actually said. */
  said: string;
  /** The tutor's corrected form, once a correction turn is paired to it. */
  corrected?: string;
  errorType: ErrorType;
  /** 0..2 - how much the error impedes being understood. */
  severity: number;
  provenance: Provenance;
  correctionProvenance?: Provenance;
}

export interface VocabEntry {
  id: string;
  /** The word or expression, copied verbatim from the turn that introduced it. */
  term: string;
  /** The sentence it appeared in, used as the flashcard's context side. */
  context: string;
  /**
   * The term in the learner's own language.
   *
   * The one generated string in the notebook. Everything else is selected from
   * what was actually said, but a translation cannot be - the word simply is not
   * in the transcript. It is kept in its own field so it is never mistaken for
   * something the tutor said.
   */
  translation?: string;
  provenance: Provenance;
}

export interface GrammarNote {
  id: string;
  /** The tutor's explanation, quoted rather than paraphrased. */
  text: string;
  provenance: Provenance;
}

export interface GoalEntry {
  id: string;
  text: string;
  provenance: Provenance;
}

export interface PracticeTopic {
  id: string;
  text: string;
  provenance: Provenance;
}

/**
 * A snapshot taped into the notes.
 *
 * Only whiteboard drawings are kept. A whiteboard snapshot is a drawing and
 * belongs to the lesson; a camera capture is a still of a person's face, and
 * keeping those indefinitely is a different promise from keeping someone's
 * notes. Camera stills are shared with the other person in the call, who is
 * already looking at that face, and are gone on refresh.
 */
export interface CaptureEntry {
  id: string;
  /** A JPEG data URL, already shrunk to something that can be sent. */
  dataUrl: string;
  kind: "camera" | "whiteboard";
}

/** Everything the lesson produced, in the order the UI shows it. */
export interface Notebook {
  lessonId: string;
  learnerName: string;
  tutorName: string;
  turns: Turn[];
  mistakes: MistakeEntry[];
  vocabulary: VocabEntry[];
  grammar: GrammarNote[];
  goals: GoalEntry[];
  practiceTopics: PracticeTopic[];
  /** Turn ids already folded in, so replays and retries stay idempotent. */
  processedTurnIds: string[];
  /** Whiteboard snapshots taped in. Camera stills never reach this. */
  captures: CaptureEntry[];
}

export function emptyNotebook(
  lessonId: string,
  learnerName: string,
  tutorName: string,
): Notebook {
  return {
    lessonId,
    learnerName,
    tutorName,
    turns: [],
    mistakes: [],
    vocabulary: [],
    grammar: [],
    goals: [],
    practiceTopics: [],
    processedTurnIds: [],
    captures: [],
  };
}
