import { NextResponse } from "next/server";
import { buildLessonPack } from "@/lib/lessonPack";
import {
  finishLesson,
  getLesson,
  learnerIdFor,
  previousLesson,
  withLesson,
} from "@/lib/store";
import { reconcileNotebook } from "@/lib/notebook";
import { currentAccount } from "@/lib/auth";

export const runtime = "nodejs";

/** Build the Lesson Pack and close the lesson. */
export async function POST(request: Request) {
  if (!(await currentAccount())) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  let body: { lessonId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const lessonId = body.lessonId;
  const notebook = lessonId ? getLesson(lessonId) : undefined;
  if (!lessonId || !notebook) {
    return NextResponse.json({ error: "unknown lesson" }, { status: 404 });
  }

  const learnerId = learnerIdFor(lessonId);

  /* Before the pack is built, the corrections are paired once more against the
     whole lesson. Live, the pairing question only ever sees the last few
     learner turns, so a tutor circling back to something said twenty turns ago
     had nothing to attach the correction to - and the learner kept a note
     reading "waiting for the correction" about a sentence that was corrected
     out loud. Nothing is waiting on this, so it is the one pass that can read
     the whole transcript.

     Queued behind the lesson's turns so a last turn still being folded in is
     not reconciled from underneath. */
  const closed = await withLesson(lessonId, () => reconcileNotebook(notebook));

  const pack = buildLessonPack(
    notebook,
    learnerId ? previousLesson(learnerId, lessonId) : undefined,
  );

  // Closing the lesson is what makes it part of the learner's history.
  finishLesson(lessonId);

  return NextResponse.json({ pack, learnerId, lateCorrections: closed });
}
