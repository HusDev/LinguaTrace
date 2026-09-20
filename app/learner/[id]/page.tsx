import Link from "next/link";
import { notFound } from "next/navigation";
import { redirect } from "next/navigation";
import { getLearner, listLessons, weaknessProfile } from "@/lib/db";
import { currentAccount } from "@/lib/auth";
import { ERROR_TYPE_LABELS } from "@/lib/types";

export const dynamic = "force-dynamic";

function when(at: number) {
  return new Date(at).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Describe how a weakness is trending, in words rather than a number.
 *
 * "Verb tense, 4 lessons" is a fact the app could not state before it stored
 * anything, and it is the fact a tutor most wants before the next lesson.
 */
function trend(lessons: number, lessonsSinceSeen: number) {
  if (lessonsSinceSeen === 0) {
    return lessons === 1
      ? { text: "new this lesson", tone: "text-on-desk-soft" }
      : { text: `${lessons} lessons running`, tone: "text-[#ffb4b4]" };
  }
  return {
    text: `not seen for ${lessonsSinceSeen} ${lessonsSinceSeen === 1 ? "lesson" : "lessons"}`,
    tone: "text-accent",
  };
}

export default async function LearnerHome({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  /* A learner's history is theirs and their tutor's. Anyone else - including
     another learner who guessed the link - gets nothing. */
  const me = await currentAccount();
  if (!me) redirect(`/login?next=${encodeURIComponent(`/learner/${id}`)}`);
  if (me.role === "learner" && me.id !== id) notFound();

  const learner = getLearner(id);
  if (!learner) notFound();

  const lessons = listLessons(id);
  const weaknesses = weaknessProfile(id);
  const finished = lessons.filter((l) => l.endedAt !== null);

  const totals = finished.reduce(
    (acc, l) => ({
      mistakes: acc.mistakes + l.mistakes,
      corrected: acc.corrected + l.corrected,
      vocabulary: acc.vocabulary + l.vocabulary,
    }),
    { mistakes: 0, corrected: 0, vocabulary: 0 },
  );

  return (
    <main className="flex-1 max-w-[1000px] w-full mx-auto p-4 sm:p-6">
      <header className="flex flex-wrap items-baseline gap-3 mb-8">
        <h1 className="font-hand text-4xl leading-none">{learner.name}</h1>
        <p className="text-sm text-on-desk-soft mr-auto">
          Learning {learner.targetLanguage} · speaks {learner.nativeLanguage}
        </p>
        <Link
          href="/"
          className="rounded-lg bg-accent-bg text-accent border border-accent/40 px-4 py-2 text-[13px] font-medium"
        >
          {me.role === "tutor" ? "Start a lesson" : "Go to the lesson"}
        </Link>
      </header>

      <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3 mb-8">
        {[
          ["Lessons", finished.length],
          ["Corrections", totals.mistakes],
          ["Resolved with the tutor", totals.corrected],
          ["Words collected", totals.vocabulary],
        ].map(([label, value]) => (
          <div
            key={String(label)}
            className="rounded-xl border border-panel-edge bg-panel p-4"
          >
            <p className="text-2xl font-semibold">{value}</p>
            <p className="text-[11px] text-on-desk-soft mt-0.5">{label}</p>
          </div>
        ))}
      </section>

      <section className="mb-8">
        <h2 className="text-[11px] uppercase tracking-[0.14em] text-on-desk-soft mb-3">
          Still to work on
        </h2>
        {weaknesses.length === 0 ? (
          <p className="text-sm text-on-desk-soft">
            Nothing recorded yet. Finish a lesson and it will show up here.
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {weaknesses.map((w) => {
              const t = trend(w.lessons, w.lessonsSinceSeen);
              return (
                <li
                  key={w.errorType}
                  className="rounded-xl border border-panel-edge bg-panel px-4 py-3 flex items-baseline justify-between gap-3"
                >
                  <span className="text-sm">{ERROR_TYPE_LABELS[w.errorType]}</span>
                  <span className={`text-[11px] shrink-0 ${t.tone}`}>{t.text}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-[11px] uppercase tracking-[0.14em] text-on-desk-soft mb-1">
          Lessons
        </h2>
        {/* What this page is for. Someone opening their history has come back
            to go over a lesson again, not to admire the count of them, so the
            list says plainly that each row is practice rather than a record. */}
        <p className="text-[12px] text-on-desk-soft mb-3">
          Open one to revise it - the flashcards and gap-fills are built from
          the sentences you got wrong in that lesson.
        </p>
        {lessons.length === 0 ? (
          <p className="text-sm text-on-desk-soft">No lessons yet.</p>
        ) : (
          <ul className="space-y-2">
            {lessons.map((lesson) => (
              <li key={lesson.id}>
                <Link
                  href={`/lesson/${lesson.id}`}
                  className="block rounded-xl border border-panel-edge bg-panel px-4 py-3 hover:border-accent/50 transition-colors"
                >
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="text-sm font-medium">
                      with {lesson.tutorName}
                    </span>
                    <span className="text-[11px] text-on-desk-soft sm:mr-auto">
                      {when(lesson.startedAt)}
                      {lesson.endedAt === null && " · in progress"}
                    </span>
                    <span className="text-[11px] text-on-desk-soft">
                      {lesson.corrected}/{lesson.mistakes} corrected ·{" "}
                      {lesson.vocabulary} {lesson.vocabulary === 1 ? "word" : "words"} ·{" "}
                      {lesson.turns} {lesson.turns === 1 ? "turn" : "turns"}
                    </span>
                    {/* Counted rather than promised: a lesson with nothing to
                        drill should not offer practice that does not exist. */}
                    {lesson.corrected + lesson.vocabulary > 0 && (
                      <span className="text-[11px] text-accent shrink-0">
                        {lesson.corrected + lesson.vocabulary} to practise
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
