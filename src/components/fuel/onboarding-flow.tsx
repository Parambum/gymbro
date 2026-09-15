"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Flame, Loader2 } from "lucide-react";
import { ChoiceGrid, DateField, NumberField, SectionCard, type Choice } from "./controls";
import {
  ageOn,
  computeTargets,
  daysToGoal,
  goalWeightNote,
  maxRateKgPerWeek,
} from "@/lib/fuel/engine";
import {
  ACTIVITY_LEVELS,
  MACRO_PRESETS,
  type ActivityLevel,
  type DietPref,
  type Goal,
  type MacroPreset,
  type Sex,
} from "@/lib/fuel/types";
import { addDaysIso, prettyDate, todayIso } from "@/lib/date-utils";
import { cn } from "@/lib/utils";

/**
 * Onboarding: five short steps, then a target.
 *
 * The preview on the review step is computed by the *same* engine the server
 * runs on save — `computeTargets` is pure, so it imports straight into the
 * browser. The user watches the number move as they drag the rate, and the
 * server recomputes it as truth when they commit. Two implementations of this
 * arithmetic would be two chances to disagree; there is only one.
 */

const SEX_CHOICES: ReadonlyArray<Choice<Sex>> = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "unspecified", label: "Rather not say", blurb: "We'll average the two and mark it an estimate" },
];

const GOAL_CHOICES: ReadonlyArray<Choice<Goal>> = [
  { value: "lose", label: "Lose fat", blurb: "Eat under maintenance" },
  { value: "maintain", label: "Maintain", blurb: "Hold steady, train hard" },
  { value: "gain", label: "Build", blurb: "Eat over maintenance" },
];

const DIET_CHOICES: ReadonlyArray<Choice<DietPref>> = [
  { value: "veg", label: "Veg" },
  { value: "egg", label: "Eggetarian" },
  { value: "nonveg", label: "Non-veg" },
  { value: "vegan", label: "Vegan" },
  { value: "jain", label: "Jain" },
];

const ACTIVITY_CHOICES: ReadonlyArray<Choice<ActivityLevel>> = ACTIVITY_LEVELS.map((a) => ({
  value: a.slug,
  label: a.label,
  blurb: a.blurb,
}));

const PRESET_CHOICES: ReadonlyArray<Choice<MacroPreset>> = MACRO_PRESETS.map((p) => ({
  value: p.slug,
  label: p.label,
  blurb: p.blurb,
}));

const STEPS = ["You", "Activity", "Goal", "Split", "Targets"] as const;

