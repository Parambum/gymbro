/**
 * Which household portions a food gets, and what an Indian user calls it.
 *
 * The bulk USDA import gives breadth — thousands of foods with real
 * composition — but it describes them in American English ("Lentils, mature
 * seeds, cooked") and portions them in cups. This is the layer that makes that
 * database usable in India: katori and roti instead of cups, and the names
 * people actually type.
 *
 * Portion gram values are household conventions, not nutrition data. The
 * aliases are language, not data. Neither is invented composition.
 */

/** description pattern → portion set + Indian aliases. First match wins. */
export const FOOD_RULES = [
  // ── Indian staples & tiffin ──────────────────────────────────────
  // One rule per flatbread, not one rule for all of them. A shared alias list
  // put "roti" on naan and paratha, and since the ranker prefers the shorter
  // name, a search for roti returned naan.
  { test: /\bchapati|\broti\b/i, portions: "flatbread", aliases: ["roti", "chapati", "phulka", "atta roti"] },
  { test: /\bnaan\b/i, portions: "flatbread", aliases: ["naan"] },
  { test: /paratha|parantha/i, portions: "flatbread", aliases: ["paratha", "parantha"] },
  { test: /\bpuri\b|poori/i, portions: "flatbread", aliases: ["puri", "poori"] },
  { test: /flatbread/i, portions: "flatbread", aliases: [] },
  { test: /\bidli\b/i, portions: "idli", aliases: ["idli", "idly"] },
  { test: /\bdosa\b|dosai/i, portions: "dosa", aliases: ["dosa", "dosai"] },
  { test: /\buttapam|uthappam/i, portions: "dosa", aliases: ["uttapam"] },
  { test: /\bupma\b/i, portions: "katori", aliases: ["upma", "uppma"] },
  { test: /\bpoha\b|flattened rice|rice flakes/i, portions: "katori", aliases: ["poha", "aval"] },
  { test: /\bpaneer\b/i, portions: "paneerCube", aliases: ["paneer", "panir", "cottage cheese"] },
  { test: /\bsamosa\b/i, portions: "weightOnly", aliases: ["samosa", "singhara"] },
  { test: /\bpakora|bhaji|fritter/i, portions: "weightOnly", aliases: ["pakora", "bhajji"] },
  { test: /\bbiryani|\bpulao|pilaf/i, portions: "riceServing", aliases: ["biryani", "pulao"] },
  { test: /\bkhichdi|khichri/i, portions: "riceServing", aliases: ["khichdi"] },
  { test: /\bsambar\b/i, portions: "katori", aliases: ["sambar", "sambhar"] },
  { test: /\brasam\b/i, portions: "katori", aliases: ["rasam"] },
  { test: /\braita\b/i, portions: "katori", aliases: ["raita"] },
  { test: /\blassi\b|yogurt drink/i, portions: "glass", aliases: ["lassi"] },
  { test: /buttermilk/i, portions: "glass", aliases: ["chaas", "chhachh", "mattha"] },
  { test: /\bghee\b|butter oil, anhydrous/i, portions: "spoonFat", aliases: ["ghee", "desi ghee"] },
  { test: /\bjaggery\b/i, portions: "spoonSugar", aliases: ["gud", "gur"] },
  { test: /\bhalva|halwa/i, portions: "katori", aliases: ["halwa"] },
  { test: /gulab jamun/i, portions: "weightOnly", aliases: ["gulab jamun"] },
  { test: /\bjalebi\b/i, portions: "weightOnly", aliases: ["jalebi"] },
  { test: /\bkheer\b|rice pudding|payasam/i, portions: "katori", aliases: ["kheer", "payasam"] },
  { test: /\bdhokla\b/i, portions: "weightOnly", aliases: ["dhokla"] },
  { test: /pav bhaji/i, portions: "katori", aliases: ["pav bhaji"] },
  { test: /\bvada\b|\bwada\b/i, portions: "weightOnly", aliases: ["vada"] },

  // ── dals & legumes ───────────────────────────────────────────────
  { test: /pigeon pea/i, portions: "katori", aliases: ["toor dal", "arhar dal", "tur dal", "dhal", "daal", "dal"] },
  { test: /\bmung bean|\bmoong\b/i, portions: "katori", aliases: ["moong dal", "green gram", "dhal", "daal", "dal"] },
  { test: /\blentil/i, portions: "katori", aliases: ["masoor dal", "dal", "daal", "dhal", "lentil"] },
  { test: /chickpea|garbanzo|bengal gram/i, portions: "katori", aliases: ["chana", "chana dal", "kabuli chana", "chhole", "chole"] },
  { test: /kidney bean/i, portions: "katori", aliases: ["rajma", "rajmah"] },
  { test: /black gram|urad/i, portions: "katori", aliases: ["urad dal", "kali dal", "dhal"] },
  { test: /\bdal\b|\bdaal\b|\bdhal\b/i, portions: "katori", aliases: ["dal", "daal", "dhal"] },
  { test: /soy protein|textured vegetable protein/i, portions: "dryCereal", aliases: ["soya chunks", "nutrela", "meal maker"] },
  { test: /\btofu\b/i, portions: "paneerCube", aliases: ["tofu"] },
  { test: /sprouted/i, portions: "katori", aliases: ["sprouts", "ankurit"] },
  { test: /\bbeans?,|\bpeas,|\blentils?,/i, portions: "katori", aliases: [] },

  // ── grains ───────────────────────────────────────────────────────
  { test: /^rice|\brice,/i, portions: "riceServing", aliases: ["chawal", "bhaat", "rice"] },
  { test: /\bquinoa|\bcouscous|\bbulgur|\bmillet|\bbarley/i, portions: "riceServing", aliases: [] },
  { test: /\bpasta|spaghetti|macaroni|noodle|lasagna|penne|fusilli/i, portions: "riceServing", aliases: [] },
  { test: /\bbread\b|\btoast\b|\bbun\b|\bbagel|\bpita\b/i, portions: "bread", aliases: ["bread", "pav"] },
  { test: /\boats\b|oatmeal/i, portions: "dryCereal", aliases: ["oats", "oatmeal", "jai"] },
  { test: /semolina|\brava\b|\bsooji|\bsuji/i, portions: "dryCereal", aliases: ["suji", "rava", "sooji"] },
  { test: /\bflour\b|\batta\b|\bbesan\b/i, portions: "dryCereal", aliases: ["atta", "besan"] },
  { test: /cereals ready-to-eat|corn flakes|muesli|granola/i, portions: "dryCereal", aliases: ["cereal"] },

  // ── dairy & eggs ─────────────────────────────────────────────────
  { test: /^milk|\bmilk,/i, portions: "glass", aliases: ["doodh", "milk"] },
  { test: /\byogurt\b|\byoghurt\b|\bcurd\b|\bdahi\b/i, portions: "katori", aliases: ["dahi", "curd", "yogurt"] },
  { test: /\bcheese\b/i, portions: "bread", aliases: ["cheese"] },
  { test: /\bcream\b/i, portions: "spoonFat", aliases: ["malai", "cream"] },
  { test: /\bbutter\b/i, portions: "spoonFat", aliases: ["makhan", "butter"] },
  { test: /\begg\b|\beggs\b|omelet/i, portions: "egg", aliases: ["anda", "ande", "egg"] },

  // ── meat, poultry, fish ──────────────────────────────────────────
  { test: /\bchicken\b/i, portions: "meatPortion", aliases: ["chicken", "murgh"] },
  { test: /\bgoat\b|\bmutton\b|\blamb\b/i, portions: "meatPortion", aliases: ["mutton", "bakra"] },
  { test: /\bfish\b|\bsalmon\b|\btuna\b|\bcarp\b|\bpomfret/i, portions: "meatPortion", aliases: ["fish", "machli", "rohu"] },
  { test: /\bshrimp\b|\bprawn\b/i, portions: "meatPortion", aliases: ["prawn", "jhinga"] },
  { test: /\bbeef\b|\bpork\b|\bturkey\b/i, portions: "meatPortion", aliases: [] },

  // ── fats, nuts, sweeteners ───────────────────────────────────────
  { test: /^oil|\boil,|\boil\b/i, portions: "spoonFat", aliases: ["oil", "tel"] },
  { test: /peanut butter|nut butter/i, portions: "nutButter", aliases: ["peanut butter"] },
  { test: /\bnuts,|almond|cashew|walnut|pistachio|peanut/i, portions: "nuts", aliases: ["badam", "kaju", "akhrot", "moongfali"] },
  { test: /\bseeds,|\bchia\b|flaxseed/i, portions: "spoonSugar", aliases: ["alsi", "chia"] },
  { test: /\bsugar|\bhoney\b|\bsyrup\b/i, portions: "spoonSugar", aliases: ["cheeni", "shakkar", "shahad"] },

  // ── fruit & veg ──────────────────────────────────────────────────
  { test: /\bbanana/i, portions: "banana", aliases: ["kela", "banana"] },
  { test: /\bapple|\bmango|\borange|\bguava|\bpear\b|\bpeach/i, portions: "wholeFruit", aliases: ["seb", "aam", "santra", "amrood"] },
  { test: /\bgrapes|\bwatermelon|\bpapaya|\bpomegranate|\bberr(y|ies)/i, portions: "katori", aliases: ["angoor", "tarbooj", "papita", "anar"] },
  { test: /\bdates\b|\braisin/i, portions: "nuts", aliases: ["khajoor", "kishmish"] },
  { test: /spinach/i, portions: "katori", aliases: ["palak", "saag", "spinach"] },
  { test: /\bokra\b/i, portions: "katori", aliases: ["bhindi", "okra", "ladyfinger"] },
  { test: /eggplant|aubergine/i, portions: "katori", aliases: ["baingan", "brinjal"] },
  { test: /cauliflower/i, portions: "katori", aliases: ["gobi", "phool gobi"] },
  { test: /\bcabbage/i, portions: "katori", aliases: ["patta gobi"] },
  { test: /\bpotato/i, portions: "katori", aliases: ["aloo", "alu"] },
  { test: /\bonion/i, portions: "katori", aliases: ["pyaz", "kanda"] },
  { test: /\btomato/i, portions: "katori", aliases: ["tamatar"] },
  { test: /\bcarrot/i, portions: "katori", aliases: ["gajar"] },
  { test: /\bcucumber/i, portions: "katori", aliases: ["kheera", "kakdi"] },
  { test: /\bmushroom/i, portions: "katori", aliases: ["khumb"] },
  { test: /\bpepper, sweet|bell pepper|capsicum/i, portions: "katori", aliases: ["shimla mirch", "capsicum"] },

  // ── drinks ───────────────────────────────────────────────────────
  { test: /\btea\b/i, portions: "glass", aliases: ["chai", "tea"] },
  { test: /\bcoffee\b/i, portions: "glass", aliases: ["coffee"] },
  { test: /carbonated|\bcola\b|soft drink/i, portions: "glass", aliases: ["cold drink", "soft drink"] },
  { test: /\bjuice\b/i, portions: "glass", aliases: ["juice"] },
  { test: /coconut water/i, portions: "glass", aliases: ["nariyal pani"] },

  // ── prepared dishes, any cuisine ─────────────────────────────────
  { test: /\bcurry\b|\bmasala\b|\bkorma\b|\btikka\b|tandoori|\bkofta\b|vindaloo/i,
    portions: "katori", aliases: ["curry", "sabzi"] },
  { test: /\bsoup\b|\bstew\b|\bchili\b|\bdal\b/i, portions: "katori", aliases: [] },
  { test: /\bpizza\b/i, portions: "weightOnly", aliases: ["pizza"] },
  { test: /\btaco\b|burrito|quesadilla|enchilada/i, portions: "weightOnly", aliases: [] },
  { test: /\bsandwich|\bwrap\b|\bburger\b/i, portions: "weightOnly", aliases: [] },
  { test: /\bsalad\b/i, portions: "katori", aliases: ["salad"] },
  { test: /\bsnacks,|\bchips\b|\bcrackers\b|\bcookies\b|\bbiscuit/i, portions: "weightOnly", aliases: ["biscuit", "namkeen"] },
];

