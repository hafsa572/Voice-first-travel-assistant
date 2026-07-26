"""
Jharkhand & J&K Tourism Recommendation Server (v2 — "flexible query" upgrade)
Merges the ML recommendation engine with the chatbot frontend via a REST API.

Usage:
    pip install flask flask-cors pandas scikit-learn
    python recommend_server.py

NEW IN THIS VERSION
--------------------
1. Budget-aware hotel & restaurant endpoints (/api/hotels, /api/restaurants) —
   each place already has a real price column in its CSV; this just buckets
   it into Budget / Moderate / Premium / Luxury and lets the API filter on it.
2. /api/smart_query — a single, forgiving endpoint that takes ANY free-text
   user message (coherent or a jumble of keywords) and:
     - figures out whether the user wants places, hotels, or restaurants
     - pulls out whichever of {category, tags, activities, vibe, season,
       budget, state, district} it can find, tolerating typos/synonyms
     - for places: combines those hard filters with a TF-IDF similarity
       score computed directly on the raw query text, so even a query with
       no grammar ("waterfall monsoon adventure cheap") still ranks places
       sensibly
     - returns an `interpreted` block describing exactly what it understood,
       so the frontend can show the user a transparent "here's what I heard"
       chip row instead of a black box.

Endpoints:
    GET  /api/similar?place=<n>&top=<n>
    GET  /api/category?cat=<cat>&vibe=<v>&top=<n>
    GET  /api/categories
    GET  /api/places
    GET  /api/hotels?district=&state=&budget=&min_rating=&top=
    GET  /api/restaurants?district=&state=&budget=&cuisine=&veg=&top=
    GET  /api/shopping?district=&category=&min_rating=&top=
    GET  /api/smart_query?q=<free text>&top=<n>
    GET  /api/health
"""

from flask import Flask, jsonify, request
from flask_cors import CORS
import pandas as pd
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import warnings, os, re, difflib

warnings.filterwarnings("ignore")

app = Flask(__name__)
CORS(app)

BASE = os.path.dirname(__file__)
JHAR_CSV_PATH = os.path.join(BASE, "datasets", "jhar_tourism_dataset.csv")
JK_CSV_PATH = os.path.join(BASE, "datasets", "Jk_tourism_dataset.csv")
JHAR_HOTELS_PATH = os.path.join(BASE, "datasets", "Jhar1_Hotels.csv")
JK_HOTELS_PATH = os.path.join(BASE, "datasets", "JK_accommodation.csv")
JHAR_RESTAURANTS_PATH = os.path.join(BASE, "datasets", "Jhar_restaurants.csv")
JHAR_SHOPPING_PATH = os.path.join(BASE, "datasets", "Jhar_Shopping.csv")


# ─────────────────────────────────────────────
# 1. LOAD & CLEAN PLACES DATASET
# ─────────────────────────────────────────────
def load_single(path, default_state=None):
    df = pd.read_csv(path)
    df.columns = [c.strip().lower().replace(" ", "_") for c in df.columns]
    if "description" in df.columns and "description_api" not in df.columns:
        df = df.rename(columns={"description": "description_api"})
    if default_state and "state" not in df.columns:
        df["state"] = default_state
    return df


def load_data():
    jhar_df = load_single(JHAR_CSV_PATH, default_state="Jharkhand")
    jk_df = load_single(JK_CSV_PATH, default_state="Jammu and Kashmir")
    df = pd.concat([jhar_df, jk_df], ignore_index=True, sort=False)

    if "rating" not in df.columns:
        df["rating"] = np.nan
    df["rating"] = pd.to_numeric(df["rating"], errors="coerce")
    df["rating"] = df["rating"].fillna(df["rating"].median() if df["rating"].notna().any() else 0)

    for col in ["tags", "activities", "vibe", "category", "best_season", "description_api"]:
        if col not in df.columns:
            df[col] = ""
        else:
            df[col] = df[col].fillna("")

    for col in ["district", "state"]:
        if col not in df.columns:
            df[col] = ""
        else:
            df[col] = df[col].fillna("")

    df = df.reset_index(drop=True)
    df["place_id"] = df.index
    return df


df = load_data()
print(f"✅ Places loaded: {len(df)} across {df['district'].nunique()} districts "
      f"({df['state'].nunique()} states: {', '.join(sorted(df['state'].unique()))})")


# ─────────────────────────────────────────────
# 2. LOAD HOTELS & RESTAURANTS (WITH REAL PRICE DATA)
# ─────────────────────────────────────────────

# Budget bucket cutoffs, tuned to the observed price ranges in each dataset.
# (₹ per night for hotels, ₹ average-meal for restaurants)
HOTEL_BUDGET_BANDS = [
    ("Budget", 0, 3000),
    ("Moderate", 3000, 6000),
    ("Premium", 6000, 12000),
    ("Luxury", 12000, float("inf")),
]
RESTAURANT_BUDGET_BANDS = [
    ("Budget", 0, 400),
    ("Moderate", 400, 700),
    ("Premium", 700, 1200),
    ("Luxury", 1200, float("inf")),
]


def bucket_price(price, bands):
    if pd.isna(price):
        return "Unknown"
    for label, lo, hi in bands:
        if lo <= price < hi:
            return label
    return bands[-1][0]


