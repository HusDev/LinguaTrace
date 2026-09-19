# Brag Plan: LinguaTrace

## What is this app?
An intelligent lesson notebook: during a one-to-one language lesson it listens to the
call and writes down what was actually taught — corrections, vocabulary, grammar
explanations — so neither the learner nor the tutor has to take notes.

## The angle
The product's own design argument is the video's argument: **two surfaces that look
nothing alike.** On the left, a dark desk holding a disposable video call. On the right,
a sheet of cream ruled paper that fills itself in handwriting as people talk. The call is
software; the page is what the learner keeps. The whole video is that split, and the
pleasure of watching ink land on paper that nobody is writing on.

No jokes, no startup parody. This project is earnest and unusually well-designed, so the
brag is a quiet premium product film that lets the notebook do the talking.

## Hook (first 2-3 seconds)
Near-black desk. A single transcript bubble types in — Ana: *"Yesterday I go to the
office for a big meeting."* — and under it a small green tag flicks on: **mistake noted**.
Beat. Then, at the right edge, a nib of handwriting starts moving across ruled paper on
its own. Line: **"Nobody is taking notes."**

The hook is the unattended pen. It asks the only question that matters: who is writing?

## Key moments (the middle)
- **The correction pair lands on paper.** The learner's sentence is struck through in red
  ink, and under it, in green, *"Yesterday I went to the office."* with a hand-drawn
  underline and the label *(Verb tense)*. Real copy from the product's own notebook.
- **The pencil note.** A mistake with no correction yet appears as a dotted pencil line —
  *"waiting for Mark to correct this"* — not a red verdict. Restraint as a feature.
- **The switch.** The header toggle snaps Learner → Tutor, the paper is replaced by the
  dark tutor panel, and three cards arrive one at a time: *Not yet corrected* /
  *Verb tense — 5 lessons running* / *Suggested now: describe last weekend in the past
  simple.* Same lesson, different question answered.

## Outro / punchline
The paper page settles, full of handwriting. Type resolves over it:
**LinguaTrace — the lesson, kept.**

## User flow worth showing
Entry → key action → result, all real screens from `app/` and `components/`:
1. The live lesson at `/` — dark rail with the call, the running transcript, each turn
   labelled by the classifier (`components/LiveRail.tsx`).
2. The notebook filling itself as turns are judged — corrections, vocabulary gloss,
   pencil notes (`components/Notebook.tsx`).
3. The tutor switch — the same lesson re-asked as "what have I not dealt with yet?"
   (`components/TutorView.tsx`).

## Tone
- Preset: `polished`
- Creative direction: quiet premium product film — a notebook that writes itself
- Interpretation: few scenes, long holds, soft crossfades. Motion is ink and paper, not
  slides. Confidence through restraint: nothing flashes, nothing shouts, and every line
  stays on screen long enough to be read twice.

## Format: landscape — 1920x1080
## Duration: 21.5s

