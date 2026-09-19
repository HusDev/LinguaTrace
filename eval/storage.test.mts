/**
 * Storage checks that need a database but not a server.
 *
 * These exist because of a bug that was invisible in every other test: a lesson
 * belonging to a real account could not be found after a restart, so it was
 * never taken back into the working set and every turn after that point was
 * judged and thrown away. Nothing errored; the notebook just stopped filling.
 *
 * An .mts file because the database path has to be set before `lib/db` is
 * imported, which means a dynamic import and therefore top-level await.
 *
 * Run with:  npx tsx eval/storage.test.mts
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "linguatrace-test-"));
process.env.LINGUATRACE_DB = join(dir, "test.db");

const {
  createAccount,
  createLessonRow,
  getLessonParticipants,
  listLessons,
  loadNotebook,
  saveNotebook,
  setLessonLearner,
  upsertLearner,
} = await import("../lib/db");
const { emptyNotebook } = await import("../lib/types");

let failed = 0;
function check(name: string, condition: boolean, detail?: string) {
  if (condition) console.log(`  ok   ${name}`);
  else {
    failed += 1;
    console.log(`  FAIL ${name}${detail ? ` - ${detail}` : ""}`);
  }
}

console.log("\nfinding a lesson's owner");

const tutorId = "acct-tutor-1";
const learnerId = "acct-learner-1";
for (const [id, name, role] of [
  [tutorId, "Mark", "tutor"],
  [learnerId, "Hussein", "learner"],
] as const) {
  createAccount(
    {
      id,
      email: `${id}@example.com`,
      name,
      role,
      nativeLanguage: "Arabic",
      targetLanguage: "English",
    },
    "salt:hash",
  );
  upsertLearner({ id, name, nativeLanguage: "Arabic", targetLanguage: "English" });
}

/* A tutor opens the room, so the lesson starts with the tutor as a placeholder
   learner - exactly the shape that used to be unfindable. */
createLessonRow("lesson-x", tutorId, "Mark", tutorId);

check(
  "a lesson is found by whoever actually owns it",
  getLessonParticipants("lesson-x")?.learnerId === tutorId,
  JSON.stringify(getLessonParticipants("lesson-x")),
);
check(
  "the tutor is recorded too",
  getLessonParticipants("lesson-x")?.tutorId === tutorId,
);

setLessonLearner("lesson-x", learnerId);
check(
  "a joining learner takes the lesson over",
  getLessonParticipants("lesson-x")?.learnerId === learnerId,
);
check(
  "and it moves into their history",
  listLessons(learnerId).some((l) => l.id === "lesson-x"),
);
check(
  "leaving the tutor's own history alone",
  !listLessons(tutorId).some((l) => l.id === "lesson-x"),
);
check("an unknown lesson has no owner", getLessonParticipants("nope") === null);

console.log("\nkeeping captures");
/* A drawing belongs to the lesson and is kept; a still of someone's face is a
   different promise, so the column has nowhere to put one. The rule is enforced
   at the point of writing rather than trusted to every caller. */
const captured = {
  ...emptyNotebook("lesson-cap", "Ana", "Mark"),
  captures: [
    { id: "board-1", dataUrl: "data:image/jpeg;base64,AAAA", kind: "whiteboard" as const },
    { id: "face-1", dataUrl: "data:image/jpeg;base64,BBBB", kind: "camera" as const },
  ],
};
saveNotebook(captured, learnerId);
const reopened = loadNotebook("lesson-cap");
check(
  "a whiteboard snapshot is still there when the lesson is reopened",
  reopened?.captures.length === 1 && reopened.captures[0].id === "board-1",
  JSON.stringify(reopened?.captures),
);
check(
  "a camera still was never written down",
  !reopened?.captures.some((c) => c.id === "face-1"),
);

/* Saving twice must not double them: the write replaces rather than appends. */
saveNotebook(captured, learnerId);
check(
  "saving again does not tape the same drawing in twice",
  loadNotebook("lesson-cap")?.captures.length === 1,
);

rmSync(dir, { recursive: true, force: true });
console.log(`\n${failed === 0 ? "all storage checks passed" : `${failed} failed`}\n`);
process.exit(failed === 0 ? 0 : 1);
