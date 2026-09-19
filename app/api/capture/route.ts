import { NextResponse } from "next/server";
import { currentAccount } from "@/lib/auth";
import { getLesson, persist, withLesson } from "@/lib/store";

export const runtime = "nodejs";

/**
 * Tape a whiteboard snapshot into the lesson.
 *
 * Only drawings. A camera capture is shared with the other person in the call
 * over the session itself and never arrives here, because keeping a still of
 * someone's face indefinitely is a different promise from keeping their notes.
 *
 * The picture has already been shrunk in the browser before it is sent - a
 * frame straight off a video element is a megabyte or two, which is neither
 * worth storing nor what anybody ever sees, since the card it renders into is a
 * few hundred pixels wide.
 */
const MAX_DATA_URL = 400_000;

export async function POST(request: Request) {
  if (!(await currentAccount())) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  let body: { lessonId?: string; id?: string; dataUrl?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const { lessonId, id, dataUrl } = body;
  if (!lessonId || !id || !dataUrl) {
    return NextResponse.json(
      { error: "lessonId, id and dataUrl are required" },
      { status: 400 },
    );
  }

  if (!dataUrl.startsWith("data:image/")) {
    return NextResponse.json({ error: "not an image" }, { status: 400 });
  }
  if (dataUrl.length > MAX_DATA_URL) {
    return NextResponse.json({ error: "capture too large" }, { status: 413 });
  }

  const notebook = getLesson(lessonId);
  if (!notebook) {
    return NextResponse.json({ error: "unknown lesson" }, { status: 404 });
  }

  /* Queued behind the lesson's turns, so taping something in while a turn is
     being folded cannot interleave with it. */
  await withLesson(lessonId, async () => {
    if (!notebook.captures.some((c) => c.id === id)) {
      notebook.captures.push({ id, dataUrl, kind: "whiteboard" });
    }
    persist(lessonId);
  });

  return NextResponse.json({ captures: notebook.captures });
}
