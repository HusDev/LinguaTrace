/**
 * Where a lesson lives once it is over.
 *
 * Revision happens between lessons, repeatedly, so a lesson has to be something
 * you can open again - a page, not a download. That means storage, and storage
 * changes what the app can honestly claim: "verb tense, four lessons running" is
 * a statement no in-memory app could make.
 *
 * SQLite, through Node's built-in driver, so the app needs no service to run.
 * Every query lives in this file and returns plain objects, so moving to
 * Postgres later means rewriting this one module and nothing above it.
 *
 * What is deliberately NOT stored: camera frames. A whiteboard snapshot is a
 * drawing, but a video still is a person's face, and keeping those indefinitely
 * is a different promise than keeping their notes. Captures live in the page for
 * the length of the lesson and are gone on refresh. The whiteboard persists as
 * its tldraw document - vector, small, and reopenable - with images derived from
 * it on demand rather than stored.
 */

import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Certainty, ErrorType, Notebook, Speaker, Turn } from "./types";

const DB_PATH = process.env.LINGUATRACE_DB ?? join(process.cwd(), "data", "linguatrace.db");

let database: DatabaseSync | null = null;

function db(): DatabaseSync {
  if (database) return database;
  mkdirSync(dirname(DB_PATH), { recursive: true });
  const handle = new DatabaseSync(DB_PATH);
  handle.exec(`
    PRAGMA journal_mode = WAL;

    -- People who can sign in. Role is set at sign-up and decides what the app
    -- shows and, during a lesson, which side of the conversation someone is on.
    CREATE TABLE IF NOT EXISTS account (
      id               TEXT PRIMARY KEY,
      email            TEXT NOT NULL UNIQUE,
      password_hash    TEXT NOT NULL,
      name             TEXT NOT NULL,
      role             TEXT NOT NULL CHECK (role IN ('tutor', 'learner')),
      native_language  TEXT NOT NULL DEFAULT 'Spanish',
      target_language  TEXT NOT NULL DEFAULT 'English',
      created_at       INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS auth_session (
      token       TEXT PRIMARY KEY,
      account_id  TEXT NOT NULL REFERENCES account(id),
      created_at  INTEGER NOT NULL,
      expires_at  INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS session_by_account ON auth_session(account_id);

    CREATE TABLE IF NOT EXISTS learner (
      id               TEXT PRIMARY KEY,
      name             TEXT NOT NULL,
      native_language  TEXT NOT NULL DEFAULT 'Spanish',
      target_language  TEXT NOT NULL DEFAULT 'English',
      created_at       INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS lesson (
      id          TEXT PRIMARY KEY,
      learner_id  TEXT NOT NULL REFERENCES learner(id),
      tutor_name  TEXT NOT NULL,
      started_at  INTEGER NOT NULL,
      ended_at    INTEGER,
      whiteboard  TEXT,
      -- The Vonage session, so a second person can join the same room rather
      -- than opening one of their own and waiting for nobody.
      video_session TEXT
    );

    -- Turn and entry ids are unique within a lesson, not across the table: the
    -- scripted lesson numbers its turns t0..t23 every time it runs, so a global
    -- primary key makes the second lesson collide with the first.
    CREATE TABLE IF NOT EXISTS turn (
      id         TEXT NOT NULL,
      lesson_id  TEXT NOT NULL REFERENCES lesson(id),
      speaker    TEXT NOT NULL,
      text       TEXT NOT NULL,
      at         INTEGER NOT NULL,
      seq        INTEGER NOT NULL,
      PRIMARY KEY (lesson_id, id)
    );

    CREATE TABLE IF NOT EXISTS entry (
      id           TEXT NOT NULL,
      lesson_id    TEXT NOT NULL REFERENCES lesson(id),
      kind         TEXT NOT NULL,
      said         TEXT,
      corrected    TEXT,
      term         TEXT,
      gloss        TEXT,
      translation  TEXT,
      text         TEXT,
      error_type   TEXT,
      severity     REAL,
      score        REAL NOT NULL,
      certainty    TEXT NOT NULL,
      seq          INTEGER NOT NULL,
      PRIMARY KEY (lesson_id, id)
    );

    CREATE INDEX IF NOT EXISTS turn_by_lesson  ON turn(lesson_id, seq);
    CREATE INDEX IF NOT EXISTS entry_by_lesson ON entry(lesson_id, seq);
    CREATE INDEX IF NOT EXISTS lesson_by_learner ON lesson(learner_id, started_at);
  `);
  /* Existing databases predate some columns. Adding them is cheap and failing
     is expected when they are already there. */
  for (const column of ["video_session TEXT", "tutor_id TEXT"]) {
    try {
      handle.exec(`ALTER TABLE lesson ADD COLUMN ${column}`);
    } catch {
      // Already present.
    }
  }

  database = handle;
  return handle;
}

