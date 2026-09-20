"use client";

import { useState } from "react";
import { Logo } from "@/components/Logo";
import { useRouter } from "next/navigation";

/**
 * Sign in, or make an account.
 *
 * Role is chosen here and never again. Which side of a lesson someone is on
 * decides what their turns are asked, so it is a fact about the person rather
 * than a control they can flip mid-call.
 */
export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [role, setRole] = useState<"tutor" | "learner">("learner");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const data = Object.fromEntries(new FormData(event.currentTarget));
    const res = await fetch(`/api/auth/${mode === "login" ? "login" : "signup"}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, role }),
    });
    const body = await res.json();

    if (!res.ok) {
      setError(body.error ?? "That did not work.");
      setBusy(false);
      return;
    }
    /* Refresh before navigating: server components rendered before the session
       cookie existed still believe nobody is signed in. */
    const next = new URLSearchParams(window.location.search).get("next") ?? "/";
    router.replace(next);
    router.refresh();
  }

  const field =
    "w-full rounded-lg border border-panel-edge bg-panel-raised px-3 py-2 text-[14px] placeholder:text-on-desk-soft/60";

  return (
    <main className="flex-1 grid place-items-center p-6">
      <div className="w-full max-w-sm">
        <Logo className="h-11 w-11 mb-4 drop-shadow-[0_2px_8px_rgba(0,0,0,0.4)]" />
        <h1 className="font-hand text-4xl leading-none mb-1">LinguaTrace</h1>
        <p className="text-[13px] text-on-desk-soft mb-6">
          The lesson notebook that writes itself.
        </p>

        <div className="flex rounded-lg border border-panel-edge bg-panel p-0.5 mb-5">
          {(["login", "signup"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setError(null);
              }}
              className={`flex-1 rounded-md px-3 py-1.5 text-[12px] ${
                mode === m ? "bg-accent-bg text-accent" : "text-on-desk-soft"
              }`}
            >
              {m === "login" ? "Sign in" : "Create account"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-3">
          {mode === "signup" && (
            <>
              <div
                role="group"
                aria-label="I am a"
                className="flex rounded-lg border border-panel-edge bg-panel p-0.5"
              >
                {(["learner", "tutor"] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    aria-pressed={role === r}
                    className={`flex-1 rounded-md px-3 py-1.5 text-[12px] capitalize ${
                      role === r ? "bg-accent-bg text-accent" : "text-on-desk-soft"
                    }`}
                  >
                    I am a {r}
                  </button>
                ))}
              </div>

              <input name="name" placeholder="Your name" required className={field} />

              {role === "learner" && (
                <div className="flex gap-3">
                  <input
                    name="targetLanguage"
                    placeholder="Learning (English)"
                    className={field}
                  />
                  <input
                    name="nativeLanguage"
                    placeholder="Speaks (Spanish)"
                    className={field}
                  />
                </div>
              )}
            </>
          )}

          {/* Password managers add their own attributes to these fields before
              React hydrates, which otherwise reports a mismatch on every visit
              from anyone who uses one. */}
          <input
            name="email"
            type="email"
            autoComplete="email"
            placeholder="Email"
            required
            suppressHydrationWarning
            className={field}
          />
          <input
            name="password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            placeholder={mode === "login" ? "Password" : "Password (8+ characters)"}
            required
            suppressHydrationWarning
            className={field}
          />

          {error && (
            <p className="rounded-lg border border-[#6b3333] bg-[#4a2424] text-[#ffb4b4] px-3 py-2 text-[12px]">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-accent-bg text-accent border border-accent/40 px-4 py-2.5 text-[13px] font-medium disabled:opacity-50"
          >
            {busy ? "…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>

        {mode === "signup" && role === "learner" && (
          <p className="text-[11px] text-on-desk-soft mt-4 leading-5">
            Your tutor sends you a lesson link. Open it while signed in and you
            join their room.
          </p>
        )}
      </div>
    </main>
  );
}
