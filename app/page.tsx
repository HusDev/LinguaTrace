"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NotebookPage } from "@/components/Notebook";
import { LessonPackView } from "@/components/LessonPackView";
import { LiveRail } from "@/components/LiveRail";
import { TutorView } from "@/components/TutorView";
import { MobileLesson, type MobileTab } from "@/components/MobileLesson";
import type { RoomApi, RoomStreams } from "@/components/VideoRoom";
import type { BoardSync, WhiteboardApi } from "@/components/Whiteboard";
import {
  BOARD_SIGNAL,
  CAPTURE_SIGNAL,
  type CaptureMessage,
  createDecoder,
  encode,
} from "@/lib/boardSync";
import { shrinkCapture } from "@/lib/captureImage";
import type { LessonPack } from "@/lib/lessonPack";
import { useSpeech, useSpeechSupported } from "@/lib/useSpeech";
import { useIsDesktop } from "@/lib/useIsDesktop";
import { useLiveTranscription } from "@/lib/useLiveTranscription";
import {
  ASR_ARTEFACT_THRESHOLD,
  LESSON_SPEECH_THRESHOLD,
  emptyNotebook,
  type Notebook,
  type Speaker,
  type Turn,
} from "@/lib/types";

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
  /* A turn the judgments could not answer for in time is not a turn that
     produced nothing, and saying so is the difference between an app that is
     behind and one that looks broken. */
  if (result.signals?.timedOut) return "not judged in time";
  if (result.added.length > 0) {
    return [...new Set(result.added)]
      .map((a) => NOTE_LABELS[a] ?? a)
      .join(" · ");
  }
  const gate = result.signals?.isLessonSpeech ?? 1;
  if (gate < LESSON_SPEECH_THRESHOLD) return "not lesson speech";
  /* The transcript, not the learner, is what looks wrong here. Saying which
     keeps the app from appearing to have missed something. */
  if ((result.signals?.isAsrArtefact ?? 0) >= ASR_ARTEFACT_THRESHOLD) {
    return "heard, but the transcript looks garbled";
  }
  return "heard, nothing to note";
}

/**
 * The server's transcript, plus any turn this device has posted that has not
 * come back yet. Ordered by the server, because it sees both sides.
 */
function mergeTurns(fromServer: Turn[], local: Turn[]): Turn[] {
  const known = new Set(fromServer.map((t) => t.id));
  return [...fromServer, ...local.filter((t) => !known.has(t.id))];
}

/**
 * The three places the right-hand panel can be.
 *
 * "todo" is the tutor's own question - what has not been dealt with yet - and
 * "notes" is the learner's page. The tutor used to get the first in place of
 * the second, which answered their question and hid the lesson: the notebook is
 * what the learner keeps and what the tutor is writing into by teaching, so not
 * being able to look at it was a gap rather than a focus.
 */
