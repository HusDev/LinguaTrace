/**
 * A lesson, frozen, for the landing page to render.
 *
 * The page shows the real `NotebookPage` rather than a screenshot of it. A
 * screenshot goes stale the moment the component changes and quietly starts
 * lying about the product; this cannot, because it is the product. It also
 * needs no image pipeline, and none of the screenshots in `docs/` are served in
 * production anyway - `docs/` is excluded from the Docker image.
 *
 * The content is the lesson from `docs/demo-script.md`, so the page, the demo
 * video and the script all show the same conversation.
 */

import { emptyNotebook, type Notebook } from "./types";

/**
 * Turns matter here for one reason that is easy to miss: `NotebookPage` decides
 * what to say beneath an uncorrected mistake by looking for a tutor in
 * `notebook.turns`. With none, the pencil note reads "no tutor in this lesson"
 * - true of solo practice, wrong for a page showing a tutored lesson.
 */
function turn(id: string, speaker: "tutor" | "learner", text: string, at: number) {
  return { id, speaker, text, at } as const;
}

function confirmed(turnIds: string[], score: number) {
  return { turnIds, score, certainty: "confirmed" as const };
}

export function demoNotebook(): Notebook {
  const notebook = emptyNotebook("demo", "Ana", "Mark");

  notebook.turns = [
    turn("t1", "tutor", "Good morning Ana. How has your week been?", 0),
    turn("t2", "learner", "Hello Mark. It was busy week, a lot of meetings.", 9_000),
    turn("t3", "tutor", "A busy week. We say 'a busy week' - with the article 'a' before it.", 18_000),
    turn("t4", "learner", "Yesterday I go to the office for a big meeting.", 27_000),
    turn("t5", "tutor", "Yesterday I went to the office. When you use 'yesterday', the verb moves into the past, so 'go' becomes 'went'.", 36_000),
    turn("t6", "learner", "I want to speak more confidently in meetings.", 45_000),
    turn("t7", "tutor", "There is a useful expression for that moment: 'to draw a blank'. It means your mind goes completely empty.", 54_000),
    turn("t8", "learner", "Last month I has three presentations and all of them was stressful.", 63_000),
  ];

  notebook.mistakes = [
    {
      id: "m1",
      said: "It was busy week, a lot of meetings.",
      corrected: "A busy week.",
      errorType: "article",
      severity: 1,
      provenance: confirmed(["t2"], 0.91),
      correctionProvenance: confirmed(["t3"], 0.94),
    },
    {
      id: "m2",
      said: "Yesterday I go to the office for a big meeting.",
      corrected: "Yesterday I went to the office.",
      errorType: "verb_tense",
      severity: 2,
      provenance: confirmed(["t4"], 0.96),
      correctionProvenance: confirmed(["t5"], 0.97),
    },
    {
      /* Left open on purpose. A mistake nobody has corrected yet is shown as a
         dotted pencil note rather than a red strikethrough, because striking a
         sentence out and offering nothing in its place tells a learner they are
         wrong and leaves them there. It is the honest state, and worth showing. */
      id: "m3",
      said: "Last month I has three presentations and all of them was stressful.",
      errorType: "agreement",
      severity: 2,
      provenance: confirmed(["t8"], 0.89),
    },
  ];

  notebook.vocabulary = [
    {
      id: "v1",
      term: "to draw a blank",
      context: "It means your mind goes completely empty.",
      translation: "quedarse en blanco",
      provenance: confirmed(["t7"], 0.93),
    },
    {
      /* Tentative on purpose. The notebook marks what it is unsure of instead of
         asserting it, and a landing page that only ever shows confident output
         is hiding the more interesting half of the design. */
      id: "v2",
      term: "a busy week",
      context: "We say 'a busy week' - with the article 'a' before it.",
      translation: "una semana ocupada",
      provenance: { turnIds: ["t3"], score: 0.58, certainty: "tentative" },
    },
  ];

  notebook.grammar = [
    {
      id: "g1",
      text: "When you use 'yesterday', the verb moves into the past, so 'go' becomes 'went'.",
      provenance: confirmed(["t5"], 0.95),
    },
  ];

  notebook.goals = [
    {
      id: "goal1",
      text: "I want to speak more confidently in meetings.",
      provenance: confirmed(["t6"], 0.88),
    },
  ];

  notebook.practiceTopics = [
    {
      id: "p1",
      text: "Keep working on past tenses before the next lesson.",
      provenance: confirmed(["t5"], 0.86),
    },
  ];

  return notebook;
}
