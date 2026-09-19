/**
 * Gemini Live, used only to transcribe the lesson.
 *
 * The model is `gemini-3.5-transcribe-live`: a transcription model, not a
 * conversational one. It returns what was said and never speaks. That is a
 * deliberate product boundary, not a limitation worked around - the tutor in
 * this app is a person, and nothing here should be able to teach.
 *
 * Speakers are told apart structurally rather than by inference. The lesson has
 * two audio streams, and the browser already knows which is the local
 * participant and which is the remote one, so each stream gets its own session
 * and its label is a fact rather than a guess. No diarisation model can beat
 * knowing.
 */

import { GoogleGenAI } from "@google/genai";

export const TRANSCRIBE_MODEL = "gemini-3.5-transcribe-live";

/** Ephemeral tokens are a v1alpha feature of the Gemini Developer API. */
const API_VERSION = "v1alpha";

/**
 * Sessions a lesson's token may open.
 *
 * Two speakers, plus room to reconnect. A Live session can drop for reasons that
 * have nothing to do with the lesson - a network blip, a server-side timeout -
 * and every reconnection spends one of these. Three was miserly: it allowed a
 * single reconnect across the whole lesson, after which a speaker went silent
 * for good.
 */
const SESSIONS_PER_LESSON = 40;

/** A lesson, with headroom. Live sessions are capped well below this anyway. */
const TOKEN_TTL_MS = 60 * 60_000;

/**
 * How long the browser may keep opening sessions with this token.
 *
 * This must cover the whole lesson, not just the start of it. At two minutes,
 * reconnecting after a drop later in a lesson failed outright - the token was
 * still valid for its existing sessions but could no longer start a new one, so
 * a dropped speaker could never come back.
 */
const SESSION_START_WINDOW_MS = 55 * 60_000;

export function transcriptionConfigured(): boolean {
  return Boolean(process.env.GOOGLE_API_KEY);
}

/**
 * Mint a short-lived token the browser can open Live sessions with.
 *
 * The API key stays on the server. The browser never holds anything that
 * outlives the lesson or that could be used for anything but transcription.
 */
export async function mintTranscriptionToken(): Promise<string> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_API_KEY is not set.");

  const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: API_VERSION } });
  const now = Date.now();

  const token = await ai.authTokens.create({
    config: {
      uses: SESSIONS_PER_LESSON,
      expireTime: new Date(now + TOKEN_TTL_MS).toISOString(),
      newSessionExpireTime: new Date(now + SESSION_START_WINDOW_MS).toISOString(),
      httpOptions: { apiVersion: API_VERSION },
    },
  });

  if (!token.name) throw new Error("Gemini returned no token.");
  return token.name;
}
