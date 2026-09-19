import { NextResponse } from "next/server";
import { buildLessonPack } from "@/lib/lessonPack";
import { finishLesson, getLesson, learnerIdFor, previousLesson } from "@/lib/store";

export const runtime = "nodejs";

/** Build the Lesson Pack and close the lesson. */
export async function POST(request: Request) {
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
  const pack = buildLessonPack(
    notebook,
    learnerId ? previousLesson(learnerId, lessonId) : undefined,
  );

  // Closing the lesson is what makes it part of the learner's history.
  finishLesson(lessonId);

  return NextResponse.json({ pack, learnerId });
}
