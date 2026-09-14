import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isFuelEnabled } from "@/lib/fuel/flag";
import { ProfileScreen } from "@/components/fuel/profile-screen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Fuel targets — GymBro",
  description: "Your daily calorie and macro targets, and how they were worked out.",
};

export default async function FuelProfilePage() {
  if (!isFuelEnabled()) notFound();
  return <ProfileScreen />;
}
