import Link from "next/link";
import { Logo } from "@/components/Logo";
import { VideoFacade } from "@/components/VideoFacade";
import { NotebookPage } from "@/components/Notebook";
import { demoNotebook } from "@/lib/demoNotebook";

/**
 * The desk the lesson happens on.
 *
 * Not a description of the product laid out in cards - the surface it runs on,
 * seen from above and lit from one side, with the demo lying on it and the
 * learner's page beside it. The app's whole argument is that two unalike
 * surfaces meet here: a dark desk holding a call that is disposable, and a
 * sheet of cream paper holding the thing the learner keeps. A landing page that
 * explained that in a three-column feature grid would be arguing against
 * itself, so this one is built out of the materials instead.
 *
 * The mechanism section is the one place worth reading twice: rather than
 * asserting that the notebook cannot invent a sentence, the page performs its
 * own correction on three things a visitor is likely to assume - struck through
 * in red, rewritten in green, exactly as a lesson note.
 */

/**
 * The two marks a tutor makes, drawn rather than typed.
 *
 * A glyph from the body face is whatever that font decided a cross should be;
 * at display size it reads as a character instead of a mark made by a hand.
 * These share one stroke weight and one cap, so the pair looks like one pen.
 */
function PenMark({ kind }: { kind: "wrong" | "right" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="inline-block h-[0.62em] w-[0.62em] mr-2.5 shrink-0 align-baseline"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
    >
      {kind === "wrong" ? (
        <>
          <path d="M5.5 5 19 19" />
          <path d="M19 5 5.5 19" />
        </>
      ) : (
        <path d="M4 13.2 9.6 19 20 5.5" />
      )}
    </svg>
  );
}

const VIDEO_ID = "wdozDzfWJfc";
const REPO = "https://github.com/HusDev/LinguaTrace";

/** What a visitor assumes, and what is actually true. The page corrects itself. */
const CORRECTIONS: Array<{ assumed: string; actual: string; note: string }> = [
  {
    assumed: "The AI writes up your lesson.",
    actual: "Every line is quoted from what was said.",
    note: "Code finds the candidate phrases in the real transcript. The model only picks one, so it cannot write a sentence nobody spoke.",
  },
  {
    assumed: "It sounds equally sure of everything.",
    actual: "It marks what it is not sure of.",
    note: "Judgments come back as calibrated probabilities. Above 0.75 a note is written plainly, 0.45 to 0.75 it is written and flagged unsure, below that it is dropped.",
  },
  {
    assumed: "It works out who was speaking.",
    actual: "Each device transcribes its own microphone.",
    note: "So a turn is never attributed by guessing at a voice. Keeping the audio separate beats any diarisation model.",
  },
];

/** Measured, with the sample size beside it, because the figure alone is a claim. */
const RESULTS: Array<[string, string]> = [
  ["Recall and precision, 8 signals", "100% · 45 labelled cases"],
  ["Judgment latency, per turn (scripted lesson)", "310ms median · 850ms p95"],
  ["Notes invented across the set", "0"],
];

