"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Camera,
  Check,
  Download,
  ImageIcon,
  Loader2,
  Minus,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { haptic } from "@/lib/native";
import { MEAL_LABELS, type MacroTotals, type Meal } from "@/lib/fuel/types";
import {
  classify,
  fetchModelMeta,
  isModelCached,
  loadFoodModel,
  type FoodModelMeta,
} from "@/lib/fuel/vision/classifier";
import { bitmapFromFile, pixelsFrom } from "@/lib/fuel/vision/preprocess";
import { confidenceLabel, verdict, type Guess } from "@/lib/fuel/vision/ranking";
import {
  SOURCE_LABEL,
  macrosFor,
  proteinDensity,
  sumMacros,
  type VisionClassTable,
  type VisionFood,
} from "@/lib/fuel/vision/classes";
import { cn } from "@/lib/utils";

/**
 * Snap-a-meal, on the phone.
 *
 * A food model trained for this app runs inside the page (WebAssembly, in a
 * worker). There is no API key, no per-photo cost, and the photo never leaves
 * the device — only the food that the user confirms is sent, as a name and a
 * gram weight. After a one-time download it works with no signal at all.
 *
 * Flow: viewfinder (with a live "looks like…" hint) → shutter → the model's
 * answer, or a shortlist when it is unsure → servings from USDA/INDB with the
 * typical portion preselected → "Add to today?" with the day's new total →
 * yes or no. Nothing is logged without that yes.
 */

export interface DayContext {
  consumedKcal: number;
  targetKcal: number | null;
  eyesOff: boolean;
}

interface Line {
  id: string;
  classKey: string;
  food: VisionFood;
  servingIdx: number;
  qty: number;
}

type Stage = "intro" | "loading" | "camera" | "analysing" | "result";

const QTY_STEP = 0.5;
const LIVE_EVERY_MS = 1200;

function linesFor(classKey: string, table: VisionClassTable): Line[] {
  const c = table.classes[classKey];
  if (!c) return [];
  return c.items.map((food, i) => ({
    id: `${classKey}-${i}`,
    classKey,
    food,
    servingIdx: 0,
    qty: food.defaultQty ?? 1,
  }));
}

function gramsOf(l: Line): number {
  return Math.round(l.food.servings[l.servingIdx].grams * l.qty * 10) / 10;
}

function formatMb(bytes: number): string {
  return `${Math.round(bytes / 1_000_000)} MB`;
}