/* ------------------------------------------------------------------ *
 * Accounts and sessions
 * ------------------------------------------------------------------ */

export interface AccountRecord {
  id: string;
  email: string;
  name: string;
  role: "tutor" | "learner";
  nativeLanguage: string;
  targetLanguage: string;
}

function toAccount(row: Record<string, string>): AccountRecord {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role as "tutor" | "learner",
    nativeLanguage: row.native_language,
    targetLanguage: row.target_language,
  };
}

export function createAccount(account: AccountRecord, passwordHash: string): void {
  db()
    .prepare(
      `INSERT INTO account
         (id, email, password_hash, name, role, native_language, target_language, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      account.id,
      account.email,
      passwordHash,
      account.name,
      account.role,
      account.nativeLanguage,
      account.targetLanguage,
      Date.now(),
    );
}

export function findAccountByEmail(
  email: string,
): { account: AccountRecord; passwordHash: string } | null {
  const row = db()
    .prepare(`SELECT * FROM account WHERE email = ?`)
    .get(email) as Record<string, string> | undefined;
  if (!row) return null;
  return { account: toAccount(row), passwordHash: row.password_hash };
}

export function getAccount(id: string): AccountRecord | null {
  const row = db()
    .prepare(`SELECT * FROM account WHERE id = ?`)
    .get(id) as Record<string, string> | undefined;
  return row ? toAccount(row) : null;
}

export function createAuthSession(
  token: string,
  accountId: string,
  expiresAt: number,
): void {
  db()
    .prepare(
      `INSERT INTO auth_session (token, account_id, created_at, expires_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run(token, accountId, Date.now(), expiresAt);
}

export function deleteAuthSession(token: string): void {
  db().prepare(`DELETE FROM auth_session WHERE token = ?`).run(token);
}

/** The account behind a session token, if the session has not expired. */
export function findAccountBySession(token: string, now: number): AccountRecord | null {
  const row = db()
    .prepare(
      `SELECT a.* FROM auth_session s
       JOIN account a ON a.id = s.account_id
       WHERE s.token = ? AND s.expires_at > ?`,
    )
    .get(token, now) as Record<string, string> | undefined;
  return row ? toAccount(row) : null;
}

/* ------------------------------------------------------------------ *
 * Learners
 * ------------------------------------------------------------------ */

export interface LearnerRecord {
  id: string;
  name: string;
  nativeLanguage: string;
  targetLanguage: string;
}

export function upsertLearner(learner: LearnerRecord): void {
  db()
    .prepare(
      `INSERT INTO learner (id, name, native_language, target_language, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         native_language = excluded.native_language,
         target_language = excluded.target_language`,
    )
    .run(
      learner.id,
      learner.name,
      learner.nativeLanguage,
      learner.targetLanguage,
      Date.now(),
    );
}

export function getLearner(id: string): LearnerRecord | null {
  const row = db()
    .prepare(`SELECT * FROM learner WHERE id = ?`)
    .get(id) as Record<string, string> | undefined;
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    nativeLanguage: row.native_language,
    targetLanguage: row.target_language,
  };
}

export function listLearners(): LearnerRecord[] {
  const rows = db()
    .prepare(`SELECT * FROM learner ORDER BY created_at DESC`)
    .all() as Array<Record<string, string>>;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    nativeLanguage: r.native_language,
    targetLanguage: r.target_language,
  }));
}