export function Landing() {
  return (
    <main className="flex-1 relative overflow-x-clip">
      {/* The desk is lit from the upper left, so the work sits in the light and
          the edges fall away. A flat ground would read as a background rather
          than a surface. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(85%_65%_at_22%_2%,#4a3a2c_0%,#33271f_30%,#241b16_58%,#150f0c_100%)]"
      />

      <div className="relative w-full max-w-[1180px] mx-auto px-5 sm:px-8">
        <header className="flex items-center gap-3 pt-6 pb-16 sm:pb-24">
          <Logo className="h-8 w-8 shrink-0 drop-shadow-[0_3px_10px_rgba(0,0,0,0.5)]" />
          <p className="text-[14px] font-semibold tracking-[-0.01em] mr-auto">
            LinguaTrace
          </p>
          <a
            href={REPO}
            target="_blank"
            rel="noreferrer"
            className="text-[13px] text-on-desk-soft hover:text-on-desk transition-colors"
          >
            GitHub
          </a>
          <Link
            href="/login"
            className="text-[13px] text-on-desk-soft hover:text-on-desk transition-colors"
          >
            Sign in
          </Link>
        </header>

        <section className="relative grid lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.18fr)] gap-10 lg:gap-14 items-start lg:min-h-[calc(100svh-150px)] pb-24 sm:pb-32">
          <div className="min-w-0 lg:pt-6">
            <h1 className="font-hand text-[clamp(2.6rem,7vw,5rem)] leading-[0.94] text-on-desk text-balance">
              Nobody writes anything down.
            </h1>
            <p className="mt-7 text-[16px] sm:text-[17px] leading-[1.65] text-on-desk-soft max-w-[46ch]">
              LinguaTrace listens to a one-to-one language lesson and writes the
              notebook — corrections struck through and rewritten, vocabulary
              glossed into the learner&apos;s own language. Afterwards it becomes
              practice built from the sentences they personally got wrong.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <Link
                href="/login"
                className="rounded-xl bg-accent-bg text-accent border border-accent/40 px-6 py-3 text-[15px] font-medium shadow-[0_10px_30px_-10px_rgba(143,217,172,0.45)] hover:border-accent/70 transition-colors"
              >
                Start a lesson
              </Link>
              <a
                href="#keeps"
                className="text-[13px] text-on-desk-soft hover:text-on-desk transition-colors"
              >
                See what it writes
              </a>
            </div>
          </div>

          {/* The demo, lying on the desk as an object rather than sitting in a
              card. Offset shadow with a real blur, and a degree of rotation, so
              it reads as something placed there. */}
          <div className="relative min-w-0 rotate-[0.6deg] lg:mt-16">
            <div className="relative w-full aspect-video overflow-hidden rounded-xl border border-panel-edge bg-[#120d0a] shadow-[0_40px_80px_-18px_rgba(0,0,0,0.8)]">
              <VideoFacade
                id={VIDEO_ID}
                title="LinguaTrace: the lesson notebook that writes itself"
                poster="/og.jpg"
              />
            </div>
          </div>

          {/* The page below, showing through the fold. Real ruled paper with a
              real line off the lesson, cut by the bottom of the first screen so
              the sheet is a promise rather than a picture of one. */}
          <div
            aria-hidden
            className="hidden lg:block absolute left-0 right-[42%] bottom-0 translate-y-[38%] -rotate-[1.1deg] pointer-events-none"
          >
            <div className="paper rounded-t-xl h-[210px] shadow-[0_-10px_50px_-12px_rgba(0,0,0,0.75)] relative overflow-hidden">
              {/* Taped to the desk, and punched like every other sheet in the
                  app - one hole reads as a stray dot. */}
              <span
                className="absolute -top-2.5 left-[24%] h-[26px] w-[104px] -rotate-[3deg] bg-tape/75 shadow-[0_2px_7px_rgba(0,0,0,0.16)]"
                style={{
                  clipPath:
                    "polygon(3% 0%, 97% 4%, 100% 96%, 96% 100%, 5% 97%, 0% 6%)",
                }}
              />
              <span className="absolute left-7 top-[58px] h-3.5 w-3.5 rounded-full bg-paper-hole/85" />
              <span className="absolute left-7 top-[132px] h-3.5 w-3.5 rounded-full bg-paper-hole/85" />
              <span className="absolute left-[74px] top-0 bottom-0 w-px bg-paper-margin" />
              <div className="pl-[98px] pr-10 pt-7 text-ink font-hand">
                <p className="text-[1.5rem] leading-[2.1rem]">
                  <span className="text-ink-red">Focus:</span> Verb tense
                </p>
                <p className="mt-3 text-[1.25rem] leading-8 text-ink-red">
                  <span className="line-through decoration-ink-red/70">
                    Yesterday I go to the office.
                  </span>
                </p>
                <p className="text-[1.25rem] leading-8 text-ink-green">
                  Yesterday I went to the office.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* The page correcting itself. This is the product's own gesture, used
            on the visitor's likely assumptions. */}
        <section className="pt-10 lg:pt-32 pb-24 sm:pb-32">
          <h2 className="font-hand text-[clamp(2rem,3.6vw,2.9rem)] leading-tight mb-12 max-w-[20ch]">
            Three things people assume, corrected.
          </h2>
          <div className="flex flex-col gap-11">
            {CORRECTIONS.map(({ assumed, actual, note }) => (
              <div
                key={assumed}
                className="grid md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-x-10 gap-y-3 items-baseline border-t border-panel-edge/70 pt-7 min-w-0"
              >
                <div className="font-hand text-[1.6rem] sm:text-[1.9rem] leading-[1.35]">
                  <p className="text-desk-red">
                    <PenMark kind="wrong" />
                    <span className="strike">{assumed}</span>
                  </p>
                  <p className="text-desk-green mt-1">
                    <PenMark kind="right" />
                    {actual}
                  </p>
                </div>
                <p className="text-[14px] leading-[1.7] text-on-desk-soft max-w-[52ch]">
                  {note}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* The sheet itself, brought onto the desk full width. The paper is the
          one bright object on the page and it earns the room. */}
      <section id="keeps" className="relative w-full max-w-[1180px] mx-auto px-5 sm:px-8 pb-24 sm:pb-32 scroll-mt-6">
        <h2 className="font-hand text-[clamp(2rem,3.6vw,2.9rem)] leading-tight mb-3">
          This is what the learner keeps.
        </h2>
        <p className="text-[15px] text-on-desk-soft mb-10 max-w-[62ch] leading-[1.7]">
          Not a screenshot — the notebook component itself, rendered from the
          scripted lesson in the demo. The struck line, the correction beneath
          it, the gloss in the learner&apos;s own language, and a mistake still
          waiting for the tutor to deal with it.
        </p>
        <div className="overflow-hidden rounded-xl shadow-[0_40px_90px_-30px_rgba(0,0,0,0.8)]">
          <NotebookPage
            notebook={demoNotebook()}
            captures={[]}
            date="12 Sept"
            flow
          />
        </div>
      </section>

      <div className="relative w-full max-w-[1180px] mx-auto px-5 sm:px-8">
        <section className="pb-24 sm:pb-32">
          <h2 className="font-hand text-[clamp(2rem,3.6vw,2.9rem)] leading-tight mb-3">
            Measured, not asserted.
          </h2>
          <p className="text-[15px] text-on-desk-soft mb-9 max-w-[62ch] leading-[1.7]">
            The question set is scored against a labelled dataset at the thresholds
            the app actually ships, counting missed notes and invented ones
            separately — because those two failures are not equal. Latency is
            measured separately, over the scripted lesson.
          </p>
          <dl className="border-t border-panel-edge/70">
            {RESULTS.map(([label, value]) => (
              <div
                key={label}
                className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-1 border-b border-panel-edge/70 py-4"
              >
                <dt className="text-[14px] text-on-desk-soft">{label}</dt>
                <dd className="text-[15px] tabular-nums tracking-[-0.01em]">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-5 text-[13px] text-on-desk-soft max-w-[62ch] leading-[1.7]">
            Forty-five cases is a small set, written by the author. It is stated
            here because a figure without its sample size is a claim rather than
            a measurement.
          </p>
        </section>

        <footer className="border-t border-panel-edge/70 pt-12 pb-16">
          <h2 className="font-hand text-[clamp(2.2rem,4vw,3.2rem)] leading-tight mb-8 max-w-[16ch]">
            Run your next lesson on it.
          </h2>
          <div className="flex flex-wrap items-center gap-4 mb-12">
            <Link
              href="/login"
              className="rounded-xl bg-accent-bg text-accent border border-accent/40 px-6 py-3 text-[15px] font-medium shadow-[0_10px_30px_-10px_rgba(143,217,172,0.45)] hover:border-accent/70 transition-colors"
            >
              Start a lesson
            </Link>
            <a
              href={REPO}
              target="_blank"
              rel="noreferrer"
              className="text-[14px] text-on-desk-soft hover:text-on-desk transition-colors"
            >
              Read the code
            </a>
          </div>
          <div className="flex items-center gap-3">
            <Logo className="h-7 w-7 shrink-0 opacity-80" />
            <p className="text-[12px] text-on-desk-soft/80 leading-[1.7] max-w-[64ch]">
              Next.js, TypeSafe for the judgments, Gemini Live for
              transcription, Vonage Video for the call, tldraw for the shared
              whiteboard.
            </p>
          </div>
        </footer>
      </div>
    </main>
  );
}
