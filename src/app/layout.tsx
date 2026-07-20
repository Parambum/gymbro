import type { Metadata } from "next";
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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  return (
    <html lang="en" className="dark">
      <body className={`${display.variable} ${mono.variable} font-display antialiased`}>
        <div className="scanline-overlay" aria-hidden />
        <Nav user={session?.user ?? null} />
        <main>{children}</main>
      </body>
    </html>
  );
}