/* ------------------------------------------------------------------ *
 * Lessons
 * ------------------------------------------------------------------ */

export function createLessonRow(
  lessonId: string,
  learnerId: string,
  tutorName: string,
  tutorId?: string,
): void {
  db()
    .prepare(
      `INSERT OR IGNORE INTO lesson (id, learner_id, tutor_name, started_at, tutor_id)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(lessonId, learnerId, tutorName, Date.now(), tutorId ?? null);
}

/**
 * Attach a learner to a lesson the tutor opened.
 *
 * A tutor can start a lesson before anyone joins, so the learner is only known
 * once they follow the invite.
 */
export function setLessonLearner(lessonId: string, learnerId: string): void {
  db().prepare(`UPDATE lesson SET learner_id = ? WHERE id = ?`).run(learnerId, lessonId);
}

export function getLessonParticipants(
  lessonId: string,
): { learnerId: string; tutorId: string | null } | null {
  const row = db()
    .prepare(`SELECT learner_id, tutor_id FROM lesson WHERE id = ?`)
    .get(lessonId) as { learner_id?: string; tutor_id?: string } | undefined;
  if (!row?.learner_id) return null;
  return { learnerId: row.learner_id, tutorId: row.tutor_id ?? null };
}

/** Lessons a tutor has taught, newest first. */
export function listLessonsForTutor(tutorId: string): LessonSummary[] {
  const ids = db()
    .prepare(`SELECT DISTINCT learner_id FROM lesson WHERE tutor_id = ?`)
    .all(tutorId) as Array<{ learner_id: string }>;
  return ids
    .flatMap((r) => listLessons(r.learner_id))
    .sort((a, b) => b.startedAt - a.startedAt);
}

export function endLesson(lessonId: string): void {
  db()
    .prepare(`UPDATE lesson SET ended_at = ? WHERE id = ? AND ended_at IS NULL`)
    .run(Date.now(), lessonId);
}

/** Remember which video room a lesson is happening in, so others can join it. */
export function saveVideoSession(lessonId: string, sessionId: string): void {
  db()
    .prepare(`UPDATE lesson SET video_session = ? WHERE id = ?`)
    .run(sessionId, lessonId);
}

export function getVideoSession(lessonId: string): string | null {
  const row = db()
    .prepare(`SELECT video_session FROM lesson WHERE id = ?`)
    .get(lessonId) as { video_session?: string } | undefined;
  return row?.video_session ?? null;
}

export function saveWhiteboard(lessonId: string, document: string): void {
  db().prepare(`UPDATE lesson SET whiteboard = ? WHERE id = ?`).run(document, lessonId);
}

export function getWhiteboard(lessonId: string): string | null {
  const row = db()
    .prepare(`SELECT whiteboard FROM lesson WHERE id = ?`)
    .get(lessonId) as { whiteboard?: string } | undefined;
  return row?.whiteboard ?? null;
}

/**
 * Write the lesson's current state.
 *
 * Replaces rather than diffs: a lesson is small, and a full rewrite means a
 * dropped request can never leave half a notebook on disk. Called after each
 * turn, so a refresh mid-lesson resumes instead of starting over.
 */
export function saveNotebook(notebook: Notebook, learnerId: string): void {
  const handle = db();
  createLessonRow(notebook.lessonId, learnerId, notebook.tutorName);

  handle.exec("BEGIN");
  try {
    handle.prepare(`DELETE FROM turn WHERE lesson_id = ?`).run(notebook.lessonId);
    handle.prepare(`DELETE FROM entry WHERE lesson_id = ?`).run(notebook.lessonId);

    const turnStmt = handle.prepare(
      `INSERT INTO turn (id, lesson_id, speaker, text, at, seq) VALUES (?, ?, ?, ?, ?, ?)`,
    );
    notebook.turns.forEach((turn, i) => {
      turnStmt.run(turn.id, notebook.lessonId, turn.speaker, turn.text, turn.at, i);
    });

    const entryStmt = handle.prepare(
      `INSERT INTO entry
        (id, lesson_id, kind, said, corrected, term, gloss, translation, text,
         error_type, severity, score, certainty, seq)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    let seq = 0;
    for (const m of notebook.mistakes) {
      entryStmt.run(
        m.id, notebook.lessonId, "mistake", m.said, m.corrected ?? null,
        null, null, null, null, m.errorType, m.severity,
        m.provenance.score, m.provenance.certainty, seq++,
      );
    }
    for (const v of notebook.vocabulary) {
      entryStmt.run(
        v.id, notebook.lessonId, "vocabulary", null, null, v.term, v.context,
        v.translation ?? null, null, null, null,
        v.provenance.score, v.provenance.certainty, seq++,
      );
    }
    for (const [kind, items] of [
      ["grammar", notebook.grammar],
      ["goal", notebook.goals],
      ["practice", notebook.practiceTopics],
    ] as const) {
      for (const item of items) {
        entryStmt.run(
          item.id, notebook.lessonId, kind, null, null, null, null, null,
          item.text, null, null, item.provenance.score, item.provenance.certainty, seq++,
        );
      }
    }
    handle.exec("COMMIT");
  } catch (error) {
    handle.exec("ROLLBACK");
    throw error;
  }
}