def load_hotels():
    jhar = pd.read_csv(JHAR_HOTELS_PATH)
    jhar = jhar.rename(columns={
        "Hotel_Name": "name", "District": "district", "Category": "type",
        "Star Rating": "star", "Price": "price", "Nearby Attractions": "notes",
        "Rating": "rating", "Recommended For": "recommended_for",
    })
    jhar["state"] = "Jharkhand"

    jk = pd.read_csv(JK_HOTELS_PATH)
    jk = jk.rename(columns={
        "Name": "name", "Region": "district", "Type": "hotel_kind", "Category": "type",
        "Price/Night": "price", "Amenities": "notes", "Rating": "rating",
        "Recommended For": "recommended_for",
    })
    jk["state"] = "Jammu and Kashmir"
    jk["star"] = np.nan

    keep = ["name", "district", "state", "type", "star", "price", "notes", "rating", "recommended_for"]
    for d in (jhar, jk):
        for c in keep:
            if c not in d.columns:
                d[c] = np.nan

    hotels = pd.concat([jhar[keep], jk[keep]], ignore_index=True)
    hotels["price"] = pd.to_numeric(hotels["price"], errors="coerce")
    hotels["rating"] = pd.to_numeric(hotels["rating"], errors="coerce").fillna(0)
    hotels["budget_category"] = hotels["price"].apply(lambda p: bucket_price(p, HOTEL_BUDGET_BANDS))
    hotels["notes"] = hotels["notes"].fillna("")
    hotels["recommended_for"] = hotels["recommended_for"].fillna("")
    hotels["type"] = hotels["type"].fillna("")
    return hotels.reset_index(drop=True)


def load_restaurants():
    r = pd.read_csv(JHAR_RESTAURANTS_PATH)
    r = r.rename(columns={
        "Restaurant_name": "name", "District": "district", "Cuisine Type": "cuisine",
        "Pure Veg": "pure_veg", "Meal Type": "meal_type", "Avg price": "price",
        "Timing": "timing", "Rating": "rating", "Nearest Landmark": "landmark",
        "Recommended For": "recommended_for",
    })
    r["state"] = "Jharkhand"  # no restaurant dataset for J&K yet
    r["price"] = pd.to_numeric(r["price"], errors="coerce")
    r["rating"] = pd.to_numeric(r["rating"], errors="coerce").fillna(0)
    r["budget_category"] = r["price"].apply(lambda p: bucket_price(p, RESTAURANT_BUDGET_BANDS))
    for c in ["cuisine", "meal_type", "timing", "landmark", "recommended_for", "pure_veg"]:
        r[c] = r[c].fillna("")
    return r.reset_index(drop=True)


def load_shopping():
    s = pd.read_csv(JHAR_SHOPPING_PATH)
    s = s.rename(columns={
        "Shop_name": "name", "District": "district", "Category": "category",
        "Products Available": "products", "Timing": "timing",
        "Nearest Landmark": "landmark", "Rating": "rating",
        "Special Attraction": "special_attraction", "Recommended For": "recommended_for",
    })
    s["state"] = "Jharkhand"  # no shopping dataset for J&K yet
    s["rating"] = pd.to_numeric(s["rating"], errors="coerce").fillna(0)
    for c in ["category", "products", "timing", "landmark", "special_attraction", "recommended_for"]:
        s[c] = s[c].fillna("")
    return s.reset_index(drop=True)


hotels_df = load_hotels()
restaurants_df = load_restaurants()
shopping_df = load_shopping()
print(f"✅ Hotels loaded: {len(hotels_df)}  |  Restaurants loaded: {len(restaurants_df)}  |  "
      f"Shopping loaded: {len(shopping_df)}")


def hotel_to_json(row):
    return {
        "name": row["name"], "district": row["district"], "state": row["state"],
        "type": row["type"], "star_rating": None if pd.isna(row["star"]) else row["star"],
        "price_per_night": None if pd.isna(row["price"]) else row["price"],
        "budget_category": row["budget_category"], "rating": row["rating"],
        "notes": row["notes"], "recommended_for": row["recommended_for"],
    }


def restaurant_to_json(row):
    return {
        "name": row["name"], "district": row["district"], "state": row["state"],
        "cuisine": row["cuisine"], "pure_veg": row["pure_veg"], "meal_type": row["meal_type"],
        "avg_price": None if pd.isna(row["price"]) else row["price"],
        "budget_category": row["budget_category"], "rating": row["rating"],
        "timing": row["timing"], "landmark": row["landmark"],
        "recommended_for": row["recommended_for"],
    }


def shopping_to_json(row):
    return {
        "name": row["name"], "district": row["district"], "state": row["state"],
        "category": row["category"],
        "products": [p.strip() for p in str(row["products"]).split(",") if p.strip()],
        "timing": row["timing"], "landmark": row["landmark"], "rating": row["rating"],
        "special_attraction": row["special_attraction"], "recommended_for": row["recommended_for"],
    }