/** Vegetarian status, inferred from the description. */
export function inferVegFlag(description) {
  const d = description.toLowerCase();
  if (/\bchicken\b|\bbeef\b|\bpork\b|\bmutton\b|\bgoat\b|\blamb\b|\bfish\b|\bshrimp\b|\bprawn\b|\bturkey\b|\bbacon\b|\bham\b|\bsalmon\b|\btuna\b|\bmeat\b|\bgelatin\b|\banchov/.test(d)) {
    return "nonveg";
  }
  if (/\begg\b|\beggs\b|omelet|mayonnaise/.test(d)) return "egg";
  return "veg";
}

/** Portion set and aliases for a food, from its USDA description. */
export function classifyFood(description) {
  for (const rule of FOOD_RULES) {
    if (rule.test.test(description)) {
      return { portions: rule.portions, aliases: rule.aliases };
    }
  }
  return { portions: "weightOnly", aliases: [] };
}

/**
 * Shorten USDA's taxonomy-first descriptions into something a person would
 * recognise in a search result.
 *
 * "Lentils, mature seeds, cooked, boiled, with salt" is precise and unreadable.
 * The qualifiers after the first two clauses are almost always preparation
 * detail; keeping the first two and the cooking state reads far better in a
 * list without losing what the food actually is.
 */
/** Clauses that carry no meaning for a person picking food off a list. */
const NOISE = [
  /^all grades$/i,
  /^trimmed to [\d/"']+.*$/i,
  /^separable lean (and fat|only)$/i,
  /^includes?\b.*/i,
  /^upc:.*/i,
  /^gtin:.*/i,
  /^unprepared$/i,
  /^commercially prepared$/i,
  /^prepared from recipe$/i,
  /^nfs$/i,
  /^enriched$/i,
  /^unenriched$/i,
  /^with(out)? added (salt|vitamin|calcium).*/i,
  /^year \d+$/i,
];

export function tidyName(description) {
  const parts = description
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => !NOISE.some((re) => re.test(p)));

  if (parts.length === 0) return description.trim();

  // Keep enough clauses to stay distinguishable. Truncating harder reads
  // better in a list and silently merges a dozen cuts of beef into one
  // "Beef, chuck" — which is worse than a slightly long row.
  const kept = parts.slice(0, 4).join(", ");
  return kept.length > 78 ? `${kept.slice(0, 75).replace(/,\s*$/, "")}…` : kept;
}
