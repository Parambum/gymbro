"use client";

import { useRef, useState } from "react";
import { AlertTriangle, Camera, Check, Loader2, Sparkles, Trash2 } from "lucide-react";
import { MEAL_LABELS, type Meal } from "@/lib/fuel/types";
import { cn } from "@/lib/utils";

/**
 * Snap-a-meal and natural-language logging, and the editable draft they both
 * produce (§7.1, §7.2).
 *
 * The rule this screen exists to enforce: **nothing is ever saved without the
 * user looking at it.** A photo estimate is a starting point, not a reading —
 * so every number is editable, every row can be deleted, the model's own
 * uncertainty range is shown next to its guess, and anything it was unsure
 * about is flagged before the user gets to the save button.
 *
 * Where the draft matched a real food, that match is shown and the database's
 * composition is what actually gets stored; the model's value was only ever an
 * estimate of the *portion*.
 */

interface DraftItem {
  name: string;
  estimated_grams: number;
  portion_description: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  confidence: number;
  calorie_range?: [number, number];
  assumptions: string;
  match: {
    foodId: string;
    name: string;
    isVerified: boolean;
    matchedMacros: { kcal: number; proteinG: number; carbsG: number; fatG: number; fiberG: number };
  } | null;
}

interface Row extends DraftItem {
  key: string;
  grams: number;
  useMatch: boolean;
  edited: boolean;
  removed: boolean;
}

const LOW_CONFIDENCE = 0.6;
const MAX_EDGE = 1024;

/** Downscale and re-encode before upload — §7 wants this compressed client-side. */
async function compress(file: File): Promise<{ base64: string; mediaType: "image/jpeg" }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
  return { base64: dataUrl.split(",")[1], mediaType: "image/jpeg" };
}

