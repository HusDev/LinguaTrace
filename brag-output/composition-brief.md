# Hyperframes Composition Brief: LinguaTrace

## Objective
Create a short launch-style brag video for LinguaTrace — an intelligent lesson notebook
that listens to a one-to-one language lesson and writes down what was actually taught.

## Output
- Composition directory: `brag-output/composition/`
- Rendered video: `brag-output/brag.mp4`
- Format: landscape — 1920x1080
- Duration: 21.5s

## Source Material
- Project root: `/Users/husseinalkhafaji/lab/LinguaTrace`
- Primary files read: `README.md`, `app/globals.css`, `app/layout.tsx`, `package.json`,
  `components/{Notebook,LiveRail,TutorView}.tsx`, `docs/screenshots/*.jpg`
- Product name: **LinguaTrace** (sub-line: *Live lesson companion*)
- Tagline / strongest claim: "During a one-to-one language lesson it listens to the
  conversation, writes down what was actually taught, and turns the call into a Lesson
  Pack the learner can revise from. The learner concentrates on speaking. The tutor
  concentrates on teaching. Neither of them takes notes."
- Key UI to recreate: the **two-surface lesson screen** — a dark call rail on the left
  (participant tiles, running transcript with classifier tags) and a **sheet of cream
  ruled paper** on the right that fills itself in handwriting. Reference screenshots:
  `docs/screenshots/lesson-notebook.jpg` and `docs/screenshots/tutor-view.jpg`.
  Recreate in HTML/CSS — do not embed the screenshots as images.
- Copy that must appear verbatim (all real product copy):
  - Transcript turn: `Yesterday I go to the office for a big meeting.` / tag `mistake noted`
  - `Ana's lesson notes · 19 Sept`
  - `Focus: Verb tense`
  - `Goal: I want to speak more confidently in meetings.`
  - `New vocabulary:` / `to draw a blank` — `quedarse en blanco`
  - `Corrections:` / struck-through `Yesterday I go to the office for a big meeting.`
    `(Verb tense)` / `Yesterday I went to the office.` `(correct)`
  - `Last month I has three presentations and all of them was stressful.`
    `(Subject-verb agreement)` / `waiting for Mark to correct this`
  - `NOT YET CORRECTED` / `CARRIED OVER` / `SUGGESTED NOW`
  - `Verb tense` · `5 lessons running` / `Prepositions` · `not seen for 4`
  - `Describe last weekend in the past simple, two minutes, no notes`
  - `Mark · tutor` / `Ana · you` / `Live · room open` / `Learner` / `Tutor`
  - Original lines written for the film: `Nobody is taking notes.`,
    `It writes down what was actually taught.`, `And it says when it doesn't know yet.`,
    `The tutor gets a different question answered.`, `the lesson, kept.`

## Creative Direction
- Tone preset: `polished`
- Creative direction: quiet premium product film — a notebook that writes itself
- Interpretation: six scenes, long holds, soft crossfades and gentle push-ins. The motion
  vocabulary is ink and paper: lines draw on, strikethroughs sweep left-to-right, the page
  never slides like a slide. Confidence through restraint — nothing flashes, nothing
  shouts, every line is readable twice.
- Angle: The product's own design argument is the video's argument — two surfaces that
  look nothing alike. On the left a dark desk holding a disposable video call; on the
  right a sheet of cream ruled paper that fills itself as people talk. The call is
  software; the page is what the learner keeps. The whole video is that split, and the
  pleasure of watching ink land on paper that nobody is writing on.
- Hook: a transcript bubble types itself, the tag `mistake noted` flicks on, and then —
  unattended — handwriting starts moving across ruled paper. Line: *Nobody is taking notes.*
