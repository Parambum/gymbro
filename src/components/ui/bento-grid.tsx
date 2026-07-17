import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/**
 * Aceternity-style Bento Grid — the dashboard's structural skeleton.
 * Items span cells via className (`md:col-span-2` etc.).
 */
export function BentoGrid({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "mx-auto grid max-w-7xl grid-cols-1 gap-4 md:auto-rows-[minmax(11rem,auto)] md:grid-cols-3",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function BentoGridItem({
  className,
  title,
  description,
  header,
  icon,
}: {
  className?: string;
  title?: ReactNode;
  description?: ReactNode;
  header?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "group/bento relative flex flex-col justify-between overflow-hidden rounded-2xl",
        "border border-edge bg-panel/70 p-5 backdrop-blur-sm",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
        "transition-all duration-300 hover:-translate-y-0.5 hover:border-edge/0",
        "hover:shadow-[0_0_0_1px_rgba(124,58,237,0.4),0_8px_40px_-12px_rgba(124,58,237,0.35)]",
        className,
      )}
    >
      {header}
      <div className="mt-4 transition-transform duration-300 group-hover/bento:translate-x-1">
        {icon}
        {title && (
          <div className="mt-2 font-display text-sm font-bold uppercase tracking-widest text-zinc-200">
            {title}
          </div>
        )}
        {description && (
          <div className="mt-1 font-mono text-xs text-zinc-500">{description}</div>
        )}
      </div>
    </div>
  );
}