# ─────────────────────────────────────────────
# 3. CONTENT-BASED RECOMMENDER (TF-IDF + Cosine Similarity)
# ─────────────────────────────────────────────
class ContentRecommender:
    """
    Built as three cumulative layers so each one's contribution can be
    measured on its own (see evaluate_recommender.py --layers):

      1. CBRS  — pure Content-Based RS: TF-IDF text similarity + same-category
                 boost. No notion of *where*/*when* the user is, no review data.
      2. CDRS  — Context-Dependent RS: CBRS + real geographic proximity
                 (haversine distance between place coordinates) + a
                 best-season match. This is "context" in the classical CARS
                 sense — location and time-of-visit reshape the ranking.
      3. CSRS  — CDRS + a sentiment prior from the `sentiment_score` /
                 `sentiment_label` columns (review-derived), used as a
                 quality signal that nudges genuinely well-reviewed places up.

    `use_context` / `use_sentiment` pick which cumulative layer becomes the
    live `self.sim` used by `recommend()`/`query()`; all three matrices are
    always computed and kept on the instance so they can be compared directly.
    """

    # Same-category vs raw TF-IDF text similarity (see note in build_content_soup).
    CATEGORY_BOOST_WEIGHT = 0.35
    # How much the CDRS layer blends in geo-proximity + season match on top of CBRS.
    CONTEXT_BOOST_WEIGHT = 0.25
    # Split of the context weight between "where" (geo) and "when" (season).
    CONTEXT_GEO_SHARE = 0.65
    # Distance (km) at which the geo-proximity boost decays to ~1/e of its max.
    GEO_DECAY_KM = 150.0
    # How much the CSRS layer blends in the sentiment prior on top of CDRS.
    SENTIMENT_BOOST_WEIGHT = 0.10

    _LABEL_TO_SCORE = {
        "positive": 0.6, "negative": -0.6, "neutral": 0.0, "mixed": 0.0,
    }

    def __init__(self, df, use_context: bool = True, use_sentiment: bool = True):
        self.df = df.copy()
        self._build_content_soup()
        self._fit_tfidf()

        self.sim_cbrs = self._build_cbrs_similarity()
        self.context_score = self._build_context_score()
        self.sim_cdrs = self._blend(self.sim_cbrs, self.context_score, self.CONTEXT_BOOST_WEIGHT)
        self.sentiment_prior = self._build_sentiment_prior()
        self.sim_csrs = self._blend_prior(self.sim_cdrs, self.sentiment_prior, self.SENTIMENT_BOOST_WEIGHT)

        if use_context and use_sentiment:
            self.sim = self.sim_csrs
        elif use_context:
            self.sim = self.sim_cdrs
        else:
            self.sim = self.sim_cbrs

        print(f"✅ Content-Based Recommender ready (context={use_context}, sentiment={use_sentiment})")

    # ---- layer 1: content ----------------------------------------------
    def _build_content_soup(self):
        # Category/vibe/tags are repeated to weight them more heavily than
        # free-text description in the TF-IDF vocabulary — they're the
        # strongest, least noisy signals of "this is a similar kind of
        # place", so up-weighting them measurably improves recommendation
        # quality (validated with evaluate_recommender.py).
        self.df["content_soup"] = (
            ((self.df["category"] + " ") * 3)
            + ((self.df["tags"].str.replace(",", " ") + " ") * 2)
            + self.df["activities"].str.replace(",", " ") + " "
            + ((self.df["vibe"] + " ") * 2)
            + self.df["best_season"].str.replace(",", " ") + " "
            + self.df["description_api"]
        )

    def _fit_tfidf(self):
        # max_df=0.5 drops terms that appear in more than half the dataset
        # ("sightseeing", "nature", "photography", "scenic", ... show up on
        # 50-80% of places) — those terms add noise, not signal, to how
        # similar two SPECIFIC places are. sublinear_tf dampens the effect of
        # a term just appearing many times in one soup (e.g. category
        # repeated x3) so raw repetition counts for less than which terms are
        # present at all. Both changes were validated to raise recall/F1 in
        # evaluate_recommender.py without hurting precision.
        self.tfidf = TfidfVectorizer(
            stop_words="english", max_features=500, ngram_range=(1, 2),
            max_df=0.5, sublinear_tf=True,
        )
        self.matrix = self.tfidf.fit_transform(self.df["content_soup"])

    def _build_cbrs_similarity(self):
        text_sim = cosine_similarity(self.matrix, self.matrix)
        # Blend in an explicit same-category boost: two places in the same
        # category (e.g. two waterfalls) are almost always a sensible
        # recommendation for each other even when their descriptions use
        # different words, so this fills the gap that pure text similarity
        # misses. This is still pure CONTENT — no location/time/review data.
        cats = self.df["category"].str.lower().to_numpy(dtype=object)
        same_category = (cats[:, None] == cats[None, :]).astype(float)
        w = self.CATEGORY_BOOST_WEIGHT
        sim = (1 - w) * text_sim + w * same_category
        np.fill_diagonal(sim, 1.0)
        return sim

    # ---- layer 2: context (geo + season) --------------------------------
    def _build_context_score(self):
        """Pairwise context score in [0, 1]: real geographic proximity
        (haversine, decaying with distance) blended with a best-season
        overlap flag. This is what "context-aware" (CARS) means here —
        WHERE a place is and WHEN it's good to visit, independent of what
        the place's description says about itself."""
        lat = np.radians(self.df["latitude"].to_numpy(dtype=float))
        lon = np.radians(self.df["longitude"].to_numpy(dtype=float))
        dlat = lat[:, None] - lat[None, :]
        dlon = lon[:, None] - lon[None, :]
        a = np.sin(dlat / 2) ** 2 + np.cos(lat[:, None]) * np.cos(lat[None, :]) * np.sin(dlon / 2) ** 2
        dist_km = 2 * 6371.0 * np.arcsin(np.sqrt(np.clip(a, 0, 1)))
        proximity = np.exp(-dist_km / self.GEO_DECAY_KM)  # 1.0 at same spot, decays with distance

        season_sets = self.df["best_season"].fillna("").apply(
            lambda s: set(t.strip().lower() for t in s.split(",") if t.strip())
        ).tolist()

        def season_match(i, j):
            si, sj = season_sets[i], season_sets[j]
            if "all season" in si or "all season" in sj:
                return 1.0
            return 1.0 if (si & sj) else 0.0

        n = len(self.df)
        season = np.zeros((n, n))
        for i in range(n):
            for j in range(n):
                season[i, j] = season_match(i, j)

        geo_share = self.CONTEXT_GEO_SHARE
        return geo_share * proximity + (1 - geo_share) * season

    def _blend(self, base_sim, extra_score, weight):
        blended = (1 - weight) * base_sim + weight * extra_score
        np.fill_diagonal(blended, 1.0)
        return blended

    # ---- layer 3: sentiment ---------------------------------------------
    def _build_sentiment_prior(self):
        """Per-candidate (not pairwise) quality prior in [-1, 1] built from
        review-derived `sentiment_score`, falling back to `sentiment_label`
        when the numeric score is missing. Places with NEITHER (the dataset
        has plenty — no review text, or reviews about a different location)
        get exactly 0 contribution rather than a fabricated neutral value,
        so the sparse/noisy sentiment coverage can't silently distort
        rankings for places it has no real evidence about."""
        def resolve(row):
            score = row["sentiment_score"]
            if pd.notna(score):
                return float(score)
            label = str(row.get("sentiment_label", "")).strip().lower()
            return self._LABEL_TO_SCORE.get(label, 0.0)

        return self.df.apply(resolve, axis=1).to_numpy(dtype=float)

    def _blend_prior(self, base_sim, prior, weight):
        # Broadcast the candidate's own sentiment prior across every row
        # (it's a property of the candidate place, not of the query/candidate
        # pair), scaled to [0, 1] first so it nudges rather than dominates.
        # Additive (not a convex blend like the other layers), so it's
        # clipped back to [0, 1] afterwards — otherwise a place that's
        # already a near-perfect content/context match AND well-reviewed
        # could report a similarity_score above 1.0, which would look like a
        # bug to anything consuming the API.
        prior01 = (prior + 1.0) / 2.0
        blended = base_sim + weight * prior01[None, :]
        blended = np.clip(blended, 0.0, 1.0)
        np.fill_diagonal(blended, 1.0)
        return blended

    def _format(self, indices, sim_scores):
        result = self.df.iloc[indices][
            ["place_name", "district", "state", "category", "vibe", "best_season",
             "rating", "description_api", "image_url"]
        ].copy()
        result["similarity_score"] = [round(s, 3) for s in sim_scores]
        result["description_api"] = result["description_api"].apply(
            lambda x: (x[:160] + "…") if isinstance(x, str) and len(x) > 160 else x
        )
        return result.reset_index(drop=True).to_dict(orient="records")

    def recommend(self, place_name: str, top_n: int = 5):
        matches = self.df[self.df["place_name"].str.lower() == place_name.lower()]
        if matches.empty:
            matches = self.df[self.df["place_name"].str.lower().str.contains(place_name.lower())]
        if matches.empty:
            return None, f"Place '{place_name}' not found."

        idx = matches.index[0]
        source_state = self.df.iloc[idx]["state"]

        scores = list(enumerate(self.sim[idx]))
        scores = [s for s in scores if s[0] != idx]

        # Same-state places are still preferred (a Jharkhand temple should
        # surface other Jharkhand temples first), but as a small tie-break
        # bonus rather than a hard split — real geo-distance in the context
        # layer already does most of this work (Jharkhand and J&K are >1500km
        # apart), this bonus just guards the same behavior when context is
        # switched off (CBRS-only mode).
        SAME_STATE_BONUS = 0.05
        if source_state:
            scores = sorted(
                scores,
                key=lambda s: s[1] + (SAME_STATE_BONUS if self.df.iloc[s[0]]["state"] == source_state else 0.0),
                reverse=True,
            )
        else:
            scores = sorted(scores, key=lambda x: x[1], reverse=True)
        scores = scores[:top_n]

        indices = [i[0] for i in scores]
        sim_scores = [i[1] for i in scores]
        return self._format(indices, sim_scores), None

    def query(self, raw_text: str, hard_mask=None, top_n: int = 6):
        """
        Free-text query: vectorises the raw user text with the SAME fitted
        vectorizer and ranks every place by cosine similarity to it. This is
        what makes messy/incoherent input work — TF-IDF only cares about
        which words overlap, not grammar or word order.

        hard_mask: optional boolean pandas Series to restrict candidates to
        (e.g. only Winter places, only Jharkhand, only Waterfalls) before
        ranking by text similarity.
        """
        qvec = self.tfidf.transform([raw_text])
        sims = cosine_similarity(qvec, self.matrix)[0]

        candidates = self.df.index
        if hard_mask is not None:
            candidates = self.df.index[hard_mask]
            if len(candidates) == 0:
                candidates = self.df.index  # nothing matched the filter — fall back to all places

        scored = sorted(((i, sims[i]) for i in candidates), key=lambda x: x[1], reverse=True)
        # if literally nothing overlaps with the query text, fall back to top-rated among candidates
        if all(s <= 0 for _, s in scored):
            fallback = self.df.loc[candidates].sort_values("rating", ascending=False).head(top_n)
            return self._format(fallback.index.tolist(), [0.0] * len(fallback))

        scored = scored[:top_n]
        indices = [i for i, _ in scored]
        sim_scores = [s for _, s in scored]
        return self._format(indices, sim_scores)


