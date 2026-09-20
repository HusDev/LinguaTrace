# LinguaTrace

An intelligent lesson notebook. During a one-to-one language lesson it listens to
the conversation, writes down what was actually taught, and turns the call into
something the learner can practise from afterwards - this week, and the week
after that.

Nobody writes anything during the call. That is the means, not the point.

## What it looks like

**[Watch the 21-second demo](brag-output/brag.mp4)** — download it from GitHub to
play; the source composition that renders it is beside it.

![The lesson notebook filling in as a lesson runs](docs/screenshots/lesson-notebook.jpg)

A live lesson. The call is on the left with the running transcript, each turn
labelled with what the classifier made of it. The notebook on the right writes
itself: corrections struck through and rewritten, vocabulary glossed into the
learner's own language, the tutor's explanation underlined. The mistake at the
bottom has no correction yet, so it is a pencil note rather than a verdict.

### The tutor sees a different question answered

![The tutor view: uncorrected mistakes, recurring weaknesses, and a suggested drill](docs/screenshots/tutor-view.jpg)

The learner's notebook answers "what did I learn?". The tutor needs "what have I
not dealt with yet?" - a mistake still outstanding, what has been recurring for
five lessons, and one concrete thing to do about it. All of it was already
computed; none of it was visible to the person who could act on it.

### Every lesson, kept

![The learner home, showing lessons and which weaknesses recur](docs/screenshots/learner-home.jpg)

"Verb tense, five lessons running" is a claim no in-memory app could make. So is
"prepositions, not seen for four lessons", which is the more encouraging half.

![A saved lesson, reopened later](docs/screenshots/lesson-record.jpg)

A lesson is a page you can reopen, not a file you never will - and it opens on
**Revise**, not on the notes. The flashcards and the gap-fills are there, built
from what that lesson actually corrected, however long ago it was.

That was the part most worth keeping and the only part the app used to throw
away. The pack was assembled when a lesson ended and rendered in the live call,
and nowhere else: close the tab and the exercises were gone, while the notes
they came from were safe in the database. Nothing needed storing to fix it,
because `buildLessonPack` is code over the notebook - it only ever needed asking
for somewhere other than the call.

### The whiteboard is a working surface

![A whiteboard drawing taped into the notebook](docs/screenshots/whiteboard-capture.jpg)

Tutors draw. A snapshot tapes into the notes like a photograph of a real
whiteboard - while the notebook itself stays structured, because the Lesson Pack
is generated from entries and a canvas has none to give it.


## The problem it addresses

Learners forget most of what happens in a private lesson. They write incomplete
notes, miss corrections while they are busy speaking, and understand a mistake on
the call only to repeat it a week later. Tutors then spend unpaid time after every
lesson writing summaries and building exercises.

### Writing things down is how people learn, so where did it go?

It is a fair objection, and the honest answer is that this app does give
something up. Writing a note yourself is part of learning it; a page written for
you is not the same as a page you wrote.

But in a **speaking** lesson, writing competes with the thing being practised.
You cannot hold a conversation in a language you are still learning and take
notes about it at the same time, and a learner who tries does both badly - which
is why the notes people actually come away with are three half-sentences and a
word they cannot read. That is not true of a lecture, where writing costs you
nothing but attention. It is true here.

So the writing is not removed. It **moves from during the lesson to after it** -
and it moves to the part that does more work anyway. Reading your notes again is
the thing everyone means to do and the thing that helps least. Being asked a
question you have to answer, about a sentence you personally got wrong, is what
makes a lesson stick. That is what the Lesson Pack is: gap-fills built from the
learner's own corrected sentences, where the answer is the word their tutor
actually used.

Which makes the capture the boring half of this product. The lesson notes exist
so that there is something to come back to.

## What it records

| In the notebook | How it gets there |
| --- | --- |
| Learner mistakes | A yes/no judgment on each learner turn |
| Tutor corrections | A correction judgment, then a second pass that pairs the corrected sentence to the utterance it fixed |
| New vocabulary | A judgment that a word is being taught, then a selection among candidate spans from the turn |
| Grammar explanations | A judgment that a rule, not just one sentence, was explained |
| Learning goals | A judgment on either speaker's turn |
| Topics needing practice | A judgment on the tutor's turn |