interface EntryRow {
  id: string;
  kind: string;
  said: string | null;
  corrected: string | null;
  term: string | null;
  gloss: string | null;
  translation: string | null;
  text: string | null;
  error_type: string | null;
  severity: number | null;
  score: number;
  certainty: string;
}

/** Rebuild a stored lesson into the same shape the live app uses. */
export function loadNotebook(lessonId: string): Notebook | null {
  const handle = db();
  const lesson = handle
    .prepare(
      `SELECT l.*, le.name AS learner_name FROM lesson l
       JOIN learner le ON le.id = l.learner_id WHERE l.id = ?`,
    )
    .get(lessonId) as Record<string, string> | undefined;
  if (!lesson) return null;

  const turns = (
    handle
      .prepare(`SELECT * FROM turn WHERE lesson_id = ? ORDER BY seq`)
      .all(lessonId) as Array<Record<string, string | number>>
  ).map<Turn>((r) => ({
    id: String(r.id),
    speaker: String(r.speaker) as Speaker,
    text: String(r.text),
    at: Number(r.at),
  }));

  const rows = handle
    .prepare(`SELECT * FROM entry WHERE lesson_id = ? ORDER BY seq`)
    .all(lessonId) as unknown as EntryRow[];

  const notebook: Notebook = {
    lessonId,
    learnerName: String(lesson.learner_name),
    tutorName: String(lesson.tutor_name),
    turns,
    mistakes: [],
    vocabulary: [],
    grammar: [],
    goals: [],
    practiceTopics: [],
    processedTurnIds: turns.map((t) => t.id),
  };

  for (const row of rows) {
    const provenance = {
      turnIds: [],
      score: row.score,
      certainty: row.certainty as Certainty,
    };
    if (row.kind === "mistake") {
      notebook.mistakes.push({
        id: row.id,
        said: row.said ?? "",
        corrected: row.corrected ?? undefined,
        errorType: (row.error_type ?? "other") as ErrorType,
        severity: row.severity ?? 1,
        provenance,
      });
    } else if (row.kind === "vocabulary") {
      notebook.vocabulary.push({
        id: row.id,
        term: row.term ?? "",
        context: row.gloss ?? "",
        translation: row.translation ?? undefined,
        provenance,
      });
    } else {
      const item = { id: row.id, text: row.text ?? "", provenance };
      if (row.kind === "grammar") notebook.grammar.push(item);
      if (row.kind === "goal") notebook.goals.push(item);
      if (row.kind === "practice") notebook.practiceTopics.push(item);
    }
  }

  return notebook;
}

