import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isFuelEnabled } from "@/lib/fuel/flag";
import { FoodsScreen } from "@/components/fuel/foods-screen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "My foods — GymBro",
  description: "Custom foods and recipes you've built yourself.",
};

export default async function FuelFoodsPage() {
  if (!isFuelEnabled()) notFound();
  return <FoodsScreen />;
}
