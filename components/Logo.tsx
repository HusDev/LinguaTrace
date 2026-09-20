/**
 * The mark: a page, a mistake, and the correction under it.
 *
 * Not an abstract glyph. The app already has a signature object - a sheet of
 * ruled paper with punch holes and a red margin rule - and the one thing it
 * does that nothing else does is strike a sentence out and write the right one
 * beneath it. That is the logo, at the size of a favicon: the struck line in
 * red, the corrected line in green, and a third line still being written.
 *
 * Every colour is a token from `globals.css` rather than a new one, so the mark
 * cannot drift away from the product it stands for: `paper`, `paper-margin`,
 * `paper-hole`, `ink`, `ink-red`, `ink-green`.
 */
export function Logo({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      role="img"
      aria-label="LinguaTrace"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* The sheet. */}
      <rect x="4" y="2" width="24" height="28" rx="3.5" fill="#fbf7ec" />

      {/* Punch holes and the margin rule, straight off the notebook page. */}
      <circle cx="7.2" cy="10" r="1.15" fill="#241b16" fillOpacity="0.85" />
      <circle cx="7.2" cy="22" r="1.15" fill="#241b16" fillOpacity="0.85" />
      <path d="M10.6 2v28" stroke="#d98a8a" strokeWidth="0.9" />

      {/* The mistake, and the line drawn through it. */}
      <path
        d="M13.6 11h10.2"
        stroke="#2f2a25"
        strokeOpacity="0.45"
        strokeWidth="2.1"
        strokeLinecap="round"
      />
      <path
        d="M13 11h11.4"
        stroke="#c0392b"
        strokeWidth="1.3"
        strokeLinecap="round"
      />

      {/* What the learner should say instead. */}
      <path
        d="M13.6 17.6h9.2"
        stroke="#2e7d4f"
        strokeWidth="2.1"
        strokeLinecap="round"
      />

      {/* Still being written. */}
      <path
        d="M13.6 24h5.8"
        stroke="#2f2a25"
        strokeOpacity="0.22"
        strokeWidth="2.1"
        strokeLinecap="round"
      />
    </svg>
  );
}
