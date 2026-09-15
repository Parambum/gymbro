/**
 * The seed manifest: which foods GymBro Fuel ships with, and how to find each
 * one in USDA FoodData Central.
 *
 * This file contains **no nutrition numbers**. It is a shopping list — a
 * display name, the query that locates the food upstream, the spelling
 * variants Indian users actually type, and which household portions apply.
 * `fetch-fuel-foods.mjs` turns it into `src/lib/data/fuel-foods.json` by
 * fetching real composition data; anything that cannot be matched is reported
 * as a miss and simply does not ship. Never invent nutrition data.
 *
 * USDA's Survey (FNDDS) dataset carries a surprising amount of Indian cooking —
 * palak paneer, chana masala, idli, dosa — which is why it is searched
 * alongside SR Legacy and Foundation.
 *
 * @typedef {object} SeedFoodSpec
 * @property {string}   key       stable id; survives a renamed label
 * @property {string}   name      what the app calls it — Indian-first
 * @property {string}   query     sent to the USDA search endpoint
 * @property {string[]} [must]    candidate description must contain all of these
 * @property {string[]} [avoid]   candidate rejected if it contains any of these
 * @property {string[]} aliases   transliterations/synonyms ("dhal", "daal", "dal")
 * @property {"veg"|"nonveg"|"egg"|"unknown"} vegFlag
 * @property {string}   portions  a key of PORTION_SETS
 */

