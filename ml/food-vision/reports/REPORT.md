# Food model — evaluation report

Backbone **dinov2-s** (frozen) + trained head, int8 ONNX, 24.3 MB, 139 dishes. Every number below is the shipped file run on test photos it never trained on, read once.

## Headline

| test set | photos | top-1 | top-5 |
|---|---|---|---|
| all | 28,114 | 89.9% | 98.2% |
| Food-101 official test | 25,181 | 89.5% | 98.1% |
| Indian hold-out | 2,933 | 92.7% | 98.4% |

Macro top-1 (every dish weighted equally): **90.5%**.

## When the app says it's sure

The app leads with one answer when calibrated confidence ≥ **0.35** (chosen on validation as the lowest threshold where the answer is right ≥ 90% of the time). On test that happens for **97.2%** of photos, and those answers are right **91.6%** of the time. For the rest it shows a shortlist, which contains the right dish **75.2%** of the time.

Calibration error (ECE) after temperature scaling (T = 0.71): 0.8 points.

## Phone-camera damage

Same 2,000 test photos, degraded the way kitchen photos are:

| condition | top-1 |
|---|---|
| clean | 90.3% |
| jpeg | 90.0% |
| blur | 89.3% |
| dim | 90.4% |
| tilt | 88.6% |

## Speed (laptop CPU, single image)

- int8 ms 1 thread: 100.5 ms
- int8 ms 4 threads: 54.5 ms
- fp32 ms 1 thread: 212.2 ms

## How it was chosen

Head: MLP, 1024 hidden, lr 0.003, weight decay 0.05, label smoothing 0.1 — best of 12 configurations on validation (87.8% top-1, 87.9% macro).

Leakage controls: label conflicts dropped: 3, exact duplicates dropped: 157, val near duplicates of train dropped: 56, test near duplicates of train dropped: 159.

## Weakest dishes

| dish | test photos | top-1 | top-5 |
|---|---|---|---|
| steak | 250 | 56.0% | 96.8% |
| pork_chop | 248 | 69.8% | 96.4% |
| tuna_tartare | 250 | 70.4% | 96.8% |
| foie_gras | 249 | 72.3% | 92.8% |
| bread_pudding | 250 | 73.2% | 94.8% |
| chocolate_mousse | 250 | 76.4% | 96.4% |
| ceviche | 249 | 77.1% | 93.2% |
| filet_mignon | 250 | 77.2% | 94.4% |
| chapati | 120 | 77.5% | 95.0% |
| cheesecake | 250 | 77.6% | 93.6% |
| apple_pie | 250 | 78.4% | 95.2% |
| beet_salad | 248 | 78.6% | 94.4% |
| omelette | 249 | 80.7% | 97.2% |
| risotto | 250 | 80.8% | 96.4% |
| scallops | 250 | 82.0% | 94.4% |

## Most common confusions

| true dish | predicted as | times |
|---|---|---|
| steak | filet_mignon | 41 |
| tuna_tartare | beef_tartare | 30 |
| filet_mignon | steak | 26 |
| steak | pork_chop | 20 |
| prime_rib | steak | 19 |
| pork_chop | filet_mignon | 17 |
| chocolate_cake | chocolate_mousse | 17 |
| steak | prime_rib | 16 |
| cheesecake | strawberry_shortcake | 16 |
| pork_chop | steak | 15 |
| pork_chop | grilled_salmon | 15 |
| chocolate_mousse | chocolate_cake | 15 |
| ice_cream | frozen_yogurt | 15 |
| beef_tartare | tuna_tartare | 15 |
| pulled_pork_sandwich | hamburger | 15 |

## Every dish

