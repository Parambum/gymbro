"use client";

import { useEffect, useState } from "react";
import { Link2, Loader2, RefreshCw, Unlink } from "lucide-react";

interface Status {
  configured: boolean;
  connected: boolean;
  athleteName?: string | null;
  lastSyncedAt?: string | null;
}

/**
 * Strava connect/sync controls.
 *
 * Renders nothing at all when the deployment has no Strava credentials —
 * an unconfigured integration shouldn't advertise itself as a broken button.
 */
export function StravaPanel({ onSynced }: { onSynced: () => void }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadStatus = () =>
    fetch("/api/strava/status")
      .then((r) => r.json())
      .then((j) => setStatus(j.error ? { configured: false, connected: false } : j))
      .catch(() => setStatus({ configured: false, connected: false }));

  useEffect(() => {
    void loadStatus();

    // surface the outcome of the OAuth round-trip, then clean the URL
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("strava");
    if (!outcome) return;

    const messages: Record<string, string> = {
      connected: "Strava connected — hit sync to import your activities.",
      denied: "Strava authorisation was cancelled.",
      badstate: "Authorisation could not be verified. Please try connecting again.",
      noscope: "GymBro needs activity read access to import your runs.",
      unconfigured: "Strava isn't configured on this deployment.",
      failed: "Strava connection failed. Please try again.",
    };
    setMessage(messages[outcome] ?? null);
    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  const sync = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/strava/sync", { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setMessage(json.error ?? "Sync failed.");
        return;
      }
      setMessage(
        json.imported === 0 && json.updated === 0
          ? "Already up to date — nothing new on Strava."
          : `Imported ${json.imported} · updated ${json.updated}${json.skipped ? ` · skipped ${json.skipped} non-cardio` : ""}.`,
      );
      onSynced();
      void loadStatus();
    } catch {
      setMessage("Network error during sync.");
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      await fetch("/api/strava/status", { method: "DELETE" });
      setMessage("Strava disconnected. Imported activities were kept.");
      void loadStatus();
    } finally {
      setBusy(false);
    }
  };

  if (!status?.configured) return null;

  return (
    <div className="rounded-xl border border-edge bg-panel/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-500">Strava</h3>
          <p className="mt-1 font-mono text-xs text-zinc-300">
            {status.connected
              ? `Connected${status.athleteName ? ` as ${status.athleteName}` : ""}`
              : "Import your existing runs and rides"}
          </p>
        </div>

        <div className="flex gap-2">
          {status.connected ? (
            <>
              <button
                onClick={sync}
                disabled={busy}
                className="flex items-center gap-1.5 rounded-lg border border-hot-blue/50 bg-hot-blue/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-neon-blue transition-colors hover:bg-hot-blue/20 disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                Sync
              </button>
              <button
                onClick={disconnect}
                disabled={busy}
                aria-label="Disconnect Strava"
                className="rounded-lg border border-edge px-2 py-1.5 text-zinc-600 transition-colors hover:border-neon-crimson/40 hover:text-neon-crimson disabled:opacity-50"
              >
                <Unlink className="h-3 w-3" />
              </button>
            </>
          ) : (
            <a
              href="/api/strava/connect"
              className="flex items-center gap-1.5 rounded-lg border border-[#fc4c02]/50 bg-[#fc4c02]/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-[#fc7a45] transition-colors hover:bg-[#fc4c02]/20"
            >
              <Link2 className="h-3 w-3" /> Connect
            </a>
          )}
        </div>
      </div>

      {message && <p className="mt-3 font-mono text-[11px] text-zinc-400">{message}</p>}
    </div>
  );
}
