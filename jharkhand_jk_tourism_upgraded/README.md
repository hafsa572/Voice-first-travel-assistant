# Jharkhand & Jammu-Kashmir Tourism — Chatbot + AI Recommender

A voice/text chatbot for Jharkhand **and Jammu & Kashmir** tourism, hotels,
restaurants, and shopping recommendations, plus a **machine-learning
recommendation engine** that suggests similar places using TF-IDF
content-based filtering.

---

## Project Structure

```
jharkhand_tourism_enhanced/
├── bootstrap_index.html    ← Chatbot frontend (open this in your browser)
├── app.js                  ← Chatbot logic + recommendation integration
├── i18n.js                 ← English / Hindi / Hinglish translations
├── style_bs.css            ← All styles (chatbot + recommendation panel)
├── jhardb.js               ← Tourist attraction database (Jharkhand + J&K)
├── services_db.js          ← Hotel / restaurant / shopping database
├── build_extra_db.py       ← Rebuilds jhardb.js's J&K entries + services_db.js from datasets/
├── sync_csv.py             ← Rebuilds jhardb.js's Jharkhand entries from the main CSV
├── recommend_server.py     ← Flask API server for the ML recommendation engine (optional)
├── requirements.txt        ← Python dependencies for recommend_server.py
└── datasets/
    ├── jhar_tourism_dataset.csv   ← Jharkhand attractions (56 places)
    ├── Jk_tourism_dataset.csv     ← Jammu & Kashmir attractions (48 places)
    ├── Jhar1_Hotels.csv           ← Jharkhand hotels
    ├── JK_accommodation.csv       ← Jammu & Kashmir hotels/houseboats/camps
    ├── Jhar_restaurants.csv       ← Jharkhand restaurants
    └── Jhar_Shopping.csv          ← Jharkhand markets/shops
```

---

## How to Run

### Step 1 — Just open it

`jhardb.js` and `services_db.js` are already generated and committed, so you
can open `bootstrap_index.html` directly, or serve it locally (recommended,
since voice recognition needs a server, not a `file://` URL):

```bash
cd jharkhand_tourism_enhanced
python -m http.server 8000
```

Then open **http://localhost:8000/bootstrap_index.html** in Chrome or Edge.

### Step 2 (optional) — Regenerate the databases after editing a CSV

If you edit any file in `datasets/`, rebuild the JS databases:

```bash
python build_extra_db.py   # rebuilds J&K attractions in jhardb.js + services_db.js
python sync_csv.py         # rebuilds the Jharkhand attractions in jhardb.js (run this first if you change jhar_tourism_dataset.csv)
```

### Step 3 (optional) — Start the ML Recommendation Server

This powers the "similar places" panel shown under a Jharkhand place card.

```bash
pip install -r requirements.txt
python recommend_server.py
```

Keep this terminal open. The server runs on **http://localhost:5050**. If it
isn't running, the chatbot still works fine — it just skips the "similar
places" panel.

---

## What the Chatbot Can Do

- **Places**: "Suggest places in Jharkhand", "places in Kashmir", "Tell me about Dal Lake"
- **Hotels**: "Suggest hotels in Ranchi", "hotels in Srinagar", "hotels near here" (after selecting a place)
- **Restaurants**: "restaurants in Jamshedpur", "where can I eat" (Jharkhand only — no restaurant dataset for J&K yet)
- **Shopping**: "shopping in Ranchi", "markets in Dhanbad" (Jharkhand only — no shopping dataset for J&K yet)
- Works in **English, Hindi, and Hinglish**, by voice or by typing in the chat box.

Hotel/restaurant/shopping results are matched by state (Jharkhand vs Jammu &
Kashmir) and, where mentioned or when a place is already selected, by
district — then sorted by rating.

### Available API Endpoints (recommend_server.py, optional)

| Endpoint | Description |
|---|---|
| `GET /api/similar?place=<name>&top=<n>` | ML-similar places (content-based) |
| `GET /api/category?cat=<cat>&vibe=<v>&top=<n>` | Top-rated by category/vibe |
| `GET /api/categories` | List all categories, vibes, districts |
| `GET /api/places` | All place names |
| `GET /api/health` | Server status |

### Graceful Fallback

If the recommendation server is **not running**, the chatbot works exactly as
before — `fetchSimilarPlaces` silently returns an empty list and no
recommendation panel is shown. Hotel/restaurant/shopping recommendations do
**not** depend on this server at all — they run entirely client-side from
`services_db.js`.

