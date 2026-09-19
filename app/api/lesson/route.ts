import { NextResponse } from "next/server";
import { createSession } from "@/lib/vonage";
import { DEFAULT_LEARNER, createLesson, ensureLearner, getLesson } from "@/lib/store";
import { jevConfigured } from "@/lib/jev";
import { TUTOR_NAME, mockLessonTurns } from "@/lib/mockLesson";

export const runtime = "nodejs";

/** Start a lesson, returning the room session and the script that stands in for it. */
export async function POST() {
  const learner = ensureLearner(DEFAULT_LEARNER);
  const lessonId = `lesson-${Date.now().toString(36)}`;
  createLesson(lessonId, learner.id, TUTOR_NAME);
  const session = await createSession(lessonId);

  return NextResponse.json({
    lessonId,
    // The server owns the lesson date: formatting it in the browser would make
    // the first render disagree with the server's markup.
    date: new Date().toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
    }),
    session,
    learnerId: learner.id,
    learnerName: learner.name,
    tutorName: TUTOR_NAME,
    jevConfigured: jevConfigured(),
    // With the room stubbed, the client drives these turns through /api/classify
    // at the pace a real call would deliver them.
    scriptedTurns: mockLessonTurns(),
  });
}

export async function GET(request: Request) {
  const lessonId = new URL(request.url).searchParams.get("lessonId");
  if (!lessonId) {
    return NextResponse.json({ error: "lessonId is required" }, { status: 400 });
  }
  const notebook = getLesson(lessonId);
  if (!notebook) {
    return NextResponse.json({ error: "unknown lesson" }, { status: 404 });
  }
  return NextResponse.json({ notebook });
}
