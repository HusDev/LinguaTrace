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
  CONFIRM_THRESHOLD,
  LESSON_SPEECH_THRESHOLD,
  TENTATIVE_THRESHOLD,
  classifyTurn,
  jevConfigured,
  pairCorrection,
  selectVocabulary,
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
  contains_error: "containsError",
  is_correction: "isCorrection",
  introduces_vocabulary: "introducesVocabulary",
  is_grammar_explanation: "isGrammarExplanation",
  flags_practice_need: "flagsPracticeNeed",
  states_goal: "statesGoal",
};

/* Each signal is scored at the threshold the application actually uses, so a
   pass here means the shipped behaviour is right - not merely that the number
   leaned the correct way. */
const THRESHOLD: Partial<Record<SignalKey, number>> = {
  is_lesson_speech: LESSON_SPEECH_THRESHOLD,
};

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

  for (const testCase of dataset.cases) {
    const turn: Turn = {
      id: testCase.id,
      speaker: testCase.turn.speaker,
      text: testCase.turn.text,
      at: 0,
    };

    const signals = (await classifyTurn(turn, testCase.context)) as unknown as Record<
      string,
      number
    >;

    for (const key of SIGNAL_KEYS) {
      const expected = testCase.expect[key];
      if (typeof expected !== "boolean") continue;

      const probability = signals[SIGNAL_FIELD[key]] ?? 0;
      const fired = probability >= (THRESHOLD[key] ?? CONFIRM_THRESHOLD);
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

    /* Second-pass checks: the pairing and the term selection, where they matter. */
    if (typeof testCase.expect.error_type === "string") {
      const pairing = await pairCorrection(turn, [
        {
          id: `${testCase.id}-ctx`,
          speaker: "learner",
          text: testCase.context.map((c) => c.text).join(" "),
          at: 0,
        },
      ]);
      const got = pairing?.errorType ?? "none";
      if (got !== testCase.expect.error_type) {
        failures.push(
          `TYPE  ${testCase.id} · expected ${testCase.expect.error_type}, got ${got}`,
        );
      }
    }

    if (typeof testCase.expect.vocabulary_term === "string") {
      const picked = await selectVocabulary(turn);
      const want = testCase.expect.vocabulary_term.toLowerCase();
      const got = picked?.term.toLowerCase() ?? "none";
      if (!got.includes(want) && !want.includes(got)) {
        failures.push(
          `TERM  ${testCase.id} · expected "${testCase.expect.vocabulary_term}", got "${picked?.term ?? "none"}"`,
        );
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

  if (lowConfidence.length > 0) {
    console.log(`\nIn the tentative band (${TENTATIVE_THRESHOLD}-${CONFIRM_THRESHOLD}):`);
    for (const line of lowConfidence) console.log(`  ${line}`);
  }

  console.log(`\n${failures.length} failure${failures.length === 1 ? "" : "s"}`);
  for (const line of failures) console.log(`  ${line}`);

  process.exit(failures.length === 0 ? 0 : 1);
}

void main();