recommender = ContentRecommender(df)


# ─────────────────────────────────────────────
# 4. FLEXIBLE INTENT PARSER (handles coherent AND incoherent queries)
# ─────────────────────────────────────────────
SERVICE_KEYWORDS = {
    "hotel": ["hotel", "hotels", "stay", "stays", "accommodation", "resort", "resorts", "lodge",
              "houseboat", "camp", "camping", "होटल", "ठहरने", "रहने"],
    "restaurant": ["restaurant", "restaurants", "food", "eat", "dine", "dining", "cuisine",
                   "meal", "khana", "khaana", "खाना", "भोजन"],
    "shopping": ["shopping", "shop", "shops", "market", "markets", "bazaar", "haat",
                 "mall", "emporium", "souvenir", "souvenirs", "खरीदारी", "बाज़ार", "बाजार"],
    "place": ["place", "places", "visit", "sightseeing", "attraction", "destination", "spot"],
}

BUDGET_KEYWORDS = {
    # NOTE: "budget" alone is deliberately NOT a keyword here — it's an overloaded
    # word people also use generically ("what's a good moderate budget option?"),
    # so it would wrongly win against Moderate/Premium/Luxury. Multi-word phrases
    # like "low budget"/"tight budget" still catch the cheap-tier meaning.
    "Budget": ["cheap", "affordable", "low cost", "low-cost", "economical", "sasta", "inexpensive",
               "pocket friendly", "pocket-friendly", "backpacker", "low budget", "tight budget",
               "shoestring"],
    "Moderate": ["moderate", "mid range", "mid-range", "reasonable", "decent", "average budget",
                 "normal budget", "medium budget"],
    "Premium": ["premium", "upscale", "high quality", "good quality", "premium budget"],
    "Luxury": ["luxury", "luxurious", "5 star", "five star", "lavish", "high end", "high-end",
               "splurge", "no budget limit", "top tier", "top-tier"],
}
# checked longest phrase first so "moderate budget" wins over a bare "budget" fragment
_BUDGET_PHRASES_BY_LEN = sorted(
    ((label, kw) for label, kws in BUDGET_KEYWORDS.items() for kw in kws),
    key=lambda pair: -len(pair[1])
)

