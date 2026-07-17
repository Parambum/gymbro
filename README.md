# PROGRESS-O-METER

**FitNotes × Strava, rendered in neon.** Strength logging with an interactive 3D
anatomy hub, endurance telemetry with Strava-style splits and Relative Effort,
and a Smart Progression engine that charts Epley e1RM instead of lying
absolute-weight lines.

```
Next.js 15 (App Router) · React 19 · TypeScript strict · Tailwind
React Three Fiber + drei + postprocessing (bloom) · motion (Framer)
Recharts · Zustand · Prisma · PostgreSQL · Zod
```

---

## Quick start

```bash
npm install
npm run dev          # runs immediately — no DB needed (demo-data fallback)
```

Full persistence (PostgreSQL):

```bash
cp .env.example .env         # point DATABASE_URL at your Postgres
npm run db:push              # create schema
npm run db:seed              # 180 exercises + 10 weeks of demo history
npm run dev
```

Every API route falls back to deterministic demo fixtures when the database is
unreachable, so the UI is always fully populated. `GET` responses carry a
`source: "db" | "demo"` field.

## The Smart Progression thesis

Absolute weight is a lying metric. 30 kg × 10 in week 1 vs 30 kg × 14 in week 3
is real progress that a weight-only chart renders flat. Every set is normalized
at write time to its **Epley e1RM**:

```
e1RM = w · (1 + r / 30)
```

The analytics chart plots daily-best e1RM with a least-squares trendline
overlay, and its tooltip explains the *mechanics* of each move:
`Progress: +11.3% e1RM via volume overload` vs `via load increase`.
Implementation: [e1rm.ts](src/lib/math/e1rm.ts), [regression.ts](src/lib/math/regression.ts).

Cardio gets equal depth: **Relative Effort** is a Banister-TRIMP score from
duration × heart-rate reserve (zone-weighted variant included), pace/splits math
is Strava-style per-km. Implementation:
[relative-effort.ts](src/lib/math/relative-effort.ts), [pace.ts](src/lib/math/pace.ts).

## Architecture map

```
src/
├── app/
│   ├── page.tsx                    Landing — BackgroundBeams + DecryptedText hero
│   ├── dashboard/page.tsx          BentoGrid: streak, last session, PR vault,
│   │                               weekly volume + effort charts, quick-log CTA
│   ├── train/page.tsx              ← THE 3D HUB (client, dynamic ssr:false)
│   ├── cardio/page.tsx             Telemetry form + intensity-glow history cards
│   ├── analytics/page.tsx          e1RM area chart + trendline + stat tiles + table view
│   └── api/
│       ├── sets/route.ts           POST — e1RM computed server-side, PR upsert
│       ├── cardio/route.ts         GET/POST — sessions + auto km splits
│       ├── dashboard/route.ts      GET — streak/PR/weekly aggregates
│       └── analytics/e1rm/route.ts GET — daily-best e1RM series (indexed scan)
│
├── components/
│   ├── three/                      R3F layer
│   │   ├── anatomy-config.ts       9 muscle zones: primitive meshes + camera poses
│   │   ├── anatomy-model.tsx       low-poly figure; hover=glow, click=select
│   │   ├── camera-rig.tsx          damped focus flight; releases on user orbit
│   │   └── anatomy-canvas.tsx      Canvas + lights + grid floor + Bloom pass
│   ├── ui/                         Aceternity-style kit
│   │   ├── bento-grid.tsx          dashboard skeleton
│   │   ├── background-beams.tsx    landing ambience
│   │   ├── wavy-background.tsx     empty-state ambience (simplex noise)
│   │   ├── hover-border-gradient.tsx  orbiting-spark CTA borders
│   │   └── glow-card.tsx           spotlight card; glow scales with intensity
│   ├── reactbits/                  micro-interactions
│   │   ├── decrypted-text.tsx      PR unlock scramble
│   │   ├── magnetic-button.tsx     spring-physics LOG SET trigger
│   │   └── count-up.tsx            stat tick-up on scroll into view
│   ├── strength/
│   │   ├── strength-panel.tsx      zone-filtered exercise picker (20/group)
│   │   └── set-logger.tsx          steppers + tag chips + optimistic sync + PR banner
│   ├── cardio/
│   │   ├── cardio-config.ts        activity/run-type definitions
│   │   ├── telemetry-form.tsx      live pace + Relative Effort preview
│   │   └── session-card.tsx        effort-band glow history card
│   └── charts/                     Recharts, validated palette only
│
├── store/
│   ├── anatomy-store.ts            hovered/selected zone + camera focus token
│   └── session-store.ts            optimistic set log + PR celebration
│
└── lib/
    ├── math/                       e1rm · regression · relative-effort · pace
    ├── data/exercise-catalog.ts    9 groups × 20 = 180 exercises (single source)
    ├── data/demo-data.ts           deterministic no-DB fixtures
    ├── chart-palette.ts            CVD-validated series colors (see below)
    └── prisma.ts / api-helpers.ts
```

