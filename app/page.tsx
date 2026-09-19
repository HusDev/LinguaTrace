"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { NotebookPage } from "@/components/Notebook";
import { LessonPackView } from "@/components/LessonPackView";
import { LiveRail } from "@/components/LiveRail";
import { TutorView } from "@/components/TutorView";
import type { RoomApi, RoomStreams } from "@/components/VideoRoom";
import type { WhiteboardApi } from "@/components/Whiteboard";
import type { LessonPack } from "@/lib/lessonPack";
import { useSpeech, useSpeechSupported } from "@/lib/useSpeech";
import { useLiveTranscription } from "@/lib/useLiveTranscription";
import { emptyNotebook, type Notebook, type Speaker, type Turn } from "@/lib/types";

/* The video SDK touches `window` at module scope, so it must not render on the
   server. */
const VideoRoom = dynamic(
  () => import("@/components/VideoRoom").then((m) => m.VideoRoom),
  { ssr: false, loading: () => <RoomSkeleton /> },
);

/* tldraw is a canvas app: it must not render on the server, and it is large
   enough that the lesson should not wait for it. */
const Whiteboard = dynamic(
  () => import("@/components/Whiteboard").then((m) => m.Whiteboard),
  {
    ssr: false,
    loading: () => (
      <p className="absolute inset-0 grid place-items-center text-sm text-ink-soft">
        Loading the whiteboard…
      </p>
    ),
  },
);

function RoomSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-2">
      {[0, 1].map((i) => (
        <div
          key={i}
          className="aspect-[4/3] rounded-xl bg-panel-raised border border-panel-edge"
        />
      ))}
    </div>
  );
}

/** Pace of the scripted lesson. A real call sets its own. */
const TURN_INTERVAL_MS = 2600;

type Phase = "idle" | "running" | "paused" | "ended";

const NOTE_LABELS: Record<string, string> = {
  mistake: "mistake noted",
  correction: "correction",
  vocabulary: "vocabulary",
  grammar: "grammar note",
  goal: "goal",
  practice: "to practise",
};

/**
 * A short account of what the classifier did with a turn.
 *
 * Every turn gets one, including the turns that produced nothing. Saying "heard,
 * nothing to note" is the difference between a system that is thinking and one
 * that appears broken.
 */
function describeOutcome(result: {
  added: string[];
  signals: Record<string, number>;
}): string {
  if (result.added.length > 0) {
    return [...new Set(result.added)]
      .map((a) => NOTE_LABELS[a] ?? a)
      .join(" · ");
  }
  const gate = result.signals?.isLessonSpeech ?? 1;
  if (gate < 0.6) return "not lesson speech";
  return "heard, nothing to note";
}

interface Capture {
  id: string;
  dataUrl: string;
  kind: "camera" | "whiteboard";
}

