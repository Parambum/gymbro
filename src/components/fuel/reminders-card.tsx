"use client";

import { useEffect, useState } from "react";
import { BellRing, Download } from "lucide-react";
import { cancelReminder, isNative, scheduleDailyReminder, scheduledReminders } from "@/lib/native";
import { cn } from "@/lib/utils";

/**
 * Meal and weigh-in reminders, scheduled on the phone itself.
 *
 * A web page cannot do this — it would need a push server and a browser that
 * stays installed — so in a browser the card says where it works rather than
 * showing switches that do nothing. In the app, local notifications survive
 * the app being closed and the phone restarting.
 *
 * Copy follows §5.6: a nudge to remember, never a nag about missing.
 */

interface ReminderDef {
  id: number;
  label: string;
  title: string;
  body: string;
  hour: number;
  minute: number;
}

const REMINDERS: ReminderDef[] = [
  { id: 4101, label: "Breakfast", title: "Breakfast?", body: "Snap it while it's in front of you — two seconds.", hour: 9, minute: 0 },
  { id: 4102, label: "Lunch", title: "Lunch", body: "Point the camera at the plate before the first bite.", hour: 13, minute: 30 },
  { id: 4103, label: "Dinner", title: "Dinner", body: "Log dinner and today's done.", hour: 20, minute: 30 },
  { id: 4104, label: "Morning weigh-in", title: "Weigh-in", body: "Same time, same scale — the trend does the rest.", hour: 7, minute: 30 },
];

const pad = (n: number) => String(n).padStart(2, "0");

export function RemindersCard() {
  const [native, setNative] = useState(false);
  const [on, setOn] = useState<Record<number, boolean>>({});
  const [times, setTimes] = useState<Record<number, string>>(() =>
    Object.fromEntries(REMINDERS.map((r) => [r.id, `${pad(r.hour)}:${pad(r.minute)}`])),
  );
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    setNative(isNative());
    scheduledReminders().then((pending) => {
      const ids = new Set(REMINDERS.map((r) => r.id));
      const mine = pending.filter((p) => ids.has(p.id));
      setOn(Object.fromEntries(mine.map((p) => [p.id, true])));
      setTimes((t) => ({ ...t, ...Object.fromEntries(mine.map((p) => [p.id, `${pad(p.hour)}:${pad(p.minute)}`])) }));
    });
  }, []);

  async function apply(r: ReminderDef, enabled: boolean, time: string) {
    setFailure(null);
    await cancelReminder(r.id);
    if (!enabled) {
      setOn((o) => ({ ...o, [r.id]: false }));
      return;
    }
    const [hour, minute] = time.split(":").map(Number);
    const ok = await scheduleDailyReminder({ id: r.id, title: r.title, body: r.body, hour, minute });
    setOn((o) => ({ ...o, [r.id]: ok }));
    if (!ok) setFailure("Notifications are turned off for GymBro. Allow them in Android settings, then try again.");
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="flex items-center gap-2 font-display text-sm text-zinc-100">
          <BellRing className="h-4 w-4 text-neon-green" /> Reminders
        </p>
        {!native ? (
          <p className="mt-1.5 font-mono text-[10px] leading-relaxed text-zinc-500">
            Meal and weigh-in reminders work in the GymBro Android app — a website can&apos;t schedule
            notifications on your phone.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {REMINDERS.map((r) => (
              <li key={r.id} className="flex items-center gap-3 rounded-xl border border-edge bg-void px-3 py-2">
                <span className="flex-1 font-mono text-[11px] text-zinc-300">{r.label}</span>
                <input
                  type="time"
                  value={times[r.id]}
                  aria-label={`${r.label} reminder time`}
                  onChange={(e) => {
                    const t = e.target.value;
                    setTimes((x) => ({ ...x, [r.id]: t }));
                    if (on[r.id]) void apply(r, true, t);
                  }}
                  className="h-9 rounded-lg border border-edge bg-abyss px-2 font-mono text-[11px] text-zinc-200"
                />
                <button
                  type="button"
                  role="switch"
                  aria-checked={Boolean(on[r.id])}
                  aria-label={`${r.label} reminder`}
                  onClick={() => apply(r, !on[r.id], times[r.id])}
                  className={cn(
                    "relative h-6 w-11 shrink-0 rounded-full border transition-colors",
                    on[r.id] ? "border-hot-green bg-hot-green/30" : "border-edge bg-abyss",
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 h-4 w-4 rounded-full transition-all",
                      on[r.id] ? "left-[22px] bg-neon-green" : "left-0.5 bg-zinc-600",
                    )}
                  />
                </button>
              </li>
            ))}
          </ul>
        )}
        {failure && (
          <p role="alert" className="mt-2 font-mono text-[10px] leading-relaxed text-neon-crimson">
            {failure}
          </p>
        )}
      </div>

      <div>
        <p className="flex items-center gap-2 font-display text-sm text-zinc-100">
          <Download className="h-4 w-4 text-neon-green" /> Your data
        </p>
        {native ? (
          <p className="mt-1.5 font-mono text-[10px] leading-relaxed text-zinc-500">
            Download your food log and weigh-ins as spreadsheets from the website, signed in as you.
          </p>
        ) : (
          <div className="mt-2 flex gap-2">
            <a
              href="/api/fuel/export?what=food"
              className="flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-edge font-mono text-[10px] uppercase tracking-widest text-zinc-300 transition-colors hover:border-zinc-600 hover:text-zinc-100"
            >
              Food log (CSV)
            </a>
            <a
              href="/api/fuel/export?what=weight"
              className="flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-edge font-mono text-[10px] uppercase tracking-widest text-zinc-300 transition-colors hover:border-zinc-600 hover:text-zinc-100"
            >
              Weigh-ins (CSV)
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
