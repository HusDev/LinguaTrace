"use client";

import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import type { Notebook, Speaker, Turn } from "@/lib/types";

/**
 * The phone layout.
 *
 * A phone cannot show the call and the notebook at once, and stacking them put
 * the notebook - the thing the learner keeps - several screens below the fold.
 * So the app becomes four places you move between, with the call on top: the
 * video takes the screen, the transcript sits under it, and the controls are
 * where a thumb reaches.
 *
 * Above `lg` none of this renders; the desk layout takes over.
 */

export type MobileTab = "lesson" | "canvas" | "notes" | "pack";

const TABS: Array<{ id: MobileTab; label: string; icon: ReactNode }> = [
  {
    id: "lesson",
    label: "Lesson",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
        <rect x="2.5" y="6" width="13" height="12" rx="2.5" />
        <path d="M15.5 11l6-3.5v9l-6-3.5z" />
      </svg>
    ),
  },
  {
    id: "canvas",
    label: "Canvas",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
        <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
        <path d="M7 15l3.5-4 3 3 2-2.5L17 15" />
      </svg>
    ),
  },
  {
    id: "notes",
    label: "Notes",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <rect x="4" y="3" width="16" height="18" rx="2.5" />
        <path d="M8 8h8M8 12h8M8 16h5" />
      </svg>
    ),
  },
  {
    id: "pack",
    label: "Pack",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
        <path d="M4 5.5A2 2 0 0 1 6 4h5v16H6a2 2 0 0 0-2 1.5z" />
        <path d="M20 5.5A2 2 0 0 0 18 4h-5v16h5a2 2 0 0 1 2 1.5z" />
      </svg>
    ),
  },
];

const MicIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <rect x="9" y="2.5" width="6" height="11" rx="3" />
    <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
  </svg>
);

const CameraIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
    <rect x="2.5" y="6" width="13" height="12" rx="2.5" />
    <path d="M15.5 11l6-3.5v9l-6-3.5z" />
  </svg>
);

const CaptureIcon = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
    <path d="M3 7.5h4l1.5-2h7L17 7.5h4v11H3z" />
    <circle cx="12" cy="13" r="3.2" />
  </svg>
);

/** A sparkle, shown on a turn the notebook took something from. */
const Sparkle = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M12 2l1.8 5.6L19.5 9l-5.7 1.4L12 16l-1.8-5.6L4.5 9l5.7-1.4z" />
    <path d="M18.5 14l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9z" opacity=".7" />
  </svg>
);

function RoundButton({
  icon,
  label,
  active,
  disabled,
  onClick,
  primary,
}: {
  icon: ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={primary ? undefined : active}
      className={`grid place-items-center rounded-full transition-colors disabled:opacity-35 ${
        primary
          ? "h-[72px] w-[72px] bg-accent text-[#15321f] gap-0.5"
          : `h-14 w-14 border ${
              active
                ? "border-accent/60 bg-accent-bg text-accent"
                : "border-panel-edge bg-panel-raised text-on-desk"
            }`
      }`}
    >
      <span aria-hidden>{icon}</span>
      {primary && <span className="text-[10px] font-medium leading-none">{label}</span>}
    </button>
  );
}

export interface MobileLessonProps {
  tab: MobileTab;
  onTab: (tab: MobileTab) => void;
  notebook: Notebook;
  outcomes: Record<string, string>;
  interim: string;
  me: { name: string; role: Speaker } | null;
  phase: "idle" | "running" | "paused" | "ended";
  live: boolean;
  listening: boolean;
  cameraOn: boolean;
  canCapture: boolean;
  reconnecting: Speaker[];
  draft: string;
  room: ReactNode;
  notes: ReactNode;
  canvas: ReactNode;
  pack: ReactNode;
  onToggleListening: () => void;
  onToggleCamera: () => void;
  onCapture: () => void;
  onDraft: (value: string) => void;
  onSend: () => void;
  onStart: () => void;
  onCopyInvite: () => void;
  /** A status line or an error, shown under the header. */
  message: string | null;
  messageIsError: boolean;
}