export function OnboardingFlow() {
  const router = useRouter();
  const today = todayIso();

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const [sex, setSex] = useState<Sex>("male");
  const [birthDate, setBirthDate] = useState("2000-01-01");
  const [heightCm, setHeightCm] = useState(175);
  const [weightKg, setWeightKg] = useState(70);
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>("moderate");
  const [goal, setGoal] = useState<Goal>("lose");
  const [rateKgPerWeek, setRateKgPerWeek] = useState(0.4);
  const [targetWeightKg, setTargetWeightKg] = useState(65);
  const [dietPref, setDietPref] = useState<DietPref>("veg");
  const [macroPreset, setMacroPreset] = useState<MacroPreset>("balanced");

  const age = ageOn(birthDate, today);
  const ageValid = age >= 13 && age <= 100;

  const preview = useMemo(
    () =>
      computeTargets({
        sex,
        ageYears: age,
        heightCm,
        weightKg,
        activityLevel,
        goal,
        rateKgPerWeek,
        macroPreset,
      }),
    [sex, age, heightCm, weightKg, activityLevel, goal, rateKgPerWeek, macroPreset],
  );

  const rateCap = maxRateKgPerWeek(goal, weightKg);
  const days = daysToGoal(weightKg, targetWeightKg, goal, preview.appliedRateKgPerWeek);
  const bmiNote = goal !== "maintain" ? goalWeightNote(targetWeightKg, heightCm) : null;
  const notes = bmiNote ? [...preview.notes, bmiNote] : preview.notes;

  const canAdvance = step !== 0 || (ageValid && heightCm > 0 && weightKg > 0);

  async function save() {
    setSaving(true);
    setFailure(null);
    try {
      const res = await fetch("/api/fuel/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sex,
          birthDate,
          heightCm,
          weightKg,
          activityLevel,
          goal,
          rateKgPerWeek,
          targetWeightKg: goal === "maintain" ? null : targetWeightKg,
          dietPref,
          macroPreset,
          units: "metric",
          tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata",
          localDate: todayIso(),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setFailure(json.error ?? "Could not save your profile.");
        return;
      }
      router.push("/fuel");
      router.refresh();
    } catch {
      setFailure("No connection. Check your network and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-lg px-4 pb-10 pt-6">
      <header className="mb-6">
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.3em] text-zinc-500">
          <Flame className="h-3.5 w-3.5 text-neon-green" />
          Set up Fuel
        </div>
        <h1 className="mt-2 font-display text-2xl font-bold uppercase tracking-widest text-zinc-100">
          {STEPS[step]}
        </h1>

        {/* progress: a labelled bar, not colour alone */}
        <div className="mt-4 flex items-center gap-1.5" aria-hidden>
          {STEPS.map((s, i) => (
            <span
              key={s}
              className={cn(
                "h-1 flex-1 rounded-full transition-colors",
                i <= step ? "bg-hot-green" : "bg-edge",
              )}
            />
          ))}
        </div>
        <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-zinc-600">
          Step {step + 1} of {STEPS.length}
        </p>
      </header>

      <div className="space-y-4">
        {step === 0 && (
          <SectionCard title="About you" hint="This is what the calorie maths runs on. You can change any of it later.">
            <div className="space-y-4">
              <ChoiceGrid label="Sex" options={SEX_CHOICES} value={sex} onChange={setSex} columns={1} />
              <DateField
                label="Date of birth"
                value={birthDate}
                onChange={setBirthDate}
                max={today}
                error={ageValid ? null : "Enter a date of birth between 13 and 100 years ago"}
              />
              <div className="grid grid-cols-2 gap-3">
                <NumberField label="Height" value={heightCm} onChange={setHeightCm} unit="cm" min={80} max={250} />
                <NumberField
                  label="Weight"
                  value={weightKg}
                  onChange={setWeightKg}
                  unit="kg"
                  min={20}
                  max={400}
                  step={0.5}
                  decimals
                />
              </div>
              <ChoiceGrid label="You eat" options={DIET_CHOICES} value={dietPref} onChange={setDietPref} columns={3} />
            </div>
          </SectionCard>
        )}

        {step === 1 && (
          <SectionCard
            title="How much do you move?"
            hint="Count training and everything else. Most people who lift 3–5 times a week are Moderate."
          >
            <ChoiceGrid
              label="Activity level"
              options={ACTIVITY_CHOICES}
              value={activityLevel}
              onChange={setActivityLevel}
              columns={1}
            />
          </SectionCard>
        )}

        {step === 2 && (
          <SectionCard title="What are you after?" hint="Pick a direction, then a pace you can actually hold.">
            <div className="space-y-4">
              <ChoiceGrid label="Goal" options={GOAL_CHOICES} value={goal} onChange={setGoal} columns={1} />

              {goal !== "maintain" && (
                <>
                  <NumberField
                    label={`Pace (kg per week, max ${rateCap.toFixed(2)})`}
                    value={rateKgPerWeek}
                    onChange={setRateKgPerWeek}
                    unit="kg/wk"
                    min={0}
                    max={2}
                    step={0.05}
                    decimals
                  />
                  <NumberField
                    label="Goal weight"
                    value={targetWeightKg}
                    onChange={setTargetWeightKg}
                    unit="kg"
                    min={20}
                    max={400}
                    step={0.5}
                    decimals
                  />
                  {days != null && (
                    <p className="font-mono text-[11px] text-zinc-400">
                      At {preview.appliedRateKgPerWeek} kg/week you&apos;d get there around{" "}
                      <span className="text-neon-green">{prettyDate(addDaysIso(today, days))}</span>.
                    </p>
                  )}
                </>
              )}
            </div>
          </SectionCard>
        )}

        {step === 3 && (
          <SectionCard
            title="Macro split"
            hint="Protein is set from your bodyweight either way — you lift, that's the point."
          >
            <ChoiceGrid
              label="Split"
              options={PRESET_CHOICES}
              value={macroPreset}
              onChange={setMacroPreset}
              columns={1}
            />
          </SectionCard>
        )}

        {step === 4 && (
          <>
            <SectionCard
              title="Your daily target"
              hint={`Worked out from a BMR of ${preview.bmr} kcal and a maintenance of ${preview.tdee} kcal.`}
            >
              <div className="text-center">
                <div className="font-display text-5xl font-bold text-neon-green">{preview.kcal}</div>
                <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.3em] text-zinc-500">
                  kcal per day{preview.isEstimate ? " · estimated" : ""}
                </div>
              </div>

              <dl className="mt-6 grid grid-cols-3 gap-2">
                {[
                  { label: "Protein", value: `${preview.proteinG} g`, cls: "text-neon-green" },
                  { label: "Carbs", value: `${preview.carbsG} g`, cls: "text-neon-blue" },
                  { label: "Fat", value: `${preview.fatG} g`, cls: "text-neon-amber" },
                ].map((m) => (
                  <div key={m.label} className="rounded-xl border border-edge bg-void p-3 text-center">
                    <dd className={cn("font-display text-lg font-bold", m.cls)}>{m.value}</dd>
                    <dt className="mt-0.5 font-mono text-[9px] uppercase tracking-widest text-zinc-500">
                      {m.label}
                    </dt>
                  </div>
                ))}
              </dl>

              <p className="mt-3 text-center font-mono text-[10px] uppercase tracking-widest text-zinc-600">
                {preview.fiberG} g fibre · {(preview.waterMl / 1000).toFixed(1)} L water
              </p>
            </SectionCard>

            {notes.length > 0 && (
              <ul className="space-y-2">
                {notes.map((n) => (
                  <li
                    key={n}
                    className="rounded-xl border border-neon-amber/30 bg-neon-amber/5 px-3 py-2.5 font-mono text-[11px] leading-relaxed text-zinc-300"
                  >
                    {n}
                  </li>
                ))}
              </ul>
            )}

            <p className="px-1 font-mono text-[10px] leading-relaxed text-zinc-600">
              These are estimates, not medical advice. If you&apos;re managing a health condition,
              pregnant, or have a history of disordered eating, talk to a doctor or dietitian before
              following any calorie target.
            </p>

            {failure && (
              <p role="alert" className="font-mono text-[11px] text-neon-crimson">
                {failure}
              </p>
            )}
          </>
        )}
      </div>

      {/* ── navigation ─────────────────────────────────────────────── */}
      <div className="mt-6 flex items-center gap-3">
        {step > 0 && (
          <button
            type="button"
            onClick={() => setStep((s) => s - 1)}
            className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-edge px-4 font-mono text-[11px] uppercase tracking-widest text-zinc-400 transition-colors hover:text-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hot-green"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </button>
        )}

        {step < STEPS.length - 1 ? (
          <button
            type="button"
            disabled={!canAdvance}
            onClick={() => setStep((s) => s + 1)}
            className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl border border-hot-green bg-hot-green/10 px-4 font-mono text-[11px] uppercase tracking-widest text-neon-green transition-colors hover:bg-hot-green/20 disabled:cursor-not-allowed disabled:border-edge disabled:bg-transparent disabled:text-zinc-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hot-green"
          >
            Next <ArrowRight className="h-3.5 w-3.5" />
          </button>
        ) : (
          <button
            type="button"
            disabled={saving}
            onClick={save}
            className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl border border-hot-green bg-hot-green/10 px-4 font-mono text-[11px] uppercase tracking-widest text-neon-green transition-colors hover:bg-hot-green/20 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hot-green"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flame className="h-4 w-4" />}
            {saving ? "Saving" : "Start tracking"}
          </button>
        )}
      </div>
    </div>
  );
}
