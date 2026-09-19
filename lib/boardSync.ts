/**
 * Sharing the whiteboard over the lesson's own video session.
 *
 * The two people are already in a Vonage room, authenticated and connected, so
 * the drawing rides that rather than adding a second realtime service to run,
 * pay for and explain. It also means the board is scoped to the lesson by
 * construction: you can only draw with someone you are in a call with.
 *
 * Signals carry at most 8KB, which a stroke never approaches but a whole board
 * does, so anything large is split and rebuilt on the other side.
 */

export const BOARD_SIGNAL = "lt-board";

/** Comfortably under Vonage's 8KB limit once the envelope is counted. */
const CHUNK_SIZE = 6000;

export type BoardMessage =
  | { kind: "diff"; from: string; changes: unknown }
  /** A newcomer asking for the board as it already stands. */
  | { kind: "hello"; from: string }
  | { kind: "snapshot"; from: string; snapshot: unknown };

interface Envelope {
  id: string;
  index: number;
  total: number;
  body: string;
}

export function encode(message: BoardMessage): string[] {
  const body = JSON.stringify(message);
  if (body.length <= CHUNK_SIZE) {
    return [JSON.stringify({ id: "1", index: 0, total: 1, body } satisfies Envelope)];
  }

  const id = Math.random().toString(36).slice(2, 10);
  const total = Math.ceil(body.length / CHUNK_SIZE);
  return Array.from({ length: total }, (_, index) =>
    JSON.stringify({
      id,
      index,
      total,
      body: body.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE),
    } satisfies Envelope),
  );
}

/**
 * Rebuild messages from the pieces that arrive.
 *
 * Parts of one message can interleave with another's, so each is collected
 * under its own id and only handed on once every piece is present.
 */
export function createDecoder(): (raw: string) => BoardMessage | null {
  const pending = new Map<string, string[]>();

  return (raw: string) => {
    let envelope: Envelope;
    try {
      envelope = JSON.parse(raw) as Envelope;
    } catch {
      return null;
    }
    if (typeof envelope?.body !== "string") return null;

    if (envelope.total === 1) {
      try {
        return JSON.parse(envelope.body) as BoardMessage;
      } catch {
        return null;
      }
    }

    const parts = pending.get(envelope.id) ?? new Array<string>(envelope.total);
    parts[envelope.index] = envelope.body;
    pending.set(envelope.id, parts);

    if (parts.filter((p) => typeof p === "string").length < envelope.total) return null;
    pending.delete(envelope.id);
    try {
      return JSON.parse(parts.join("")) as BoardMessage;
    } catch {
      return null;
    }
  };
}