export function SnapMeal({
  meal,
  date,
  day,
  onLogged,
  onSearch,
}: {
  meal: Meal;
  date: string;
  day: DayContext | null;
  onLogged: () => void;
  onSearch: (query: string) => void;
}) {
  const [stage, setStage] = useState<Stage>("intro");
  const [meta, setMeta] = useState<FoodModelMeta | null>(null);
  const [table, setTable] = useState<VisionClassTable | null>(null);
  const [progress, setProgress] = useState(0);
  const [failure, setFailure] = useState<string | null>(null);

  const [cameraOk, setCameraOk] = useState(true);
  const [live, setLive] = useState<Guess | null>(null);

  const [guesses, setGuesses] = useState<Guess[]>([]);
  const [photo, setPhoto] = useState<string | null>(null);
  const [inferMs, setInferMs] = useState<number | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [edited, setEdited] = useState(false);
  const [saving, setSaving] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  /** Opens the phone's camera app directly — the fallback when there is no live viewfinder. */
  const captureRef = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);

  // ── boot: what is the model, and is it already here? ────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [m, cached, t] = await Promise.all([
          fetchModelMeta(),
          isModelCached(),
          import("@/lib/data/food-vision-classes.json").then((mod) => mod.default as unknown as VisionClassTable),
        ]);
        if (cancelled) return;
        setMeta(m);
        setTable(t);
        if (cached) void start();
      } catch (err) {
        if (!cancelled) setFailure(err instanceof Error ? err.message : "Couldn't reach the food model.");
      }
    })();
    return () => {
      cancelled = true;
    };
    // start is stable for the life of the component
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = useCallback(async () => {
    setFailure(null);
    setStage("loading");
    try {
      await loadFoodModel((p) => setProgress(p.total ? p.loaded / p.total : 0));
      setStage("camera");
    } catch (err) {
      setFailure(err instanceof Error ? err.message : "The food model couldn't load.");
      setStage("intro");
    }
  }, []);

  // ── camera ───────────────────────────────────────────────────────────
  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    if (stage !== "camera") return;
    let cancelled = false;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraOk(false);
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 1280 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          await v.play().catch(() => undefined);
        }
        setCameraOk(true);
      } catch {
        setCameraOk(false);
      }
    })();
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [stage, stopCamera]);

  // Live hint while framing the shot. It is a hint, not the answer: frames
  // are blurry mid-movement, so it only speaks up when fairly sure.
  useEffect(() => {
    if (stage !== "camera" || !cameraOk || !table) return;
    const timer = setInterval(async () => {
      const v = videoRef.current;
      if (busyRef.current || !v || v.readyState < 2 || !v.videoWidth) return;
      busyRef.current = true;
      try {
        const { pixels } = pixelsFrom(v);
        const { guesses: g } = await classify(pixels, 1);
        setLive(g[0] && g[0].prob >= 0.4 ? g[0] : null);
      } catch {
        /* a dropped frame is fine */
      } finally {
        busyRef.current = false;
      }
    }, LIVE_EVERY_MS);
    return () => clearInterval(timer);
  }, [stage, cameraOk, table]);

  useEffect(() => stopCamera, [stopCamera]);

  // ── recognise ───────────────────────────────────────────────────────
  const recognise = useCallback(
    async (source: ImageBitmap | HTMLVideoElement) => {
      if (!table || !meta) return;
      setStage("analysing");
      setFailure(null);
      try {
        // Let a live-preview pass finish first; the worker runs one at a time.
        while (busyRef.current) await new Promise((r) => setTimeout(r, 30));
        busyRef.current = true;
        const { pixels, canvas } = pixelsFrom(source);
        setPhoto(canvas.toDataURL("image/jpeg", 0.85));
        stopCamera();
        const { guesses: g, ms } = await classify(pixels, 5);
        setGuesses(g);
        setInferMs(ms);
        const v = verdict(g, meta.confidentAt);
        const first = v.kind === "confident" ? [v.best.key] : [];
        setSelected(first);
        setLines(first.flatMap((k) => linesFor(k, table)));
        setEdited(false);
        setStage("result");
        void haptic("light");
      } catch {
        setFailure("Couldn't read that photo. Try again, or search instead.");
        setStage("camera");
      } finally {
        busyRef.current = false;
      }
    },
    [meta, table, stopCamera],
  );

  async function fromFile(file: File) {
    try {
      const bitmap = await bitmapFromFile(file);
      await recognise(bitmap);
      bitmap.close();
    } catch {
      setFailure("That file isn't an image this phone can read.");
    }
  }

  // ── editing the result ──────────────────────────────────────────────
  /** Chips are toggles: tap another to add it (a thali), tap a ticked one to drop it. */
  function toggleClass(key: string) {
    if (!table) return;
    setEdited(true);
    if (selected.includes(key)) {
      setSelected(selected.filter((k) => k !== key));
      setLines(lines.filter((l) => l.classKey !== key));
    } else {
      setSelected([...selected, key]);
      setLines([...lines, ...linesFor(key, table)]);
    }
  }

  function patchLine(id: string, change: Partial<Line>) {
    setEdited(true);
    setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...change } : l)));
  }

  function swapFood(id: string, food: VisionFood) {
    patchLine(id, { food, servingIdx: 0, qty: food.defaultQty ?? 1 });
  }

  const totals: MacroTotals = useMemo(
    () => sumMacros(lines.map((l) => macrosFor(l.food, gramsOf(l)))),
    [lines],
  );

  const top = guesses[0] ?? null;
  const v = meta && guesses.length ? verdict(guesses, meta.confidentAt) : null;

  async function save() {
    if (!top || lines.length === 0 || !meta) return;
    setSaving(true);
    setFailure(null);
    const stamp = Date.now().toString(36);
    try {
      for (const [i, l] of lines.entries()) {
        const serving = l.food.servings[l.servingIdx];
        const chosenProb = guesses.find((g) => g.key === l.classKey)?.prob ?? 0;
        const res = await fetch("/api/fuel/log", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            localDate: date,
            meal,
            entryMethod: "photo",
            foodRef: { source: l.food.source, sourceRef: l.food.sourceRef },
            grams: gramsOf(l),
            quantity: l.qty,
            portionLabel: serving.label.slice(0, 60),
            vision: {
              model: meta.version,
              predicted: top.key,
              chosen: l.classKey,
              confidence: Math.round(chosenProb * 1000) / 1000,
              edited,
            },
            clientId: `snap-${stamp}-${i}`,
          }),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          setFailure(json.error ?? "Some items couldn't be saved.");
          return;
        }
      }
      void haptic("success");
      onLogged();
    } catch {
      setFailure("No connection. Nothing further was saved — try again.");
    } finally {
      setSaving(false);
    }
  }

  function retake() {
    setGuesses([]);
    setSelected([]);
    setLines([]);
    setPhoto(null);
    setLive(null);
    setStage("camera");
  }

  // ── render ──────────────────────────────────────────────────────────
  if (stage === "intro" || stage === "loading") {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-3">
        <div className="rounded-2xl border border-edge bg-void p-4">
          <p className="flex items-center gap-2 font-display text-sm font-bold text-zinc-100">
            <ShieldCheck className="h-4 w-4 text-neon-green" /> Recognised on your phone
          </p>
          <ul className="mt-2 space-y-1 font-mono text-[11px] leading-relaxed text-zinc-500">
            <li>No API key, no per-photo cost — the model runs on this device.</li>
            <li>Your photo never leaves the phone. Only what you confirm is saved.</li>
            <li>Works offline once downloaded.</li>
          </ul>
          {meta && (
            <p className="mt-3 font-mono text-[10px] leading-relaxed text-zinc-600">
              Knows {meta.classes.length} dishes. Tested on {meta.metrics.testImages.toLocaleString()} photos it
              never trained on: first guess right {Math.round(meta.metrics.top1 * 100)}%, right answer in its
              top 5 {Math.round(meta.metrics.top5 * 100)}%.
            </p>
          )}
        </div>

        {stage === "loading" ? (
          <div className="mt-4" aria-live="polite">
            <div className="h-2 overflow-hidden rounded-full bg-panel">
              <div
                className="h-full rounded-full bg-hot-green transition-[width] duration-200"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
            <p className="mt-2 text-center font-mono text-[10px] uppercase tracking-widest text-zinc-500">
              {progress < 1 ? `Downloading the food model · ${Math.round(progress * 100)}%` : "Starting it up"}
            </p>
          </div>
        ) : (
          <button
            type="button"
            onClick={start}
            disabled={!meta}
            className="mt-4 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl border border-hot-green bg-hot-green/10 font-mono text-[11px] uppercase tracking-widest text-neon-green transition-colors hover:bg-hot-green/20 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            {meta ? `Get the food model · ${formatMb(meta.bytes)}, once` : "Checking…"}
          </button>
        )}

        {failure && (
          <p role="alert" className="mt-3 font-mono text-[11px] leading-relaxed text-neon-crimson">
            {failure}
          </p>
        )}
      </div>
    );
  }

  if (stage === "camera" || stage === "analysing") {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-3">
        {[fileRef, captureRef].map((ref, i) => (
          <input
            key={i}
            ref={ref}
            type="file"
            accept="image/*"
            // Without `capture` Android offers the gallery; with it, the camera.
            capture={ref === captureRef ? "environment" : undefined}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void fromFile(f);
              e.target.value = "";
            }}
          />
        ))}

        <div className="relative aspect-square overflow-hidden rounded-2xl border border-edge bg-void">
          {cameraOk ? (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
              <Camera className="h-6 w-6 text-zinc-600" />
              <p className="font-mono text-[11px] leading-relaxed text-zinc-500">
                The live camera isn&apos;t available here. Take a photo or pick one instead.
              </p>
            </div>
          )}

          {/* the square the model actually sees */}
          {cameraOk && (
            <div className="pointer-events-none absolute inset-3 rounded-xl border-2 border-hot-green/50" />
          )}

          {live && stage === "camera" && (
            <p
              aria-live="polite"
              className="absolute inset-x-3 top-3 rounded-lg bg-void/80 px-3 py-1.5 text-center font-mono text-[11px] text-zinc-200 backdrop-blur"
            >
              Looks like <span className="text-neon-green">{table?.classes[live.key]?.label ?? live.key}</span>
            </p>
          )}

          {stage === "analysing" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-void/70">
              <Loader2 className="h-6 w-6 animate-spin text-neon-green" />
              <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-400">Reading the plate</p>
            </div>
          )}
        </div>

        <p className="mt-2 text-center font-mono text-[10px] leading-relaxed text-zinc-600">
          One dish, filling the square, from above. Good light helps more than anything.
        </p>

        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={stage === "analysing"}
            aria-label="Choose a photo"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-edge bg-void text-zinc-400 transition-colors hover:text-zinc-100 disabled:opacity-50"
          >
            <ImageIcon className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => (cameraOk && videoRef.current ? recognise(videoRef.current) : captureRef.current?.click())}
            disabled={stage === "analysing"}
            className="flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-xl border border-hot-green bg-hot-green/10 font-mono text-[11px] uppercase tracking-widest text-neon-green transition-colors hover:bg-hot-green/20 disabled:opacity-50"
          >
            <Camera className="h-4 w-4" /> {cameraOk ? "Snap it" : "Take a photo"}
          </button>
        </div>

        {failure && (
          <p role="alert" className="mt-3 font-mono text-[11px] leading-relaxed text-neon-crimson">
            {failure}
          </p>
        )}
      </div>
    );
  }

  // ── result ──────────────────────────────────────────────────────────
  if (!table || !v) return null;
  const eyesOff = day?.eyesOff ?? false;
  const unlisted = selected.filter((k) => (table.classes[k]?.items.length ?? 0) === 0);
  const density = proteinDensity(totals);
  const after = day ? day.consumedKcal + totals.kcal : null;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-3">
      <div className="flex gap-3">
        {photo && (
          // A data URL of the 224 px crop — exactly what the model saw.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="What the model looked at" className="h-20 w-20 shrink-0 rounded-xl border border-edge object-cover" />
        )}
        <div className="min-w-0 flex-1" aria-live="polite">
          {v.kind === "confident" ? (
            <>
              <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">Looks like</p>
              <p className="truncate font-display text-xl font-bold text-zinc-100">{table.classes[v.best.key].label}</p>
              <p className="font-mono text-[10px] text-neon-green">{confidenceLabel(v.best.prob)} sure</p>
            </>
          ) : (
            <>
              <p className="flex items-center gap-1.5 font-display text-sm font-bold text-neon-amber">
                <AlertTriangle className="h-4 w-4" /> Not sure — which is it?
              </p>
              <p className="mt-1 font-mono text-[10px] leading-relaxed text-zinc-500">
                Tap everything that&apos;s on the plate. None of these? Search instead.
              </p>
            </>
          )}
          {inferMs != null && (
            <p className="mt-0.5 font-mono text-[9px] text-zinc-700">on-device · {inferMs} ms</p>
          )}
        </div>
      </div>

      {/* shortlist: switch the answer, or add more dishes on the same plate */}
      <div className="mt-3">
        <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-600">
          {v.kind === "confident" ? "Not it? Or more on the plate?" : "Closest matches"}
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {guesses.map((g) => {
            const on = selected.includes(g.key);
            return (
              <button
                key={g.key}
                type="button"
                aria-pressed={on}
                onClick={() => toggleClass(g.key)}
                className={cn(
                  "min-h-[36px] rounded-full border px-3 font-mono text-[11px] transition-colors",
                  on ? "border-hot-green bg-hot-green/10 text-neon-green" : "border-edge bg-void text-zinc-400 hover:border-zinc-600",
                )}
              >
                {on && <Check className="mr-1 inline h-3 w-3" />}
                {table.classes[g.key]?.label ?? g.key}
                <span className="ml-1.5 text-zinc-600">{confidenceLabel(g.prob)}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => onSearch(top ? table.classes[top.key]?.label ?? "" : "")}
            className="min-h-[36px] rounded-full border border-dashed border-edge px-3 font-mono text-[11px] text-zinc-500 hover:text-zinc-200"
          >
            <Search className="mr-1 inline h-3 w-3" /> Something else
          </button>
        </div>
      </div>

      {/* dishes it recognised but has no trustworthy numbers for */}
      {unlisted.map((k) => (
        <div key={k} className="mt-3 rounded-xl border border-neon-amber/40 bg-void p-3">
          <p className="font-mono text-[11px] leading-relaxed text-zinc-300">
            Recognised <span className="text-neon-amber">{table.classes[k].label}</span>, but there&apos;s no
            verified nutrition for it yet — so no number is shown rather than a guess.
          </p>
          <button
            type="button"
            onClick={() => onSearch(table.classes[k].label)}
            className="mt-2 flex min-h-[40px] items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-neon-green"
          >
            <Search className="h-3.5 w-3.5" /> Search “{table.classes[k].label}”
          </button>
        </div>
      ))}

      {/* what gets logged */}
      <ul className="mt-3 space-y-2">
        {lines.map((l) => {
          const grams = gramsOf(l);
          const m = macrosFor(l.food, grams);
          const alts = table.classes[l.classKey]?.alts.filter((a) => a.sourceRef !== l.food.sourceRef) ?? [];
          return (
            <li key={l.id} className="rounded-xl border border-edge bg-void p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-display text-sm text-zinc-100">{l.food.name}</p>
                  <p className="mt-0.5 font-mono text-[9px] uppercase tracking-widest text-zinc-600">
                    {SOURCE_LABEL[l.food.source]}
                    {!l.food.isVerified && <span className="ml-1.5 text-neon-amber">unverified</span>}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEdited(true);
                    setLines((ls) => ls.filter((x) => x.id !== l.id));
                  }}
                  aria-label={`Remove ${l.food.name}`}
                  className="shrink-0 rounded-lg p-1.5 text-zinc-600 hover:text-neon-crimson"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label={`Serving size for ${l.food.name}`}>
                {l.food.servings.slice(0, 5).map((s, i) => (
                  <button
                    key={s.label}
                    type="button"
                    aria-pressed={i === l.servingIdx}
                    onClick={() => patchLine(l.id, { servingIdx: i })}
                    className={cn(
                      "min-h-[32px] rounded-lg border px-2 font-mono text-[10px] transition-colors",
                      i === l.servingIdx ? "border-hot-green bg-hot-green/10 text-neon-green" : "border-edge text-zinc-500 hover:border-zinc-600",
                    )}
                  >
                    {s.label} <span className="text-zinc-600">{Math.round(s.grams)} g</span>
                  </button>
                ))}
              </div>

              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Less"
                  onClick={() => patchLine(l.id, { qty: Math.max(QTY_STEP, l.qty - QTY_STEP) })}
                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-edge text-zinc-400 hover:text-zinc-100"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <p className="flex-1 text-center font-mono text-[11px] tabular-nums text-zinc-300">
                  {l.qty} × · {Math.round(grams)} g
                </p>
                <button
                  type="button"
                  aria-label="More"
                  onClick={() => patchLine(l.id, { qty: Math.min(20, l.qty + QTY_STEP) })}
                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-edge text-zinc-400 hover:text-zinc-100"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              <p className="mt-2 flex flex-wrap gap-x-3 font-mono text-[10px] tabular-nums text-zinc-500">
                {!eyesOff && <span className="text-zinc-200">{m.kcal} kcal</span>}
                <span>P {m.proteinG} g</span>
                {!eyesOff && <span>C {m.carbsG} g</span>}
                {!eyesOff && <span>F {m.fatG} g</span>}
              </p>

              {alts.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">Other versions</span>
                  {alts.map((a) => (
                    <button
                      key={`${a.source}-${a.sourceRef}`}
                      type="button"
                      onClick={() => swapFood(l.id, a)}
                      className="min-h-[28px] rounded-md border border-edge px-2 font-mono text-[10px] text-zinc-400 hover:text-zinc-100"
                    >
                      {a.name.length > 34 ? `${a.name.slice(0, 32)}…` : a.name}
                    </button>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {/* the question the user asked for: add it, or not */}
      {lines.length > 0 && (
        <div className="mt-4 rounded-2xl border border-hot-green/40 bg-hot-green/5 p-4">
          <p className="font-display text-sm font-bold text-zinc-100">Add this to today?</p>
          <p className="mt-1 font-mono text-[11px] tabular-nums text-zinc-400">
            {eyesOff ? (
              <>{totals.proteinG} g protein</>
            ) : (
              <>
                {totals.kcal} kcal · P {totals.proteinG} · C {totals.carbsG} · F {totals.fatG}
              </>
            )}
            {density != null && density >= 8 && (
              <span className="ml-2 rounded bg-hot-green/15 px-1.5 py-0.5 text-[9px] uppercase tracking-widest text-neon-green">
                protein-dense
              </span>
            )}
          </p>
          {!eyesOff && after != null && (
            <p className="mt-1 font-mono text-[10px] tabular-nums text-zinc-500">
              Today: {Math.round(day!.consumedKcal)} → {Math.round(after)} kcal
              {day!.targetKcal ? ` of ${day!.targetKcal}` : ""}
            </p>
          )}

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={retake}
              className="flex min-h-[48px] items-center gap-1.5 rounded-xl border border-edge px-4 font-mono text-[11px] uppercase tracking-widest text-zinc-400 hover:text-zinc-100"
            >
              <RotateCcw className="h-3.5 w-3.5" /> No
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl border border-hot-green bg-hot-green/15 font-mono text-[11px] uppercase tracking-widest text-neon-green transition-colors hover:bg-hot-green/25 disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Yes, add to {MEAL_LABELS[meal]}
            </button>
          </div>
        </div>
      )}

      {lines.length === 0 && (
        <button
          type="button"
          onClick={retake}
          className="mt-4 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-edge font-mono text-[11px] uppercase tracking-widest text-zinc-400 hover:text-zinc-100"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Retake
        </button>
      )}

      <p className="mt-3 font-mono text-[9px] leading-relaxed text-zinc-700">
        Portions come from USDA&apos;s typical serving for the dish; a photo can&apos;t weigh food, so adjust if
        yours was bigger or smaller.
      </p>

      {failure && (
        <p role="alert" className="mt-3 font-mono text-[11px] text-neon-crimson">
          {failure}
        </p>
      )}
    </div>
  );
}