SEASON_SYNONYMS = {
    "winter": ["winter", "cold", "sardi"], "summer": ["summer", "hot", "garmi"],
    "monsoon": ["monsoon", "rain", "rainy", "barsaat"], "spring": ["spring"],
    "autumn": ["autumn", "fall"], "all season": ["anytime", "all season", "any time"],
}

# Number-range budget phrases like "under 3000", "below ₹5000", "between 2000 and 6000"
_NUM_UNDER = re.compile(r"(?:under|below|less than|upto|up to)\s*(?:₹|rs\.?|inr)?\s*(\d{3,6})", re.I)
_NUM_ABOVE = re.compile(r"(?:above|over|more than)\s*(?:₹|rs\.?|inr)?\s*(\d{3,6})", re.I)
_NUM_RANGE = re.compile(r"between\s*(?:₹|rs\.?|inr)?\s*(\d{3,6})\s*(?:and|to|-)\s*(?:₹|rs\.?|inr)?\s*(\d{3,6})", re.I)


def _fuzzy_contains(text, vocab_term, cutoff=0.82):
    """Tolerates minor typos: checks each word in text against vocab_term.
    Uses whole-word matching for the exact case so short terms (e.g. 'fall',
    'art') don't false-positive inside unrelated words (e.g. 'waterfall')."""
    words = re.findall(r"[a-zA-Z]+", text.lower())
    vt = vocab_term.lower()
    if " " in vt:  # multi-word phrase — safe to substring-match
        if vt in text.lower():
            return True
    elif _word_in(text.lower(), vt):
        return True
    return any(difflib.SequenceMatcher(None, w, vt).ratio() >= cutoff for w in words if len(w) > 3)


