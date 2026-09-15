import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db/mongoose";
import { FuelProfile } from "@/models/FuelProfile";
import { currentUserId } from "@/lib/auth-helpers";
import { isFuelEnabled } from "@/lib/fuel/flag";
import { TodayScreen } from "@/components/fuel/today-screen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Fuel — GymBro",
  description: "What you ate today, against what you're aiming for.",
};

/**
 * The Fuel entry point, and the onboarding gate.
 *
 * A flagged-off module must look absent rather than forbidden, so this 404s
 * instead of explaining itself. Middleware has already established that the
 * visitor is signed in; the only question left here is whether they have a
 * profile, because a Today screen with no target to compare against would be
 * a worse first run than a two-minute setup.
 *
 * The gate deliberately asks nothing about *which day* it is — that needs the
 * viewer's timezone, so TodayScreen resolves it in the browser.
 */
export default async function FuelPage() {
  if (!isFuelEnabled()) notFound();

  const userId = await currentUserId();
  if (!userId) redirect("/login");

  await connectDB();
  const profile = await FuelProfile.findOne({ userId: new Types.ObjectId(userId) })
    .select({ _id: 1 })
    .lean();

  if (!profile) redirect("/fuel/onboarding");

  return <TodayScreen />;
}
