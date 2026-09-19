/**
 * Translating vocabulary into the learner's own language.
 *
 * This is the one place the app generates text rather than selecting it. A
 * translation cannot be quoted from the lesson, because the word is not in the
 * transcript - so the rule that governs everything else ("Jev judges, code
 * writes") cannot apply, and the honest thing is to mark the exception rather
 * than pretend it away. Translations are stored in their own field, shown in a
 * visibly different style, and never mixed into the tutor's words.
 *
 * It is also not teaching: glossing a word is a dictionary lookup, not
 * instruction, so it does not cross the line that keeps the tutor human.
 */

import { GoogleGenAI } from "@google/genai";

/* A lite model: a gloss is a lookup, and the smallest model that does it well
   keeps the cost of a vocabulary note near zero. Checked against this account -
   the 2.5 models it would otherwise default to are no longer available. */
const MODEL = process.env.LINGUATRACE_TRANSLATE_MODEL ?? "gemini-3.5-flash-lite";

/**
 * Transient failures are worth one retry.
 *
 * The API returns 429 and 503 under load, and swallowing those meant a word
 * silently lost its gloss while the words either side of it kept theirs - which
 * reads as the feature randomly not working.
 */
const RETRIES = 2;
const BACKOFF_MS = 400;

function isTransient(error: unknown): boolean {
  const status = (error as { status?: number })?.status;
  if (status === 429 || status === 503 || (status && status >= 500)) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /429|503|50\d|overload|high demand|unavailable|timeout/i.test(message);
}

let client: GoogleGenAI | null = null;

function ai(): GoogleGenAI {
  if (!client) client = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
  return client;
}

export function translationConfigured(): boolean {
  return Boolean(process.env.GOOGLE_API_KEY);
}

/**
 * A short gloss for one term.
 *
 * Returns null rather than throwing: a missing translation should leave the
 * flashcard in the learner's target language, not lose the word.
 */
export async function translateTerm(
  term: string,
  context: string,
  targetLanguage: string,
  nativeLanguage: string,
): Promise<string | null> {
  if (!translationConfigured()) return null;
  if (nativeLanguage.toLowerCase() === targetLanguage.toLowerCase()) return null;

  for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
    try {
      const response = await ai().models.generateContent({
        model: MODEL,
        contents: [
          {
            role: "user",
            parts: [
              {
                text:
                  `Give the ${nativeLanguage} meaning of this ${targetLanguage} expression, ` +
                  `as it is used in the sentence below. Reply with the translation alone: ` +
                  `no quotes, no explanation, no alternatives, at most six words.\n\n` +
                  `Expression: ${term}\n` +
                  `Sentence: ${context}`,
              },
            ],
          },
        ],
        config: { temperature: 0, maxOutputTokens: 4000 },
      });

      const text = response.text?.trim().replace(/^["'\u201c]|["'\u201d]$/g, "");
      // A model that starts explaining has not given a gloss.
      if (!text || text.length > 80) return null;
      return text;
    } catch (error) {
      if (attempt === RETRIES || !isTransient(error)) return null;
      await new Promise((r) => setTimeout(r, BACKOFF_MS * (attempt + 1)));
    }
  }
  return null;
}
