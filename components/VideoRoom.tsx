"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The Vonage Video room.
 *
 * The SDK is loaded with a dynamic import because it touches `window` at module
 * scope and would break server rendering. Everything it needs - application id,
 * session id, and a token scoped to that session - is minted server-side; the
 * browser never sees the private key.
 */

// The SDK is an OpenTok-compatible namespace whose published types do not match
// the application-id based constructors, so it is used untyped at this boundary.
/* eslint-disable @typescript-eslint/no-explicit-any */
type OTSession = any;
type OTStream = any;

/** What the page can ask the room to do once it is connected. */
export interface RoomApi {
  /** The current local frame as a PNG data URL, or null if there is no video. */
  capture: () => string | null;
  /**
   * Send a message to the other person in the room.
   *
   * The session is already open and already scoped to these two people, so the
   * whiteboard rides it rather than needing a realtime service of its own.
   */
  signal: (type: string, data: string) => void;
  /** Listen for those messages. Returns a function that stops listening. */
  onSignal: (type: string, handler: (data: string) => void) => () => void;
  /** Called when someone else joins, so they can be sent the board so far. */
  onPeerJoined: (handler: () => void) => () => void;
}

/**
 * The call's two audio streams, named by device rather than by role.
 *
 * The browser knows which stream is this machine and which is the other person.
 * It does not know which of them is the tutor - that is a fact about the people,
 * not about the connection, and only they can say it.
 */
export interface RoomStreams {
  /** This browser's own stream. */
  local: MediaStream | null;
  /** The other participant's stream. */
  remote: MediaStream | null;
}

interface Props {
  applicationId: string;
  sessionId: string;
  token: string;
  cameraOn: boolean;
  tutorName: string;
  learnerName: string;
  /**
   * How the two people are shown.
   *
   * "tiles" puts them side by side, which suits a desktop rail. "stage" gives
   * the other person the whole frame and tucks you into a corner - on a phone,
   * two equal tiles make both faces too small to read.
   */
  layout?: "tiles" | "stage";
  onStatus: (status: string) => void;
  onReady: (api: RoomApi | null) => void;
  /**
   * The two audio streams, reported as they appear.
   *
   * Separating them is what makes speaker labelling exact: each stream carries
   * one person, so a turn never has to be attributed by voice. Mapping a stream
   * to tutor or learner happens above, from what the user says their role is.
   */
  onStreams: (streams: RoomStreams) => void;
}

function Tile({
  label,
  online,
  children,
}: {
  label: string;
  online: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="relative aspect-[4/3] rounded-xl overflow-hidden bg-panel-raised border border-panel-edge">
      {children}
      <span className="absolute left-2 bottom-2 flex items-center gap-1.5 rounded-full bg-black/55 backdrop-blur px-2 py-0.5 text-[10px] text-white">
        <span
          aria-hidden
          className={`h-1.5 w-1.5 rounded-full ${online ? "bg-accent" : "bg-white/40"}`}
        />
        {label}
      </span>
    </div>
  );
}

