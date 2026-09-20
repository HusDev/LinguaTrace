import { Landing } from "@/components/Landing";
import { LessonRoom } from "@/components/LessonRoom";
import { currentAccount } from "@/lib/auth";

/* The session cookie decides what renders, so this can never be prerendered. */
export const dynamic = "force-dynamic";

/**
 * The front door.
 *
 * Signed in, this is the lesson, exactly as it has always been. Signed out, it
 * is the landing page - decided on the server, so someone arriving for the
 * first time gets the page on first paint rather than a flash of lesson chrome
 * and a redirect to a login form they were never asking for.
 *
 * The one case worth spelling out is the invite link. A tutor shares
 * `/?lesson=<id>`, and whoever opens it is here for that lesson whether or not
 * they have an account yet - so an invite always gets the room, and the room's
 * own client-side check sends them through `/login?next=...` and back again.
 * Redirecting to the login page from here instead would look tidier and would
 * quietly drop the lesson id on the way.
 */
export default async function Home({
  searchParams,
}: {
  // A promise in Next 16. Awaiting it is not optional: read it synchronously
  // and every invited learner silently lands on the marketing page instead.
  searchParams: Promise<{ lesson?: string | string[] }>;
}) {
  const { lesson } = await searchParams;
  const invited = typeof lesson === "string" && lesson.length > 0;

  const me = await currentAccount();
  if (!me && !invited) return <Landing />;

  return <LessonRoom />;
}
