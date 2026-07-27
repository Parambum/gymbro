import type { Metadata, Viewport } from "next";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import { auth } from "@/auth";
import { Nav } from "@/components/nav";
import "./globals.css";

const display = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "GymBro — Strength Progression Tracker",
  description:
    "A serious tool for serious progression. Click-to-log strength training on a 3D anatomy model, log custom exercises, and track true progress with Epley e1RM analytics.",
};

/**
 * `viewportFit: "cover"` lets the layout paint into the notch / home-bar area;
 * the bottom tab bar then reclaims it via env(safe-area-inset-bottom).
 * Pinch-zoom is deliberately left unblocked — it's an accessibility feature.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#05050a",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const signedIn = Boolean(session?.user);

  return (
    <html lang="en" className="dark">
      <body className={`${display.variable} ${mono.variable} font-display antialiased`}>
        <div className="scanline-overlay" aria-hidden />
        <Nav user={session?.user ?? null} />
        {/* clear the fixed mobile tab bar (56px + safe area); desktop has none */}
        <main className={signedIn ? "pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0" : ""}>
          {children}
        </main>
      </body>
    </html>
  );
}
