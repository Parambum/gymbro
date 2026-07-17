/**
 * Seed: 9 muscle groups × 20 exercises (180 total), a demo operator,
 * 10 weeks of strength history that demonstrates volume-overload
 * progression, and two weeks of cardio telemetry with km splits.
 *
 * Idempotent — safe to re-run. `npm run db:seed`
 */
import { PrismaClient, SetTag, CardioActivity, RunType } from "@prisma/client";
import { MUSCLE_GROUPS, exerciseSlug } from "../src/lib/data/exercise-catalog";
import { epleyE1RM, roundE1RM } from "../src/lib/math/e1rm";
import { relativeEffortFromAvgHr } from "../src/lib/math/relative-effort";

const prisma = new PrismaClient();

/** mulberry32 — deterministic history across re-seeds */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

async function seedCatalog() {
  for (const [i, group] of MUSCLE_GROUPS.entries()) {
    const mg = await prisma.muscleGroup.upsert({
      where: { slug: group.slug },
      update: { name: group.name, accent: group.accent, sortOrder: i },
      create: { slug: group.slug, name: group.name, accent: group.accent, sortOrder: i },
    });
    for (const name of group.exercises) {
      const slug = exerciseSlug(name);
      const isBodyweight = /push-up|pull-up|chin-up|dip|plank|sit-up|crunch|leg raise|toes-to-bar|dragon flag|v-up|dead bug|mountain climber|l-sit|inverted row|nordic|jump rope/i.test(name);
      await prisma.exercise.upsert({
        where: { slug },
        update: { name, muscleGroupId: mg.id, isBodyweight },
        create: { slug, name, muscleGroupId: mg.id, isBodyweight },
      });
    }
  }
  console.log(`✓ catalog: ${MUSCLE_GROUPS.length} groups, ${MUSCLE_GROUPS.reduce((n, g) => n + g.exercises.length, 0)} exercises`);
}

const LIFT_PLAN: Array<{ slug: string; startKg: number; stepKg: number; weekday: number }> = [
  { slug: "flat-barbell-bench-press", startKg: 60, stepKg: 2.5, weekday: 0 },
  { slug: "barbell-back-squat", startKg: 80, stepKg: 5, weekday: 1 },
  { slug: "conventional-deadlift", startKg: 100, stepKg: 5, weekday: 3 },
  { slug: "standing-overhead-barbell-press", startKg: 40, stepKg: 2.5, weekday: 0 },
  { slug: "barbell-bent-over-row", startKg: 50, stepKg: 2.5, weekday: 3 },
];

async function seedStrengthHistory(userId: string) {
  await prisma.workout.deleteMany({ where: { userId } });
  await prisma.personalRecord.deleteMany({ where: { userId } });
  const rand = rng(20260716);

  for (const lift of LIFT_PLAN) {
    const exercise = await prisma.exercise.findUniqueOrThrow({ where: { slug: lift.slug } });
    let bestE1rm = 0;

    // 10 weeks × 1 session/week/lift; reps wave 8→10→12 before load steps up.
    for (let week = 0; week < 10; week++) {
      const block = Math.floor(week / 3);
      const stage = week % 3;
      const weightKg = lift.startKg + block * lift.stepKg;
      const baseReps = 8 + stage * 2;
      const date = daysAgo((9 - week) * 7 + lift.weekday);

      const workout = await prisma.workout.upsert({
        where: { userId_date: { userId, date } },
        update: {},
        create: { userId, date },
      });

      const existingSets = await prisma.workoutSet.count({ where: { workoutId: workout.id } });
      const warmupKg = Math.round((weightKg * 0.5) / 2.5) * 2.5;
      const sets = [
        { weightKg: warmupKg, reps: 10, tag: SetTag.WARMUP },
        { weightKg, reps: baseReps, tag: SetTag.WORKING },
        { weightKg, reps: baseReps, tag: SetTag.WORKING },
        { weightKg, reps: Math.max(4, baseReps - (rand() > 0.5 ? 1 : 2)), tag: SetTag.FAILURE },
      ];

      for (const [i, s] of sets.entries()) {
        const e1rm = roundE1RM(epleyE1RM(s.weightKg, s.reps));
        await prisma.workoutSet.create({
          data: {
            workoutId: workout.id,
            exerciseId: exercise.id,
            setNumber: existingSets + i + 1,
            weightKg: s.weightKg,
            reps: s.reps,
            tag: s.tag,
            e1rm,
            performedAt: new Date(date.getTime() + (18 * 60 + i * 4) * 60 * 1000),
          },
        });
        if (s.tag !== SetTag.WARMUP && e1rm > bestE1rm) {
          bestE1rm = e1rm;
          await prisma.personalRecord.upsert({
            where: { userId_exerciseId: { userId, exerciseId: exercise.id } },
            update: { e1rm, weightKg: s.weightKg, reps: s.reps, achievedAt: date },
            create: { userId, exerciseId: exercise.id, e1rm, weightKg: s.weightKg, reps: s.reps, achievedAt: date },
          });
        }
      }
    }
  }
  console.log(`✓ strength history: ${LIFT_PLAN.length} lifts × 10 weeks`);
}

