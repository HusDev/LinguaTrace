/**
 * The Vonage Video room.
 *
 * Authentication is a JWT signed with the application's private key. There are
 * two kinds: a short-lived API token for server calls such as creating a
 * session, and a longer-lived client token scoped to one session that the
 * browser uses to connect. The claim shapes come from the Video API's own
 * contract, so they are spelled out here rather than pulled in through an SDK -
 * this is the whole of it, and it keeps the private key on one code path.
 */

import { createSign, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";

const SESSION_CREATE_URL = "https://video.api.vonage.com/session/create";

/** How long a browser may hold a connection token. One lesson, not one day. */
const CLIENT_TOKEN_TTL_SECONDS = 2 * 60 * 60;
/** Server tokens are used immediately and never stored. */
const API_TOKEN_TTL_SECONDS = 300;

export interface LessonSession {
  sessionId: string;
  token: string;
  applicationId: string;
  /** False when credentials are absent and the scripted lesson stands in. */
  live: boolean;
}

export type VideoRole = "publisher" | "subscriber" | "moderator";

function applicationId(): string | undefined {
  return process.env.VONAGE_APPLICATION_ID;
}

/**
 * The private key, from an inline PEM or a file path.
 *
 * A path is the safer habit - the key never passes through shell history or a
 * process listing - so both are supported and the path wins when both are set.
 */
function privateKey(): string | undefined {
  const path = process.env.VONAGE_PRIVATE_KEY_PATH;
  if (path) {
    const resolved = isAbsolute(path) ? path : join(process.cwd(), path);
    return readFileSync(resolved, "utf8");
  }
  // Inline keys arrive from env files with their newlines escaped.
  return process.env.VONAGE_PRIVATE_KEY?.replace(/\\n/g, "\n");
}

export function vonageConfigured(): boolean {
  try {
    return Boolean(applicationId() && privateKey());
  } catch {
    // A configured but unreadable key file is a misconfiguration, not a room.
    return false;
  }
}

const base64url = (value: object) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");

/** Sign a JWT (RS256) with the application's private key. */
function signJwt(claims: Record<string, unknown>): string {
  const appId = applicationId();
  const key = privateKey();
  if (!appId || !key) {
    throw new Error("Vonage is not configured: set VONAGE_APPLICATION_ID and a private key.");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64url({ alg: "RS256", typ: "JWT" });
  const payload = base64url({
    iss: appId,
    application_id: appId,
    iat: now,
    jti: randomUUID(),
    ...claims,
  });

  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  return `${header}.${payload}.${signer.sign(key, "base64url")}`;
}

/**
 * A client token scoped to one session.
 *
 * `acl` and `sub` are required by the Video API; without them the browser is
 * rejected at connect time with an unhelpful error.
 */
export function generateClientToken(
  sessionId: string,
  role: VideoRole = "publisher",
): string {
  const now = Math.floor(Date.now() / 1000);
  return signJwt({
    scope: "session.connect",
    session_id: sessionId,
    role,
    initial_layout_class_list: "",
    sub: "video",
    acl: { paths: { "/session/**": {} } },
    exp: now + CLIENT_TOKEN_TTL_SECONDS,
  });
}

/**
 * Create the room for a lesson.
 *
 * Without credentials this returns a stub the client recognises, and the app
 * falls back to the scripted lesson rather than failing - the notebook is the
 * point of the demo, and it should still be demonstrable with no Vonage account.
 */
export async function createSession(lessonId: string): Promise<LessonSession> {
  if (!vonageConfigured()) {
    return {
      sessionId: `stub-${lessonId}`,
      token: "stub-token",
      applicationId: "stub-application",
      live: false,
    };
  }

  const now = Math.floor(Date.now() / 1000);
  const apiToken = signJwt({ exp: now + API_TOKEN_TTL_SECONDS });

  const response = await fetch(SESSION_CREATE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    // Relayed peer to peer when possible: a two-person lesson does not need a
    // media server, and the direct path has lower latency.
    body: new URLSearchParams({
      "p2p.preference": "enabled",
      archiveMode: "manual",
    }).toString(),
  });

  if (!response.ok) {
    throw new Error(
      `Vonage session creation failed (${response.status}): ${(await response.text()).slice(0, 200)}`,
    );
  }

  const payload = (await response.json()) as Array<{ session_id?: string }>;
  const sessionId = payload?.[0]?.session_id;
  if (!sessionId) {
    throw new Error("Vonage returned no session id.");
  }

  return {
    sessionId,
    token: generateClientToken(sessionId),
    applicationId: applicationId()!,
    live: true,
  };
}