## Transcription, and why the tutor is a person

The lesson is transcribed by Gemini Live using `gemini-3.5-transcribe-live` - a
transcription model, not a conversational one. It returns what was said and never
speaks. That is a product boundary, not a limitation worked around: the tutor here
is a human, and nothing in the app should be able to teach.

Speakers are told apart **structurally, not by inference**. Each device
transcribes its own microphone, so a turn is never attributed by voice. No
diarisation model beats keeping the audio separate in the first place.

Transcribing both streams from both sides seemed equivalent and was not: both
people transcribed both voices, so every sentence was sent twice and appeared
under both names. A device now hears only itself, which also uses the better
audio - the raw microphone, before the network.

Microphones still leak. Two devices in one room hear both people, so the same
sentence can arrive twice under different names; a repeat within seconds is
dropped as an echo rather than written up as a second turn, and the **mic button
mutes** - stopping both the audio into the room and the transcription, because a
mic button that left the notes running would not be a mute.

Transcription starts with the room rather than waiting to be switched on. One
control that silences everything beats two that overlap.

What the browser cannot know is which of those two people is the tutor. That is a
fact about the people, not about the connection, so it stays a stated setting:
"on this device I am the learner / tutor". Getting it wrong is not cosmetic - the
questions asked of a turn depend on who said it, and a tutor filed as a learner is
never asked whether they just corrected something, taught a word, or explained a
rule. The notebook then stays empty no matter how good the teaching was.

Only `inputTranscription`, the finalised text for an utterance, becomes a turn.
The interim text is shown live and never judged, because classifying half a
sentence writes half a correction.

The API key stays on the server. The browser opens its sessions with a token
minted per lesson, scoped to transcription and nothing else.

**Sessions drop, and are expected to.** A Live session can end for reasons that
have nothing to do with the lesson - a network blip, a server-side timeout - so a
dropped speaker is reconnected with backoff rather than left silent. Getting this
wrong was invisible and severe: the first version closed the pipeline and never
reopened it, so one blip made a speaker disappear for the rest of the lesson
while the call carried on around them. The token's window has to cover the whole
lesson for that reconnect to be possible at all; at two minutes, a session lost
later in a lesson could never be replaced.

If reconnection keeps failing the panel says so rather than showing a transcript
that has quietly stopped.

## Two views, one switch

The header switch says who is at this device, and it changes both what the app
hears and what it shows.

As the **learner** you get the notebook: what was corrected, the words, the
explanations. As the **tutor** you get a different question answered - not "what
did I learn?" but "what have I not dealt with yet, and what should I do next?":

- **Not yet corrected** - mistakes this lesson that no correction has landed on
- **Carried over** - what is recurring across previous lessons, and what has
  stopped
- **Suggested now** - one concrete drill, chosen by the weakness that most needs it

None of this is new intelligence. Jev already computed all of it; it was simply
never shown to the person who could act on it. The drills are fixed per error
type rather than generated, because a suggestion a tutor glances at and runs
should be the same every time, and inventing exercises would be the app teaching.

**The tutor can also read the notebook itself.** The two views started as an
either/or, and that was a mistake: answering the tutor's question is not a
reason to hide the learner's page from them. The notebook is what the learner
keeps, and it is what the tutor is writing into by teaching - not being able to
look at it meant a tutor could correct a sentence and never see how it was
written down. So the tutor's panel has three places, **To deal with**, **Notes**
and **Whiteboard**, and opens on the first, because that is the one with
something to act on. The learner has no use for the tutor's view and does not
get it; the notebook is the same page for both.

It is one switch rather than two because being the tutor and seeing the tutor's
view are the same thing from the person's point of view. Setting it also decides
which audio stream is transcribed as whom, which matters: a tutor filed as a
learner is never asked whether they just corrected something.

## The whiteboard

