"use client";

import { useEffect, useState } from "react";
import { ERROR_TYPE_LABELS, type ErrorType, type Notebook } from "@/lib/types";

/**
 * The tutor's side of the lesson.
 *
 * The learner's notebook answers "what did I learn?". This answers the tutor's
 * question, which is different and more urgent: what have I not dealt with yet,
 * and what should I do next? Everything here is already computed - uncorrected
 * mistakes come from the live notebook, recurring weaknesses from the learner's
 * stored history - and none of it was visible to the person who could act on it.
 */

interface Weakness {
  errorType: ErrorType;
  total: number;
  lessons: number;
  lessonsSinceSeen: number;
}

/**
 * A concrete thing to do about an error type.
 *
 * Fixed per type rather than generated: a suggestion the tutor can glance at and
 * run needs to be the same every time, and inventing exercises would be the app
 * teaching, which is not its job.
 */
const DRILL: Record<ErrorType, string> = {
  verb_tense: "Describe last weekend in the past simple, two minutes, no notes",
  word_order: "Read three scrambled sentences aloud and rebuild them",
  preposition: "Five sentences using in, on and at for times and places",
  article: "Describe a photo aloud, watching a, an and the",
  word_choice: "Give the better word for five sentences from this lesson",
  agreement: "Drill he, she and it with the third-person s",
  plural_form: "Count and describe objects around you, five plurals",
  other: "Say this lesson's corrected sentences back, out loud",
};

function Panel({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-panel-edge bg-panel p-4">
      <div className="flex items-baseline gap-2 mb-3">
        <h2 className="text-[11px] uppercase tracking-[0.14em] text-on-desk-soft">
          {title}
        </h2>
        {hint && <span className="text-[11px] text-on-desk-soft/60">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

export function TutorView({
  notebook,
  learnerId,
}: {
  notebook: Notebook;
  learnerId: string | null;
}) {
  const [weaknesses, setWeaknesses] = useState<Weakness[]>([]);
  const [lessons, setLessons] = useState(0);

  useEffect(() => {
    if (!learnerId) return;
    let cancelled = false;
    fetch(`/api/profile?learnerId=${encodeURIComponent(learnerId)}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled || !d.weaknesses) return;
        setWeaknesses(d.weaknesses);
        setLessons(d.lessons);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // Refetched when the lesson's mistakes change, so the panel keeps up.
  }, [learnerId, notebook.mistakes.length]);

  const uncorrected = notebook.mistakes.filter((m) => !m.corrected);
  /* Recurring means more than one lesson, and still current. A weakness the
     learner has stopped making is progress, not a thing to raise. */
  const recurring = weaknesses.filter(
    (w) => w.lessons > 1 && w.lessonsSinceSeen === 0,
  );
  const settled = weaknesses.filter((w) => w.lessonsSinceSeen > 0);

  const focus =
    recurring[0]?.errorType ??
    uncorrected[0]?.errorType ??
    notebook.mistakes[0]?.errorType;

  return (
    <div className="h-full overflow-y-auto space-y-3">
      <Panel
        title="Not yet corrected"
        hint={uncorrected.length > 0 ? "raise before the lesson ends" : undefined}
      >
        {uncorrected.length === 0 ? (
          <p className="text-[13px] text-on-desk-soft">
            Nothing outstanding. Everything flagged so far has been corrected.
          </p>
        ) : (
          <ul className="space-y-2">
            {uncorrected.map((m) => (
              <li key={m.id} className="flex items-baseline gap-2">
                <span aria-hidden className="text-[#ffb4b4] text-xs shrink-0">
                  ▲
                </span>
                <span className="text-[13px] leading-5 min-w-0">
                  “{m.said}”
                  <span className="block text-[11px] text-on-desk-soft">
                    {ERROR_TYPE_LABELS[m.errorType]}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        title="Carried over"
        hint={lessons > 0 ? `across ${lessons} previous ${lessons === 1 ? "lesson" : "lessons"}` : undefined}
      >
        {lessons === 0 ? (
          <p className="text-[13px] text-on-desk-soft">
            First lesson with this learner - nothing to carry over yet.
          </p>
        ) : recurring.length === 0 && settled.length === 0 ? (
          <p className="text-[13px] text-on-desk-soft">
            No pattern across previous lessons yet.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {recurring.map((w) => (
              <li
                key={w.errorType}
                className="flex items-baseline justify-between gap-3 text-[13px]"
              >
                <span>{ERROR_TYPE_LABELS[w.errorType]}</span>
                <span className="text-[11px] text-[#ffb4b4] shrink-0">
                  {w.lessons} lessons running
                </span>
              </li>
            ))}
            {settled.map((w) => (
              <li
                key={w.errorType}
                className="flex items-baseline justify-between gap-3 text-[13px] text-on-desk-soft"
              >
                <span>{ERROR_TYPE_LABELS[w.errorType]}</span>
                <span className="text-[11px] text-accent shrink-0">
                  not seen for {w.lessonsSinceSeen}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Suggested now">
        {focus ? (
          <>
            <p className="text-[13px] leading-5">{DRILL[focus]}</p>
            <p className="text-[11px] text-on-desk-soft mt-1.5">
              because of {ERROR_TYPE_LABELS[focus].toLowerCase()}
              {recurring[0]?.errorType === focus
                ? `, ${recurring[0].lessons} lessons running`
                : " in this lesson"}
            </p>
          </>
        ) : (
          <p className="text-[13px] text-on-desk-soft">
            Nothing to drill yet. Keep the conversation going.
          </p>
        )}
      </Panel>
    </div>
  );
}
