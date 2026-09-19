/**
 * The Galtea-shaped evaluation harness.
 *
 * It runs the real question set against labelled turns and reports, per signal,
 * where the note-taker misses a real learning moment and where it invents one.
 * Those two failures are not equal: a missed correction costs the learner the
 * thing they most needed written down, while a false positive is clutter they
 * can ignore. The report separates them so a threshold change can be argued
 * rather than guessed.
 *
 * Run with:  npx tsx eval/run.ts
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ASR_ARTEFACT_THRESHOLD,
  CONFIRM_THRESHOLD,
  LESSON_SPEECH_THRESHOLD,
  TENTATIVE_THRESHOLD,
  classifyTurn,
  jevConfigured,
  selectSpans,
} from "../lib/jev";
import type { Speaker, Turn } from "../lib/types";

interface Case {
  id: string;
  context: Array<{ speaker: Speaker; text: string }>;
  turn: { speaker: Speaker; text: string };
  expect: Record<string, boolean | string>;
}

const SIGNAL_KEYS = [
  "is_lesson_speech",
  "is_asr_artefact",
  "contains_error",
  "is_correction",
  "introduces_vocabulary",
  "is_grammar_explanation",
  "flags_practice_need",
  "states_goal",
] as const;

type SignalKey = (typeof SIGNAL_KEYS)[number];

const SIGNAL_FIELD: Record<SignalKey, string> = {
  is_lesson_speech: "isLessonSpeech",
  is_asr_artefact: "isAsrArtefact",
  contains_error: "containsError",
  is_correction: "isCorrection",
  introduces_vocabulary: "introducesVocabulary",
  is_grammar_explanation: "isGrammarExplanation",
  flags_practice_need: "flagsPracticeNeed",
  states_goal: "statesGoal",
};

/* Each signal is scored at the threshold the application actually uses, so a
   pass here means the shipped behaviour is right - not merely that the number
   leaned the correct way.

   For the note signals that is the tentative floor, not the confirmed one. An
   entry is written at 0.45 and merely marked unsure; scoring them at 0.75
   reported a clean sheet while the notebook was filling with hedged notes the
   lesson did not contain, which is exactly the complaint this set exists to
   catch. */
const THRESHOLD: Partial<Record<SignalKey, number>> = {
  is_lesson_speech: LESSON_SPEECH_THRESHOLD,
  is_asr_artefact: ASR_ARTEFACT_THRESHOLD,
};

/** What a signal must reach before the notebook writes anything from it. */
const WRITES_AT = TENTATIVE_THRESHOLD;

interface Tally {
  truePositive: number;
  falsePositive: number;
  trueNegative: number;
  falseNegative: number;
}

const blank = (): Tally => ({
  truePositive: 0,
  falsePositive: 0,
  trueNegative: 0,
  falseNegative: 0,
});

function rate(n: number, d: number): string {
  return d === 0 ? "  n/a" : `${((n / d) * 100).toFixed(0).padStart(4)}%`;
}

