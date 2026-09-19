/**
 * Joining up utterances that voice activity detection split apart.
 *
 * The Live API finalises on a pause, and people pause mid-sentence. A single
 * spoken turn comes back as "It is the most common thing learners" followed by
 * "and it will come with practice" - two fragments, each judged on its own, each
 * too short to mean anything. An end-to-end run of an eighteen-turn lesson
 * produced twenty-four fragments this way, and the damage showed up downstream:
 * practice notes quoting half a clause, a corrected sentence missing its last
 * word.
 *
 * So a fragment is held briefly before it counts as a turn. If the speaker
 * carries on within the window, the pieces join; if they stop, it flushes. The
 * window is short enough that the notebook still fills while the lesson runs.
 */

/**
 * How long to hold a fragment that already reads as a complete sentence.
 *
 * Short, because the notebook should fill while the lesson runs.
 */
export const MERGE_WINDOW_MS = 1400;

/**
 * How long to hold a fragment that was cut off mid-sentence.
 *
 * Much longer, and deliberately so. The first version used one window for both
 * and merged nothing: a speaker's pause is a few hundred milliseconds, but the
 * model's finalisation latency is seconds, so the continuation always arrived
 * after the clock had run out. Grammatical completeness is the reliable signal
 * that a turn has ended; time is only the fallback for someone who genuinely
 * stopped mid-sentence and never resumed.
 */
export const INCOMPLETE_WINDOW_MS = 7000;

/**
 * The longest a run of fragments may be held, however many continuations land.
 *
 * The per-fragment window above is restarted every time the speaker carries on,
 * which is right for joining a sentence back together and wrong as the only
 * bound: someone who strings clauses together without sentence-final
 * punctuation - which is most people, and which the model renders faithfully -
 * resets a seven-second timer indefinitely, and the turn is never judged at all.
 * So the run also has a ceiling, measured from its first fragment.
 */
export const MAX_TOTAL_HOLD_MS = 8000;

/**
 * How long to hold `text` before it counts as a finished turn.
 *
 * `elapsed` is how long the run has already been held. The per-fragment window
 * still applies, but never past the ceiling on the run as a whole.
 */
export function holdFor(text: string, elapsed = 0): number {
  const window = endsSentence(text) ? MERGE_WINDOW_MS : INCOMPLETE_WINDOW_MS;
  return Math.max(0, Math.min(window, MAX_TOTAL_HOLD_MS - elapsed));
}

/** Sentence-final punctuation, which makes a continuation less likely. */
const ENDS_SENTENCE = /[.!?]["'”’]?$/;

export function endsSentence(text: string): boolean {
  return ENDS_SENTENCE.test(text.trim());
}

/**
 * Should `incoming` be treated as the continuation of `held`?
 *
 * A fragment that does not end a sentence is almost always cut short, so it
 * joins. One that does end a sentence joins only if the speaker resumed quickly
 * and started lower case, which is how the model renders a continued clause.
 */
export function continuesTurn(held: string, incoming: string): boolean {
  if (!endsSentence(held)) return true;
  const first = incoming.trim()[0];
  return Boolean(first && first === first.toLowerCase() && first !== first.toUpperCase());
}

/** Join two fragments into one line of speech. */
export function joinFragments(held: string, incoming: string): string {
  const left = held.trim();
  const right = incoming.trim();
  if (!left) return right;
  if (!right) return left;
  const needsSpace = !left.endsWith(" ");
  return `${left}${needsSpace ? " " : ""}${right}`;
}