def _word_in(text, phrase):
    """Whole-word/phrase match — plain substring checks wrongly catch things
    like 'fall' inside 'waterfall', or 'eat' inside 'seat'."""
    return re.search(r"(?<![a-z])" + re.escape(phrase) + r"(?![a-z])", text) is not None


def detect_service_type(text):
    for kind, kws in SERVICE_KEYWORDS.items():
        if any(_word_in(text, k) for k in kws):
            return kind
    return "place"  # default assumption


def detect_budget(text):
    m = _NUM_RANGE.search(text)
    if m:
        lo, hi = int(m.group(1)), int(m.group(2))
        return {"min_price": lo, "max_price": hi, "label": f"₹{lo}–₹{hi}"}
    m = _NUM_UNDER.search(text)
    if m:
        hi = int(m.group(1))
        return {"min_price": 0, "max_price": hi, "label": f"under ₹{hi}"}
    m = _NUM_ABOVE.search(text)
    if m:
        lo = int(m.group(1))
        return {"min_price": lo, "max_price": float("inf"), "label": f"above ₹{lo}"}
    for label, phrase in _BUDGET_PHRASES_BY_LEN:
        if _word_in(text, phrase):
            return {"band": label, "label": label}
    return None


def detect_season(text):
    for canonical, kws in SEASON_SYNONYMS.items():
        if any(_word_in(text, k) for k in kws):
            return canonical.title()
    return None


def detect_from_vocab(text, series, cutoff=0.82):
    """Fuzzy-match free text against the distinct values of a dataframe column
    (used for category, vibe, state, district — all data-driven, no hardcoding)."""
    vocab = sorted(set(v for v in series.unique() if isinstance(v, str) and v.strip()))
    hits = []
    for term in vocab:
        for piece in re.split(r",\s*", term):
            piece = piece.strip()
            if piece and _fuzzy_contains(text, piece, cutoff):
                hits.append(term)
                break
    return hits


def detect_tags_activities(text):
    """Tags/activities are comma-separated free text in the CSVs, so build the
    vocab by splitting every row's tags+activities into individual terms."""
    vocab = set()
    for col in ["tags", "activities"]:
        for cell in df[col]:
            for term in str(cell).split(","):
                term = term.strip().lower()
                if term:
                    vocab.add(term)
    hits = [term for term in vocab if _fuzzy_contains(text, term)]
    return hits


def parse_intent(raw_text: str):
    text = raw_text.lower().strip()
    interpreted = {
        "service_type": detect_service_type(text),
        "budget": detect_budget(text),
        "season": detect_season(text),
        "category": detect_from_vocab(text, df["category"]),
        "vibe": detect_from_vocab(text, df["vibe"]),
        "state": detect_from_vocab(text, df["state"]),
        "district": detect_from_vocab(text, df["district"]),
        "tags_activities": detect_tags_activities(text),
    }
    return interpreted


# ─────────────────────────────────────────────
# 5. API ROUTES — EXISTING
# ─────────────────────────────────────────────
@app.route("/api/health")
def health():
    return jsonify({"status": "ok", "places": len(df), "hotels": len(hotels_df),
                     "restaurants": len(restaurants_df), "shopping": len(shopping_df)})


@app.route("/api/evaluate")
def evaluate_endpoint():
    """
    GET /api/evaluate?top=5&sample=50

    Scores the current place recommender: for each query place, every other
    place is treated as a binary "relevant / not relevant" candidate (same
    category, or a shared tag/activity), and the top-K recommendations are
    treated as the model's positive predictions — which turns this into a
    standard binary classification problem sklearn.metrics can score.
    See evaluate_recommender.py for the full explanation and a CLI version.
    """
    from evaluate_recommender import evaluate as _evaluate
    top_n = int(request.args.get("top", 5))
    sample = request.args.get("sample", type=int)
    return jsonify(_evaluate(top_k=top_n, sample=sample))


@app.route("/api/places")
def places():
    return jsonify(df["place_name"].tolist())


@app.route("/api/similar")
def similar():
    place = request.args.get("place", "").strip()
    top_n = int(request.args.get("top", 6))
    if not place:
        return jsonify({"error": "Missing ?place= parameter"}), 400
    results, err = recommender.recommend(place, top_n=top_n)
    if err:
        return jsonify({"error": err}), 404
    return jsonify({"query_place": place, "recommendations": results})


@app.route("/api/category")
def by_category():
    cat = request.args.get("cat", "").strip()
    vibe = request.args.get("vibe", "").strip()
    top_n = int(request.args.get("top", 6))
    if not cat:
        return jsonify({"error": "Missing ?cat= parameter"}), 400

    filtered = df[df["category"].str.lower() == cat.lower()]
    if vibe:
        vibe_filtered = filtered[filtered["vibe"].str.lower().str.contains(vibe.lower())]
        if not vibe_filtered.empty:
            filtered = vibe_filtered
    if filtered.empty:
        return jsonify({"error": f"No places found for category '{cat}'"}), 404

    result = (filtered.sort_values("rating", ascending=False).head(top_n)
              [["place_name", "district", "category", "vibe", "rating", "description_api", "image_url"]].copy())
    result["description_api"] = result["description_api"].apply(
        lambda x: (x[:160] + "…") if isinstance(x, str) and len(x) > 160 else x)

    bonus = []
    if len(result) > 0:
        bonus_results, _ = recommender.recommend(result.iloc[0]["place_name"], top_n=3)
        bonus = bonus_results or []

    return jsonify({"category": cat, "vibe_filter": vibe or None,
                     "top_rated": result.to_dict(orient="records"), "similar_to_top": bonus})


