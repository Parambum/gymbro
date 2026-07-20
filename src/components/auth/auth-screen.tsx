"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { motion } from "motion/react";
import { WavyBackground } from "@/components/ui/wavy-background";
import { GymBroLogo } from "@/components/brand/gymbro-logo";
import { cn } from "@/lib/utils";

type Mode = "login" | "signup";

export function AuthScreen({ mode, googleEnabled }: { mode: Mode; googleEnabled: boolean }) {
  const router = useRouter();
  const isSignup = mode === "signup";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);

    try {
      if (isSignup) {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, password }),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          setError(json.error ?? "Could not create your account.");
          setBusy(false);
          return;
        }
      }

      const result = await signIn("credentials", { email, password, redirect: false });
      if (result?.error) {
        setError(isSignup ? "Account made, but sign-in failed. Try logging in." : "Invalid email or password.");
        setBusy(false);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Something went wrong. Is the database connected?");
      setBusy(false);
    }
  };

  return (
    <WavyBackground
      containerClassName="min-h-screen w-full"
      className="flex min-h-screen w-full items-center justify-center px-4"
      waveOpacity={0.3}
      blur={10}
    >
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="w-full max-w-md rounded-2xl border border-edge bg-void/80 p-8 backdrop-blur-xl shadow-[0_0_60px_-20px_rgba(124,58,237,0.5)]"
      >
        <Link href="/" className="mb-8 flex justify-center">
          <GymBroLogo markClassName="h-9 w-9" />
        </Link>

        <h1 className="text-center font-display text-2xl font-bold uppercase tracking-widest text-zinc-100">
          {isSignup ? "Create account" : "Welcome back"}
        </h1>
        <p className="mt-1 text-center font-mono text-xs text-zinc-500">
          {isSignup ? "Start tracking real progression." : "Log in to hit the iron."}
        </p>

        <form onSubmit={handleSubmit} className="mt-7 space-y-3">
          {isSignup && (
            <Field
              label="Name"
              type="text"
              value={name}
              onChange={setName}
              placeholder="Your name"
              autoComplete="name"
              required
            />
          )}
          <Field
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="you@example.com"
            autoComplete="email"
            required
          />
          <Field
            label="Password"
            type="password"
            value={password}
            onChange={setPassword}
            placeholder={isSignup ? "At least 8 characters" : "••••••••"}
            autoComplete={isSignup ? "new-password" : "current-password"}
            required
            minLength={isSignup ? 8 : undefined}
          />

          {error && (
            <p className="rounded-lg border border-hot-crimson/40 bg-hot-crimson/10 px-3 py-2 font-mono text-xs text-neon-crimson">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className={cn(
              "mt-2 w-full rounded-xl border border-hot-green/50 bg-hot-green/10 py-3 font-display text-sm font-bold uppercase tracking-[0.2em] text-neon-green shadow-neon-green transition-colors",
              "hover:bg-hot-green/20 disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            {busy ? "…" : isSignup ? "Create account" : "Log in"}
          </button>
        </form>

        {googleEnabled && (
          <>
            <div className="my-5 flex items-center gap-3">
              <span className="h-px flex-1 bg-edge" />
              <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-600">or</span>
              <span className="h-px flex-1 bg-edge" />
            </div>
            <button
              onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
              className="w-full rounded-xl border border-edge bg-abyss py-3 font-mono text-xs uppercase tracking-widest text-zinc-300 transition-colors hover:border-zinc-500 hover:text-zinc-100"
            >
              Continue with Google
            </button>
          </>
        )}

        <p className="mt-6 text-center font-mono text-xs text-zinc-500">
          {isSignup ? "Already lifting with us? " : "New here? "}
          <Link
            href={isSignup ? "/login" : "/signup"}
            className="text-neon-purple underline-offset-4 hover:underline"
          >
            {isSignup ? "Log in" : "Create an account"}
          </Link>
        </p>
      </motion.div>
    </WavyBackground>
  );
}

function Field({
  label,
  value,
  onChange,
  ...props
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value">) {
  return (
    <label className="block">
      <span className="mb-1 block font-mono text-[10px] uppercase tracking-widest text-zinc-500">
        {label}
      </span>
      <input
        {...props}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-edge bg-abyss px-3 py-2.5 font-mono text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-hot-purple focus:outline-none"
      />
    </label>
  );
}
