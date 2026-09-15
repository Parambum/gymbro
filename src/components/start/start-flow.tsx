"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Loader2, Sparkles } from "lucide-react";
import { ChoiceGrid, DateField, NumberField, SectionCard, type Choice } from "@/components/fuel/controls";
import {
  EQUIPMENT_LIST,
  EXPERIENCE_LIST,
  GOAL_LIST,
  engineInputsFor,
  goalDef,
  type Equipment,
  type Experience,
  type FitnessGoal,
} from "@/lib/fuel/goals";
import { ageOn, computeTargets } from "@/lib/fuel/engine";
import { generateProgramme } from "@/lib/training/program";
import { ACTIVITY_LEVELS, type ActivityLevel, type DietPref } from "@/lib/fuel/types";
import { todayIso } from "@/lib/date-utils";
import { cn } from "@/lib/utils";

/**
 * Guided setup for someone who has never used the app.
 *
 * Six short steps, then a plan. The order is deliberate: the questions people
 * can answer without thinking come first, and the one that actually shapes
 * everything — what are you trying to do — comes once they're already moving.
 *
 * The preview on the last step is computed with the *same* pure functions the
 * server runs on save, so what they agree to is what gets stored.
 */

const STEPS = ["You", "Your body", "Goal", "Training", "Food", "Your plan"] as const;

const SEX_CHOICES: ReadonlyArray<Choice<"male" | "female" | "unspecified">> = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "unspecified", label: "Rather not say", blurb: "We'll average the two and mark it an estimate" },
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

const GOAL_CHOICES: ReadonlyArray<Choice<FitnessGoal>> = GOAL_LIST.map((g) => ({
  value: g.slug,
  label: g.label,
  blurb: g.blurb,
}));

const EXPERIENCE_CHOICES: ReadonlyArray<Choice<Experience>> = EXPERIENCE_LIST.map((e) => ({
  value: e.slug,
  label: e.label,
  blurb: e.blurb,
}));

const EQUIPMENT_CHOICES: ReadonlyArray<Choice<Equipment>> = EQUIPMENT_LIST.map((e) => ({
  value: e.slug,
  label: e.label,
  blurb: e.blurb,
}));

