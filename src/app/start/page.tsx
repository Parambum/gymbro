import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUserId } from "@/lib/auth-helpers";
import { StartFlow } from "@/components/start/start-flow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Build my plan — GymBro",
  description: "Answer a few questions and get a diet and training plan built around your goal.",
};

/**
 * The front door for a beginner.
 *
 * Signed-out visitors are sent to sign up first and returned here — the plan
 * has to belong to somebody, and building one they'd lose on refresh would be
 * a worse first impression than one extra step.
 */
export default async function StartPage() {
  const userId = await currentUserId();
  if (!userId) redirect("/signup?callbackUrl=%2Fstart");

  return (
    <div className="bg-cyber-grid min-h-[calc(100dvh-3.5rem)]">
      <StartFlow />
    </div>
  );
}