Tutors draw during lessons - verb tables, timelines, sentence diagrams - and that
drawing is part of what the learner should keep. The right-hand panel switches
between **Notes** and **Whiteboard**, and one Capture button tapes in whichever
is showing: the board when it is open, the camera otherwise. A tutor's Notes
panel holds their two documents behind one switch - what is still to deal with,
and the learner's notebook - because a phone's bottom bar is already four places
wide and a fifth would not be a thumb's reach. Two capture buttons
would make the user work out which one they wanted.

The board is a working surface, not a record. It is freeform, nothing on it is
structured, and the notebook never reads from it - what crosses over is a PNG
snapshot, taped in beside the camera frames exactly like a photograph of a real
whiteboard. Replacing the notebook with a canvas would have been the tempting
move and the wrong one: the Lesson Pack is generated from structured entries, and
a drawing surface has none to give it.

**Both people draw on the same board.** Changes travel over the lesson's own
Vonage session rather than a second realtime service to run, pay for and explain,
which also scopes the board to the call by construction: you can only draw with
someone you are in a room with. Someone arriving mid-lesson asks for the board
and is sent it.

A signal carries at most 8KB. A stroke never approaches that; a whole board does,
so large messages are split and rebuilt, and pieces of two messages in flight at
once are kept apart.

The board stays mounted while the notes are showing, so switching tabs never
loses a drawing.

