"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether the desk layout should render, rather than the phone one.
 *
 * This is a real branch, not a CSS one. Hiding a layout with a class still
 * mounts it, and both layouts contain a video room and a whiteboard - so the
 * page would open two Vonage publishers and two transcription sessions, double
 * the cost, and judge every spoken turn twice.
 *
 * The server has no width, so it renders the phone layout and the browser
 * corrects it on hydration. That way the smaller layout is what arrives first.
 */
const QUERY = "(min-width: 1024px)";

function subscribe(onChange: () => void): () => void {
  const list = window.matchMedia(QUERY);
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
}

export function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
