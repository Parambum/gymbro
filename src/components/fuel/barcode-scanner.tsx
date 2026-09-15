"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Keyboard, Loader2 } from "lucide-react";

/**
 * Barcode capture, with no scanning library.
 *
 * Chrome and Android expose `BarcodeDetector` natively; a JS decoder like
 * ZXing or Quagga is several hundred kilobytes to ship the same capability to
 * everyone else, which §12 rules out for something the platform already does.
 * So: use the native detector where it exists, and where it doesn't — iOS
 * Safari and Firefox, which is not a small share — offer the number pad
 * instead, said plainly rather than hidden behind a broken camera button.
 *
 * The typed path is not a consolation prize: for a packet already in the
 * cache it is often faster than focusing a camera.
 */

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>>;
}
type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => BarcodeDetectorLike;

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "itf"];

function detectorCtor(): BarcodeDetectorCtor | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector ?? null;
}

export function BarcodeScanner({
  onCode,
  busy,
  error,
}: {
  onCode: (code: string) => void;
  busy: boolean;
  error: string | null;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  const supported = detectorCtor() !== null;
  const [mode, setMode] = useState<"camera" | "manual">(supported ? "camera" : "manual");
  const [typed, setTyped] = useState("");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const stop = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    if (mode !== "camera" || !supported) return;
    let cancelled = false;
    const Ctor = detectorCtor()!;
    const detector = new Ctor({ formats: FORMATS });

    (async () => {
      setStarting(true);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        setCameraError(null);

        const tick = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const hits = await detector.detect(videoRef.current);
            const code = hits.find((h) => /^\d{8,14}$/.test(h.rawValue))?.rawValue;
            if (code) {
              stop();
              onCode(code);
              return;
            }
          } catch {
            // a single failed frame is normal; keep looking
          }
          rafRef.current = requestAnimationFrame(() => void tick());
        };
        rafRef.current = requestAnimationFrame(() => void tick());
      } catch {
        setCameraError(
          "Couldn't open the camera — check the permission, or type the number instead.",
        );
      } finally {
        if (!cancelled) setStarting(false);
      }
    })();

    return () => {
      cancelled = true;
      stop();
    };
  }, [mode, supported, onCode, stop]);

  useEffect(() => stop, [stop]);

  return (
    <div className="px-4 pb-4 pt-3">
      {mode === "camera" ? (
        <>
          <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-edge bg-void">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
            <div className="pointer-events-none absolute inset-x-6 top-1/2 h-24 -translate-y-1/2 rounded-lg border-2 border-hot-green/70" />
            {(starting || busy) && (
              <div className="absolute inset-0 flex items-center justify-center bg-void/60">
                <Loader2 className="h-6 w-6 animate-spin text-neon-green" />
              </div>
            )}
          </div>
          <p className="mt-2 text-center font-mono text-[10px] uppercase tracking-widest text-zinc-600">
            {busy ? "Looking it up" : "Point at the barcode"}
          </p>
        </>
      ) : (
        <>
          <label className="block">
            <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
              Barcode number
            </span>
            <input
              type="text"
              inputMode="numeric"
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value.replace(/[^0-9]/g, "").slice(0, 14))}
              placeholder="8901058000009"
              className="mt-1.5 h-12 w-full rounded-xl border border-edge bg-void px-3 text-center font-display text-xl tracking-widest text-zinc-100 placeholder:text-zinc-700 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hot-green"
            />
          </label>
          {!supported && (
            <p className="mt-2 font-mono text-[10px] leading-relaxed text-zinc-500">
              This browser can&apos;t scan barcodes directly. Chrome on Android can — or type the
              digits under the barcode.
            </p>
          )}
          <button
            type="button"
            disabled={typed.length < 8 || busy}
            onClick={() => onCode(typed)}
            className="mt-3 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-hot-green bg-hot-green/10 font-mono text-[11px] uppercase tracking-widest text-neon-green transition-colors hover:bg-hot-green/20 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Look it up
          </button>
        </>
      )}

      {(error || cameraError) && (
        <p role="alert" className="mt-3 font-mono text-[11px] leading-relaxed text-neon-crimson">
          {error ?? cameraError}
        </p>
      )}

      {supported && (
        <button
          type="button"
          onClick={() => {
            stop();
            setMode((m) => (m === "camera" ? "manual" : "camera"));
          }}
          className="mx-auto mt-4 flex min-h-[44px] items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-zinc-500 transition-colors hover:text-zinc-200"
        >
          {mode === "camera" ? (
            <>
              <Keyboard className="h-3.5 w-3.5" /> Type the number instead
            </>
          ) : (
            <>
              <Camera className="h-3.5 w-3.5" /> Use the camera
            </>
          )}
        </button>
      )}
    </div>
  );
}
