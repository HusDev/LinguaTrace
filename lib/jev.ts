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
 *    instead of five.
 * 3. A turn is one round trip. The selections used to be a second pass, made
 *    after the judgments and justified here as needing their answers. They did
 *    not: every candidate list is enumerated in code from the transcript, so
 *    nothing about them waits on a judgment, and the judgments decide only
 *    which selections the notebook goes on to read. They are asked
 *    speculatively, with their premises stated, and sent alongside pass 1
 *    rather than after it. They stay a separate request because pass 1's state
 *    is small and clean and adding candidate maps to it would cost accuracy on
 *    the gate. The only thing that genuinely needs a prior answer is the
 *    vocabulary gloss, which needs to know which word was chosen.
 */

import {
  type JsonValue,
  type Question,
  TypeSafeClient,
  choice,
  noul,
  score,
} from "@typesafe-ai/sdk";
import {
  ASR_ARTEFACT_THRESHOLD,
  LESSON_SPEECH_THRESHOLD,
  type ErrorType,
  type Speaker,
  type Turn,
} from "./types";

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
 *
 * It lives in `types.ts` because the transcript shows it too, and re-exported
 * here because this is where it is applied.
 */
export { ASR_ARTEFACT_THRESHOLD, LESSON_SPEECH_THRESHOLD } from "./types";

/**
 * How long one turn may spend being judged, across every request it makes.
 *
 * The SDK's `timeout` is per attempt and it says so plainly: "there is no total
 * retry budget". With the default two retries and a doubling backoff, a single
 * call could occupy some twenty-five seconds, and a turn could make several of
 * them one after another - so a lesson could run minutes ahead of its notebook
 * with nothing in the logs to say why. The deadline below is the whole budget
 * for a turn, passed as one `AbortSignal` that cancels pending retries too.
 */
export const TURN_DEADLINE_MS = 6000;

/** Per-attempt timeout. Well inside the deadline, so a retry can still land. */
const ATTEMPT_TIMEOUT_MS = 4000;

let client: TypeSafeClient | null = null;

export function jevClient(): TypeSafeClient {
  if (!client) {
    client = new TypeSafeClient({
      // Keep the key server-side. This module is only imported by route handlers.
      apiKey: process.env.TYPESAFE_API_KEY,
      timeout: ATTEMPT_TIMEOUT_MS,
      /* One retry, quickly. A judgment that has already failed twice inside the
         turn's deadline is not going to succeed on a third attempt in time to
         be worth showing. */
      retry: { maxRetries: 1, backoffInitialMs: 250, backoffMaxMs: 1000 },
    });
  }
  return client;
}

