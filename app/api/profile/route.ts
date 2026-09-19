import { NextResponse } from "next/server";
import { listLessons, weaknessProfile } from "@/lib/db";
import { currentAccount } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * What the tutor needs to know about this learner before the lesson moves on.
 *
 * Read from history rather than the lesson in progress, so it can say things the
 * current call has no way to know - which weakness has been recurring, and which
 * has stopped.
 */
export async function GET(request: Request) {
  const me = await currentAccount();
  if (!me) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const learnerId = new URL(request.url).searchParams.get("learnerId");
  if (!learnerId) {
    return NextResponse.json({ error: "learnerId is required" }, { status: 400 });
  }

  // A learner sees only their own profile; a tutor sees the learners they teach.
  if (me.role === "learner" && me.id !== learnerId) {
    return NextResponse.json({ error: "Not yours." }, { status: 403 });
  }

  const lessons = listLessons(learnerId);
  return NextResponse.json({
    weaknesses: weaknessProfile(learnerId),
    lessons: lessons.filter((l) => l.endedAt !== null).length,
  });
}