async function main() {
  if (!jevConfigured()) {
    console.error(
      "TYPESAFE_API_KEY is not set. Export it, or put it in .env.local and run with --env-file=.env.local",
    );
    process.exit(1);
  }

  const dataset = JSON.parse(
    readFileSync(join(import.meta.dirname, "dataset.json"), "utf8"),
  ) as { cases: Case[] };

  const tallies = new Map<SignalKey, Tally>(
    SIGNAL_KEYS.map((k) => [k, blank()]),
  );
  const failures: string[] = [];
  const lowConfidence: string[] = [];
  const durations: number[] = [];

  for (const testCase of dataset.cases) {
    const turn: Turn = {
      id: testCase.id,
      speaker: testCase.turn.speaker,
      text: testCase.turn.text,
      at: 0,
    };

    /* Timed together and asked together, exactly as a live turn does it: the
       judgments and the selections are one round trip, so measuring them apart
       would report a latency the app never pays. */
    const started = Date.now();
    const learnerWindow: Turn[] = testCase.context
      .filter((c) => c.speaker === "learner")
      .map((c, i) => ({ id: `${testCase.id}-ctx-${i}`, speaker: c.speaker, text: c.text, at: 0 }));

    const [rawSignals, selections] = await Promise.all([
      classifyTurn(turn, testCase.context),
      selectSpans(turn, testCase.context, learnerWindow),
    ]);
    durations.push(Date.now() - started);
    const signals = rawSignals as unknown as Record<string, number>;

    for (const key of SIGNAL_KEYS) {
      const expected = testCase.expect[key];
      if (typeof expected !== "boolean") continue;

      const probability = signals[SIGNAL_FIELD[key]] ?? 0;
      const fired = probability >= (THRESHOLD[key] ?? WRITES_AT);
      const tally = tallies.get(key)!;

      if (expected && fired) tally.truePositive += 1;
      else if (expected && !fired) {
        tally.falseNegative += 1;
        failures.push(
          `MISS  ${testCase.id} · ${key} expected yes, got ${probability.toFixed(2)}`,
        );
      } else if (!expected && fired) {
        tally.falsePositive += 1;
        failures.push(
          `FALSE ${testCase.id} · ${key} expected no, got ${probability.toFixed(2)}`,
        );
      } else tally.trueNegative += 1;

      /* Answers landing in the tentative band are the ones worth relabelling:
         they are where the question wording, not the threshold, is doing badly. */
      if (probability >= TENTATIVE_THRESHOLD && probability < CONFIRM_THRESHOLD) {
        lowConfidence.push(
          `${testCase.id} · ${key} = ${probability.toFixed(2)} (expected ${expected ? "yes" : "no"})`,
        );
      }
    }

    /* The selections, which are what the notebook actually quotes. */
    if (typeof testCase.expect.error_type === "string") {
      const got = selections.correction?.errorType ?? "none";
      if (got !== testCase.expect.error_type) {
        failures.push(
          `TYPE  ${testCase.id} · expected ${testCase.expect.error_type}, got ${got}`,
        );
      }
    }

    if (typeof testCase.expect.vocabulary_term === "string") {
      const want = testCase.expect.vocabulary_term.toLowerCase();
      const got = selections.vocabulary?.term.toLowerCase() ?? "none";
      if (!got.includes(want) && !want.includes(got)) {
        failures.push(
          `TERM  ${testCase.id} · expected "${testCase.expect.vocabulary_term}", got "${selections.vocabulary?.term ?? "none"}"`,
        );
      }
    }

    /* The escape the unpaired classifier previously did not have. A correct
       sentence must be answered "no error", not assigned the nearest one. */
    if (typeof testCase.expect.learner_error_type === "string") {
      const got = selections.learnerError?.errorType ?? "no_error";
      if (got !== testCase.expect.learner_error_type) {
        failures.push(
          `LERR  ${testCase.id} · expected ${testCase.expect.learner_error_type}, got ${got}`,
        );
      }
    }

    /* Which sentence of a multi-sentence turn gets quoted. */
    for (const key of ["goal_sentence", "practice_sentence"] as const) {
      const want = testCase.expect[key];
      if (typeof want !== "string") continue;
      const got =
        (key === "goal_sentence" ? selections.goal : selections.practice) ?? "none";
      if (got.toLowerCase().trim() !== want.toLowerCase().trim()) {
        failures.push(`SPAN  ${testCase.id} · ${key} expected "${want}", got "${got}"`);
      }
    }
  }

  console.log("\nSignal                    recall  precision   n");
  console.log("-".repeat(52));
  for (const key of SIGNAL_KEYS) {
    const t = tallies.get(key)!;
    const positives = t.truePositive + t.falseNegative;
    const fired = t.truePositive + t.falsePositive;
    const n = positives + t.trueNegative + t.falsePositive;
    console.log(
      `${key.padEnd(24)} ${rate(t.truePositive, positives)}      ${rate(t.truePositive, fired)}  ${String(n).padStart(3)}`,
    );
  }

  /* What a turn costs, which is half of what "is the note-taker any good?"
     means. A notebook that is right and four sentences behind is not keeping a
     lesson's notes; it is writing them up afterwards. */
  if (durations.length > 0) {
    const sorted = [...durations].sort((a, b) => a - b);
    const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
    console.log(
      `\nPer turn: p50 ${at(0.5)}ms · p95 ${at(0.95)}ms · slowest ${sorted[sorted.length - 1]}ms`,
    );
  }

  if (lowConfidence.length > 0) {
    console.log(`\nIn the tentative band (${TENTATIVE_THRESHOLD}-${CONFIRM_THRESHOLD}):`);
    for (const line of lowConfidence) console.log(`  ${line}`);
  }

  console.log(`\n${failures.length} failure${failures.length === 1 ? "" : "s"}`);
  for (const line of failures) console.log(`  ${line}`);

  process.exit(failures.length === 0 ? 0 : 1);
}

void main();
