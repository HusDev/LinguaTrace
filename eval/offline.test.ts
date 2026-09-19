/**
 * Offline checks for the parts that must work without the model.
 *
 * Exercise generation, candidate enumeration and pack assembly are ordinary
 * code, so they get ordinary tests. If a gap-fill blanks the wrong word, that
 * is a bug here and no amount of model quality hides it.
 *
 * Run with:  npx tsx eval/offline.test.ts
 */

import { contextSentence, sentences, vocabularyCandidates } from "../lib/jev";
import { continuesTurn, holdFor, joinFragments } from "../lib/transcriptMerge";
import { createDecoder, encode, isEmpty, mergeChanges } from "../lib/boardSync";
import { buildLessonPack } from "../lib/lessonPack";
import { emptyNotebook, type Notebook } from "../lib/types";

let failed = 0;

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${name}${detail ? ` - ${detail}` : ""}`);
  }
}

console.log("\nsentences()");
check(
  "splits on terminators",
  sentences("Yesterday I went. It was fine.").length === 2,
);
check("drops empty spans", sentences("   ").length === 0);

console.log("\nvocabularyCandidates()");
const candidates = vocabularyCandidates(
  "There is a useful expression: 'to draw a blank'. It means your mind goes empty.",
);
check(
  "offers the quoted expression",
  candidates.some((c) => c.toLowerCase().includes("draw a blank")),
  candidates.join(" | "),
);
check(
  "drops stopwords as standalone candidates",
  !candidates.includes("the") && !candidates.includes("is"),
);

console.log("\nboardSync()");
/* A signal carries at most 8KB. A stroke never approaches that; a whole board
   does, so large messages are split and have to come back out whole. */
const smallParts = encode({ kind: "hello", from: "abc" });
check("a small message travels in one piece", smallParts.length === 1);
check(
  "and every piece fits in a signal",
  smallParts.every((p) => p.length < 8192),
);

const big = {
  kind: "snapshot" as const,
  from: "abc",
  snapshot: { shapes: Array.from({ length: 400 }, (_, i) => ({ id: `shape:${i}`, text: "x".repeat(60) })) },
};
const bigParts = encode(big);
check("a whole board is split", bigParts.length > 1, `${bigParts.length} parts`);
check(
  "no piece exceeds the signal limit",
  bigParts.every((p) => p.length < 8192),
  `largest ${Math.max(...bigParts.map((p) => p.length))}`,
);

const decode = createDecoder();
const rebuilt = bigParts.map((p) => decode(p)).filter(Boolean);
check("nothing is delivered until the last piece", rebuilt.length === 1);
check(
  "and it rebuilds exactly",
  JSON.stringify(rebuilt[0]) === JSON.stringify(big),
);

/* Two messages can be in flight at once, and their pieces interleave. */
const decode2 = createDecoder();
const a = encode({ kind: "snapshot", from: "a", snapshot: { pad: "a".repeat(9000) } });
const b = encode({ kind: "snapshot", from: "b", snapshot: { pad: "b".repeat(9000) } });
const interleaved: unknown[] = [];
for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
  if (a[i]) interleaved.push(decode2(a[i]));
  if (b[i]) interleaved.push(decode2(b[i]));
}
const done = interleaved.filter(Boolean) as Array<{ from: string }>;
check(
  "interleaved messages do not corrupt each other",
  done.length === 2 && new Set(done.map((m) => m.from)).size === 2,
  JSON.stringify(done.map((m) => m.from)),
);
check("rubbish is ignored rather than thrown", decode2("not json") === null);

/* One stroke emits an update per pointer move, so they are folded together
   before being sent. */
check("an empty batch is recognised", isEmpty(mergeChanges({}, {})));
const folded = mergeChanges(
  mergeChanges({}, { added: { "shape:1": { v: 1 } } }),
  { updated: { "shape:1": [{ v: 1 }, { v: 2 }] } },
);
check(
  "an update to something just added stays an addition",
  JSON.stringify(folded.added?.["shape:1"]) === JSON.stringify({ v: 2 }) &&
    Object.keys(folded.updated ?? {}).length === 0,
  JSON.stringify(folded),
);
const undone = mergeChanges(folded, { removed: { "shape:1": { v: 2 } } });
check(
  "something drawn then deleted is not sent as an addition",
  Object.keys(undone.added ?? {}).length === 0 &&
    Object.keys(undone.removed ?? {}).length === 1,
  JSON.stringify(undone),
);

console.log("\ntranscriptMerge()");
/* Voice activity detection splits a sentence at a breath. These are the real
   fragments from an end-to-end run of an eighteen-turn lesson. */
check(
  "joins a fragment that does not finish its sentence",
  continuesTurn("It is the most common thing learners", "slip on, and it will come"),
);
check(
  "joins a lower-case continuation after a full stop",
  continuesTurn("Last month I had three presentations.", "and all of them were stressful."),
);
check(
  "starts a new turn at a finished sentence followed by a capital",
  !continuesTurn("Well done.", "Tell me about the meeting."),
);
/* One window for both cases merged nothing in a real run: the speaker's pause is
   shorter than the model's finalisation latency. */
check(
  "waits much longer on a sentence that was cut off",
  holdFor("It is the most common thing learners") > holdFor("Well done."),
);
check(
  "joins with exactly one space",
  joinFragments("It is the most common thing learners", "slip on") ===
    "It is the most common thing learners slip on",
);

console.log("\nvocabularyCandidates() - phrases");
const spoken = vocabularyCandidates(
  "There is a useful expression for that moment, to draw a blank. It means your mind goes empty.",
);
/* Speech has no quotation marks, so a multi-word expression has to be offered as
   a phrase or the model can only pick a single word out of it. */
check(
  "offers the whole expression, not just its last word",
  spoken.some((c) => c.toLowerCase() === "draw a blank" || c.toLowerCase() === "to draw a blank"),
  spoken.slice(0, 8).join(" | "),
);
check(
  "ranks the phrase above the bare word",
  spoken.findIndex((c) => /draw a blank/i.test(c)) <
    spoken.findIndex((c) => c.toLowerCase() === "blank"),
);

console.log("\ncontextSentence()");
/* A gloss that merely repeats the term teaches nothing: the tutor turn
   "A busy week. We say 'a busy week' with the article 'a'." must not produce
   "a busy week - A busy week." */
check(
  "skips a sentence that is only the term again",
  contextSentence(
    "A busy week. We say 'a busy week' - with the article 'a' before it.",
    "a busy week",
  ).includes("article"),
);
check(
  "falls back to the whole turn when no sentence adds anything",
  contextSentence("A busy week.", "a busy week") === "A busy week.",
);

console.log("\nbuildLessonPack()");
const notebook: Notebook = {
  ...emptyNotebook("lesson-1", "Ana", "Mark"),
  turns: [
    { id: "t0", speaker: "learner", text: "Yesterday I go to the office.", at: 0 },
    { id: "t1", speaker: "tutor", text: "Yesterday I went to the office.", at: 1 },
  ],
  mistakes: [
    {
      id: "m1",
      said: "Yesterday I go to the office.",
      corrected: "Yesterday I went to the office.",
      errorType: "verb_tense",
      severity: 1,
      provenance: { turnIds: ["t0"], score: 0.9, certainty: "confirmed" },
      correctionProvenance: {
        turnIds: ["t1"],
        score: 0.88,
        certainty: "confirmed",
      },
    },
    {
      id: "m2",
      said: "it finished good",
      corrected: "it went well",
      errorType: "word_choice",
      severity: 1,
      provenance: { turnIds: ["t2"], score: 0.8, certainty: "confirmed" },
    },
  ],
  vocabulary: [
    {
      id: "v1",
      term: "draw a blank",
      context: "It means your mind goes empty.",
      provenance: { turnIds: ["t3"], score: 0.9, certainty: "confirmed" },
    },
  ],
};

const pack = buildLessonPack(notebook);

check("keeps both corrected sentences", pack.correctedSentences.length === 2);
check("makes one flashcard per term", pack.flashcards.length === 1);
check("generates an exercise per correction", pack.exercises.length === 2);

const tenseExercise = pack.exercises[0];
check(
  "blanks the word the correction changed",
  tenseExercise.answer.toLowerCase() === "went",
  `answer was "${tenseExercise.answer}"`,
);
check(
  "the gap-fill prompt hides the answer",
  tenseExercise.prompt.includes("_____") &&
    !tenseExercise.prompt.toLowerCase().includes("went"),
  tenseExercise.prompt,
);
check(
  "the hint quotes what the learner said",
  tenseExercise.hint.includes("Yesterday I go to the office."),
);
check(
  "checklist groups by error type, not per mistake",
  pack.checklist.length === 2,
);

/* A mispaired correction must not become an exercise. This was a real failure:
   with a bad pairing, the gap-fill blanked the first word of an unrelated
   sentence and produced an exercise that taught nothing. */
const mispaired: Notebook = {
  ...emptyNotebook("lesson-2", "Ana", "Mark"),
  mistakes: [
    {
      id: "bad",
      said: "Hello Mark.",
      corrected: "Yesterday I went to the office.",
      errorType: "verb_tense",
      severity: 1,
      provenance: { turnIds: ["t0"], score: 0.9, certainty: "confirmed" },
    },
  ],
};
check(
  "drops an exercise built from a mispaired correction",
  buildLessonPack(mispaired).exercises.length === 0,
);
check(
  "keeps a short recast that echoes part of a longer sentence",
  buildLessonPack({
    ...emptyNotebook("lesson-4", "Ana", "Mark"),
    mistakes: [
      {
        id: "recast",
        said: "It was busy week, a lot of meetings.",
        corrected: "A busy week.",
        errorType: "article",
        severity: 1,
        provenance: { turnIds: ["t0"], score: 0.9, certainty: "confirmed" },
      },
    ],
  }).exercises[0]?.answer === "A",
);
check(
  "keeps a short correction that changed most of its words",
  buildLessonPack({
    ...emptyNotebook("lesson-3", "Ana", "Mark"),
    mistakes: [
      {
        id: "short",
        said: "it finished good",
        corrected: "it went well",
        errorType: "word_choice",
        severity: 1,
        provenance: { turnIds: ["t0"], score: 0.9, certainty: "confirmed" },
      },
    ],
  }).exercises[0]?.answer === "went",
);

console.log("\nprogress comparison");
const previous: Notebook = {
  ...emptyNotebook("lesson-0", "Ana", "Mark"),
  mistakes: [
    {
      id: "p1",
      said: "I go yesterday",
      corrected: "I went yesterday",
      errorType: "verb_tense",
      severity: 1,
      provenance: { turnIds: ["x"], score: 0.9, certainty: "confirmed" },
    },
    {
      id: "p2",
      said: "in Monday",
      corrected: "on Monday",
      errorType: "preposition",
      severity: 1,
      provenance: { turnIds: ["y"], score: 0.9, certainty: "confirmed" },
    },
  ],
};
const withProgress = buildLessonPack(notebook, previous);
check(
  "reports a resolved error type",
  withProgress.progress?.resolvedErrorTypes.includes("Prepositions") === true,
  JSON.stringify(withProgress.progress),
);
check(
  "reports a persistent error type",
  withProgress.progress?.persistentErrorTypes.includes("Verb tense") === true,
);

console.log(`\n${failed === 0 ? "all offline checks passed" : `${failed} failed`}\n`);
process.exit(failed === 0 ? 0 : 1);
