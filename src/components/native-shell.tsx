"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { isNative } from "@/lib/native";

/**
 * The native behaviours a web view does not get for free.
 *
 * Renders nothing, and does nothing at all in a browser — this file is mounted
 * in the shared layout because the app and the website are one codebase, so
 * every guard here is load-bearing rather than defensive.
 *
 * Three jobs:
 *
 * 1. Dismiss the splash screen. It is configured with launchAutoHide false so
 *    that it covers the web view until React has actually painted, instead of
 *    vanishing on a timer and showing an empty page. The flip side is that if
 *    this never runs, the app sits on the splash for ever.
 * 2. Colour the system bars, which sit outside the web view and so cannot be
 *    reached from CSS.
 * 3. Make the hardware back button mean "back", and mean "leave the app" only
 *    at the root. Android users press it constantly; a web view that ignores
 *    it feels broken within about ten seconds.
 */
export function NativeShell() {
  const router = useRouter();
  const pathname = usePathname();

  // Splash and status bar: once, at startup.
  useEffect(() => {
    if (!isNative()) return;
    let cancelled = false;

    (async () => {
      try {
        const [{ SplashScreen }, { StatusBar, Style }] = await Promise.all([
          import("@capacitor/splash-screen"),
          import("@capacitor/status-bar"),
        ]);
        if (cancelled) return;
        // Two frames, so the splash lifts onto painted content rather than
        // onto a laid-out but still-blank page.
        requestAnimationFrame(() => requestAnimationFrame(() => SplashScreen.hide()));
        await StatusBar.setStyle({ style: Style.Dark });
        await StatusBar.setBackgroundColor({ color: "#0B0B0D" });
      } catch {
        // A missing plugin must never be the reason the app shows nothing.
        try {
          const { SplashScreen } = await import("@capacitor/splash-screen");
          await SplashScreen.hide();
        } catch {
          /* nothing further to try */
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Register the service worker, in the browser only.
   *
   * Chrome refuses to offer "Install" without one, which is what reduced the
   * home-screen option to a browser shortcut. Inside the native app it would
   * be redundant — Capacitor already owns the shell — so it is skipped there.
   */
  useEffect(() => {
    if (isNative()) return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    // After load, so registration never competes with the first paint.
    const register = () => void navigator.serviceWorker.register("/sw.js").catch(() => {});
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  // Back button: re-registered per route so the root check stays accurate.
  useEffect(() => {
    if (!isNative()) return;
    let remove: (() => void) | undefined;

    (async () => {
      const { App } = await import("@capacitor/app");
      const handle = await App.addListener("backButton", ({ canGoBack }) => {
        // "/" and "/dashboard" are both roots: one for signed-out, one for
        // signed-in. Going "back" from either should close the app, not walk
        // backwards into the landing page a signed-in user never chose.
        const atRoot = pathname === "/" || pathname === "/dashboard";
        if (atRoot || !canGoBack) {
          App.exitApp();
          return;
        }
        router.back();
      });
      remove = () => void handle.remove();
    })();

    return () => remove?.();
  }, [pathname, router]);

  return null;
}