@app.route("/api/categories")
def categories():
    return jsonify({
        "categories": sorted(df["category"].dropna().unique().tolist()),
        "vibes": sorted(df["vibe"].dropna().unique().tolist()),
        "districts": sorted(df["district"].dropna().unique().tolist()),
        "seasons": sorted(set(s.strip() for cell in df["best_season"] for s in str(cell).split(",") if s.strip())),
        "budget_bands_hotels": [b[0] for b in HOTEL_BUDGET_BANDS],
        "budget_bands_restaurants": [b[0] for b in RESTAURANT_BUDGET_BANDS],
    })


# ─────────────────────────────────────────────
# 6. API ROUTES — NEW: BUDGET-AWARE HOTELS & RESTAURANTS
# ─────────────────────────────────────────────
@app.route("/api/hotels")
def api_hotels():
    """
    GET /api/hotels?district=Ranchi&budget=Moderate&min_rating=4&top=6
    budget accepts: Budget | Moderate | Premium | Luxury (case-insensitive),
    OR min_price=&max_price= for an exact numeric range.
    """
    district = request.args.get("district", "").strip().lower()
    state = request.args.get("state", "").strip().lower()
    budget = request.args.get("budget", "").strip().lower()
    min_price = request.args.get("min_price", type=float)
    max_price = request.args.get("max_price", type=float)
    min_rating = request.args.get("min_rating", type=float, default=0)
    top_n = int(request.args.get("top", 6))

    result = hotels_df.copy()
    if state:
        result = result[result["state"].str.lower() == state]
    if district:
        result = result[result["district"].str.lower().str.contains(district)]
    if budget:
        result = result[result["budget_category"].str.lower() == budget]
    if min_price is not None:
        result = result[result["price"] >= min_price]
    if max_price is not None:
        result = result[result["price"] <= max_price]
    result = result[result["rating"] >= min_rating]

    if result.empty:
        return jsonify({"error": "No hotels match those filters", "hotels": []}), 404

    result = result.sort_values("rating", ascending=False).head(top_n)
    return jsonify({
        "filters": {"district": district or None, "state": state or None, "budget": budget or None,
                    "min_price": min_price, "max_price": max_price, "min_rating": min_rating},
        "hotels": [hotel_to_json(r) for _, r in result.iterrows()],
    })


@app.route("/api/restaurants")
def api_restaurants():
    """
    GET /api/restaurants?district=Ranchi&budget=Budget&cuisine=chinese&veg=true&top=6
    """
    district = request.args.get("district", "").strip().lower()
    budget = request.args.get("budget", "").strip().lower()
    cuisine = request.args.get("cuisine", "").strip().lower()
    veg = request.args.get("veg", "").strip().lower()
    min_price = request.args.get("min_price", type=float)
    max_price = request.args.get("max_price", type=float)
    top_n = int(request.args.get("top", 6))

    result = restaurants_df.copy()
    if district:
        result = result[result["district"].str.lower().str.contains(district)]
    if budget:
        result = result[result["budget_category"].str.lower() == budget]
    if cuisine:
        result = result[result["cuisine"].str.lower().str.contains(cuisine)]
    if veg in ("true", "yes", "1"):
        result = result[result["pure_veg"].str.lower() == "yes"]
    if min_price is not None:
        result = result[result["price"] >= min_price]
    if max_price is not None:
        result = result[result["price"] <= max_price]

    if result.empty:
        return jsonify({"error": "No restaurants match those filters", "restaurants": []}), 404

    result = result.sort_values("rating", ascending=False).head(top_n)
    return jsonify({
        "filters": {"district": district or None, "budget": budget or None, "cuisine": cuisine or None},
        "restaurants": [restaurant_to_json(r) for _, r in result.iterrows()],
    })


# ─────────────────────────────────────────────
# 7. API ROUTE — NEW: SMART / FLEXIBLE QUERY
# ─────────────────────────────────────────────
@app.route("/api/shopping")
def api_shopping():
    """
    GET /api/shopping?district=Ranchi&category=Mall&min_rating=4&top=6
    """
    district = request.args.get("district")
    category = request.args.get("category")
    min_rating = request.args.get("min_rating", type=float)
    top_n = int(request.args.get("top", 6))

    result = shopping_df.copy()
    if district:
        result = result[result["district"].str.lower() == district.lower()]
    if category:
        result = result[result["category"].str.lower().str.contains(category.lower())]
    if min_rating is not None:
        result = result[result["rating"] >= min_rating]

    if result.empty:
        return jsonify({"error": "No shops match those filters", "shopping": []}), 404

    result = result.sort_values("rating", ascending=False).head(top_n)
    return jsonify({
        "count": len(result),
        "shopping": [shopping_to_json(r) for _, r in result.iterrows()],
    })


