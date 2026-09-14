import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isFuelEnabled } from "@/lib/fuel/flag";
import { ProgressScreen } from "@/components/fuel/progress-screen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Fuel progress — GymBro",
  description: "Weight trend, calorie adherence and macro averages over time.",
};

export default async function FuelProgressPage() {
  if (!isFuelEnabled()) notFound();
  return <ProgressScreen />;
}
