import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUserId } from "@/lib/auth-helpers";
import { PlanScreen } from "@/components/start/plan-screen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your plan — GymBro",
  description: "Your diet and training plan, built from your own numbers.",
};

export default async function PlanPage() {
  const userId = await currentUserId();
  if (!userId) redirect("/login?callbackUrl=%2Fplan");

  return (
    <div className="bg-cyber-grid min-h-[calc(100dvh-3.5rem)]">
      <PlanScreen />
    </div>
  );
}
