/**
 * What each class the food model can recognise *is*, in the food database.
 *
 * The model answers "this looks like rajma". This table answers "and rajma
 * means INDB ASC165, served in a bowl". It is a mapping, not data: every
 * number the app shows comes from the referenced USDA, INDB or Open Food Facts
 * row, and build-vision-classes.mjs refuses a ref it cannot find.
 *
 * Choosing a source, in order:
 *   1. USDA FNDDS — analysed or standardised recipes with yield factors, and
 *      NHANES "typical serving" weights, which is the right default for a
 *      photo of a plate.
 *   2. INDB — the Indian dishes USDA does not carry. INDB is calculated from
 *      recipes and runs low for dishes reduced by long cooking (kheer, kulfi,
 *      lassi), so where an analysed equivalent exists it goes first and INDB
 *      is offered as the alternative.
 *   3. Open Food Facts — packaged versions, label data, shown as unverified.
 *
 * `items` is what gets logged. A combination dish (chole bhature) is logged as
 * its parts, because that is how its nutrition is actually known. `alts` are
 * offered as "other versions" on the result card. An empty `items` means no
 * trustworthy composition exists anywhere we can use: the app says it
 * recognised the dish and opens search, rather than show a made-up number.
 *
 * Item shape: "source:sourceRef" for the food's own typical serving, or
 * { ref, pick, qty } to choose one of the food's own published measures
 * ("piece/slice", "bun") and how many, or { ref, grams, label } to fix a
 * household serving for part of a combination dish.
 */
