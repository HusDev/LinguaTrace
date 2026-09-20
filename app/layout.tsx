import type { Metadata } from "next";
import { Caveat, Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const caveat = Caveat({ variable: "--font-caveat", subsets: ["latin"] });

const DESCRIPTION =
  "LinguaTrace listens to a live language lesson and turns it into practice built from the learner's own mistakes - without either person taking notes.";

/**
 * Where relative URLs in this metadata resolve to.
 *
 * Without it Next emits a relative `og:image`, warns at build, and most
 * unfurlers quietly refuse to resolve it - so a shared link previews as a bare
 * title. The fly app is the default; override it per environment.
 */
const SITE = new URL(
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://linguatrace-e04587.fly.dev",
);

export const metadata: Metadata = {
  metadataBase: SITE,
  title: { default: "LinguaTrace", template: "%s · LinguaTrace" },
  description: DESCRIPTION,
  applicationName: "LinguaTrace",
  openGraph: {
    type: "website",
    siteName: "LinguaTrace",
    title: "LinguaTrace - the lesson notebook that writes itself",
    description: DESCRIPTION,
    url: "/",
    locale: "en_GB",
    images: [
      {
        url: "/og.jpg",
        width: 1920,
        height: 1080,
        alt: "A live language lesson beside a sheet of ruled paper, the notebook filling itself in.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "LinguaTrace - the lesson notebook that writes itself",
    description: DESCRIPTION,
    images: ["/og.jpg"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${caveat.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
