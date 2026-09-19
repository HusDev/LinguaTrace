/**
 * The Jev question set: every judgment LinguaTrace asks a System One model to make.
 *
 * Two rules shape this file.
 *
 * 1. Jev judges, code writes. Jev never generates notebook text. When we need a
 *    phrase for a flashcard or a corrected sentence, code enumerates candidate
 *    spans from the actual transcript and Jev *selects* one. Nothing reaches the
 *    notebook that the tutor or learner did not say.
 * 2. Independent questions go in one request. Questions over the same state
 *    cannot see each other's answers, so batching them costs one round trip
 *    instead of five. A second request is only justified when we need an earlier
 *    answer to build new state - which is exactly what correction pairing needs.
 */

import {
  type ChoiceQuestion,
  TypeSafeClient,
  choice,
  noul,
  score,
} from "@typesafe-ai/sdk";
import type { ErrorType, Speaker, Turn } from "./types";

/** Above this, an inferred entry is written as confirmed. */
export const CONFIRM_THRESHOLD = 0.75;
/** Between this and CONFIRM_THRESHOLD, it is written but marked tentative. */
export const TENTATIVE_THRESHOLD = 0.45;

/**
 * How sure we must be that a turn is lesson content before judging it at all.
 *
 * Higher than the tentative floor on purpose, because the two mistakes are not
 * equal. Dropping a real lesson turn loses one note the learner can live
 * without. Admitting an aside about the software writes a language error into
 * the learner's notebook that they never made - and in solo practice, where no
 * tutor replies to contradict it, that false accusation is the whole page.
 *
 * The number is calibrated, not guessed: a real aside observed on a live call,
 * "so there's this is I don't know why it says that it's wrong", scores 0.45 and
 * is kept out by this bar but not by the tentative floor. It is in the
 * evaluation set as `meta-commentary-is-not-lesson-speech`.
 */
export const LESSON_SPEECH_THRESHOLD = 0.6;

let client: TypeSafeClient | null = null;

export function jevClient(): TypeSafeClient {
  if (!client) {
    client = new TypeSafeClient({
      // Keep the key server-side. This module is only imported by route handlers.
      apiKey: process.env.TYPESAFE_API_KEY,
      timeout: 8000,
    });
  }
  return client;
}

export function jevConfigured(): boolean {
  return Boolean(process.env.TYPESAFE_API_KEY);
}

/**
 * The few turns before the one being judged.
 *
 * A correction only makes sense against what came before it, and "it" or "that
 * one" in a tutor turn resolves against the learner's last line. Four turns is
 * enough for both without paying for the whole lesson on every request.
 */
export function contextWindow(turns: Turn[], index: number, size = 4) {
  return turns.slice(Math.max(0, index - size), index).map((t) => ({
    speaker: t.speaker,
    text: t.text,
  }));
}

function stateFor(turn: Turn, context: ReturnType<typeof contextWindow>) {
  return {
    lesson: "One-to-one English conversation lesson between a tutor and a learner.",
    earlier_turns: context,
    current_turn: { speaker: turn.speaker, text: turn.text },
  };
}

/* ------------------------------------------------------------------ *
 * Pass 1 - what kind of learning moment is this turn?
 * ------------------------------------------------------------------ */

/**
 * The gate, as two narrow questions rather than one broad one.
 *
 * It began as a single "is this part of the lesson?", which conflated two
 * different judgements and got both wrong by turns. Asked that way it judged the
 * *topic*: a learner describing their job in a speaking lesson scored 0.36 alone
 * and 0.69 once a tutor turn preceded it, so whether their practice was recorded
 * depended on the conversation around it. Rewording it to ask about the
 * addressee fixed that but collapsed the other side - an aside about the app
 * rose to 0.61 against genuine work talk at 0.72, a margin too thin to threshold.
 *
 * So they are separated. One asks whether this is someone talking to the other
 * person in the lesson, on any subject. The other asks whether they are talking
 * about this tool. A turn has to pass the first and fail the second, and each
 * question is narrow enough to answer well.
 */
const LESSON_SPEECH = noul(
  "Is this person speaking to the other participant in the lesson? The subject matter does not matter at all - work, travel, family, or anything else is ordinary lesson conversation. Judge only whether they are addressing the other person.",
  {
    true: "Addressed to the other person in the lesson: practising, describing something, answering, asking, teaching, or making conversation, on any topic whatsoever.",
    false: "Not addressed to them: speaking to somebody else in the room, thinking out loud to nobody, or a stray noise that is not an attempt to say anything.",
  },
);

