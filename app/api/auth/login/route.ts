import { NextResponse } from "next/server";
import { signIn, startSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: Record<string, string>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const account = await signIn(body.email ?? "", body.password ?? "");
  if (!account) {
    // The same message either way: this should not reveal who has an account.
    return NextResponse.json(
      { error: "That email and password do not match." },
      { status: 401 },
    );
  }

  await startSession(account.id);
  return NextResponse.json({ account });
}