export default function LessonRoom() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [lessonId, setLessonId] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [session, setSession] = useState<{
    applicationId: string;
    sessionId: string;
    token: string;
  } | null>(null);
  const [notebook, setNotebook] = useState<Notebook>(() =>
    emptyNotebook("", "Learner", "Tutor"),
  );
  const [previous, setPrevious] = useState<Notebook | undefined>();
  const [pack, setPack] = useState<LessonPack | null>(null);
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [cameraOn, setCameraOn] = useState(true);
  /* Speech recognition hears this microphone only, so the person at this desk
     says which side of the lesson they are. */
  const [myRole, setMyRole] = useState<Speaker>("learner");
  const [draft, setDraft] = useState("");
  const [streams, setStreams] = useState<RoomStreams>({ local: null, remote: null });
  const [transcribing, setTranscribing] = useState(false);
  const [panel, setPanel] = useState<"notes" | "whiteboard">("notes");
  /* What the classifier decided about each turn. Without this the app is silent
     whenever it writes nothing, which is indistinguishable from being broken. */
  const [outcomes, setOutcomes] = useState<Record<string, string>>({});
  const [learnerId, setLearnerId] = useState<string | null>(null);

  const script = useRef<Turn[]>([]);
  const cursor = useRef(0);
  const roomApi = useRef<RoomApi | null>(null);
  const boardApi = useRef<WhiteboardApi | null>(null);

  /* Supplied by the server when the lesson starts. */
  const [lessonDate, setLessonDate] = useState("");

  const sendTurn = useCallback(async (turn: Turn, id: string) => {
    try {
      const res = await fetch("/api/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonId: id, turn }),
      });
      const data = await res.json();
      if (data.notebook) setNotebook(data.notebook);
      if (data.result) {
        setOutcomes((o) => ({ ...o, [turn.id]: describeOutcome(data.result) }));
      }
      setError(res.ok ? null : (data.error ?? "Classification failed."));
    } catch {
      setError("Could not reach the classifier.");
    }
  }, []);

  /** Add a turn from a live source - spoken or typed - and judge it. */
  const submitTurn = useCallback(
    (text: string, speaker: Speaker) => {
      const trimmed = text.trim();
      if (!trimmed || !lessonId) return;
      const turn: Turn = {
        id: `live-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        speaker,
        text: trimmed,
        at: Date.now(),
      };
      setNotebook((n) => ({ ...n, turns: [...n.turns, turn] }));
      void sendTurn(turn, lessonId);
    },
    [lessonId, sendTurn],
  );

  const onSpeech = useCallback(
    (text: string) => submitTurn(text, myRole),
    [submitTurn, myRole],
  );
  const speech = useSpeech(onSpeech);
  const speechAvailable = useSpeechSupported();

  const onTranscribedTurn = useCallback(
    (speaker: Speaker, text: string) => submitTurn(text, speaker),
    [submitTurn],
  );
  /* Each stream carries exactly one person, so a turn's speaker is never
     guessed from the voice. Which stream is the tutor is the one thing the
     browser cannot know, so it comes from what the user says their own role is:
     this device is `myRole`, and the other end is the other role. */
  const transcription = useLiveTranscription({
    enabled: transcribing && Boolean(session),
    streams:
      myRole === "learner"
        ? { learner: streams.local, tutor: streams.remote }
        : { tutor: streams.local, learner: streams.remote },
    onFinalTurn: onTranscribedTurn,
    onError: setError,
  });

  const transcribingLive = transcription.active.length > 0;
  /* A transcript that has quietly stopped is worse than one that says so. */
  const reconnecting = (["tutor", "learner"] as const).filter(
    (s) => transcription.status[s] === "reconnecting",
  );
  const interimText = transcription.active.length > 0
    ? [transcription.interim.tutor, transcription.interim.learner]
        .filter(Boolean)
        .join(" ")
    : speech.interim;

  /* Replay the scripted lesson at conversational pace. Each turn waits for the
     previous judgment, so the notebook can never run ahead of the transcript. */
  useEffect(() => {
    if (phase !== "running" || !lessonId) return;
    // A live room supplies its own turns; the script is only the stand-in.
    if (live) return;
    let cancelled = false;

    const tick = async () => {
      while (!cancelled && cursor.current < script.current.length) {
        const turn = script.current[cursor.current];
        cursor.current += 1;
        setNotebook((n) =>
          n.turns.some((t) => t.id === turn.id)
            ? n
            : { ...n, turns: [...n.turns, turn] },
        );
        await sendTurn(turn, lessonId);
        if (cancelled) return;
        await new Promise((r) => setTimeout(r, TURN_INTERVAL_MS));
      }
      if (!cancelled && cursor.current >= script.current.length) {
        setPhase("paused");
      }
    };

    void tick();
    return () => {
      cancelled = true;
    };
  }, [phase, lessonId, live, sendTurn]);

  const handleReady = useCallback((api: RoomApi | null) => {
    roomApi.current = api;
  }, []);

  const handleStreams = useCallback((next: RoomStreams) => setStreams(next), []);

  const handleBoardReady = useCallback((api: WhiteboardApi | null) => {
    boardApi.current = api;
  }, []);

  async function startLesson() {
    setError(null);
    setStatus(null);
    setPack(null);
    setCaptures([]);
    setOutcomes({});
    setTranscribing(false);
    setPrevious(notebook.turns.length > 0 ? notebook : previous);

    const res = await fetch("/api/lesson", { method: "POST" });
    const data = await res.json();
    script.current = data.scriptedTurns;
    cursor.current = 0;
    setLessonId(data.lessonId);
    setLessonDate(data.date);
    setLearnerId(data.learnerId ?? null);
    setLive(data.session.live);
    setSession(
      data.session.live
        ? {
            applicationId: data.session.applicationId,
            sessionId: data.session.sessionId,
            token: data.session.token,
          }
        : null,
    );
    setNotebook(emptyNotebook(data.lessonId, data.learnerName, data.tutorName));
    if (!data.jevConfigured) {
      setError(
        "TYPESAFE_API_KEY is not set, so nothing will be classified. Add it to .env.local and restart.",
      );
    }
    setPhase("running");
  }

  async function endLesson() {
    if (!lessonId) return;
    speech.stop();
    setTranscribing(false);
    setPhase("ended");
    const res = await fetch("/api/pack", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lessonId }),
    });
    const data = await res.json();
    if (data.pack) setPack(data.pack);
    else setError(data.error ?? "Could not build the Lesson Pack.");
  }

  /**
   * Tape whatever is on screen into the notebook.
   *
   * One button, whose source follows the open panel: the whiteboard when it is
   * showing, the camera otherwise. Two capture buttons would make the user work
   * out which one they wanted.
   */
  async function capture() {
    const onBoard = panel === "whiteboard";
    const dataUrl = onBoard
      ? await boardApi.current?.snapshot()
      : roomApi.current?.capture();

    if (!dataUrl) {
      setStatus(
        onBoard
          ? "Nothing on the whiteboard to capture yet."
          : "Nothing to capture - the camera is off or still starting.",
      );
      return;
    }

    let duplicate = false;
    setCaptures((c) => {
      // A double-tap grabs the same image twice; the second adds nothing.
      duplicate = c.some((existing) => existing.dataUrl === dataUrl);
      return duplicate
        ? c
        : [
            ...c,
            {
              id: `capture-${Date.now()}`,
              dataUrl,
              kind: onBoard ? ("whiteboard" as const) : ("camera" as const),
            },
          ];
    });

    setStatus(
      duplicate
        ? "That is the same image as the last capture."
        : onBoard
          ? "Whiteboard taped into the notebook."
          : "Frame taped into the notebook.",
    );
  }

  function downloadPack() {
    if (!pack) return;
    const blob = new Blob([JSON.stringify(pack, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lesson-pack-${pack.lessonId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="flex-1 flex flex-col gap-3 p-3 lg:h-screen lg:overflow-hidden">
      <header className="flex items-center gap-3 px-1 shrink-0">
        <span
          aria-hidden
          className="grid place-items-center h-9 w-9 rounded-lg bg-panel-raised border border-panel-edge text-lg"
        >
          📓
        </span>
        <div>
          <h1 className="text-[17px] font-semibold leading-tight">LinguaTrace</h1>
          <p className="text-[11px] text-on-desk-soft leading-tight">
            Live lesson companion
          </p>
        </div>

        {/* One switch, because being the tutor and seeing the tutor's view are
            the same thing from the person's point of view. It sets who this
            device's audio and typed turns belong to, and what the panel shows. */}
        <div
          role="group"
          aria-label="I am the"
          className="ml-2 flex rounded-lg border border-panel-edge bg-panel p-0.5"
        >
          {(["learner", "tutor"] as const).map((role) => (
            <button
              key={role}
              type="button"
              onClick={() => setMyRole(role)}
              aria-pressed={myRole === role}
              className={`rounded-md px-3 py-1.5 text-[12px] capitalize transition-colors ${
                myRole === role
                  ? "bg-accent-bg text-accent"
                  : "text-on-desk-soft hover:text-on-desk"
              }`}
            >
              {role}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-on-desk-soft mr-auto ml-1 hidden sm:block">
          {myRole === "tutor" ? "seeing the tutor's view" : "seeing the notebook"}
        </p>

        {phase === "idle" && (
          <button
            onClick={startLesson}
            className="rounded-lg bg-accent-bg text-accent border border-accent/40 px-4 py-2 text-[13px] font-medium"
          >
            Start lesson
          </button>
        )}
        {(phase === "running" || phase === "paused") && (
          <>
            {!live && (
              <button
                onClick={() => setPhase(phase === "running" ? "paused" : "running")}
                className="rounded-lg border border-panel-edge bg-panel px-3.5 py-2 text-[13px]"
              >
                {phase === "running" ? "Pause" : "Resume"}
              </button>
            )}
            <button
              onClick={endLesson}
              className="rounded-lg bg-accent-bg text-accent border border-accent/40 px-4 py-2 text-[13px] font-medium"
            >
              Lesson pack
            </button>
          </>
        )}
        {phase === "ended" && (
          <>
            {learnerId && (
              <Link
                href={`/learner/${learnerId}`}
                className="rounded-lg border border-panel-edge bg-panel px-3.5 py-2 text-[13px]"
              >
                All lessons
              </Link>
            )}
            {lessonId && (
              <Link
                href={`/lesson/${lessonId}`}
                className="rounded-lg border border-panel-edge bg-panel px-3.5 py-2 text-[13px]"
              >
                Open this lesson
              </Link>
            )}
            <button
              onClick={() => setPack(null)}
              disabled={!pack}
              className="rounded-lg border border-panel-edge bg-panel px-3.5 py-2 text-[13px] disabled:opacity-40"
            >
              Back to notes
            </button>
            <button
              onClick={downloadPack}
              disabled={!pack}
              className="rounded-lg border border-panel-edge bg-panel px-3.5 py-2 text-[13px] disabled:opacity-40"
            >
              Download
            </button>
            <button
              onClick={startLesson}
              className="rounded-lg bg-accent-bg text-accent border border-accent/40 px-4 py-2 text-[13px] font-medium"
            >
              New lesson
            </button>
          </>
        )}
      </header>

      {(error || status) && (
        <p
          className={`shrink-0 rounded-lg px-3 py-2 text-[12px] mx-1 ${
            error
              ? "bg-[#4a2424] text-[#ffb4b4] border border-[#6b3333]"
              : "bg-panel text-on-desk-soft border border-panel-edge"
          }`}
        >
          {error ?? status}
        </p>
      )}

      <div className="grid gap-3 lg:grid-cols-[320px_minmax(0,1fr)] flex-1 min-h-0">
        <LiveRail
          notebook={notebook}
          previous={previous}
          phase={phase}
          live={live}
          listening={transcribing || speech.listening}
          interim={interimText}
          outcomes={outcomes}
          transcribingLive={transcribingLive}
          transcribingWith={transcribing ? "Gemini" : null}
          reconnecting={reconnecting}
          cameraOn={cameraOn}
          myRole={myRole}
          draft={draft}
          canCapture={
            phase !== "ended" &&
            (panel === "whiteboard" || (Boolean(session) && cameraOn))
          }
          speechAvailable={speechAvailable || Boolean(session)}
          onRole={setMyRole}
          onToggleListening={() => {
            /* Prefer Gemini: it hears both sides and labels them. The browser
               recogniser is only a fallback when there is no room to listen to. */
            if (session) {
              setTranscribing((on) => !on);
              return;
            }
            if (speech.listening) speech.stop();
            else speech.start();
          }}
          onToggleCamera={() => setCameraOn((c) => !c)}
          onCapture={() => void capture()}
          captureSource={panel === "whiteboard" ? "whiteboard" : "camera"}
          onDraft={setDraft}
          onSend={() => {
            submitTurn(draft, myRole);
            setDraft("");
          }}
          room={
            session ? (
              <VideoRoom
                applicationId={session.applicationId}
                sessionId={session.sessionId}
                token={session.token}
                cameraOn={cameraOn}
                tutorName={notebook.tutorName}
                learnerName={notebook.learnerName}
                onStatus={setStatus}
                onReady={handleReady}
                onStreams={handleStreams}
              />
            ) : (
              <RoomSkeleton />
            )
          }
        />

        <div className="min-h-0 flex flex-col gap-2">
          {!pack && (
            <div className="flex gap-1.5 shrink-0">
              {(["notes", "whiteboard"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setPanel(tab)}
                  className={`rounded-lg px-3 py-1.5 text-[12px] border capitalize ${
                    panel === tab
                      ? "border-accent/50 bg-accent-bg/50 text-accent"
                      : "border-panel-edge bg-panel text-on-desk-soft"
                  }`}
                >
                  {tab === "notes" && myRole === "tutor" ? "lesson" : tab}
                </button>
              ))}
              {panel === "whiteboard" && (
                <span className="self-center ml-1 text-[11px] text-on-desk-soft">
                  Draw here, then Capture to tape it into the notes.
                </span>
              )}
            </div>
          )}

          <div className="flex-1 min-h-0 relative">
            {pack ? (
              <div className="absolute inset-0 overflow-y-auto rounded-xl bg-panel border border-panel-edge p-4">
                <LessonPackView pack={pack} />
              </div>
            ) : (
              <>
                {/* The board stays mounted while the notes are showing, so a
                    drawing survives switching tabs and can still be captured. */}
                <div
                  className={`absolute inset-0 rounded-xl overflow-hidden border border-panel-edge ${
                    panel === "whiteboard" ? "" : "invisible pointer-events-none"
                  }`}
                >
                  <Whiteboard onReady={handleBoardReady} />
                </div>
                <div
                  className={`absolute inset-0 overflow-y-auto ${
                    panel === "notes" ? "" : "hidden"
                  }`}
                >
                  {myRole === "tutor" ? (
                    <TutorView notebook={notebook} learnerId={learnerId} />
                  ) : (
                    <NotebookPage
                      notebook={notebook}
                      previous={previous}
                      captures={captures}
                      date={lessonDate}
                    />
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
