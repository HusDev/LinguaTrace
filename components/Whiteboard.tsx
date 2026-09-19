"use client";

import { useCallback } from "react";
import { Tldraw, type Editor } from "tldraw";
import "tldraw/tldraw.css";

/**
 * The shared whiteboard.
 *
 * Tutors draw during lessons - verb tables, timelines, sentence diagrams - and
 * that drawing is part of what the learner should keep. It is a working surface,
 * not a record: the canvas is freeform and nothing on it is structured, so the
 * notebook never reads from it. What crosses over is a snapshot, taped in beside
 * the camera frames exactly like a photograph of a real whiteboard.
 */

export interface WhiteboardApi {
  /** The current canvas as a PNG data URL, or null if nothing is drawn. */
  snapshot: () => Promise<string | null>;
}

export function Whiteboard({
  onReady,
}: {
  onReady: (api: WhiteboardApi | null) => void;
}) {
  const handleMount = useCallback(
    (editor: Editor) => {
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

  return (
    <div className="absolute inset-0">
      <Tldraw onMount={handleMount} />
    </div>
  );
}
