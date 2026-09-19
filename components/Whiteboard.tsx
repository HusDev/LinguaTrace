"use client";

import { useCallback, useEffect, useState } from "react";
import { Tldraw, type Editor } from "tldraw";
import "tldraw/tldraw.css";
import {
  BOARD_SIGNAL,
  FLUSH_MS,
  createDecoder,
  encode,
  isEmpty,
  mergeChanges,
  type BoardMessage,
  type StoreChanges,
} from "@/lib/boardSync";

/**
 * The shared whiteboard.
 *
 * Tutors draw during lessons - verb tables, timelines, sentence diagrams - and
 * that drawing is part of what the learner should keep. It is a working surface,
 * not a record: the canvas is freeform and nothing on it is structured, so the
 * notebook never reads from it. What crosses over is a snapshot, taped in beside
 * the camera frames exactly like a photograph of a real whiteboard.
 *
 * Both people draw on the same board. Changes travel over the lesson's own video
 * session rather than a separate realtime service, which keeps the board scoped
 * to the call by construction: you can only draw with someone you are in a room
 * with.
 */

export interface WhiteboardApi {
  /** The current canvas as a PNG data URL, or null if nothing is drawn. */
  snapshot: () => Promise<string | null>;
}

export interface BoardSync {
  send: (data: string) => void;
  subscribe: (handler: (data: string) => void) => () => void;
  onPeerJoined: (handler: () => void) => () => void;
}

export function Whiteboard({
  onReady,
  sync,
}: {
  onReady: (api: WhiteboardApi | null) => void;
  /** Absent when there is no room - then the board is simply local. */
  sync?: BoardSync | null;
}) {
  /* State rather than a ref: the sync effect must not run until the editor
     exists, and a ref being filled later would not wake it. */
  const [editor, setEditor] = useState<Editor | null>(null);

  const handleMount = useCallback(
    (editor: Editor) => {
      setEditor(editor);
      onReady({
        snapshot: async () => {
          const ids = [...editor.getCurrentPageShapeIds()];
          // An empty board would export a blank rectangle, which is not a note.
          if (ids.length === 0) return null;
          const image = await editor.toImageDataUrl(ids, {
            format: "png",
            background: true,
            padding: 24,
            scale: 1,
          });
          return image.url;
        },
      });
    },
    [onReady],
  );

  useEffect(() => {
    if (!editor || !sync) return;

    const me = Math.random().toString(36).slice(2, 10);
    const decode = createDecoder();

    const send = (message: BoardMessage) => {
      for (const part of encode(message)) sync.send(part);
    };

    /* Changes are collected and sent a few times a second rather than on every
       store write. Drawing one stroke emits an update per pointer move, and a
       signal each floods the channel. */
    let pending: StoreChanges = {};
    let timer: ReturnType<typeof setTimeout> | null = null;

    const flush = () => {
      timer = null;
      if (isEmpty(pending)) return;
      const changes = pending;
      pending = {};
      send({ kind: "diff", from: me, changes });
    };

    /* Only what this person did is broadcast. Without the `user` source filter
       the changes arriving from the other side would be echoed straight back. */
    const stopListening = editor.store.listen(
      ({ changes }) => {
        pending = mergeChanges(pending, changes as StoreChanges);
        if (!timer) timer = setTimeout(flush, FLUSH_MS);
      },
      { source: "user", scope: "document" },
    );

    const stopReceiving = sync.subscribe((raw) => {
      const message = decode(raw);
      if (!message || message.from === me) return;

      if (message.kind === "hello") {
        // Someone has just arrived; give them the board as it stands.
        send({ kind: "snapshot", from: me, snapshot: editor.store.getStoreSnapshot() });
        return;
      }

      /* `mergeRemoteChanges` marks these as not ours, so they are applied
         without being broadcast again and bouncing between the two boards.
         A batch that cannot be applied - a record referring to something this
         side has not seen - must not take the whole board down with it. */
      try {
        editor.store.mergeRemoteChanges(() => {
          if (message.kind === "snapshot") {
            // Only take a snapshot when there is nothing to lose by it.
            if (editor.getCurrentPageShapeIds().size === 0) {
              editor.store.loadStoreSnapshot(
                message.snapshot as Parameters<typeof editor.store.loadStoreSnapshot>[0],
              );
            }
            return;
          }

          const changes = message.changes as StoreChanges;
          const put = [
            ...Object.values(changes.added ?? {}),
            ...Object.values(changes.updated ?? {}).map(([, after]) => after),
          ];
          if (put.length) {
            editor.store.put(put as Parameters<typeof editor.store.put>[0]);
          }
          const removed = Object.keys(changes.removed ?? {});
          if (removed.length) {
            editor.store.remove(removed as Parameters<typeof editor.store.remove>[0]);
          }
        });
      } catch {
        // Drop this batch; the next one, or a snapshot, will put things right.
      }
    });

    // Ask for the board when arriving, and offer it when someone else arrives.
    send({ kind: "hello", from: me });
    const stopPeerWatch = sync.onPeerJoined(() => {
      send({ kind: "snapshot", from: me, snapshot: editor.store.getStoreSnapshot() });
    });

    return () => {
      if (timer) clearTimeout(timer);
      stopListening();
      stopReceiving();
      stopPeerWatch();
    };
  }, [editor, sync]);

  return (
    <div className="absolute inset-0">
      {/* Read in the browser, so it is inlined at build time rather than read
          from the server's environment at runtime. Without it tldraw draws a
          "license required" watermark over the canvas. */}
      <Tldraw
        onMount={handleMount}
        licenseKey={process.env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY}
      />
    </div>
  );
}

export { BOARD_SIGNAL };
