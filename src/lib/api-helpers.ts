import { prisma } from "@/lib/prisma";

/**
 * Single-operator deployment (auth is out of scope by design): every API
 * route acts as the seeded demo user. Swap this for a session lookup when
 * wiring real auth.
 */
export async function getOperator() {
  return prisma.user.upsert({
    where: { email: "operator@progressometer.dev" },
    update: {},
    create: { email: "operator@progressometer.dev", name: "Operator", restHr: 58, maxHr: 192 },
  });
}

/** Monday of the ISO week containing `d`, as yyyy-mm-dd. */
export function weekStartIso(d: Date): string {
  const copy = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = copy.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  copy.setUTCDate(copy.getUTCDate() - diff);
  return copy.toISOString().slice(0, 10);
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
