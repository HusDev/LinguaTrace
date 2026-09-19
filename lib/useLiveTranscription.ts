"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GoogleGenAI, Modality, type Session } from "@google/genai";
import { continuesTurn, holdFor, joinFragments } from "./transcriptMerge";
import type { Speaker } from "./types";

/**
 * Transcribe the lesson with Gemini Live, one session per speaker.
 *
 * Each of the two audio streams in the call gets its own session, so a turn's
 * speaker is known from which stream carried it rather than inferred from the
 * voice. That is why this hook takes streams keyed by role: the labelling
 * happens before any model sees the audio.
 *
 * Only `inputTranscription` - the model's finalised text for an utterance -
 * becomes a turn. `interimInputTranscription` is shown live and never judged,
 * because classifying half a sentence writes half a correction.
 */

/** 16 kHz mono PCM is what the Live API expects. */
const SAMPLE_RATE = 16_000;
/** ~100 ms per message: small enough to feel live, large enough to be cheap. */
const FRAME_SIZE = 1600;

/** How many times to try bringing a dropped speaker back before giving up. */
const MAX_RECONNECTS = 6;
/** Multiplied by the attempt number, so repeated failures back off. */
const RECONNECT_BACKOFF_MS = 800;

/**
 * An AudioWorklet that forwards raw frames to the main thread.
 *
 * Delivered as a blob so the app needs no separate public asset, and used in
 * preference to ScriptProcessorNode, which is deprecated and runs on the main
 * thread where it competes with rendering the notebook.
 */
const WORKLET_SOURCE = `
class ForwardProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(${FRAME_SIZE});
    this.offset = 0;
  }
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;
    for (let i = 0; i < channel.length; i += 1) {
      this.buffer[this.offset] = channel[i];
      this.offset += 1;
      if (this.offset === this.buffer.length) {
        this.port.postMessage(this.buffer.slice());
        this.offset = 0;
      }
    }
    return true;
  }
}
registerProcessor("forward-processor", ForwardProcessor);
`;

