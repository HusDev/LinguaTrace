---
name: LinguaTrace
description: The lesson notebook that writes itself — a dark desk holding a live call, and a sheet of cream ruled paper holding what the learner keeps.
colors:
  desk: "#241b16"
  panel: "#2f251e"
  panel-raised: "#3a2e25"
  panel-edge: "#4a3a2e"
  desk-shadow: "#150f0c"
  on-desk: "#f2ebe3"
  on-desk-soft: "#a99a8d"
  accent: "#8fd9ac"
  accent-bg: "#2c5741"
  desk-red: "#f0998b"
  desk-green: "#7ddba4"
  paper: "#fbf7ec"
  paper-rule: "#e2ddcb"
  paper-margin: "#d98a8a"
  paper-hole: "#241b16"
  ink: "#2f2a25"
  ink-soft: "#7d7264"
  ink-red: "#c0392b"
  ink-green: "#2e7d4f"
  pen-blue: "#2f5d9e"
  mark-green: "#cde8d4"
  mark-pink: "#f7d9d7"
  mark-blue: "#d8e5f6"
  tape: "#e7d7a4"
typography:
  display:
    fontFamily: "Caveat, ui-rounded, cursive"
    fontSize: "clamp(2.6rem, 7vw, 5rem)"
    fontWeight: 400
    lineHeight: 0.94
    letterSpacing: "normal"
  headline:
    fontFamily: "Caveat, ui-rounded, cursive"
    fontSize: "clamp(2rem, 3.6vw, 2.9rem)"
    fontWeight: 400
    lineHeight: 1.25
    letterSpacing: "normal"
  title:
    fontFamily: "Caveat, ui-rounded, cursive"
    fontSize: "1.9rem"
    fontWeight: 400
    lineHeight: "2.6rem"
    letterSpacing: "normal"
  hand-note:
    fontFamily: "Caveat, ui-rounded, cursive"
    fontSize: "1.35rem"
    fontWeight: 400
    lineHeight: "2.25rem"
    letterSpacing: "normal"
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.65
    letterSpacing: "normal"
  body-small:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.7
    letterSpacing: "normal"
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "0.14em"
  figure:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "-0.01em"
    fontFeature: "tabular-nums"
rounded:
  chip: "4px"
  tab: "6px"
  control: "8px"
  object: "12px"
  panel: "16px"
  pill: "9999px"
  focus: "2px"
spacing:
  hair: "4px"
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "44px"
  rule-pitch: "36px"
  section: "96px"
  section-lg: "128px"
components:
  button-primary:
    backgroundColor: "{colors.accent-bg}"
    textColor: "{colors.accent}"
    rounded: "{rounded.object}"
    padding: "12px 24px"
    typography: "{typography.figure}"
  button-primary-hover:
    backgroundColor: "{colors.accent-bg}"
    textColor: "{colors.accent}"
  button-secondary:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.on-desk}"
    rounded: "{rounded.control}"
    padding: "8px 14px"
    typography: "{typography.body-small}"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.on-desk-soft}"
    typography: "{typography.body-small}"
  control-button:
    backgroundColor: "{colors.panel-raised}"
    textColor: "{colors.on-desk}"
    rounded: "{rounded.object}"
    padding: "12px 8px"
  control-button-active:
    backgroundColor: "{colors.accent-bg}"
    textColor: "{colors.accent}"
  pill-accent:
    backgroundColor: "{colors.accent-bg}"
    textColor: "{colors.accent}"
    rounded: "{rounded.pill}"
    padding: "4px 10px"
    typography: "{typography.label}"
  pill-muted:
    backgroundColor: "{colors.panel-raised}"
    textColor: "{colors.on-desk-soft}"
    rounded: "{rounded.pill}"
    padding: "4px 10px"
  input-field:
    backgroundColor: "{colors.panel-raised}"
    textColor: "{colors.on-desk}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
    typography: "{typography.body-small}"
  card-panel:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.on-desk}"
    rounded: "{rounded.panel}"
    padding: "14px"
  notebook-sheet:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.object}"
    padding: "28px 40px 28px 98px"
  chip-unsure:
    backgroundColor: "transparent"
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.chip}"
    padding: "1px 4px"
  taped-card:
    backgroundColor: "#ffffff"
    textColor: "{colors.ink}"
    rounded: "0px"
    padding: "28px 20px 24px"
---

# Design System: LinguaTrace

## Overview

**Creative North Star: "The Lit Desk at Night"**

