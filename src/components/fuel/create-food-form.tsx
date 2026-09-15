"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import type { FoodResult } from "./log-sheet";

/**
 * Create a custom food — the other half of the empty state's promise.
 *
 * Everything saved here is stored unverified and badged as such wherever it
 * appears. The form asks for per-100g figures because that is what a packet
 * prints, and offers an optional household serving so the food isn't
 * gram-only in the picker.
 */
export function CreateFoodForm({
  initialName,
  barcode,
  onCreated,
  onCancel,
}: {
  initialName?: string;
  barcode?: string | null;
  onCreated: (food: FoodResult) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName ?? "");
  const [brand, setBrand] = useState("");
  const [per100g, setPer100g] = useState({ kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 });
  const [servingLabel, setServingLabel] = useState("");
  const [servingGrams, setServingGrams] = useState("");
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const macroSum = per100g.proteinG + per100g.carbsG + per100g.fatG;
  const overweight = macroSum > 105;

  async function save() {
    setSaving(true);
    setFailure(null);
    try {
      const res = await fetch("/api/fuel/foods", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          brand: brand.trim() || null,
          per100g: { ...per100g, fiberG: 0, sugarG: 0, sodiumMg: 0 },
          vegFlag: "unknown",
          aliases: [],
          servingLabel: servingLabel.trim() || null,
          servingGrams: servingGrams ? Number(servingGrams) : null,
          barcode: barcode ?? null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setFailure(json.error ?? "Could not save that food.");
        return;
      }
      onCreated(json.food as FoodResult);
    } catch {
      setFailure("No connection. The food wasn't saved — try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-3">
      <p className="font-mono text-[11px] leading-relaxed text-zinc-500">
        Copy the numbers off the packet, per 100 g. This food is yours — nobody else sees it, and
        it&apos;s marked unverified because the figures came from you rather than a composition
        database.
      </p>

      <label className="mt-3 block">
        <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">Name</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Amul Masti Dahi"
          className="mt-1.5 h-11 w-full rounded-xl border border-edge bg-void px-3 font-display text-base text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hot-green"
        />
      </label>

      <label className="mt-3 block">
        <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
          Brand <span className="text-zinc-700">(optional)</span>
        </span>
        <input
          type="text"
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
          className="mt-1.5 h-11 w-full rounded-xl border border-edge bg-void px-3 font-display text-base text-zinc-100 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hot-green"
        />
      </label>

      <p className="mt-4 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
        Per 100 g
      </p>
      <div className="mt-2 grid grid-cols-2 gap-3">
        {(
          [
            ["kcal", "Calories"],
            ["proteinG", "Protein (g)"],
            ["carbsG", "Carbs (g)"],
            ["fatG", "Fat (g)"],
          ] as const
        ).map(([key, label]) => (
          <label key={key}>
            <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
              {label}
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={String(per100g[key])}
              onChange={(e) =>
                setPer100g((p) => ({
                  ...p,
                  [key]: Number(e.target.value.replace(/[^0-9.]/g, "")) || 0,
                }))
              }
              className="mt-1.5 h-11 w-full rounded-xl border border-edge bg-void px-3 text-center font-display text-lg text-zinc-100 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hot-green"
            />
          </label>
        ))}
      </div>

      {overweight && (
        <p className="mt-2 font-mono text-[11px] leading-relaxed text-neon-amber">
          Protein, carbs and fat add up to {Math.round(macroSum)} g — more than 100 g can hold.
          A decimal point has probably slipped.
        </p>
      )}

      <p className="mt-4 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
        A serving <span className="text-zinc-700">(optional)</span>
      </p>
      <div className="mt-2 grid grid-cols-2 gap-3">
        <input
          type="text"
          value={servingLabel}
          onChange={(e) => setServingLabel(e.target.value)}
          placeholder="1 cup"
          aria-label="Serving name"
          className="h-11 w-full rounded-xl border border-edge bg-void px-3 font-display text-base text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hot-green"
        />
        <input
          type="text"
          inputMode="decimal"
          value={servingGrams}
          onChange={(e) => setServingGrams(e.target.value.replace(/[^0-9.]/g, ""))}
          placeholder="grams"
          aria-label="Serving weight in grams"
          className="h-11 w-full rounded-xl border border-edge bg-void px-3 text-center font-display text-base text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hot-green"
        />
      </div>

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
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving || !name.trim() || per100g.kcal <= 0 || overweight}
          className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl border border-hot-green bg-hot-green/10 font-mono text-[11px] uppercase tracking-widest text-neon-green transition-colors hover:bg-hot-green/20 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Save food
        </button>
      </div>
    </div>
  );
}
