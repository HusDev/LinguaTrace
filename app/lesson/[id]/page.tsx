import Link from "next/link";
import { notFound } from "next/navigation";
import { NotebookPage } from "@/components/Notebook";
import { getLearner, listLessons, loadNotebook } from "@/lib/db";
import { DEFAULT_LEARNER } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * One lesson, kept.
 *
 * The same notebook the learner watched fill during the call, rendered from
 * storage instead of live state. Camera captures are absent by design - they are
 * a person's face and were never written down - so the page shows the notes, the
 * words, and anything drawn on the whiteboard.
 */
export default async function LessonRecord({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const notebook = loadNotebook(id);
  if (!notebook) notFound();

  const learner = getLearner(DEFAULT_LEARNER.id);
  const lessons = listLessons(DEFAULT_LEARNER.id);
  const index = lessons.findIndex((l) => l.id === id);
  const earlier = lessons.slice(index + 1).find((l) => l.endedAt !== null);
  const previous = earlier ? (loadNotebook(earlier.id) ?? undefined) : undefined;
  const lesson = lessons[index];

  const date = lesson
    ? new Date(lesson.startedAt).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
      })
    : "";

  return (
    <main className="flex-1 flex flex-col p-4 gap-3 max-w-[1200px] w-full mx-auto lg:h-screen lg:overflow-hidden">
      <header className="flex flex-wrap items-baseline gap-3 shrink-0 px-1">
        <h1 className="font-hand text-3xl leading-none">
          {notebook.learnerName} &amp; {notebook.tutorName}
        </h1>
        <p className="text-[12px] text-on-desk-soft mr-auto">{date}</p>
        {learner && (
          <Link
            href={`/learner/${learner.id}`}
            className="rounded-lg border border-panel-edge bg-panel px-3.5 py-2 text-[13px]"
          >
            All lessons
          </Link>
        )}
        <Link
          href="/"
          className="rounded-lg bg-accent-bg text-accent border border-accent/40 px-4 py-2 text-[13px] font-medium"
        >
          Start a lesson
        </Link>
      </header>

      <div className="flex-1 min-h-0">
        <NotebookPage
          notebook={notebook}
          previous={previous}
          captures={[]}
          date={date}
        />
      </div>
    </main>
  );
}