Everything in this product happens on one of two surfaces, and they are deliberately unalike. A dark wooden desk — warm-brown, lit from the upper left so the work sits in a pool of light and the edges fall away — holds the live call, the controls, the transcript: software, disposable, gone when the lesson ends. A sheet of cream ruled paper, punched and held down with gaffer tape, holds the lesson notes: the thing the learner keeps. The contrast is not decoration, it is the argument. Because of that the design is fixed rather than following the system light/dark preference (`app/globals.css`, `:root`).

The density is two-speed. On the desk, the app is compact and plain: 11–15px Inter, soft panels, thin edges, one lit action. On the paper, it is loose and large: Caveat at 1.15–1.9rem on a 36px rule pitch, room between the lines, ink that lands rather than appears. Nothing is ever styled to look "like" the other surface; the chrome the browser normally supplies — selection, caret, scrollbar, focus ring — is themed from whichever surface it sits on, so the split survives even there.

The landing page (`components/Landing.tsx`) is the newest expression of the same world and takes nothing new from outside it: the demo is an object lying on the desk at 0.6deg with a deep blurred shadow, the notebook is the real component rendered from a scripted lesson rather than a screenshot, the marks beside the corrections are drawn strokes rather than font glyphs, and the one accent green appears exactly once per screen, on **Start a lesson**. The confirmed rejections are the centred-hero-over-screenshot default and the three-column feature grid; a page that explained two unalike surfaces in a card grid would be arguing against itself.

**Key Characteristics:**
- Two surfaces, never blended: dark desk and cream ruled paper
- A lit surface, not a flat background — the desk carries a light pool and falls to shadow at the edges
- One reserved accent green, spent once per screen on the primary action
- Handwriting for anything a person would have written; Inter for everything the machine says
- Soft, deep, blurred shadows — objects lie on the desk, they do not sit in cards
- Slight rotation and uneven radii wherever a human hand is implied
- Uncertainty is visible: tentative notes are dimmed and chipped, never asserted

## Colors

A single warm palette, split down the middle: one family for the lit desk, one for the paper and the pens that write on it, plus one reserved green.

### Primary
- **Lit Mint** (`{colors.accent}`): the one reserved accent. It is the text and border of the primary action, the active state of controls and tabs, and the "settled"/"live" signal in the rail. Never a background fill on its own; it always sits on **Pine Shadow** (`{colors.accent-bg}`), which is the only surface it is legible on.
- **Pine Shadow** (`{colors.accent-bg}`): the deep green bed under every accent element, and the fill of active tabs and chips.

### Secondary
- **Paper Cream** (`{colors.paper}`): the one bright object in the product. Reserved for the notebook sheet and things made from it (the play disc in the video facade). It is never a panel background on the desk.
- **Rule Grey** (`{colors.paper-rule}`) / **Margin Red** (`{colors.paper-margin}`) / **Punch Dark** (`{colors.paper-hole}`): the sheet's own anatomy — ruled lines at a 36px pitch, the vertical margin rule the writing starts after, and the punch holes. A sheet gets two holes; one hole reads as a stray dot.

### Tertiary
- **Correction Red** (`{colors.ink-red}`) and **Correction Green** (`{colors.ink-green}`): the tutor's two pens, on paper only. Red strikes the sentence that was said; green writes the one that should have been.
- **Desk Red** (`{colors.desk-red}`) and **Desk Green** (`{colors.desk-green}`): the same two marks lifted for the dark desk. Correction Red measures 4.9:1 on paper and 2.45:1 on the desk — under even the large-text floor — which left the page's own signature gesture as the faintest thing on it. These exist so the gesture survives the move.
- **Translation Blue** (`{colors.pen-blue}`): the one generated string on the page — a vocabulary gloss in the learner's own language — set in italic so it is visibly not the tutor's own words.
- **Marker Green / Pink / Blue** (`{colors.mark-green}`, `{colors.mark-pink}`, `{colors.mark-blue}`): highlighter behind paper headings; green for vocabulary and explanations, pink for corrections, blue for captures.
- **Gaffer Tape** (`{colors.tape}`): the tape holding photos and sheets down, always at 75–80% opacity with a slight counter-rotation.

