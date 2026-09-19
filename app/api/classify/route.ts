import { NextResponse } from "next/server";
import { processTurn } from "@/lib/notebook";
import { getLearner } from "@/lib/db";
import { currentAccount } from "@/lib/auth";
import { getLesson, learnerIdFor, persist } from "@/lib/store";
import { jevConfigured } from "@/lib/jev";
import type { Turn } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Judge one transcript turn and fold it into the notebook.
 *
 * The client posts turns as they are finalised. Each call returns the whole
 * notebook rather than a patch: the notebook is small, and a full replace means
 * a dropped response cannot leave the page showing a half-applied lesson.
 */
export async function POST(request: Request) {
  if (!(await currentAccount())) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  if (!jevConfigured()) {
    return NextResponse.json(
      { error: "TYPESAFE_API_KEY is not set. Add it to .env.local and restart." },
      { status: 503 },
    );
  }

  let body: { lessonId?: string; turn?: Turn };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const { lessonId, turn } = body;
  if (!lessonId || !turn?.id || !turn.text || !turn.speaker) {
    return NextResponse.json(
      { error: "lessonId and a turn with id, speaker and text are required" },
      { status: 400 },
    );
  }

  const notebook = getLesson(lessonId);
  if (!notebook) {
    return NextResponse.json({ error: "unknown lesson" }, { status: 404 });
  }

  try {
    const learnerId = learnerIdFor(lessonId);
    const learner = learnerId ? getLearner(learnerId) : null;
    const result = await processTurn(
      notebook,
      turn,
      learner
        ? { native: learner.nativeLanguage, target: learner.targetLanguage }
        : undefined,
    );
    // Written through after every turn, so a refresh resumes the lesson.
    persist(lessonId);
    return NextResponse.json({ result, notebook });
  } catch (error) {
    // A failed judgment must not take the lesson down; the turn stays in the
    // transcript and the notebook simply gains nothing from it.
    const message = error instanceof Error ? error.message : "classification failed";
    return NextResponse.json({ error: message, notebook }, { status: 502 });
  }
}
