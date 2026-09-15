"use client";

import { useCallback, useEffect, useState } from "react";
import { ChefHat, Check, Loader2, Plus, Search, Trash2, X } from "lucide-react";
import { SectionCard } from "./controls";
import { recipePer100g } from "@/lib/fuel/recipe";
import { cn } from "@/lib/utils";

/**
 * My foods & recipes (§3, P1 #12).
 *
 * The management surface for everything the user made themselves. Creating a
 * one-off food happens inline while logging — that's where the need arises —
 * so this screen is for the two things that don't fit in a bottom sheet:
 * building a recipe out of several ingredients, and clearing out the foods
 * that turned out to be mistakes.
 *
 * Deleting a food never touches history. Past entries carry their own macro
 * snapshot and name, so a deleted food leaves every day it appeared on intact.
 */

interface OwnedFood {
  id: string;
  name: string;
  brand: string | null;
  source: string;
  isVerified: boolean;
  per100g: { kcal: number; proteinG: number; carbsG: number; fatG: number; fiberG: number; sugarG: number; sodiumMg: number };
}

interface Recipe {
  id: string;
  name: string;
  servings: number;
  totalGrams: number;
  servingGrams: number;
  items: Array<{ foodName: string; grams: number }>;
}

interface Ingredient {
  foodId: string;
  name: string;
  grams: number;
  per100g: OwnedFood["per100g"];
}

