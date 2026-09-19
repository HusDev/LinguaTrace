"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

/**
 * Browser speech recognition, as the interim transcript source.
 *
 * This is explicitly a stand-in. The Web Speech API transcribes only this
 * browser's microphone, so it hears whoever is sitting here and not the person
 * on the other end, and its accuracy on accented learner speech - the exact
 * speech this app exists to serve - is its weakest case. The planned source is a
 * Gemini Live session listening to the Vonage audio with diarisation, which
 * hears both sides and labels them.
 *
 * Everything downstream consumes finalised turns, so replacing this changes
 * nothing but the source.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Recognition = any;

interface SpeechEvent {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
}

export function speechSupported(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition,
  );
}

/**
 * Whether this browser can transcribe, safe to read during render.
 *
 * `speechSupported()` answers differently on the server and in the browser, so
 * reading it directly while rendering makes the first client render disagree
 * with the server's markup. The server snapshot is false - no server transcribes
 * anything - and the real answer arrives on hydration.
 */
export function useSpeechSupported(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => speechSupported(),
    () => false,
  );
}

export function useSpeech(onFinalTurn: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<Recognition>(null);
  /** Whether the user still wants to listen, readable from SDK callbacks. */
  const wantListeningRef = useRef(false);
  /** The latest callback, so a restart never fires a stale closure. */
  const callbackRef = useRef(onFinalTurn);

  useEffect(() => {
    callbackRef.current = onFinalTurn;
  }, [onFinalTurn]);

  const stop = useCallback(() => {
    wantListeningRef.current = false;
    setListening(false);
    try {
      recognitionRef.current?.stop();
    } catch {
      // Stopping an already-stopped recogniser is not worth surfacing.
    }
  }, []);

  const start = useCallback(() => {
    if (!speechSupported()) {
      setError("This browser has no speech recognition. Type turns instead.");
      return;
    }

    const Ctor =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition: Recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: SpeechEvent) => {
      let pending = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = result[0].transcript.trim();
        if (!text) continue;
        // Only finalised speech reaches the notebook. Judging an interim
        // fragment would classify half a sentence and write half a correction.
        if (result.isFinal) callbackRef.current(text);
        else pending += ` ${text}`;
      }
      setInterim(pending.trim());
    };

    recognition.onerror = (event: { error?: string }) => {
      if (event.error === "no-speech" || event.error === "aborted") return;
      setError(`Speech recognition error: ${event.error ?? "unknown"}`);
    };

    // Chrome ends recognition on its own after a pause; restart while wanted.
    recognition.onend = () => {
      if (recognitionRef.current !== recognition) return;
      if (!wantListeningRef.current) return;
      try {
        recognition.start();
      } catch {
        wantListeningRef.current = false;
        setListening(false);
      }
    };

    recognitionRef.current = recognition;
    wantListeningRef.current = true;
    setError(null);
    setListening(true);
    recognition.start();
  }, []);

  useEffect(() => {
    return () => {
      wantListeningRef.current = false;
      try {
        recognitionRef.current?.abort();
      } catch {
        // Nothing to clean up if it never started.
      }
    };
  }, []);

  return { listening, interim, error, start, stop };
}
