"""
The model's label set: Food-101 and the Indian-43 set, merged.

Two datasets name some of the same dish differently ("burger" and
"hamburger"), and a classifier that has two outputs for one dish splits its
confidence between them and looks unsure about the thing it is best at. So
every dataset label maps to exactly one class key here, and the overlaps are
merged rather than kept as near-duplicates.

Momos and dumplings stay separate on purpose: they look alike, but they are
logged differently by the people this app is for, and the top-5 list covers the
confusion when it happens.
"""

FOOD101 = [
    "apple_pie", "baby_back_ribs", "baklava", "beef_carpaccio", "beef_tartare",
    "beet_salad", "beignets", "bibimbap", "bread_pudding", "breakfast_burrito",
    "bruschetta", "caesar_salad", "cannoli", "caprese_salad", "carrot_cake",
    "ceviche", "cheesecake", "cheese_plate", "chicken_curry", "chicken_quesadilla",
    "chicken_wings", "chocolate_cake", "chocolate_mousse", "churros", "clam_chowder",
    "club_sandwich", "crab_cakes", "creme_brulee", "croque_madame", "cup_cakes",
    "deviled_eggs", "donuts", "dumplings", "edamame", "eggs_benedict", "escargots",
    "falafel", "filet_mignon", "fish_and_chips", "foie_gras", "french_fries",
    "french_onion_soup", "french_toast", "fried_calamari", "fried_rice",
    "frozen_yogurt", "garlic_bread", "gnocchi", "greek_salad",
    "grilled_cheese_sandwich", "grilled_salmon", "guacamole", "gyoza", "hamburger",
    "hot_and_sour_soup", "hot_dog", "huevos_rancheros", "hummus", "ice_cream",
    "lasagna", "lobster_bisque", "lobster_roll_sandwich", "macaroni_and_cheese",
    "macarons", "miso_soup", "mussels", "nachos", "omelette", "onion_rings",
    "oysters", "pad_thai", "paella", "pancakes", "panna_cotta", "peking_duck", "pho",
    "pizza", "pork_chop", "poutine", "prime_rib", "pulled_pork_sandwich", "ramen",
    "ravioli", "red_velvet_cake", "risotto", "samosa", "sashimi", "scallops",
    "seaweed_salad", "shrimp_and_grits", "spaghetti_bolognese", "spaghetti_carbonara",
    "spring_rolls", "steak", "strawberry_shortcake", "sushi", "tacos", "takoyaki",
    "tiramisu", "tuna_tartare", "waffles",
]

INDIAN43 = [
    "aloo_gobi", "aloo_masala", "bhindi_masala", "biryani", "burger", "butter_naan",
    "chai", "chapati", "chicken_curry", "chole", "chole_bhature", "coconut_chutney",
    "dal_makhani", "dhokla", "dum_aloo", "fish_curry", "fried_rice", "ghevar",
    "green_chutney", "gulab_jamun", "idli", "jalebi", "kaathi_rolls", "kadai_paneer",
    "kebab", "kheer", "kulfi", "lassi", "masala_dosa", "modak", "momos",
    "mutton_curry", "paani_puri", "pakode", "palak_paneer", "pav_bhaji", "pizza",
    "poha", "rajma_curry", "ras_malai", "samosa", "shahi_paneer", "white_rice",
]

# Indian-43 label -> the Food-101 class it is the same dish as.
MERGE = {
    "burger": "hamburger",
    "pizza": "pizza",
    "samosa": "samosa",
    "fried_rice": "fried_rice",
    "chicken_curry": "chicken_curry",
}


def class_key(dataset: str, label: str) -> str:
    if dataset == "food101":
        return label
    if dataset == "indian43":
        return MERGE.get(label, label)
    raise ValueError(f"unknown dataset {dataset}")


CLASSES = sorted({*FOOD101, *(MERGE.get(l, l) for l in INDIAN43)})
INDEX = {k: i for i, k in enumerate(CLASSES)}

# Which classes the Indian set contributes, after merging — used to report
# accuracy on Indian food separately from the Western benchmark.
INDIAN_CLASSES = sorted({MERGE.get(l, l) for l in INDIAN43})

if __name__ == "__main__":
    print(len(CLASSES), "classes;", len(INDIAN_CLASSES), "with Indian images")
