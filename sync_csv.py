import csv
import json
import os
import re


# CONFIGURATION: Adjust these filenames if needed
CSV_FILENAME = 'datasets/jhar_tourism_dataset.csv'
JS_FILENAME = 'jhardb.js'

# Default mapping configurations
# Left side = fields Drishti expects
# Right side = standard CSV headers we search for (case-insensitive)
COLUMN_MAPPING_DEFAULTS = {
    'name': ['name', 'title', 'place', 'attraction'],
    'state': ['state', 'region', 'location_state', 'province'],
    'category': ['category', 'type', 'genre'],
    'summary': ['summary', 'short_description', 'overview'],
    'description': ['description', 'details', 'about', 'info'],
    'location': ['location', 'address', 'district'],
    'latitude': ['latitude', 'lat'],
    'longitude': ['longitude', 'lng', 'lon'] ,  
    'howToReach': ['how_to_reach', 'route', 'travel', 'reach'],
    'accessibility': ['accessibility', 'blind_guide', 'disabled_access', 'accessibility_info'],
    'images': ['images', 'image', 'image_url', 'photo', 'photos', 'gallery'],
    'reviews':['reviews', 'review'],
    'rating':['rating','ratings'],
    'sentiment':['Sentiment_score']
}

def normalize_text(value):
    if value is None:
        return ""
    return str(value).strip()

def split_images(value):
    text = normalize_text(value)
    if not text:
        return []
    parts = re.split(r'[|;]\s*', text)
    cleaned = []
    for part in parts:
        p = part.strip()
        if p:
            cleaned.append(p)
    return cleaned

def sync():
    if not os.path.exists(CSV_FILENAME):
        print(f"\n❌ Error: Could not find '{CSV_FILENAME}' in the folder.")
        print(f"👉 Please copy your CSV file into: {os.getcwd()}")
        print(f"👉 Rename it exactly to: {CSV_FILENAME}")
        print("Then run this script again.")
        return

    print(f"\n📂 Reading '{CSV_FILENAME}'...")
    
    places = []
    
    with open(CSV_FILENAME, mode='r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        
        # Read column headers in CSV
        headers = reader.fieldnames
        if not headers:
            print("❌ Error: The CSV file appears to be empty or has no header row.")
            return
            
        print(f"📋 Detected CSV columns: {headers}")
        
        # Map system fields to CSV headers
        mapping = {}
        for key, fallback_list in COLUMN_MAPPING_DEFAULTS.items():
            matched_header = None
            
            # Step 1: Look for exact case-insensitive matches in fallback_list
            for fallback in fallback_list:
                for h in headers:
                    if h.lower() == fallback.lower():
                        matched_header = h
                        break
                if matched_header:
                    break
                    
            # Step 2: If no match, check if any headers contain the key name as a substring
            if not matched_header:
                for h in headers:
                    if key.lower() in h.lower():
                        matched_header = h
                        break
                        
            mapping[key] = matched_header
            if matched_header:
                print(f"  ✅ Mapped system field '{key}' ──> CSV column '{matched_header}'")
            else:
                print(f"  ⚠️ Warning: System field '{key}' has no matching CSV column. Using default placeholder.")

        # Process rows
        row_count = 0
        for row in reader:
            row_count += 1
            
            # Retrieve values using the mapped headers
            name = row.get(mapping['name']) if mapping['name'] else f"Destination {row_count}"
            state = row.get(mapping['state']) if mapping['state'] else "India"
            category = row.get(mapping['category']) if mapping['category'] else "Tourist Spot"
            summary = row.get(mapping['summary']) or row.get(mapping['description']) or "A wonderful tourist destination."
            description = row.get(mapping['description']) or summary
            location = row.get(mapping['location']) if mapping['location'] else "Location details not specified."
            latitude = row.get(mapping['latitude'])
            longitude = row.get(mapping['longitude'])
            how_to_reach = row.get(mapping['howToReach']) if mapping['howToReach'] else "Travel routes not specified."
            accessibility = row.get(mapping['accessibility']) if mapping['accessibility'] else "No specific accessibility barriers reported. Sighted guidance is always recommended for a safe and comfortable visit."
            images = split_images(row.get(mapping['images'])) if mapping['images'] else []
            reviews = row.get(mapping['reviews'])
            rating = row.get(mapping['rating'])
            sentiment = row.get(mapping['sentiment'])


            
            # If summary is too long, truncate it for the UI card summary

            # short_summary = summary
            # if len(short_summary) > 150:
            #     short_summary = short_summary[:147] + "..."

            sentences = re.split(r'(?<=[.!?])\s+', summary)
            short_summary = " ".join(sentences[:3])
                
            # Create a web-safe ID (lowercase, replace spaces with hyphens, alphanumeric only)
            place_id = name.lower().strip().replace(" ", "-").replace("&", "and").replace(",", "")
            place_id = "".join([c for c in place_id if c.isalnum() or c == '-'])
            
            # Formulate text-to-speech audio description

            # audio_desc = f"{name} is a {category} situated in {state}. {description}"
            audio_desc = f"{description}"

            
            # Formulate search keywords list
            keywords = [name.lower(), state.lower(), category.lower()] + name.lower().split()
            keywords = list(set([k.strip() for k in keywords if k.strip()]))
            
            place_data = {
                'id': place_id,
                'name': name,
                'state': state,
                'category': category,
                'keywords': keywords,
                'summary': short_summary,
                'audioDescription': audio_desc,
                'location': location,
                'latitude': latitude,
                'longitude': longitude,
                'howToReach': how_to_reach,
                'accessibility': accessibility,
                'images': images,
                'reviews':reviews,
                'rating':rating,
                'sentiment':sentiment
            }
            places.append(place_data)
            
    print(f"\n✨ Successfully processed {len(places)} travel records.")
    
    # Write to db.js
    js_content = f"const travelDatabase = {json.dumps(places, indent=2)};\n\n"
    js_content += "if (typeof module !== 'undefined' && module.exports) {\n"
    js_content += "  module.exports = travelDatabase;\n"
    js_content += "}\n"
    
    with open(JS_FILENAME, mode='w', encoding='utf-8') as f:
        f.write(js_content)
        
    print(f"💾 Updated JS database file '{JS_FILENAME}' successfully!")
    print("🚀 Done! Simply refresh your browser tab at http://localhost:8000 to see your database loaded!")

if __name__ == '__main__':
    sync()
