import type { Metadata } from "next";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
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
  title: "Progress-O-Meter — Strength × Endurance Telemetry",
  description:
    "FitNotes-grade strength logging fused with Strava-grade endurance telemetry, wrapped in a 3D neon shell. Every set becomes an e1RM vector.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${display.variable} ${mono.variable} font-display antialiased`}>
        <div className="scanline-overlay" aria-hidden />
        <Nav />
        <main>{children}</main>
      </body>
    </html>
  );
}