export const VISION_CLASSES = {
  // ── Indian ──────────────────────────────────────────────────────────
  aloo_gobi: { label: "Aloo gobi", items: ["indb:ASC171"] },
  aloo_masala: { label: "Aloo sabzi", items: ["indb:ASC178"], alts: ["indb:BFP239", "indb:ASC190"] },
  bhindi_masala: { label: "Bhindi masala", items: ["indb:BFP269"], alts: ["usda:2709947"] },
  biryani: { label: "Biryani", items: ["usda:2706538"], alts: ["usda:2706490", "usda:2708985"] },
  butter_naan: { label: "Butter naan", items: ["usda:2707613"], alts: ["indb:ASC142"] },
  // FNDDS's typical serving is a 360 g American mug; a cup of chai is a small glass.
  chai: { label: "Chai", items: [{ ref: "usda:2710506", pick: "small glass" }], alts: ["indb:ASC001"] },
  // Home chapati first: USDA's figure is for a commercial, oil-brushed roti.
  chapati: { label: "Roti / chapati", items: ["indb:ASC096"], alts: ["usda:171844"] },
  chole: { label: "Chole", items: ["usda:2707415"], alts: ["usda:2709632"] },
  // Bhatura has no trustworthy analysed entry (INDB's is fried-in-full-oil);
  // puri is the same dough, fried, and is how it is logged here.
  chole_bhature: {
    label: "Chole bhature",
    items: [
      { ref: "usda:2707415", pick: "katori (small)" },
      { ref: "usda:2707714", grams: 120, label: "2 bhature (as puri)" },
    ],
  },
  coconut_chutney: { label: "Coconut chutney", items: [{ ref: "indb:ASC386", grams: 30, label: "2 tbsp" }] },
  dal_makhani: { label: "Dal makhani", items: ["indb:OSR139"], alts: ["usda:2707427"] },
  dhokla: { label: "Dhokla", items: ["indb:ASC474"], alts: ["indb:BFP573"] },
  dum_aloo: { label: "Dum aloo", items: ["indb:BFP239"], alts: ["indb:ASC178"] },
  fish_curry: { label: "Fish curry", items: ["usda:2706460"], alts: ["indb:ASC246"] },
  ghevar: { label: "Ghevar", items: [] },
  green_chutney: { label: "Green chutney", items: [{ ref: "indb:BFP444", grams: 30, label: "2 tbsp" }], alts: ["indb:ASC387"] },
  // Only packaged, label-data versions exist; shown as unverified.
  gulab_jamun: { label: "Gulab jamun", items: [{ ref: "off:8903363007056", grams: 80, label: "2 pieces with syrup" }] },
  idli: { label: "Idli", items: ["usda:2708346"], alts: ["indb:ASC144"] },
  jalebi: { label: "Jalebi", items: [] },
  kaathi_rolls: { label: "Kathi roll", items: ["indb:ASC149"] },
  kadai_paneer: { label: "Kadai paneer", items: ["indb:ASC226"], alts: ["indb:ASC195"] },
  kebab: { label: "Kebab", items: ["indb:BFP199"], alts: ["indb:ASC241", "indb:BFP198", "indb:OSR153"] },
  // Rice pudding's USDA serving is a 283 g restaurant bowl; kheer comes in a katori.
  kheer: { label: "Kheer", items: [{ ref: "usda:168063", pick: "katori (small)" }], alts: ["indb:ASC282"] },
  kulfi: { label: "Kulfi", items: ["indb:ASC321"], alts: ["off:8901262176477"] },
  lassi: { label: "Lassi", items: ["indb:ASC021"], alts: ["indb:ASC022"] },
  masala_dosa: { label: "Masala dosa", items: ["usda:2709129"], alts: ["indb:ASC146"] },
  modak: { label: "Modak", items: [] },
  momos: { label: "Momos", items: ["usda:2708708"], alts: ["off:8908015692468"] },
  mutton_curry: { label: "Mutton curry", items: ["indb:BFP194"], alts: ["indb:ASC234", "usda:2706388"] },
  paani_puri: { label: "Pani puri", items: [] },
  pakode: { label: "Pakora", items: ["usda:2710066"] },
  palak_paneer: { label: "Palak paneer", items: ["usda:2709631"], alts: ["indb:ASC215"] },
  // Logged as its parts: the bhaji (INDB) and two pav (a soft white bun, by USDA's bun weight).
  pav_bhaji: {
    label: "Pav bhaji",
    items: [
      { ref: "indb:OSR112", pick: "katori (medium)" },
      { ref: "usda:2707657", pick: "1 hamburger bun", qty: 2 },
    ],
  },
  poha: { label: "Poha", items: ["indb:BFP045"], alts: ["indb:BFP044"] },
  rajma_curry: { label: "Rajma", items: ["indb:ASC165"], alts: ["usda:2707380"] },
  ras_malai: { label: "Ras malai", items: ["indb:BFP393"], alts: ["off:8904063253958"] },
  shahi_paneer: { label: "Shahi paneer", items: ["indb:ASC221"], alts: ["indb:ASC195"] },
  white_rice: { label: "Rice", items: ["usda:2708408"], alts: ["indb:ASC113"] },

  // ── shared by both datasets ─────────────────────────────────────────
  chicken_curry: { label: "Chicken curry", items: ["usda:2706437"] },
  fried_rice: { label: "Fried rice", items: ["usda:334536"], alts: ["indb:ASC129"] },
  hamburger: { label: "Burger", items: ["usda:2706920"], alts: ["usda:2706888"] },
  pizza: { label: "Pizza", items: ["usda:2708612"], alts: ["usda:2708618"] },
  samosa: { label: "Samosa", items: ["usda:2708730"] },

  // ── Food-101 ────────────────────────────────────────────────────────
  apple_pie: { label: "Apple pie", items: [{ ref: "usda:2707995", pick: "regular slice" }] },
  baby_back_ribs: { label: "Pork ribs", items: ["usda:2705894"] },
  baklava: { label: "Baklava", items: ["usda:2708044"] },
  beef_carpaccio: { label: "Beef carpaccio", items: [{ ref: "usda:2727573", grams: 85, label: "1 starter plate" }] },
  beef_tartare: { label: "Beef tartare", items: [{ ref: "usda:2705853", grams: 120, label: "1 serving" }] },
  beet_salad: { label: "Beet salad", items: ["usda:2709874"] },
  beignets: { label: "Beignets", items: ["usda:2708071"] },
  bibimbap: { label: "Bibimbap", items: ["usda:2708950"] },
  bread_pudding: { label: "Bread pudding", items: ["usda:2705680"] },
  breakfast_burrito: { label: "Breakfast burrito", items: ["usda:170787"] },
  bruschetta: { label: "Bruschetta", items: ["usda:2707652"] },
  caesar_salad: { label: "Caesar salad", items: ["usda:2709591"] },
  cannoli: { label: "Cannoli", items: ["usda:2708052"] },
  caprese_salad: {
    label: "Caprese salad",
    items: [
      { ref: "usda:2705722", grams: 60, label: "mozzarella" },
      { ref: "usda:2709719", grams: 120, label: "tomato" },
    ],
  },
  // Cakes: FNDDS's "typical serving" (175–200 g) is large; a photo is usually one slice.
  carrot_cake: { label: "Carrot cake", items: [{ ref: "usda:2707859", pick: "piece/slice" }] },
  ceviche: { label: "Ceviche", items: ["usda:2706463"] },
  cheese_plate: { label: "Cheese plate", items: [{ ref: "usda:328637", grams: 60, label: "a few slices" }] },
  cheesecake: { label: "Cheesecake", items: [{ ref: "usda:2707861", pick: "piece/slice" }] },
  chicken_quesadilla: { label: "Chicken quesadilla", items: ["usda:2708593"] },
  chicken_wings: { label: "Chicken wings", items: ["usda:2706068"] },
  chocolate_cake: { label: "Chocolate cake", items: [{ ref: "usda:2707866", pick: "piece/slice" }] },
  chocolate_mousse: { label: "Chocolate mousse", items: [{ ref: "usda:168777", pick: "cup" }] },
  churros: { label: "Churros", items: ["usda:2708070"] },
  clam_chowder: { label: "Clam chowder", items: ["usda:2707139"] },
  club_sandwich: { label: "Club sandwich", items: ["usda:2706993"] },
  crab_cakes: { label: "Crab cakes", items: ["usda:171967"] },
  creme_brulee: { label: "Crème brûlée", items: ["usda:2705684"] },
  croque_madame: { label: "Croque madame", items: [] },
  cup_cakes: { label: "Cupcake", items: [{ ref: "usda:2707853", pick: "cupcake" }] },
  deviled_eggs: { label: "Deviled eggs", items: ["usda:2707181"] },
  donuts: { label: "Doughnut", items: ["usda:2708062"] },
  dumplings: { label: "Dumplings", items: ["usda:2708708"], alts: ["usda:2708705"] },
  edamame: { label: "Edamame", items: ["usda:2707436"] },
  eggs_benedict: { label: "Eggs Benedict", items: ["usda:2707180"] },
  escargots: { label: "Escargots", items: [{ ref: "usda:167744", grams: 60, label: "6 snails" }] },
  // FNDDS's falafel (514 kcal) is a deep-fried outlier; SR Legacy's
  // home-prepared figure is the conventional reference.
  falafel: { label: "Falafel", items: [{ ref: "usda:172455", pick: "patty", qty: 5 }], alts: ["usda:2707408"] },
  filet_mignon: { label: "Filet mignon", items: ["usda:2705841"] },
  fish_and_chips: {
    label: "Fish and chips",
    items: [
      { ref: "usda:2706227", grams: 150, label: "1 fried fillet" },
      { ref: "usda:2709462", grams: 150, label: "chips" },
    ],
  },
  foie_gras: { label: "Foie gras", items: [{ ref: "usda:171100", grams: 40, label: "1 slice" }] },
  french_fries: { label: "French fries", items: ["usda:2709462"] },
  french_onion_soup: { label: "French onion soup", items: ["usda:2710108"] },
  french_toast: { label: "French toast", items: ["usda:2708331"] },
  fried_calamari: { label: "Fried calamari", items: ["usda:2706334"] },
  frozen_yogurt: { label: "Frozen yogurt", items: ["usda:2705451"] },
  garlic_bread: { label: "Garlic bread", items: ["usda:2707626"] },
  gnocchi: { label: "Gnocchi", items: ["usda:2708722"] },
  greek_salad: { label: "Greek salad", items: ["usda:2709830"] },
  grilled_cheese_sandwich: { label: "Grilled cheese", items: ["usda:2705801"] },
  grilled_salmon: { label: "Grilled salmon", items: ["usda:2706287"] },
  guacamole: { label: "Guacamole", items: ["usda:2709307"] },
  gyoza: { label: "Gyoza", items: ["usda:2708705"] },
  hot_and_sour_soup: { label: "Hot and sour soup", items: ["usda:2707136"] },
  hot_dog: { label: "Hot dog", items: ["usda:2707056"] },
  huevos_rancheros: { label: "Huevos rancheros", items: ["usda:2707191"] },
  hummus: { label: "Hummus", items: ["usda:2707402"] },
  ice_cream: { label: "Ice cream", items: ["usda:2705629"] },
  lasagna: { label: "Lasagna", items: ["usda:2708750"], alts: ["usda:2708758"] },
  lobster_bisque: { label: "Lobster bisque", items: ["usda:2707140"] },
  lobster_roll_sandwich: { label: "Lobster roll", items: ["usda:2706825"] },
  macaroni_and_cheese: { label: "Mac and cheese", items: ["usda:2708811"] },
  // French macarons have no USDA entry; the coconut macaroon is the closest
  // cookie by composition and is labelled as such.
  macarons: { label: "Macarons", items: [{ ref: "usda:2707936", grams: 30, label: "2 macarons" }] },
  miso_soup: { label: "Miso soup", items: ["usda:2707455"] },
  mussels: { label: "Mussels", items: ["usda:2706350"] },
  nachos: { label: "Nachos", items: ["usda:2708576"] },
  // USDA weighs a one-egg omelet; most are two.
  omelette: { label: "Omelette", items: [{ ref: "usda:172185", pick: "large", qty: 2 }] },
  onion_rings: { label: "Onion rings", items: ["usda:2710055"] },
  oysters: { label: "Oysters", items: ["usda:2706351"] },
  pad_thai: { label: "Pad thai", items: ["usda:2708804"] },
  paella: { label: "Paella", items: ["usda:2706723"] },
  pancakes: { label: "Pancakes", items: ["usda:2708294"] },
  panna_cotta: { label: "Panna cotta", items: [] },
  peking_duck: { label: "Peking duck", items: ["usda:2706141"] },
  pho: { label: "Pho", items: ["usda:2707124"] },
  pork_chop: { label: "Pork chop", items: ["usda:2705866"] },
  poutine: { label: "Poutine", items: ["usda:2709469"] },
  prime_rib: { label: "Prime rib", items: [{ ref: "usda:172146", grams: 200, label: "1 slice" }] },
  pulled_pork_sandwich: { label: "Pulled pork sandwich", items: ["usda:2706975"] },
  ramen: { label: "Ramen", items: ["usda:2709153"] },
  ravioli: { label: "Ravioli", items: ["usda:2708761"] },
  red_velvet_cake: { label: "Red velvet cake", items: [{ ref: "usda:2707884", pick: "piece/slice" }] },
  risotto: { label: "Risotto", items: [] },
  sashimi: { label: "Sashimi", items: [{ ref: "usda:2706308", grams: 100, label: "6 slices" }], alts: ["usda:2706284"] },
  scallops: { label: "Scallops", items: ["usda:2706357"] },
  seaweed_salad: { label: "Seaweed salad", items: [{ ref: "usda:170496", grams: 100, label: "1 small bowl" }] },
  shrimp_and_grits: {
    label: "Shrimp and grits",
    items: [
      { ref: "usda:2708369", grams: 240, label: "1 cup cheese grits" },
      { ref: "usda:2706363", grams: 85, label: "shrimp" },
    ],
  },
  // USDA's restaurant serving is 554 g; a home plate is the household table's "1 plate".
  spaghetti_bolognese: { label: "Spaghetti bolognese", items: [{ ref: "usda:167680", pick: "plate" }] },
  spaghetti_carbonara: { label: "Spaghetti carbonara", items: ["usda:2708861"] },
  spring_rolls: { label: "Spring rolls", items: ["usda:2708700"] },
  steak: { label: "Steak", items: ["usda:2705824"] },
  strawberry_shortcake: { label: "Strawberry shortcake", items: [{ ref: "usda:2707896", pick: "piece/slice" }] },
  sushi: { label: "Sushi", items: ["usda:2708959"] },
  tacos: { label: "Tacos", items: ["usda:2708514"] },
  takoyaki: { label: "Takoyaki", items: [] },
  tiramisu: { label: "Tiramisu", items: [{ ref: "usda:2705702", pick: "1 piece" }] },
  tuna_tartare: { label: "Tuna tartare", items: [{ ref: "usda:2706308", grams: 120, label: "1 serving" }] },
  waffles: { label: "Waffles", items: ["usda:2708312"] },
};
