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
import type { TurnSelections, TurnSignals } from "../lib/jev";
import {
  MAX_TOTAL_HOLD_MS,
  continuesTurn,
  holdFor,
  joinFragments,
} from "../lib/transcriptMerge";
import {
  type CaptureMessage,
  createDecoder,
  encode,
  isEmpty,
  mergeChanges,
} from "../lib/boardSync";
import { buildLessonPack } from "../lib/lessonPack";
import { type Judge, isEcho, openMistake, processTurn, similarity } from "../lib/notebook";
import { emptyNotebook, type Notebook, type Turn } from "../lib/types";

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

console.log("\nisEcho()");
/* Two microphones in one room hear both people, so the same sentence arrives
   twice under different names. Observed on a live call. */
const heard = {
  ...emptyNotebook("lesson-e", "Hussein", "Mark"),
  turns: [
    {
      id: "a",
      speaker: "learner" as const,
      text: "Yesterday I go to office for a big meeting.",
      at: 1_000,
    },
  ],
};
check(
  "the same sentence from the other microphone is an echo",
  isEcho(heard, {
    id: "b",
    speaker: "tutor",
    text: "Yesterday I go to office for a big meeting.",
    at: 3_000,
  }),
);
check(
  "punctuation and case do not hide an echo",
  isEcho(heard, {
    id: "c",
    speaker: "tutor",
    text: "yesterday i go to office for a big meeting",
    at: 3_000,
  }),
);
check(
  "the same words much later are said again, not echoed",
  !isEcho(heard, {
    id: "d",
    speaker: "tutor",
    text: "Yesterday I go to office for a big meeting.",
    at: 400_000,
  }),
);
check(
  "a different sentence is not an echo",
  !isEcho(heard, {
    id: "e",
    speaker: "tutor",
    text: "Yesterday I went to the office.",
    at: 3_000,
  }),
);
check(
  "a short reply is left alone",
  !isEcho(
    { ...heard, turns: [{ id: "a", speaker: "learner", text: "Yes.", at: 1_000 }] },
    { id: "f", speaker: "tutor", text: "Yes.", at: 2_000 },
  ),
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

console.log("\nsharing a capture");
/* A picture is far past the 8KB a signal carries, so it goes in pieces and is
   rebuilt on the other side - the same envelope the whiteboard already used. A
   capture that stayed in the browser that took it was the whole bug: the tutor
   drew on the board, watched the learner tape it in, and never saw the note. */
const picture = `data:image/jpeg;base64,${"Q".repeat(60_000)}`;
const capturePieces = encode({
  kind: "capture",
  from: "sender",
  capture: { id: "cap-1", dataUrl: picture, kind: "whiteboard" },
});
check("a picture is split to fit a signal", capturePieces.length > 1, String(capturePieces.length));
check(
  "and every piece is under the 8KB a signal carries",
  capturePieces.every((piece) => piece.length < 8_000),
);

const captureDecoder = createDecoder<CaptureMessage>();
const rebuiltCaptures = capturePieces
  .map((piece) => captureDecoder(piece))
  .filter((m): m is CaptureMessage => m !== null);
check("nothing is handed on until the last piece lands", rebuiltCaptures.length === 1);
check(
  "and the picture survives the trip intact",
  rebuiltCaptures[0]?.kind === "capture" &&
    rebuiltCaptures[0].capture.dataUrl === picture,
);

/* Two people can tape something in at the same moment, so the pieces of one
   message interleave with the other's. */
const other = encode({
  kind: "capture",
  from: "peer",
  capture: { id: "cap-2", dataUrl: `data:image/jpeg;base64,${"Z".repeat(60_000)}`, kind: "camera" },
});
const mixed = createDecoder<CaptureMessage>();
const results: CaptureMessage[] = [];
for (let i = 0; i < Math.max(capturePieces.length, other.length); i += 1) {
  for (const piece of [capturePieces[i], other[i]]) {
    if (!piece) continue;
    const done = mixed(piece);
    if (done) results.push(done);
  }
}
check("two captures in flight at once are kept apart", results.length === 2);
check(
  "and neither picks up the other's pieces",
  results.every(
    (m) => m.kind === "capture" && new Set(m.capture.dataUrl.slice(23)).size === 1,
  ),
);

console.log("\ntwo transcripts of one utterance");
/* The echo check used to demand identical text. The two copies come from two
   transcription sessions listening to two different audio paths, so they agree
   on the words and differ on a filler - and both were written up. */
const nearMiss = {
  ...emptyNotebook("lesson-n", "Ana", "Mark"),
  turns: [
    {
      id: "n1",
      speaker: "learner" as const,
      text: "Yesterday I go to the office for a big meeting.",
      at: 1_000,
    },
  ],
};
check(
  "the same sentence transcribed two ways is still an echo",
  isEcho(nearMiss, {
    id: "n2",
    speaker: "tutor",
    text: "Yesterday I go to the office for a big meeting, um.",
    at: 3_000,
  }),
  String(
    similarity(
      "Yesterday I go to the office for a big meeting.",
      "Yesterday I go to the office for a big meeting, um.",
    ),
  ),
);
check(
  "a learner repeating the tutor is drilling, not echoing",
  !isEcho(
    {
      ...emptyNotebook("lesson-d", "Ana", "Mark"),
      turns: [
        {
          id: "d1",
          speaker: "tutor" as const,
          text: "Yesterday I went to the office for a big meeting with my manager.",
          at: 1_000,
        },
      ],
    },
    { id: "d2", speaker: "learner", text: "Yesterday I went.", at: 3_000 },
  ),
);
check(
  "one speaker saying the same thing twice is repetition",
  !isEcho(
    {
      ...emptyNotebook("lesson-r", "Ana", "Mark"),
      turns: [
        {
          id: "r1",
          speaker: "learner" as const,
          text: "I would like to practise the past tense today.",
          at: 1_000,
        },
      ],
    },
    {
      id: "r2",
      speaker: "learner",
      text: "I would like to practise the past tense today.",
      at: 3_000,
    },
  ),
);

console.log("\nopenMistake()");
/* A correction may only land on a mistake the pairing question could see. The
   old fallback took the newest uncorrected mistake anywhere in the notebook and
   overwrote its text, so a learner could read a sentence they never said. */
const withMistakes: Notebook = {
  ...emptyNotebook("lesson-m", "Ana", "Mark"),
  mistakes: [
    {
      id: "old",
      said: "I have went there last year.",
      errorType: "verb_tense",
      severity: 2,
      provenance: { turnIds: ["t-old"], score: 0.9, certainty: "confirmed" },
    },
    {
      id: "recent",
      said: "Yesterday I go to the office.",
      errorType: "verb_tense",
      severity: 2,
      provenance: { turnIds: ["t-recent"], score: 0.9, certainty: "confirmed" },
    },
  ],
};
check(
  "matches the mistake the tutor actually quoted",
  openMistake(withMistakes, new Set(["t-recent"]), "Yesterday I go to the office.")?.id ===
    "recent",
);
check(
  "never reaches a mistake outside the window the model was shown",
  /* The quoted sentence belongs to a turn the pairing question could not see.
     Nothing eligible matches it, so there is no target - which is the point.
     Returning the nearest open mistake instead is how a correction ends up
     rewriting a sentence the tutor was not talking about. */
  openMistake(withMistakes, new Set(["t-recent"]), "I have went there last year.") ===
    undefined,
);
check(
  "finds nothing when no eligible mistake is open",
  openMistake(withMistakes, new Set(["t-unrelated"]), "anything") === undefined,
);

console.log("\nholdFor()");
check(
  "a finished sentence is held briefly",
  holdFor("I went to the office.") === 1400,
);
check(
  "a fragment is held longer, waiting for the rest",
  holdFor("I went to the") === 7000,
);
check(
  "a run that keeps going is still flushed at the ceiling",
  holdFor("and then I went to the", MAX_TOTAL_HOLD_MS - 500) === 500,
);
check(
  "a run past the ceiling flushes immediately",
  holdFor("and then I went to the", MAX_TOTAL_HOLD_MS + 1000) === 0,
);

/* The policy checks are async, and this file compiles as CommonJS, so they
   live in a function rather than at the top level. */
async function policyChecks() {
  console.log("\nprocessTurn() policy");
  /* The policy layer is where the mistakes that reach the learner's page are
     made, and it used to be untestable because every branch sat behind a live
     call. These use a stand-in judge and no network. */
  const NO_SIGNALS: TurnSignals = {
    isLessonSpeech: 1,
    isAsrArtefact: 0,
    containsError: 0,
    isCorrection: 0,
    introducesVocabulary: 0,
    isGrammarExplanation: 0,
    flagsPracticeNeed: 0,
    statesGoal: 0,
  };

  function judgeReturning(
    signals: Partial<TurnSignals>,
    selections: TurnSelections = {},
  ): Judge {
    return {
      classifyTurn: async () => ({ ...NO_SIGNALS, ...signals }),
      selectSpans: async () => selections,
      translateTerm: async () => null,
    };
  }

  const learnerTurn: Turn = {
    id: "t1",
    speaker: "learner",
    text: "Yesterday I go to the office.",
    at: 1_000,
  };

  {
    const notebook = emptyNotebook("lesson-p1", "Ana", "Mark");
    await processTurn(notebook, learnerTurn, {
      judge: judgeReturning(
        { containsError: 0.6 },
        { learnerError: { errorType: "verb_tense", severity: 2 } },
      ),
    });
    check(
      "a typed learner error is written up",
      notebook.mistakes.length === 1 && notebook.mistakes[0].errorType === "verb_tense",
    );
  }

  {
    const notebook = emptyNotebook("lesson-p2", "Ana", "Mark");
    await processTurn(notebook, learnerTurn, {
      /* The sentence scraped past the tentative floor and the classifier then
         said there was no error in it. Before it had that option it had to name
         one, and the learner read a mistake they had not made. */
      judge: judgeReturning({ containsError: 0.6 }, { learnerError: null }),
    });
    check("no error means no mistake entry", notebook.mistakes.length === 0);
  }

  {
    const notebook = emptyNotebook("lesson-p3", "Ana", "Mark");
    await processTurn(notebook, learnerTurn, {
      judge: judgeReturning({ containsError: 0.9, isAsrArtefact: 0.8 }),
    });
    check(
      "a garbled transcript is not an accusation",
      notebook.mistakes.length === 0,
    );
  }

  {
    /* A tutor correcting something never flagged must create its own entry, not
       repaint an unrelated older one. */
    const notebook: Notebook = {
      ...emptyNotebook("lesson-p4", "Ana", "Mark"),
      turns: [{ id: "old-turn", speaker: "learner", text: "I have went there.", at: 0 }],
      mistakes: [
        {
          id: "stale",
          said: "I have went there.",
          errorType: "verb_tense",
          severity: 2,
          provenance: { turnIds: ["old-turn"], score: 0.9, certainty: "confirmed" },
        },
      ],
    };
    await processTurn(
      notebook,
      { id: "t2", speaker: "tutor", text: "We say on Monday, not in Monday.", at: 60_000 },
      {
        judge: judgeReturning(
          { isCorrection: 0.9 },
          {
            correction: {
              corrected: "We say on Monday, not in Monday.",
              original: "I went in Monday.",
              errorType: "preposition",
              severity: 1,
              confidence: 0.9,
              spanConfidence: 0.8,
            },
          },
        ),
      },
    );
    check(
      "an unrelated open mistake is left alone",
      notebook.mistakes[0].said === "I have went there." &&
        notebook.mistakes[0].corrected === undefined,
    );
    check(
      "the tutor's correction gets its own entry",
      notebook.mistakes.length === 2 && notebook.mistakes[1].said === "I went in Monday.",
    );
  }

  {
    const notebook = emptyNotebook("lesson-p5", "Ana", "Mark");
    const slow: Judge = {
        /* Never answers, so the turn's own deadline is what ends it - the real
         path, rather than a stand-in for it. */
      classifyTurn: (_t, _c, o) =>
        new Promise((_resolve, reject) => {
          /* `AbortSignal.timeout` arms an unref'd timer, so on its own it will
             not hold the event loop open and this process would exit before the
             deadline fired. A server always has a request in flight to hold it;
             a test has to say so. */
          const keepAlive = setTimeout(() => reject(new Error("never aborted")), 2_000);
          o?.signal?.addEventListener("abort", () => {
            clearTimeout(keepAlive);
            reject(new Error("aborted"));
          });
        }),
      selectSpans: async () => ({}),
      translateTerm: async () => null,
    };
    const result = await processTurn(notebook, learnerTurn, {
      judge: slow,
      deadlineMs: 20,
    });
    check("a turn that could not be judged says so", result.signals.timedOut === 1);
    check("and writes nothing", notebook.mistakes.length === 0);
    check("but stays in the transcript", notebook.turns.length === 1);
  }

  {
    const notebook = emptyNotebook("lesson-p7", "Ana", "Mark");
    const broken: Judge = {
      classifyTurn: async () => {
        throw new Error("TYPESAFE_API_KEY is not set");
      },
      selectSpans: async () => ({}),
      translateTerm: async () => null,
    };
    let reported = "";
    try {
      await processTurn(notebook, learnerTurn, { judge: broken });
    } catch (error) {
      reported = error instanceof Error ? error.message : String(error);
    }
    /* A misconfigured key is not slowness. Reporting it as "not judged in time"
       would leave someone waiting on a lesson that can never be judged at all. */
    check(
      "a real failure is reported, not disguised as a timeout",
      reported === "TYPESAFE_API_KEY is not set",
      reported,
    );
  }

  {
    const notebook = emptyNotebook("lesson-p6", "Ana", "Mark");
    let resolveGloss: (value: string | null) => void = () => {};
    const judge: Judge = {
      classifyTurn: async () => ({ ...NO_SIGNALS, introducesVocabulary: 0.9 }),
      selectSpans: async () => ({ vocabulary: { term: "to draw a blank", confidence: 0.8 } }),
      translateTerm: () => new Promise((resolve) => { resolveGloss = resolve; }),
    };
    await processTurn(
      notebook,
      { id: "t3", speaker: "tutor", text: "To draw a blank means your mind goes empty.", at: 0 },
      { judge, languages: { native: "Spanish", target: "English" } },
    );
    /* The word is on the page before the dictionary has answered. Waiting on a
       second provider to gloss a word the tutor already said aloud made a slow
       lookup into a slow notebook. */
    check(
      "the word is written before its gloss arrives",
      notebook.vocabulary.length === 1 && notebook.vocabulary[0].translation === undefined,
    );
    resolveGloss("quedarse en blanco");
    await new Promise((r) => setTimeout(r, 0));
    check(
      "and the gloss fills in behind it",
      notebook.vocabulary[0].translation === "quedarse en blanco",
    );
  }
}

void policyChecks().then(() => {
  console.log(`\n${failed === 0 ? "all offline checks passed" : `${failed} failed`}\n`);
  process.exit(failed === 0 ? 0 : 1);
});