### How the 3D hub wires into state

```
click mesh ──► useAnatomyStore.select(slug) ──► camera-rig damps to zone pose
                        │
                        └─► strength-panel filters catalog to that group
                                  └─► pick exercise ─► set-logger
                                            └─► useSessionStore.logSet()  (instant)
                                                      └─► POST /api/sets  (async)
                                                                └─► isPR? ─► DecryptedText banner
```

The Zustand store is the only bridge between the WebGL canvas and the DOM —
no props cross the boundary, so the canvas never re-renders on panel state.
A chip row under the canvas drives the same `select()` for keyboard and
screen-reader users.

## Data model highlights

- `WorkoutSet.e1rm` is **denormalized at write time** — the analytics endpoint
  is one indexed range scan (`@@index([exerciseId, performedAt])`) + a per-day
  max fold. No recomputation at read time, ever.
- `Workout` has `@@unique([userId, date])` — one container per training day,
  upserted on first set, so "rapid logging" needs zero session bootstrapping.
- `PersonalRecord` is an upserted singleton per (user, exercise): the current
  best, checked against on every non-warmup set write.
- `CardioSession.relativeEffort` likewise computed once, indexed by
  `(userId, date)` for feed queries; `CardioSplit` rows hold per-km telemetry.

## Chart palette — validated, don't eyeball

Series colors passed a 6-check colorblind-safety validator (OKLCH lightness
band, chroma floor, CVD ΔE separation, normal-vision floor, WCAG contrast)
against the app surface `#0a0a14`:

| Chart | Series | Hex |
|---|---|---|
| Strength | e1RM | `#8b5cf6` |
| Strength | Volume | `#16a34a` |
| Cardio | Pace | `#0284c7` |
| Cardio | Effort | `#f43f5e` |
| Any | Trendline | `#9ca3af` (neutral ink, never a third hue) |

The hotter neons (`hot.*` in [tailwind.config.ts](tailwind.config.ts)) are
UI glow/border accents **only** — never chart marks. Rules live in
[chart-palette.ts](src/lib/chart-palette.ts).

## Deliberate scope cuts

- **Auth**: single-operator (`getOperator()` in
  [api-helpers.ts](src/lib/api-helpers.ts)) — swap for a session lookup when
  adding accounts. The schema is already multi-user.
- **Units**: metric canonical (kg / m / s); `kgToLb`, `kmToMi` converters ship
  in [pace.ts](src/lib/math/pace.ts) for a display-preference layer.
- **GPS ingest**: splits are even-pace synthesized on manual entry;
  `splitsFromDurations()` accepts real per-km telemetry when a GPX/FIT
  importer lands.

## Scripts

| Command | Effect |
|---|---|
| `npm run dev` | dev server (demo fallback without DB) |
| `npm run build` / `start` | production |
| `npm run typecheck` | strict TS across app + seed |
| `npm run db:push` | apply schema to Postgres |
| `npm run db:seed` | 180 exercises + demo history (idempotent) |
| `npm run db:studio` | Prisma Studio |
