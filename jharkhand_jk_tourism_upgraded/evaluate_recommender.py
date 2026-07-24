"""
Evaluation harness for the ContentRecommender in recommend_server.py.

WHY THIS APPROACH
------------------
The recommender is unsupervised (TF-IDF + cosine similarity) — there is no
human-labeled "these are the correct 5 recommendations for Hundru Falls"
dataset to score against. To still get meaningful precision / recall / F1 /
accuracy numbers, each query place is turned into its own small binary
classification problem:

    For a query place Q, every OTHER place P in the dataset is a candidate.
        y_true[P]  = 1  if P is "relevant" to Q      (same category, OR
                                                        shares >=1 tag/activity)
                   = 0  otherwise
        y_pred[P]  = 1  if P appears in Q's top-K recommendation list
                   = 0  otherwise

Doing this for many query places and pooling every (y_true, y_pred) pair
across all of them gives a normal binary classification report — accuracy,
precision, recall, and F1 all become well-defined via sklearn.metrics, and
the numbers are directly comparable before/after a change to the model.

Run:
    python evaluate_recommender.py            # K=5, all places as queries
    python evaluate_recommender.py --top 10 --sample 200
"""
import argparse
import numpy as np
import pandas as pd
from sklearn.metrics import precision_score, recall_score, f1_score, accuracy_score

from recommend_server import df, recommender


# A term that shows up on a big chunk of the whole dataset (e.g. "sightseeing"
# on 79% of places, "nature"/"photography"/"scenic" on 50-60%+) tells you
# almost nothing about whether two SPECIFIC places are alike — but the old
# "shares >= 1 tag/activity term" rule counted it anyway. That's why ~83% of
# every possible (query, candidate) pair used to get labeled "relevant": the
# ground truth itself was noise, so accuracy/F1 computed against it were
# largely meaningless (precision saturated near 1, and accuracy/F1 only moved
# when top_k moved, not when the recommender got actually better or worse).
#
# Fix: compute each term's document frequency across the dataset once, and
# ignore any term above GENERIC_DF_THRESHOLD when deciding "shared term"
# relevance. Same-category still counts on its own (that's a strong signal),
# but term overlap now has to come from something reasonably distinctive.
GENERIC_DF_THRESHOLD = 0.35


def _term_document_frequencies() -> dict:
    n = len(df)
    doc_freq = {}
    for col in ("tags", "activities"):
        for cell in df[col]:
            seen = set(t.strip().lower() for t in str(cell).split(",") if t.strip())
            for t in seen:
                doc_freq[t] = doc_freq.get(t, 0) + 1
    return {t: c / n for t, c in doc_freq.items()}


_TERM_DF = _term_document_frequencies()
GENERIC_TERMS = {t for t, ratio in _TERM_DF.items() if ratio > GENERIC_DF_THRESHOLD}


def _distinctive_terms(cell_tags, cell_acts) -> set:
    return set(
        t.strip().lower()
        for cell in (cell_tags, cell_acts)
        for t in str(cell).split(",")
        if t.strip() and t.strip().lower() not in GENERIC_TERMS
    )


def relevance_labels(query_idx: int) -> np.ndarray:
    """Boolean array over df.index: True where a place is 'relevant' to the
    query place (same category, or at least one shared DISTINCTIVE tag/
    activity term — generic, dataset-wide terms are excluded, see above)."""
    row = df.iloc[query_idx]
    same_category = (df["category"].str.lower() == str(row["category"]).lower())

    q_terms = _distinctive_terms(row["tags"], row["activities"])

    def shares_term(cell_tags, cell_acts):
        if not q_terms:
            return False
        return len(_distinctive_terms(cell_tags, cell_acts) & q_terms) > 0

    shared_terms = [
        shares_term(t, a) for t, a in zip(df["tags"], df["activities"])
    ]
    relevant = same_category.values | np.array(shared_terms)
    relevant[query_idx] = False  # exclude the query itself
    return relevant


# ─────────────────────────────────────────────
# LAYERED GROUND TRUTH
# ─────────────────────────────────────────────
# The CBRS/CDRS/CSRS layers each add a *different kind* of signal (content,
# then location+season, then review sentiment). Scoring all three against
# ONE fixed "same category / shared tag" ground truth is unfair to CDRS and
# CSRS: it can only ever measure content overlap, so a model that spends part
# of its ranking budget on "nearby" or "well-reviewed" places will look WORSE
# on that yardstick even if those recommendations are genuinely more useful.
#
# So each layer gets evaluated two ways:
#   (a) against the same fixed content-only ground truth — an apples-to-apples
#       "did adding context/sentiment cost us any content relevance?" check.
#   (b) against a ground truth broadened to match what that layer is actually
#       trying to satisfy — "did adding context/sentiment gain us anything
#       ON THE DIMENSION IT TARGETS?"
NEARBY_KM = 150.0