const ABOUT_THE_TOOL = noul(
  "Is the speaker talking about the transcription app itself, or the equipment - what the screen or the notes are showing, whether the software is right or wrong, whether it is recording or hearing them, or testing a microphone or camera?",
  {
    true: "They are commenting on the app, its notes or output, or the recording setup: 'why does it say that is wrong', 'is it picking me up', 'testing, testing', 'it is not writing anything'.",
    false: "They are speaking the language or teaching it, whatever the subject - including talking about their own work, software they build, or a screen they are sharing with the other person.",
  },
);

/** A turn must be addressed to the lesson and not be about the app. */
const TOOL_TALK_THRESHOLD = 0.5;

const learnerQuestions = {
  is_lesson_speech: LESSON_SPEECH,
  is_about_the_tool: ABOUT_THE_TOOL,
  contains_error: noul(
    "Does the learner's current turn contain a language error that a tutor would correct - wrong tense, word order, preposition, article, agreement, plural, or a clearly wrong word choice?",
    {
      true: "The utterance has a concrete grammatical or lexical error.",
      false: "The utterance is correct, or only informal or accented in a way tutors let pass.",
    },
  ),
  states_goal: noul(
    "In the current turn, does the learner say what they want to achieve in their learning - an exam, a trip, a work situation, a skill they want?",
    {
      true: "The learner states a learning goal or the reason they are studying.",
      false: "The learner is just conversing, answering, or practising.",
    },
  ),
} as const;

const tutorQuestions = {
  is_lesson_speech: LESSON_SPEECH,
  is_about_the_tool: ABOUT_THE_TOOL,
  is_correction: noul(
    "In the current turn, is the tutor restating something the learner just said in its correct form? Count a direct recast such as repeating the sentence fixed, and count an explicit rewrite.",
    {
      true: "The tutor gives the corrected version of the learner's words.",
      false: "The tutor is asking, explaining, praising, or moving on without restating a corrected form.",
    },
  ),
  introduces_vocabulary: noul(
    "In the current turn, does the tutor give the learner a word or fixed expression to keep and reuse - defining what it means, or offering it as the better word for something?",
    {
      true: "A word or expression is handed over as vocabulary, with its meaning or its use: 'to draw a blank means your mind goes empty', 'the word you want is landlord'.",
      false: "No word is being handed over. In particular, words quoted while explaining a rule are examples of the grammar, not vocabulary: 'go becomes went', 'we use well for how something happened, and good for describing a thing', 'after I we use had'. Ordinary conversation is not vocabulary either.",
    },
  ),
  is_grammar_explanation: noul(
    "In the current turn, does the tutor explain how a rule of the language works, rather than only fixing one sentence?",
    {
      true: "The tutor states a rule, pattern, or contrast that generalises beyond this one sentence.",
      false: "No rule is explained.",
    },
  ),
  flags_practice_need: noul(
    "In the current turn, does the tutor name a specific thing the learner should go away and practise - a skill, a tense, a topic, or an exercise to do before next time?",
    {
      true: "A particular area to work on is named, such as 'keep working on past tenses' or 'practise describing your week out loud'.",
      false: "No specific area is named. Encouragement about practice in general - 'it will come with practice', 'keep going', 'that takes time' - is not naming anything to work on, and neither is explaining or correcting.",
    },
  ),
  states_goal: noul(
    "In the current turn, is a goal for the learner's study being set or restated - what they are working towards?",
    {
      true: "A learning goal or target is stated.",
      false: "No goal is stated.",
    },
  ),
} as const;

/**
 * Collapse the two gate questions into the one number the app acts on.
 *
 * Talking about the tool disqualifies a turn outright rather than being averaged
 * away, so a confident "this is about the app" closes the gate even when the
 * speech was clearly addressed to the other person - which, for someone
 * demonstrating the app to their tutor, it usually is.
 */
function gateValue(addressed: number, aboutTool: number): number {
  return aboutTool >= TOOL_TALK_THRESHOLD ? Math.min(addressed, 1 - aboutTool) : addressed;
}

export interface TurnSignals {
  /** Whether the turn is lesson content at all. Everything else is gated on it. */
  isLessonSpeech: number;
  containsError: number;
  isCorrection: number;
  introducesVocabulary: number;
  isGrammarExplanation: number;
  flagsPracticeNeed: number;
  statesGoal: number;
}

