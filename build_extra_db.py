"""
Build script — extends the Drishti Travel Assistant databases:

1. Appends Jammu & Kashmir attractions (from datasets/Jk_tourism_dataset.csv)
   to jhardb.js (travelDatabase), which previously only contained Jharkhand.

2. Generates services_db.js containing:
   - hotelsDatabase       (Jharkhand hotels + J&K accommodation, merged schema)
   - restaurantsDatabase  (Jharkhand restaurants)
   - shoppingDatabase     (Jharkhand shopping / markets)

Run from inside the project folder:
    python build_extra_db.py
"""
import csv
import json
import os
import re

BASE = os.path.dirname(__file__)
DATASETS = os.path.join(BASE, "datasets")


def normalize_text(v):
    if v is None:
        return ""
    return str(v).strip()


def slugify(name):
    s = name.lower().strip().replace(" ", "-").replace("&", "and").replace(",", "")
    return "".join(c for c in s if c.isalnum() or c == "-")


def to_float(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def to_rating(v, default=0):
    f = to_float(v)
    return f if f is not None else default


# ─────────────────────────────────────────────────────────────
# 1. Build J&K attraction entries (same schema as jhardb.js)
# ─────────────────────────────────────────────────────────────
def build_jk_places():
    path = os.path.join(DATASETS, "JandK_tourism_dataset.csv")
    places = []
    with open(path, encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            name = normalize_text(row.get("place_name"))
            if not name:
                continue
            district = normalize_text(row.get("district"))
            category = normalize_text(row.get("category")) or "Attraction"
            tags = normalize_text(row.get("tags"))
            activities = normalize_text(row.get("activities"))
            best_season = normalize_text(row.get("best_season"))
            vibe = normalize_text(row.get("vibe"))
            image_url = normalize_text(row.get("image_url"))
            lat = normalize_text(row.get("latitude"))
            lon = normalize_text(row.get("longitude"))
            reviews = normalize_text(row.get("feedback"))
            rating = normalize_text(row.get("rating"))
            sentiment = normalize_text(row.get("Sentiment_score"))


            tag_list = [t.strip() for t in tags.split(",") if t.strip()]
            activity_list = [a.strip() for a in activities.split(",") if a.strip()]

            summary_bits = [f"{name} is a {category.lower()} located in {district}, Jammu and Kashmir."]
            if tag_list:
                summary_bits.append(f"Known for its {', '.join(tag_list)} character, it has a {vibe or 'memorable'} atmosphere.")
            if activity_list:
                summary_bits.append(f"Popular activities here include {', '.join(activity_list)}.")
            if best_season:
                summary_bits.append(f"The best time to visit is during {best_season}.")
            summary = " ".join(summary_bits)

            keywords = list({
                name.lower(), district.lower(), category.lower(), "jammu and kashmir",
                "jammu", "kashmir", *name.lower().split(), *[t.lower() for t in tag_list]
            })
            keywords = [k for k in keywords if k]

            places.append({
                "id": slugify(name),
                "name": name,
                "state": "Jammu and Kashmir",
                "category": category,
                "keywords": keywords,
                "summary": summary,
                "audioDescription": summary,
                "location": district,
                "latitude": lat,
                "longitude": lon,
                "howToReach": "Travel routes not specified.",
                "accessibility": "No specific accessibility barriers reported. Sighted guidance is always recommended for a safe and comfortable visit.",
                "images": [image_url] if image_url else [],
                'reviews':reviews,
                'rating':rating,
                'sentiment':sentiment
            })
    return places


def append_jk_to_jhardb():
    jhardb_path = os.path.join(BASE, "jhardb.js")
    with open(jhardb_path, encoding="utf-8") as f:
        content = f.read()

    if '"state": "Jammu and Kashmir"' in content:
        print("ℹ️  jhardb.js already contains Jammu & Kashmir entries — skipping append.")
        return

    jk_places = build_jk_places()
    print(f"📍 Parsed {len(jk_places)} Jammu & Kashmir attractions.")

    # Extract the existing array via a light-touch approach: find the closing "];" of travelDatabase
    marker = "const travelDatabase = ["
    start = content.index(marker)
    # find matching closing bracket for the array by locating "];\n" that starts the line right before
    # the module.exports block (safe because sync_csv.py always writes this exact structure)
    end_marker = "];"
    end = content.index(end_marker, start)

    existing_json_array = content[start + len(marker) - 1: end + 1]  # includes leading "[" and trailing "]"
    existing_places = json.loads(existing_json_array)

    merged = existing_places + jk_places

    js_content = f"const travelDatabase = {json.dumps(merged, indent=2, ensure_ascii=False)};\n\n"
    js_content += "if (typeof module !== 'undefined' && module.exports) {\n"
    js_content += "  module.exports = travelDatabase;\n"
    js_content += "}\n"

    with open(jhardb_path, "w", encoding="utf-8") as f:
        f.write(js_content)

    print(f"💾 jhardb.js updated: {len(existing_places)} Jharkhand + {len(jk_places)} J&K = {len(merged)} total places.")


# ─────────────────────────────────────────────────────────────
# 2. Build hotels database (Jharkhand + J&K, merged schema)
# ─────────────────────────────────────────────────────────────
def build_hotels():
    hotels = []

    # Jharkhand hotels
    path = os.path.join(DATASETS, "Jhar1_Hotels.csv")
    with open(path, encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            name = normalize_text(row.get("Hotel_Name"))
            if not name:
                continue
            hotels.append({
                "id": slugify(name),
                "name": name,
                "state": "Jharkhand",
                "district": normalize_text(row.get("District")),
                "type": normalize_text(row.get("Category")),
                "starRating": to_float(row.get("Star Rating")),
                "pricePerNight": to_float(row.get("Price")),
                "amenities": [],
                "nearbyAttractions": [a.strip() for a in normalize_text(row.get("Nearby Attractions")).split(",") if a.strip()],
                "rating": to_rating(row.get("Rating")),
                "recommendedFor": [a.strip() for a in normalize_text(row.get("Recommended For")).split(",") if a.strip()],
                "latitude": to_float(row.get("Latitude")),
                "longitude": to_float(row.get("Longitude")),
            })

    # J&K accommodation
    path = os.path.join(DATASETS, "JK_accommodation.csv")
    with open(path, encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            name = normalize_text(row.get("Name"))
            if not name:
                continue
            category = normalize_text(row.get("Category"))
            star_match = re.search(r"(\d)", category)
            hotels.append({
                "id": slugify(name),
                "name": name,
                "state": "Jammu and Kashmir",
                "district": normalize_text(row.get("Region")),
                "type": normalize_text(row.get("Type")) or category,
                "starRating": float(star_match.group(1)) if star_match else None,
                "pricePerNight": to_float(row.get("Price/Night")),
                "amenities": [a.strip() for a in normalize_text(row.get("Amenities")).split(",") if a.strip()],
                "nearbyAttractions": [],
                "rating": to_rating(row.get("Rating")),
                "recommendedFor": [a.strip() for a in normalize_text(row.get("Recommended For")).split(",") if a.strip()],
                "latitude": None,
                "longitude": None,
            })

    return hotels


# ─────────────────────────────────────────────────────────────
# 3. Build restaurants database (Jharkhand only — no J&K dataset provided)
# ─────────────────────────────────────────────────────────────
def build_restaurants():
    restaurants = []
    path = os.path.join(DATASETS, "Jhar_restaurants.csv")
    with open(path, encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            name = normalize_text(row.get("Restaurant_name"))
            if not name:
                continue
            restaurants.append({
                "id": slugify(name),
                "name": name,
                "state": "Jharkhand",
                "district": normalize_text(row.get("District")),
                "cuisine": [c.strip() for c in normalize_text(row.get("Cuisine Type")).split(",") if c.strip()],
                "pureVeg": normalize_text(row.get("Pure Veg")).lower() == "yes",
                "mealType": [m.strip() for m in normalize_text(row.get("Meal Type")).split(",") if m.strip()],
                "avgPrice": to_float(row.get("Avg price")),
                "timing": normalize_text(row.get("Timing")),
                "rating": to_rating(row.get("Rating")),
                "nearestLandmark": normalize_text(row.get("Nearest Landmark")),
                "recommendedFor": [a.strip() for a in normalize_text(row.get("Recommended For")).split(",") if a.strip()],
            })
    return restaurants


# ─────────────────────────────────────────────────────────────
# 4. Build shopping database (Jharkhand only)
# ─────────────────────────────────────────────────────────────
def build_shopping():
    shops = []
    path = os.path.join(DATASETS, "Jhar_Shopping.csv")
    with open(path, encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            name = normalize_text(row.get("Shop_name"))
            if not name:
                continue
            shops.append({
                "id": slugify(name),
                "name": name,
                "state": "Jharkhand",
                "district": normalize_text(row.get("District")),
                "category": normalize_text(row.get("Category")),
                "products": [p.strip() for p in normalize_text(row.get("Products Available")).split(",") if p.strip()],
                "timing": normalize_text(row.get("Timing")),
                "nearestLandmark": normalize_text(row.get("Nearest Landmark")),
                "rating": to_rating(row.get("Rating")),
                "specialAttraction": normalize_text(row.get("Special Attraction")),
                "recommendedFor": [a.strip() for a in normalize_text(row.get("Recommended For")).split(",") if a.strip()],
            })
    return shops


def write_services_db():
    hotels = build_hotels()
    restaurants = build_restaurants()
    shopping = build_shopping()

    out_path = os.path.join(BASE, "services_db.js")
    content = "// Auto-generated from datasets/ — hotels, restaurants, shopping (Jharkhand + J&K)\n"
    content += f"const hotelsDatabase = {json.dumps(hotels, indent=2, ensure_ascii=False)};\n\n"
    content += f"const restaurantsDatabase = {json.dumps(restaurants, indent=2, ensure_ascii=False)};\n\n"
    content += f"const shoppingDatabase = {json.dumps(shopping, indent=2, ensure_ascii=False)};\n\n"
    content += "if (typeof module !== 'undefined' && module.exports) {\n"
    content += "  module.exports = { hotelsDatabase, restaurantsDatabase, shoppingDatabase };\n"
    content += "}\n"

    with open(out_path, "w", encoding="utf-8") as f:
        f.write(content)

    print(f"💾 services_db.js written: {len(hotels)} hotels, {len(restaurants)} restaurants, {len(shopping)} shops.")


if __name__ == "__main__":
    append_jk_to_jhardb()
    write_services_db()
    print("\n✅ Done. Include services_db.js in your HTML before app.js:")
    print('   <script src="jhardb.js"></script>')
    print('   <script src="services_db.js"></script>')
    print('   <script src="i18n.js"></script>')
    print('   <script src="app.js"></script>')