export function AiDraftReview({
  meal,
  date,
  onLogged,
  onCancel,
}: {
  meal: Meal;
  date: string;
  onLogged: () => void;
  onCancel: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [thinking, setThinking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const [rows, setRows] = useState<Row[] | null>(null);
  const [plateNotes, setPlateNotes] = useState("");
  const [unclear, setUnclear] = useState<string[]>([]);
  const [source, setSource] = useState<"photo" | "text">("photo");

  function ingest(json: { items: DraftItem[]; plateNotes?: string; unclear?: string[] }, from: "photo" | "text") {
    setSource(from);
    setPlateNotes(json.plateNotes ?? "");
    setUnclear(json.unclear ?? []);
    setRows(
      json.items.map((item, i) => ({
        ...item,
        key: `${i}-${item.name}`,
        grams: Math.round(item.estimated_grams),
        useMatch: item.match != null,
        edited: false,
        removed: false,
      })),
    );
  }

  async function analysePhoto(file: File) {
    setThinking(true);
    setFailure(null);
    try {
      const { base64, mediaType } = await compress(file);
      const res = await fetch("/api/fuel/vision", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ image: base64, mediaType }),
      });
      const json = await res.json();
      if (!res.ok) {
        setFailure(json.error ?? "Couldn't read that photo.");
        return;
      }
      ingest(json, "photo");
    } catch {
      setFailure("Couldn't process that image. Try a different one, or type it instead.");
    } finally {
      setThinking(false);
    }
  }

  async function analyseText() {
    if (text.trim().length < 2) return;
    setThinking(true);
    setFailure(null);
    try {
      const res = await fetch("/api/fuel/parse", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: text.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setFailure(json.error ?? "Couldn't read that.");
        return;
      }
      ingest(json, "text");
    } catch {
      setFailure("No connection. Check your network and try again.");
    } finally {
      setThinking(false);
    }
  }

  function patch(key: string, change: Partial<Row>) {
    setRows((rs) => rs?.map((r) => (r.key === key ? { ...r, ...change, edited: true } : r)) ?? null);
  }

  const kept = rows?.filter((r) => !r.removed) ?? [];
  const total = kept.reduce(
    (sum, r) => sum + (r.useMatch && r.match ? scaled(r).kcal : Math.round(r.calories)),
    0,
  );

  /** Matched rows re-scale from the food's real composition as grams change. */
  function scaled(r: Row) {
    if (!r.match) {
      return { kcal: r.calories, proteinG: r.protein_g, carbsG: r.carbs_g, fatG: r.fat_g, fiberG: 0 };
    }
    const f = r.grams / Math.max(r.estimated_grams, 1);
    const m = r.match.matchedMacros;
    return {
      kcal: Math.round(m.kcal * f),
      proteinG: Math.round(m.proteinG * f * 10) / 10,
      carbsG: Math.round(m.carbsG * f * 10) / 10,
      fatG: Math.round(m.fatG * f * 10) / 10,
      fiberG: Math.round(m.fiberG * f * 10) / 10,
    };
  }

  async function saveAll() {
    if (kept.length === 0) return;
    setSaving(true);
    setFailure(null);
    const stamp = Date.now().toString(36);

    try {
      for (const [i, r] of kept.entries()) {
        const macros = r.useMatch && r.match ? scaled(r) : {
          kcal: Math.round(r.calories),
          proteinG: r.protein_g,
          carbsG: r.carbs_g,
          fatG: r.fat_g,
          fiberG: 0,
        };

        const res = await fetch("/api/fuel/log", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            localDate: date,
            meal,
            entryMethod: source,
            foodName: r.useMatch && r.match ? r.match.name : r.name,
            foodId: r.useMatch && r.match ? r.match.foodId : null,
            gramsResolved: r.grams,
            ...macros,
            confidence: r.confidence,
            calorieRange: r.calorie_range ?? null,
            assumptions: r.assumptions || null,
            wasEdited: r.edited,
            clientId: `ai-${stamp}-${i}`,
          }),
        });
        if (!res.ok) {
          const json = await res.json();
          setFailure(json.error ?? "Some items couldn't be saved.");
          return;
        }
      }
      onLogged();
    } catch {
      setFailure("No connection. Nothing further was saved — try again.");
    } finally {
      setSaving(false);
    }
  }

  // ── input step ─────────────────────────────────────────────────────
  if (!rows) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-3">
        <p className="font-mono text-[11px] leading-relaxed text-zinc-500">
          Snap the plate or just describe it. You&apos;ll get a draft to check and correct —
          nothing is logged until you say so.
        </p>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void analysePhoto(file);
            e.target.value = "";
          }}
        />

        <button
          type="button"
          disabled={thinking}
          onClick={() => fileRef.current?.click()}
          className="mt-4 flex min-h-[56px] w-full items-center justify-center gap-2 rounded-xl border border-hot-green bg-hot-green/10 font-mono text-[11px] uppercase tracking-widest text-neon-green transition-colors hover:bg-hot-green/20 disabled:opacity-60"
        >
          {thinking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
          {thinking ? "Reading the plate" : "Take or choose a photo"}
        </button>

        <div className="my-4 flex items-center gap-3">
          <span className="h-px flex-1 bg-edge" />
          <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-600">or</span>
          <span className="h-px flex-1 bg-edge" />
        </div>

        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
            Describe it
          </span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder="2 roti, 1 katori dal, ande aur ek glass doodh"
            className="mt-1.5 w-full resize-none rounded-xl border border-edge bg-void p-3 font-display text-base text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hot-green"
          />
        </label>
        <button
          type="button"
          disabled={thinking || text.trim().length < 2}
          onClick={analyseText}
          className="mt-2 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-edge font-mono text-[11px] uppercase tracking-widest text-zinc-300 transition-colors hover:border-zinc-600 hover:text-zinc-100 disabled:opacity-50"
        >
          {thinking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Work it out
        </button>

        {failure && (
          <p role="alert" className="mt-3 font-mono text-[11px] leading-relaxed text-neon-crimson">
            {failure}
          </p>
        )}

        <p className="mt-4 font-mono text-[10px] leading-relaxed text-zinc-600">
          Portion sizes from a photo are rough by nature. Treat every number here as an estimate
          with a range, not a measurement.
        </p>
      </div>
    );
  }

  // ── draft review ───────────────────────────────────────────────────
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-3">
      <div className="flex items-baseline justify-between">
        <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
          Draft — check before saving
        </p>
        <p className="font-display text-lg font-bold tabular-nums text-neon-green">{total} kcal</p>
      </div>

      {plateNotes && (
        <p className="mt-2 font-mono text-[11px] leading-relaxed text-zinc-500">{plateNotes}</p>
      )}

      <ul className="mt-3 space-y-2">
        {rows.map((r) => {
          const low = r.confidence < LOW_CONFIDENCE;
          const m = r.useMatch && r.match ? scaled(r) : null;
          return (
            <li
              key={r.key}
              className={cn(
                "rounded-xl border bg-void p-3 transition-opacity",
                r.removed && "opacity-40",
                low ? "border-neon-amber/50" : "border-edge",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <input
                  type="text"
                  value={r.name}
                  onChange={(e) => patch(r.key, { name: e.target.value })}
                  aria-label="Food name"
                  className="min-w-0 flex-1 rounded-lg bg-transparent font-display text-sm text-zinc-100 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hot-green"
                />
                <button
                  type="button"
                  onClick={() => patch(r.key, { removed: !r.removed })}
                  aria-label={r.removed ? `Restore ${r.name}` : `Remove ${r.name}`}
                  className="shrink-0 rounded-lg p-1.5 text-zinc-600 transition-colors hover:text-neon-crimson"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              {low && (
                <p className="mt-1.5 flex items-center gap-1.5 font-mono text-[10px] text-neon-amber">
                  <AlertTriangle className="h-3 w-3" /> Not sure about this one — worth a check
                </p>
              )}

              <div className="mt-2 flex items-center gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  value={String(r.grams)}
                  onChange={(e) =>
                    patch(r.key, { grams: Number(e.target.value.replace(/[^0-9]/g, "")) || 0 })
                  }
                  aria-label={`Grams of ${r.name}`}
                  className="h-9 w-20 rounded-lg border border-edge bg-abyss text-center font-display text-sm text-zinc-100 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hot-green"
                />
                <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-600">
                  g{r.portion_description ? ` · ${r.portion_description}` : ""}
                </span>
              </div>

              <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 font-mono text-[10px] text-zinc-500">
                <span className="text-zinc-300">
                  {m ? m.kcal : Math.round(r.calories)} kcal
                </span>
                <span>P {m ? m.proteinG : r.protein_g}</span>
                <span>C {m ? m.carbsG : r.carbs_g}</span>
                <span>F {m ? m.fatG : r.fat_g}</span>
                {r.calorie_range && !m && (
                  <span className="text-zinc-600">
                    range {Math.round(r.calorie_range[0])}–{Math.round(r.calorie_range[1])}
                  </span>
                )}
              </div>

              {r.match && (
                <label className="mt-2 flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={r.useMatch}
                    onChange={(e) => patch(r.key, { useMatch: e.target.checked })}
                    className="mt-0.5 h-4 w-4 accent-[#22ff88]"
                  />
                  <span className="font-mono text-[10px] leading-snug text-zinc-500">
                    Use <span className="text-neon-green">{r.match.name}</span>
                    {r.match.isVerified ? " (verified data)" : " (unverified)"} instead of the
                    estimate
                  </span>
                </label>
              )}

              {r.assumptions && (
                <p className="mt-2 font-mono text-[10px] leading-relaxed text-zinc-600">
                  {r.assumptions}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {unclear.length > 0 && (
        <p className="mt-3 font-mono text-[10px] leading-relaxed text-neon-amber">
          Couldn&apos;t identify: {unclear.join(", ")}. Add anything missing by hand.
        </p>
      )}

      {failure && (
        <p role="alert" className="mt-3 font-mono text-[11px] text-neon-crimson">
          {failure}
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-[48px] rounded-xl border border-edge px-4 font-mono text-[11px] uppercase tracking-widest text-zinc-400 transition-colors hover:text-zinc-100"
        >
          Discard
        </button>
        <button
          type="button"
          onClick={saveAll}
          disabled={saving || kept.length === 0}
          className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl border border-hot-green bg-hot-green/10 font-mono text-[11px] uppercase tracking-widest text-neon-green transition-colors hover:bg-hot-green/20 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Add {kept.length} to {MEAL_LABELS[meal]}
        </button>
      </div>
    </div>
  );
}