Built on [tldraw](https://tldraw.dev), under a commercial licence.

The licence key is read in the browser, so it is inlined when the app is **built**
rather than read from the environment when it runs. A runtime secret would never
reach it: pass it as a build argument (`--build-arg`) or the deployed app shows
the watermark even though the key is set.

## The gate: narrow questions, asked separately

A live call carries more than the lesson. People test the microphone, read the
screen aloud, talk to someone else in the room, and talk about the app itself.
Every turn is therefore gated before it is judged.

The gate began as **two** questions, and it took three attempts to get there:

1. *Is this person speaking to the other participant?* Subject matter is
   explicitly irrelevant.
2. *Are they talking about this app or the equipment?*

A turn must pass the first and fail the second. The first version asked one broad
question, "is this part of the lesson?", which quietly judged the **topic**: a
learner describing their job in a speaking lesson scored 0.36 alone and 0.69 once
a tutor turn preceded it, so whether their practice was recorded depended on the
conversation around it. Rewording it to ask about the addressee fixed that and
broke the other side - an aside about the app rose to 0.61 against genuine work
talk at 0.72, a margin far too thin to threshold. Split in two, the same cases
separate cleanly: 0.31 against 0.82.

The bar for passing is higher than the app's usual tentative floor, because the
two mistakes are not equal. Dropping a real turn loses one note. Admitting an
aside writes a language error into the learner's notebook that they never made.

Both regressions are in the evaluation set, which scores this signal at the
threshold the app actually uses rather than a generic one.

### And a third question, about the transcript rather than the speaker

A learner turn is asked one more thing: *does this read as the recogniser's
mistake rather than the speaker's?* It is the same veto shape as the tool-talk
question, and it exists because the notebook's worst failure had a cause nothing
in the question set could see.

A mis-heard word arrives looking exactly like a lexical error. "It was very
delisherous" is not a learner choosing the wrong word; it is a microphone, a
room and a network between the learner and the transcript. Asked to judge it,
the error question answered 0.94 - correctly, on the text it was given - and the
learner read an accusation about a sentence they never said. Wrong notes of this
kind are not bad judgment; they are good judgment applied to bad input.

So the question asks about the text, not the person, and a confident yes
withholds the language error alone. The turn is still lesson speech, still in the
transcript, and says what happened: "heard, but the transcript looks garbled".
Withholding the whole turn would hide the lesson; asserting the error would blame
the learner for the microphone.

It is a recall trade, and deliberately so. A strong accent produces transcripts
that genuinely look garbled, so this will occasionally suppress a real error for
exactly the learners who make most. Losing a note costs one note; inventing one
costs the learner's trust in the page.

## Saying so when nothing is written

Every turn in the transcript carries what the classifier decided - "mistake
noted", "heard, nothing to note", "not lesson speech", "heard, but the transcript
looks garbled", "not judged in time" - including, and especially, the turns that
produced nothing.

This is not a debug view. A notebook that fills only on corrections is silent
through most of a good lesson, and silence is indistinguishable from failure: the
app looked broken for exactly as long as it had no way to say "I heard that, and
there was nothing to write down."

### Two scales that do not compare

Every entry carries the number that produced it, and for a while some of those
numbers were the wrong kind. A Noul returns a calibrated probability - the chance
the answer is yes. A Choice returns confidence, which is how concentrated the
distribution over the options is, and falls simply because there are more options
to spread across: a pick among twenty-four vocabulary candidates looks less
certain than a three-way choice that means less. The model's own guidance says
the two are not comparable and that thresholds must not be carried between them.

So the band an entry is shown in now always comes from the calibrated judgment
that decided the entry should exist. A Choice confidence is only ever a floor on
whether a selected span is safe to quote, which is a different question with its
own constant.

### Asked again, once the lesson is over

Judging a turn the moment it arrives is what makes the tutor's view worth
having, and it has a cost that is easy to miss: the pairing question is only
ever shown the last three learner turns. A tutor who circles back - "one thing
from earlier, you said 'I go', it should be 'I went'" - is correcting a sentence
that left the window long ago. Nothing is wrong with the judgment; the question
was asked before the answer existed, and the learner kept a pencil note reading
"waiting for Mark to correct this" about something Mark corrected out loud.

So when the lesson ends the corrections are paired **once more, against the
whole transcript**, before the Lesson Pack is built. Every mistake still open on
one side, every tutor sentence of the lesson on the other, in one request. There
is no deadline and nobody waiting, which is exactly why this is the pass that
can afford to read everything.

Two things are checked in code rather than asked for. A correction may not
predate the mistake it claims to fix - the model is not reliable about
chronology, so ordering is verified against the transcript - and a "correction"
identical to the mistake is refused, because striking out a sentence and
offering the same sentence back is a bug wearing a red pen.

It is still selection, not generation: the candidates are the tutor's own
sentences. And it is the reason the live pass can stay narrow. Immediacy is
what the tutor needs during the lesson; completeness is what the learner needs
afterwards, and they no longer have to be the same pass.

## The design rule: Jev judges, code writes

Nothing in the notebook is generated. Jev returns typed answers and calibrated
probabilities; the application decides what those answers mean and assembles the
text itself.

When a flashcard needs a term or a correction needs its sentence, `lib/jev.ts`
enumerates candidate spans **from the real transcript** and asks Jev to *select*
one. The consequence is worth stating plainly: a term on a flashcard is a term the
tutor said, and an exercise answer cannot disagree with the lesson it came from.

Confidence is not hidden either. Every entry carries the probability that produced
it, and the notebook shows three outcomes rather than two:

| Probability | What happens |
| --- | --- |
| ≥ 0.75 | Written as a confirmed note |
| 0.45 – 0.75 | Written, but marked **unsure** so the learner checks it |
| < 0.45 | Dropped |

Dropping a real correction costs the learner the thing they most needed. Asserting
one the tutor never made costs their trust. The middle band exists because those
two failures should not be traded off silently.

An uncorrected mistake is shown differently again: a dotted pencil note reading
"waiting for the correction", not a red strikethrough. Striking out a sentence
and offering nothing in its place tells the learner they are wrong and leaves
them there.

## On a phone

The phone layout is not the desk layout reflowed. It is four places you move
between from a bottom bar - **Lesson**, **Canvas**, **Notes**, **Pack** - with
the call on top: the other person takes the frame and you sit in the corner, the
transcript runs underneath as bubbles, and the controls are a thumb's reach from
the bottom. A turn the notebook took something from carries a sparkle, so the app
is visibly working without leaving the call.

Two equal video tiles, which suit a desk rail, make both faces too small to read
on a phone. Stacking the desk layout put the notebook - the thing the learner
keeps - several screens below the fold.

The two layouts are a **real branch, not a CSS one**. Hiding a layout with a
class still mounts it, and both contain a video room and a whiteboard: the page
would have opened two Vonage publishers and two transcription sessions, doubled
the cost, and judged every spoken turn twice.

## Why it looks like that

Two surfaces that deliberately look nothing alike. The left is software: a dark
panel holding the call. The right is a sheet of ruled paper.

The split is the argument. The call is disposable; the page is what the learner
keeps. Anything the model was unsure of is marked **unsure** on the page rather
than asserted, so the notebook never quietly claims the tutor said something they
did not.

## Architecture

An interactive diagram lives at
[`docs/architecture/linguatrace.html`](docs/architecture/linguatrace.html) - open
it in a browser. Its source of truth is the small JSON specification beside it,
and each component links to the file that implements it.

```text
Vonage room (stubbed)  ->  transcript turns
                                |
                                v
                     POST /api/classify
                                |
            judgments          selections            two requests, sent together:
        Jev judges the turn  /  picks the spans      one round trip per turn
                                |
                    both answered before anything is written
                                |
                                v
                   lib/notebook.ts  - thresholds, pairing, de-duplication
                                |
                                v
                   the notebook page (live)
                                |
                     POST /api/pack
                                |
                 reconcile: pair the corrections the       one request, no deadline
                 live window was too early to see
                                v
                   lib/lessonPack.ts - summary, flashcards,
                   gap-fills built from the learner's own corrections
```

A turn costs **one round trip**, not five. The selections used to be a second
pass, made after the judgments and justified by needing their answers. They did
not need them: every candidate span is enumerated in code from the transcript, so
nothing about them waits on a judgment - the judgments decide only which
selections the notebook goes on to read. So they are asked speculatively, with
their premises stated in the question, and sent alongside pass 1 rather than
after it. They stay two requests rather than one because the judgments read a
small, clean state, and accuracy falls as a state grows with material irrelevant
to the question being asked.

The one thing that genuinely needs an earlier answer is the vocabulary gloss,
which has to know which word was chosen. It runs after the word is already on the
page rather than in front of it: waiting on a dictionary before showing a word
the tutor has just said aloud made a slow lookup into a slow notebook.

Every turn is judged under a single deadline covering all of its requests. The
model client's timeout is per attempt, and with retries a call could occupy some
twenty-five seconds; a lesson could run minutes ahead of its own notebook with
nothing to say why. A turn that runs out of time says so in the transcript -
"not judged in time" - rather than going quiet.

| File | Responsibility |
| --- | --- |
| `lib/types.ts` | Domain model; keeps observed facts separate from inferred ones |
| `lib/jev.ts` | Every question asked of the model, and the candidate enumeration |
| `lib/notebook.ts` | Policy: thresholds, correction pairing, de-duplication |
| `lib/lessonPack.ts` | Assembles the pack; generates exercises by diffing corrections |
| `lib/store.ts` | In-memory lessons, plus the previous lesson for progress |
| `lib/vonage.ts` | The Vonage room: JWT minting, session creation, client tokens |
| `lib/useSpeech.ts` | Interim transcript source (browser speech recognition) |
| `lib/derive.ts` | Counts the notebook displays - focus, practice list, progress |
| `components/Notebook.tsx` | The paper page: the thing the learner keeps |
| `components/LiveRail.tsx` | The call: controls, video, transcript, practice list |
| `components/VideoRoom.tsx` | The video call, connected with a session-scoped token |
| `components/Whiteboard.tsx` | The shared drawing surface, and its snapshot export |
| `lib/boardSync.ts` | The board and the captures over the lesson's own session |
| `lib/captureImage.ts` | Shrinking a capture to something that can be sent |
| `eval/` | The evaluation harness and its labelled dataset |

Policy lives apart from the questions on purpose: changing a threshold is a code
change that needs no new inference, and the same judgments could drive a different
presentation.

## The pages

```
/                 the live lesson
/lesson/[id]      one lesson, to revise from - the link you send someone
/learner/[id]     every lesson, and the trend across them
```

The learner home is the point of storing anything. It is where a learner goes
back to practise a lesson from a fortnight ago, and it is the only place the app
can say "verb tense, four lessons running" or "prepositions, not seen for two
lessons" - claims no in-memory version could make, and the ones a tutor most
wants before the next lesson starts.

Lessons are written through after every judged turn, so a refresh mid-lesson
resumes rather than starting over, and a lesson survives the server restarting.

**Captures are shared, and only drawings are kept.** A snapshot taped into the
notes is part of the lesson both people are in, so it goes to both of them over
the session the board already rides - it used to exist only in the browser that
pressed the button, which meant a tutor could draw something, watch the learner
tape it in, and never see the note they had just made. Someone joining
mid-lesson asks for what is already taped in, the same way they ask for the
board.

What is stored is a narrower question than what is shared. **A whiteboard
snapshot is kept; a camera capture is not.** A drawing belongs to the lesson; a
video still is a person's face, and keeping those indefinitely is a different
promise from keeping their notes - sharing one with the person already looking
at that face on a call is not the same as writing it down. So whiteboard cards
are on the page when a lesson is reopened and camera stills are gone on refresh,
and the rule is enforced where the write happens rather than trusted to every
caller. The board itself still persists as its tldraw document - vector, small,
reopenable - and a taped snapshot is a photograph of it at one moment, which is
a different thing and cannot be re-derived.

A capture is shrunk once, when it is taken, and the smaller picture is both what
is taped in and what is sent. A frame off a video element is a megabyte or two;
signals carry 8KB, so an untouched capture would be hundreds of them in a burst.
The card it renders into is a few hundred pixels wide, so the full resolution
was never visible to anyone.

Storage is SQLite through Node's built-in driver, so the app needs no service to
run. Every query lives in `lib/db.ts` and returns plain objects; moving to
Postgres means rewriting that one module and nothing above it. There are no
accounts yet: a lesson URL is "anyone with the link", which is honest for a demo
and not enough for a product.

## Translation

Vocabulary is glossed into the learner's own language - "to draw a blank -
quedarse en blanco". This is the **one** place the app generates text instead of
selecting it, because a translation cannot be quoted from a lesson: the word is
not in the transcript. So the exception is marked rather than hidden. Glosses are
stored in their own column, shown in a different colour and face, and never run
together with the tutor's words. A failed translation costs the gloss, never the
word.

Glossing is a dictionary lookup, not instruction, so it does not cross the line
that keeps the tutor human.

## Running it

```bash
npm install
cp .env.example .env.local   # then set TYPESAFE_API_KEY
npm run dev
```

Open http://localhost:3000 and press **Start lesson**.

**Without Vonage credentials** a scripted lesson replays at conversational pace and
the notebook fills as it goes. **With them**, the page opens a real video room:
choose whether you are the tutor or the learner, then either turn on transcription
or type turns. Press **End lesson** to build the Lesson Pack.

### Connecting a real room

The Video API authenticates with an application ID and an RSA private key, not the
account API key and secret. Vonage shows a generated private key once and never
again, so the safer route is to generate the pair yourself and upload only the
public half:

```bash
# with VONAGE_API_KEY and VONAGE_API_SECRET set
node scripts/create-vonage-app.mjs
```

That creates an application with the `video` capability, writes
`vonage_private.key` (gitignored), and prints the application ID for
`.env.local`.

Get a key at [typesafe.ai](https://typesafe.ai). Without one the lesson still
replays and the transcript still fills, but the notebook stays empty and the page
says why.

## Accounts

Sign up as a **tutor** or a **learner**. Role is chosen once and never again,
because it is not a preference: which side of a lesson someone is on decides what
questions their turns are asked, and a tutor filed as a learner is never asked
whether they just corrected something. Before accounts this was a control in the
header that a misclick could get wrong.

**Only a tutor starts a lesson.** A lesson is a tutor teaching a learner, so one
opened by a learner alone has no teaching in it to write down - and it used to
produce a lesson whose tutor was a placeholder, which then appeared on the
learner's own screen as "your tutor". Learners arrive by invitation, and the
refusal is on the server: the interface not offering a button is not the same as
the app not allowing it.

The tutor sends the invite link, and the first learner to follow it becomes that
lesson's learner, so the lesson joins their history. A second learner following
the same link is refused rather than quietly rewriting whose history it is.

Passwords are hashed with scrypt from Node's own crypto; a session is a random
token in the database behind an `HttpOnly`, `SameSite=lax` cookie, `Secure` in
production. There is no third-party identity service, because what this app needs
from identity is narrow.

A learner's history is theirs and their tutor's. Every route checks: another
learner who guesses the link gets a 404, not a redirect that confirms the page
exists.

## Two people in one lesson

The tutor starts a lesson and presses **Copy invite**; the learner opens the link
while signed in and joins the same room. The joiner picks up the notebook as it
already stands.

Without this the app could only be used alone - both people pressing "Start
lesson" opened two separate video rooms and waited for someone who was never
coming, which is the one way this product does not work.

**You cannot fully test this on one machine.** Two tabs cannot open the same
webcam: the second gets `NotReadableError`, publishes nothing, and the first sees
an empty tile. The join itself still works - the second tab sees the first - but
judging the two-way call needs two devices.

## Deploying

The app keeps lessons in SQLite on disk, so it needs a host that keeps a
filesystem between requests. Platforms whose functions start empty each time will
lose every lesson unless the database moves to a hosted one first - that means
rewriting `lib/db.ts`, and nothing above it.

Deployed at **https://linguatrace-e04587.fly.dev**.

A `Dockerfile` and `fly.toml` are included:

```bash
fly launch --no-deploy          # rewrites app name and region for your account
fly volumes create linguatrace_data --size 1
fly secrets set \
  TYPESAFE_API_KEY=...          \
  GOOGLE_API_KEY=...            \
  VONAGE_APPLICATION_ID=...     \
  VONAGE_PRIVATE_KEY="$(cat vonage_private.key)"
fly deploy
```

`VONAGE_PRIVATE_KEY` is the inline form of the key, used instead of
`VONAGE_PRIVATE_KEY_PATH` because the container has no key file. It carries real
newlines; keep the quotes.

HTTPS is required - browsers refuse camera and microphone access on plain HTTP
from anything but localhost - and the Fly config forces it.

## Evaluation

The harness runs the real question set against labelled turns and reports recall
and precision per signal.

```bash
npm run eval     # needs TYPESAFE_API_KEY; exits non-zero on any failure
npm test         # offline checks, no key needed
```

`eval/dataset.json` deliberately includes negative cases — a greeting, a question,
a word of praise, an ordinary sentence with no error. A note-taker that fires on
every line is noise, so not-firing is tested as carefully as firing. Answers
landing in the tentative band are reported separately: those are cases where the
question wording, not the threshold, is what needs work.

## Integration status

| Integration | Status |
| --- | --- |
| **Jev** (TypeSafe) | Wired. Every judgment in the notebook. |
| **Vonage** | Wired. Real sessions and session-scoped client tokens, signed server-side with the application's private key. Falls back to the scripted lesson when credentials are absent. |
| **Gemini Live** | Wired, for transcription only. `gemini-3.5-transcribe-live` listens to each side of the call and returns what was said. It never speaks. |
| **tldraw** | Wired. The shared whiteboard, whose snapshots tape into the notebook. |
| **Galtea** | The harness in `eval/` is the shape Galtea consumes: labelled cases, per-signal recall and precision, non-zero exit on regression. Not yet reporting to a Galtea project. |
| **Preply** | The progress model is built — each lesson is compared against the learner's previous one by error type. Not connected to Preply's platform. |

## What is deliberately not built yet

- **Persistence.** Lessons live in memory and are cleared when the server restarts.
  Download the pack before restarting.
- **Persisting the weakness profile.** Progress is compared against the previous
  lesson only, held in memory. A real mastery model needs lessons to survive a
  restart.
- **Multiple languages.** The question wording is English-teaching specific. The
  taxonomy in `lib/types.ts` would need to change per target language.
