import { NextResponse } from "next/server";
import { signUp, startSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: Record<string, string>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const role = body.role === "tutor" ? "tutor" : "learner";
  const result = await signUp({
    email: body.email ?? "",
    password: body.password ?? "",
    name: body.name ?? "",
    role,
    nativeLanguage: body.nativeLanguage,
    targetLanguage: body.targetLanguage,
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  await startSession(result.account.id);
  return NextResponse.json({ account: result.account });
}