type Panel = "todo" | "notes" | "whiteboard";

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
  /* Who you are decides your side of the lesson. It is not a control.
     Until the account has loaded there is no answer, and guessing one is not
     harmless: the questions asked of a turn depend on who said it, so a tutor
     filed as a learner is never asked whether they just corrected something,
     taught a word, or explained a rule. Those turns are not judged badly - they
     are judged as the wrong person's, and the notebook stays empty however good
     the teaching was. So nothing is transcribed until this is known. */
  const myRole: Speaker = me?.role ?? "learner";
  const roleKnown = me !== null;
  const [draft, setDraft] = useState("");
  const [streams, setStreams] = useState<RoomStreams>({ local: null, remote: null });
  /* The microphone is the switch. Transcription starts with the room and pauses
     while muted, so there is one control rather than two that overlap: a mic
     button that does not stop the notes is not a mute. */
  const [micOn, setMicOn] = useState(true);
  const [chosenPanel, setPanel] = useState<Panel | null>(null);
  /* Null until someone picks, so the opening panel can follow the role without
     an effect writing state behind the user's back. A tutor opens on their own
     view because it is the one with something to act on; after that the choice
     is theirs and sticks. */
  const panel: Panel = chosenPanel ?? (myRole === "tutor" ? "todo" : "notes");
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

  /* How much of the lesson the newest applied response had seen. Turns are
     posted as they are spoken and answered concurrently, so responses do not
     come back in the order they were sent; without this, an older one landing
     last replaced the notebook with a staler copy and notes the learner had
     already read disappeared off the page. */
  const applied = useRef(0);

  const sendTurn = useCallback(async (turn: Turn, id: string) => {
    try {
      const res = await fetch("/api/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonId: id, turn }),
      });
      const data = await res.json();
      if (data.notebook) {
        const seen = data.notebook.processedTurnIds?.length ?? 0;
        if (seen >= applied.current) {
          applied.current = seen;
          /* The transcript is merged rather than replaced. The server holds
             both sides of the lesson, so its turns are the ones to keep; but a
             turn this device has only just posted is not in them yet, and
             replacing outright made it flicker out and back. */
          setNotebook((n) => ({
            ...data.notebook,
            turns: mergeTurns(data.notebook.turns ?? [], n.turns),
          }));
        }
      }
      if (data.result) {
        /* An echo is the other microphone hearing the same sentence. The server
           never took it as a turn, so this device drops the copy it optimistically
           added - otherwise the line stays on this page and nowhere else, which is
           the double transcript the separate streams were meant to end. */
        if (data.result.signals?.echo) {
          setNotebook((n) => ({
            ...n,
            turns: n.turns.filter((t) => t.id !== turn.id),
          }));
        } else {
          setOutcomes((o) => ({ ...o, [turn.id]: describeOutcome(data.result) }));
        }
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
      if (!trimmed || !lessonId || !roleKnown) return;
      const turn: Turn = {
        id: `live-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        speaker,
        text: trimmed,
        at: Date.now(),
      };
      setNotebook((n) => ({ ...n, turns: [...n.turns, turn] }));
      void sendTurn(turn, lessonId);
    },
    [lessonId, sendTurn, roleKnown],
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
    enabled: Boolean(session) && roleKnown,
    muted: !micOn,
    /* Each device transcribes its own microphone and nothing else.
       Transcribing both streams meant both people transcribed both voices, so
       every sentence was sent twice and appeared under both names. It also has
       the better audio: the raw local microphone, before the network. */
    streams: myRole === "learner"
      ? { learner: streams.local }
      : { tutor: streams.local },
    onFinalTurn: onTranscribedTurn,
    onError: setError,
  });

  const transcribingLive = transcription.active.length > 0;

  /* The video tiles are labelled from this viewer's side, so the tutor sees
     their own name on their own picture. */
  const peerRole: Speaker = myRole === "tutor" ? "learner" : "tutor";
  const selfName = myRole === "tutor" ? notebook.tutorName : notebook.learnerName;
  const peerName = myRole === "tutor" ? notebook.learnerName : notebook.tutorName;
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

  /* The board rides the video session. It exists only once the room is ready,
     and the whiteboard falls back to a private canvas without it. */
  const [boardSync, setBoardSync] = useState<BoardSync | null>(null);

  const handleReady = useCallback((api: RoomApi | null) => {
    roomApi.current = api;
    setBoardSync(
      api
        ? {
            send: (data) => api.signal(BOARD_SIGNAL, data),
            subscribe: (handler) => api.onSignal(BOARD_SIGNAL, handler),
            onPeerJoined: (handler) => api.onPeerJoined(handler),
          }
        : null,
    );
  }, []);

  /* Captures ride the same session as the board, on their own channel.
     Identifies this browser so its own messages, which come back to it, are
     ignored the way the board's are. */
  /* Identifies this browser, so its own signals - which come back to it - are
     ignored the way the board ignores its own. Made on first use rather than
     during a render, because a render must be able to run twice and give the
     same answer. */
  const clientIdRef = useRef<string | null>(null);
  const myClientId = useCallback(
    () => (clientIdRef.current ??= Math.random().toString(36).slice(2, 10)),
    [],
  );
  /* Kept beside the state rather than derived from it: a peer arriving
     mid-lesson asks what has been taped in, and the handler answering that must
     not be torn down and rebuilt every time a capture lands - a multi-part
     picture still arriving would lose the pieces already collected. */
  const capturesRef = useRef<Capture[]>([]);

  const applyCaptures = useCallback(
    (update: (current: Capture[]) => Capture[]) => {
      const next = update(capturesRef.current);
      if (next === capturesRef.current) return;
      capturesRef.current = next;
      setCaptures(next);
    },
    [],
  );

  /* What the page tapes into the margin: the drawings kept with the lesson,
     plus whatever has been captured or received since it loaded. Reopening a
     lesson brings the whiteboard cards back; the camera stills are gone, which
     is the promise the app makes about them. */
  const shownCaptures = useMemo(() => {
    const live = new Set(captures.map((c) => c.id));
    return [...notebook.captures.filter((c) => !live.has(c.id)), ...captures];
  }, [notebook.captures, captures]);

  const addCapture = useCallback(
    (incoming: Capture) => {
      applyCaptures((c) =>
        c.some((existing) => existing.id === incoming.id) ? c : [...c, incoming],
      );
    },
    [applyCaptures],
  );

  const sendCapture = useCallback(
    (capture: Capture) => {
      const api = roomApi.current;
      if (!api) return;
      for (const part of encode({ kind: "capture", from: myClientId(), capture })) {
        api.signal(CAPTURE_SIGNAL, part);
      }
    },
    [myClientId],
  );

  /* Someone arriving mid-lesson asks for what has already been taped in, the
     same way the board is asked for. Without it, joining late means an empty
     margin beside a notebook that plainly refers to a drawing. */
  useEffect(() => {
    const api = roomApi.current;
    if (!api || !session) return;

    /* One decoder for as long as the room lasts. The effect no longer depends
       on the captures themselves, so a multi-part picture mid-flight is not
       thrown away every time one lands. */
    const decode = createDecoder<CaptureMessage>();
    const stopListening = api.onSignal(CAPTURE_SIGNAL, (raw) => {
      const message = decode(raw);
      if (!message || message.from === myClientId()) return;
      if (message.kind === "capture") addCapture(message.capture);
      else if (message.kind === "all") message.captures.forEach(addCapture);
      else if (message.kind === "hello") {
        const mine = capturesRef.current;
        if (mine.length === 0) return;
        for (const part of encode({ kind: "all", from: myClientId(), captures: mine })) {
          api.signal(CAPTURE_SIGNAL, part);
        }
      }
    });

    const stopGreeting = api.onPeerJoined(() => {
      for (const part of encode({ kind: "hello", from: myClientId() })) {
        api.signal(CAPTURE_SIGNAL, part);
      }
    });

    for (const part of encode({ kind: "hello", from: myClientId() })) {
      api.signal(CAPTURE_SIGNAL, part);
    }

    return () => {
      stopListening();
      stopGreeting();
    };
  }, [session, boardSync, addCapture, myClientId]);

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
    setMicOn(true);
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

    /* Shrunk once, here, and the smaller picture is what gets taped in as well
       as what gets sent - so both people are looking at the same image, and the
       one on the page is the one that travelled. */
    const shared = await shrinkCapture(dataUrl);

    let duplicate = false;
    const entry: Capture = {
      id: `capture-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      dataUrl: shared,
      kind: onBoard ? "whiteboard" : "camera",
    };

    applyCaptures((c) => {
      // A double-tap grabs the same image twice; the second adds nothing.
      duplicate = c.some((existing) => existing.dataUrl === shared);
      return duplicate ? c : [...c, entry];
    });

    if (!duplicate) {
      /* The other person is in this lesson too. A snapshot that stayed in the
         browser that took it meant the tutor could draw on the board, watch the
         learner tape it in, and never see the note they had just made. */
      sendCapture(entry);

      /* A drawing is kept with the lesson; a still of someone's face is not.
         The learner's notebook is reopened later, and the whiteboard card
         should be on the page when it is. */
      if (onBoard && lessonId) {
        void fetch("/api/capture", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lessonId, id: entry.id, dataUrl: shared }),
        }).catch(() => {
          /* Failing to store it costs the card on a later visit, never the card
             in front of the two people who are in the lesson now. */
        });
      }
    }

    setStatus(
      duplicate
        ? "That is the same image as the last capture."
        : onBoard
          ? "Whiteboard taped into both notebooks."
          : "Frame taped into both notebooks.",
    );
  }

  /**
   * Mute this device.
   *
   * Two machines in one room hear each other, so silencing one is what stops the
   * same sentence being transcribed twice under two names. Muting stops the
   * audio reaching the room and the transcription alike; a mic button that left
   * the notes running would not be a mute.
   */
  function toggleMic() {
    if (session) {
      setMicOn((on) => !on);
      return;
    }
    // Without a room, the browser recogniser is the only microphone there is.
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

        {phase === "idle" &&
          (me?.role === "tutor" ? (
            <button
              onClick={() => void startLesson()}
              className="rounded-lg bg-accent-bg text-accent border border-accent/40 px-3 lg:px-4 py-2 text-[12px] lg:text-[13px] font-medium"
            >
              Start lesson
            </button>
          ) : (
            <p className="text-[12px] text-on-desk-soft">
              Your tutor starts the lesson - open the link they send you.
            </p>
          ))}
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
            {me?.role === "tutor" && (
              <button
                onClick={() => void startLesson()}
                className="rounded-lg bg-accent-bg text-accent border border-accent/40 px-3 lg:px-4 py-2 text-[12px] lg:text-[13px] font-medium"
              >
                New lesson
              </button>
            )}
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
        listening={session ? micOn : speech.listening}
        cameraOn={cameraOn}
        reconnecting={reconnecting}
        draft={draft}
        canCapture={
          phase !== "ended" &&
          (mobileTab === "canvas" || (Boolean(session) && cameraOn))
        }
        onToggleListening={toggleMic}
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
              micOn={micOn}
              layout="stage"
              selfName={selfName}
              peerName={peerName}
              peerRole={peerRole}
              onStatus={setStatus}
              onReady={handleReady}
              onStreams={handleStreams}
            />
          ) : (
            <div className="w-full h-full rounded-2xl border border-panel-edge bg-panel-raised" />
          )
        }
        notes={
          /* The phone's bottom bar is already four places wide and a fifth would
             not be a thumb's reach, so the tutor's two documents share the Notes
             tab and a switch at the top of it - the same two things the desk
             layout puts in its tab strip. */
          myRole === "tutor" ? (
            <div className="flex-1 min-w-0 flex flex-col gap-3">
              <div className="flex gap-1.5">
                {(["todo", "notes"] as const).map((which) => (
                  <button
                    key={which}
                    type="button"
                    onClick={() => setPanel(which)}
                    className={`rounded-lg px-3 py-1.5 text-[12px] border ${
                      panel === which
                        ? "border-accent/50 bg-accent-bg/50 text-accent"
                        : "border-panel-edge bg-panel text-on-desk-soft"
                    }`}
                  >
                    {which === "todo" ? "To deal with" : "Their notebook"}
                  </button>
                ))}
              </div>
              {panel === "notes" ? (
                <NotebookPage
                  notebook={notebook}
                  previous={previous}
                  captures={shownCaptures}
                  date={lessonDate}
                />
              ) : (
                <TutorView notebook={notebook} learnerId={lessonLearnerId} />
              )}
            </div>
          ) : (
            <NotebookPage
              notebook={notebook}
              previous={previous}
              captures={shownCaptures}
              date={lessonDate}
            />
          )
        }
        canvas={<Whiteboard onReady={handleBoardReady} sync={boardSync} />}
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
          listening={session ? micOn : speech.listening}
          interim={interimText}
          outcomes={outcomes}
          transcribingLive={transcribingLive}
          transcribingWith={session && micOn ? "Gemini" : null}
          reconnecting={reconnecting}
          cameraOn={cameraOn}
          myRole={myRole}
          draft={draft}
          canCapture={
            phase !== "ended" &&
            (panel === "whiteboard" || (Boolean(session) && cameraOn))
          }
          speechAvailable={speechAvailable || Boolean(session)}
          onToggleListening={toggleMic}
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
                micOn={micOn}
                selfName={selfName}
                peerName={peerName}
                peerRole={peerRole}
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
              {(myRole === "tutor"
                ? (["todo", "notes", "whiteboard"] as const)
                : (["notes", "whiteboard"] as const)
              ).map((tab) => (
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
                  {tab === "todo" ? "to deal with" : tab}
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
                  <Whiteboard onReady={handleBoardReady} sync={boardSync} />
                </div>
                {/* Only the tutor's, and only mounted for them: it fetches the
                    learner's history, which the learner's own page never asks for. */}
                {myRole === "tutor" && (
                  <div
                    className={`absolute inset-0 overflow-y-auto ${
                      panel === "todo" ? "" : "hidden"
                    }`}
                  >
                    <TutorView notebook={notebook} learnerId={lessonLearnerId} />
                  </div>
                )}
                <div
                  className={`absolute inset-0 overflow-y-auto ${
                    panel === "notes" ? "" : "hidden"
                  }`}
                >
                  <NotebookPage
                    notebook={notebook}
                    previous={previous}
                    captures={shownCaptures}
                    date={lessonDate}
                  />
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