async function seedCardioHistory(userId: string) {
  await prisma.cardioSession.deleteMany({ where: { userId } });
  const rand = rng(90210);

  const templates = [
    { activity: CardioActivity.RUNNING, runType: RunType.TEMPO, km: 8, paceSec: 305, hr: 168 },
    { activity: CardioActivity.RUNNING, runType: RunType.LONG_RUN, km: 15, paceSec: 355, hr: 152 },
    { activity: CardioActivity.RUNNING, runType: RunType.INTERVALS, km: 6, paceSec: 270, hr: 178 },
    { activity: CardioActivity.RUNNING, runType: RunType.RECOVERY, km: 5, paceSec: 400, hr: 133 },
    { activity: CardioActivity.RUNNING, runType: RunType.SPRINTS, km: 4, paceSec: 250, hr: 182 },
    { activity: CardioActivity.CYCLING, runType: null, km: 32, paceSec: 105, hr: 145 },
    { activity: CardioActivity.ROWING, runType: null, km: 6, paceSec: 245, hr: 158 },
    { activity: CardioActivity.SWIMMING, runType: null, km: 2, paceSec: 1620, hr: 142 },
  ];

  for (let i = 0; i < 14; i++) {
    const t = templates[i % templates.length];
    const jitter = 0.92 + rand() * 0.16;
    const distanceM = Math.round(t.km * 1000 * jitter);
    const durationSec = Math.round((distanceM / 1000) * t.paceSec * (0.97 + rand() * 0.06));
    const avgHr = Math.round(t.hr * (0.97 + rand() * 0.05));
    const date = daysAgo(i * 2 + (rand() > 0.6 ? 1 : 0));

    const fullKm = Math.floor(distanceM / 1000);
    const basePace = durationSec / (distanceM / 1000);
    const splits = Array.from({ length: Math.min(fullKm, 30) }, (_, k) => ({
      index: k + 1,
      distanceM: 1000,
      durationSec: Math.round(basePace * (0.96 + rand() * 0.08) * 10) / 10,
      avgHr: Math.round(avgHr * (0.96 + (k / Math.max(1, fullKm)) * 0.07)),
    }));

    await prisma.cardioSession.create({
      data: {
        userId,
        activity: t.activity,
        runType: t.runType,
        date,
        durationSec,
        distanceM,
        avgHr,
        maxHr: Math.round(avgHr * 1.09),
        relativeEffort: relativeEffortFromAvgHr(durationSec, avgHr),
        splits: { create: splits },
      },
    });
  }
  console.log("✓ cardio history: 14 sessions with splits");
}

async function main() {
  await seedCatalog();
  const user = await prisma.user.upsert({
    where: { email: "operator@progressometer.dev" },
    update: {},
    create: { email: "operator@progressometer.dev", name: "Operator", restHr: 58, maxHr: 192 },
  });
  await seedStrengthHistory(user.id);
  await seedCardioHistory(user.id);
  console.log("✓ seed complete");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
