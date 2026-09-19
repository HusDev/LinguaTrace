"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { NotebookPage } from "@/components/Notebook";
import { LessonPackView } from "@/components/LessonPackView";
import { LiveRail } from "@/components/LiveRail";
import { TutorView } from "@/components/TutorView";
import { MobileLesson, type MobileTab } from "@/components/MobileLesson";
import type { RoomApi, RoomStreams } from "@/components/VideoRoom";
import type { WhiteboardApi } from "@/components/Whiteboard";
import type { LessonPack } from "@/lib/lessonPack";
import { useSpeech, useSpeechSupported } from "@/lib/useSpeech";
import { useIsDesktop } from "@/lib/useIsDesktop";
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
  const router = useRouter();
  /* One layout at a time: both contain a video room, and mounting both would
     open two calls. */
  const isDesktop = useIsDesktop();
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
  /* The lesson's learner, which is not the signed-in account when a tutor is
     the one looking. */
  const [lessonLearnerId, setLessonLearnerId] = useState<string | null>(null);
  const [me, setMe] = useState<{
    id: string;
    name: string;
    role: Speaker;
  } | null>(null);
  /* Who you are decides your side of the lesson. It is not a control. */
  const myRole: Speaker = me?.role ?? "learner";
  const [draft, setDraft] = useState("");
  const [streams, setStreams] = useState<RoomStreams>({ local: null, remote: null });
  const [transcribing, setTranscribing] = useState(false);
  const [panel, setPanel] = useState<"notes" | "whiteboard">("notes");
  /* On a phone the call and the notes cannot share a screen, so they become two
     panes. Stacked, the notebook - the thing the learner keeps - sat several
     screens below the video and the transcript. Above `lg` both are visible and
     this is ignored. */
  const [mobileTab, setMobileTab] = useState<MobileTab>("lesson");
  /* What the classifier decided about each turn. Without this the app is silent
     whenever it writes nothing, which is indistinguishable from being broken. */
  const [outcomes, setOutcomes] = useState<Record<string, string>>({});

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

  const startLesson = useCallback(
    async (join?: string) => {
    setError(null);
    setStatus(null);
    setPack(null);
    setCaptures([]);
    setOutcomes({});
    setTranscribing(false);
    setPrevious(notebook.turns.length > 0 ? notebook : previous);

    const res = await fetch("/api/lesson", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(join ? { join } : {}),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Could not start the lesson.");
      return;
    }
    script.current = data.scriptedTurns;
    cursor.current = 0;
    setLessonId(data.lessonId);
    setLessonDate(data.date);
    if (data.me) setMe(data.me);
    setLessonLearnerId(data.learnerId ?? null);
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
    /* A joiner picks up the lesson as it already stands rather than a blank
       page, so they see what has been written before they arrived. */
    setNotebook(
      data.notebook ??
        emptyNotebook(data.lessonId, data.learnerName, data.tutorName),
    );
    if (!data.jevConfigured) {
      setError(
        "TYPESAFE_API_KEY is not set, so nothing will be classified. Add it to .env.local and restart.",
      );
    }
    setPhase("running");
    },
    [notebook, previous],
  );

  /* A status line reports something that just happened, so it goes away by
     itself rather than taking a row of a phone screen for the whole lesson.
     Errors stay: those are not news, they are a condition. */
  useEffect(() => {
    if (!status) return;
    const timer = setTimeout(() => setStatus(null), 6000);
    return () => clearTimeout(timer);
  }, [status]);

  /* Who is signed in. The app is unusable without it, so a missing account
     sends you to sign in rather than showing a page that cannot work. */
  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.account) {
          setMe(d.account);
          return;
        }
        const next = encodeURIComponent(
          window.location.pathname + window.location.search,
        );
        router.replace(`/login?next=${next}`);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [router]);

  /* Opening an invite link joins that lesson instead of starting a new one. */
  const joinParam = useRef<string | null>(null);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("lesson");
    if (!id || joinParam.current) return;
    joinParam.current = id;
    void startLesson(id);
  }, [startLesson]);

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
  async function capture(fromWhiteboard = panel === "whiteboard") {
    const onBoard = fromWhiteboard;
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

  /** Prefer Gemini: it hears both sides and labels them. The browser recogniser
      is only a fallback when there is no room to listen to. */
  function toggleListening() {
    if (session) {
      setTranscribing((on) => !on);
      return;
    }
    if (speech.listening) speech.stop();
    else speech.start();
  }

  function copyInvite() {
    if (!lessonId) return;
    const url = `${window.location.origin}/?lesson=${lessonId}`;
    void navigator.clipboard
      ?.writeText(url)
      .then(() => setStatus(`Invite link copied: ${url}`))
      .catch(() => setStatus(`Invite link: ${url}`));
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
      {isDesktop && (
      <header className="flex flex-wrap items-center gap-2 lg:gap-3 px-1 shrink-0">
        <span
          aria-hidden
          className="grid place-items-center h-9 w-9 rounded-lg bg-panel-raised border border-panel-edge text-lg"
        >
          📓
        </span>
        <div className="mr-auto lg:mr-0">
          <h1 className="text-[15px] lg:text-[17px] font-semibold leading-tight">
            LinguaTrace
          </h1>
          <p className="text-[11px] text-on-desk-soft leading-tight hidden sm:block">
            Live lesson companion
          </p>
        </div>

        {me && (
          <>
            <button
              type="button"
              onClick={async () => {
                await fetch("/api/auth/logout", { method: "POST" });
                router.replace("/login");
                router.refresh();
              }}
              title="Sign out"
              className="ml-2 rounded-lg border border-panel-edge bg-panel px-3 py-1.5 text-[12px] hover:border-on-desk-soft/50"
            >
              {me.name}
              <span className="text-on-desk-soft"> · {me.role}</span>
            </button>
            <p className="text-[11px] text-on-desk-soft mr-auto ml-1 hidden xl:block">
              {myRole === "tutor" ? "seeing the tutor's view" : "seeing the notebook"}
            </p>
          </>
        )}
        {!me && <span className="mr-auto" />}

        {phase === "idle" && (
          <button
            onClick={() => void startLesson()}
            className="rounded-lg bg-accent-bg text-accent border border-accent/40 px-3 lg:px-4 py-2 text-[12px] lg:text-[13px] font-medium"
          >
            Start lesson
          </button>
        )}
        {(phase === "running" || phase === "paused") && (
          <>
            {!live && (
              <button
                onClick={() => setPhase(phase === "running" ? "paused" : "running")}
                className="rounded-lg border border-panel-edge bg-panel px-3 lg:px-3.5 py-2 text-[12px] lg:text-[13px]"
              >
                {phase === "running" ? "Pause" : "Resume"}
              </button>
            )}
            {live && lessonId && (
              <button
                onClick={copyInvite}
                className="rounded-lg border border-panel-edge bg-panel px-3 lg:px-3.5 py-2 text-[12px] lg:text-[13px]"
              >
                Copy invite
              </button>
            )}
            <button
              onClick={endLesson}
              className="rounded-lg bg-accent-bg text-accent border border-accent/40 px-3 lg:px-4 py-2 text-[12px] lg:text-[13px] font-medium"
            >
              Lesson pack
            </button>
          </>
        )}
        {phase === "ended" && (
          <>
            {me && (
              <Link
                href={`/learner/${lessonLearnerId ?? me?.id}`}
                className="rounded-lg border border-panel-edge bg-panel px-3 lg:px-3.5 py-2 text-[12px] lg:text-[13px]"
              >
                All lessons
              </Link>
            )}
            {lessonId && (
              <Link
                href={`/lesson/${lessonId}`}
                className="rounded-lg border border-panel-edge bg-panel px-3 lg:px-3.5 py-2 text-[12px] lg:text-[13px]"
              >
                Open this lesson
              </Link>
            )}
            <button
              onClick={() => setPack(null)}
              disabled={!pack}
              className="rounded-lg border border-panel-edge bg-panel px-3 lg:px-3.5 py-2 text-[12px] lg:text-[13px] disabled:opacity-40"
            >
              Back to notes
            </button>
            <button
              onClick={downloadPack}
              disabled={!pack}
              className="rounded-lg border border-panel-edge bg-panel px-3 lg:px-3.5 py-2 text-[12px] lg:text-[13px] disabled:opacity-40"
            >
              Download
            </button>
            <button
              onClick={() => void startLesson()}
              className="rounded-lg bg-accent-bg text-accent border border-accent/40 px-3 lg:px-4 py-2 text-[12px] lg:text-[13px] font-medium"
            >
              New lesson
            </button>
          </>
        )}
      </header>
      )}

      {isDesktop && (error || status) && (
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

      {!isDesktop && (
      <MobileLesson
        tab={mobileTab}
        onTab={setMobileTab}
        notebook={notebook}
        outcomes={outcomes}
        interim={interimText}
        me={me}
        phase={phase}
        live={live}
        listening={transcribing || speech.listening}
        cameraOn={cameraOn}
        reconnecting={reconnecting}
        draft={draft}
        canCapture={
          phase !== "ended" &&
          (mobileTab === "canvas" || (Boolean(session) && cameraOn))
        }
        onToggleListening={toggleListening}
        onToggleCamera={() => setCameraOn((c) => !c)}
        onCapture={() => void capture(mobileTab === "canvas")}
        onDraft={setDraft}
        onSend={() => {
          submitTurn(draft, myRole);
          setDraft("");
        }}
        onStart={() => void startLesson()}
        onCopyInvite={copyInvite}
        message={error ?? status}
        messageIsError={Boolean(error)}
        room={
          session ? (
            <VideoRoom
              applicationId={session.applicationId}
              sessionId={session.sessionId}
              token={session.token}
              cameraOn={cameraOn}
              layout="stage"
              tutorName={notebook.tutorName}
              learnerName={notebook.learnerName}
              onStatus={setStatus}
              onReady={handleReady}
              onStreams={handleStreams}
            />
          ) : (
            <div className="w-full h-full rounded-2xl border border-panel-edge bg-panel-raised" />
          )
        }
        notes={
          myRole === "tutor" ? (
            <TutorView notebook={notebook} learnerId={lessonLearnerId} />
          ) : (
            <NotebookPage
              notebook={notebook}
              previous={previous}
              captures={captures}
              date={lessonDate}
            />
          )
        }
        canvas={<Whiteboard onReady={handleBoardReady} />}
        pack={
          pack ? (
            <div className="rounded-2xl bg-panel border border-panel-edge p-4">
              <LessonPackView pack={pack} />
            </div>
          ) : (
            <div className="rounded-2xl border border-panel-edge bg-panel p-6 text-center">
              <p className="text-[14px] mb-4">
                {phase === "idle"
                  ? "The pack is built when a lesson ends."
                  : "End the lesson to build the Lesson Pack."}
              </p>
              <button
                onClick={endLesson}
                disabled={phase === "idle" || phase === "ended"}
                className="rounded-xl bg-accent-bg text-accent border border-accent/40 px-5 py-2.5 text-[14px] font-medium disabled:opacity-40"
              >
                End lesson &amp; build pack
              </button>
            </div>
          )
        }
      />
      )}

      {isDesktop && (
      <div className="grid gap-3 lg:grid-cols-[320px_minmax(0,1fr)] flex-1 min-h-0">
        <div className="hidden lg:flex min-h-0 flex-col">
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
          onToggleListening={toggleListening}
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
        </div>

        <div className="hidden lg:flex min-h-0 flex-col gap-2">
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
                    <TutorView notebook={notebook} learnerId={lessonLearnerId} />
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
      )}
    </main>
  );
}
