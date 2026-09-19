/**
 * Folding Jev's judgments into the notebook.
 *
 * This is the policy layer: thresholds, pairing, and de-duplication live here,
 * not in the question definitions. Keeping raw probabilities out of the notebook
 * and policy out of `jev.ts` means a threshold change is a code change with no
 * new inference, and the same judgments can feed a different presentation.
 */

import {
  certaintyFor,
  classifyLearnerError,
  classifyTurn,
  contextSentence,
  contextWindow,
  pairCorrection,
  selectStatements,
  selectVocabulary,
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

function normalise(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function isEcho(notebook: Notebook, turn: Turn): boolean {
  const spoken = normalise(turn.text);
  if (spoken.length < 8) return false;
  return notebook.turns
    .slice(-ECHO_LOOKBACK)
    .some(
      (earlier) =>
        normalise(earlier.text) === spoken &&
        Math.abs(turn.at - earlier.at) < ECHO_WINDOW_MS,
    );
}

/** The learner turns a tutor correction could plausibly be fixing. */
function recentLearnerTurns(turns: Turn[], beforeIndex: number, take = 2): Turn[] {
  const out: Turn[] = [];
  for (let i = beforeIndex - 1; i >= 0 && out.length < take; i -= 1) {
    if (turns[i].speaker === "learner") out.unshift(turns[i]);
  }
  return out;
}

/**
 * An unpaired mistake we can attach a later correction to.
 *
 * A tutor usually corrects the line right before, so we look for the newest
 * mistake that has no corrected form yet rather than matching on text.
 */
function openMistake(notebook: Notebook, said?: string): MistakeEntry | undefined {
  const candidates = notebook.mistakes.filter((m) => !m.corrected);
  if (said) {
    const exact = candidates.find(
      (m) => m.said.toLowerCase().trim() === said.toLowerCase().trim(),
    );
    if (exact) return exact;
  }
  return candidates[candidates.length - 1];
}

/**
 * Judge one turn and write what it earned into the notebook.
 *
 * Mutates `notebook` in place and returns a summary of what was added. Turns
 * already processed are skipped, so a reconnect or a replay cannot double-write.
 */
export interface LessonLanguages {
  native: string;
  target: string;
}

export async function processTurn(
  notebook: Notebook,
  turn: Turn,
  languages?: LessonLanguages,
): Promise<TurnResult> {
  const added: string[] = [];
  if (notebook.processedTurnIds.includes(turn.id)) {
    return { turnId: turn.id, added, signals: {} };
  }

  /* An echo is not a turn. It is dropped before it reaches the transcript, so
     the lesson does not show the same sentence under two names. */
  if (isEcho(notebook, turn)) {
    notebook.processedTurnIds.push(turn.id);
    return { turnId: turn.id, added, signals: { echo: 1 } };
  }

  const index = notebook.turns.findIndex((t) => t.id === turn.id);
  const position = index === -1 ? notebook.turns.length : index;
  if (index === -1) notebook.turns.push(turn);
  notebook.processedTurnIds.push(turn.id);

  const signals = await classifyTurn(
    turn,
    contextWindow(notebook.turns, position),
  );

  /* A learner error opens a mistake entry, which a later tutor turn may complete.
     It is typed straight away rather than left in the "other" bucket: in solo
     practice no tutor ever corrects it, and an untyped mistake makes both the
     notebook heading and the practice list meaningless. */
  const errorCertainty = certaintyFor(signals.containsError);
  if (turn.speaker === "learner" && errorCertainty) {
    const classified = await classifyLearnerError(turn);
    notebook.mistakes.push({
      id: id("mistake"),
      said: turn.text,
      errorType: classified?.errorType ?? "other",
      severity: classified?.severity ?? 1,
      provenance: prov([turn.id], signals.containsError, errorCertainty),
    });
    added.push("mistake");
  }

  /* A tutor correction is worth a second request: it needs the pairing. */
  const correctionCertainty = certaintyFor(signals.isCorrection);
  if (turn.speaker === "tutor" && correctionCertainty) {
    const pairing = await pairCorrection(
      turn,
      recentLearnerTurns(notebook.turns, position),
    );
    if (pairing?.corrected) {
      const pairCertainty = certaintyFor(pairing.confidence) ?? "tentative";
      const target = openMistake(notebook, pairing.original);
      if (target) {
        target.corrected = pairing.corrected;
        target.errorType = pairing.errorType;
        target.severity = pairing.severity;
        if (pairing.original) target.said = pairing.original;
        target.correctionProvenance = prov(
          [turn.id],
          pairing.confidence,
          pairCertainty,
        );
        added.push("correction");
      } else if (pairing.original) {
        /* The tutor corrected something we never flagged. Trust the tutor. */
        notebook.mistakes.push({
          id: id("mistake"),
          said: pairing.original,
          corrected: pairing.corrected,
          errorType: pairing.errorType,
          severity: pairing.severity,
          provenance: prov([turn.id], pairing.confidence, pairCertainty),
          correctionProvenance: prov([turn.id], pairing.confidence, pairCertainty),
        });
        added.push("mistake", "correction");
      }
    }
  }

  const vocabCertainty = certaintyFor(signals.introducesVocabulary);
  if (turn.speaker === "tutor" && vocabCertainty) {
    const picked = await selectVocabulary(turn);
    const pickedCertainty = picked ? certaintyFor(picked.confidence) : null;
    if (picked && pickedCertainty) {
      const duplicate = notebook.vocabulary.some(
        (v) => v.term.toLowerCase() === picked.term.toLowerCase(),
      );
      if (!duplicate) {
        const context = contextSentence(turn.text, picked.term);
        /* The gloss is generated, not selected - the learner's own language is
           not in the transcript. It is kept in its own field so it can never be
           mistaken for something the tutor said, and a failure here costs the
           translation, never the word. */
        const translation = languages
          ? await translateTerm(
              picked.term,
              context,
              languages.target,
              languages.native,
            )
          : null;

        notebook.vocabulary.push({
          id: id("vocab"),
          term: picked.term,
          context,
          translation: translation ?? undefined,
          provenance: prov(
            [turn.id],
            Math.min(signals.introducesVocabulary, picked.confidence),
            pickedCertainty,
          ),
        });
        added.push("vocabulary");
      }
    }
  }

  /* Explanations, goals, and practice notes are quoted, so no second pass. */
  const grammarCertainty = certaintyFor(signals.isGrammarExplanation);
  if (grammarCertainty) {
    notebook.grammar.push({
      id: id("grammar"),
      text: turn.text,
      provenance: prov([turn.id], signals.isGrammarExplanation, grammarCertainty),
    });
    added.push("grammar");
  }

  /* Goals and practice notes are quoted, but from the sentence that states
     them rather than the whole turn. Both are asked in one request. */
  const goalCertainty = certaintyFor(signals.statesGoal);
  const practiceCertainty = certaintyFor(signals.flagsPracticeNeed);

  if (goalCertainty || practiceCertainty) {
    const statements = await selectStatements(turn, {
      goal: Boolean(goalCertainty),
      practice: Boolean(practiceCertainty),
    });

    if (goalCertainty) {
      notebook.goals.push({
        id: id("goal"),
        text: statements.goal ?? turn.text,
        provenance: prov([turn.id], signals.statesGoal, goalCertainty),
      });
      added.push("goal");
    }

    if (practiceCertainty) {
      notebook.practiceTopics.push({
        id: id("practice"),
        text: statements.practice ?? turn.text,
        provenance: prov([turn.id], signals.flagsPracticeNeed, practiceCertainty),
      });
      added.push("practice");
    }
  }

  return {
    turnId: turn.id,
    added,
    signals: signals as unknown as Record<string, number>,
  };
}
