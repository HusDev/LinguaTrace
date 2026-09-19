"use client";

import type { ReactNode } from "react";
import { ERROR_TYPE_LABELS, type Notebook } from "@/lib/types";
import { lessonFocus, progressNote } from "@/lib/derive";

/** A marker-pen highlight behind a heading. */
function Mark({
  tone,
  children,
}: {
  tone: "green" | "pink" | "blue";
  children: ReactNode;
}) {
  const background = {
    green: "bg-mark-green",
    pink: "bg-mark-pink",
    blue: "bg-mark-blue",
  }[tone];
  return <span className={`mark ${background} text-ink`}>{children}</span>;
}

function Unsure({ when }: { when: boolean }) {
  if (!when) return null;
  return (
    <span
      className="ml-2 align-middle whitespace-nowrap inline-block shrink-0 font-sans text-[9px] uppercase tracking-wider text-ink-soft border border-ink-soft/40 rounded px-1 py-px"
      title="The model was not confident here. Check it before relying on it."
    >
      unsure
    </span>
  );
}

/** A photo taped into the notebook. */
function Taped({
  tone,
  title,
  rotate,
  children,
}: {
  tone: "green" | "pink" | "blue";
  title: string;
  rotate: string;
  children: ReactNode;
}) {
  return (
    <figure
      className={`written relative bg-white px-5 pt-7 pb-6 shadow-[0_2px_10px_rgba(0,0,0,0.13)] ${rotate}`}
    >
      {/* The tape, overlapping the top edge. */}
      <span
        aria-hidden
        className="absolute -top-2.5 left-1/2 -translate-x-1/2 h-5 w-20 bg-tape/80 rotate-[-2deg]"
      />
      <figcaption className="font-hand text-xl mb-3">
        <Mark tone={tone}>{title}</Mark>
      </figcaption>
      {children}
    </figure>
  );
}

/**
 * One mistake, with or without its correction.
 *
 * An uncorrected mistake is deliberately not struck through in red. Striking out
 * a sentence and offering nothing in its place tells the learner they are wrong
 * and leaves them there. Until a correction arrives it is a pencil note in the
 * margin: flagged, and quieter than the corrections that are resolved.
 *
 * What it says while it waits depends on whether anyone is coming. The app never
 * invents a correction - only the tutor's own words become one - so with a tutor
 * in the lesson the note names them, and without one it says plainly that the
 * mistake was only flagged. Promising a correction that cannot arrive is worse
 * than admitting none will.
 */
function Correction({
  said,
  corrected,
  note,
  unsure,
  pending,
}: {
  said: string;
  corrected?: string;
  note?: string;
  unsure?: boolean;
  /** What to say while no correction has arrived. */
  pending?: string;
}) {
  const resolved = Boolean(corrected);

  return (
    <div className={`written font-hand text-[1.15rem] lg:text-[1.35rem] leading-8 lg:leading-9 ${unsure ? "tentative" : ""}`}>
      {/* Inline rather than flex: in a narrow taped card, a flex row leaves the
          mark stranded on a line of its own while the sentence wraps below. */}
      <p className={resolved ? "text-ink-red" : "text-ink-soft"}>
        <span aria-hidden className="mr-2">
          {resolved ? "✗" : "~"}
        </span>
        <span
          className={
            resolved ? "line-through decoration-ink-red/70" : "underline decoration-dotted decoration-ink-soft/60 underline-offset-4"
          }
        >
          {said}
        </span>
        {note && <span className="ml-3 text-lg opacity-80">({note})</span>}
      </p>
      {resolved ? (
        <p className="text-ink-green">
          <span aria-hidden className="mr-2">
            ✓
          </span>
          <span className="hand-underline">{corrected}</span>
          <span className="ml-3 text-lg opacity-80">(correct)</span>
        </p>
      ) : (
        pending && <p className="text-ink-soft/70 text-lg pl-7">{pending}</p>
      )}
    </div>
  );
}