const NO_SIGNALS: TurnSignals = {
  isLessonSpeech: 0,
  containsError: 0,
  isCorrection: 0,
  introducesVocabulary: 0,
  isGrammarExplanation: 0,
  flagsPracticeNeed: 0,
  statesGoal: 0,
};

/** Judge one turn. One request, all independent questions batched. */
export async function classifyTurn(
  turn: Turn,
  context: ReturnType<typeof contextWindow>,
): Promise<TurnSignals> {
  const state = stateFor(turn, context);

  if (turn.speaker === "learner") {
    const { answers } = await jevClient().systemOne({
      state,
      questions: learnerQuestions,
    });
    /* Everything downstream is gated on this being lesson speech. Someone
       saying "I don't know why it says that's wrong" is talking about the app,
       not making a language error, and must not be written up as one. */
    const lessonSpeech = gateValue(
      answers.is_lesson_speech.noul,
      answers.is_about_the_tool.noul,
    );
    if (lessonSpeech < LESSON_SPEECH_THRESHOLD) {
      return { ...NO_SIGNALS, isLessonSpeech: lessonSpeech };
    }
    return {
      ...NO_SIGNALS,
      isLessonSpeech: lessonSpeech,
      containsError: answers.contains_error.noul,
      statesGoal: answers.states_goal.noul,
    };
  }

  const { answers } = await jevClient().systemOne({
    state,
    questions: tutorQuestions,
  });
  const lessonSpeech = gateValue(
    answers.is_lesson_speech.noul,
    answers.is_about_the_tool.noul,
  );
  if (lessonSpeech < LESSON_SPEECH_THRESHOLD) {
    return { ...NO_SIGNALS, isLessonSpeech: lessonSpeech };
  }
  return {
    isLessonSpeech: lessonSpeech,
    containsError: 0,
    isCorrection: answers.is_correction.noul,
    introducesVocabulary: answers.introduces_vocabulary.noul,
    isGrammarExplanation: answers.is_grammar_explanation.noul,
    flagsPracticeNeed: answers.flags_practice_need.noul,
    statesGoal: answers.states_goal.noul,
  };
}

/* ------------------------------------------------------------------ *
 * Pass 2a - pair a correction to the utterance it fixes
 * ------------------------------------------------------------------ */

/** Split a turn into sentence-ish spans, which become selectable candidates. */
export function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1);
}

const NONE = "none" as const;

function labelled(items: string[], prefix: string) {
  const criteria: Record<string, string> = {};
  items.forEach((text, i) => {
    criteria[`${prefix}${i}`] = text;
  });
  criteria[NONE] = "None of these.";
  return criteria;
}

export interface CorrectionPairing {
  corrected?: string;
  original?: string;
  errorType: ErrorType;
  severity: number;
  confidence: number;
}

/**
 * Given a tutor turn believed to be a correction, work out what it corrected.
 *
 * The candidate spans are built here, in code, from the real transcript. Jev
 * only picks among them, so a "corrected sentence" is always something the
 * tutor actually uttered.
 */
export async function pairCorrection(
  tutorTurn: Turn,
  recentLearnerTurns: Turn[],
): Promise<CorrectionPairing | null> {
  const correctedCandidates = sentences(tutorTurn.text);
  const originalCandidates = recentLearnerTurns.flatMap((t) => sentences(t.text));
  if (correctedCandidates.length === 0 || originalCandidates.length === 0) return null;

  const questions = {
    corrected_form: choice(
      "The tutor is correcting the learner. Which span of the tutor's turn is the corrected sentence itself - the words the learner should now say?",
      labelled(correctedCandidates, "c"),
    ),
    original_form: choice(
      "Which of the learner's earlier spans is the incorrect one that the tutor just corrected?",
      labelled(originalCandidates, "o"),
    ),
    error_type: choice(
      "What kind of language error did the tutor correct? If the learner made more than one kind of error in the sentence, choose the one the tutor's change most centrally fixes.",
      ERROR_TYPE_CRITERIA,
    ),
    severity: score(
      "How much does the learner's original error get in the way of being understood by an ordinary listener?",
      SEVERITY_LEVELS,
    ),
  } as const;

  const { answers } = await jevClient().systemOne({
    state: {
      learner_candidates: Object.fromEntries(
        originalCandidates.map((t, i) => [`o${i}`, t]),
      ),
      tutor_turn: tutorTurn.text,
      tutor_candidates: Object.fromEntries(
        correctedCandidates.map((t, i) => [`c${i}`, t]),
      ),
    },
    questions,
  });

  const correctedKey = answers.corrected_form.choice;
  const originalKey = answers.original_form.choice;

  return {
    corrected:
      correctedKey === NONE
        ? undefined
        : correctedCandidates[Number(correctedKey.slice(1))],
    original:
      originalKey === NONE
        ? undefined
        : originalCandidates[Number(originalKey.slice(1))],
    errorType: answers.error_type.choice as ErrorType,
    severity: answers.severity.score,
    // The pairing is only as good as its weakest half.
    confidence: Math.min(
      answers.corrected_form.confidence,
      answers.original_form.confidence,
    ),
  };
}

