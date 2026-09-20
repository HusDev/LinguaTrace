import Link from "next/link";
import { notFound } from "next/navigation";
import { LessonRecordView } from "@/components/LessonRecord";
import { redirect } from "next/navigation";
import { getLearner, getLessonParticipants, listLessons, loadNotebook } from "@/lib/db";
import { currentAccount } from "@/lib/auth";
import { buildLessonPack } from "@/lib/lessonPack";

export const dynamic = "force-dynamic";

/**
 * One lesson, kept - and revisable.
 *
 * The same notebook the learner watched fill during the call, rendered from
 * storage instead of live state, and beside it the Lesson Pack built from it.
 * The pack used to exist only in the tab where the lesson ended: the flashcards
 * and gap-fills made from the learner's own corrections - the one part of the
 * app whose whole purpose is revision - were the only thing the app did not
 * keep. They need no storage of their own, because they are code over the
 * notebook and the notebook was always kept.
 *
 * Whiteboard snapshots taped in during the lesson are here; camera captures are
 * absent by design - they are a person's face and were never written down.
 */
export default async function LessonRecord({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const me = await currentAccount();
  if (!me) redirect(`/login?next=${encodeURIComponent(`/lesson/${id}`)}`);

  const notebook = loadNotebook(id);
  const participants = getLessonParticipants(id);
  if (!notebook || !participants) notFound();

  // A lesson is readable by the two people who were in it.
  const mine = me.id === participants.learnerId || me.id === participants.tutorId;
  if (!mine) notFound();

  const learner = getLearner(participants.learnerId);
  const lessons = listLessons(participants.learnerId);
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
    <main className="flex-1 flex flex-col p-3 sm:p-4 gap-3 max-w-[1200px] w-full mx-auto lg:flex-none lg:h-screen lg:overflow-hidden">
      <header className="flex flex-wrap items-baseline gap-3 shrink-0 px-1">
        <h1 className="font-hand text-2xl sm:text-3xl leading-none">
          {notebook.learnerName} &amp; {notebook.tutorName}
        </h1>
        <p className="text-[12px] text-on-desk-soft mr-auto shrink-0">{date}</p>
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

      <LessonRecordView
        notebook={notebook}
        previous={previous}
        captures={notebook.captures}
        date={date}
        pack={buildLessonPack(notebook, previous)}
      />
    </main>
  );
}
