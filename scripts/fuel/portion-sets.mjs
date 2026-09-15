/**
 * Household portion conventions, Indian-first.
 *
 * These gram values describe **how big a typical serving is**, not what is in
 * it. They come from the standard household-measure tables used in Indian
 * dietetics — a katori is a katori whatever you put in it. Nutrition figures,
 * by contrast, are never written by hand: they are fetched from USDA by
 * `import-usda.mjs`.
 *
 * Grams are deliberately the *last* option on every food (§6): a user logging
 * dal thinks "one katori", and the gram equivalent is shown underneath so the
 * mapping gets learned instead of demanded.
 */

/** @typedef {{ label: string, grams: number, unit: "g" | "ml" | "household" }} PortionTemplate */

/** @type {Record<string, PortionTemplate[]>} */
export const PORTION_SETS = {
  // Dal, sabzi, curry, curd — anything eaten out of a small steel bowl.
  katori: [
    { label: "1 katori (small)", grams: 150, unit: "household" },
    { label: "1 katori (medium)", grams: 200, unit: "household" },
    { label: "1 katori (large)", grams: 250, unit: "household" },
  ],
  riceServing: [
    { label: "1 katori (medium)", grams: 200, unit: "household" },
    { label: "1 plate", grams: 300, unit: "household" },
    { label: "1 cup, cooked", grams: 158, unit: "household" },
  ],
  flatbread: [
    { label: "1 roti / chapati", grams: 40, unit: "household" },
    { label: "1 large roti", grams: 55, unit: "household" },
    { label: "1 paratha", grams: 65, unit: "household" },
  ],
  idli: [
    { label: "1 idli", grams: 40, unit: "household" },
    { label: "2 idli", grams: 80, unit: "household" },
  ],
  dosa: [
    { label: "1 dosa", grams: 80, unit: "household" },
    { label: "1 masala dosa", grams: 150, unit: "household" },
  ],
  bread: [
    { label: "1 slice", grams: 28, unit: "household" },
    { label: "2 slices", grams: 56, unit: "household" },
  ],
  glass: [
    { label: "1 glass", grams: 200, unit: "ml" },
    { label: "1 small glass", grams: 150, unit: "ml" },
    { label: "1 cup", grams: 240, unit: "ml" },
  ],
  spoonFat: [
    { label: "1 tsp", grams: 5, unit: "household" },
    { label: "1 tbsp", grams: 14, unit: "household" },
  ],
  spoonSugar: [
    { label: "1 tsp", grams: 5, unit: "household" },
    { label: "1 tbsp", grams: 12, unit: "household" },
  ],
  egg: [
    { label: "1 egg (medium)", grams: 50, unit: "household" },
    { label: "1 egg (large)", grams: 60, unit: "household" },
    { label: "1 egg white", grams: 33, unit: "household" },
  ],
  meatPortion: [
    { label: "1 piece (100 g)", grams: 100, unit: "household" },
    { label: "1 small serving", grams: 75, unit: "household" },
    { label: "1 large serving", grams: 150, unit: "household" },
  ],
  whey: [
    { label: "1 scoop", grams: 30, unit: "household" },
    { label: "2 scoops", grams: 60, unit: "household" },
  ],
  dryCereal: [
    { label: "1 katori, dry", grams: 40, unit: "household" },
    { label: "1 cup, dry", grams: 80, unit: "household" },
    { label: "1 bowl, cooked", grams: 200, unit: "household" },
  ],
  nutButter: [
    { label: "1 tbsp", grams: 16, unit: "household" },
    { label: "2 tbsp", grams: 32, unit: "household" },
  ],
  nuts: [
    { label: "1 handful (~15)", grams: 20, unit: "household" },
    { label: "1 katori (small)", grams: 60, unit: "household" },
  ],
  wholeFruit: [
    { label: "1 medium", grams: 150, unit: "household" },
    { label: "1 small", grams: 100, unit: "household" },
    { label: "1 large", grams: 200, unit: "household" },
  ],
  banana: [
    { label: "1 medium", grams: 118, unit: "household" },
    { label: "1 small", grams: 90, unit: "household" },
  ],
  paneerCube: [
    { label: "1 katori (small)", grams: 150, unit: "household" },
    { label: "50 g (4–5 cubes)", grams: 50, unit: "g" },
  ],
  // Anything with no natural household unit — logged by weight alone.
  weightOnly: [],
};

/** Appended to every food so a kitchen scale is always an option. */
export const GRAM_FALLBACK = { label: "100 g", grams: 100, unit: "g" };

/**
 * The full, ordered portion list for a food: household units first, grams
 * last. The first entry becomes `isDefault` — which is the whole point of §6.
 *
 * @param {string} setName
 * @returns {Array<PortionTemplate & { isDefault: boolean, sortOrder: number }>}
 */
export function portionsFor(setName) {
  const set = PORTION_SETS[setName];
  if (!set) throw new Error(`Unknown portion set: ${setName}`);
  return [...set, GRAM_FALLBACK].map((p, i) => ({
    ...p,
    isDefault: i === 0,
    sortOrder: i,
  }));
}
