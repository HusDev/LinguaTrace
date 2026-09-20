"use client";

import { useState } from "react";

/**
 * The demo, as an object on the desk rather than a pasted-in player.
 *
 * A bare YouTube iframe is the loudest thing on the page before anyone presses
 * anything: it fills its own panel with saturated ambient bars, a red play
 * button, a channel avatar and a title clipped mid-word, none of which belong
 * to this palette. On a page whose whole argument is two carefully chosen
 * surfaces, the focal object of the first screen cannot be a third-party
 * widget.
 *
 * So the poster frame stands in until someone asks for the video, drawn with
 * the page's own play mark. The player is only fetched on the click that wants
 * it, which also keeps roughly half a megabyte of third-party script off the
 * first screen.
 */
export function VideoFacade({
  id,
  title,
  poster,
}: {
  id: string;
  title: string;
  poster: string;
}) {
  const [playing, setPlaying] = useState(false);

  if (playing) {
    return (
      <iframe
        className="absolute inset-0 h-full w-full"
        src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1`}
        title={title}
        referrerPolicy="strict-origin-when-cross-origin"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
        allowFullScreen
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      className="group absolute inset-0 h-full w-full cursor-pointer"
      aria-label={`Play the demo: ${title}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={poster}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        loading="lazy"
        decoding="async"
      />
      <span
        aria-hidden
        className="absolute inset-0 bg-[#150f0c]/25 transition-colors group-hover:bg-[#150f0c]/10"
      />
      {/* Drawn in the page's own materials: a paper disc with an ink mark, so
          the accent stays reserved for the one lit action on the page. */}
      {/* Off centre on purpose: dead centre covered the struck line and its
          correction, which is the one thing the poster is there to show. */}
      <span
        aria-hidden
        className="absolute bottom-5 right-5 grid h-[68px] w-[68px] place-items-center rounded-full bg-paper shadow-[0_8px_26px_-6px_rgba(0,0,0,0.6)] transition-transform group-hover:scale-[1.06]"
      >
        <svg viewBox="0 0 24 24" className="h-7 w-7 translate-x-[2px] fill-ink">
          <path d="M6 3.8 20 12 6 20.2Z" />
        </svg>
      </span>
    </button>
  );
}