### Neutral
- **Desk Brown** (`{colors.desk}`): the page ground and body background.
- **Panel** (`{colors.panel}`) / **Panel Raised** (`{colors.panel-raised}`) / **Panel Edge** (`{colors.panel-edge}`): the three-step tonal stack for surfaces on the desk — a section, a control or field inside it, and the hairline between them. Depth on the desk is tonal, not shadowed.
- **Desk Shadow** (`{colors.desk-shadow}`): the darkest fall-off of the light pool and the scrim over the video poster. Declared inline in `components/Landing.tsx`, not yet promoted to a custom property.
- **On Desk** (`{colors.on-desk}`) / **On Desk Soft** (`{colors.on-desk-soft}`): primary and secondary text on the desk. Secondary text also carries every hover promotion — soft to primary on link hover.
- **Ink** (`{colors.ink}`) / **Ink Soft** (`{colors.ink-soft}`): primary and secondary handwriting on paper. Ink Soft also carries the unresolved state: a mistake nobody has corrected yet is written in Ink Soft with a dotted underline, never struck in red.

### Named Rules
**The Two Surfaces Rule.** A dark desk holds the call; a cream sheet holds the lesson. Nothing blends them: no paper-tinted panels, no dark notebook, no system-preference switch. The contrast is the product's argument.

**The Paper/Desk Split Rule.** Ink tokens are for paper; desk tokens are for the desk. `ink-red` and `ink-green` never appear on the desk — use `desk-red` and `desk-green`. `on-desk` and `on-desk-soft` never appear on paper.

**The One Lit Action Rule.** The accent green is spent once per screen, on the single action that screen wants. If two things on a screen are mint, one of them is wrong.

**The Designed Chrome Rule.** Selection, caret, scrollbar and focus ring are themed, not inherited. Selection is Pine Shadow on the desk and Marker Green on paper; the caret is Ink inside `.paper`; the scrollbar is Panel Edge on Desk Brown; focus-visible is a 2px Lit Mint outline at 2px offset.

## Typography

**Display Font:** Caveat (`--font-hand`, via `next/font/google`)
**Body Font:** Inter (`--font-sans`, via `next/font/google`)

**Character:** Two voices, one per surface. Caveat is the hand — claims, headings, and every line in the notebook read as written rather than typeset. Inter is the machine — labels, explanations, controls, measurements. There is no third face and no decorative weight; Caveat carries size, Inter carries hierarchy through size and colour.

### Hierarchy
- **Display** (Caveat, `clamp(2.6rem, 7vw, 5rem)`, line-height 0.94): the single claim on the first screen, set as ink on the desk itself. One per page.
- **Headline** (Caveat, `clamp(2rem, 3.6vw, 2.9rem)`, tight): section headings on the landing page. Constrained to roughly 16–20ch so they break like a written line.
- **Title** (Caveat, 1.9rem/2.6rem desktop, 1.5rem/2.1rem mobile): the notebook's Focus and Goal lines, and the sign-in wordmark.
- **Hand note** (Caveat, 1.15rem/2rem mobile → 1.35rem/2.25rem desktop): every line written in the notebook — mistakes, corrections, vocabulary, explanations. Paper section headings sit one step above at 1.35–1.6rem.
- **Body** (Inter, 16–17px, line-height 1.65, max 46ch): the one supporting sentence under a display claim. Secondary prose runs 14–15px at line-height 1.7 and 52–64ch.
- **Body small** (Inter, 13px): navigation links, secondary buttons, transcript turns, form fields.
- **Label** (Inter, 11px, letter-spacing 0.14em, uppercase): the section label at the top of a desk panel or list. It labels a panel; it is never set above a headline as a kicker.
- **Figure** (Inter, 15px, `tabular-nums`, letter-spacing -0.01em): measured values, so digits line up column-wise down a results list.

### Named Rules
**The Hand and Machine Rule.** If a person would have written it, it is Caveat. If the software is saying it, it is Inter. A measurement, a control label, a status, a caveat about sample size: Inter, always.

**The Two Faces Rule.** Caveat and Inter, both loaded through `next/font`. No third family, no system display stack, no web-font swap-in for a decorative moment.

**The Sample Size Rule.** A figure is never set alone. Every measurement carries its n in the same line ("100% · 45 labelled cases"), because a figure without its sample size is a claim rather than a measurement.

## Layout

**Container.** One column, max width 1180px, gutters 20px rising to 32px at `sm`. App screens use a narrower 1000px container at 16–24px padding. Nothing is centred as a column of prose over a full-bleed image.

**Rhythm.** Sections are separated by 96px, rising to 128px at `sm`. Within a section the steps are 4 / 8 / 12 / 16 / 24 / 44px. The notebook has its own rhythm: a 36px rule pitch that the handwriting's line-height matches exactly, so words and lines stay in step down the page instead of drifting apart.