@app.route("/api/smart_query")
def smart_query():
    """
    GET /api/smart_query?q=<any free text>&top=<n>

    Works for coherent sentences ("suggest a peaceful waterfall in winter
    under a moderate budget") AND incoherent keyword dumps ("waterfall
    monsoon cheap adventure ranchi"). Returns both the recommendations AND
    an `interpreted` block so the frontend can show the user exactly what
    was understood from their message (the "visible AI" transparency panel).
    """
    q = request.args.get("q", "").strip()
    top_n = int(request.args.get("top", 6))
    if not q:
        return jsonify({"error": "Missing ?q= parameter"}), 400

    interpreted = parse_intent(q)
    service_type = interpreted["service_type"]

    # ---- Hotels ----
    if service_type == "hotel":
        result = hotels_df.copy()
        if interpreted["district"]:
            result = result[result["district"].str.lower().isin([d.lower() for d in interpreted["district"]])]
        if interpreted["state"]:
            result = result[result["state"].str.lower().isin([s.lower() for s in interpreted["state"]])]
        budget = interpreted["budget"]
        if budget:
            if "band" in budget:
                result = result[result["budget_category"].str.lower() == budget["band"].lower()]
            else:
                result = result[(result["price"] >= budget["min_price"]) & (result["price"] <= budget["max_price"])]
        if result.empty:
            result = hotels_df.copy()  # graceful fallback: drop filters rather than return nothing
        result = result.sort_values("rating", ascending=False).head(top_n)
        return jsonify({
            "interpreted": interpreted,
            "hotels": [hotel_to_json(r) for _, r in result.iterrows()],
        })

    # ---- Restaurants ----
    if service_type == "restaurant":
        result = restaurants_df.copy()
        if interpreted["district"]:
            result = result[result["district"].str.lower().isin([d.lower() for d in interpreted["district"]])]
        budget = interpreted["budget"]
        if budget:
            if "band" in budget:
                result = result[result["budget_category"].str.lower() == budget["band"].lower()]
            else:
                result = result[(result["price"] >= budget["min_price"]) & (result["price"] <= budget["max_price"])]
        if result.empty:
            result = restaurants_df.copy()
        result = result.sort_values("rating", ascending=False).head(top_n)
        return jsonify({
            "interpreted": interpreted,
            "restaurants": [restaurant_to_json(r) for _, r in result.iterrows()],
        })

    # ---- Shopping ----
    if service_type == "shopping":
        result = shopping_df.copy()
        if interpreted["district"]:
            result = result[result["district"].str.lower().isin([d.lower() for d in interpreted["district"]])]
        if interpreted["state"]:
            result = result[result["state"].str.lower().isin([s.lower() for s in interpreted["state"]])]
        if result.empty:
            result = shopping_df.copy()  # graceful fallback: drop filters rather than return nothing
        result = result.sort_values("rating", ascending=False).head(top_n)
        return jsonify({
            "interpreted": interpreted,
            "shopping": [shopping_to_json(r) for _, r in result.iterrows()],
        })

    # ---- Places (default) ----
    # If the query literally contains a real place's full name ("dal lake",
    # "hundru falls"), prefer the classic "similar places" path over generic
    # filtering. Checked longest-name-first so a generic word shared across
    # many places (e.g. "lake") can't shadow an actual named match, and a
    # place name is only accepted as a whole-word match (so "fort" doesn't
    # match inside an unrelated longer word).
    qlow = q.lower()
    candidate_names = sorted(df["place_name"].tolist(), key=len, reverse=True)
    best_name = None
    for name in candidate_names:
        if _word_in(qlow, name.lower()):
            best_name = name
            break
    if best_name:
        recs, err = recommender.recommend(best_name, top_n=top_n)
        if not err:
            interpreted["matched_place"] = best_name
            return jsonify({"interpreted": interpreted, "recommendations": recs})

    # Otherwise: build hard filters from whatever was detected, then rank
    # remaining candidates by raw-text TF-IDF similarity (robust to messy input).
    mask = pd.Series(True, index=df.index)
    if interpreted["category"]:
        mask &= df["category"].str.lower().isin([c.lower() for c in interpreted["category"]])
    if interpreted["state"]:
        mask &= df["state"].str.lower().isin([s.lower() for s in interpreted["state"]])
    if interpreted["district"]:
        mask &= df["district"].str.lower().isin([d.lower() for d in interpreted["district"]])
    if interpreted["season"]:
        mask &= df["best_season"].str.contains(interpreted["season"], case=False) | \
                (df["best_season"].str.lower() == "all season")
    if interpreted["vibe"]:
        vibe_mask = pd.Series(False, index=df.index)
        for v in interpreted["vibe"]:
            vibe_mask |= df["vibe"].str.lower().str.contains(v.lower())
        mask &= vibe_mask

    recs = recommender.query(q, hard_mask=mask, top_n=top_n)
    return jsonify({"interpreted": interpreted, "recommendations": recs})


# ─────────────────────────────────────────────
# 8. START SERVER
# ─────────────────────────────────────────────
if __name__ == "__main__":
    print("\n🚀 Starting Recommendation Server on http://localhost:5050")
    print("   Keep this running while using the chatbot.\n")
    app.run(port=5050, debug=False)