export function NotebookPage({
  notebook,
  previous,
  captures,
  date,
}: {
  notebook: Notebook;
  previous?: Notebook;
  captures: Array<{ id: string; dataUrl: string; kind: "camera" | "whiteboard" }>;
  date: string;
}) {
  const focus = lessonFocus(notebook);
  const progress = progressNote(notebook, previous);
  const goal = notebook.goals[0];
  const explanation = notebook.grammar[0];
  const paired = notebook.mistakes.filter((m) => m.corrected);
  /* Only a tutor's own words become a correction, so whether one can still
     arrive depends on whether a tutor is taking part at all. */
  const tutorPresent = notebook.turns.some((turn) => turn.speaker === "tutor");
  const pendingNote = tutorPresent
    ? `waiting for ${notebook.tutorName} to correct this`
    : "flagged for practice - no tutor in this lesson";
  const empty =
    notebook.mistakes.length === 0 &&
    notebook.vocabulary.length === 0 &&
    notebook.grammar.length === 0;

  /* On a phone the page scrolls, so the paper grows with its content; on the
     desk it is a fixed panel that scrolls inside itself. A scroll container
     nested inside another leaves the notes stuck in a short box. */
  return (
    <div className="paper rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.35)] w-full min-h-full lg:h-full lg:overflow-y-auto relative">
      {/* Punch holes and the margin rule. */}
      <div aria-hidden className="absolute left-0 top-0 bottom-0 w-10 lg:w-[74px]">
        <span className="absolute left-3 lg:left-7 top-[76px] h-2.5 w-2.5 lg:h-3.5 lg:w-3.5 rounded-full bg-paper-hole/85" />
        <span className="absolute left-3 lg:left-7 top-[480px] h-2.5 w-2.5 lg:h-3.5 lg:w-3.5 rounded-full bg-paper-hole/85" />
      </div>
      <div
        aria-hidden
        className="absolute left-10 lg:left-[74px] top-0 bottom-0 w-px bg-paper-margin"
      />

      <div className="pl-[52px] pr-4 lg:pl-[98px] lg:pr-10 py-5 lg:py-7 text-ink min-h-full">
        <header className="flex items-baseline justify-between font-sans text-[11px] text-ink-soft mb-5">
          <span>
            {notebook.learnerName === "Learner"
              ? "Lesson notes"
              : `${notebook.learnerName}'s lesson notes`}
            {date && ` · ${date}`}
          </span>
          <span>AI field notes</span>
        </header>

        <div className="flex flex-col lg:flex-row items-start lg:justify-between gap-3 lg:gap-8">
          <div className="font-hand text-[1.5rem] leading-[2.1rem] lg:text-[1.9rem] lg:leading-[2.6rem] min-w-0">
            {focus && (
              <p>
                <span className="text-ink-red">Focus:</span> {focus}
              </p>
            )}
            {goal && (
              <p className={goal.provenance.certainty === "tentative" ? "tentative" : ""}>
                <span className="text-ink-red">Goal:</span> {goal.text}
                <Unsure when={goal.provenance.certainty === "tentative"} />
              </p>
            )}
          </div>

          {focus && (
            <div className="shrink-0 lg:text-right">
              <span className="inline-flex items-center gap-2 rounded-full bg-mark-green px-3.5 py-1.5 font-hand text-lg text-ink">
                <span aria-hidden>▊▌▎</span>
                {focus} · {notebook.mistakes.length}{" "}
                {notebook.mistakes.length === 1 ? "correction" : "corrections"}
              </span>
              {progress && (
                <p className="font-hand text-xl text-ink-green mt-2 hand-underline inline-block">
                  {progress}
                </p>
              )}
            </div>
          )}
        </div>

        {empty && (
          <p className="font-hand text-2xl text-ink-soft/50 mt-6">
            Nothing written yet. The notebook fills as you talk.
          </p>
        )}

        {notebook.vocabulary.length > 0 && (
          <section className="mt-7">
            <h3 className="font-hand text-[1.35rem] lg:text-[1.6rem] mb-2">
              <Mark tone="green">New vocabulary:</Mark>
            </h3>
            <ul className="font-hand text-[1.15rem] lg:text-[1.35rem] leading-8 lg:leading-9 pl-2 lg:pl-6">
              {notebook.vocabulary.map((v) => (
                <li
                  key={v.id}
                  className={`written flex flex-wrap lg:flex-nowrap items-baseline gap-x-3 ${v.provenance.certainty === "tentative" ? "tentative" : ""}`}
                >
                  <span aria-hidden className="text-ink-soft shrink-0">
                    •
                  </span>
                  <span className="font-semibold shrink-0">{v.term}</span>
                  <Unsure when={v.provenance.certainty === "tentative"} />
                  <span aria-hidden className="text-ink-soft shrink-0">
                    —
                  </span>
                  {/* The translation is the one generated string on the page, so
                      it is set apart from the tutor's own words rather than run
                      together with them. */}
                  {v.translation && (
                    <span
                      className="shrink-0 text-pen-blue italic"
                      title={`${v.term} in the learner's own language`}
                    >
                      {v.translation}
                    </span>
                  )}
                  {/* A tutor can explain a word for three sentences. The line
                      stays one line; the Lesson Pack keeps the full text. */}
                  <span
                    className="text-ink-soft min-w-0 basis-full lg:basis-auto lg:truncate"
                    title={v.context}
                  >
                    {v.context}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {notebook.mistakes.length > 0 && (
          <section className="mt-7">
            <h3 className="font-hand text-[1.35rem] lg:text-[1.6rem] mb-2">
              <Mark tone="pink">Corrections:</Mark>
            </h3>
            <div className="space-y-3 pl-2">
              {notebook.mistakes.map((m) => (
                <Correction
                  key={m.id}
                  said={m.said}
                  corrected={m.corrected}
                  pending={pendingNote}
                  note={ERROR_TYPE_LABELS[m.errorType]}
                  unsure={
                    m.provenance.certainty === "tentative" ||
                    m.correctionProvenance?.certainty === "tentative"
                  }
                />
              ))}
            </div>
          </section>
        )}

        {explanation && (
          <section className="mt-7">
            <h3 className="font-hand text-[1.35rem] lg:text-[1.6rem] mb-2">
              <Mark tone="green">Tutor explanation:</Mark>
            </h3>
            <p
              className={`written font-hand text-[1.15rem] lg:text-[1.35rem] leading-8 lg:leading-9 pl-2 lg:pl-6 hand-underline inline-block ${
                explanation.provenance.certainty === "tentative" ? "tentative" : ""
              }`}
            >
              {explanation.text}
            </p>
          </section>
        )}

        {/* Cards taped in along the bottom edge of the page. */}
        {(paired.length > 0 || notebook.vocabulary.length > 0 || captures.length > 0) && (
          <div className="mt-10 grid gap-6 sm:grid-cols-2 xl:grid-cols-3 pb-4">
            {paired[0]?.corrected && (
              <Taped tone="pink" title="Tutor correction" rotate="rotate-[-1.2deg]">
                <Correction
                  said={paired[0].said}
                  corrected={paired[0].corrected}
                />
                {explanation && (
                  <p className="font-hand text-lg text-ink-soft mt-4 pt-3 border-t border-ink/10">
                    {notebook.tutorName} says:
                    <span className="block text-ink/80">
                      &ldquo;{explanation.text}&rdquo;
                    </span>
                  </p>
                )}
              </Taped>
            )}

            {notebook.vocabulary.length > 0 && (
              <Taped tone="green" title="Useful phrases" rotate="rotate-[0.8deg]">
                <ul className="font-hand text-[1.2rem] leading-8 pl-4">
                  {notebook.vocabulary.slice(0, 5).map((v) => (
                    <li key={v.id} className="flex gap-2">
                      <span aria-hidden className="text-ink-soft">
                        •
                      </span>
                      {v.term}
                    </li>
                  ))}
                </ul>
                <p className="font-hand text-lg text-ink-soft mt-4 pt-3 border-t border-ink/10">
                  Try these in your next conversation.
                </p>
              </Taped>
            )}

            {captures.map((capture, i) => {
              const fromBoard = capture.kind === "whiteboard";
              return (
                <Taped
                  key={capture.id}
                  tone="blue"
                  title={fromBoard ? "Whiteboard capture" : "Captured moment"}
                  rotate={i % 2 === 0 ? "rotate-[1.4deg]" : "rotate-[-0.9deg]"}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={capture.dataUrl}
                    alt={
                      fromBoard
                        ? "A snapshot of the lesson whiteboard"
                        : "A frame captured from the lesson video"
                    }
                    className={`w-full rounded-sm border border-ink/10 ${fromBoard ? "bg-white" : ""}`}
                  />
                  <p className="font-hand text-lg text-ink-soft mt-3">
                    {fromBoard
                      ? "Drawn on the whiteboard during the lesson."
                      : "Captured from the call."}
                  </p>
                </Taped>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