/** @type {SeedFoodSpec[]} */
export const FUEL_SEED_LIST = [
  // ── grains, breads, tiffin ─────────────────────────────────────────
  { key: "roti", name: "Roti / Chapati (whole wheat)", query: "chapati roti whole wheat", must: ["chapati"], aliases: ["chapati", "phulka", "roti", "atta roti"], vegFlag: "veg", portions: "flatbread" },
  { key: "paratha-plain", name: "Paratha (plain)", query: "paratha", must: ["paratha"], aliases: ["parantha", "parotta"], vegFlag: "veg", portions: "flatbread" },
  { key: "naan", name: "Naan", query: "naan bread", must: ["naan"], aliases: ["nan"], vegFlag: "veg", portions: "flatbread" },
  { key: "puri", name: "Puri (fried)", query: "puri indian fried bread", must: ["puri"], aliases: ["poori"], vegFlag: "veg", portions: "flatbread" },
  // "glutinous" is sticky rice, not the long-grain everyone actually eats — and
  // it scores well on token overlap, so it has to be excluded by name.
  { key: "rice-white-cooked", name: "Rice, white (cooked)", query: "rice white long-grain cooked", must: ["rice", "cooked"], avoid: ["fried", "wild", "brown", "glutinous", "instant", "parboiled"], aliases: ["chawal", "bhaat", "steamed rice", "plain rice"], vegFlag: "veg", portions: "riceServing" },
  { key: "rice-brown-cooked", name: "Rice, brown (cooked)", query: "rice brown long grain cooked", must: ["brown", "cooked"], aliases: ["brown chawal"], vegFlag: "veg", portions: "riceServing" },
  { key: "pulao", name: "Vegetable Pulao", query: "rice pilaf vegetables", must: ["rice"], aliases: ["pulav", "pilaf", "veg pulao"], vegFlag: "veg", portions: "riceServing" },
  { key: "biryani-veg", name: "Vegetable Biryani", query: "vegetable biryani", must: ["biryani"], aliases: ["veg biryani"], vegFlag: "veg", portions: "riceServing" },
  { key: "biryani-chicken", name: "Chicken Biryani", query: "chicken biryani", must: ["biryani"], aliases: ["murgh biryani"], vegFlag: "nonveg", portions: "riceServing" },
  { key: "khichdi", name: "Khichdi", query: "khichdi rice lentils", must: ["rice"], aliases: ["khichri", "kichdi"], vegFlag: "veg", portions: "riceServing" },
  { key: "idli", name: "Idli", query: "idli", must: ["idli"], aliases: ["idly"], vegFlag: "veg", portions: "idli" },
  { key: "dosa-plain", name: "Dosa (plain)", query: "dosa", must: ["dosa"], avoid: ["masala"], aliases: ["dosai", "sada dosa"], vegFlag: "veg", portions: "dosa" },
  { key: "dosa-masala", name: "Masala Dosa", query: "masala dosa potato", must: ["dosa"], aliases: ["masala dosai"], vegFlag: "veg", portions: "dosa" },
  { key: "uttapam", name: "Uttapam", query: "uttapam", must: ["uttapam"], aliases: ["uthappam"], vegFlag: "veg", portions: "dosa" },
  { key: "upma", name: "Upma", query: "upma semolina", must: ["upma"], aliases: ["uppma", "rava upma"], vegFlag: "veg", portions: "katori" },
  { key: "poha", name: "Poha (flattened rice, cooked)", query: "poha flattened rice", aliases: ["pohe", "aval", "flattened rice"], vegFlag: "veg", portions: "katori" },
  { key: "oats-dry", name: "Oats (rolled, dry)", query: "oats rolled dry", must: ["oats"], avoid: ["cooked", "instant"], aliases: ["rolled oats", "oatmeal", "jai"], vegFlag: "veg", portions: "dryCereal" },
  { key: "suji", name: "Suji / Semolina (dry)", query: "semolina enriched dry", must: ["semolina"], aliases: ["rava", "sooji", "semolina"], vegFlag: "veg", portions: "dryCereal" },
  { key: "bread-white", name: "Bread, white", query: "bread white commercially prepared", must: ["bread", "white"], aliases: ["white bread", "pav", "sandwich bread"], vegFlag: "veg", portions: "bread" },
  { key: "bread-brown", name: "Bread, whole wheat", query: "bread whole wheat commercially prepared", must: ["bread", "wheat"], aliases: ["brown bread", "atta bread"], vegFlag: "veg", portions: "bread" },
  { key: "pasta-cooked", name: "Pasta (cooked)", query: "pasta cooked enriched", must: ["cooked"], aliases: ["macaroni", "penne", "spaghetti"], vegFlag: "veg", portions: "riceServing" },
  { key: "quinoa-cooked", name: "Quinoa (cooked)", query: "quinoa cooked", must: ["quinoa"], aliases: [], vegFlag: "veg", portions: "riceServing" },
  { key: "cornflakes", name: "Corn Flakes", query: "cereals ready-to-eat corn flakes", must: ["corn flakes"], aliases: ["cereal"], vegFlag: "veg", portions: "dryCereal" },
  { key: "muesli", name: "Muesli", query: "muesli", must: ["muesli"], aliases: [], vegFlag: "veg", portions: "dryCereal" },
  { key: "vermicelli", name: "Vermicelli / Sevai (cooked)", query: "vermicelli cooked", aliases: ["sevai", "semiya"], vegFlag: "veg", portions: "katori" },
  { key: "besan", name: "Besan (gram flour)", query: "chickpea flour besan", must: ["chickpea flour"], aliases: ["gram flour", "chana atta"], vegFlag: "veg", portions: "dryCereal" },
  { key: "atta", name: "Atta (whole wheat flour)", query: "wheat flour whole grain", must: ["wheat flour"], aliases: ["wheat flour", "gehun atta"], vegFlag: "veg", portions: "dryCereal" },

  // ── dals & legumes ─────────────────────────────────────────────────
  { key: "dal-toor", name: "Toor Dal (cooked)", query: "pigeon peas cooked", must: ["pigeon"], aliases: ["arhar dal", "tur dal", "toor daal", "dhal", "daal", "dal"], vegFlag: "veg", portions: "katori" },
  { key: "dal-moong", name: "Moong Dal (cooked)", query: "mung beans cooked", must: ["mung"], aliases: ["mung dal", "green gram", "moong daal", "dhal"], vegFlag: "veg", portions: "katori" },
  { key: "dal-chana", name: "Chana Dal (cooked)", query: "bengal gram chickpeas cooked", must: ["chickpea"], aliases: ["bengal gram", "chana daal", "dhal"], vegFlag: "veg", portions: "katori" },
  { key: "dal-masoor", name: "Masoor Dal (cooked)", query: "lentils cooked", must: ["lentils", "cooked"], aliases: ["red lentil", "masur dal", "dhal", "daal"], vegFlag: "veg", portions: "katori" },
  { key: "dal-urad", name: "Urad Dal (cooked)", query: "black gram urad cooked", aliases: ["black gram", "kali dal", "dhal"], vegFlag: "veg", portions: "katori" },
  { key: "rajma", name: "Rajma (kidney beans)", query: "kidney beans cooked", must: ["kidney"], aliases: ["kidney beans", "rajmah"], vegFlag: "veg", portions: "katori" },
  { key: "chole", name: "Chole / Chana Masala", query: "chana masala chickpea curry", aliases: ["chana masala", "chickpea curry", "chhole"], vegFlag: "veg", portions: "katori" },
  { key: "chickpeas-boiled", name: "Chickpeas (boiled)", query: "chickpeas garbanzo cooked", must: ["chickpeas"], avoid: ["flour"], aliases: ["kabuli chana", "garbanzo"], vegFlag: "veg", portions: "katori" },
  { key: "kala-chana", name: "Black Chana (boiled)", query: "black gram beans cooked", aliases: ["kala chana", "black chickpea"], vegFlag: "veg", portions: "katori" },
  { key: "soy-chunks", name: "Soya Chunks (dry)", query: "soy protein textured", must: ["soy"], aliases: ["nutrela", "meal maker", "textured soy", "soya"], vegFlag: "veg", portions: "dryCereal" },
  { key: "sprouts", name: "Moong Sprouts (raw)", query: "mung beans sprouted raw", must: ["sprout"], aliases: ["sprouts", "ankurit"], vegFlag: "veg", portions: "katori" },
  { key: "tofu", name: "Tofu", query: "tofu raw firm", must: ["tofu"], aliases: ["bean curd"], vegFlag: "veg", portions: "paneerCube" },
  { key: "peas-green", name: "Green Peas (cooked)", query: "peas green cooked boiled", must: ["peas"], aliases: ["matar", "mutter"], vegFlag: "veg", portions: "katori" },

  // ── dairy & eggs ───────────────────────────────────────────────────
  { key: "milk-whole", name: "Milk, whole", query: "milk whole 3.25% milkfat", must: ["milk"], avoid: ["dry", "condensed"], aliases: ["doodh", "full cream milk"], vegFlag: "veg", portions: "glass" },
  { key: "milk-toned", name: "Milk, toned (2%)", query: "milk reduced fat 2%", must: ["milk"], avoid: ["dry"], aliases: ["toned milk", "doodh", "skimmed"], vegFlag: "veg", portions: "glass" },
  { key: "curd", name: "Curd / Dahi (plain)", query: "yogurt plain whole milk", must: ["yogurt"], avoid: ["greek", "vanilla", "fruit"], aliases: ["dahi", "yoghurt", "yogurt", "curd"], vegFlag: "veg", portions: "katori" },
  { key: "greek-yogurt", name: "Greek Yogurt (plain)", query: "yogurt greek plain nonfat", must: ["greek"], aliases: ["hung curd"], vegFlag: "veg", portions: "katori" },
  { key: "paneer", name: "Paneer", query: "cheese paneer", must: ["paneer"], avoid: ["palak", "matar"], aliases: ["cottage cheese", "panir"], vegFlag: "veg", portions: "paneerCube" },
  { key: "cheese-processed", name: "Cheese (processed slice)", query: "cheese pasteurized process cheddar", must: ["cheese"], aliases: ["cheese slice", "amul cheese"], vegFlag: "veg", portions: "bread" },
  { key: "butter", name: "Butter", query: "butter salted", must: ["butter"], avoid: ["oil", "peanut"], aliases: ["makhan"], vegFlag: "veg", portions: "spoonFat" },
  { key: "ghee", name: "Ghee", query: "butter oil anhydrous ghee", must: ["butter oil"], aliases: ["clarified butter", "desi ghee"], vegFlag: "veg", portions: "spoonFat" },
  { key: "buttermilk", name: "Buttermilk / Chaas", query: "buttermilk fluid cultured", must: ["buttermilk"], aliases: ["chaas", "chhachh", "mattha"], vegFlag: "veg", portions: "glass" },
  { key: "lassi-sweet", name: "Sweet Lassi", query: "yogurt drink sweetened", aliases: ["lassi", "sweet lassi"], vegFlag: "veg", portions: "glass" },
  { key: "cream", name: "Cream (fresh)", query: "cream fluid heavy whipping", must: ["cream"], aliases: ["malai", "fresh cream"], vegFlag: "veg", portions: "spoonFat" },
  { key: "egg-whole", name: "Egg, whole (boiled)", query: "egg whole cooked hard-boiled", must: ["egg"], avoid: ["white,", "yolk"], aliases: ["anda", "boiled egg", "ande"], vegFlag: "egg", portions: "egg" },
  { key: "egg-white", name: "Egg White (cooked)", query: "egg white cooked", must: ["white"], aliases: ["anda safedi", "egg whites"], vegFlag: "egg", portions: "egg" },
  { key: "omelette", name: "Omelette", query: "egg omelet cooked", must: ["omelet"], aliases: ["omlet", "omelet", "anda bhurji"], vegFlag: "egg", portions: "egg" },
  { key: "egg-curry", name: "Egg Curry", query: "egg curry", must: ["egg"], aliases: ["anda curry"], vegFlag: "egg", portions: "katori" },

  // ── meat, poultry, fish ────────────────────────────────────────────
  { key: "chicken-breast", name: "Chicken Breast (cooked, skinless)", query: "chicken breast roasted skinless boneless", must: ["breast"], avoid: ["fried", "battered"], aliases: ["murgh", "chicken"], vegFlag: "nonveg", portions: "meatPortion" },
  { key: "chicken-thigh", name: "Chicken Thigh (cooked)", query: "chicken thigh cooked skinless", must: ["thigh"], aliases: ["chicken leg"], vegFlag: "nonveg", portions: "meatPortion" },
  { key: "chicken-curry", name: "Chicken Curry", query: "chicken curry", must: ["curry"], aliases: ["murgh curry", "chicken masala"], vegFlag: "nonveg", portions: "katori" },
  { key: "tandoori-chicken", name: "Tandoori Chicken", query: "tandoori chicken", aliases: ["grilled chicken", "chicken tikka"], vegFlag: "nonveg", portions: "meatPortion" },
  { key: "mutton-curry", name: "Mutton / Goat Curry", query: "goat curry", aliases: ["mutton", "bakra", "lamb curry"], vegFlag: "nonveg", portions: "katori" },
  { key: "mutton-cooked", name: "Mutton (goat, cooked)", query: "goat meat cooked roasted", must: ["goat"], aliases: ["mutton", "bakri"], vegFlag: "nonveg", portions: "meatPortion" },
  { key: "fish-rohu", name: "Fish, freshwater (cooked)", query: "fish carp cooked dry heat", must: ["fish"], aliases: ["rohu", "katla", "machli", "fish"], vegFlag: "nonveg", portions: "meatPortion" },
  { key: "fish-pomfret", name: "Fish, white (cooked)", query: "fish flatfish cooked dry heat", must: ["fish"], aliases: ["pomfret", "surmai", "white fish"], vegFlag: "nonveg", portions: "meatPortion" },
  { key: "salmon", name: "Salmon (cooked)", query: "salmon atlantic farmed cooked", must: ["salmon"], aliases: [], vegFlag: "nonveg", portions: "meatPortion" },
  { key: "tuna-canned", name: "Tuna, canned in water", query: "tuna light canned in water drained", must: ["tuna"], aliases: [], vegFlag: "nonveg", portions: "meatPortion" },
  { key: "prawns", name: "Prawns / Shrimp (cooked)", query: "shrimp cooked moist heat", must: ["shrimp"], aliases: ["jhinga", "prawn"], vegFlag: "nonveg", portions: "meatPortion" },
  { key: "fish-curry", name: "Fish Curry", query: "fish curry", must: ["curry"], aliases: ["machli curry"], vegFlag: "nonveg", portions: "katori" },

  // ── vegetables & sabzi ─────────────────────────────────────────────
  { key: "potato-boiled", name: "Potato (boiled)", query: "potatoes boiled cooked without skin", must: ["potato"], avoid: ["fried", "chips"], aliases: ["aloo", "alu"], vegFlag: "veg", portions: "katori" },
  { key: "aloo-sabzi", name: "Aloo Sabzi (potato curry)", query: "potato curry", must: ["potato"], aliases: ["aloo sabji", "potato sabzi"], vegFlag: "veg", portions: "katori" },
  { key: "palak-paneer", name: "Palak Paneer", query: "palak paneer", must: ["paneer"], aliases: ["saag paneer", "spinach paneer"], vegFlag: "veg", portions: "katori" },
  { key: "matar-paneer", name: "Matar Paneer", query: "paneer peas curry", aliases: ["mutter paneer"], vegFlag: "veg", portions: "katori" },
  { key: "bhindi", name: "Bhindi / Okra (cooked)", query: "okra cooked boiled", must: ["okra"], aliases: ["okra", "ladyfinger", "bhendi"], vegFlag: "veg", portions: "katori" },
  { key: "baingan", name: "Baingan / Eggplant (cooked)", query: "eggplant cooked boiled", must: ["eggplant"], aliases: ["brinjal", "eggplant", "aubergine"], vegFlag: "veg", portions: "katori" },
  { key: "gobi", name: "Cauliflower (cooked)", query: "cauliflower cooked boiled", must: ["cauliflower"], aliases: ["gobi", "phool gobi"], vegFlag: "veg", portions: "katori" },
  { key: "cabbage", name: "Cabbage (cooked)", query: "cabbage cooked boiled", must: ["cabbage"], aliases: ["patta gobi"], vegFlag: "veg", portions: "katori" },
  { key: "palak", name: "Palak / Spinach (cooked)", query: "spinach cooked boiled", must: ["spinach"], aliases: ["spinach", "saag"], vegFlag: "veg", portions: "katori" },
  { key: "mixed-veg-curry", name: "Mixed Vegetable Curry", query: "vegetable curry", must: ["vegetable"], aliases: ["sabzi", "mix veg"], vegFlag: "veg", portions: "katori" },
  { key: "tomato", name: "Tomato (raw)", query: "tomatoes red ripe raw", must: ["tomato"], aliases: ["tamatar"], vegFlag: "veg", portions: "katori" },
  { key: "onion", name: "Onion (raw)", query: "onions raw", must: ["onion"], aliases: ["pyaz", "kanda"], vegFlag: "veg", portions: "katori" },
  { key: "cucumber", name: "Cucumber (raw)", query: "cucumber with peel raw", must: ["cucumber"], aliases: ["kheera", "kakdi"], vegFlag: "veg", portions: "katori" },
  { key: "carrot", name: "Carrot (raw)", query: "carrots raw", must: ["carrot"], aliases: ["gajar"], vegFlag: "veg", portions: "katori" },
  { key: "mushroom", name: "Mushroom (cooked)", query: "mushrooms white cooked boiled", must: ["mushroom"], aliases: ["khumb"], vegFlag: "veg", portions: "katori" },
  { key: "capsicum", name: "Capsicum (raw)", query: "peppers sweet green raw", must: ["peppers"], aliases: ["shimla mirch", "bell pepper"], vegFlag: "veg", portions: "katori" },
  { key: "sambar", name: "Sambar", query: "sambar lentil vegetable stew", aliases: ["sambhar"], vegFlag: "veg", portions: "katori" },
  { key: "rasam", name: "Rasam", query: "rasam soup", aliases: [], vegFlag: "veg", portions: "katori" },
  { key: "raita", name: "Raita", query: "yogurt vegetable salad raita", aliases: ["boondi raita", "cucumber raita"], vegFlag: "veg", portions: "katori" },

  // ── fruits ─────────────────────────────────────────────────────────
  { key: "banana", name: "Banana", query: "bananas raw", must: ["banana"], aliases: ["kela"], vegFlag: "veg", portions: "banana" },
  { key: "apple", name: "Apple", query: "apples raw with skin", must: ["apple"], aliases: ["seb"], vegFlag: "veg", portions: "wholeFruit" },
  { key: "mango", name: "Mango", query: "mangos raw", must: ["mango"], aliases: ["aam"], vegFlag: "veg", portions: "wholeFruit" },
  { key: "orange", name: "Orange", query: "oranges raw navels", must: ["orange"], aliases: ["santra", "mosambi"], vegFlag: "veg", portions: "wholeFruit" },
  { key: "papaya", name: "Papaya", query: "papayas raw", must: ["papaya"], aliases: ["papita"], vegFlag: "veg", portions: "katori" },
  { key: "watermelon", name: "Watermelon", query: "watermelon raw", must: ["watermelon"], aliases: ["tarbooj"], vegFlag: "veg", portions: "katori" },
  { key: "grapes", name: "Grapes", query: "grapes red or green raw", must: ["grapes"], aliases: ["angoor"], vegFlag: "veg", portions: "katori" },
  { key: "pomegranate", name: "Pomegranate", query: "pomegranates raw", must: ["pomegranate"], aliases: ["anar"], vegFlag: "veg", portions: "katori" },
  { key: "guava", name: "Guava", query: "guavas common raw", must: ["guava"], aliases: ["amrood"], vegFlag: "veg", portions: "wholeFruit" },
  { key: "dates", name: "Dates", query: "dates medjool", must: ["dates"], aliases: ["khajoor"], vegFlag: "veg", portions: "nuts" },

  // ── fats, nuts, sweeteners ─────────────────────────────────────────
  { key: "mustard-oil", name: "Mustard Oil", query: "oil mustard", must: ["mustard"], aliases: ["sarson ka tel", "kachi ghani"], vegFlag: "veg", portions: "spoonFat" },
  { key: "sunflower-oil", name: "Sunflower Oil", query: "oil sunflower", must: ["sunflower"], aliases: ["refined oil", "cooking oil"], vegFlag: "veg", portions: "spoonFat" },
  { key: "coconut-oil", name: "Coconut Oil", query: "oil coconut", must: ["coconut"], aliases: ["nariyal tel"], vegFlag: "veg", portions: "spoonFat" },
  { key: "olive-oil", name: "Olive Oil", query: "oil olive salad or cooking", must: ["olive"], aliases: [], vegFlag: "veg", portions: "spoonFat" },
  { key: "peanut-butter", name: "Peanut Butter", query: "peanut butter smooth", must: ["peanut butter"], aliases: ["pb", "moongfali butter"], vegFlag: "veg", portions: "nutButter" },
  { key: "peanuts", name: "Peanuts (roasted)", query: "peanuts all types dry-roasted", must: ["peanuts"], avoid: ["butter"], aliases: ["moongfali", "groundnut"], vegFlag: "veg", portions: "nuts" },
  { key: "almonds", name: "Almonds", query: "nuts almonds raw", must: ["almonds"], aliases: ["badam"], vegFlag: "veg", portions: "nuts" },
  { key: "cashews", name: "Cashews", query: "nuts cashew nuts raw", must: ["cashew"], aliases: ["kaju"], vegFlag: "veg", portions: "nuts" },
  { key: "walnuts", name: "Walnuts", query: "nuts walnuts english", must: ["walnut"], aliases: ["akhrot"], vegFlag: "veg", portions: "nuts" },
  { key: "sugar", name: "Sugar (white)", query: "sugars granulated", must: ["sugar"], aliases: ["cheeni", "shakkar"], vegFlag: "veg", portions: "spoonSugar" },
  { key: "jaggery", name: "Jaggery", query: "jaggery sugarcane", aliases: ["gud", "gur"], vegFlag: "veg", portions: "spoonSugar" },
  { key: "honey", name: "Honey", query: "honey", must: ["honey"], aliases: ["shahad"], vegFlag: "veg", portions: "spoonSugar" },
  { key: "coconut-fresh", name: "Coconut (fresh)", query: "nuts coconut meat raw", must: ["coconut"], avoid: ["oil", "water", "milk"], aliases: ["nariyal", "khopra"], vegFlag: "veg", portions: "nuts" },

  // ── gym staples ────────────────────────────────────────────────────
  { key: "whey-protein", name: "Whey Protein Powder", query: "whey protein powder", must: ["whey"], aliases: ["protein powder", "whey isolate", "protein shake"], vegFlag: "veg", portions: "whey" },
  { key: "protein-bar", name: "Protein Bar", query: "protein bar", must: ["bar"], aliases: ["energy bar"], vegFlag: "veg", portions: "weightOnly" },
  { key: "chia-seeds", name: "Chia Seeds", query: "seeds chia dried", must: ["chia"], aliases: [], vegFlag: "veg", portions: "spoonSugar" },
  { key: "flax-seeds", name: "Flax Seeds", query: "seeds flaxseed", must: ["flax"], aliases: ["alsi"], vegFlag: "veg", portions: "spoonSugar" },

  // ── snacks & sweets ────────────────────────────────────────────────
  { key: "samosa", name: "Samosa", query: "samosa", must: ["samosa"], aliases: ["singhara"], vegFlag: "veg", portions: "weightOnly" },
  { key: "pakora", name: "Pakora", query: "pakora fritter vegetable", aliases: ["bhajji", "bhaji", "fritter"], vegFlag: "veg", portions: "weightOnly" },
  { key: "dhokla", name: "Dhokla", query: "dhokla", aliases: [], vegFlag: "veg", portions: "weightOnly" },
  { key: "pav-bhaji", name: "Pav Bhaji", query: "pav bhaji", aliases: [], vegFlag: "veg", portions: "katori" },
  { key: "biscuit-glucose", name: "Biscuit (plain / glucose)", query: "cookies plain biscuit", must: ["cookie"], aliases: ["parle g", "marie", "cookie"], vegFlag: "veg", portions: "weightOnly" },
  { key: "namkeen", name: "Namkeen / Bhujia", query: "snack mix indian namkeen", aliases: ["bhujia", "sev", "mixture"], vegFlag: "veg", portions: "nuts" },
  { key: "potato-chips", name: "Potato Chips", query: "snacks potato chips plain salted", must: ["chips"], aliases: ["wafers", "crisps"], vegFlag: "veg", portions: "weightOnly" },
  { key: "gulab-jamun", name: "Gulab Jamun", query: "gulab jamun", aliases: [], vegFlag: "veg", portions: "weightOnly" },
  { key: "kheer", name: "Kheer / Rice Pudding", query: "rice pudding", must: ["pudding"], aliases: ["payasam", "rice kheer"], vegFlag: "veg", portions: "katori" },
  { key: "halwa", name: "Halwa", query: "halva", aliases: ["halva", "sooji halwa"], vegFlag: "veg", portions: "katori" },
  { key: "ice-cream", name: "Ice Cream (vanilla)", query: "ice cream vanilla", must: ["ice cream"], aliases: [], vegFlag: "veg", portions: "katori" },
  { key: "jalebi", name: "Jalebi", query: "jalebi", aliases: [], vegFlag: "veg", portions: "weightOnly" },

  // ── drinks ─────────────────────────────────────────────────────────
  { key: "chai", name: "Chai (tea with milk & sugar)", query: "tea with milk and sugar", must: ["tea"], aliases: ["tea", "doodh patti", "masala chai"], vegFlag: "veg", portions: "glass" },
  { key: "coffee-milk", name: "Coffee with Milk", query: "coffee with milk and sugar", must: ["coffee"], aliases: ["filter coffee", "latte"], vegFlag: "veg", portions: "glass" },
  { key: "coffee-black", name: "Black Coffee", query: "coffee brewed prepared with water", must: ["coffee"], avoid: ["milk"], aliases: ["americano"], vegFlag: "veg", portions: "glass" },
  { key: "green-tea", name: "Green Tea", query: "tea green brewed", must: ["green"], aliases: [], vegFlag: "veg", portions: "glass" },
  { key: "cola", name: "Cola (soft drink)", query: "carbonated beverage cola", must: ["cola"], avoid: ["diet"], aliases: ["coke", "pepsi", "soft drink", "thums up"], vegFlag: "veg", portions: "glass" },
  { key: "orange-juice", name: "Orange Juice", query: "orange juice raw", must: ["orange juice"], aliases: ["juice"], vegFlag: "veg", portions: "glass" },
  { key: "coconut-water", name: "Coconut Water", query: "nuts coconut water", must: ["coconut water"], aliases: ["nariyal pani"], vegFlag: "veg", portions: "glass" },
];