- Outro / punchline: the full page, dense with handwriting, and **LinguaTrace — the lesson, kept.**
- Avoid:
  - Generic SaaS language
  - Abstract filler visuals
  - Unrelated visual redesign (the product's palette and paper metaphor are the design)
  - Embedding the JPG screenshots — rebuild the UI in HTML/CSS

## Visual Identity
- Background (desk): `#241b16`; panel `#2f251e`; panel raised `#3a2e25`; edge `#4a3a2e`
- Paper: `#fbf7ec`; rule `#e2ddcb` (36px pitch, `repeating-linear-gradient`, 35px/36px);
  margin rule `#d98a8a`; punch holes `#241b16`
- Accent: `#8fd9ac`; accent background `#2c5741`
- Text: `#f2ebe3` on desk, soft `#a99a8d`; ink `#2f2a25`, ink soft `#7d7264`
- Ink red `#c0392b`; ink green `#2e7d4f`; pen blue `#2f5d9e`; tape `#e7d7a4`
- Marker highlights: green `#cde8d4`, pink `#f7d9d7`, blue `#d8e5f6`
- Display font: **Caveat** (Google Fonts) — the handwriting; this is the product signature
- Body font: **Inter** (Google Fonts)
- Visual references from the project:
  - The `.mark` marker highlight: uneven border-radius `0.6em 0.3em 0.55em 0.25em`,
    slight rotation, so it doesn't read as a software rectangle
  - The `.hand-underline`: a gradient underline thicker in the middle, tapering at the ends
  - The `write-in` keyframe: `opacity 0 → 1`, `translateY(5px) rotate(-0.3deg) → none`
  - Ruled paper with the punch-hole column at the left and the red margin rule

## Storyboard
Use the storyboard in `brag-output/brag-plan.md` as the creative contract.

Scene summary:
1. **The unattended pen** — 3.2s — transcript bubble types in, `mistake noted` tag, paper
   edge opens, first handwritten line draws. Read: *Nobody is taking notes.*
2. **The split** — 3.8s — the real two-surface layout; paper header, `Focus: Verb tense`,
   `Goal: …` write themselves. Read: **LinguaTrace** / *Live lesson companion*.
3. **The correction** — 4.5s — push in on the page: red strikethrough sweeps across the
   learner's sentence, green corrected line writes in underneath with a hand-drawn
   underline. Read: *It writes down what was actually taught.*
4. **Waiting for the correction** — 3.5s — a dotted pencil note and the grey line
   *waiting for Mark to correct this*. Read: *And it says when it doesn't know yet.*
5. **The switch** — 4.5s — the header toggle snaps Learner → Tutor, paper wipes to the dark
   tutor panel, three cards arrive one at a time. Read: *The tutor gets a different
   question answered.*
6. **The lesson, kept** — 2.0s — the full page, pulled back. Read: **LinguaTrace** /
   *the lesson, kept.*

## Audio
- Audio role: warm bed with sparse, motion-matched accents
- Audio arc: bed fades in under the typing, sits low through the paper scenes, lifts a
  touch into the tutor-card run, fades out as the page settles.
- Music: `happy-beats-business-moves-vol-12-by-ende-dot-app.mp3` (109.96 BPM, "steady and
  clean" — the polished-tone pick)
- Music treatment: start at 0, `data-volume` ~0.28–0.32, fade in ~0.6s, fade out over the
  final ~1.2s. Never let it sit above the pen and UI sounds.
- Music cue guidance: bundled preset —
  `<brag-skill-dir>/assets/music/cues/happy-beats-business-moves-vol-12-by-ende-dot-app.music-cues.json`
  - Strong cues to consider: **8.74s** (the green corrected line lands — lock this one),
    **13.11s** (the *waiting for Mark* note fades in), **17.47s** (first tutor card).
  - Beat grid for the three tutor cards: **17.47 / 18.56 / 19.66** (every other beat so
    each card holds ≥0.8s settled). Mark with `// beat-grid`.
  - Use at most 2 strong-cue locks; ignore any cue that hurts readability.
- Audio-reactive treatment: **subtle at most**. If used, let only the desk-side panel
  warmth or the paper's soft page shadow breathe with RMS. No waveform, no equalizer, no
  pulsing that touches text. Skipping audio-reactive entirely is acceptable for this tone —
  document the choice either way.
- Audio-coupled moments:
  - Scene 1, transcript typing — per-character key ticks (randomize `keyboard/keypress-*.wav`, thinned)
  - Scene 1–4, each handwritten line landing — one soft, dry stroke per line
  - Scene 3, the strikethrough and the corrected line — two strokes, the second softer
  - Scene 5, Learner → Tutor toggle — one quiet interface switch
  - Scene 5, three tutor cards — one soft card/drop sound each, on the beat grid
  - Scene 6, the final line resolving — one faint accent, then nothing
- SFX selection guidance: this is a `polished` edit — few cues, all quiet. Suggested
  families (choose exact files after the animation exists):
  - typing: `keyboard/keypress-*.wav` randomized, thinned, ~0.35 volume
  - pen/paper strokes: `interface/drop_001.ogg` / `drop_002.ogg` or
    `impact/impactWood_light_*.ogg` — warm and dry, ~0.4
  - toggle: `interface/switch_007.ogg` or `interface/switch_002.ogg`, ~0.5
  - tutor cards: `interface/drop_001.ogg` or `casino/card-slide-1.ogg`, ~0.45
  - final accent: `interface/bong_001.ogg` at low volume, or nothing
- SFX analysis guidance: `<brag-skill-dir>/assets/sfx/sfx-analysis.md`. Prefer the
  low-HF-risk picks (`impact/impactSoft_medium_*`, `interface/click_002/003/005`,
  `interface/glitch`-free choices); `casino/` is mostly high-HF-risk, so use at most one.
- Exact SFX choice: Hyperframes chooses filenames, timestamps, density, and volume based
  on the implemented animation.
- Audio files: copy the chosen music and every selected SFX into
  `brag-output/composition/assets/` (music under `assets/music/`, SFX under
  `assets/sfx/<family>/`). Relative paths only — never absolute.

## Hyperframes Instructions
Load the composition-building Hyperframes domain skills — `hyperframes-core` (composition
contract + `data-*` timing), `hyperframes-animation` (motion), `hyperframes-creative`
(design spec, beats, audio-reactive), `hyperframes-keyframes` (seek-safe keyframes), and
`hyperframes-cli` (lint/check/render). /brag is its own workflow: do not enter the
`hyperframes` entry-point intent interview and do not route into its generic promo /
launch-video workflow. Prefer native Hyperframes conventions over anything in `/brag`.

Requirements:
- Show real UI, copy, and visual elements from LinguaTrace — the ruled page, the
  correction pair, the tutor panel, all rebuilt in HTML/CSS.
- Keep all text readable in the final render (short label ≥0.8s settled; a sentence
  ≥0.3s per word, minimum 1.2s).
- Keep the video within 15–25 seconds (target 21.5s).
- Include the planned music and SFX layer.
- Treat `/brag` audio notes as guidance, not a fixed cue sheet. Choose SFX after the
  visual animation exists.
- Treat music cue metadata as optional timing hints. Lock at most 2 strong cues; snap the
  tutor cards to the beat grid within ±0.10s; mark both with `// beat-locked` /
  `// beat-grid` comments.
- Use local assets for audio and fonts where possible.
- Run `npx hyperframes check` before render — it is brag's single gate.