## Visual identity (from the project)
- Background (desk): `#241b16`; panel `#2f251e`, raised `#3a2e25`, edge `#4a3a2e`
- Paper: `#fbf7ec`; rule `#e2ddcb`; margin rule `#d98a8a`
- Accent: `#8fd9ac` (accent bg `#2c5741`)
- Text: `#f2ebe3` on desk / `#2f2a25` ink on paper; soft `#a99a8d` / `#7d7264`
- Ink red `#c0392b`, ink green `#2e7d4f`, pen blue `#2f5d9e`, tape `#e7d7a4`
- Marker highlights: green `#cde8d4`, pink `#f7d9d7`, blue `#d8e5f6`
- Display font: **Caveat** (the handwriting — this is the product's signature)
- Body font: **Inter**
- Strongest visual element: the ruled cream page with red strikethrough + green
  handwritten correction, and the 36px rule pitch that keeps writing in step with lines.

## Share copy (draft)
Built LinguaTrace: it listens to a language lesson and writes the notebook — corrections,
vocabulary, the lot — so neither of you has to.

## Audio direction
- Role: warm bed with sparse, motion-matched accents
- Music: `happy-beats-business-moves-vol-12-by-ende-dot-app.mp3` (109.96 BPM) — the
  calmest bundled track; start from the top, sit low under the whole film.
- Music treatment: fade in over ~0.6s, hold at a low bed level so the ink and UI sounds
  read above it, fade out over the last ~1.2s of the outro.
- Music cue guidance: preset cue file read (`cues/…vol-12….music-cues.md`). Target strong
  cues at **8.74s** (correction lands), **13.11s** (pencil note), **17.47s / 18.56s**
  (tutor cards one and two). Beat-grid window for the three tutor cards: 17.47 / 18.56 /
  19.66 — every other beat, so each card holds ≥0.8s.
- Audio-reactive treatment: none. Restraint is the tone; no waveform, no pulsing glow.
- SFX posture: sparse. Soft keyboard ticks under the typing transcript, a dry paper/pen
  stroke as each handwritten line lands, one quiet interface click on the Learner→Tutor
  toggle, one soft card sound per tutor card.
- Audio-coupled moments: the typed transcript bubble (scene 1), each handwritten line
  landing on paper (scenes 2-4), the toggle click (scene 5), the three cards (scene 5).
- Restraint rule: no whooshes, no impacts, no risers. Nothing louder than a pen on paper.

## Storyboard

### Scene 1 — The unattended pen — 3.2s
Full-frame dark desk `#241b16`. A transcript bubble types in at left: avatar "A", name
"Ana", text *"Yesterday I go to the office for a big meeting."* — then the classifier tag
**mistake noted** fades on in accent green under it. At 2.0s the right third of the frame
slides open to reveal ruled paper, and a handwritten Caveat line begins drawing across it.
Overlay line, bottom left, Inter: **Nobody is taking notes.** (holds 1.2s settled)
Sequential/interaction: yes — the transcript text types character by character, then the
tag appears, then the paper edge reveals.
Audio intent: quiet room, a machine paying attention.
Audio-coupled idea: subtle key ticks under the typing; one soft pen stroke as the paper
line starts.
Music: low warm bed, fading in.
Transition mood: soft → Scene 2

### Scene 2 — The split — 3.8s
The frame settles into the real layout: dark call rail left (two participant tiles,
"Mark · tutor" / "Ana · you", Live · room open pill), cream paper right. Paper header
writes itself: *Ana's lesson notes · 19 Sept*, then *Focus: Verb tense* and
*Goal: I want to speak more confidently in meetings.* in Caveat.
Wordmark resolves: **LinguaTrace** / *Live lesson companion*.
Sequential/interaction: yes — header line, then Focus, then Goal, each landing ~0.9s apart.
Audio intent: arrival; the thing has a shape.
Audio-coupled idea: one soft paper stroke per handwritten line.
Music: bed continues, low.
Transition mood: soft crossfade / gentle push-in → Scene 3

### Scene 3 — The correction — 4.5s
Push in on the paper. Under a pink-marker heading *Corrections:* two lines land:
✗ *Yesterday I go to the office for a big meeting.* struck through in ink red, label
*(Verb tense)*; then ✓ *Yesterday I went to the office.* in ink green with a hand-drawn
underline, label *(correct)*. Above them the vocabulary line is already there:
**to draw a blank** — *quedarse en blanco* in pen blue.
Caption, Inter, lower third: **It writes down what was actually taught.** (holds 1.4s)
Sequential/interaction: yes — strikethrough draws left to right, then the green line
writes in. Target the green line to the 8.74s strong cue.
Audio intent: the satisfying part; a pen doing work.
Audio-coupled idea: strike stroke, then a second softer stroke for the correction.
Music: bed steady.
Transition mood: soft → Scene 4

### Scene 4 — Waiting for the correction — 3.5s
Still on paper, moving down the page. A dotted pencil line appears: *Last month I has
three presentations and all of them was stressful.* with *(Subject-verb agreement)* and,
beneath it in faint grey Caveat, *waiting for Mark to correct this*.
Caption: **And it says when it doesn't know yet.** (holds 1.4s)
Sequential/interaction: yes — pencil line draws dotted, then the grey note fades in at the
13.11s strong cue.
Audio intent: hesitation, honesty; quieter than scene 3.
Audio-coupled idea: one dry, softer pencil stroke. No tag sound.
Music: bed dips very slightly.
Transition mood: clean cut → Scene 5

### Scene 5 — The switch — 4.5s
Cut to the header. The Learner/Tutor toggle snaps to **Tutor** (one quiet click) and the
paper wipes away to the dark tutor panel. Three cards arrive one at a time:
1. *NOT YET CORRECTED* — "Last month I has three presentations and all of them was
   stressful." / Subject-verb agreement
2. *CARRIED OVER* — Verb tense · **5 lessons running**; Prepositions · not seen for 4
3. *SUGGESTED NOW* — "Describe last weekend in the past simple, two minutes, no notes"
Caption: **The tutor gets a different question answered.** (holds 1.4s)
Sequential/interaction: yes — toggle click, then cards on beats 17.47 / 18.56 / 19.66,
each holding ≥0.8s settled; all three stay on screen together for the last 1.2s.
Audio intent: a gear change, still calm.
Audio-coupled idea: interface click on the toggle; one soft card sound per card.
Music: bed lifts a touch into the strong-cue run.
Transition mood: soft crossfade → Scene 6

### Scene 6 — The lesson, kept — 2.0s
Back to the full paper page, now dense with handwriting, slightly pulled back so the whole
sheet reads. As built: the page racks out of focus (an 8px blur on the app layer) and an
opaque desk-coloured card settles over it — a translucent scrim was tried first and made
the transcript behind it fail WCAG AA, so the card carries the type instead. Type resolves
centred on it in Inter:
**LinguaTrace** / *the lesson, kept.*
Sequential/interaction: none.
Audio intent: settle and stop.
Audio-coupled idea: one last faint pen stroke, then nothing.
Music: fade out over the final 1.2s.
Transition mood: hold to black-free end (end on paper, not on black).

**Scene durations:** 3.2 + 3.8 + 4.5 + 3.5 + 4.5 + 2.0 = **21.5s**

**Music mood for this video:** warm, low, unobtrusive — upbeat track played as a bed, not a driver.
**Audio summary:** A quiet warm bed under six scenes, punctuated only by sounds a desk
actually makes — keys, a pen on paper, one click, three soft cards — fading out as the
page settles.
