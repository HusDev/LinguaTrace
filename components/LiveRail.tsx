"use client";

import type { ReactNode } from "react";
import type { Notebook, Speaker, Turn } from "@/lib/types";
import { practiceItems, settledShare } from "@/lib/derive";

function Pill({
  tone = "accent",
  children,
}: {
  tone?: "accent" | "muted";
  children: ReactNode;
}) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
        tone === "accent"
          ? "bg-accent-bg text-accent"
          : "bg-panel-raised text-on-desk-soft"
      }`}
    >
      {children}
    </span>
  );
}

function ControlButton({
  icon,
  label,
  active,
  disabled,
  onClick,
  title,
}: {
  icon: ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={active}
      className={`flex-1 rounded-xl border px-2 py-3 flex flex-col items-center gap-1.5 transition-colors disabled:opacity-35 ${
        active
          ? "border-accent/50 bg-accent-bg/50 text-accent"
          : "border-panel-edge bg-panel-raised text-on-desk hover:border-on-desk-soft/50"
      }`}
    >
      <span aria-hidden>{icon}</span>
      <span className="text-[11px] leading-none">{label}</span>
    </button>
  );
}

const MicIcon = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <rect x="9" y="2.5" width="6" height="11" rx="3" />
    <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
  </svg>
);

const MicOffIcon = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <path d="M9 5.5A3 3 0 0 1 15 5.5v5M9 10v1a3 3 0 0 0 4.5 2.6" />
    <path d="M5.5 11a6.5 6.5 0 0 0 10 5.5M12 17.5V21" />
    <path d="M4 3l16 18" />
  </svg>
);

const CameraIcon = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 7.5h4l1.5-2h7L17 7.5h4v11H3z" />
    <circle cx="12" cy="13" r="3.2" />
  </svg>
);

const PlusIcon = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

function Avatar({ speaker, name }: { speaker: Speaker; name: string }) {
  return (
    <span
      aria-hidden
      className={`shrink-0 grid place-items-center h-7 w-7 rounded-full text-[11px] font-semibold ${
        speaker === "tutor" ? "bg-[#f0c9c9] text-[#6b3b3b]" : "bg-[#bfe3cb] text-[#2c5741]"
      }`}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

export interface RailProps {
  notebook: Notebook;
  previous?: Notebook;
  phase: "idle" | "running" | "paused" | "ended";
  live: boolean;
  listening: boolean;
  interim: string;
  /** Per-turn account of what the classifier did, keyed by turn id. */
  outcomes: Record<string, string>;
  /** True once each speaker's audio has its own transcription session. */
  transcribingLive: boolean;
  /** The transcriber in use, for the status pill. */
  transcribingWith: string | null;
  /** Speakers whose transcription dropped and is being restarted. */
  reconnecting: Speaker[];
  cameraOn: boolean;
  myRole: Speaker;
  draft: string;
  room: ReactNode;
  onToggleListening: () => void;
  onToggleCamera: () => void;
  onCapture: () => void;
  onDraft: (value: string) => void;
  onSend: () => void;
  canCapture: boolean;
  /** What the Capture button will tape in, which follows the open panel. */
  captureSource: "camera" | "whiteboard";
  speechAvailable: boolean;
}

export function LiveRail(props: RailProps) {
  const {
    notebook,
    previous,
    phase,
    live,
    listening,
    interim,
    cameraOn,
    myRole,
    draft,
    room,
    outcomes,
    transcribingLive,
    transcribingWith,
    reconnecting,
  } = props;

  const started = phase !== "idle";
  const items = practiceItems(notebook, previous);
  const share = settledShare(items, Boolean(previous));

  const nameFor = (turn: Turn) =>
    turn.speaker === "tutor" ? notebook.tutorName : notebook.learnerName;

  return (
    <aside className="flex flex-col gap-3 min-h-0">
      <section className="rounded-2xl border border-panel-edge bg-panel p-3.5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[11px] uppercase tracking-[0.14em] text-on-desk-soft">
            Live lesson
          </h2>
          {started ? (
            <Pill tone={reconnecting.length > 0 ? "muted" : "accent"}>
              {reconnecting.length > 0
                ? `Reconnecting ${reconnecting.join(" and ")}…`
                : !live
                ? "Scripted lesson"
                : listening
                  ? `Live · ${transcribingWith ? `${transcribingWith} listening` : "listening"}`
                  : "Live · muted"}
            </Pill>
          ) : (
            <Pill tone="muted">Not started</Pill>
          )}
        </div>

        <div className="flex gap-2 mb-3">
          <ControlButton
            icon={listening ? MicIcon : MicOffIcon}
            label={listening ? "Mute" : "Muted"}
            active={listening}
            disabled={!started || (!live && !props.speechAvailable)}
            onClick={props.onToggleListening}
            title={
              live
                ? "Silence this device: it stops sending audio to the room and stops transcribing"
                : "Transcribe this microphone"
            }
          />
          <ControlButton
            icon={CameraIcon}
            label={started && cameraOn ? "Stop camera" : "Camera"}
            active={started && cameraOn}
            disabled={!started || !live}
            onClick={props.onToggleCamera}
          />
          <ControlButton
            icon={PlusIcon}
            label="Capture"
            disabled={!props.canCapture}
            onClick={props.onCapture}
            title={
              props.captureSource === "whiteboard"
                ? "Tape the whiteboard into the notebook"
                : "Tape the current video frame into the notebook"
            }
          />
        </div>

        {room}

        {started && live && transcribingLive && (
          <p className="text-[11px] text-on-desk-soft mt-3">
            Each side is transcribed from its own stream, so every turn is
            attributed to the right person.
          </p>
        )}
      </section>

      {/* Transcript */}
      <section className="rounded-2xl border border-panel-edge bg-panel p-3.5 flex-1 min-h-0 flex flex-col">
        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {notebook.turns.length === 0 && (
            <p className="text-sm text-on-desk-soft">
              {!started
                ? "Start the lesson to see the conversation."
                : live
                  ? "Turn on listening, or type a turn below."
                  : "Waiting for the first turn."}
            </p>
          )}
          {notebook.turns.map((turn) => (
            <div key={turn.id} className="flex gap-2.5">
              <Avatar speaker={turn.speaker} name={nameFor(turn)} />
              <div className="min-w-0">
                <p className="text-[11px] text-on-desk-soft leading-tight">
                  {nameFor(turn)}
                  {turn.speaker === "tutor" ? " (tutor)" : ""}
                </p>
                <p className="text-[13px] leading-5">{turn.text}</p>
                {outcomes[turn.id] && (
                  <p
                    className={`text-[10px] mt-1 ${
                      outcomes[turn.id].includes("nothing") ||
                      outcomes[turn.id].includes("not lesson")
                        ? "text-on-desk-soft/60"
                        : "text-accent"
                    }`}
                  >
                    {outcomes[turn.id]}
                  </p>
                )}
              </div>
            </div>
          ))}
          {interim && (
            /* A long turn produces a long hypothesis; the transcript should not
               be shoved off screen by speech that is not final yet. */
            <p className="text-[13px] leading-5 text-on-desk-soft italic pl-10 line-clamp-3">
              {interim}
            </p>
          )}
        </div>

        {started && phase !== "ended" && (
          <form
            className="flex gap-2 mt-3"
            onSubmit={(e) => {
              e.preventDefault();
              props.onSend();
            }}
          >
            <input
              value={draft}
              onChange={(e) => props.onDraft(e.target.value)}
              placeholder={live ? `Type a turn as the ${myRole}…` : "Scripted lesson running…"}
              aria-label={`Type a turn as the ${myRole}`}
              disabled={!live}
              className="flex-1 min-w-0 rounded-lg border border-panel-edge bg-panel-raised px-3 py-2 text-[13px] placeholder:text-on-desk-soft/70 disabled:opacity-40"
            />
            <button
              type="submit"
              disabled={!live || !draft.trim()}
              className="rounded-lg bg-panel-raised border border-panel-edge px-3.5 py-2 text-[13px] disabled:opacity-40"
            >
              Send
            </button>
          </form>
        )}
      </section>

      {/* To practise */}
      <section className="rounded-2xl border border-panel-edge bg-panel p-3.5">
        <div className="flex items-center justify-between mb-2.5">
          <h2 className="text-[11px] uppercase tracking-[0.14em] text-on-desk-soft">
            To practise
          </h2>
          {share === null ? (
            <Pill tone="muted">First lesson</Pill>
          ) : (
            <Pill>{share}% settled</Pill>
          )}
        </div>
        {items.length === 0 ? (
          <p className="text-[13px] text-on-desk-soft">
            Nothing flagged yet.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {items.slice(0, 6).map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-[13px] leading-5">
                <span
                  aria-hidden
                  className={`mt-0.5 grid place-items-center h-4 w-4 shrink-0 rounded border text-[10px] ${
                    item.settled
                      ? "border-accent/60 bg-accent-bg text-accent"
                      : "border-panel-edge"
                  }`}
                >
                  {item.settled ? "✓" : ""}
                </span>
                <span className={item.settled ? "line-through text-on-desk-soft" : ""}>
                  {item.label}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}