**First screen.** An asymmetric two-column grid at `lg` (0.92fr / 1.18fr, 40–56px gap) filling `calc(100svh - 150px)`: the claim and the single action on the narrow left, the demo lying on the desk on the wide right, and the cream sheet entering from the bottom-left, rotated -1.1deg and translated 38% below the fold so it is cropped by the viewport. Below `lg` the sheet is dropped entirely rather than reflowed — it is a promise of the page below, and a full sheet stacked in the flow would be a different statement.

**Notebook geometry.** The margin rule sits at 40px on mobile and 74px at `lg`; writing starts at 52px / 98px. Punch holes are 10px / 14px discs at 85% opacity, two per sheet, aligned in the margin gutter.

**Responsive.** Single breakpoint family, Tailwind defaults (`sm` 640, `md` 768, `lg` 1024, `xl` 1280). Grids collapse to one column; taped cards go 1 → 2 → 3 across `sm` and `xl`. Beside a live call the notebook is a fixed panel that scrolls inside itself; opened on its own it flows with the page, because a scroll container nested in another leaves the notes stuck in a short box.

### Named Rules
**The Off-Grid Rule.** Anything meant to read as a physical object is rotated by a fraction of a degree (0.6deg, -1.1deg, -1.2deg, 0.8deg, 1.4deg) and offset from its container's alignment. Perfect alignment is what makes something read as a card.

## Elevation & Depth

The system uses two different depth models, one per surface.

On the **desk**, depth is tonal: Panel over Desk, Panel Raised over Panel, a 1px Panel Edge hairline between. Desk panels carry no shadow at all.

On top of the desk, **objects cast real light**. Anything that is supposed to be lying on the surface — the demo screen, the notebook sheet, a taped photo, the play disc — carries a deep, wide, soft shadow with a large negative spread, plus a fraction of a degree of rotation. The shadows are never hard-offset and never tight; the light source is upper-left and far away. The desk itself is lit by a radial gradient (85% 65% at 22% 2%) running Panel Edge → mid-brown → Desk → Desk Shadow, so the work sits in light and the edges fall away.

### Shadow Vocabulary
- **Object on desk, near** (`box-shadow: 0 8px 30px rgba(0,0,0,0.35)`): the notebook sheet in the app layout.
- **Object on desk, lifted** (`box-shadow: 0 40px 80px -18px rgba(0,0,0,0.8)`): the demo screen and the full-width notebook on the landing page (`0 40px 90px -30px`).
- **Object below the fold** (`box-shadow: 0 -10px 50px -12px rgba(0,0,0,0.75)`): the cream sheet rising into the first screen, lit from above rather than below.
- **Accent glow** (`box-shadow: 0 10px 30px -10px rgba(143,217,172,0.45)`): under the primary action only. This is the "lit key" of the one lit action; it is not a hover effect and is not reused.
- **Taped in** (`box-shadow: 0 2px 10px rgba(0,0,0,0.13)` for the card, `0 2px 7px rgba(0,0,0,0.16)` for the tape): small, close shadows for paper on paper.
- **Drop shadow on the mark** (`drop-shadow(0 3px 10px rgba(0,0,0,0.5))`): the logo on the desk, so it reads as an object rather than an inline SVG.

### Named Rules
**The Object-Not-Card Rule.** If it should read as a thing on the desk, it gets a wide soft shadow and a fraction of a degree of rotation. If it is a region of the interface, it gets a tonal step and a hairline edge, and no shadow at all. Never both.

**The Soft Light Rule.** Every shadow is blurred and offset downward from an upper-left source. No hard offset shadows, no rings, no glass, no backdrop blur.

## Shapes

A soft, consistent corner language on the desk and a deliberately imperfect one on paper.

**Desk radii** climb with the size of the thing: 6px for a tab inside a strip, 8px for a control, field or secondary button, 12px for a primary action or a placed object, 16px for a panel. Pills and avatars are fully round. The focus ring rounds to 2px so it hugs whatever it outlines.

**Borders** on the desk are always 1px Panel Edge, or Lit Mint at 40–60% alpha when active. There are no double borders and no dividers heavier than 1px; result lists are ruled with Panel Edge at 70% opacity.

