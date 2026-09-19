import { NextResponse } from "next/server";
import { listLessons, weaknessProfile } from "@/lib/db";

export const runtime = "nodejs";

/**
 * What the tutor needs to know about this learner before the lesson moves on.
 *
 * Read from history rather than the lesson in progress, so it can say things the
 * current call has no way to know - which weakness has been recurring, and which
 * has stopped.
 */
export async function GET(request: Request) {
  const learnerId = new URL(request.url).searchParams.get("learnerId");
  if (!learnerId) {
    return NextResponse.json({ error: "learnerId is required" }, { status: 400 });
  }

  const lessons = listLessons(learnerId);
  return NextResponse.json({
    weaknesses: weaknessProfile(learnerId),
    lessons: lessons.filter((l) => l.endedAt !== null).length,
  });
}
