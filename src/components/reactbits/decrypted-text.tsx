"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const SCRAMBLE_CHARS = "!<>-_\\/[]{}—=+*^?#ABCDEF0123456789";

/**
 * ReactBits-style Decrypted Text — characters resolve left-to-right out of
 * cipher noise. Used to "unlock" Personal Records. Respects
 * prefers-reduced-motion (renders instantly).
 */
export function DecryptedText({
  text,
  className,
  speed = 28,
  /** ms before the decryption starts */
  delay = 0,
  /** re-run the animation whenever this changes */
  playKey,
}: {
  text: string;
  className?: string;
  speed?: number;
  delay?: number;
  playKey?: string | number;
}) {
  const [display, setDisplay] = useState(text);
  const frame = useRef(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(text);
      return;
    }
    frame.current = 0;
    let interval: ReturnType<typeof setInterval> | undefined;
    const timeout = setTimeout(() => {
      interval = setInterval(() => {
        frame.current += 1;
        const resolved = Math.floor(frame.current / 2);
        if (resolved >= text.length) {
          setDisplay(text);
          if (interval) clearInterval(interval);
          return;
        }
        const head = text.slice(0, resolved);
        const tail = text
          .slice(resolved)
          .split("")
          .map((c) =>
            c === " " ? " " : SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)],
          )
          .join("");
        setDisplay(head + tail);
      }, speed);
    }, delay);

    return () => {
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
    };
  }, [text, speed, delay, playKey]);

  return (
    <span className={cn("font-mono tabular-nums", className)} aria-label={text}>
      {display}
    </span>
  );
}
