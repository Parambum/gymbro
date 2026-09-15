"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useAnimate, useInView } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * Aceternity's text-generate effect: words fade and un-blur in sequence.
 *
 * Two changes from the original. It fires on scroll-into-view rather than on
 * mount, because on a long landing page the original animates a paragraph
 * nobody has reached yet and it is finished by the time they arrive. And it
 * honours prefers-reduced-motion by rendering the finished text immediately —
 * a reduced-motion user should get the sentence, not a faster animation.
 */
export function TextGenerateEffect({
  words,
  className,
  duration = 0.5,
  stagger = 0.08,
}: {
  words: string;
  className?: string;
  duration?: number;
  stagger?: number;
}) {
  const [scope, animate] = useAnimate();
  const wrapper = useRef<HTMLDivElement>(null);
  const inView = useInView(wrapper, { once: true, margin: "-80px" });
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  useEffect(() => {
    if (!inView || reduced) return;
    animate(
      "span",
      { opacity: 1, filter: "blur(0px)" },
      { duration, delay: (i: number) => i * stagger },
    );
  }, [inView, reduced, animate, duration, stagger]);

  return (
    <div ref={wrapper} className={className}>
      <motion.div ref={scope}>
        {words.split(" ").map((word, i) => (
          <motion.span
            key={`${word}-${i}`}
            className={cn(reduced ? "opacity-100" : "opacity-0")}
            style={reduced ? undefined : { filter: "blur(6px)" }}
          >
            {word}{" "}
          </motion.span>
        ))}
      </motion.div>
    </div>
  );
}
