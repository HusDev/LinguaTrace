import { NextResponse } from "next/server";
import { currentAccount } from "@/lib/auth";
import {
  TRANSCRIBE_MODEL,
  mintTranscriptionToken,
  transcriptionConfigured,
} from "@/lib/transcription";

export const runtime = "nodejs";

/** Mint a browser-usable token for transcribing this lesson. */
export async function POST() {
  // A transcription token is billable; it is not given to strangers.
  if (!(await currentAccount())) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  if (!transcriptionConfigured()) {
    return NextResponse.json(
      { error: "GOOGLE_API_KEY is not set, so the lesson cannot be transcribed." },
      { status: 503 },
    );
  }

  try {
    return NextResponse.json({
      token: await mintTranscriptionToken(),
      model: TRANSCRIBE_MODEL,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "could not mint a token";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
