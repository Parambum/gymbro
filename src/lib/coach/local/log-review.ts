import { roundE1RM } from "@/lib/math/e1rm";
import { briefDate, type TrainingLogSummary } from "@/lib/coach/training-log";

/**
 * "How am I doing?" for the keyless coach, written from the lifter's real
 * figures (training-log.ts) — every number in the reply is one of theirs.
 *
 * The reading is deliberately plain: what moved, what stalled, what has not
 * been touched. Each observation is a fact from the log; the one piece of
 * advice attached to it comes from the research library (`researchTopic`), not
 * from a rule of thumb invented here.
 */

/** A lift needs this many sessions before its trend means anything. */
const MIN_POINTS_FOR_TREND = 3;
/** Within ±2 % over the window reads as holding steady, not as a change. */
const FLAT_PCT = 2;

export interface LogReview {
  text: string;
  /** What the research note should be about, or null for none. */
  researchTopic: string | null;
}

export function reviewLog(summary: TrainingLogSummary): LogReview {
  const { window, activity, maxes } = summary;

  if (!activity) {
    const lines = [
      `Your log has no sessions in the last ${window} days, so there's nothing to read yet — and I won't guess.`,
    ];
    if (maxes.length > 0) {
      lines.push(`On file: ${maxes.slice(0, 4).map((m) => `**${m.exercise}** ${m.oneRepMax} kg 1RM`).join(", ")}.`);
    }
    lines.push("Log a session and ask me again, or say **build my plan** and I'll write you a week to start from.");
    return { text: lines.join("\n"), researchTopic: null };
  }

  const weeks = window / 7;
  const perWeek = Math.round((activity.sessions / weeks) * 10) / 10;
  const lines: string[] = [];

  lines.push(`### Last ${window} days`);
  lines.push(
    `- **${activity.sessions} session${activity.sessions === 1 ? "" : "s"}** (about ${perWeek} a week) · ${activity.workingSets} working sets · ${Math.round(activity.tonnage).toLocaleString("en-US")} kg moved`,
  );
  lines.push(`- Most recent: ${briefDate(activity.dates[activity.dates.length - 1])}${activity.streak > 1 ? ` · ${activity.streak}-day streak` : ""}`);

  const tracked = activity.lifts.filter((l) => l.points.length >= MIN_POINTS_FOR_TREND);
  const up = tracked.filter((l) => l.deltaPct > FLAT_PCT);
  const down = tracked.filter((l) => l.deltaPct < -FLAT_PCT);
  const flat = tracked.filter((l) => Math.abs(l.deltaPct) <= FLAT_PCT);

  if (activity.lifts.length > 0) {
    lines.push("", "### Lifts");
    for (const l of activity.lifts.slice(0, 5)) {
      const last = `last ${l.last.weight} kg × ${l.last.reps}`;
      if (l.points.length < MIN_POINTS_FOR_TREND) {
        lines.push(`- **${l.exercise}**: ${last} · ${l.points.length} session${l.points.length === 1 ? "" : "s"}, too few for a trend yet`);
      } else {
        const sign = l.deltaPct >= 0 ? "+" : "";
        lines.push(
          `- **${l.exercise}**: ${sign}${l.deltaPct.toFixed(1)}% estimated 1RM (${roundE1RM(l.first.e1rm)} → ${roundE1RM(l.last.e1rm)} kg) over ${l.points.length} sessions · ${last}`,
        );
      }
    }
  }

  lines.push("", "### Coverage");
  const most = activity.coverage.slice(0, 3).map((m) => `${m.name} ${m.sets}`).join(", ");
  if (most) lines.push(`- Most sets: ${most}`);
  if (activity.untouched.length > 0) {
    lines.push(`- Nothing logged for: **${activity.untouched.map((m) => m.name).join(", ")}**`);
  }

  // ── what to do about it ──────────────────────────────────────────────
  const next: string[] = [];
  if (activity.untouched.length > 0) {
    next.push(`- Work **${activity.untouched[0].name.toLowerCase()}** in this week — it's had no sets in ${window} days.`);
  }
  if (down.length > 0) {
    next.push(`- **${down.map((l) => l.exercise).join(", ")}** ${down.length === 1 ? "is" : "are"} trending down. Hold the weight rather than push it, and look at sleep and recovery before adding volume.`);
  }
  if (flat.length > 0 && down.length === 0) {
    next.push(`- **${flat[0].exercise}** has held steady across ${flat[0].points.length} sessions — chase one more rep per set before adding load.`);
  }
  if (up.length > 0 && down.length === 0 && flat.length === 0) {
    next.push("- Everything you've tracked is moving up. Keep the plan and keep logging.");
  }
  if (next.length > 0) lines.push("", "### Next", ...next);

  // One research note, on the most pressing signal.
  const researchTopic =
    down.length > 0
      ? "when to deload when performance declines and fatigue accumulates"
      : activity.untouched.length > 0
        ? "how many weekly sets per muscle group for hypertrophy"
        : flat.length > 0
          ? "training to failure or close to failure for muscle growth"
          : perWeek < 2
            ? "training frequency per week for strength gains"
            : null;

  return { text: lines.join("\n"), researchTopic };
}
