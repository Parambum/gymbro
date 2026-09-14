"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, Loader2, Plus, ScanLine, Search, Sparkles, X, Zap } from "lucide-react";
import { BarcodeScanner } from "./barcode-scanner";
import { CreateFoodForm } from "./create-food-form";
import { AiDraftReview } from "./ai-draft-review";
import { useDialogA11y } from "./controls";
import { entryMacrosFor } from "@/lib/fuel/log";
import { resolveGrams } from "@/lib/fuel/portions";
import { MEAL_LABELS, type Meal, type Per100g } from "@/lib/fuel/types";
import { cn } from "@/lib/utils";

/**
 * The logging bottom sheet (§10, screen 2).
 *
 * One sheet, five views. Search field autofocused → ranked results → tap →
 * portion sheet with a live macro preview → Add. Two taps for a repeat food,
 * because the ranker treats an empty query as "show me my usuals".
 *
 * The other four views all funnel back into the portion sheet rather than
 * logging directly: a barcode, a photo, a typed sentence and a hand-made food
 * are all just different ways of arriving at "which food, how much", and the
 * user confirms the amount in exactly one place.
 *
 * The macro preview runs the same `entryMacrosFor` the server runs on save, so
 * the number the user agrees to is the number that gets stored.
 */

export interface FoodResult {
  id: string;
  name: string;
  brand: string | null;
  isVerified: boolean;
  vegFlag: string;
  source: string;
  reason: "frequent" | "recent" | "favorite" | "match";
  per100g: Per100g;
  portions: Array<{ id: string; label: string; grams: number; unit: string; isDefault: boolean }>;
  defaultPortion: { id: string; label: string; grams: number; kcal: number } | null;
}

type View = "search" | "portion" | "quick" | "scan" | "create" | "ai";

const DEBOUNCE_MS = 180;

