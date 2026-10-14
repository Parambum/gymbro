import type { MetadataRoute } from "next";

/**
 * Web app manifest.
 *
 * Without this, Chrome offers only "Create shortcut", which opens in a browser
 * tab with the address bar still showing. With it, the app installs to the home
 * screen and runs standalone — which for a gym member who cannot or will not
 * sideload an APK is the whole product, and for everyone else is a working
 * fallback when a 27 MB download fails on gym wifi.
 *
 * `start_url` is /dashboard rather than /: someone who installed this already
 * decided to use it, and landing them on the marketing page every launch is a
 * tax on that decision. Signed out, it redirects to login anyway.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GymBro — Train. Eat. Track.",
    short_name: "GymBro",
    description:
      "Training and nutrition in one app. Log a set, scan a packet, and get a calorie target built from your own metabolism.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0B0B0D",
    theme_color: "#0B0B0D",
    categories: ["health", "fitness", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Android crops launcher icons to a circle or squircle; the maskable
      // variant carries the extra padding that survives it.
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Log food", short_name: "Fuel", url: "/fuel" },
      { name: "Start training", short_name: "Train", url: "/train" },
    ],
  };
}
