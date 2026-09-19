import { NextResponse } from "next/server";
import { createSession, generateClientToken, vonageConfigured } from "@/lib/vonage";
import { getVideoSession, saveVideoSession } from "@/lib/db";
import { DEFAULT_LEARNER, createLesson, ensureLearner, getLesson } from "@/lib/store";
import { jevConfigured } from "@/lib/jev";
import { TUTOR_NAME, mockLessonTurns } from "@/lib/mockLesson";

export const runtime = "nodejs";

function shell(lessonId: string, learnerId: string, learnerName: string) {
  return {
    lessonId,
    // The server owns the lesson date: formatting it in the browser would make
    // the first render disagree with the server's markup.
    date: new Date().toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
    }),
    learnerId,
    learnerName,
    tutorName: TUTOR_NAME,
    jevConfigured: jevConfigured(),
    // With the room stubbed, the client drives these turns through /api/classify
    // at the pace a real call would deliver them.
    scriptedTurns: mockLessonTurns(),
  };
}

/**
 * Start a lesson, or join one already running.
 *
 * Joining matters more than it sounds. Without it two people each opened their
 * own video room and sat waiting for someone who was never coming - the app
 * could only ever be used alone, which is the one way this product does not
 * work. A joiner gets the lesson's existing session with a token of their own.
 */
export async function POST(request: Request) {
  const learner = ensureLearner(DEFAULT_LEARNER);

  let join: string | undefined;
  try {
    join = (await request.json())?.join;
  } catch {
    // No body means "start a new lesson".
  }

  if (join) {
    const notebook = getLesson(join);
    if (!notebook) {
      return NextResponse.json({ error: "That lesson does not exist." }, { status: 404 });
    }

    const sessionId = getVideoSession(join);
    if (!sessionId || !vonageConfigured()) {
      return NextResponse.json(
        { error: "That lesson has no video room to join." },
        { status: 409 },
      );
    }

    return NextResponse.json({
      ...shell(join, learner.id, notebook.learnerName),
      joined: true,
      notebook,
      session: {
        sessionId,
        // A token per participant, not a shared one.
        token: generateClientToken(sessionId),
        applicationId: process.env.VONAGE_APPLICATION_ID!,
        live: true,
      },
    });
  }

  const lessonId = `lesson-${Date.now().toString(36)}`;
  createLesson(lessonId, learner.id, TUTOR_NAME);
  const session = await createSession(lessonId);
  if (session.live) saveVideoSession(lessonId, session.sessionId);

  return NextResponse.json({
    ...shell(lessonId, learner.id, learner.name),
    joined: false,
    session,
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