export function FoodsScreen() {
  const [tab, setTab] = useState<"foods" | "recipes">("recipes");
  const [foods, setFoods] = useState<OwnedFood[] | null>(null);
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);

  const load = useCallback(() => {
    fetch("/api/fuel/foods")
      .then((r) => r.json())
      .then((j) => (j.error ? setFailure(j.error) : setFoods(j.foods)))
      .catch(() => setFailure("No connection. Check your network and refresh."));
    fetch("/api/fuel/recipes")
      .then((r) => r.json())
      .then((j) => (j.error ? setFailure(j.error) : setRecipes(j.recipes)))
      .catch(() => setFailure("No connection. Check your network and refresh."));
  }, []);

  useEffect(load, [load]);

  async function remove(kind: "foods" | "recipes", id: string, name: string) {
    if (!window.confirm(`Delete “${name}”? Days you already logged it on keep their numbers.`)) {
      return;
    }
    try {
      const res = await fetch(`/api/fuel/${kind}?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        setFailure((await res.json()).error ?? "Could not delete that.");
        return;
      }
      load();
    } catch {
      setFailure("No connection. Check your network and try again.");
    }
  }

  return (
    <div className="mx-auto w-full max-w-lg space-y-4 px-4 pb-10 pt-5">
      <header className="flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold uppercase tracking-widest text-zinc-100">
          My foods
        </h1>
        <div className="flex gap-1" role="group" aria-label="Section">
          {(["recipes", "foods"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              aria-pressed={tab === t}
              className={cn(
                "min-h-[36px] rounded-lg border px-3 font-mono text-[10px] uppercase tracking-widest transition-colors",
                tab === t
                  ? "border-hot-green bg-hot-green/10 text-neon-green"
                  : "border-edge text-zinc-500 hover:text-zinc-200",
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </header>

      {failure && (
        <p role="alert" className="font-mono text-[11px] text-neon-crimson">
          {failure}
        </p>
      )}

      {tab === "recipes" ? (
        building ? (
          <RecipeBuilder
            onSaved={() => {
              setBuilding(false);
              load();
            }}
            onCancel={() => setBuilding(false)}
          />
        ) : (
          <>
            <button
              type="button"
              onClick={() => setBuilding(true)}
              className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-hot-green bg-hot-green/10 font-mono text-[11px] uppercase tracking-widest text-neon-green transition-colors hover:bg-hot-green/20"
            >
              <ChefHat className="h-4 w-4" /> New recipe
            </button>

            {recipes == null ? (
              <Skeleton />
            ) : recipes.length === 0 ? (
              <SectionCard title="No recipes yet" hint="Build one once, log it in two taps forever.">
                <p className="font-mono text-[11px] leading-relaxed text-zinc-500">
                  A recipe is a list of ingredients divided into servings — your usual dal, a protein
                  shake, whatever you cook the same way every week. It becomes a food you can search
                  for like any other.
                </p>
              </SectionCard>
            ) : (
              <ul className="space-y-2">
                {recipes.map((r) => (
                  <li key={r.id} className="rounded-2xl border border-edge bg-panel/40 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-display text-sm font-bold text-zinc-100">
                          {r.name}
                        </p>
                        <p className="mt-0.5 font-mono text-[10px] text-zinc-500">
                          {r.servings} servings · {r.servingGrams} g each
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => remove("recipes", r.id, r.name)}
                        aria-label={`Delete ${r.name}`}
                        className="shrink-0 rounded-lg p-2 text-zinc-600 transition-colors hover:text-neon-crimson"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <p className="mt-2 font-mono text-[10px] leading-relaxed text-zinc-600">
                      {r.items.map((i) => `${i.foodName} ${i.grams}g`).join(" · ")}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </>
        )
      ) : foods == null ? (
        <Skeleton />
      ) : foods.length === 0 ? (
        <SectionCard title="Nothing custom yet" hint="Foods you add while logging show up here.">
          <p className="font-mono text-[11px] leading-relaxed text-zinc-500">
            When search can&apos;t find something, create it from the packet and it lands here —
            yours alone, and marked unverified so you always know where the numbers came from.
          </p>
        </SectionCard>
      ) : (
        <ul className="space-y-2">
          {foods.map((f) => (
            <li
              key={f.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-edge bg-panel/40 px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="truncate font-display text-sm text-zinc-100">{f.name}</p>
                <p className="truncate font-mono text-[10px] text-zinc-500">
                  {f.brand ? `${f.brand} · ` : ""}
                  {Math.round(f.per100g.kcal)} kcal / 100 g
                  {f.source === "recipe" ? " · recipe" : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => remove("foods", f.id, f.name)}
                aria-label={`Delete ${f.name}`}
                className="shrink-0 rounded-lg p-2 text-zinc-600 transition-colors hover:text-neon-crimson"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Ingredients → servings → a food you can log like any other. */
function RecipeBuilder({ onSaved, onCancel }: { onSaved: () => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [servings, setServings] = useState(4);
  const [items, setItems] = useState<Ingredient[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Array<{ id: string; name: string; per100g: OwnedFood["per100g"] }>>([]);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      fetch(`/api/fuel/foods/search?q=${encodeURIComponent(query)}&limit=8`)
        .then((r) => r.json())
        .then((j) => setResults(j.foods ?? []))
        .catch(() => setResults([]));
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  // The same pure function the server uses, so the preview cannot disagree
  // with what gets stored.
  const composition = recipePer100g(items.map((i) => ({ grams: i.grams, per100g: i.per100g })));
  const servingGrams = servings > 0 ? Math.round((composition.totalGrams / servings) * 10) / 10 : 0;
  const perServingKcal = Math.round((composition.per100g.kcal * servingGrams) / 100);

  async function save() {
    setSaving(true);
    setFailure(null);
    try {
      const res = await fetch("/api/fuel/recipes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          servings,
          items: items.map((i) => ({ foodId: i.foodId, grams: i.grams })),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setFailure(json.error ?? "Could not save that recipe.");
        return;
      }
      onSaved();
    } catch {
      setFailure("No connection. The recipe wasn't saved — try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard title="New recipe" hint="Add what goes in, say how many servings it makes.">
      <label className="block">
        <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">Name</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Sunday dal"
          className="mt-1.5 h-11 w-full rounded-xl border border-edge bg-void px-3 font-display text-base text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hot-green"
        />
      </label>

      <div className="mt-4">
        <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
          Ingredients
        </span>
        {items.length > 0 && (
          <ul className="mt-2 space-y-1.5">
            {items.map((i, idx) => (
              <li
                key={`${i.foodId}-${idx}`}
                className="flex items-center gap-2 rounded-xl border border-edge bg-void px-3 py-2"
              >
                <span className="min-w-0 flex-1 truncate font-display text-sm text-zinc-100">
                  {i.name}
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={String(i.grams)}
                  onChange={(e) => {
                    const grams = Number(e.target.value.replace(/[^0-9]/g, "")) || 0;
                    setItems((xs) => xs.map((x, k) => (k === idx ? { ...x, grams } : x)));
                  }}
                  aria-label={`Grams of ${i.name}`}
                  className="h-9 w-16 rounded-lg border border-edge bg-abyss text-center font-display text-sm text-zinc-100 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hot-green"
                />
                <span className="font-mono text-[10px] text-zinc-600">g</span>
                <button
                  type="button"
                  onClick={() => setItems((xs) => xs.filter((_, k) => k !== idx))}
                  aria-label={`Remove ${i.name}`}
                  className="rounded-lg p-1.5 text-zinc-600 hover:text-neon-crimson"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="relative mt-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Add an ingredient…"
            aria-label="Search ingredients"
            className="h-11 w-full rounded-xl border border-edge bg-void pl-10 pr-3 font-display text-base text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hot-green"
          />
        </div>

        {results.length > 0 && (
          <ul className="mt-2 space-y-1">
            {results.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => {
                    setItems((xs) => [
                      ...xs,
                      { foodId: f.id, name: f.name, grams: 100, per100g: f.per100g },
                    ]);
                    setQuery("");
                    setResults([]);
                  }}
                  className="flex min-h-[44px] w-full items-center gap-2 rounded-xl border border-edge bg-void px-3 text-left font-display text-sm text-zinc-200 transition-colors hover:border-zinc-600"
                >
                  <Plus className="h-3.5 w-3.5 shrink-0 text-zinc-600" />
                  <span className="truncate">{f.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <label className="mt-4 block">
        <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
          Makes how many servings
        </span>
        <input
          type="text"
          inputMode="numeric"
          value={String(servings)}
          onChange={(e) => setServings(Math.max(1, Number(e.target.value.replace(/[^0-9]/g, "")) || 1))}
          className="mt-1.5 h-11 w-full rounded-xl border border-edge bg-void px-3 text-center font-display text-lg text-zinc-100 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hot-green"
        />
      </label>

      {items.length > 0 && (
        <p className="mt-3 font-mono text-[11px] leading-relaxed text-zinc-400">
          {Math.round(composition.totalGrams)} g total ·{" "}
          <span className="text-neon-green">
            {servingGrams} g per serving, {perServingKcal} kcal
          </span>
          <br />
          <span className="text-zinc-600">
            Cooking loss isn&apos;t modelled — a simmered dish ends up denser than this. Dividing by
            the servings you actually eat absorbs it.
          </span>
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
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving || !name.trim() || items.length === 0}
          className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl border border-hot-green bg-hot-green/10 font-mono text-[11px] uppercase tracking-widest text-neon-green transition-colors hover:bg-hot-green/20 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Save recipe
        </button>
      </div>
    </SectionCard>
  );
}

function Skeleton() {
  return (
    <div className="space-y-2" aria-busy>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-16 animate-pulse-glow rounded-xl bg-panel/60" />
      ))}
    </div>
  );
}