/** The error taxonomy, shared by the paired and unpaired classifiers. */
const ERROR_TYPE_CRITERIA = {
  verb_tense: "Wrong tense or verb form, such as 'I go' for 'I went'.",
  word_order: "Words in the wrong order for the language.",
  preposition: "Wrong or missing preposition, such as 'in Monday'.",
  article: "Wrong or missing article, such as a missing 'the'.",
  word_choice: "A real word used with the wrong meaning for the context.",
  agreement: "Subject and verb do not agree, such as 'he go'.",
  plural_form: "Wrong singular or plural form, such as 'two childs'.",
  other: "A language error that none of the other options describes.",
} as const;

const SEVERITY_LEVELS = [
  "Fully understandable; the error is cosmetic and a listener would not stumble.",
  "Understandable, but the error is noticeable and marks the speaker as non-fluent.",
  "The listener could genuinely misunderstand the meaning, or has to ask again.",
] as const;

/**
 * Name the error in a learner sentence the tutor has not corrected.
 *
 * Solo practice produces mistakes with no correction to pair against. Without
 * this they all land in the "other" bucket and the notebook's heading reads
 * "Focus: Other", which tells the learner nothing.
 */
export async function classifyLearnerError(
  turn: Turn,
): Promise<{ errorType: ErrorType; severity: number } | null> {
  const { answers } = await jevClient().systemOne({
    state: { learner_sentence: turn.text },
    questions: {
      error_type: choice(
        "What kind of language error does this learner sentence contain? If it contains more than one, choose the most prominent.",
        ERROR_TYPE_CRITERIA,
      ),
      severity: score(
        "How much does the error get in the way of being understood by an ordinary listener?",
        SEVERITY_LEVELS,
      ),
    } as const,
  });

  return {
    errorType: answers.error_type.choice as ErrorType,
    severity: answers.severity.score,
  };
}

/* ------------------------------------------------------------------ *
 * Pass 2b - which word was actually being taught?
 * ------------------------------------------------------------------ */

const STOPWORDS = new Set(
  ("a an the and or but so if then than that this these those there here is are was were be been being am do does did done have has had " +
    "i you he she it we they me him her us them my your his its our their you're we're i'm it's don't doesn't didn't can can't could would " +
    "should will shall may might must of in on at to for with from by about as into like through after over between out up down off again " +
    "very really just also too now when where how what which who whom why not no yes okay ok well say says said mean means good great nice " +
    "use used using word words say saying").split(" "),
);

/**
 * Candidate terms the tutor might be teaching: quoted spans first, then content
 * words and adjacent pairs. Jev cannot select a term we failed to offer, so this
 * errs towards offering more.
 */
