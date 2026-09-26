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