**Paper shapes are hand-made.** The marker highlight (`.mark`) uses four different corner radii (0.6em / 0.3em / 0.55em / 0.25em) with `box-decoration-break: clone`, so it never reads as a rectangle drawn by software. Gaffer tape is cut with a six-point `clip-path` polygon whose edges are all slightly off, and rotated -2 to -3deg. Taped cards have square corners — they are photographs. The hand-drawn underline (`.hand-underline`) is a 1.5px gradient that tapers to transparent at both ends.

### Named Rules
**The Uneven Hand Rule.** Anything that represents a hand-made mark gets asymmetry: uneven radii, a clipped polygon, or a rotation. A symmetric rounded rectangle on paper is a bug.

## Components

### Buttons
- **Shape:** softly rounded — 12px (`{rounded.object}`) for primary actions and placed objects, 8px (`{rounded.control}`) for everything else.
- **Primary:** Pine Shadow fill, Lit Mint text, 1px Lit Mint border at 40% alpha, medium weight, 24px × 12px padding at landing scale and 16px × 8–10px in-app. On the landing page only it also carries the accent glow shadow.
- **Hover / Focus:** the border goes to Lit Mint at 70%; fill and text do not change. Transitions are `transition-colors` only, at the browser default duration. Focus is the global 2px Lit Mint outline.
- **Secondary:** Panel fill, On Desk text, 1px Panel Edge border; hover lifts the border to On Desk Soft at 50%.
- **Quiet / link:** On Desk Soft text, no box; hover promotes to On Desk. This is the second action beside every primary ("See what it writes", "Read the code", "GitHub", "Sign in").
- **Disabled:** opacity 35–50%, no colour change.
- **Control button** (the mic / camera / capture cluster): Panel Raised over a 1px Panel Edge, 12px radius, icon above an 11px label, equal flex widths. Active swaps to Pine Shadow at 50% with a Lit Mint border and Lit Mint content. Icons are inline SVG at 17px, 1.8 stroke, round caps.

### Chips
- **Pill (accent):** Pine Shadow fill, Lit Mint text, fully round, 10px × 4px, 11px medium. Used for live status and settled percentages.
- **Pill (muted):** Panel Raised fill, On Desk Soft text, same geometry. Used for "Not started", "First lesson", and reconnecting states.
- **Focus chip (paper):** Marker Green fill, Ink text, fully round, 14px × 6px, Caveat at 1.125rem, with a small bar glyph — the lesson's focus and correction count.
- **Unsure chip (paper):** no fill, Ink Soft text with a 40%-alpha Ink Soft border, 4px radius, 9px uppercase Inter with wide tracking, carried inline after a tentative line. The line itself drops to 66% opacity (`.tentative`).

### Cards / Containers
- **Desk panel:** 16px radius, Panel fill, 1px Panel Edge border, 14px internal padding, no shadow. This is the default container for everything on the desk.
- **Stat / list card:** 12px radius, Panel fill, 1px Panel Edge, 16px × 12–16px padding; hover raises the border to Lit Mint at 50% when the card is a link.
- **Notebook sheet:** 12px radius, Paper Cream ruled at a 36px pitch, punch holes and margin rule absolutely positioned in the left gutter, Ink text, generous asymmetric padding (98px left at `lg`), and an object shadow. Never bordered.
- **Taped card:** square corners, white fill, 20px × 24–28px padding, a small close shadow, a strip of Gaffer Tape overlapping the top edge, and a rotation of ±0.8–1.4deg.

### Inputs / Fields
- **Style:** Panel Raised fill, 1px Panel Edge, 8px radius, 12px × 8px padding, 13–14px Inter. Placeholders are On Desk Soft at 60–70%.
- **Focus:** the global 2px Lit Mint outline at 2px offset. No border-colour change, no glow.
- **Disabled:** opacity 40%.
- **Error notice:** a 12px block above the submit button, background `#4a2424`, border `#6b3333`, text `#ffb4b4`, 8px radius. These three values are literals in `app/login/page.tsx` and are not yet tokens.

### Navigation
- **Landing header:** the mark at 32px, the wordmark at 14px semibold, then quiet links pushed right at 13px On Desk Soft with an On Desk hover. No underline, no nav background, no sticky bar.
- **Tab strip:** a 8px-radius Panel box with 1px Panel Edge and 2px inner padding, holding equal-width 6px-radius tabs at 12px. The selected tab fills Pine Shadow with Lit Mint text; the rest are On Desk Soft on transparent.
- **Segmented filters:** 8px-radius bordered buttons at 12px; selected is Pine Shadow at 50% with a Lit Mint border.

