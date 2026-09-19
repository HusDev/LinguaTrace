/**
 * Accounts and sessions.
 *
 * Deliberately small and self-contained: passwords are hashed with scrypt from
 * Node's own crypto, and a session is a random token in the database behind an
 * httpOnly cookie. No third-party identity service, because the thing this app
 * needs from identity is narrow - who is speaking, and are they the tutor - and
 * a hosted login would be more moving parts than that question deserves.
 *
 * Roles are not a preference. Which side of a lesson someone is on decides what
 * questions their turns are asked, so it belongs to the account rather than to a
 * control anyone can flip mid-call.
 */

import { randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import {
  createAccount as insertAccount,
  findAccountByEmail,
  getAccount,
  createAuthSession,
  deleteAuthSession,
  findAccountBySession,
  type AccountRecord,
} from "./db";

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>;

const KEY_LENGTH = 64;
export const SESSION_COOKIE = "linguatrace_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type Role = "tutor" | "learner";

async function hash(password: string, salt: string): Promise<string> {
  const derived = await scryptAsync(password, salt, KEY_LENGTH);
  return `${salt}:${derived.toString("hex")}`;
}

export async function hashPassword(password: string): Promise<string> {
  return hash(password, randomBytes(16).toString("hex"));
}

/** Compare in constant time, so a wrong password cannot be found by timing it. */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [salt, expected] = stored.split(":");
  if (!salt || !expected) return false;
  const derived = await scryptAsync(password, salt, KEY_LENGTH);
  const expectedBuffer = Buffer.from(expected, "hex");
  if (expectedBuffer.length !== derived.length) return false;
  return timingSafeEqual(derived, expectedBuffer);
}

export interface SignUpInput {
  email: string;
  password: string;
  name: string;
  role: Role;
  nativeLanguage?: string;
  targetLanguage?: string;
}

export type SignUpResult =
  | { ok: true; account: AccountRecord }
  | { ok: false; error: string };

export async function signUp(input: SignUpInput): Promise<SignUpResult> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, error: "That does not look like an email address." };
  }
  if (input.password.length < 8) {
    return { ok: false, error: "Use at least 8 characters for the password." };
  }
  if (!input.name.trim()) {
    return { ok: false, error: "A name is needed - it appears in the notes." };
  }
  if (findAccountByEmail(email)) {
    return { ok: false, error: "There is already an account with that email." };
  }

  const account: AccountRecord = {
    id: `acct-${randomUUID()}`,
    email,
    name: input.name.trim(),
    role: input.role,
    nativeLanguage: input.nativeLanguage?.trim() || "Spanish",
    targetLanguage: input.targetLanguage?.trim() || "English",
  };
  insertAccount(account, await hashPassword(input.password));
  return { ok: true, account };
}

/**
 * Check an email and password.
 *
 * The same message is returned whether the email is unknown or the password is
 * wrong, so this cannot be used to find out who has an account here.
 */
export async function signIn(
  email: string,
  password: string,
): Promise<AccountRecord | null> {
  const found = findAccountByEmail(email.trim().toLowerCase());
  if (!found) return null;
  return (await verifyPassword(password, found.passwordHash)) ? found.account : null;
}

export async function startSession(accountId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  createAuthSession(token, accountId, Date.now() + SESSION_TTL_MS);

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
  return token;
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) deleteAuthSession(token);
  jar.delete(SESSION_COOKIE);
}

/** The signed-in account, or null. Reads the cookie, never a header or query. */
export async function currentAccount(): Promise<AccountRecord | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return findAccountBySession(token, Date.now());
}

export { getAccount };
export type { AccountRecord };