export function MobileLesson(props: MobileLessonProps) {
  const { notebook, outcomes, interim, me, phase, live, tab } = props;
  const started = phase !== "idle";
  const endOfTranscript = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endOfTranscript.current?.scrollIntoView({ behavior: "smooth" });
  }, [notebook.turns.length]);

  const nameFor = (turn: Turn) =>
    turn.speaker === "tutor" ? notebook.tutorName : notebook.learnerName;
  const isMine = (turn: Turn) => turn.speaker === me?.role;

  const status = props.reconnecting.length
    ? `Reconnecting ${props.reconnecting.join(" and ")}…`
    : !started
      ? "Not started"
      : live
        ? props.listening
          ? "Live"
          : "Room open"
        : "Scripted";

  return (
    <div className="lg:hidden fixed inset-0 flex flex-col overflow-hidden">
      <header className="flex items-center gap-2.5 px-3 py-2.5 shrink-0">
        <span
          aria-hidden
          className="grid place-items-center h-9 w-9 rounded-xl bg-panel-raised border border-panel-edge text-lg shrink-0"
        >
          📓
        </span>
        <h1 className="text-[17px] font-semibold mr-auto">LinguaTrace</h1>
        <span
          className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${
            started && live
              ? "bg-accent-bg text-accent"
              : "bg-panel-raised text-on-desk-soft"
          }`}
        >
          {started && live && (
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />
          )}
          {status}
        </span>
        {started && live && (
          <button
            type="button"
            onClick={props.onCopyInvite}
            aria-label="Copy the invite link"
            className="grid place-items-center h-9 w-9 rounded-full border border-panel-edge bg-panel text-on-desk-soft shrink-0"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <circle cx="5" cy="12" r="1.8" />
              <circle cx="12" cy="12" r="1.8" />
              <circle cx="19" cy="12" r="1.8" />
            </svg>
          </button>
        )}
      </header>

      {props.message && (
        <p
          className={`shrink-0 mx-3 mb-2 rounded-xl px-3 py-2 text-[12px] ${
            props.messageIsError
              ? "bg-[#4a2424] text-[#ffb4b4] border border-[#6b3333]"
              : "bg-panel text-on-desk-soft border border-panel-edge"
          }`}
        >
          {props.message}
        </p>
      )}

      {/* The lesson holds its own shape; the other tabs are documents and scroll. */}
      <div
        className={`flex-1 min-h-0 px-3 pb-3 ${
          tab === "lesson" ? "overflow-hidden" : "overflow-y-auto"
        }`}
      >
        {tab === "lesson" && (
          <div className="flex flex-col gap-3 h-full">
            {!started ? (
              <div className="rounded-2xl border border-panel-edge bg-panel p-6 text-center">
                <p className="text-[14px] mb-4">
                  {me?.role === "tutor"
                    ? "Start the lesson, then send the invite to your learner."
                    : "Start a lesson, or open the link your tutor sent you."}
                </p>
                <button
                  onClick={props.onStart}
                  className="rounded-xl bg-accent-bg text-accent border border-accent/40 px-5 py-2.5 text-[14px] font-medium"
                >
                  Start lesson
                </button>
              </div>
            ) : (
              /* A fixed share of the screen: enough to read a face, not so much
                 that the transcript has nowhere to live. */
              <div className="shrink-0 h-[34vh] min-h-[200px]">{props.room}</div>
            )}

            <section className="rounded-2xl border border-panel-edge bg-panel p-3 flex-1 min-h-0 flex flex-col">
              <h2 className="text-[13px] font-medium mb-2.5">Live transcript</h2>
              <div className="flex-1 overflow-y-auto space-y-2.5 -mr-1 pr-1">
                {notebook.turns.length === 0 && (
                  <p className="text-[13px] text-on-desk-soft">
                    {started
                      ? "Turn on the microphone, or type below."
                      : "Nothing said yet."}
                  </p>
                )}
                {notebook.turns.map((turn) => {
                  const noted =
                    outcomes[turn.id] &&
                    !/nothing|not lesson/.test(outcomes[turn.id]);
                  return (
                    <div key={turn.id} className="flex gap-2.5">
                      <span
                        aria-hidden
                        className={`shrink-0 grid place-items-center h-8 w-8 rounded-full text-[12px] font-semibold ${
                          turn.speaker === "tutor"
                            ? "bg-[#f0c9c9] text-[#6b3b3b]"
                            : "bg-[#bfe3cb] text-[#2c5741]"
                        }`}
                      >
                        {nameFor(turn).charAt(0).toUpperCase()}
                      </span>
                      <div
                        className={`min-w-0 flex-1 rounded-xl px-3 py-2 relative ${
                          isMine(turn) ? "bg-panel-raised" : "bg-[#3b2f2a]"
                        }`}
                      >
                        <p className="text-[11px] text-on-desk-soft leading-tight">
                          {nameFor(turn)} · {turn.speaker}
                        </p>
                        <p className="text-[14px] leading-5 mt-0.5 pr-5">{turn.text}</p>
                        {noted && (
                          <span
                            className="absolute right-2.5 top-2.5 text-accent"
                            title={outcomes[turn.id]}
                          >
                            {Sparkle}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
                {interim && (
                  <p className="text-[13px] text-on-desk-soft italic pl-10 line-clamp-2">
                    {interim}
                  </p>
                )}
                <div ref={endOfTranscript} />
              </div>

              {started && live && phase !== "ended" && (
                <form
                  className="flex gap-2 mt-2.5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    props.onSend();
                  }}
                >
                  <input
                    value={props.draft}
                    onChange={(e) => props.onDraft(e.target.value)}
                    placeholder={`Type as the ${me?.role ?? "learner"}…`}
                    aria-label="Type a turn"
                    className="flex-1 min-w-0 rounded-xl border border-panel-edge bg-panel-raised px-3 py-2 text-[14px]"
                  />
                  <button
                    type="submit"
                    disabled={!props.draft.trim()}
                    className="rounded-xl border border-panel-edge bg-panel-raised px-3.5 text-[13px] disabled:opacity-40"
                  >
                    Send
                  </button>
                </form>
              )}
            </section>

            {started && (
              <div className="shrink-0 flex items-center justify-center gap-5 rounded-full border border-panel-edge bg-panel px-5 py-2.5">
                <RoundButton
                  icon={MicIcon}
                  label={props.listening ? "Stop listening" : "Start listening"}
                  active={props.listening}
                  disabled={!live}
                  onClick={props.onToggleListening}
                />
                <RoundButton
                  icon={CaptureIcon}
                  label="Capture"
                  primary
                  disabled={!props.canCapture}
                  onClick={props.onCapture}
                />
                <RoundButton
                  icon={CameraIcon}
                  label={props.cameraOn ? "Turn camera off" : "Turn camera on"}
                  active={props.cameraOn}
                  disabled={!live}
                  onClick={props.onToggleCamera}
                />
              </div>
            )}
          </div>
        )}

        {tab === "canvas" && (
          <div className="relative h-full min-h-[70vh] rounded-2xl overflow-hidden border border-panel-edge">
            {props.canvas}
          </div>
        )}
        {tab === "notes" && <div className="min-h-full flex">{props.notes}</div>}
        {tab === "pack" && <div className="min-h-full">{props.pack}</div>}
      </div>

      <nav
        aria-label="Sections"
        className="shrink-0 grid grid-cols-4 border-t border-panel-edge bg-panel pb-[max(env(safe-area-inset-bottom),0.25rem)]"
      >
        {TABS.map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => props.onTab(item.id)}
              aria-current={active ? "page" : undefined}
              className={`flex flex-col items-center gap-0.5 py-2 text-[11px] ${
                active ? "text-accent" : "text-on-desk-soft"
              }`}
            >
              <span aria-hidden>{item.icon}</span>
              {item.label}
              <span
                aria-hidden
                className={`h-0.5 w-6 rounded-full ${active ? "bg-accent" : "bg-transparent"}`}
              />
            </button>
          );
        })}
      </nav>
    </div>
  );
}
