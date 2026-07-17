"use client";

import { useEffect, useRef } from "react";
import { createNoise3D } from "simplex-noise";
import { cn } from "@/lib/utils";

/**
 * Aceternity-style Wavy Background — simplex-noise ribbons on canvas.
 * Used for immersive empty states ("no sets logged yet").
 */
export function WavyBackground({
  children,
  className,
  containerClassName,
  colors = ["#7c3aed", "#06b6d4", "#22ff88", "#8b5cf6", "#0ea5e9"],
  waveWidth = 42,
  backgroundFill = "#05050a",
  blur = 8,
  speed = "slow",
  waveOpacity = 0.4,
}: {
  children?: React.ReactNode;
  className?: string;
  containerClassName?: string;
  colors?: string[];
  waveWidth?: number;
  backgroundFill?: string;
  blur?: number;
  speed?: "slow" | "fast";
  waveOpacity?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const noise = createNoise3D();
    let w = (canvas.width = canvas.offsetWidth);
    let h = (canvas.height = canvas.offsetHeight);
    let nt = 0;
    let raf = 0;
    const dt = speed === "fast" ? 0.002 : 0.0008;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const onResize = () => {
      w = canvas.width = canvas.offsetWidth;
      h = canvas.height = canvas.offsetHeight;
      ctx.filter = `blur(${blur}px)`;
    };
    window.addEventListener("resize", onResize);
    ctx.filter = `blur(${blur}px)`;

    const drawWave = (n: number) => {
      nt += dt;
      for (let i = 0; i < n; i++) {
        ctx.beginPath();
        ctx.lineWidth = waveWidth;
        ctx.strokeStyle = colors[i % colors.length];
        for (let x = 0; x < w; x += 5) {
          const y = noise(x / 800, 0.3 * i, nt) * 100;
          ctx.lineTo(x, y + h * 0.55);
        }
        ctx.stroke();
        ctx.closePath();
      }
    };

    const render = () => {
      ctx.fillStyle = backgroundFill;
      ctx.globalAlpha = 1;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = waveOpacity;
      drawWave(5);
      if (!reduced) raf = requestAnimationFrame(render);
    };
    render();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [blur, backgroundFill, colors, speed, waveOpacity, waveWidth]);

  return (
    <div className={cn("relative flex flex-col items-center justify-center overflow-hidden", containerClassName)}>
      <canvas ref={canvasRef} aria-hidden className="absolute inset-0 z-0 h-full w-full" />
      <div className={cn("relative z-10", className)}>{children}</div>
    </div>
  );
}