/** The deadline for one turn's judgments, shared by every request it makes. */
export interface JudgeOptions {
  signal?: AbortSignal;
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

/**
 * Is this the learner's sentence, or the recogniser's?
 *
 * The notebook's worst failure is writing a language error the learner never
 * made, and on a live call the commonest way that happens is not a bad judgment
 * - it is a bad transcript. A mis-heard word arrives looking exactly like a
 * lexical error, and nothing in the question set had any way to tell the two
 * apart, so the recogniser's mistakes were filed as the learner's.
 *
 * Asked as a plain positive question with both outcomes described, rather than
 * as "is this not a real error": indirection and double negatives are on the
 * short list of things this model answers less reliably.
 */
const ASR_ARTEFACT = noul(
  "Does the current turn read as a speech recogniser's mistake rather than as words the speaker chose - an invented or garbled word, a word that does not fit the sentence at all, or a fragment that breaks off mid-word?",
  {
    true: "The text contains something no speaker would have produced: a word that does not exist in the language at all, such as 'delisherous' or 'brumber'; a real word that makes no sense where it sits; a stammered doubling like 'the the'; or a sentence that stops part-way through a word.",
    false: "Every word is a real word used somewhere it could belong. Ordinary learner errors count as false here - a wrong tense, a missing article, a wrongly chosen but real word, an unfinished thought, hesitation, and informal speech are all things people actually say.",
  },
);

/** A turn must be addressed to the lesson and not be about the app. */
const TOOL_TALK_THRESHOLD = 0.5;



const learnerQuestions = {
  is_lesson_speech: LESSON_SPEECH,
  is_about_the_tool: ABOUT_THE_TOOL,
  is_asr_artefact: ASR_ARTEFACT,
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
    "In the current turn, is the tutor changing something the learner just said into a different, correct form? Count a direct recast such as repeating the sentence with the error fixed, and count an explicit rewrite.",
    {
      true: "The tutor gives back the learner's words with something changed, so that what the tutor says differs from what the learner said.",
      false: "Nothing is changed. The tutor is asking, explaining, praising, or moving on - and repeating the learner's sentence back unchanged, to confirm it or approve of it, is not a correction, because there was nothing in it to correct.",
    },
  ),
  introduces_vocabulary: noul(
    "In the current turn, does the tutor give the learner a word or fixed expression to keep and reuse - defining what it means, or offering it as the better word for something?",
    {
      true: "A word or expression is handed over as vocabulary, with its meaning or its use: 'to draw a blank means your mind goes empty', 'the word you want is landlord'.",
      false: "No word is being handed over. In particular: words quoted while explaining a rule are examples of the grammar, not vocabulary - 'go becomes went', 'we use well for how something happened, and good for describing a thing', 'after I we use had'. Nor is swapping a word the learner got wrong for the right one - 'took a photo, not made a photo' - which is a correction of that sentence, not an expression handed over to keep and reuse. Ordinary conversation is not vocabulary either.",
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
  /** How much the turn reads as a recogniser artefact rather than speech. */
  isAsrArtefact: number;
  containsError: number;
  isCorrection: number;
  introducesVocabulary: number;
  isGrammarExplanation: number;
  flagsPracticeNeed: number;
  statesGoal: number;
}

const NO_SIGNALS: TurnSignals = {
  isLessonSpeech: 0,
  isAsrArtefact: 0,
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
  options: JudgeOptions = {},
): Promise<TurnSignals> {
  const state = stateFor(turn, context);

  if (turn.speaker === "learner") {
    const { answers } = await jevClient().systemOne(
      { state, questions: learnerQuestions },
      { signal: options.signal },
    );
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
    /* A garbled transcript is still lesson speech - it belongs in the
       transcript and the learner should see it - but it is not evidence that
       the learner said anything wrong, so the error signal alone is withheld. */
    const artefact = answers.is_asr_artefact.noul;
    return {
      ...NO_SIGNALS,
      isLessonSpeech: lessonSpeech,
      isAsrArtefact: artefact,
      containsError:
        artefact >= ASR_ARTEFACT_THRESHOLD ? 0 : answers.contains_error.noul,
      statesGoal: answers.states_goal.noul,
    };
  }

  const { answers } = await jevClient().systemOne(
    { state, questions: tutorQuestions },
    { signal: options.signal },
  );
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
    isCorrection: answers.is_correction.noul,
    introducesVocabulary: answers.introduces_vocabulary.noul,
    isGrammarExplanation: answers.is_grammar_explanation.noul,
    flagsPracticeNeed: answers.flags_practice_need.noul,
    statesGoal: answers.states_goal.noul,
  };
}

/* ------------------------------------------------------------------ *
 * Pass 2 - which spans of the transcript the notebook should quote
 *
 * This used to be several requests, made one after another, and justified in
 * this file's header as needing pass 1's answer to build their state. That was
 * not true of any of them. Every candidate list below is enumerated in code
 * from the transcript alone - sentence spans, vocabulary spans - so none of it
 * waits on a judgment. Pass 1's answers decide only whether the application
 * *consumes* a selection, which is the speculative fan-out the model's own
 * guidance describes: state the premise in the question, ask it up front, and
 * let the caller ignore the branches that did not fire.
 *
 * So the two passes are now two requests sent together rather than in sequence,
 * and a turn costs one round trip instead of up to five. They stay two requests
 * rather than one because the judgments in pass 1 read a small, clean state,
 * and accuracy falls as a state grows with material irrelevant to the question
 * being asked - the candidate maps below would be exactly that.
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

/**
 * The same taxonomy, plus the answer the unpaired classifier was never allowed
 * to give.
 *
 * Asked to name the error in a sentence, a model with only error types to
 * choose from names one, because naming one is the only thing it can do. The
 * unpaired classifier runs on every learner turn that scores as low as 0.45 for
 * containing an error at all - the tentative band - so without an escape it
 * turned every hesitant "maybe" into a typed, quoted mistake in the learner's
 * notebook.
 *
 * The paired taxonomy above keeps no escape on purpose: there, the tutor
 * visibly corrected something, so "no error" is not one of the possibilities.
 */
const UNPAIRED_ERROR_TYPE_CRITERIA = {
  ...ERROR_TYPE_CRITERIA,
  no_error:
    "The sentence is correct as it stands, or is only informal, elliptical, or accented in a way a tutor would let pass. Judged in context: a short answer that is correct as a reply to the previous turn is not an error.",
} as const;

const SEVERITY_LEVELS = [
  "Fully understandable; the error is cosmetic and a listener would not stumble.",
  "Understandable, but the error is noticeable and marks the speaker as non-fluent.",
  "The listener could genuinely misunderstand the meaning, or has to ask again.",
] as const;

/**
 * How concentrated a Choice distribution must be for its pick to be quoted.
 *
 * Deliberately not `CONFIRM_THRESHOLD` or `TENTATIVE_THRESHOLD`. Those are
 * probabilities from Nouls - the chance the answer is yes. A Choice confidence
 * is a different quantity on a different scale: how concentrated the
 * distribution over the options is, which falls simply because there are more
 * options to spread across. Twenty-four vocabulary candidates make a confident
 * pick look numerically unsure next to a three-way choice that means less.
 *
 * The model's own guidance is explicit that results from Nouls and Choices are
 * not comparable and that thresholds must not be carried between them. So this
 * gates only whether a selected span is safe to quote; whether the entry is
 * written, and which band it is shown in, stays with the calibrated Noul that
 * decided the entry exists at all.
 */
export const CHOICE_FLOOR = 0.3;

/** The same floor, for choosing a narrower sentence over quoting the turn. */
const STATEMENT_PICK_FLOOR = 0.45;

export interface CorrectionPairing {
  corrected?: string;
  original?: string;
  errorType: ErrorType;
  severity: number;
  /** The calibrated probability that a correction happened at all. */
  confidence: number;
  /** How concentrated the span picks were. A floor, not a band. */
  spanConfidence: number;
}

export interface VocabSelection {
  term: string;
  confidence: number;
}

/** Everything the notebook might quote from this turn, asked in one request. */
export interface TurnSelections {
  correction?: CorrectionPairing;
  vocabulary?: VocabSelection;
  /** The error in an uncorrected learner sentence, or null for "no error". */
  learnerError?: { errorType: ErrorType; severity: number } | null;
  goal?: string;
  practice?: string;
}

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

/**
 * The learner turns a tutor correction could plausibly be fixing.
 *
 * Exported because the notebook needs the very same set: a correction may only
 * be attached to a mistake drawn from a turn the model was actually shown, and
 * the two lists drifting apart is how a correction ends up stapled to something
 * the tutor was not talking about.
 */
export function pairingWindow(turns: Turn[], beforeIndex: number, take = 3): Turn[] {
  const out: Turn[] = [];
  for (let i = beforeIndex - 1; i >= 0 && out.length < take; i -= 1) {
    if (turns[i].speaker === "learner") out.unshift(turns[i]);
  }
  return out;
}

/**
 * Ask, speculatively, everything this turn might need quoted.
 *
 * Each question states its own premise, because they are asked before anything
 * has confirmed that the premise holds - and each keeps a "none of these"
 * escape, so a question asked on a false premise has an answer to give that is
 * not a wrong quotation. The caller reads only the branches its pass-1 signals
 * cleared.
 */
export async function selectSpans(
  turn: Turn,
  context: ReturnType<typeof contextWindow>,
  recentLearnerTurns: Turn[],
  options: JudgeOptions = {},
): Promise<TurnSelections> {
  const turnSentences = sentences(turn.text);
  const sentenceCriteria = labelled(turnSentences, "s");

  /* A single-sentence turn is already as narrow as a quote can get, so the
     narrowing questions are not worth asking. */
  const wantStatements = turnSentences.length >= 2;

  /* Both maps are assembled at runtime from what this turn actually offers, so
     neither shape is statically known the way the pass-1 question sets are. */
  const questions: Record<string, Question> = {};
  const state: Record<string, JsonValue> = {
    lesson: "One-to-one English conversation lesson between a tutor and a learner.",
    earlier_turns: context,
    current_turn: { speaker: turn.speaker, text: turn.text },
  };

  if (wantStatements) {
    state.sentences_of_current_turn = sentenceCriteria;
    questions.goal = choice(
      "Suppose a goal for the learner's study is stated in the current turn. Which sentence states what the learner is working towards - the goal, target, or reason they are studying?",
      sentenceCriteria,
    );
    questions.practice = choice(
      "Suppose the current turn names something for the learner to work on. Which sentence names the thing they should practise, work on, or come back to later?",
      sentenceCriteria,
    );
  }

  const learnerCandidates = recentLearnerTurns.flatMap((t) => sentences(t.text));

  if (turn.speaker === "learner") {
    questions.learner_error_type = choice(
      "What kind of language error, if any, does the learner's current turn contain? Judge it against the earlier turns: a short or elliptical answer that is correct as a reply is not an error. If it contains more than one, choose the most prominent.",
      UNPAIRED_ERROR_TYPE_CRITERIA,
    );
    questions.learner_severity = score(
      "Suppose the learner's current turn contains a language error. How much does it get in the way of being understood by an ordinary listener?",
      SEVERITY_LEVELS,
    );
  } else {
    const vocabCandidates = vocabularyCandidates(turn.text);
    if (vocabCandidates.length > 0) {
      state.vocabulary_candidates = Object.fromEntries(
        vocabCandidates.map((c, i) => [`v${i}`, c]),
      );
      questions.term = choice(
        "Suppose the tutor is teaching one word or fixed expression in this turn. Which candidate is the item being taught - the thing the learner should write on a flashcard? Prefer the fullest form of the expression over a single word from inside it.",
        labelled(vocabCandidates, "v"),
      );
    }

    if (turnSentences.length > 0 && learnerCandidates.length > 0) {
      state.learner_candidates = Object.fromEntries(
        learnerCandidates.map((t, i) => [`o${i}`, t]),
      );
      if (!wantStatements) state.sentences_of_current_turn = sentenceCriteria;
      /* A companion question to the two span picks, and the one the notebook
         bands on. The span picks answer "which words"; their confidence is a
         concentration over candidates, not a probability that a correction
         happened. This asks that directly, and is calibrated. */
      questions.correction_present = noul(
        "Does the tutor's current turn restate, in corrected form, something the learner said in the spans shown?",
        {
          true: "The tutor gives back one of the learner's sentences with an error fixed.",
          false: "The tutor is asking, explaining, praising, or moving on without restating a corrected form of anything shown.",
        },
      );
      questions.corrected_form = choice(
        "Suppose the tutor is correcting the learner. Which span of the tutor's turn is the corrected sentence itself - the words the learner should now say?",
        sentenceCriteria,
      );
      questions.original_form = choice(
        "Suppose the tutor is correcting the learner. Which of the learner's earlier spans is the incorrect one that was just corrected?",
        labelled(learnerCandidates, "o"),
      );
      questions.error_type = choice(
        "Suppose the tutor corrected a language error in this turn. What kind of error was it? If the learner made more than one kind, choose the one the tutor's change most centrally fixes.",
        ERROR_TYPE_CRITERIA,
      );
      questions.correction_severity = score(
        "Suppose the tutor corrected an error the learner made. How much did that original error get in the way of being understood by an ordinary listener?",
        SEVERITY_LEVELS,
      );
    }
  }

  if (Object.keys(questions).length === 0) return {};

  const { answers } = await jevClient().systemOne(
    { state, questions },
    { signal: options.signal },
  );

  const answerFor = (key: string) =>
    (answers as Record<string, { type: string; choice?: string; confidence?: number; noul?: number; score?: number } | undefined>)[key];

  /** Resolve a choice answer back to the span it names, if it is safe to quote. */
  const span = (key: string, candidates: string[], floor: number) => {
    const answer = answerFor(key);
    if (!answer || answer.type !== "choice" || !answer.choice) return undefined;
    if (answer.choice === NONE) return undefined;
    if ((answer.confidence ?? 0) < floor) return undefined;
    return candidates[Number(answer.choice.slice(1))];
  };

  const selections: TurnSelections = {
    goal: span("goal", turnSentences, STATEMENT_PICK_FLOOR),
    practice: span("practice", turnSentences, STATEMENT_PICK_FLOOR),
  };

  if (turn.speaker === "learner") {
    const typed = answerFor("learner_error_type");
    const chosen = typed?.type === "choice" ? typed.choice : undefined;
    selections.learnerError =
      !chosen || chosen === "no_error"
        ? null
        : {
            errorType: chosen as ErrorType,
            severity: answerFor("learner_severity")?.score ?? 1,
          };
    return selections;
  }

  const term = span("term", vocabularyCandidates(turn.text), CHOICE_FLOOR);
  if (term) {
    selections.vocabulary = {
      term,
      confidence: answerFor("term")?.confidence ?? 0,
    };
  }

  const present = answerFor("correction_present");
  if (present?.type === "noul") {
    const corrected = span("corrected_form", turnSentences, CHOICE_FLOOR);
    const original = span("original_form", learnerCandidates, CHOICE_FLOOR);
    selections.correction = {
      corrected,
      original,
      errorType: (answerFor("error_type")?.choice ?? "other") as ErrorType,
      severity: answerFor("correction_severity")?.score ?? 1,
      confidence: present.noul ?? 0,
      spanConfidence: Math.min(
        answerFor("corrected_form")?.confidence ?? 0,
        answerFor("original_form")?.confidence ?? 0,
      ),
    };
  }

  return selections;
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
