# GYMBRO

**A serious tool for serious progression.** Multi-user strength-training tracker:
click a muscle on a 3D anatomy model to log it, build your own exercises, and
watch true progress unfold through Epley e1RM analytics — never absolute weight,
which lies about volume gains.

```
Next.js 15 (App Router) · React 19 · TypeScript strict · Tailwind
Auth.js v5 (credentials + optional Google) · MongoDB + Mongoose
React Three Fiber + drei + postprocessing (bloom) · motion (Framer)
Recharts · Zustand · Zod · bcryptjs
```

> **Phase 1 — Gym/Strength only.** Cardio/running is intentionally out of scope
> for this phase; the whole surface is focused on perfecting strength tracking.

---

## Quick start

```bash
npm install
cp .env.example .env         # then fill in MONGODB_URI + AUTH_SECRET (below)
npm run dev                  # http://localhost:3000
```

**MongoDB Atlas** — create a free cluster at <https://cloud.mongodb.com>, add a
DB user, allow your IP, copy the driver connection string (append `/gymbro`), and
paste it as `MONGODB_URI`.

**Auth secret** — `npx auth secret` (or `openssl rand -base64 33`) → `AUTH_SECRET`.

**Google sign-in** *(optional)* — set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
to light up the "Continue with Google" button; leave blank to hide it.

## The blank-slate rule

There is **zero dummy, seed, or demo data** for user logs anywhere in this
codebase. A new account's dashboard, analytics, and history all initialize
empty and say so ("Your slate is blank", "Log your first Chest workout to
generate analytics") until the user logs a real set. The only pre-populated
content is the **base exercise library** (180 standard lifts in
[exercise-catalog.ts](src/lib/data/exercise-catalog.ts)) — reference definitions,
not logged data — which users extend with their own custom exercises.

## The progression thesis

Absolute weight is a lying metric. 30 kg × 10 vs 30 kg × 14 is real progress a
weight-only chart renders flat. Every set is normalized at write time to its
**Epley e1RM**:

```
e1RM = w · (1 + r / 30)
```

The analytics chart plots daily-best e1RM per muscle with a least-squares
trendline; a working set that beats the standing best fires a PR celebration.
Math in [e1rm.ts](src/lib/math/e1rm.ts) / [regression.ts](src/lib/math/regression.ts).

## Architecture map

```
src/
├── auth.ts / auth.config.ts        Auth.js v5 — split config so middleware stays
│                                   edge-safe; credentials validated in Node with
│                                   Mongoose + bcrypt; optional Google upserts to Mongo
├── middleware.ts                   gate /dashboard /train /analytics /history
│
├── models/                         Mongoose schemas
│   ├── User.ts                     email, name, bcrypt passwordHash, provider
│   ├── Exercise.ts                 user-created custom exercises (tied to userId)
│   └── Workout.ts                  ★ FLEXIBLE: one doc per (user, day), embedding a
│                                   bag of sets across whatever muscles were trained —
│                                   NOT a predefined split. e1rm denormalized per set.
│
├── app/
│   ├── page.tsx                    landing (auth-aware CTA)
│   ├── login / signup              Auth.js credential screens (wavy neon bg)
│   ├── dashboard/                  streak · last session · PR vault · body radar
│   │                               · volume — or the blank-slate hero
│   ├── train/                      ★ 3D anatomy hub → click a muscle → log modal
│   ├── analytics/                  muscle picker · e1RM chart + trendline · stats
│   │                               · per-exercise breakdown · body radar · empty states
│   ├── history/                    calendar (dots on logged days) + that day's sets
│   └── api/
│       ├── auth/[...nextauth]      Auth.js handler
│       ├── auth/register           POST — create credentials account (bcrypt)
│       ├── exercises               GET base+custom · POST custom exercise
│       ├── workouts                POST log set (PR check) · GET day
│       ├── workouts/dates          GET days-with-logs (calendar dots)
│       └── analytics/{muscle,overview}   aggregation pipelines (e1RM series, radar)
│
├── components/
│   ├── three/                      R3F: anatomy model, 9 muscle zones, 360° rig, bloom
│   ├── strength/                   log-modal · exercise-picker (+ add custom) · set-form
│   ├── charts/                     e1rm-chart (area + trendline) · body-radar · volume
│   ├── ui/                         bento · animated-modal · beams · wavy · glow · borders
│   ├── reactbits/                  decrypted-text (PR unlock) · magnetic-button · count-up
│   ├── history/calendar.tsx        custom month calendar
│   └── brand/gymbro-logo.tsx       the jacked-figure-with-shaker mark
│
├── store/                          Zustand: anatomy (hover/select/camera) · session (logging)
└── lib/                            math · db/mongoose · auth-helpers · validation · date-utils
```

### The click-to-log flow

```
click muscle mesh ─► anatomy-store.select(slug) ─► camera flies to zone
                              │
                              └─► LogModal opens, filtered to that muscle
                                    ├─ base library + your custom exercises (GET /api/exercises)
                                    ├─ "Add custom exercise" ─► POST /api/exercises (tied to userId)
                                    └─ pick one ─► SetForm ─► POST /api/workouts
                                                                 └─ isPR? ─► DecryptedText celebration
```

The Zustand stores are the only bridge between the WebGL canvas and the DOM, so
the canvas never re-renders on logging state. A chip row under the model drives
the same `select()` for keyboard / screen-reader users.

## Data model notes

- **`Workout` is deliberately split-free.** `{ userId, date, sets: [...] }` — a
  training day is just the sets performed, across any muscles. `@@unique(userId, date)`.
- **`WorkoutSet.e1rm` denormalized at write time** → analytics are indexed
  aggregation pipelines (`$unwind` → `$match` → `$group`), never read-time recompute.
- **`PersonalRecord`-style check**: each non-warmup set is compared against the
  standing max e1RM for that exercise via aggregation before insert.
- **`Exercise`** holds only user custom additions, unique per `(userId, muscle, name)`.

## Auth model

Auth.js v5 with a JWT session strategy. The **edge-safe** half
([auth.config.ts](src/auth.config.ts)) does route gating + id plumbing and is
imported by `middleware.ts`; the **Node** half ([auth.ts](src/auth.ts)) runs the
Credentials `authorize` (Mongoose + bcrypt) and the optional Google provider,
which upserts OAuth users into the same `users` collection so every query keys on
one identity. The MongoDB `_id` rides the JWT into `session.user.id`.

## Scripts

| Command | Effect |
|---|---|
| `npm run dev` | dev server |
| `npm run build` / `start` | production |
| `npm run typecheck` | strict TS, no emit |

## Verified

Built and driven end-to-end against a real MongoDB: signup → login → blank
dashboard → 3D click-to-log (incl. a custom exercise) → populated dashboard,
per-muscle analytics, body radar, and calendar history — all real writes, no
seeded data. e1RM math checks out (60 kg × 10 → 80.0, 100 kg × 9 → 130.0).
