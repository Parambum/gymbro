import type { CapacitorConfig } from "@capacitor/cli";

/**
 * GymBro for Android.
 *
 * The requirement is that the app and the website are the same product, with
 * nothing different between them. The only way to guarantee that is to stop
 * maintaining two implementations: this app loads the deployed Next.js
 * application itself, so there is no second UI to drift, no second calorie
 * engine to disagree with the first, and no release where the phone is a
 * version behind.
 *
 * That decision is forced as much as chosen. The web app has 32 API routes,
 * server-side `auth()` and middleware, so it cannot be exported to static
 * files and bundled. It needs a server, and it already has one.
 *
 * What the native layer adds on top, and what makes this an app rather than a
 * bookmark: on-device barcode scanning through ML Kit, which beats the
 * browser's scanner and works with no signal; local notifications for meal and
 * weigh-in reminders, which a website cannot schedule; haptics; a real splash
 * screen; and an offline screen instead of a dead white page.
 *
 * Shipping a web view and nothing else would also fail Google Play's minimum
 * functionality policy, so those capabilities are the point rather than
 * decoration.
 */
const config: CapacitorConfig = {
  appId: "com.gymbro.app",
  appName: "GymBro",

  /**
   * Only the offline fallback is bundled. Everything else is served, which is
   * what keeps the app and the site identical by construction.
   */
  webDir: "mobile/www",

  server: {
    url: "https://gymbro-dun.vercel.app",
    // Auth.js sets a Secure cookie; the web view must be on https for the
    // session to survive, so plain http is refused outright.
    androidScheme: "https",
    cleartext: false,
    // Keep navigation to our own origins inside the app. Anything else — a
    // privacy policy, an OAuth consent page — opens in the system browser.
    allowNavigation: ["gymbro-dun.vercel.app"],
  },

  android: {
    // The web app already draws its own dark background; letting the web view
    // paint white first causes a flash on every cold start.
    backgroundColor: "#0B0B0D",
    allowMixedContent: false,
  },

  plugins: {
    SplashScreen: {
      launchAutoHide: false, // hidden once the web app signals it has painted
      backgroundColor: "#0B0B0D",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
    },
    LocalNotifications: {
      smallIcon: "ic_stat_gymbro",
      iconColor: "#FF5A1F",
    },
    StatusBar: {
      style: "DARK", // dark UI, so light icons
      backgroundColor: "#0B0B0D",
      overlaysWebView: false,
    },
  },
};

export default config;
