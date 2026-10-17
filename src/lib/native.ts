/**
 * The native layer, for the one codebase that is both the website and the app.
 *
 * The Android app loads this same deployed application rather than
 * reimplementing it, so every module here runs in two places: a browser, where
 * none of these capabilities exist, and a Capacitor web view, where they do.
 * Each function therefore has to degrade rather than throw — a page that calls
 * `haptic()` must not care which one it is running in.
 *
 * Everything is imported dynamically and only after the platform check. The
 * barcode plugin in particular has no web implementation at all and throws on
 * import-time use, and the browser bundle should not carry any of it.
 */

type Capacitorish = { isNativePlatform?: () => boolean };

/** True only inside the Android app. False in every browser, including mobile. */
export function isNative(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: Capacitorish }).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

/**
 * Scan a barcode with ML Kit.
 *
 * Returns null when not running natively, which is the caller's signal to fall
 * back to the existing `BarcodeScanner` component. That component uses the
 * browser's `BarcodeDetector`, which is unavailable on iOS Safari, fussy in
 * poor light and useless on a crumpled label — the three conditions under
 * which someone actually scans a packet of biscuits in a kitchen.
 */
export async function scanBarcode(): Promise<string | null> {
  if (!isNative()) return null;
  try {
    const { BarcodeScanner } = await import("@capacitor-mlkit/barcode-scanning");

    const { camera } = await BarcodeScanner.requestPermissions();
    if (camera !== "granted" && camera !== "limited") return null;

    // The scanner module is downloadable on some devices rather than bundled.
    const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
    if (!available) await BarcodeScanner.installGoogleBarcodeScannerModule();

    const { barcodes } = await BarcodeScanner.scan();
    return barcodes[0]?.rawValue ?? null;
  } catch {
    // A refused permission or a cancelled scan is an ordinary outcome, not an
    // error worth surfacing; the caller falls back to typing the number.
    return null;
  }
}

type HapticStyle = "light" | "medium" | "heavy" | "success" | "warning" | "error";

/** A tap you can feel when a set is logged. Silently absent on the web. */
export async function haptic(style: HapticStyle = "light"): Promise<void> {
  if (!isNative()) return;
  try {
    const { Haptics, ImpactStyle, NotificationType } = await import("@capacitor/haptics");
    if (style === "success" || style === "warning" || style === "error") {
      const type = { success: NotificationType.Success, warning: NotificationType.Warning, error: NotificationType.Error }[style];
      await Haptics.notification({ type });
      return;
    }
    const impact = { light: ImpactStyle.Light, medium: ImpactStyle.Medium, heavy: ImpactStyle.Heavy }[style];
    await Haptics.impact({ style: impact });
  } catch {
    /* haptics are a courtesy; never let one break a log */
  }
}

/**
 * Schedule a repeating daily reminder.
 *
 * This is the capability a website genuinely cannot match: a web push needs a
 * server, a subscription and a browser that is still installed, whereas this
 * survives the app being closed and the phone being rebooted. Meal and
 * weigh-in reminders are the whole reason a tracker gets opened on day nine.
 */
export async function scheduleDailyReminder(opts: {
  id: number;
  title: string;
  body: string;
  hour: number;
  minute: number;
}): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const perm = await LocalNotifications.requestPermissions();
    if (perm.display !== "granted") return false;

    await LocalNotifications.schedule({
      notifications: [
        {
          id: opts.id,
          title: opts.title,
          body: opts.body,
          schedule: { on: { hour: opts.hour, minute: opts.minute }, repeats: true, allowWhileIdle: true },
        },
      ],
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Reminders currently scheduled on the device, by id and time. The phone is
 * the source of truth — a toggle that read anything else could say "on" for a
 * reminder the OS has long since dropped.
 */
export async function scheduledReminders(): Promise<Array<{ id: number; hour: number; minute: number }>> {
  if (!isNative()) return [];
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const { notifications } = await LocalNotifications.getPending();
    return notifications.map((n) => ({
      id: n.id,
      hour: n.schedule?.on?.hour ?? 0,
      minute: n.schedule?.on?.minute ?? 0,
    }));
  } catch {
    return [];
  }
}

/** Cancel a reminder previously scheduled under this id. */
export async function cancelReminder(id: number): Promise<void> {
  if (!isNative()) return;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await LocalNotifications.cancel({ notifications: [{ id }] });
  } catch {
    /* nothing scheduled is the same outcome as cancelling */
  }
}

/** Whether the device currently has a usable connection. True on the web. */
export async function isOnline(): Promise<boolean> {
  if (!isNative()) return typeof navigator === "undefined" ? true : navigator.onLine;
  try {
    const { Network } = await import("@capacitor/network");
    return (await Network.getStatus()).connected;
  } catch {
    return true;
  }
}
