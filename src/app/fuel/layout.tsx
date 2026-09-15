import { notFound } from "next/navigation";
import { isFuelEnabled } from "@/lib/fuel/flag";
import { FuelNav } from "@/components/fuel/fuel-nav";

/**
 * The Fuel shell: the section nav, and the flag check that covers every route
 * under /fuel at once. Each page checks the flag too — a layout is not a
 * security boundary — but this is what stops a flagged-off deployment from
 * rendering any chrome at all.
 */
export default function FuelLayout({ children }: { children: React.ReactNode }) {
  if (!isFuelEnabled()) notFound();

  return (
    <div className="bg-cyber-grid min-h-[calc(100dvh-3.5rem)]">
      <FuelNav />
      {children}
    </div>
  );
}
