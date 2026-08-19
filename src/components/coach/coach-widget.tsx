"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Loader2, MessageSquareDashed, Send, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { MarkdownLite } from "./markdown-lite";

/**
 * The AI Coach chat widget: a floating panel that talks to /api/coach.
 *
 * The whole conversation lives in component state and is posted back on every
 * turn — the Messages API is stateless, and a coach that forgot the answers to
 * its own questionnaire would re-ask them forever.
 */

interface Turn {
  role: "user" | "assistant";
  content: string;
}

const OPENERS = [
  { label: "Show me a demo", prompt: "Show me what you can do — give me a demo." },
  { label: "Build my plan", prompt: "Build me a custom A-Z workout plan." },
] as const;

const SIGNED_IN_OPENER = {
  label: "How am I doing?",
  prompt: "Look at my logged training and tell me how I'm progressing.",
} as const;

export function CoachWidget({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // pin to the newest message as the conversation grows
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, busy]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;

    const next: Turn[] = [...turns, { role: "user", content: message }];
    setTurns(next);
    setDraft("");
    setError(null);
    setBusy(true);

    try {
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // only the last 20 turns travel — enough to hold the questionnaire, and
        // it keeps a long session from growing the request without bound
        body: JSON.stringify({ messages: next.slice(-20) }),
      });
      const data = (await res.json()) as { reply?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Request failed (" + res.status + ")");
      setTurns([...next, { role: "assistant", content: data.reply ?? "" }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  // auth screens are full-bleed; no chrome (matches <Nav>)
  if (pathname === "/login" || pathname === "/signup") return null;

  const openers = signedIn ? [...OPENERS, SIGNED_IN_OPENER] : [...OPENERS];

  return (
    <>
      {/* ── launcher ─────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close AI coach" : "Open AI coach"}
        aria-expanded={open}
        className={cn(
          "fixed right-4 z-[60] flex h-12 w-12 items-center justify-center rounded-full",
          "border border-hot-purple/60 bg-panel text-hot-purple shadow-neon-purple",
          "transition-all hover:scale-105 hover:text-zinc-100",
          // clear the fixed mobile tab bar when it is there
          signedIn ? "bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:bottom-6" : "bottom-6",
        )}
      >
        {open ? <X className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
      </button>

      {/* ── panel ────────────────────────────────────────────────── */}
      {open && (
        <section
          aria-label="AI Coach"
          className={cn(
            "fixed right-4 z-[60] flex w-[min(23rem,calc(100vw-2rem))] flex-col overflow-hidden",
            "rounded-2xl border border-edge bg-void/95 shadow-2xl backdrop-blur-md",
            "h-[min(32rem,calc(100vh-9rem))]",
            signedIn ? "bottom-[calc(8rem+env(safe-area-inset-bottom))] md:bottom-24" : "bottom-24",
          )}
        >
          <header className="flex items-center justify-between border-b border-edge/70 px-4 py-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-hot-purple" />
              <h2 className="font-display text-sm font-bold uppercase tracking-widest text-zinc-100">
                AI Coach
              </h2>
            </div>
            <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-600">
              {signedIn ? "reads your log" : "signed out"}
            </span>
          </header>

          <div
            ref={scrollRef}
            className="flex-1 space-y-3 overflow-y-auto px-4 py-4 text-[13px] text-zinc-300"
          >
            {turns.length === 0 && (
              <div className="space-y-3">
                <p className="leading-relaxed text-zinc-400">
                  Your coach. Ask for a demo, a custom A-Z plan, or a read on the training
                  you&apos;ve actually logged.
                </p>
                <div className="flex flex-wrap gap-2">
                  {openers.map((o) => (
                    <button
                      key={o.label}
                      type="button"
                      onClick={() => void send(o.prompt)}
                      className="rounded-full border border-edge bg-panel px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-zinc-400 transition-colors hover:border-hot-purple/60 hover:text-zinc-100"
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {turns.map((turn, i) =>
              turn.role === "user" ? (
                <div key={i} className="flex justify-end">
                  <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-panel px-3 py-2 text-zinc-200">
                    {turn.content}
                  </p>
                </div>
              ) : (
                <div key={i} className="max-w-[95%]">
                  <MarkdownLite text={turn.content} />
                </div>
              ),
            )}

            {busy && (
              <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-zinc-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Coaching…
              </div>
            )}

            {error && (
              <p className="flex items-start gap-2 rounded-lg border border-hot-crimson/40 bg-hot-crimson/5 px-3 py-2 text-[12px] text-hot-crimson">
                <MessageSquareDashed className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {error}
              </p>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(draft);
            }}
            className="flex items-center gap-2 border-t border-edge/70 p-3"
          >
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Ask your coach…"
              maxLength={2000}
              disabled={busy}
              className="min-w-0 flex-1 rounded-lg border border-edge bg-abyss px-3 py-2 text-[13px] text-zinc-200 placeholder:text-zinc-600 focus:border-hot-purple/60 focus:outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={busy || draft.trim().length === 0}
              aria-label="Send"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-edge bg-panel text-hot-purple transition-colors hover:border-hot-purple/60 hover:text-zinc-100 disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </section>
      )}
    </>
  );
}
