# Food data sources

The food database is assembled from two public sources. Neither is written by
hand, and both carry obligations that survive into production. Read this before
changing an importer.

## USDA FoodData Central — `fuel-foods.json`

13,294 foods from the SR Legacy, FNDDS and Foundation bulk exports.

- **Licence:** public domain (17 U.S.C. §105). No attribution required, no
  restriction on use.
- **Built by:** `npm run fuel:import` (`scripts/import-usda.mjs`)
- **Seeded with:** `isVerified: true` — these come from a published composition
  table, which is what that flag means.

## Open Food Facts — `fuel-foods-india.json`

3,047 packaged products sold in India, across 1,181 brands, each with a
barcode. This is what makes the scanner useful and what makes the database feel
Indian rather than American: Amul, Britannia, Haldiram's, Parle, Maggi, MTR,
Saffola, Aashirvaad, Patanjali, MuscleBlaze.

- **Licence:** [Open Database License v1.0 (ODbL)](https://opendatacommons.org/licenses/odbl/1-0/)
- **Built by:** `npm run fuel:import:india` (`scripts/import-off-india.mjs`)
- **Seeded with:** `isVerified: false` — Open Food Facts is crowd-sourced from
  photographs of labels. The numbers are usually right and occasionally
  nonsense, so the UI badges them. **Do not flip this to true.**

### What the ODbL requires of us

The ODbL is share-alike for the **database**, not for the application that
queries it. GymBro can stay closed-source and be sold. Three things are
required, and all three are satisfied today:

1. **Attribution.** This file, plus the credit shown in the app wherever an
   Open Food Facts row is displayed.
2. **Share-alike on the data.** If a *modified version of the database itself*
   is published, that publication must be under the ODbL. Serving it inside the
   app is not publishing it.
3. **Keep it open.** No technical measure may restrict others from using the
   data as the licence allows.

This is materially different from the AGPL, which would reach the application.
See the note on IFCT below.

## What is deliberately absent

**IFCT 2017** (Indian Food Composition Tables, NIN/ICMR) is the right source for
*home-cooked* Indian dishes — dal, sabzi, regional preparations — which neither
source above covers well. USDA carries roughly 80 Indian dishes; Open Food Facts
carries essentially none, because it is a packaged-goods database.

The convenient machine-readable copy is the npm package `ifct2017`, which is
**AGPL-3.0**. Section 13 of that licence reaches users interacting with the
software over a network, so importing it into a deployed web app would oblige
publishing GymBro's entire source. That is a commercial decision, not an
engineering one, and it has not been made — so the package is not a dependency
and the data is not vendored.

If Indian dish coverage is wanted, the options are:

- accept the AGPL and open-source the app;
- license IFCT data directly from NIN;
- or curate dishes by hand from published per-100 g figures, citing each one.

That gap is now filled differently — by INDB, below, which is a separate
publication of *recipe-level* results computed from IFCT, not the IFCT tables
themselves, and is not under the AGPL.

## Indian Nutrient Databank (INDB) — `fuel-foods-indb.json`

847 home-cooked Indian recipes (of 1,014) with nutrients per 100 g and a
per-serving figure, computed by Anuvaad Solutions from IFCT 2017 ingredient
data with nutrient retention factors.

- **Citation:** Vijayakumar A. et al., *Development of an Indian Food
  Composition Database*, Current Developments in Nutrition, 2024
  (open access, CC BY 4.0). Data: Anuvaad Solutions, INDB 2024.11.
- **Licence:** the spreadsheet carries no licence of its own. The paper is
  CC BY 4.0, and states the databank "can be used by researchers, the
  government, and the private and third sectors". Attribution is given here
  and wherever the app names the source. **This is a reading of published
  intent, not a licence grant** — if GymBro is sold, confirming terms with
  Anuvaad (awasthi@anuvaad.org.in) is the owner's call.
- **Built by:** `npm run fuel:import:indb` (`scripts/import-indb.mjs`)
- **Seeded with:** `isVerified: true` — it is a published composition
  database, which is what the flag means.

### Known limits, and what the importer does about them

INDB is *calculated* from recipes, not analysed, and inherits two systematic
errors from that:

1. **Deep-fried dishes count all the frying oil as eaten.** Its potato samosa
   is 577 kcal / 59 g fat per 100 g; a lab-analysed samosa (USDA FNDDS) is
   310 kcal / 17 g. The importer **drops** every row above 35 g fat/100 g
   (131 rows) and every row whose energy disagrees with its own 4/4/9 macros
   by more than 20% (36 rows). Dropped, not corrected: correcting would be
   inventing numbers.
2. **Water lost to long cooking is not removed**, so reduced dishes (kheer,
   kulfi, lassi) come out low. These rows are kept — they are not impossible,
   only lean — but where USDA has an analysed equivalent, the photo model
   prefers it (see `scripts/fuel/vision-classes.mjs`).

## On-device food model — `public/models/food-v1/`

The Snap-a-meal classifier. Built by `ml/food-vision/` (see its README).

- **Backbone:** DINOv2 ViT-S/14 (`facebook/dinov2-small`), Meta AI,
  **Apache-2.0**. Frozen; only the classification head is trained here.
  MobileCLIP was benchmarked out on licence: its weights are under Apple's
  research-only model licence.
- **Training images:**
  - *Food-101* (Bossard, Guillaumin & Van Gool, ETH Zürich, 2014) — 101 dishes,
    101,000 photos originally from foodspotting.com. Distributed for research;
    the photos themselves are not redistributed by GymBro and are not in the
    shipped file, which holds learned weights only. Whether training a
    commercial product's weights on it is acceptable is a judgement call for
    the owner, the same as for most food models in production.
  - *Enhanced Indian Food Classification* (`kidKrish/enhanced-indian-food-classification`
    on Hugging Face, duplicated from SohlHealth) — 43 Indian dishes, 15,404
    photos, **CC BY 4.0**.
  - *Khana* (131k Indian food photos) was considered and **excluded**: its
    terms are non-commercial research and education only.
- **What it knows:** 139 dishes. Anything else falls back to search, barcode
  or typing — the app says so rather than force a wrong label.
