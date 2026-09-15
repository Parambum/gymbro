import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isFuelEnabled } from "@/lib/fuel/flag";
import { OnboardingFlow } from "@/components/fuel/onboarding-flow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Set up Fuel — GymBro",
  description: "Work out your daily calorie and macro targets from your own numbers.",
};

export default async function FuelOnboardingPage() {
  if (!isFuelEnabled()) notFound();
  return <OnboardingFlow />;
}