| dish | test photos | top-1 | top-5 |
|---|---|---|---|
| aloo_gobi | 34 | 91.2% | 100.0% |
| aloo_masala | 38 | 100.0% | 100.0% |
| apple_pie | 250 | 78.4% | 95.2% |
| baby_back_ribs | 249 | 87.6% | 97.6% |
| baklava | 249 | 92.4% | 97.6% |
| beef_carpaccio | 248 | 92.3% | 98.8% |
| beef_tartare | 248 | 86.7% | 95.2% |
| beet_salad | 248 | 78.6% | 94.4% |
| beignets | 250 | 93.2% | 98.0% |
| bhindi_masala | 57 | 100.0% | 100.0% |
| bibimbap | 250 | 96.8% | 100.0% |
| biryani | 71 | 98.6% | 100.0% |
| bread_pudding | 250 | 73.2% | 94.8% |
| breakfast_burrito | 250 | 86.4% | 96.8% |
| bruschetta | 250 | 88.8% | 96.4% |
| butter_naan | 67 | 89.6% | 95.5% |
| caesar_salad | 250 | 93.2% | 99.2% |
| cannoli | 250 | 96.0% | 99.6% |
| caprese_salad | 249 | 88.8% | 98.4% |
| carrot_cake | 249 | 85.5% | 96.4% |
| ceviche | 249 | 77.1% | 93.2% |
| chai | 104 | 94.2% | 98.1% |
| chapati | 120 | 77.5% | 95.0% |
| cheese_plate | 248 | 91.9% | 99.6% |
| cheesecake | 250 | 77.6% | 93.6% |
| chicken_curry | 294 | 82.7% | 96.3% |
| chicken_quesadilla | 249 | 93.2% | 97.6% |
| chicken_wings | 250 | 96.4% | 99.6% |
| chocolate_cake | 250 | 85.2% | 99.2% |
| chocolate_mousse | 250 | 76.4% | 96.4% |
| chole | 77 | 92.2% | 100.0% |
| chole_bhature | 124 | 92.7% | 97.6% |
| churros | 248 | 96.0% | 98.8% |
| clam_chowder | 248 | 94.4% | 99.2% |
| club_sandwich | 250 | 91.6% | 99.6% |
| coconut_chutney | 31 | 100.0% | 100.0% |
| crab_cakes | 249 | 84.3% | 96.8% |
| creme_brulee | 250 | 93.6% | 98.0% |
| croque_madame | 249 | 92.4% | 99.2% |
| cup_cakes | 250 | 96.0% | 100.0% |
| dal_makhani | 135 | 91.1% | 97.8% |
| deviled_eggs | 248 | 96.0% | 98.0% |
| dhokla | 119 | 93.3% | 96.6% |
| donuts | 248 | 94.4% | 99.6% |
| dum_aloo | 43 | 90.7% | 100.0% |
| dumplings | 249 | 90.4% | 98.0% |
| edamame | 247 | 99.6% | 100.0% |
| eggs_benedict | 250 | 95.2% | 99.2% |
| escargots | 248 | 93.1% | 99.2% |
| falafel | 250 | 85.6% | 98.4% |
| filet_mignon | 250 | 77.2% | 94.4% |
| fish_and_chips | 250 | 95.6% | 99.2% |
| fish_curry | 42 | 85.7% | 100.0% |
| foie_gras | 249 | 72.3% | 92.8% |
| french_fries | 250 | 96.4% | 98.8% |
| french_onion_soup | 247 | 92.7% | 99.6% |
| french_toast | 250 | 87.2% | 98.4% |
| fried_calamari | 248 | 88.3% | 98.0% |
| fried_rice | 320 | 94.7% | 98.8% |
| frozen_yogurt | 250 | 99.2% | 100.0% |
| garlic_bread | 250 | 92.0% | 98.4% |
| ghevar | 34 | 100.0% | 100.0% |
| gnocchi | 249 | 87.1% | 97.6% |
| greek_salad | 250 | 91.6% | 99.2% |
| green_chutney | 34 | 97.1% | 100.0% |
| grilled_cheese_sandwich | 250 | 88.0% | 98.0% |
| grilled_salmon | 249 | 84.3% | 98.0% |
| guacamole | 250 | 95.2% | 100.0% |
| gulab_jamun | 65 | 100.0% | 100.0% |
| gyoza | 250 | 94.0% | 98.8% |
| hamburger | 330 | 88.5% | 99.4% |
| hot_and_sour_soup | 250 | 97.2% | 100.0% |
| hot_dog | 249 | 92.8% | 99.6% |
| huevos_rancheros | 249 | 82.7% | 98.8% |
| hummus | 250 | 88.0% | 97.6% |
| ice_cream | 250 | 83.6% | 96.4% |
| idli | 122 | 98.4% | 99.2% |
| jalebi | 139 | 97.1% | 99.3% |
| kaathi_rolls | 59 | 88.1% | 94.9% |
| kadai_paneer | 89 | 85.4% | 97.8% |
| kebab | 42 | 95.2% | 100.0% |
| kheer | 41 | 92.7% | 100.0% |
| kulfi | 69 | 88.4% | 97.1% |
| lasagna | 249 | 86.7% | 98.4% |
| lassi | 46 | 91.3% | 100.0% |
| lobster_bisque | 250 | 90.8% | 98.4% |
| lobster_roll_sandwich | 249 | 93.6% | 100.0% |
| macaroni_and_cheese | 250 | 89.2% | 97.6% |
| macarons | 249 | 97.6% | 100.0% |
| masala_dosa | 87 | 94.3% | 97.7% |
| miso_soup | 250 | 93.6% | 99.6% |
| modak | 41 | 100.0% | 100.0% |
| momos | 75 | 82.7% | 98.7% |
| mussels | 250 | 95.6% | 98.0% |
| mutton_curry | 41 | 87.8% | 92.7% |
| nachos | 250 | 91.6% | 98.4% |
| omelette | 249 | 80.7% | 97.2% |
| onion_rings | 250 | 97.2% | 100.0% |
| oysters | 250 | 98.8% | 100.0% |
| paani_puri | 19 | 94.7% | 100.0% |
| pad_thai | 249 | 97.2% | 99.6% |
| paella | 248 | 92.7% | 98.4% |
| pakode | 85 | 96.5% | 100.0% |
| palak_paneer | 67 | 95.5% | 98.5% |
| pancakes | 248 | 94.4% | 98.4% |
| panna_cotta | 248 | 87.5% | 96.0% |
| pav_bhaji | 74 | 89.2% | 95.9% |
| peking_duck | 250 | 90.8% | 96.8% |
| pho | 250 | 97.6% | 99.6% |
| pizza | 301 | 96.0% | 98.7% |
| poha | 59 | 98.3% | 100.0% |
| pork_chop | 248 | 69.8% | 96.4% |
| poutine | 250 | 94.4% | 100.0% |
| prime_rib | 249 | 86.3% | 98.0% |
| pulled_pork_sandwich | 250 | 88.0% | 99.2% |
| rajma_curry | 41 | 82.9% | 100.0% |
| ramen | 250 | 92.4% | 99.6% |
| ras_malai | 30 | 93.3% | 100.0% |
| ravioli | 247 | 84.2% | 96.4% |
| red_velvet_cake | 246 | 89.0% | 98.4% |
| risotto | 250 | 80.8% | 96.4% |
| samosa | 360 | 92.8% | 98.3% |
| sashimi | 250 | 94.8% | 99.6% |
| scallops | 250 | 82.0% | 94.4% |
| seaweed_salad | 249 | 97.2% | 99.6% |
| shahi_paneer | 80 | 97.5% | 100.0% |
| shrimp_and_grits | 250 | 88.0% | 99.2% |
| spaghetti_bolognese | 250 | 96.4% | 99.2% |
| spaghetti_carbonara | 248 | 96.0% | 98.8% |
| spring_rolls | 250 | 92.4% | 98.4% |
| steak | 250 | 56.0% | 96.8% |
| strawberry_shortcake | 247 | 92.3% | 99.6% |
| sushi | 250 | 93.6% | 97.2% |
| tacos | 250 | 90.8% | 98.0% |
| takoyaki | 250 | 96.8% | 100.0% |
| tiramisu | 250 | 86.4% | 96.8% |
| tuna_tartare | 250 | 70.4% | 96.8% |
| waffles | 249 | 96.0% | 99.2% |
| white_rice | 76 | 86.8% | 97.4% |
