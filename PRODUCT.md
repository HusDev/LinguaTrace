# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two people in the same one-to-one language lesson, on separate devices, each
needing a different thing from the same forty minutes.

- **The tutor** — an independent language teacher running the lesson, usually on
  their own laptop, in their own video room rather than a marketplace. Mid-lesson
  they need to know what they have not yet dealt with, while they can still deal
  with it. They are also the buyer.
- **The learner** — practising speaking in a language they do not yet command.
  Their hands and attention belong to the conversation, not to a notepad. Their
  need is after the lesson: something to practise from that is built out of
  what they personally got wrong.

A third audience, for the landing page only: **competition judges**, who arrive
once, skim, watch a 21-second video, and decide. They are evaluating, not
adopting.

## Product Purpose

LinguaTrace listens to a live one-to-one language lesson and writes the lesson
notebook, so neither person has to. During the call it answers the tutor's
question — what is still outstanding. After it, it turns the lesson into a
Lesson Pack the learner revises from: flashcards and gap-fills built from the
sentences they personally got wrong.

Success is a learner who practises the right thing a week later, and a tutor who
does not spend unpaid evenings writing summaries.

Capture is the means, not the point. Review is the product.

## Positioning

**The notebook cannot contain a sentence nobody said.** Every line is selected,
not generated: code enumerates candidate spans out of the real transcript and
the model only picks one. Competitors generate the notes and then filter the
output — Preply's own engineering write-up describes adding LLM-as-judge review
to catch its AI's mistakes before display. LinguaTrace prevents the failure by
construction rather than screening for it afterwards.

Second, **it shows what it is unsure of.** Judgments are calibrated
probabilities, so a note above 0.75 is written plainly, one between 0.45 and
0.75 is written and marked *unsure*, and below that it is dropped. No competitor
surfaces uncertainty to the learner.

Third, **speakers are not inferred.** Each device transcribes its own
microphone, so attribution is structural rather than a diarisation model's
guess.

## Operating Context

A live video call between two people on two devices, often in different
countries, sometimes in the same room. Headphones or a mute are required when
both machines are in one room, because each transcribes its own microphone.

The tutor starts the lesson and shares an invite link; the learner opens it and
joins. A shared whiteboard sits beside the call, and a snapshot of it can be
taped into the notes. Afterwards the lesson is kept and can be reopened and
revised from weeks later.

## Capabilities and Constraints

- Live video and a shared whiteboard, scoped to the lesson by construction.
- Per-device speech transcription; only finalised utterances are judged.
- One round trip of judgments per turn, under a single deadline.
- A reconciliation pass when the lesson ends, re-pairing corrections against the
  whole transcript.
- A Lesson Pack: summary, corrected sentences, flashcards, gap-fills built by
  diffing the learner's sentence against the tutor's, and a practice checklist.
- Stored lesson history and a per-learner weakness profile across lessons.
- **The app never teaches.** Drills are fixed per error type rather than
  generated; the tutor is a human and nothing in the app may substitute for one.
- **Nothing in the notebook is generated**, with one marked exception: the
  vocabulary gloss, because a translation cannot be quoted from a lesson.
- English-calibrated. The gate's thresholds were tuned on English and have not
  been validated on other languages.
- No accounts model beyond sign-in; a lesson URL is "anyone with the link".
- Undecided: pricing, business model, and whether the product is sold to tutors,
  to learners, or to schools.

## Brand Commitments

- Name: **LinguaTrace**. Tagline in use: *"The lesson notebook that writes
  itself."* Product subtitle: *"Live lesson companion."*
- **Two surfaces, deliberately unalike** — a dark desk that holds the live call,
  and a sheet of cream ruled paper that holds the lesson. The contrast is the
  argument: the call is disposable, the page is what the learner keeps. The
  design is fixed rather than following system light/dark preference.
- The mark is a ruled page with punch holes and a red margin rule, a sentence
  struck out in red and the correction under it in green (`components/Logo.tsx`,
  `app/icon.svg`).
- Voice: plain, specific, unhyped. States what it does and what it does not
  know. Never "AI-powered", never "revolutionise".

## Evidence on Hand

- **Demo video**, 21 seconds, public:
  https://www.youtube.com/watch?v=wdozDzfWJfc — "LinguaTrace: the lesson
  notebook that writes itself". Poster frame at `public/og.jpg`.
- **An evaluation harness with a labelled dataset** — `eval/run.ts`,
  `eval/dataset.json`. 45 labelled cases across 8 signals, scored at the
  thresholds the app actually uses, reporting misses and false positives
  separately. Latest run: 100% recall and precision on all 8 signals, 0
  failures. **The sample size must always be stated with the figures.**
- **Measured latency**: p50 ~310ms per judged turn, p95 ~850ms, measured over
  the scripted lesson.
- 91 offline and storage checks (`npm test`).
- Working app deployed on Fly; repository at https://github.com/HusDev/LinguaTrace.
- **Absences future work must not fabricate:** no users, no customers, no
  testimonials, no press, no revenue, no pricing, no benchmark against
  competitors beyond their published claims. The evaluation set is small and
  written by the author.

## Product Principles

1. **Jev judges, code writes.** The model answers typed questions and returns
   calibrated probabilities; the application assembles the page from spans found
   in the real transcript. Any feature that would generate notebook text is out.
2. **Say what is not known.** Uncertainty is shown, not hidden, and silence is
   never left indistinguishable from failure — every turn carries an outcome,
   including the ones that produced nothing.
3. **Review is the product; capture is the means.** The lesson is kept so it can
   be practised from, not so it can be archived.
4. **Each person gets the question they can act on.** The tutor's is live; the
   learner's is afterwards.
5. **The app never teaches.** It records, judges, and assembles. Instruction
   stays with the human tutor.

## Accessibility & Inclusion

- Learners are, by definition, operating in a language they do not command, and
  many are accented. Copy stays plain; the app must not treat an accent or a
  mis-transcription as a learner's error.
- `prefers-reduced-motion` is already honoured for the handwriting animation and
  must stay honoured by anything new.