def _haversine_km(i, j):
    lat1, lon1 = np.radians(df.iloc[i][["latitude", "longitude"]].astype(float))
    lat2, lon2 = np.radians(df.iloc[j][["latitude", "longitude"]].astype(float))
    dlat, dlon = lat1 - lat2, lon1 - lon2
    a = np.sin(dlat / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin(dlon / 2) ** 2
    return 2 * 6371.0 * np.arcsin(np.sqrt(np.clip(a, 0, 1)))


def _season_overlap(i, j):
    def season_set(idx):
        return set(t.strip().lower() for t in str(df.iloc[idx]["best_season"]).split(",") if t.strip())
    si, sj = season_set(i), season_set(j)
    if "all season" in si or "all season" in sj:
        return True
    return bool(si & sj)


def _sentiment_ok(j) -> bool:
    """True unless the candidate has a genuinely negative review signal.
    Places with no sentiment evidence at all are treated as acceptable
    (absence of a review isn't evidence of a bad one)."""
    row = df.iloc[j]
    score = row.get("sentiment_score")
    if pd.notna(score):
        return float(score) >= -0.2
    label = str(row.get("sentiment_label", "")).strip().lower()
    return label != "negative"


_dist_cache, _season_cache = {}, {}


def context_relevance_labels(query_idx: int) -> np.ndarray:
    """Broadened ground truth for CDRS: content-relevant OR (nearby AND
    same-season) — i.e. also credits recommendations that are a good
    *trip* fit even when the place category/tags differ."""
    base = relevance_labels(query_idx)
    n = len(df)
    extra = np.zeros(n, dtype=bool)
    for j in range(n):
        if j == query_idx:
            continue
        key = (min(query_idx, j), max(query_idx, j))
        if key not in _dist_cache:
            _dist_cache[key] = _haversine_km(query_idx, j)
        if key not in _season_cache:
            _season_cache[key] = _season_overlap(query_idx, j)
        extra[j] = _dist_cache[key] <= NEARBY_KM and _season_cache[key]
    return base | extra


def sentiment_relevance_labels(query_idx: int) -> np.ndarray:
    """Broadened ground truth for CSRS: context-relevant AND not
    negatively-reviewed — a recommendation that fits content/context but
    sends the user somewhere poorly reviewed shouldn't count as a "good"
    hit for a sentiment-aware recommender."""
    base = context_relevance_labels(query_idx)
    n = len(df)
    sentiment_mask = np.array([_sentiment_ok(j) for j in range(n)])
    return base & sentiment_mask

def evaluate(top_k: int = 5, sample: int | None = None, seed: int = 42, rec=None, relevance_fn=None):
    """relevance_fn: which ground-truth function to score against (defaults
    to the base content-only relevance_labels). rec: which recommender to
    evaluate (defaults to the module-level `recommender`)."""
    rec = rec if rec is not None else recommender
    relevance_fn = relevance_fn if relevance_fn is not None else relevance_labels
    n = len(df)
    indices = list(range(n))
    if sample is not None and sample < n:
        rng = np.random.default_rng(seed)
        indices = sorted(rng.choice(n, size=sample, replace=False).tolist())

    all_y_true, all_y_pred = [], []
    per_query_precision, per_query_recall, per_query_f1 = [], [], []

    for idx in indices:
        place_name = df.iloc[idx]["place_name"]
        recs, err = rec.recommend(place_name, top_n=top_k)
        if err:
            continue

        y_true_full = relevance_fn(idx)
        y_pred_full = np.zeros(n, dtype=bool)
        rec_names = {r["place_name"] for r in recs}
        rec_mask = df["place_name"].isin(rec_names).values
        y_pred_full |= rec_mask

        # exclude the query itself from both arrays for this query's contribution
        mask = np.ones(n, dtype=bool)
        mask[idx] = False

        all_y_true.extend(y_true_full[mask].astype(int).tolist())
        all_y_pred.extend(y_pred_full[mask].astype(int).tolist())

        yt, yp = y_true_full[mask], y_pred_full[mask]
        tp = int(np.sum(yt & yp))
        fp = int(np.sum(~yt & yp))
        fn = int(np.sum(yt & ~yp))
        p = tp / (tp + fp) if (tp + fp) else 0.0
        r = tp / (tp + fn) if (tp + fn) else 0.0
        f1 = (2 * p * r / (p + r)) if (p + r) else 0.0
        per_query_precision.append(p)
        per_query_recall.append(r)
        per_query_f1.append(f1)

    all_y_true = np.array(all_y_true)
    all_y_pred = np.array(all_y_pred)

    pooled = {
        "accuracy": accuracy_score(all_y_true, all_y_pred),
        "precision": precision_score(all_y_true, all_y_pred, zero_division=0),
        "recall": recall_score(all_y_true, all_y_pred, zero_division=0),
        "f1": f1_score(all_y_true, all_y_pred, zero_division=0),
    }
    macro = {
        "precision@k_macro": float(np.mean(per_query_precision)),
        "recall@k_macro": float(np.mean(per_query_recall)),
        "f1@k_macro": float(np.mean(per_query_f1)),
    }
    return {"top_k": top_k, "num_queries": len(indices), "pooled": pooled, "macro": macro}


def evaluate_layers(top_k: int = 5, sample: int | None = None):
    """
    Evaluates all three recommender layers against all three ground-truth
    definitions (a 3x3 matrix), so every comparison is apples-to-apples on
    the SAME target:

      Models:
        1. CBRS  — pure content-based filtering (TF-IDF + category).
        2. CDRS  — CBRS + context-awareness (geo-proximity + season match).
        3. CSRS  — CDRS + a sentiment prior from review data.

      Ground truths (each is a superset of the last — see definitions above):
        content   — same category / shares a distinctive tag.
        context   — content OR (nearby AND same season).
        sentiment — context AND not negatively-reviewed.

    Reading the matrix:
      - Look DOWN a column to see whether adding context/sentiment to the
        MODEL costs it any accuracy on that same fixed target.
      - Look ACROSS a row (fix the model, vary target) to see how much
        harder each broadened target is — context/sentiment targets have a
        much higher positive rate (~45% vs ~25%), so recall/accuracy/F1 look
        lower there for ANY model at a fixed top-5 budget; that's the
        target getting harder, not the model getting worse.
      - The real "does context help" question is the CDRS row vs CBRS row
        under the SAME 'context' column, and similarly CSRS vs CDRS under
        the 'sentiment' column.
    """
    from recommend_server import ContentRecommender

    model_configs = [
        ("CBRS", dict(use_context=False, use_sentiment=False)),
        ("CDRS", dict(use_context=True, use_sentiment=False)),
        ("CSRS", dict(use_context=True, use_sentiment=True)),
    ]
    truth_configs = [
        ("content", relevance_labels),
        ("context", context_relevance_labels),
        ("sentiment", sentiment_relevance_labels),
    ]

    matrix = {}
    for model_label, kwargs in model_configs:
        rec = ContentRecommender(df, **kwargs)
        for truth_label, fn in truth_configs:
            result = evaluate(top_k=top_k, sample=sample, rec=rec, relevance_fn=fn)
            matrix[(model_label, truth_label)] = result["pooled"]
    return matrix, [m for m, _ in model_configs], [t for t, _ in truth_configs]


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--top", type=int, default=5, help="K in top-K recommendations")
    ap.add_argument("--sample", type=int, default=None, help="Evaluate on a random sample of N places instead of all")
    ap.add_argument("--layers", action="store_true",
                     help="Compare CBRS vs CDRS (+context) vs CSRS (+context+sentiment) side by side")
    args = ap.parse_args()

    if args.layers:
        matrix, models, truths = evaluate_layers(top_k=args.top, sample=args.sample)

        pos_rates = {}
        n = len(df)
        for truth_label, fn in [("content", relevance_labels), ("context", context_relevance_labels),
                                 ("sentiment", sentiment_relevance_labels)]:
            pos = sum(fn(i).sum() for i in range(n))
            pos_rates[truth_label] = pos / (n * (n - 1))

        print(f"\n📊 Layered recommender evaluation — top_k={args.top}, "
              f"models={models}, ground truths={truths}\n")
        print("Ground-truth positive rate (share of all pairs labeled 'relevant'):")
        for t in truths:
            print(f"   {t:<10s}: {pos_rates[t]:.1%}")
        print("(higher positive rate = harder target at a fixed top-K budget,")
        print(" independent of model quality — see column-wise notes below)\n")

        for metric in ("accuracy", "precision", "recall", "f1"):
            print(f"--- {metric} ---")
            header = f"{'Model':<8s}" + "".join(f"{t:>12s}" for t in truths)
            print(header)
            for m in models:
                row = "".join(f"{matrix[(m, t)][metric]:>12.3f}" for t in truths)
                print(f"{m:<8s}{row}")
            print()

        print("Read DOWN a column to see if adding a layer costs it on a fixed target.")
        print("Read the diagonal-ish 'does X help on X's own target' cells (CBRS/content,")
        print("CDRS/context, CSRS/sentiment) for whether each layer helps on what it targets.")
        exit()

    results = evaluate(top_k=args.top, sample=args.sample)

    print(f"\n📊 Recommender evaluation — top_k={results['top_k']}, "
          f"queries={results['num_queries']}\n")
    print("Pooled binary-relevance classification (every candidate, every query):")
    for k, v in results["pooled"].items():
        print(f"   {k:<10s}: {v:.3f}")
    print("\nMacro-averaged per-query precision/recall/F1@K:")
    for k, v in results["macro"].items():
        print(f"   {k:<18s}: {v:.3f}")