export function StartFlow() {
  const router = useRouter();
  const today = todayIso();

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const [sex, setSex] = useState<"male" | "female" | "unspecified">("male");
  const [birthDate, setBirthDate] = useState("2000-01-01");
  const [heightCm, setHeightCm] = useState(175);
  const [weightKg, setWeightKg] = useState(70);
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>("moderate");
  const [fitnessGoal, setFitnessGoal] = useState<FitnessGoal>("tone-up");
  const [experience, setExperience] = useState<Experience>("beginner");
  const [equipment, setEquipment] = useState<Equipment>("full-gym");
  const [daysPerWeek, setDaysPerWeek] = useState(4);
  const [sessionMinutes, setSessionMinutes] = useState(60);
  const [dietPref, setDietPref] = useState<DietPref>("veg");

  const age = ageOn(birthDate, today);
  const ageValid = age >= 13 && age <= 100;

  const goal = goalDef(fitnessGoal);

  const preview = useMemo(() => {
    const engine = engineInputsFor(fitnessGoal, weightKg);
    return computeTargets({
      sex,
      ageYears: age,
      heightCm,
      weightKg,
      activityLevel,
      goal: engine.goal,
      rateKgPerWeek: engine.rateKgPerWeek,
      macroPreset: engine.macroPreset,
    });
  }, [sex, age, heightCm, weightKg, activityLevel, fitnessGoal]);

  const programme = useMemo(
    () => generateProgramme({ goal: fitnessGoal, experience, equipment, daysPerWeek, sessionMinutes }),
    [fitnessGoal, experience, equipment, daysPerWeek, sessionMinutes],
  );

  const canAdvance = step !== 1 || (ageValid && heightCm > 0 && weightKg > 0);

  async function save() {
    setSaving(true);
    setFailure(null);
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sex,
          birthDate,
          heightCm,
          weightKg,
          activityLevel,
          fitnessGoal,
          experience,
          equipment,
          daysPerWeek,
          sessionMinutes,
          dietPref,
          tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata",
          localDate: todayIso(),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setFailure(json.error ?? "Could not build your plan.");
        return;
      }
      router.push("/plan");
      router.refresh();
    } catch {
      setFailure("No connection. Check your network and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-lg px-4 pb-16 pt-8">
      <header className="mb-8">
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.3em] text-accent-ink">
          <Sparkles className="h-3.5 w-3.5" />
          Build my plan
        </div>
        <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-ink">
          {STEPS[step]}
        </h1>

        <div className="mt-5 flex items-center gap-1.5" aria-hidden>
          {STEPS.map((s, i) => (
            <span
              key={s}
              className={cn(
                "h-1 flex-1 rounded-full transition-colors",
                i <= step ? "bg-accent" : "bg-border",
              )}
            />
          ))}
        </div>
        <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-faint">
          Step {step + 1} of {STEPS.length}
        </p>
      </header>

      <div className="space-y-4">
        {step === 0 && (
          <SectionCard title="Tell us who's training" hint="This is what the calorie maths runs on. Everything is editable later.">
            <div className="space-y-4">
              <ChoiceGrid label="Sex" options={SEX_CHOICES} value={sex} onChange={setSex} columns={1} />
              <DateField
                label="Date of birth"
                value={birthDate}
                onChange={setBirthDate}
                max={today}
                error={ageValid ? null : "Enter a date of birth between 13 and 100 years ago"}
              />
            </div>
          </SectionCard>
        )}

        {step === 1 && (
          <SectionCard title="Your body" hint="Rough is fine — the app corrects itself from your data as you log.">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <NumberField label="Height" value={heightCm} onChange={setHeightCm} unit="cm" min={80} max={250} />
                <NumberField label="Weight" value={weightKg} onChange={setWeightKg} unit="kg" min={20} max={400} step={0.5} decimals />
              </div>
              <ChoiceGrid
                label="How much do you move, outside training?"
                options={ACTIVITY_CHOICES}
                value={activityLevel}
                onChange={setActivityLevel}
                columns={1}
              />
            </div>
          </SectionCard>
        )}

        {step === 2 && (
          <SectionCard title="What are you after?" hint="Pick the one that sounds most like you.">
            <ChoiceGrid label="Goal" options={GOAL_CHOICES} value={fitnessGoal} onChange={setFitnessGoal} columns={1} />
            <p className="mt-4 rounded-xl border border-accent/30 bg-accent/5 px-3 py-2.5 font-mono text-[11px] leading-relaxed text-ink">
              {goal.expectation}
            </p>
          </SectionCard>
        )}

        {step === 3 && (
          <SectionCard title="How you train" hint="Be honest about the days — a plan you skip isn't a plan.">
            <div className="space-y-4">
              <ChoiceGrid label="Experience" options={EXPERIENCE_CHOICES} value={experience} onChange={setExperience} columns={1} />
              <ChoiceGrid label="What you can train with" options={EQUIPMENT_CHOICES} value={equipment} onChange={setEquipment} columns={1} />
              <div className="grid grid-cols-2 gap-3">
                <NumberField label="Days a week" value={daysPerWeek} onChange={setDaysPerWeek} unit="days" min={2} max={6} />
                <NumberField label="Time per session" value={sessionMinutes} onChange={setSessionMinutes} unit="min" min={20} max={180} step={5} />
              </div>
            </div>
          </SectionCard>
        )}

        {step === 4 && (
          <SectionCard title="How you eat" hint="Used to filter every food suggestion and meal plan.">
            <ChoiceGrid label="Diet" options={DIET_CHOICES} value={dietPref} onChange={setDietPref} columns={3} />
          </SectionCard>
        )}

        {step === 5 && (
          <>
            <SectionCard
              title="Your daily target"
              hint={`From a BMR of ${preview.bmr} kcal and a maintenance of ${preview.tdee} kcal.`}
            >
              <div className="text-center">
                <div className="font-display text-5xl font-bold text-accent">{preview.kcal}</div>
                <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.3em] text-muted">
                  kcal per day{preview.isEstimate ? " · estimated" : ""}
                </div>
              </div>
              <dl className="mt-6 grid grid-cols-3 gap-2">
                {[
                  { label: "Protein", value: `${preview.proteinG} g` },
                  { label: "Carbs", value: `${preview.carbsG} g` },
                  { label: "Fat", value: `${preview.fatG} g` },
                ].map((m) => (
                  <div key={m.label} className="rounded-xl border border-border bg-bg p-3 text-center">
                    <dd className="font-display text-lg font-bold text-ink">{m.value}</dd>
                    <dt className="mt-0.5 font-mono text-[9px] uppercase tracking-widest text-muted">
                      {m.label}
                    </dt>
                  </div>
                ))}
              </dl>
              {preview.notes.map((n) => (
                <p key={n} className="mt-3 rounded-xl border border-warn/30 bg-warn/5 px-3 py-2.5 font-mono text-[11px] leading-relaxed text-ink">
                  {n}
                </p>
              ))}
            </SectionCard>

            <SectionCard
              title="Your training week"
              hint={`${programme.sessions.length} sessions · ${goal.emphasis} focus`}
            >
              <ul className="space-y-2">
                {programme.sessions.map((s) => (
                  <li key={s.name} className="rounded-xl border border-border bg-bg p-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-display text-sm font-semibold text-ink">{s.name}</span>
                      <span className="font-mono text-[10px] uppercase tracking-widest text-faint">
                        ~{s.estimatedMinutes} min
                      </span>
                    </div>
                    <p className="mt-1 font-mono text-[10px] leading-relaxed text-muted">
                      {s.exercises.map((e) => e.exercise).join(" · ")}
                    </p>
                  </li>
                ))}
              </ul>
              {programme.notes.map((n) => (
                <p key={n} className="mt-3 font-mono text-[10px] leading-relaxed text-faint">
                  {n}
                </p>
              ))}
            </SectionCard>

            <p className="px-1 font-mono text-[10px] leading-relaxed text-faint">
              Estimates, not medical advice. If you&apos;re managing a health condition,
              pregnant, or have a history of disordered eating, talk to a doctor or dietitian
              before following a calorie target.
            </p>

            {failure && (
              <p role="alert" className="font-mono text-[11px] text-danger">
                {failure}
              </p>
            )}
          </>
        )}
      </div>

      <div className="mt-6 flex items-center gap-3">
        {step > 0 && (
          <button
            type="button"
            onClick={() => setStep((s) => s - 1)}
            className="flex min-h-[48px] items-center gap-1.5 rounded-xl border border-border px-4 font-mono text-[11px] uppercase tracking-widest text-muted transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </button>
        )}

        {step < STEPS.length - 1 ? (
          <button
            type="button"
            disabled={!canAdvance}
            onClick={() => setStep((s) => s + 1)}
            className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 font-display text-sm font-semibold uppercase tracking-widest text-bg transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Next <ArrowRight className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            disabled={saving}
            onClick={save}
            className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 font-display text-sm font-semibold uppercase tracking-widest text-bg transition-transform hover:scale-[1.01] disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {saving ? "Building" : "Build my plan"}
          </button>
        )}
      </div>
    </div>
  );
}
