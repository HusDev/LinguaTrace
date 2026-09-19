"use client";

import { useState } from "react";
import type { LessonPack } from "@/lib/lessonPack";

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-card-edge bg-card p-4">
      <h3 className="text-[11px] uppercase tracking-[0.14em] text-ink-soft mb-3">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Flashcard({
  front,
  back,
  translation,
}: {
  front: string;
  back: string;
  translation?: string;
}) {
  const [flipped, setFlipped] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setFlipped((f) => !f)}
      className="text-left w-full rounded-md border border-card-edge px-3 py-2 hover:border-pen transition-colors"
      aria-label={`Flashcard: ${front}. Click to ${flipped ? "hide" : "show"} the example.`}
    >
      <span className="font-hand text-2xl text-pen">{front}</span>
      {translation && (
        <span className="block font-hand text-lg text-pen-blue italic">
          {translation}
        </span>
      )}
      {flipped && (
        <span className="block text-sm text-ink-soft mt-1">{back}</span>
      )}
    </button>
  );
}

function Exercise({
  prompt,
  answer,
  hint,
}: {
  prompt: string;
  answer: string;
  hint: string;
}) {
  const [value, setValue] = useState("");
  const [checked, setChecked] = useState(false);
  const correct = value.trim().toLowerCase() === answer.toLowerCase();

  return (
    <li className="rounded-md border border-card-edge px-3 py-2">
      <p className="font-hand text-xl leading-7">{prompt}</p>
      <p className="text-[11px] text-ink-soft mt-1">{hint}</p>
      <div className="flex gap-2 mt-2">
        <input
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setChecked(false);
          }}
          placeholder="your answer"
          aria-label={`Answer for: ${prompt}`}
          className="flex-1 min-w-0 rounded border border-card-edge bg-transparent px-2 py-1 text-sm"
        />
        <button
          type="button"
          onClick={() => setChecked(true)}
          className="rounded border border-card-edge px-3 py-1 text-sm hover:border-pen"
        >
          Check
        </button>
      </div>
      {checked && (
        <p
          className={`text-sm mt-1.5 ${correct ? "text-pen-correct" : "text-pen-error"}`}
        >
          {correct ? "Correct." : `Not quite - the tutor said “${answer}”.`}
        </p>
      )}
    </li>
  );
}

export function LessonPackView({ pack }: { pack: LessonPack }) {
  return (
    <div className="space-y-4">
      <Card title="Summary">
        <p className="text-sm leading-6">{pack.summary}</p>
      </Card>

      {pack.correctedSentences.length > 0 && (
        <Card title="Corrected sentences">
          <ul className="space-y-2">
            {pack.correctedSentences.map((c, i) => (
              <li key={i} className="text-sm">
                <span className="text-pen-error line-through">{c.said}</span>
                <span className="mx-2 text-ink-soft">→</span>
                <span className="text-pen-correct">{c.corrected}</span>
                <span className="ml-2 text-[11px] text-ink-soft">{c.errorType}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {pack.flashcards.length > 0 && (
        <Card title="Flashcards">
          <div className="grid gap-2 sm:grid-cols-2">
            {pack.flashcards.map((f, i) => (
              <Flashcard key={i} front={f.front} back={f.back} translation={f.translation} />
            ))}
          </div>
        </Card>
      )}

      {pack.exercises.length > 0 && (
        <Card title="Exercises from your own mistakes">
          <ul className="space-y-2">
            {pack.exercises.map((e, i) => (
              <Exercise key={i} {...e} />
            ))}
          </ul>
        </Card>
      )}

      {pack.checklist.length > 0 && (
        <Card title="Practice checklist">
          <ul className="space-y-1.5 text-sm">
            {pack.checklist.map((c, i) => (
              <li key={i} className="flex gap-2">
                <span aria-hidden className="text-ink-soft">☐</span>
                {c}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {pack.nextTopics.length > 0 && (
        <Card title="Suggested for next lesson">
          <ul className="space-y-1.5 text-sm list-disc pl-4">
            {pack.nextTopics.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </Card>
      )}

      {pack.progress && (
        <Card title="Progress since last lesson">
          <p className="text-sm">
            {pack.progress.currentMistakeCount} corrections this lesson, against{" "}
            {pack.progress.previousMistakeCount} last time.
          </p>
          {pack.progress.resolvedErrorTypes.length > 0 && (
            <p className="text-sm text-pen-correct mt-1">
              No longer coming up: {pack.progress.resolvedErrorTypes.join(", ")}.
            </p>
          )}
          {pack.progress.persistentErrorTypes.length > 0 && (
            <p className="text-sm text-ink-soft mt-1">
              Still to work on: {pack.progress.persistentErrorTypes.join(", ")}.
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