export function VideoRoom({
  applicationId,
  sessionId,
  token,
  cameraOn,
  tutorName,
  learnerName,
  layout = "tiles",
  onStatus,
  onReady,
  onStreams,
}: Props) {
  const selfRef = useRef<HTMLDivElement>(null);
  const peerRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<OTSession>(null);
  const publisherRef = useRef<OTSession>(null);
  const [peerPresent, setPeerPresent] = useState(false);
  const streamsRef = useRef<RoomStreams>({ local: null, remote: null });

  /* The SDK renders into <video> elements it owns, so their srcObject is the
     authoritative stream for each side. Polling briefly is simpler and more
     reliable than guessing when the SDK has attached them. */
  const publishStreams = useCallback(() => {
    const read = (host: HTMLDivElement | null) => {
      const video = host?.querySelector("video");
      const source = video?.srcObject;
      return source instanceof MediaStream && source.getAudioTracks().length > 0
        ? source
        : null;
    };
    const next: RoomStreams = {
      local: read(selfRef.current),
      remote: read(peerRef.current),
    };
    const previous = streamsRef.current;
    if (next.local === previous.local && next.remote === previous.remote) return;
    streamsRef.current = next;
    onStreams(next);
  }, [onStreams]);

  useEffect(() => {
    const timer = setInterval(publishStreams, 1000);
    return () => clearInterval(timer);
  }, [publishStreams]);

  useEffect(() => {
    let cancelled = false;

    async function connect() {
      const OT = await import("@vonage/client-sdk-video");
      if (cancelled) return;

      const session = OT.initSession(applicationId, sessionId);
      sessionRef.current = session;

      session.on("streamCreated", (event: { stream: OTStream }) => {
        if (!peerRef.current) return;
        session.subscribe(
          event.stream,
          peerRef.current,
          { insertMode: "replace", width: "100%", height: "100%" },
          (err: Error | undefined) => {
            if (!err) setPeerPresent(true);
          },
        );
      });

      session.on("streamDestroyed", () => {
        setPeerPresent(false);
        streamsRef.current = { ...streamsRef.current, remote: null };
        onStreams(streamsRef.current);
      });
      session.on("sessionDisconnected", () => onStatus("Left the room."));

      session.connect(token, (err: Error | undefined) => {
        if (cancelled) return;
        if (err) {
          onStatus(`Could not join the room: ${err.message}`);
          return;
        }
        onStatus("Connected to the room.");

        const publisher = OT.initPublisher(
          selfRef.current ?? undefined,
          {
            insertMode: "replace",
            width: "100%",
            height: "100%",
            publishVideo: cameraOn,
            showControls: false,
          },
          (publishErr: Error | undefined) => {
            if (publishErr) onStatus(`Camera unavailable: ${publishErr.message}`);
          },
        );
        publisherRef.current = publisher;
        session.publish(publisher);

        /* The SDK types `on` with a literal `signal:${string}`, which a name
           built at runtime cannot satisfy; this boundary is already untyped. */
        const bus: OTSession = session;

        onReady({
          signal: (type: string, data: string) => {
            try {
              session.signal({ type, data });
            } catch {
              // A closed session simply cannot carry the message.
            }
          },
          onSignal: (type: string, handler: (data: string) => void) => {
            const wrapped = (event: { data?: string; from?: { connectionId?: string } }) => {
              // Our own signals come back to us; the sender ignores them.
              if (event.from?.connectionId === session.connection?.connectionId) return;
              if (typeof event.data === "string") handler(event.data);
            };
            bus.on(`signal:${type}`, wrapped);
            return () => bus.off(`signal:${type}`, wrapped);
          },
          onPeerJoined: (handler: () => void) => {
            const wrapped = (event: { connection?: { connectionId?: string } }) => {
              if (event.connection?.connectionId === session.connection?.connectionId) return;
              handler();
            };
            bus.on("connectionCreated", wrapped);
            return () => bus.off("connectionCreated", wrapped);
          },
          /* The publisher renders into a <video> we own, so a frame can be
             copied straight off it. Nothing is uploaded: the capture stays in
             the page as a data URL, like a photo taped into a paper notebook. */
          capture: () => {
            const video = selfRef.current?.querySelector("video");
            if (!video || !video.videoWidth) return null;
            const canvas = document.createElement("canvas");
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const context = canvas.getContext("2d");
            if (!context) return null;
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            return canvas.toDataURL("image/png");
          },
        });
      });
    }

    void connect();

    return () => {
      cancelled = true;
      onReady(null);
      onStreams({ local: null, remote: null });
      try {
        publisherRef.current?.destroy();
        sessionRef.current?.disconnect();
      } catch {
        // Tearing down a half-built session is expected during fast refresh.
      }
    };
    // `cameraOn` is the initial publish state only; changes are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicationId, sessionId, token, onStatus, onReady, onStreams]);

  /* Toggling the camera stops the video track without dropping the call, so
     audio and the transcript continue while the picture is off. */
  useEffect(() => {
    try {
      publisherRef.current?.publishVideo(cameraOn);
    } catch {
      // The publisher may not exist yet; the initial state already covers it.
    }
  }, [cameraOn]);

  /* The placeholder name already says "tutor"; repeating it reads as a stutter. */
  const tutorLabel = /tutor/i.test(tutorName) ? tutorName : `${tutorName} · tutor`;
  const badge =
    "absolute left-2 bottom-2 flex items-center gap-1.5 rounded-full bg-black/55 backdrop-blur px-2 py-0.5 text-[10px] text-white";

  if (layout === "stage") {
    return (
      /* The SDK sizes its own video element; cover makes it fill the frame
         instead of leaving bars down the sides of a portrait phone. */
      <div className="relative w-full h-full rounded-2xl overflow-hidden bg-black border border-panel-edge [&_video]:h-full [&_video]:w-full [&_video]:object-cover">
        <div ref={peerRef} className="w-full h-full" />
        {!peerPresent && (
          /* Kept clear of the corner, where your own picture sits. */
          <span className="absolute inset-x-4 top-1/2 -translate-y-1/2 pr-[36%] text-[13px] text-on-desk-soft text-center">
            Waiting for {tutorName}
          </span>
        )}
        <span className={badge}>
          <span
            aria-hidden
            className={`h-1.5 w-1.5 rounded-full ${peerPresent ? "bg-accent" : "bg-white/40"}`}
          />
          {tutorLabel}
        </span>

        {/* You, tucked into the corner. */}
        <div className="absolute right-2 bottom-2 w-[32%] max-w-[130px] aspect-[3/4] rounded-xl overflow-hidden border-2 border-accent/60 bg-desk">
          <div ref={selfRef} className="w-full h-full" />
          {!cameraOn && (
            <span className="absolute inset-0 grid place-items-center text-[10px] text-on-desk-soft">
              Camera off
            </span>
          )}
          <span className={badge}>
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />
            {learnerName} · you
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <Tile label={`${tutorName} · tutor`} online={peerPresent}>
        <div ref={peerRef} className="w-full h-full" />
        {!peerPresent && (
          <span className="absolute inset-0 grid place-items-center text-[11px] text-on-desk-soft px-2 text-center">
            Waiting for {tutorName}
          </span>
        )}
      </Tile>
      <Tile label={`${learnerName} · you`} online>
        <div ref={selfRef} className="w-full h-full" />
        {!cameraOn && (
          <span className="absolute inset-0 grid place-items-center text-[11px] text-on-desk-soft pointer-events-none">
            Camera off
          </span>
        )}
      </Tile>
    </div>
  );
}
