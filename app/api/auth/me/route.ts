import { NextResponse } from "next/server";
import { currentAccount } from "@/lib/auth";

export const runtime = "nodejs";

/** Who is signed in, for the client to render itself around. */
export async function GET() {
  return NextResponse.json({ account: await currentAccount() });
}