### The Notebook (signature)
The one component that is also the product. A ruled cream sheet whose rule pitch equals the handwriting's line-height; a red margin rule the writing starts after; two punch holes; a Caveat Focus/Goal block at the top with a Marker Green focus chip opposite; marker-highlighted section headings (green for vocabulary and explanations, pink for corrections); and a row of taped-in cards along the bottom edge. New lines arrive with `.written` — a 340ms `write-in` that fades them in from 5px below with a -0.3deg tilt, like ink landing on paper — disabled entirely under `prefers-reduced-motion: reduce`.

A resolved mistake is struck in Correction Red with the corrected sentence beneath it in Correction Green under a hand-drawn underline. An unresolved one is never struck: it is Ink Soft with a dotted underline and a plain note saying what it is waiting for. Striking out a sentence and offering nothing in its place tells the learner they are wrong and leaves them there.

### The Scroll Strike (signature)
`.strike` draws a 1.5px Desk Red line through a sentence as it scrolls into view — the same gesture the notebook makes when a tutor corrects something, used on the landing page against the visitor's own assumptions. **The struck state is the default.** The draw lives inside `@supports (animation-timeline: view())` nested in `@media (prefers-reduced-motion: no-preference)`, so a browser without scroll-driven animation, or a reader who has asked for less motion, sees the finished correction rather than an unstruck claim. The meaning survives; only the drawing is lost.

### The Mark
A ruled page with two punch holes and a red margin rule, a sentence struck out in red, the correction under it in green, and a third line still being written (`components/Logo.tsx`, `app/icon.svg`). Every colour in it is a palette token, so the mark cannot drift away from the product it stands for. On the desk it carries a drop shadow; in a footer it drops to 80% opacity.

### The Video Facade
Third-party players arrive with their own palette. The poster frame stands in until someone asks for the video, with the play control drawn in the page's own materials — a 68px Paper Cream disc with an Ink triangle, placed off-centre at the bottom-right so it does not cover the struck line the poster exists to show — over a Desk Shadow scrim at 25% that lifts to 10% on hover. The real player is only fetched on the click that wants it.

## Do's and Don'ts

### Do:
- **Do** keep the two surfaces unalike. Desk tokens on the desk, paper tokens on paper, and nothing in between.
- **Do** use `desk-red` (#f0998b) and `desk-green` (#7ddba4) whenever a correction gesture appears on the desk. `ink-red` measures 2.45:1 there, below even the large-text floor.
- **Do** spend the accent green exactly once per screen, on the primary action, on a Pine Shadow bed.
- **Do** set anything a person would have written in Caveat, and everything the software says in Inter.
- **Do** give placed objects a wide soft shadow and a fraction of a degree of rotation; give interface regions a tonal step and a 1px Panel Edge hairline.
- **Do** draw marks — crosses, ticks, play triangles, mic icons — as inline SVG with a shared stroke weight and cap, so a pair of marks looks like one pen.
- **Do** state every measurement with its sample size in the same line.
- **Do** show uncertainty: 66% opacity plus an "unsure" chip for a tentative line, and a quiet dotted underline for a mistake nobody has corrected yet.
- **Do** theme the browser's own surfaces — selection, caret, scrollbar, focus ring — from whichever surface they sit on.
- **Do** ship motion as an enhancement: the struck/finished state is the default, and the animation is nested inside both a `@supports` test and a reduced-motion query.

### Don't:
- **Don't** introduce a third type family, a system display stack, or a decorative web font. Caveat and Inter only.
- **Don't** put a small uppercase label above a headline as a kicker or eyebrow. The 11px/0.14em label exists to title a desk panel or list, nothing else.
- **Don't** use hard offset shadows, rings, glass, or backdrop blur. Shadows are blurred, downward, and from an upper-left source.
- **Don't** use a font glyph (✗, ✓, ▶, •) as an icon in new work. The landing page's `PenMark` is the precedent: draw it.
- **Don't** follow the system light/dark preference. The palette is fixed because the contrast between the two surfaces is the argument.
- **Don't** let the accent be a large fill. It is text, a border, and a small bed — never a wide mint block.
- **Don't** give paper a symmetric rounded-rectangle highlight or perfectly cut tape. Hand-made marks are uneven on purpose.
- **Don't** strike an uncorrected mistake in red. Red means a correction exists beneath it.
- **Don't** nest a scrolling container inside another scrolling container; let the document flow when it is the whole page.
- **Don't** let a third-party embed set the palette of a first screen. Stand a facade in the page's own materials in front of it.