export function vocabularyCandidates(text: string, limit = 24): string[] {
  const found: string[] = [];
  const push = (v: string) => {
    const t = v.trim().replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "");
    if (t.length > 1 && !found.some((f) => f.toLowerCase() === t.toLowerCase())) {
      found.push(t);
    }
  };

  for (const m of text.matchAll(/["'“‘]([^"'”’]{2,40})["'”’]/g)) {
    push(m[1]);
  }

  const words = text.split(/\s+/).map((w) => w.replace(/[^\p{L}\p{M}'-]/gu, ""));
  const content = words
    .map((w, i) => ({ w, i }))
    .filter(({ w }) => w.length > 2 && !STOPWORDS.has(w.toLowerCase()));

  /* Phrases first, longest first: "to draw a blank" is the thing being taught,
     and if only "blank" is offered then "blank" is all the model can choose.
     Runs are built from the original word order so they read as real phrases,
     and may pass through short function words that sit inside an expression. */
  const INNER = new Set(["a", "an", "the", "to", "of", "in", "on", "up", "out", "off", "back"]);
  for (let length = 4; length >= 2; length -= 1) {
    for (let i = 0; i + length <= words.length; i += 1) {
      const run = words.slice(i, i + length);
      if (run.some((w) => w.length === 0)) continue;
      const first = run[0].toLowerCase();
      const last = run[run.length - 1].toLowerCase();
      // A phrase should not start or end on a function word.
      if (STOPWORDS.has(last) && !INNER.has(last)) continue;
      if (STOPWORDS.has(first) && !INNER.has(first)) continue;
      if (!run.some((w) => w.length > 2 && !STOPWORDS.has(w.toLowerCase()))) continue;
      push(run.join(" "));
    }
  }
  for (const { w } of content) push(w);

  return found.slice(0, limit);
}

export interface VocabSelection {
  term: string;
  confidence: number;
}

export async function selectVocabulary(
  tutorTurn: Turn,
): Promise<VocabSelection | null> {
  const candidates = vocabularyCandidates(tutorTurn.text);
  if (candidates.length === 0) return null;

  const { answers } = await jevClient().systemOne({
    state: {
      tutor_turn: tutorTurn.text,
      candidates: Object.fromEntries(candidates.map((c, i) => [`v${i}`, c])),
    },
    questions: {
      term: choice(
        "The tutor is teaching one word or fixed expression in this turn. Which candidate is the item being taught - the thing the learner should write on a flashcard? Prefer the fullest form of the expression over a single word from inside it.",
        labelled(candidates, "v"),
      ),
    } as const,
  });

  const key = answers.term.choice;
  if (key === NONE) return null;
  return {
    term: candidates[Number(key.slice(1))],
    confidence: answers.term.confidence,
  };
}

/* ------------------------------------------------------------------ *
 * Pass 2c - which sentence actually states the goal?
 * ------------------------------------------------------------------ */

/**
 * Narrow a turn to the sentence that states a goal or a practice need.
 *
 * "It went well. Thank you. I want to speak more confidently in meetings."
 * states a goal in its last sentence only; quoting the whole turn puts two
 * sentences of small talk in the notebook. As everywhere else the candidates
 * come from the transcript, and the model only selects among them.
 *
 * Both questions go in one request because they are independent, and the caller
 * asks only for the ones its pass-1 signals actually fired.
 */
export async function selectStatements(
  turn: Turn,
  want: { goal: boolean; practice: boolean },
): Promise<{ goal?: string; practice?: string }> {
  const candidates = sentences(turn.text);
  // A single-sentence turn is already as narrow as it can get.
  if (candidates.length < 2) return {};

  const criteria = labelled(candidates, "s");
  const questions: Record<string, ChoiceQuestion> = {};
  if (want.goal) {
    questions.goal = choice(
      "Which sentence states what the learner is working towards - the goal, target, or reason they are studying?",
      criteria,
    );
  }
  if (want.practice) {
    questions.practice = choice(
      "Which sentence names something the learner should practise, work on, or come back to later?",
      criteria,
    );
  }
  if (Object.keys(questions).length === 0) return {};

  const { answers } = await jevClient().systemOne({ state: { turn: turn.text, candidates: criteria }, questions });

  const pick = (key: string) => {
    const answer = answers[key];
    if (!answer || answer.type !== "choice" || answer.choice === NONE) return undefined;
    // A shaky pick is worse than the full quote, which is at least complete.
    if (answer.confidence < TENTATIVE_THRESHOLD) return undefined;
    return candidates[Number(answer.choice.slice(1))];
  };

  return { goal: pick("goal"), practice: pick("practice") };
}


/**
 * The sentence a term appeared in, for the back of the flashcard.
 *
 * A sentence that is merely the term again teaches nothing - a tutor who says
 * "A busy week. We say 'a busy week' with the article." would otherwise give
 * the gloss "a busy week - A busy week." The longest sentence containing the
 * term is the one carrying the explanation, so prefer that and fall back to the
 * whole turn when no sentence adds anything.
 */
export function contextSentence(text: string, term: string): string {
  const normalise = (s: string) =>
    s.toLowerCase().replace(/[^\p{L}\p{M}\s]/gu, "").trim();
  const wanted = normalise(term);

  const containing = sentences(text)
    .filter((s) => s.toLowerCase().includes(term.toLowerCase()))
    .filter((s) => normalise(s) !== wanted)
    .sort((a, b) => b.length - a.length);

  return containing[0] ?? text;
}

export function certaintyFor(score: number): "confirmed" | "tentative" | null {
  if (score >= CONFIRM_THRESHOLD) return "confirmed";
  if (score >= TENTATIVE_THRESHOLD) return "tentative";
  return null;
}

export type { Speaker };
