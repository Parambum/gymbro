import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Space_Grotesk, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { auth } from "@/auth";
import { Nav } from "@/components/nav";
import { CoachWidget } from "@/components/coach/coach-widget";
import { NativeShell } from "@/components/native-shell";
import { isFuelEnabled } from "@/lib/fuel/flag";
import { DEFAULT_THEME, THEME_COOKIE, isTheme } from "@/lib/theme";
import "./globals.css";

/**
 * Space Grotesk carries the headlines — technical, slightly squared, reads as
 * engineered rather than as another rounded fitness app. IBM Plex Sans does
 * the reading, and IBM Plex Mono finally gives the uppercase micro-labels and
 * every tabular number a real monospace instead of Helvetica pretending.
 *
 * `display: "swap"` so a slow font never blocks the first paint of a screen
 * someone opened to log lunch.
 */
const display = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

const body = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "GymBro — Train. Eat. Track.",
  description:
    "A serious tool for serious progress. Click-to-log strength training on a 3D anatomy model, nutrition that adapts to your real metabolism, and one plan for both.",
  applicationName: "GymBro",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { url: "/icons/icon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  // iOS has no manifest support worth the name; these are what make an
  // added-to-home-screen GymBro open without Safari's chrome around it.
  appleWebApp: {
    capable: true,
    title: "GymBro",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0B0B0D",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const signedIn = Boolean(session?.user);

  // Read the theme server-side so the first paint is already correct. Doing
  // this on the client would show one frame of the default theme first, which
  // is exactly the flash a themed app must not have.
  const cookieTheme = (await cookies()).get(THEME_COOKIE)?.value;
  const theme = isTheme(cookieTheme) ? cookieTheme : DEFAULT_THEME;

  return (
    <html
      lang="en"
      className={`dark ${display.variable} ${body.variable} ${mono.variable}`}
      data-theme={theme}
    >
      <body className="font-body antialiased">
        {/* Splash dismissal, system bars and the Android back button.
            Renders nothing, and does nothing at all in a browser. */}
        <NativeShell />
        <div className="scanline-overlay" aria-hidden />
        <Nav user={session?.user ?? null} fuelEnabled={isFuelEnabled()} />
        {/* clear the fixed mobile tab bar (56px + safe area); desktop has none */}
        <main className={signedIn ? "pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0" : ""}>
          {children}
        </main>
        <CoachWidget signedIn={signedIn} />
      </body>
    </html>
  );
}
