/**
 * Sharing the whiteboard, and anything else large, over the lesson's own video
 * session.
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

/**
 * Captures ride the same session on their own channel.
 *
 * A snapshot taped into the notes is part of the lesson both people are in, and
 * it used to exist only in the browser that pressed the button: the tutor drew
 * on the board, the learner taped it in, and the tutor never saw the note. The
 * board itself was already shared, so the picture of it should be too.
 *
 * A separate signal type rather than another board message kind, because the
 * board's own channel is busy during a stroke and a capture is not a drawing.
 */
export const CAPTURE_SIGNAL = "lt-capture";

export interface SharedCapture {
  id: string;
  dataUrl: string;
  kind: "camera" | "whiteboard";
}

export type CaptureMessage =
  | { kind: "capture"; from: string; capture: SharedCapture }
  /** Someone arriving mid-lesson asking for what has already been taped in. */
  | { kind: "hello"; from: string }
  | { kind: "all"; from: string; captures: SharedCapture[] };

/** Comfortably under Vonage's 8KB limit once the envelope is counted. */
const CHUNK_SIZE = 6000;

/**
 * How often changes are sent while someone is drawing.
 *
 * A single stroke emits a store update on every pointer move - dozens a second -
 * and one signal each floods the channel. Collecting them into one message every
 * few frames keeps the board smooth without drowning the session.
 */
export const FLUSH_MS = 90;

/** The shape tldraw hands back for a batch of record changes. */
export interface StoreChanges {
  added?: Record<string, unknown>;
  updated?: Record<string, [unknown, unknown]>;
  removed?: Record<string, unknown>;
}

/**
 * Fold a new batch of changes into the one waiting to be sent.
 *
 * Later writes win, and a record that ends up removed stops being sent as an
 * addition - otherwise the other side would be told to add something that no
 * longer exists.
 */
export function mergeChanges(into: StoreChanges, next: StoreChanges): StoreChanges {
  const added = { ...(into.added ?? {}) };
  const updated = { ...(into.updated ?? {}) };
  const removed = { ...(into.removed ?? {}) };

  for (const [id, record] of Object.entries(next.added ?? {})) {
    added[id] = record;
    delete removed[id];
  }
  for (const [id, pair] of Object.entries(next.updated ?? {})) {
    if (id in added) added[id] = pair[1];
    else updated[id] = pair;
    delete removed[id];
  }
  for (const [id, record] of Object.entries(next.removed ?? {})) {
    removed[id] = record;
    delete added[id];
    delete updated[id];
  }

  return { added, updated, removed };
}

export function isEmpty(changes: StoreChanges): boolean {
  return (
    Object.keys(changes.added ?? {}).length === 0 &&
    Object.keys(changes.updated ?? {}).length === 0 &&
    Object.keys(changes.removed ?? {}).length === 0
  );
}

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

export function encode(message: BoardMessage | CaptureMessage): string[] {
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
export function createDecoder<T = BoardMessage>(): (raw: string) => T | null {
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
        return JSON.parse(envelope.body) as T;
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
      return JSON.parse(parts.join("")) as T;
    } catch {
      return null;
    }
  };
}