---

## Recommendation Engine Details

- **Algorithm**: TF-IDF vectorisation → cosine similarity
- **Features used**: `category`, `tags`, `activities`, `vibe`, `best_season`, `description` (J&K places have no `description` field yet, so their similarity relies more on tags/activities/vibe/category)
- **Vocabulary**: top 500 terms (reduces noise from long descriptions)
- **Dataset**: 105 places — 57 Jharkhand + 48 Jammu & Kashmir
- **Same-state preference**: recommendations prioritize places in the same state as the one you're viewing (a Jharkhand temple recommends other Jharkhand temples first, not J&K ones), only filling remaining slots cross-state if there aren't enough same-state matches
- **Cold-start**: handled via category + rating filter (`/api/category`)

---

## v2 Upgrade — Flexible Query Parsing + Budget Filtering

This adds three things on top of the original engine:

1. **Budget-aware hotels & restaurants.** Both datasets already had real
   price columns (`Price`, `Avg price`, `Price/Night`) — they just weren't
   exposed. Prices are now bucketed into **Budget / Moderate / Premium /
   Luxury** tiers, filterable via `/api/hotels` and `/api/restaurants`, or an
   exact numeric range (`min_price` / `max_price`).

2. **`/api/smart_query?q=<anything>`** — a single endpoint that reads free
   text, coherent or not, and:
   - decides if the user wants places, hotels, or restaurants
   - pulls out whatever it can find — category, tags, activities, vibe,
     season, budget, state, district — tolerating typos via fuzzy matching
   - for places: matches an actual named place if one appears in the text,
     otherwise ranks every place by TF-IDF similarity to the raw query text
     itself (so word order/grammar doesn't matter — "waterfall monsoon cheap
     adventure ranchi" works fine)
   - returns an `interpreted` block describing what it understood, so the
     frontend can show it back to the user instead of acting as a black box

3. **Visible budget picker + "here's what I understood" panel** in the
   chatbot UI. After any hotel/restaurant/place result, a row of tappable
   Budget/Moderate/Premium/Luxury chips appears — refining the search is one
   tap, not a re-typed sentence. A small transparency panel above it lists
   exactly which filters (category, season, vibe, budget, etc.) were
   detected from the query.

**Graceful degradation is preserved**: if `recommend_server.py` isn't
running, `handleSmartQuery` in `app.js` returns `false` and control falls
through to the original client-side keyword matching — the chatbot never
breaks, it just loses the richer NLU and tag/activity/season awareness
(budget filtering for hotels/restaurants still works client-side too, since
the price data already lives in `services_db.js`).

### New/changed endpoints
| Endpoint | Description |
|---|---|
| `GET /api/hotels?district=&state=&budget=&min_price=&max_price=&min_rating=&top=` | Budget-filterable hotel search |
| `GET /api/restaurants?district=&budget=&cuisine=&veg=&min_price=&max_price=&top=` | Budget-filterable restaurant search |
| `GET /api/smart_query?q=<free text>&top=` | Flexible NLU-style query across places/hotels/restaurants |

### Try it
```bash
curl "http://localhost:5050/api/smart_query?q=peaceful+waterfall+winter+moderate+budget"
curl "http://localhost:5050/api/smart_query?q=cheap+hotels+in+ranchi"
curl "http://localhost:5050/api/hotels?state=Jammu%20and%20Kashmir&budget=Luxury"
```

### Known gaps this doesn't solve
- Places have no price data at all, so budget filtering only applies to
  hotels/restaurants, not attractions themselves.
- `jhardb.js` (the client-side place database) doesn't carry tags/
  activities/vibe/season — that richer filtering only kicks in when
  `recommend_server.py` is running, since only it has the full CSV data.
- Fuzzy matching tolerates small typos (~1-2 character edits) but won't
  catch wildly misspelled or phonetic input.

---

## Known Limitations / Possible Next Steps


- There's no restaurant or shopping dataset for Jammu & Kashmir yet — only
  hotels/accommodation. Add a CSV in the same shape as the Jharkhand ones and
  re-run `build_extra_db.py` to wire it in.
- District matching for hotels/restaurants/shopping is a simple case-insensitive
  substring match against the query text; very similar district names could
  theoretically collide (none currently do in this dataset).