function toBase64Pcm(frame: Float32Array): string {
  const pcm = new Int16Array(frame.length);
  for (let i = 0; i < frame.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, frame[i]));
    pcm[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }
  const bytes = new Uint8Array(pcm.buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

interface Pipeline {
  session: Session;
  context: AudioContext;
  node: AudioWorkletNode;
  source: MediaStreamAudioSourceNode;
  /** A finalised fragment waiting to see whether the speaker continues. */
  held: { text: string; timer: ReturnType<typeof setTimeout> } | null;
}

export interface TranscriptionStreams {
  tutor?: MediaStream | null;
  learner?: MediaStream | null;
}

export function useLiveTranscription({
  enabled,
  muted,
  streams,
  onFinalTurn,
  onError,
}: {
  enabled: boolean;
  /**
   * Silence this device's microphone.
   *
   * Silence is sent rather than nothing at all: voice activity detection needs a
   * continuous stream to know where an utterance ends, and a gap would both
   * confuse it and risk the session idling out. The cost is the same and the
   * words never leave the room.
   */
  muted: boolean;
  streams: TranscriptionStreams;
  onFinalTurn: (speaker: Speaker, text: string) => void;
  onError: (message: string) => void;
}) {
  const [interim, setInterim] = useState<Partial<Record<Speaker, string>>>({});
  const [active, setActive] = useState<Speaker[]>([]);

  const [status, setStatus] = useState<Partial<Record<Speaker, "listening" | "reconnecting">>>({});

  const pipelines = useRef(new Map<Speaker, Pipeline>());
  const workletUrl = useRef<string | null>(null);
  const token = useRef<{ value: string; model: string } | null>(null);
  /* What the hook is currently meant to be transcribing, readable from SDK
     callbacks that fire long after the render that set it. */
  const wanted = useRef<{ enabled: boolean; streams: TranscriptionStreams }>({
    enabled: false,
    streams: {},
  });
  const attempts = useRef(new Map<Speaker, number>());
  const retryTimers = useRef(new Map<Speaker, ReturnType<typeof setTimeout>>());
  /* `reconnect` is defined before `start` and needs to call it, so it goes
     through a ref rather than reordering the two around each other. */
  const startRef = useRef<((speaker: Speaker, stream: MediaStream) => Promise<void>) | null>(null);

  const finalRef = useRef(onFinalTurn);
  const errorRef = useRef(onError);
  /* Read inside the audio callback, which fires far more often than renders. */
  const mutedRef = useRef(muted);
  useEffect(() => {
    finalRef.current = onFinalTurn;
    errorRef.current = onError;
  }, [onFinalTurn, onError]);
  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  /**
   * Take a finalised fragment, holding it briefly in case the speaker was only
   * drawing breath. Flushing is what turns held text into a judged turn.
   */
  const acceptFragment = useCallback((speaker: Speaker, text: string) => {
    const pipeline = pipelines.current.get(speaker);
    if (!pipeline) {
      finalRef.current(speaker, text);
      return;
    }

    const flush = () => {
      const current = pipelines.current.get(speaker);
      const pending = current?.held;
      if (!current || !pending) return;
      current.held = null;
      finalRef.current(speaker, pending.text);
    };

    if (pipeline.held && continuesTurn(pipeline.held.text, text)) {
      clearTimeout(pipeline.held.timer);
      const merged = joinFragments(pipeline.held.text, text);
      pipeline.held = { text: merged, timer: setTimeout(flush, holdFor(merged)) };
      return;
    }

    if (pipeline.held) {
      clearTimeout(pipeline.held.timer);
      const previous = pipeline.held.text;
      pipeline.held = null;
      finalRef.current(speaker, previous);
    }

    pipeline.held = { text, timer: setTimeout(flush, holdFor(text)) };
  }, []);

  /** Close a speaker's pipeline without deciding whether it should come back. */
  const teardownQuietly = useCallback((speaker: Speaker) => {
    const timer = retryTimers.current.get(speaker);
    if (timer) {
      clearTimeout(timer);
      retryTimers.current.delete(speaker);
    }
    const pipeline = pipelines.current.get(speaker);
    if (!pipeline) return;
    pipelines.current.delete(speaker);
    try {
      if (pipeline.held) {
        clearTimeout(pipeline.held.timer);
        // Never lose the last thing someone said to a disconnect.
        finalRef.current(speaker, pipeline.held.text);
      }
      pipeline.node.port.onmessage = null;
      pipeline.source.disconnect();
      pipeline.node.disconnect();
      void pipeline.context.close();
      pipeline.session.close();
    } catch {
      // A half-built pipeline is expected during fast refresh and reconnects.
    }
    setActive((a) => a.filter((s) => s !== speaker));
    setInterim((i) => ({ ...i, [speaker]: "" }));
  }, []);

  /** Stop transcribing a speaker for good. */
  const teardown = useCallback(
    (speaker: Speaker) => {
      attempts.current.delete(speaker);
      teardownQuietly(speaker);
      setStatus((s) => ({ ...s, [speaker]: undefined }));
    },
    [teardownQuietly],
  );

  /**
   * Bring a dropped speaker back.
   *
   * Backs off so a persistent failure does not spin, re-mints the token in case
   * that was the problem, and gives up loudly rather than quietly: a transcript
   * that has silently stopped is worse than one that says it has.
   */
  const reconnect = useCallback(
    (speaker: Speaker) => {
      teardownQuietly(speaker);
      if (!wanted.current.enabled) return;
      const stream = wanted.current.streams[speaker];
      if (!stream) return;

      const attempt = (attempts.current.get(speaker) ?? 0) + 1;
      attempts.current.set(speaker, attempt);
      if (attempt > MAX_RECONNECTS) {
        setStatus((s) => ({ ...s, [speaker]: undefined }));
        errorRef.current(
          `Transcription for the ${speaker} stopped and could not restart. Turn listening off and on again.`,
        );
        return;
      }

      setStatus((s) => ({ ...s, [speaker]: "reconnecting" }));
      // A stale token is a plausible cause, so let the next attempt mint one.
      token.current = null;

      const timer = setTimeout(
        () => {
          const current = wanted.current.streams[speaker];
          if (wanted.current.enabled && current) void startRef.current?.(speaker, current);
        },
        RECONNECT_BACKOFF_MS * attempt,
      );
      retryTimers.current.set(speaker, timer);
    },
    [teardownQuietly],
  );

  const start = useCallback(
    async (speaker: Speaker, stream: MediaStream) => {
      if (pipelines.current.has(speaker)) return;
      if (stream.getAudioTracks().length === 0) return;

      // Reserve the slot before any await, so two rapid calls cannot both pass
      // the guard above and open duplicate sessions for one speaker.
      pipelines.current.set(speaker, null as unknown as Pipeline);

      try {
        if (!token.current) {
          const res = await fetch("/api/transcribe-token", { method: "POST" });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? "could not get a token");
          token.current = { value: data.token, model: data.model };
        }

        if (!workletUrl.current) {
          workletUrl.current = URL.createObjectURL(
            new Blob([WORKLET_SOURCE], { type: "application/javascript" }),
          );
        }

        const ai = new GoogleGenAI({
          apiKey: token.current.value,
          httpOptions: { apiVersion: "v1alpha" },
        });

        const session = await ai.live.connect({
          model: token.current.model,
          config: {
            responseModalities: [Modality.TEXT],
            inputAudioTranscription: {},
          },
          callbacks: {
            onmessage: (message) => {
              const content = message.serverContent;
              /* Each interim message carries the whole hypothesis so far, not
                 the newest words, so it replaces the previous one. Appending
                 them compounds the text: "I'm asking about theI'm asking about
                 the trackingI'm asking about the tracking status..." */
              const partial = content?.interimInputTranscription?.text;
              if (partial) {
                setInterim((i) => ({ ...i, [speaker]: partial }));
              }
              const finalText = content?.inputTranscription?.text?.trim();
              if (finalText) {
                setInterim((i) => ({ ...i, [speaker]: "" }));
                acceptFragment(speaker, finalText);
              }
            },
            onerror: (e: unknown) => {
              const m = e instanceof Error ? e.message : "transcription error";
              errorRef.current(`Transcription (${speaker}): ${m}`);
              reconnect(speaker);
            },
            // A drop is not the end of the lesson. Sessions end for reasons
            // that have nothing to do with the people talking - a network blip,
            // a server-side timeout - and before this, one drop silenced that
            // speaker permanently while the lesson carried on around it.
            onclose: () => reconnect(speaker),
          },
        });

        const context = new AudioContext({ sampleRate: SAMPLE_RATE });
        await context.audioWorklet.addModule(workletUrl.current);
        const source = context.createMediaStreamSource(stream);
        const node = new AudioWorkletNode(context, "forward-processor");

        const silence = new Float32Array(FRAME_SIZE);
        node.port.onmessage = (event: MessageEvent<Float32Array>) => {
          session.sendRealtimeInput({
            audio: {
              data: toBase64Pcm(mutedRef.current ? silence : event.data),
              mimeType: `audio/pcm;rate=${SAMPLE_RATE}`,
            },
          });
        };

        source.connect(node);
        /* The worklet emits no audio, but some browsers will not run a graph
           that reaches no destination. */
        node.connect(context.destination);

        pipelines.current.set(speaker, { session, context, node, source, held: null });
        attempts.current.set(speaker, 0);
        setActive((a) => (a.includes(speaker) ? a : [...a, speaker]));
        setStatus((s) => ({ ...s, [speaker]: "listening" }));
      } catch (error) {
        pipelines.current.delete(speaker);
        const m = error instanceof Error ? error.message : "could not start";
        errorRef.current(`Transcription (${speaker}): ${m}`);
        reconnect(speaker);
      }
    },
    [acceptFragment, reconnect],
  );

  useEffect(() => {
    startRef.current = start;
  }, [start]);

  /* Callbacks fire long after the render that set these, so they read intent
     from a ref rather than a captured value. */
  useEffect(() => {
    wanted.current = { enabled, streams };
  }, [enabled, streams]);

  useEffect(() => {
    if (!enabled) {
      for (const speaker of [...pipelines.current.keys()]) teardown(speaker);
      return;
    }
    const wanted: Array<[Speaker, MediaStream | null | undefined]> = [
      ["tutor", streams.tutor],
      ["learner", streams.learner],
    ];
    for (const [speaker, stream] of wanted) {
      // `start` opens a Live session - the external system this effect exists
      // to subscribe to - and its state updates all happen after awaits.
      if (stream) void start(speaker, stream);
      else teardown(speaker);
    }
  }, [enabled, streams.tutor, streams.learner, start, teardown]);

  useEffect(() => {
    const open = pipelines.current;
    const url = workletUrl;
    return () => {
      for (const speaker of [...open.keys()]) teardown(speaker);
      if (url.current) URL.revokeObjectURL(url.current);
    };
  }, [teardown]);

  return { interim, active, status };
}
