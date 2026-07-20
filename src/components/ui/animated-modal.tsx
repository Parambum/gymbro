"use client";

import { useEffect, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Aceternity-style animated modal: backdrop blur + spring-in panel.
 * Closes on Escape, backdrop click, or the X. Locks body scroll while open.
 */
export function AnimatedModal({
  open,
  onClose,
  children,
  accent = "#7c3aed",
  className,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  accent?: string;
  className?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center"
        >
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "relative flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border bg-abyss sm:rounded-2xl",
              className,
            )}
            style={{
              borderColor: `${accent}55`,
              boxShadow: `0 0 60px -12px ${accent}66, inset 0 1px 0 rgba(255,255,255,0.05)`,
            }}
          >
            <button
              onClick={onClose}
              aria-label="Close"
              className="absolute right-3 top-3 z-10 rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-panel hover:text-zinc-200"
            >
              <X className="h-4 w-4" />
            </button>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