export function LogSheet({
  open,
  meal,
  date,
  initialView = "search",
  onClose,
  onLogged,
}: {
  open: boolean;
  meal: Meal;
  date: string;
  initialView?: View;
  onClose: () => void;
  onLogged: () => void;
}) {
  const [view, setView] = useState<View>(initialView);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FoodResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showedPersonal, setShowedPersonal] = useState(true);
  const [failure, setFailure] = useState<string | null>(null);

  const [picked, setPicked] = useState<FoodResult | null>(null);
  const [portionId, setPortionId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [saving, setSaving] = useState(false);

  const [scanBusy, setScanBusy] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [pendingBarcode, setPendingBarcode] = useState<string | null>(null);

  const [quick, setQuick] = useState({ foodName: "", kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 });

  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const dialogRef = useDialogA11y(open);

  const reset = useCallback(() => {
    setView(initialView);
    setQuery("");
    setResults([]);
    setPicked(null);
    setPortionId(null);
    setQuantity(1);
    setQuick({ foodName: "", kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 });
    setFailure(null);
    setScanError(null);
    setPendingBarcode(null);
  }, [initialView]);

  const choose = useCallback((food: FoodResult) => {
    setPicked(food);
    const def = food.portions.find((p) => p.isDefault) ?? food.portions[0] ?? null;
    setPortionId(def?.id ?? null);
    setQuantity(1);
    setView("portion");
  }, []);

  // ── search, debounced and cancellable ──────────────────────────────
  useEffect(() => {
    if (!open || view !== "search") return;

    const handle = setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setSearching(true);

      fetch(`/api/fuel/foods/search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then((r) => r.json())
        .then((json) => {
          if (json.error) {
            setFailure(json.error);
            return;
          }
          setResults(json.foods ?? []);
          setShowedPersonal(Boolean(json.personal));
          setFailure(null);
        })
        .catch((err) => {
          if (err.name !== "AbortError") setFailure("Search is unavailable. Check your connection.");
        })
        .finally(() => setSearching(false));
    }, DEBOUNCE_MS);

    return () => clearTimeout(handle);
  }, [query, open, view]);

  useEffect(() => {
    if (open) {
      reset();
      const t = setTimeout(() => inputRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
  }, [open, meal, reset]);

  const back = useCallback(() => {
    setPicked(null);
    setPortionId(null);
    setQuantity(1);
    setScanError(null);
    setView("search");
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") (view === "search" ? onClose() : back());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, view, onClose, back]);

  // ── barcode ────────────────────────────────────────────────────────
  const lookUpBarcode = useCallback(
    async (code: string) => {
      setScanBusy(true);
      setScanError(null);
      try {
        const res = await fetch(`/api/fuel/barcode?code=${encodeURIComponent(code)}`);
        const json = await res.json();
        if (!res.ok) {
          setScanError(json.error ?? "That lookup failed.");
          return;
        }
        if (!json.found) {
          // Not a dead end: offer to add it, with the barcode already attached
          // so the next scan of the same packet finds it.
          setPendingBarcode(code);
          setScanError(null);
          setView("create");
          return;
        }
        choose(json.food as FoodResult);
      } catch {
        setScanError("No connection. Check your network and try again.");
      } finally {
        setScanBusy(false);
      }
    },
    [choose],
  );

  const portion = useMemo(
    () => picked?.portions.find((p) => p.id === portionId) ?? null,
    [picked, portionId],
  );
  const grams = portion ? resolveGrams(quantity, portion.grams) : 0;
  const preview = picked && grams > 0 ? entryMacrosFor(picked.per100g, grams) : null;

  async function save() {
    if (!picked || !portion) return;
    setSaving(true);
    setFailure(null);
    try {
      const res = await fetch("/api/fuel/log", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          localDate: date,
          meal,
          foodId: picked.id,
          portionId: portion.id,
          quantity,
          entryMethod: pendingBarcode ? "barcode" : picked.source === "recipe" ? "recipe" : "search",
          clientId: `${picked.id}-${date}-${meal}-${Date.now().toString(36)}`,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setFailure(json.error ?? "Could not save that.");
        return;
      }
      onLogged();
      onClose();
    } catch {
      setFailure("No connection. Your entry wasn't saved — try again.");
    } finally {
      setSaving(false);
    }
  }

  async function saveQuick() {
    if (!quick.foodName.trim()) return;
    setSaving(true);
    setFailure(null);
    try {
      const res = await fetch("/api/fuel/log", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          localDate: date,
          meal,
          ...quick,
          clientId: `quick-${date}-${meal}-${Date.now().toString(36)}`,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setFailure(json.error ?? "Could not save that.");
        return;
      }
      onLogged();
      onClose();
    } catch {
      setFailure("No connection. Your entry wasn't saved — try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  const title =
    view === "portion" && picked
      ? picked.name
      : view === "quick"
        ? "Quick add"
        : view === "scan"
          ? "Scan a barcode"
          : view === "create"
            ? "New food"
            : view === "ai"
              ? "Describe or snap it"
              : MEAL_LABELS[meal];

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-void/80 backdrop-blur-sm"
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Log ${MEAL_LABELS[meal]}`}
        className="relative flex max-h-[88dvh] w-full max-w-lg flex-col rounded-t-2xl border border-edge bg-abyss pb-[env(safe-area-inset-bottom)] shadow-neon-green"
      >
        <div className="flex items-center gap-2 border-b border-edge/70 px-4 py-3">
          {view !== "search" && (
            <button
              type="button"
              onClick={back}
              aria-label="Back to search"
              className="-ml-1 rounded-lg p-2 text-zinc-500 hover:text-zinc-100"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <h2 className="flex-1 truncate font-display text-sm font-bold uppercase tracking-widest text-zinc-100">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 rounded-lg p-2 text-zinc-500 hover:text-zinc-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── search ──────────────────────────────────────────────── */}
        {view === "search" && (
          <>
            <div className="px-4 py-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
                <input
                  ref={inputRef}
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search — dal, roti, paneer…"
                  aria-label="Search foods"
                  className="h-11 w-full rounded-xl border border-edge bg-void pl-10 pr-3 font-display text-base text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hot-green"
                />
              </div>

              <div className="mt-2 flex gap-2">
                <Action icon={ScanLine} label="Scan" onClick={() => setView("scan")} />
                <Action icon={Sparkles} label="Snap / describe" onClick={() => setView("ai")} />
                <Action icon={Zap} label="Quick add" onClick={() => setView("quick")} />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
              {searching && results.length === 0 ? (
                <ResultSkeletons />
              ) : results.length > 0 ? (
                <ul className="space-y-1.5">
                  {showedPersonal && (
                    <li className="pb-1 font-mono text-[10px] uppercase tracking-widest text-zinc-600">
                      What you usually eat
                    </li>
                  )}
                  {results.map((f) => (
                    <li key={f.id}>
                      <button
                        type="button"
                        onClick={() => choose(f)}
                        className="flex w-full min-h-[56px] items-center justify-between gap-3 rounded-xl border border-edge bg-void px-3 py-2.5 text-left transition-colors hover:border-zinc-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hot-green"
                      >
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate font-display text-sm text-zinc-100">
                              {f.name}
                            </span>
                            {f.reason === "frequent" && <Badge>often</Badge>}
                            {f.reason === "recent" && <Badge>recent</Badge>}
                            {!f.isVerified && <Badge tone="amber">unverified</Badge>}
                          </span>
                          <span className="mt-0.5 block truncate font-mono text-[10px] text-zinc-500">
                            {f.brand ? `${f.brand} · ` : ""}
                            {f.defaultPortion
                              ? `${f.defaultPortion.label} · ${f.defaultPortion.grams} g`
                              : "per 100 g"}
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block font-display text-sm font-bold tabular-nums text-neon-green">
                            {f.defaultPortion ? f.defaultPortion.kcal : Math.round(f.per100g.kcal)}
                          </span>
                          <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">
                            kcal
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  query={query}
                  onCreate={() => setView("create")}
                  onQuickAdd={() => setView("quick")}
                />
              )}

              {failure && (
                <p role="alert" className="mt-3 font-mono text-[11px] text-neon-crimson">
                  {failure}
                </p>
              )}
            </div>
          </>
        )}

        {/* ── scan ────────────────────────────────────────────────── */}
        {view === "scan" && (
          <BarcodeScanner onCode={lookUpBarcode} busy={scanBusy} error={scanError} />
        )}

        {/* ── create a food ───────────────────────────────────────── */}
        {view === "create" && (
          <CreateFoodForm
            initialName={pendingBarcode ? "" : query}
            barcode={pendingBarcode}
            onCreated={(food) => {
              setPendingBarcode(null);
              choose(food);
            }}
            onCancel={back}
          />
        )}

        {/* ── AI draft (photo / natural language) ─────────────────── */}
        {view === "ai" && (
          <AiDraftReview
            meal={meal}
            date={date}
            onLogged={() => {
              onLogged();
              onClose();
            }}
            onCancel={back}
          />
        )}

        {/* ── portion picker ──────────────────────────────────────── */}
        {view === "portion" && picked && (
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-3">
            <fieldset>
              <legend className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                Serving
              </legend>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {picked.portions.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPortionId(p.id)}
                    aria-pressed={p.id === portionId}
                    className={cn(
                      "min-h-[44px] rounded-xl border px-3 py-2 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hot-green",
                      p.id === portionId
                        ? "border-hot-green bg-hot-green/10 text-neon-green"
                        : "border-edge bg-void text-zinc-400 hover:border-zinc-600",
                    )}
                  >
                    <span className="block font-display text-sm">{p.label}</span>
                    <span className="font-mono text-[10px] text-zinc-500">{p.grams} g</span>
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="mt-4">
              <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                How many
              </span>
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(0.25, Math.round((q - 0.5) * 4) / 4))}
                  aria-label="Less"
                  className="h-12 w-12 rounded-xl border border-edge bg-void font-mono text-xl text-zinc-400 hover:text-zinc-100"
                >
                  −
                </button>
                <div className="flex-1 rounded-xl border border-edge bg-void py-2.5 text-center">
                  <span className="font-display text-2xl font-bold tabular-nums text-zinc-100">
                    {quantity}
                  </span>
                  <span className="ml-1.5 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                    × {portion?.label ?? ""}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.min(100, Math.round((q + 0.5) * 4) / 4))}
                  aria-label="More"
                  className="h-12 w-12 rounded-xl border border-edge bg-void font-mono text-xl text-zinc-400 hover:text-zinc-100"
                >
                  +
                </button>
              </div>
              <p className="mt-1.5 text-center font-mono text-[10px] text-zinc-600">
                {grams} g total
              </p>
            </div>

            {preview && (
              <dl className="mt-4 grid grid-cols-4 gap-2">
                {[
                  { k: "kcal", v: preview.kcal, cls: "text-neon-green" },
                  { k: "protein", v: `${preview.proteinG}g`, cls: "text-zinc-100" },
                  { k: "carbs", v: `${preview.carbsG}g`, cls: "text-zinc-100" },
                  { k: "fat", v: `${preview.fatG}g`, cls: "text-zinc-100" },
                ].map((m) => (
                  <div key={m.k} className="rounded-xl border border-edge bg-void p-2 text-center">
                    <dd className={cn("font-display text-base font-bold tabular-nums", m.cls)}>
                      {m.v}
                    </dd>
                    <dt className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">
                      {m.k}
                    </dt>
                  </div>
                ))}
              </dl>
            )}

            {!picked.isVerified && (
              <p className="mt-3 font-mono text-[10px] leading-relaxed text-neon-amber">
                These numbers haven&apos;t been verified against a composition database.
              </p>
            )}

            {failure && (
              <p role="alert" className="mt-3 font-mono text-[11px] text-neon-crimson">
                {failure}
              </p>
            )}

            <button
              type="button"
              onClick={save}
              disabled={saving || !portion}
              className="mt-4 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-hot-green bg-hot-green/10 font-mono text-[11px] uppercase tracking-widest text-neon-green transition-colors hover:bg-hot-green/20 disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Add to {MEAL_LABELS[meal]}
            </button>
          </div>
        )}

        {/* ── quick add ───────────────────────────────────────────── */}
        {view === "quick" && (
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-3">
            <p className="font-mono text-[11px] leading-relaxed text-zinc-500">
              No food, just numbers. For when you know roughly what it was and can&apos;t be
              bothered to look it up.
            </p>
            <label className="mt-3 block">
              <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                What was it
              </span>
              <input
                type="text"
                value={quick.foodName}
                onChange={(e) => setQuick((q) => ({ ...q, foodName: e.target.value }))}
                placeholder="Office samosa"
                className="mt-1.5 h-11 w-full rounded-xl border border-edge bg-void px-3 font-display text-base text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hot-green"
              />
            </label>

            <div className="mt-3 grid grid-cols-2 gap-3">
              {(["kcal", "proteinG", "carbsG", "fatG"] as const).map((k) => (
                <label key={k}>
                  <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                    {k === "kcal" ? "Calories" : k.replace("G", "") + " (g)"}
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={String(quick[k])}
                    onChange={(e) =>
                      setQuick((q) => ({
                        ...q,
                        [k]: Number(e.target.value.replace(/[^0-9]/g, "")) || 0,
                      }))
                    }
                    className="mt-1.5 h-11 w-full rounded-xl border border-edge bg-void px-3 text-center font-display text-lg text-zinc-100 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hot-green"
                  />
                </label>
              ))}
            </div>

            {failure && (
              <p role="alert" className="mt-3 font-mono text-[11px] text-neon-crimson">
                {failure}
              </p>
            )}

            <button
              type="button"
              onClick={saveQuick}
              disabled={saving || !quick.foodName.trim()}
              className="mt-4 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-hot-green bg-hot-green/10 font-mono text-[11px] uppercase tracking-widest text-neon-green transition-colors hover:bg-hot-green/20 disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Add to {MEAL_LABELS[meal]}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Action({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof ScanLine;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-edge bg-void px-2 font-mono text-[10px] uppercase tracking-widest text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hot-green"
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function Badge({ children, tone = "green" }: { children: React.ReactNode; tone?: "green" | "amber" }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-widest",
        tone === "amber" ? "bg-neon-amber/15 text-neon-amber" : "bg-hot-green/15 text-neon-green",
      )}
    >
      {children}
    </span>
  );
}

/** An empty state that offers doors, never a dead end (§6). */
function EmptyState({
  query,
  onCreate,
  onQuickAdd,
}: {
  query: string;
  onCreate: () => void;
  onQuickAdd: () => void;
}) {
  return (
    <div className="py-8 text-center">
      <p className="font-display text-sm text-zinc-300">
        {query ? `Nothing matching “${query}”` : "Search for anything you ate"}
      </p>
      <p className="mx-auto mt-2 max-w-xs font-mono text-[11px] leading-relaxed text-zinc-500">
        {query
          ? "Try a different spelling, add it yourself, or just put the numbers in."
          : "Dal, roti, paneer, whey… your usuals show up here once you've logged a few."}
      </p>
      {query && (
        <div className="mt-5 flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={onCreate}
            className="flex min-h-[44px] w-full max-w-xs items-center justify-center gap-2 rounded-xl border border-hot-green bg-hot-green/10 font-mono text-[11px] uppercase tracking-widest text-neon-green"
          >
            <Plus className="h-3.5 w-3.5" /> Create “{query.slice(0, 22)}”
          </button>
          <button
            type="button"
            onClick={onQuickAdd}
            className="flex min-h-[44px] items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-zinc-400 hover:text-zinc-100"
          >
            <Zap className="h-3.5 w-3.5" /> Quick add instead
          </button>
        </div>
      )}
    </div>
  );
}

function ResultSkeletons() {
  return (
    <ul className="space-y-1.5" aria-busy>
      {[0, 1, 2, 3, 4].map((i) => (
        <li key={i} className="h-[56px] animate-pulse-glow rounded-xl bg-panel/60" />
      ))}
    </ul>
  );
}

export function AddButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-edge text-zinc-500 transition-colors hover:border-hot-green/60 hover:text-neon-green focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hot-green"
    >
      <Plus className="h-4 w-4" />
    </button>
  );
}
