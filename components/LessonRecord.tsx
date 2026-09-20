"use client";

import { useState } from "react";
import { NotebookPage } from "@/components/Notebook";
import { LessonPackView } from "@/components/LessonPackView";
import type { LessonPack } from "@/lib/lessonPack";
import type { CaptureEntry, Notebook } from "@/lib/types";

/**
 * A kept lesson, in its two halves.
 *
 * The notebook is the record: what was corrected, the words, the drawings. The
 * pack is the work: the same lesson turned into flashcards and gap-fills built
 * from the learner's own corrected sentences.
 *
 * Both were always produced; only the first was reachable afterwards. The pack
 * rendered in the live lesson and nowhere else, so the one part of the app
 * designed to be revised from survived exactly as long as the browser tab that
 * built it. Nothing had to be stored to fix that - `buildLessonPack` is code
 * over the notebook, and the notebook was already kept - it simply had to be
 * asked for somewhere other than the call.
 *
 * Revise is the default tab. Reading your notes again is the thing people mean
 * to do and the thing that helps least; being asked a question you have to
 * answer is what makes a lesson stick, so it is what the page opens on.
 */
export function LessonRecordView({
  notebook,
  previous,
  captures,
  date,
  pack,
}: {
  notebook: Notebook;
  previous?: Notebook;
  captures: CaptureEntry[];
  date: string;
  pack: LessonPack;
}) {
  const [tab, setTab] = useState<"revise" | "notes">("revise");

  const hasPractice =
    pack.flashcards.length > 0 ||
    pack.exercises.length > 0 ||
    pack.correctedSentences.length > 0;

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-2">
      <div className="flex gap-1.5 shrink-0 px-1">
        {(["revise", "notes"] as const).map((which) => (
          <button
            key={which}
            type="button"
            onClick={() => setTab(which)}
            className={`rounded-lg px-3 py-1.5 text-[12px] border capitalize ${
              tab === which
                ? "border-accent/50 bg-accent-bg/50 text-accent"
                : "border-panel-edge bg-panel text-on-desk-soft"
            }`}
          >
            {which === "revise" ? "Revise" : "The notes"}
          </button>
        ))}
        {tab === "revise" && hasPractice && (
          <span className="self-center ml-1 text-[11px] text-on-desk-soft">
            Built from what you actually got wrong in this lesson.
          </span>
        )}
      </div>

      {/* Exactly one thing scrolls, and it is this. The header and the tabs
          hold still, so a long lesson does not push the way out of the page off
          the top of it - and there is no scrollbar inside a scrollbar, which is
          what the notebook keeping its own made. */}
      <div className="flex-1 min-h-0 lg:overflow-y-auto">
        {tab === "notes" ? (
          <NotebookPage
            notebook={notebook}
            previous={previous}
            captures={captures}
            date={date}
            flow
          />
        ) : hasPractice ? (
          <div className="rounded-xl bg-panel border border-panel-edge p-4">
            <LessonPackView pack={pack} />
          </div>
        ) : (
          /* A lesson can end with nothing to drill - a conversation where
             nothing was corrected and no word was taught. Saying so is better
             than an empty panel that reads as a failure to load. */
          <div className="rounded-xl border border-panel-edge bg-panel p-6">
            <p className="text-[14px] mb-1">Nothing to practise from this lesson.</p>
            <p className="text-[13px] text-on-desk-soft">
              No corrections or new words were recorded, so there is nothing to
              build exercises from. The notes are still here.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