/* ------------------------------------------------------------------ *
 * History - what the learner's home page is made of
 * ------------------------------------------------------------------ */

export interface LessonSummary {
  id: string;
  tutorName: string;
  startedAt: number;
  endedAt: number | null;
  turns: number;
  mistakes: number;
  corrected: number;
  vocabulary: number;
}

export function listLessons(learnerId: string): LessonSummary[] {
  const rows = db()
    .prepare(
      `SELECT l.id, l.tutor_name, l.started_at, l.ended_at,
              (SELECT COUNT(*) FROM turn  t WHERE t.lesson_id = l.id) AS turns,
              (SELECT COUNT(*) FROM entry e WHERE e.lesson_id = l.id AND e.kind = 'mistake') AS mistakes,
              (SELECT COUNT(*) FROM entry e WHERE e.lesson_id = l.id AND e.kind = 'mistake' AND e.corrected IS NOT NULL) AS corrected,
              (SELECT COUNT(*) FROM entry e WHERE e.lesson_id = l.id AND e.kind = 'vocabulary') AS vocabulary
       FROM lesson l
       WHERE l.learner_id = ?
       ORDER BY l.started_at DESC`,
    )
    .all(learnerId) as Array<Record<string, number | string | null>>;

  return rows.map((r) => ({
    id: String(r.id),
    tutorName: String(r.tutor_name),
    startedAt: Number(r.started_at),
    endedAt: r.ended_at === null ? null : Number(r.ended_at),
    turns: Number(r.turns),
    mistakes: Number(r.mistakes),
    corrected: Number(r.corrected),
    vocabulary: Number(r.vocabulary),
  }));
}

export interface WeaknessRow {
  errorType: ErrorType;
  total: number;
  lessons: number;
  /** Lessons since it last appeared; 0 means it came up in the newest lesson. */
  lessonsSinceSeen: number;
}

/**
 * The weakness profile across a learner's history.
 *
 * This is the claim the app could not make before it stored anything: not
 * "two fewer than last time" but "verb tense, four lessons running".
 */
export function weaknessProfile(learnerId: string): WeaknessRow[] {
  const order = listLessons(learnerId).map((l) => l.id);
  if (order.length === 0) return [];

  const rows = db()
    .prepare(
      `SELECT e.error_type AS error_type, e.lesson_id AS lesson_id, COUNT(*) AS n
       FROM entry e JOIN lesson l ON l.id = e.lesson_id
       WHERE l.learner_id = ? AND e.kind = 'mistake' AND e.error_type IS NOT NULL
       GROUP BY e.error_type, e.lesson_id`,
    )
    .all(learnerId) as Array<Record<string, string | number>>;

  const byType = new Map<string, { total: number; lessons: Set<string> }>();
  for (const row of rows) {
    const key = String(row.error_type);
    const bucket = byType.get(key) ?? { total: 0, lessons: new Set<string>() };
    bucket.total += Number(row.n);
    bucket.lessons.add(String(row.lesson_id));
    byType.set(key, bucket);
  }

  return [...byType.entries()]
    .map(([errorType, bucket]) => ({
      errorType: errorType as ErrorType,
      total: bucket.total,
      lessons: bucket.lessons.size,
      lessonsSinceSeen: order.findIndex((id) => bucket.lessons.has(id)),
    }))
    .sort((a, b) => b.lessons - a.lessons || b.total - a.total);
}
