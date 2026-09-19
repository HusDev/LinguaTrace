import { NextResponse } from "next/server";
import { createSession, generateClientToken, vonageConfigured } from "@/lib/vonage";
import {
  getAccount,
  getLessonParticipants,
  getVideoSession,
  saveVideoSession,
  setLessonLearner,
} from "@/lib/db";
import {
  createLesson,
  getLesson,
  reassignLesson,
  upsertLearnerFromAccount,
} from "@/lib/store";
import { currentAccount } from "@/lib/auth";
import { jevConfigured } from "@/lib/jev";
import { mockLessonTurns } from "@/lib/mockLesson";

export const runtime = "nodejs";

function shell(
  lessonId: string,
  learnerName: string,
  tutorName: string,
  learnerId: string,
) {
  return {
    lessonId,
    /* Whose history this lesson belongs to. The tutor's copilot reads the
       learner's past lessons, not their own. */
    learnerId,
    // The server owns the lesson date: formatting it in the browser would make
    // the first render disagree with the server's markup.
    date: new Date().toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
    }),
    learnerName,
    tutorName,
    jevConfigured: jevConfigured(),
    scriptedTurns: mockLessonTurns(),
  };
}

/**
 * Start a lesson, or join one already running.
 *
 * Who you are decides your side of the conversation. A tutor opens the room and
 * sends the link; a learner following that link becomes the lesson's learner.
 * Before accounts this was a control in the header, which meant a lesson could
 * be mislabelled by a misclick - and a tutor filed as a learner is never asked
 * whether they just corrected something.
 */
export async function POST(request: Request) {
  const me = await currentAccount();
  if (!me) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  let join: string | undefined;
  try {
    join = (await request.json())?.join;
  } catch {
    // No body means "start a new lesson".
  }

  if (join) {
    const notebook = getLesson(join);
    const participants = getLessonParticipants(join);
    if (!notebook || !participants) {
      return NextResponse.json({ error: "That lesson does not exist." }, { status: 404 });
    }

    /* A tutor's lesson starts with a placeholder learner. The first learner to
       follow the invite becomes the lesson's learner for good; a second one
       would rewrite whose history this lesson belongs to. */
    if (me.role === "learner") {
      const claimed = getAccount(participants.learnerId);
      const unclaimed = !claimed || claimed.role === "tutor";
      if (unclaimed || participants.learnerId === me.id) {
        upsertLearnerFromAccount(me);
        setLessonLearner(join, me.id);
        // The working copy is what every response is built from, so it has to
        // learn the new learner's name too, not just the stored row.
        reassignLesson(join, me.id, me.name);
      } else if (participants.learnerId !== me.id) {
        return NextResponse.json(
          { error: "This lesson already belongs to another learner." },
          { status: 403 },
        );
      }
    }

    const sessionId = getVideoSession(join);
    if (!sessionId || !vonageConfigured()) {
      return NextResponse.json(
        { error: "That lesson has no video room to join." },
        { status: 409 },
      );
    }

    const fresh = getLesson(join)!;
    return NextResponse.json({
      ...shell(join, fresh.learnerName, fresh.tutorName, getLessonParticipants(join)!.learnerId),
      joined: true,
      me,
      notebook: fresh,
      session: {
        sessionId,
        // A token per participant, not a shared one.
        token: generateClientToken(sessionId),
        applicationId: process.env.VONAGE_APPLICATION_ID!,
        live: true,
      },
    });
  }

  /* Only a tutor opens a room. A lesson is a tutor teaching a learner, so one
     started by a learner alone would have no teaching in it to write down - and
     it produced a lesson whose tutor was a placeholder, which then showed up on
     the learner's own screen as "your tutor". Learners arrive by invitation. */
  if (me.role !== "tutor") {
    return NextResponse.json(
      { error: "Your tutor starts the lesson. Open the link they send you." },
      { status: 403 },
    );
  }

  upsertLearnerFromAccount(me);
  const lessonId = `lesson-${Date.now().toString(36)}`;
  /* The room is held before anyone joins, so the learner is a placeholder until
     someone follows the invite. */
  createLesson(lessonId, me.id, me.name, me.id, "Learner");

  const session = await createSession(lessonId);
  if (session.live) saveVideoSession(lessonId, session.sessionId);

  const notebook = getLesson(lessonId)!;
  return NextResponse.json({
    ...shell(lessonId, notebook.learnerName, me.name, me.id),
    joined: false,
    me,
    session,
  });
}

export async function GET(request: Request) {
  const me = await currentAccount();
  if (!me) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

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
