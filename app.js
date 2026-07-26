// ─── App State ────────────────────────────────────────────────────────────────
let activePlace = null;
let pendingCategory = null;
let selectedPlace = null;

const RECOMMENDER_API = "https://voice-first-travel-assistant.onrender.com";

// ─── Recommendation Engine ────────────────────────────────────────────────────
async function fetchSimilarPlaces(placeName, topN = 6) {
  try {
    const url = `${RECOMMENDER_API}/api/similar?place=${encodeURIComponent(placeName)}&top=${topN}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return [];
    const data = await res.json();
    return data.recommendations || [];
  } catch { return []; }
}

// ─── Flexible / Smart Query (handles coherent AND incoherent free text) ──────
// Talks to /api/smart_query on recommend_server.py, which figures out whether
// the user wants places, hotels, or restaurants, pulls out whatever it can
// find (category, tags, activities, vibe, season, budget, state, district) —
// tolerating typos and jumbled keyword input — and returns both the results
// AND an `interpreted` block describing what it understood. If the server
// isn't running, this quietly returns null and the caller falls back to the
// original client-side keyword matching.
async function fetchSmartQuery(rawText, topN = 6) {
  try {
    const url = `${RECOMMENDER_API}/api/smart_query?q=${encodeURIComponent(rawText)}&top=${topN}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(3500) });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// ─── Client-side budget parsing (works even if recommend_server.py is offline) ─
// Hotels/restaurants already carry a real price in services_db.js
// (pricePerNight / avgPrice), so budget filtering doesn't need the ML server —
// it just needs to bucket that price and let the user pick/refine visibly.
const HOTEL_BUDGET_BANDS = [["Budget", 0, 3000], ["Moderate", 3000, 6000], ["Premium", 6000, 12000], ["Luxury", 12000, Infinity]];
const RESTAURANT_BUDGET_BANDS = [["Budget", 0, 400], ["Moderate", 400, 700], ["Premium", 700, 1200], ["Luxury", 1200, Infinity]];

function bucketPrice(price, bands) {
  if (price === null || price === undefined || isNaN(price)) return "Unknown";
  for (const [label, lo, hi] of bands) if (price >= lo && price < hi) return label;
  return bands[bands.length - 1][0];
}

// Longest phrase first so "moderate budget" doesn't get swallowed by a bare
// "budget" fragment — same ambiguity fix as the Python parser.
const BUDGET_PHRASES = [
  ["Budget", "tight budget"], ["Budget", "low budget"], ["Budget", "pocket friendly"], ["Budget", "pocket-friendly"],
  ["Budget", "backpacker"], ["Budget", "economical"], ["Budget", "inexpensive"], ["Budget", "affordable"], ["Budget", "cheap"], ["Budget", "sasta"],
  ["Moderate", "medium budget"], ["Moderate", "normal budget"], ["Moderate", "average budget"], ["Moderate", "mid-range"], ["Moderate", "mid range"], ["Moderate", "reasonable"], ["Moderate", "moderate"], ["Moderate", "decent"],
  ["Premium", "premium budget"], ["Premium", "good quality"], ["Premium", "high quality"], ["Premium", "upscale"], ["Premium", "premium"],
  ["Luxury", "no budget limit"], ["Luxury", "top-tier"], ["Luxury", "top tier"], ["Luxury", "five star"], ["Luxury", "5 star"], ["Luxury", "high-end"], ["Luxury", "high end"], ["Luxury", "lavish"], ["Luxury", "splurge"], ["Luxury", "luxurious"], ["Luxury", "luxury"],
];

function wordIn(text, phrase) {
  const esc = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![a-z])${esc}(?![a-z])`, "i").test(text);
}

function detectBudgetFromText(text) {
  let m = text.match(/between\s*(?:₹|rs\.?|inr)?\s*(\d{3,6})\s*(?:and|to|-)\s*(?:₹|rs\.?|inr)?\s*(\d{3,6})/i);
  if (m) return { min: Number(m[1]), max: Number(m[2]), label: `₹${m[1]}–₹${m[2]}` };
  m = text.match(/(?:under|below|less than|upto|up to)\s*(?:₹|rs\.?|inr)?\s*(\d{3,6})/i);
  if (m) return { min: 0, max: Number(m[1]), label: `under ₹${m[1]}` };
  m = text.match(/(?:above|over|more than)\s*(?:₹|rs\.?|inr)?\s*(\d{3,6})/i);
  if (m) return { min: Number(m[1]), max: Infinity, label: `above ₹${m[1]}` };
  for (const [band, phrase] of BUDGET_PHRASES) {
    if (wordIn(text, phrase)) return { band, label: band };
  }
  return null;
}

function filterByBudget(items, priceKey, budget) {
  if (!budget) return items;
  return items.filter(it => {
    const price = it[priceKey];
    if (budget.band) {
      const bands = priceKey === "pricePerNight" ? HOTEL_BUDGET_BANDS : RESTAURANT_BUDGET_BANDS;
      return bucketPrice(price, bands) === budget.band;
    }
    if (price === null || price === undefined || isNaN(price)) return false;
    return price >= budget.min && price <= budget.max;
  });
}

// Formats a band's numeric range for display, e.g. "₹0–₹3,000" or "₹12,000+"
// for the open-ended top tier.
function formatBandRange(lo, hi) {
  const fmt = n => `₹${Number(n).toLocaleString("en-IN")}`;
  if (hi === Infinity) return `${fmt(lo)}+`;
  return `${fmt(lo)}–${fmt(hi)}`;
}

// ─── Result-panel cleanup ──────────────────────────────────────────────────────
// The budget picker and "here's what I understood" panel are only relevant to
// hotel/restaurant results — they must never linger on screen once the user
// moves on to a places/shopping search (or a fresh state listing). Every
// function that renders a new result set calls this first so stale panels
// from a previous, different-type query can't stick around and be mistaken
// for part of the new results.
function clearResultPanels() {
  document.getElementById("rec-panel")?.remove();
  document.getElementById("budget-picker")?.remove();
  document.getElementById("interpreted-panel")?.remove();
}

function renderRecommendations(recs, placeName) {
  clearResultPanels();
  if (!recs || recs.length === 0) return;

  const panel = document.createElement("div");
  panel.id = "rec-panel";
  panel.className = "rec-panel";
  panel.innerHTML = `
    <div class="rec-header">
      <i class="fa-solid fa-wand-magic-sparkles"></i>
      <span>${t("similar_to")} <strong>${placeName}</strong> ${t("ai_picks")}</span>
    </div>
    <div class="rec-list">
      ${recs.map(r => `
        <button class="rec-card" data-name="${r.place_name}">
          ${r.image_url ? `<img class="rec-img" src="${r.image_url}" alt="${r.place_name}" onerror="this.style.display='none'">` : ""}
          <div class="rec-info">
            <div class="rec-name">${r.place_name}</div>
            <div class="rec-meta">${r.category} · ${r.district}</div>
            <div class="rec-desc">${r.description_api || ""}</div>
            <div class="rec-score">
              ${"★".repeat(Math.round(r.rating || 0))}${"☆".repeat(5 - Math.round(r.rating || 0))}
              <span class="rec-sim">Match: ${Math.round((r.similarity_score || 0) * 100)}%</span>
            </div>
          </div>
        </button>
      `).join("")}
    </div>
  `;

  panel.querySelectorAll(".rec-card").forEach(btn => {
    btn.addEventListener("click", () => {
      const name = btn.dataset.name;
      const match = travelDatabase.find(p => p.name.toLowerCase() === name.toLowerCase());
      if (match) {
        activePlace = match;
        displayPlaceCard(match);
        appendMessage("assistant", `${t("showing_details")} ${match.name}.`);
        speak(`${t("showing_details")} ${match.name}.`);
      } else {
        appendMessage("assistant", `${t("you_selected")} ${name}. ${t("ask_more")}`);
        speak(`${t("you_selected")} ${name}.`);
      }
    });
  });

  document.getElementById("destination-section")?.insertAdjacentElement("afterend", panel);
}

// ─── Carousel ─────────────────────────────────────────────────────────────────
let currentCarouselIndex = 0;

function updateCarousel(place) {
  const container = document.getElementById("image-carousel-container");
  const image = document.getElementById("carousel-image");
  const prev = document.getElementById("carousel-prev");
  const next = document.getElementById("carousel-next");

  if (!container || !image || !place.images || !place.images.length) {
    if (container) container.style.display = "none";
    return;
  }

  container.style.display = "flex";
  currentCarouselIndex = 0;
  image.src = place.images[currentCarouselIndex];

  prev.onclick = () => {
    currentCarouselIndex = (currentCarouselIndex - 1 + place.images.length) % place.images.length;
    image.src = place.images[currentCarouselIndex];
  };
  next.onclick = () => {
    currentCarouselIndex = (currentCarouselIndex + 1) % place.images.length;
    image.src = place.images[currentCarouselIndex];
  };
}

// ─── Audio & Speech ───────────────────────────────────────────────────────────
let speechRate = 1.0;
let recognition = null;
let isListening = false;
let isSpeaking = false;
let welcomeSpoken = false;
let isStarting = false;
let audioCtx = null;

function initAudioContext() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

function playSound(type) {
  try {
    initAudioContext();
    if (!audioCtx) return;
    if (audioCtx.state === "suspended") audioCtx.resume();

    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    const now = audioCtx.currentTime;

    if (type === "start") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(800, now + 0.1);
      gainNode.gain.setValueAtTime(0.1, now);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
      osc.start(now); osc.stop(now + 0.1);
    } else if (type === "stop") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(500, now);
      osc.frequency.setValueAtTime(350, now + 0.08);
      gainNode.gain.setValueAtTime(0.08, now);
      gainNode.gain.setValueAtTime(0.08, now + 0.08);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      osc.start(now); osc.stop(now + 0.16);
    } else if (type === "success") {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.setValueAtTime(659.25, now + 0.12);
      osc.frequency.setValueAtTime(783.99, now + 0.24);
      gainNode.gain.setValueAtTime(0.12, now);
      gainNode.gain.setValueAtTime(0.12, now + 0.24);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc.start(now); osc.stop(now + 0.4);
    } else if (type === "error") {
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.linearRampToValueAtTime(100, now + 0.25);
      gainNode.gain.setValueAtTime(0.15, now);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.start(now); osc.stop(now + 0.25);
    }
  } catch (e) { console.warn("Audio sound error:", e); }
}

// ─── Speech Recognition ───────────────────────────────────────────────────────
function setupSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    updateMicStatus(t("mic_not_supported"));
    appendMessage("assistant", t("mic_not_supported"));
    return;
  }

  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = SPEECH_LANG[currentLang] || "en-IN";

  recognition.onstart = () => {
    isStarting = false;
    isListening = true;
    updateMicStatus(t("listening"));
    setVoiceBadge("listening");
    document.getElementById("mic-btn").classList.add("listening");
    document.getElementById("voice-control-panel").classList.add("listening");
    // Animate voice-log link
    document.getElementById("voice-log-link")?.classList.add("active");
    playSound("start");
  };

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    // ── Connected to conversation log ──
    appendMessage("user", transcript);
    // pulse the link indicator
    flashVoiceLink();
    processVoiceCommand(transcript);
  };

  recognition.onerror = (event) => {
    isStarting = false;
    isListening = false;
    document.getElementById("voice-log-link")?.classList.remove("active");
    playSound("error");

    let msg = t("mic_error_generic");
    if (event.error === "no-speech") msg = t("no_speech");
    else if (event.error === "not-allowed") msg = t("mic_denied");
    else if (event.error === "network") msg = t("network_error");
    else if (event.error === "audio-capture") msg = t("no_mic");
    else if (event.error === "aborted") {
      updateMicStatus(t("cancelled"));
      setVoiceBadge("ready");
      return;
    } else msg = `${t("mic_error_generic")}: ${event.error}`;

    updateMicStatus(`⚠ ${event.error}`);
    setVoiceBadge("error");
    appendMessage("assistant", `⚠️ ${msg}`);
    speak(msg);
  };

  recognition.onend = () => {
    isStarting = false;
    isListening = false;
    document.getElementById("mic-btn").classList.remove("listening");
    document.getElementById("voice-control-panel").classList.remove("listening");
    document.getElementById("voice-log-link")?.classList.remove("active");
    playSound("stop");
    if (document.getElementById("mic-status-text").innerText === t("listening")) {
      updateMicStatus(t("ready_assist"));
      setVoiceBadge("ready");
    }
  };
}

// Allow i18n to update recognition language
window.updateRecognitionLang = function(lang) {
  if (recognition) recognition.lang = lang;
};

// ─── Voice Badge State ────────────────────────────────────────────────────────
function setVoiceBadge(state) {
  const badge = document.getElementById("voice-state-badge");
  const label = document.getElementById("voice-state-label");
  if (!badge) return;
  badge.className = "voice-badge " + state;
  const labels = { ready: t("ready"), listening: t("listening"), speaking: t("speaking"), error: "Error" };
  if (label) label.textContent = labels[state] || state;
}

function flashVoiceLink() {
  const link = document.getElementById("voice-log-link");
  if (!link) return;
  link.classList.add("flash");
  setTimeout(() => link.classList.remove("flash"), 800);
}

// ─── Speech Synthesis ─────────────────────────────────────────────────────────
window.speak = function speak(text, callback = null) {
  try {
    if (!window.speechSynthesis) { if (callback) callback(); return; }
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = speechRate;
    utterance.pitch = 1.0;
    utterance.lang = TTS_LANG[currentLang] || "en-IN";

    const voices = window.speechSynthesis.getVoices();
    const targetLang = TTS_LANG[currentLang] || "en-IN";
    let selectedVoice = voices.find(v => v.lang === targetLang && v.name.includes("Google"));
    if (!selectedVoice) selectedVoice = voices.find(v => v.lang.startsWith(targetLang.split("-")[0]));
    if (!selectedVoice) selectedVoice = voices.find(v => v.lang.startsWith("en"));
    if (selectedVoice) utterance.voice = selectedVoice;

    utterance.onstart = () => {
      isSpeaking = true;
      const panel = document.getElementById("voice-control-panel");
      if (panel) panel.classList.add("speaking");
      updateMicStatus(t("speaking"));
      setVoiceBadge("speaking");
    };

    utterance.onend = () => {
      isSpeaking = false;
      const panel = document.getElementById("voice-control-panel");
      if (panel) panel.classList.remove("speaking");
      updateMicStatus(t("ready_assist"));
      setVoiceBadge("ready");
      if (callback) callback();
    };

    utterance.onerror = (e) => {
      console.error("TTS error:", e);
      isSpeaking = false;
      document.getElementById("voice-control-panel")?.classList.remove("speaking");
      updateMicStatus(t("ready_assist"));
      setVoiceBadge("ready");
    };

    setTimeout(() => {
      try { window.speechSynthesis.speak(utterance); }
      catch (err) { console.error("speechSynthesis.speak error:", err); }
    }, 50);
  } catch (err) {
    console.error("Speech Synthesis failed:", err);
    isSpeaking = false;
    updateMicStatus(t("ready_assist"));
    if (callback) callback();
  }
};

function stopAllAudio() {
  if (isListening && recognition) recognition.abort();
  if (isSpeaking) {
    window.speechSynthesis.cancel();
    isSpeaking = false;
    document.getElementById("voice-control-panel")?.classList.remove("speaking");
    updateMicStatus(t("audio_stopped"));
    setVoiceBadge("ready");
  }
}

function updateMicStatus(statusText) {
  const el = document.getElementById("mic-status-text");
  if (el) { el.innerText = statusText; el.setAttribute("aria-label", statusText); }
}

// ─── Conversation Log ─────────────────────────────────────────────────────────
window.appendMessage = function appendMessage(sender, text) {
  const container = document.getElementById("transcript-logs");
  if (!container) return;
  const bubble = document.createElement("div");
  bubble.className = `msg-bubble ${sender}`;
  bubble.innerText = text;
  container.appendChild(bubble);
  container.scrollTop = container.scrollHeight;

  // Brief highlight on voice-log link when assistant speaks
  if (sender === "assistant") flashVoiceLink();
};

// ─── Matching Logic ───────────────────────────────────────────────────────────
function findBestMatches(query) {
  const matches = [];
  for (const place of travelDatabase) {
    let score = 0;
    const name = place.name.toLowerCase();
    if (query.includes(name)) score += 100;
    if (query.includes(place.state.toLowerCase())) score += 15;
    if (place.category && query.includes(place.category.toLowerCase())) score += 30;
    if (place.keywords) {
      for (const kw of place.keywords) {
        if (query.includes(kw)) score += 20;
        if (kw.includes(query)) score += 15;
      }
    }
    if (score > 0) matches.push({ place, score });
  }
  matches.sort((a, b) => b.score - a.score);
  return matches.slice(0, 5);
}

function suggestByCategory(category) {
  const places = travelDatabase.filter(p => p.category && p.category.toLowerCase().includes(category.toLowerCase()));
  if (!places.length) return false;
  pendingCategory = category;
  const names = places.slice(0, 8).map(p => p.name).join(", ");
  const text = `${t("found_several")} ${category} ${t("destinations")}\n\n${t("which_state")}\n\n${names}`;
  appendMessage("assistant", text);
  speak(`${t("found_several")} ${category} ${t("destinations")}. ${t("which_state")}`);
  return true;
}

function suggestCategoryByState(category, state) {
  const places = travelDatabase.filter(p =>
    p.state.toLowerCase().includes(state.toLowerCase()) &&
    p.category && p.category.toLowerCase().includes(category.toLowerCase())
  );
  if (!places.length) {
    appendMessage("assistant", `${t("couldnt_find")} ${category} ${t("destinations_in")} ${state}.`);
    return;
  }
  const names = places.slice(0, 8).map(p => p.name).join(", ");
  appendMessage("assistant", `${t("popular_in")} ${category} ${t("places_label")} in ${state}:\n ${names}\n\n${t("which_one")}`);
  speak(`${t("which_explore")}`);
  pendingCategory = null;
}

// ─── Location & Nearby ────────────────────────────────────────────────────────
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getNearbyPlaces(place, limit = 5) {
  if (!place.latitude) return [];
  return travelDatabase
    .filter(p => p.id !== place.id && p.latitude && p.longitude)
    .map(p => ({ ...p, distance: getDistance(place.latitude, place.longitude, p.latitude, p.longitude) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit);
}

function requestLocation() {
  if (!navigator.geolocation) { speak(t("mic_not_supported")); return; }
  navigator.geolocation.getCurrentPosition(
    pos => findNearbyPlaces(pos.coords.latitude, pos.coords.longitude),
    () => speak(t("mic_denied"))
  );
}

function findNearbyPlaces(userLat, userLon, limit = 5) {
  const nearby = travelDatabase
    .filter(p => !isNaN(p.latitude) && !isNaN(p.longitude))
    .map(p => ({ ...p, distance: getDistance(userLat, userLon, Number(p.latitude), Number(p.longitude)) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit);
  renderNearbyFromList(nearby);
}

function renderNearbyFromList(list) {
  const container = document.getElementById("nearby-places-list");
  if (!container) return;
  if (!list || list.length === 0) {
    container.innerHTML = `<div class='nearby-empty'>${t("no_nearby")}</div>`;
    return;
  }
  container.innerHTML = list.map(p => `
    <button class="nearby-pill" data-id="${p.id || p.name}">
      <span class="nearby-pill-name">
        <i class="fa-solid fa-map-pin"></i>
        ${p.name}<small class="nearby-pill-loc">${t(" ")}${p.location || ""}</small>
      </span>
      <span class="nearby-pill-dist">${p.distance.toFixed(1)} ${t("km_away")}</span>
    </button>
  `).join("");

  container.querySelectorAll(".nearby-pill").forEach((btn, idx) => {
    btn.addEventListener("click", () => {
      const p = list[idx];
      activePlace = p;
      displayPlaceCard(p);
      speak(`Showing ${p.name}`);
    });
  });
}

// renderNearbyPlaces for a selected place (sidebar)
function renderNearbyPlaces(place) {
  const container = document.getElementById("nearby-places-list");
  if (!container) return;
  const nearby = getNearbyPlaces(place);
  if (!nearby.length) {
    container.innerHTML = `<div class='nearby-empty'>${t("no_nearby")}</div>`;
    return;
  }
  container.innerHTML = nearby.map(p => `
    <button class="nearby-pill" data-name="${p.name}">
      <span class="nearby-pill-name">
        <i class="fa-solid fa-map-pin"></i>
        ${p.name}<small class="nearby-pill-loc">${t(" ")}${p.location || ""}</small>
      </span>
      <span class="nearby-pill-dist">${p.distance.toFixed(1)} ${t("km_away")}</span>
    </button>
  `).join("");

  container.querySelectorAll(".nearby-pill").forEach(btn => {
    btn.addEventListener("click", () => {
      const name = btn.dataset.name;
      const p = travelDatabase.find(x => x.name === name);
      if (p) { activePlace = p; displayPlaceCard(p); speak(`Showing ${p.name}`); }
    });
  });
}

// ─── Suggestion Chips (follow-ups shown after a place is selected) ────────────
function renderSuggestionChips(place) {
  const container = document.getElementById("suggestion-chips");
  if (!container) return;

  const chips = [
    { icon: "fa-solid fa-images", label: t("chip_show_images"), action: () => {
        document.querySelector('.detail-tab[data-view="images"]')?.click();
      } },
    { icon: "fa-solid fa-universal-access", label: t("chip_accessibility_info"), action: () => {
        document.querySelector('.detail-tab[data-view="accessibility"]')?.click();
        const msg = place.accessibility || t("accessibility");
        speak(msg);
      } },
            { icon: "fa-solid fa-bag-shopping", label: t("chip_shopping"), action: () => {
        appendMessage("user", t("chip_shopping"));
        flashVoiceLink();
        processVoiceCommand("shopping places near here");

      } },
      { icon: "fa-solid fa-bed", label: t("chip_hotels_nearby"), action: () => {
        appendMessage("user", t("chip_hotels_nearby"));
        flashVoiceLink();
        processVoiceCommand("hotels near here");
      } },
          { icon: "fa-solid fa-utensils", label: t("chip_restaurants_nearby"), action: () => {
        appendMessage("user", t("chip_restaurants_nearby"));
        flashVoiceLink();
        processVoiceCommand("restaurants near here");
      } }

  ];

  container.innerHTML = chips.map((c, i) => `
    <button class="suggestion-chip" type="button" data-idx="${i}">
      <i class="${c.icon} me-1"></i>${c.label}
    </button>
  `).join("");
  container.style.display = "flex";

  container.querySelectorAll(".suggestion-chip").forEach(btn => {
    btn.addEventListener("click", () => {
      triggerFirstGreeting();
      chips[Number(btn.dataset.idx)].action();
    });
  });
}

// ─── Hint Chips (quick category shortcuts on the empty destination state) ─────
function renderHintChips() {
  const container = document.getElementById("hint-buttons");
  if (!container) return;

  const chips = [
    { icon: "fa-solid fa-water", label: t("chip_waterfall"), query: "waterfall" },
    { icon: "fa-solid fa-place-of-worship", label: t("chip_temple"), query: "temple" },
    { icon: "fa-solid fa-sailboat", label: t("chip_lake"), query: "lake" },
    { icon: "fa-solid fa-bridge-water", label: t("chip_dam"), query: "dam" },
    { icon: "fa-solid fa-paw", label: t("chip_wildlife"), query: "wildlife" },
    { icon: "fa-solid fa-bed", label: t("chip_hotels"), query: "hotels" },
    { icon: "fa-solid fa-utensils", label: t("chip_restaurants"), query: "restaurants" },
    { icon: "fa-solid fa-bag-shopping", label: t("chip_shopping"), query: "shopping" },
  ];

  container.innerHTML = chips.map((c, i) => `
    <button class="hint-chip" type="button" data-idx="${i}">
      <i class="${c.icon}"></i>${c.label}
    </button>
  `).join("");

  container.querySelectorAll(".hint-chip").forEach(btn => {
    btn.addEventListener("click", () => {
      triggerFirstGreeting();
      const chip = chips[Number(btn.dataset.idx)];
      appendMessage("user", chip.label);
      flashVoiceLink();
      processVoiceCommand(chip.query);
    });
  });
}

window.renderHintChips = renderHintChips;
window.renderSuggestionChips = renderSuggestionChips;

// ─── Hotels / Restaurants / Shopping Recommendations ──────────────────────────
const HOTEL_KEYWORDS = ["hotel", "hotels", "stay", "stays", "accommodation", "resort", "resorts", "lodge", "होटल", "ठहरने", "रहने", "rukna", "rehna", "thaharne"];
const RESTAURANT_KEYWORDS = ["restaurant", "restaurants", "food", "eat", "dine", "dining", "cuisine", "खाना", "भोजन", "रेस्टोरेंट", "khana", "bhojan"];
const SHOPPING_KEYWORDS = ["shopping", "shop", "shops", "market", "markets", "bazaar", "haat", "खरीदारी", "बाज़ार", "बाजार"];
const NEARBY_KEYWORDS = ["here", "nearby", "near", "close by", "yahan", "yaha", "paas", "aaspaas", "आसपास", "पास", "यहां"];

function getServiceHeaderKey(type) {
  return { hotel: "hotel_results_label", restaurant: "restaurant_results_label", shopping: "shopping_results_label" }[type];
}
function getServiceNotFoundKey(type) {
  return { hotel: "no_hotel_found", restaurant: "no_restaurant_found", shopping: "no_shopping_found" }[type];
}
function getServiceDb(type) {
  return { hotel: (typeof hotelsDatabase !== "undefined" ? hotelsDatabase : []),
           restaurant: (typeof restaurantsDatabase !== "undefined" ? restaurantsDatabase : []),
           shopping: (typeof shoppingDatabase !== "undefined" ? shoppingDatabase : []) }[type];
}

function serviceMeta(it, type) {
  if (type === "hotel") return `${it.district}${it.type ? " · " + it.type : ""}${it.starRating ? " · " + it.starRating + "★ category" : ""}`;
  if (type === "restaurant") return `${it.district}${it.cuisine && it.cuisine.length ? " · " + it.cuisine.join(", ") : ""}`;
  return `${it.district}${it.category ? " · " + it.category : ""}`;
}

function serviceDesc(it, type) {
  if (type === "hotel") {
    const price = it.pricePerNight ? `₹${it.pricePerNight}/night` : "";
    const extra = (it.amenities && it.amenities.length) ? it.amenities.join(", ") : (it.nearbyAttractions || []).join(", ");
    return [price, extra].filter(Boolean).join(" · ");
  }
  if (type === "restaurant") {
    const price = it.avgPrice ? `₹${it.avgPrice} avg` : "";
    return [price, it.timing, it.nearestLandmark ? `Near ${it.nearestLandmark}` : ""].filter(Boolean).join(" · ");
  }
  return [(it.products || []).slice(0, 4).join(", "), it.timing].filter(Boolean).join(" · ");
}

function budgetBadge(it, type) {
  const priceKey = type === "hotel" ? "pricePerNight" : "avgPrice";
  const bands = type === "hotel" ? HOTEL_BUDGET_BANDS : RESTAURANT_BUDGET_BANDS;
  const band = it.budgetCategory || bucketPrice(it[priceKey], bands);
  if (!band || band === "Unknown") return "";
  return `<span class="budget-badge budget-badge--${band.toLowerCase()}">${band}</span>`;
}

function renderServiceRecommendations(items, type, headerText) {
  clearResultPanels();
  if (!items || items.length === 0) return;

  const iconMap = { hotel: "fa-solid fa-bed", restaurant: "fa-solid fa-utensils", shopping: "fa-solid fa-bag-shopping" };
  const panel = document.createElement("div");
  panel.id = "rec-panel";
  panel.className = "rec-panel";
  panel.innerHTML = `
    <div class="rec-header">
      <i class="${iconMap[type]}"></i>
      <span>${headerText}</span>
    </div>
    <div class="rec-list">
      ${items.map(it => `
        <div class="rec-card" tabindex="0" style="cursor:default;">
          <div class="rec-info">
            <div class="rec-name">${it.name} ${(type === "hotel" || type === "restaurant") ? budgetBadge(it, type) : ""}</div>
            <div class="rec-meta">${serviceMeta(it, type)}</div>
            <div class="rec-desc">${serviceDesc(it, type)}</div>
            <div class="rec-score">
              ${"★".repeat(Math.round(it.rating || 0))}${"☆".repeat(5 - Math.round(it.rating || 0))}
            </div>
          </div>
        </div>
      `).join("")}
    </div>
  `;

  document.getElementById("destination-section")?.insertAdjacentElement("afterend", panel);
}

// ─── Visible Budget Picker ─────────────────────────────────────────────────────
// A tappable row of budget tiers shown under hotel/restaurant results — this is
// the "visible AI" control: instead of silently guessing a budget, the system
// shows what it inferred (if anything) and lets the person override it in one
// tap. Works whether results came from the ML server or the local fallback.
const BUDGET_TIER_ICONS = {
  Budget: "fa-solid fa-coins",
  Moderate: "fa-solid fa-wallet",
  Premium: "fa-solid fa-gem",
  Luxury: "fa-solid fa-crown",
};

function renderBudgetPicker(type, baseQueryText, activeBudgetLabel) {
  document.getElementById("budget-picker")?.remove();
  const recPanel = document.getElementById("rec-panel");
  if (!recPanel) return;

  const bands = type === "hotel" ? HOTEL_BUDGET_BANDS : RESTAURANT_BUDGET_BANDS;
  const unitSuffix = type === "hotel" ? "/night" : "/meal";
  const tiers = bands.map(([label, lo, hi]) => ({
    label,
    icon: BUDGET_TIER_ICONS[label],
    range: `${formatBandRange(lo, hi)} ${unitSuffix}`,
  }));

  const picker = document.createElement("div");
  picker.id = "budget-picker";
  picker.className = "budget-picker";
  picker.innerHTML = `
    <span class="budget-picker-label"><i class="fa-solid fa-sliders"></i> Filter by budget:</span>
    ${tiers.map(tier => `
      <button type="button" class="budget-chip${tier.label === activeBudgetLabel ? " budget-chip--active" : ""}" data-tier="${tier.label}">
        <span class="budget-chip-main"><i class="${tier.icon}"></i> ${tier.label}</span>
        <span class="budget-chip-range">${tier.range}</span>
      </button>
    `).join("")}
    ${activeBudgetLabel ? `<button type="button" class="budget-chip budget-chip--clear" data-tier="">Clear</button>` : ""}
  `;

  recPanel.insertAdjacentElement("afterend", picker);

  picker.querySelectorAll(".budget-chip").forEach(btn => {
    btn.addEventListener("click", () => {
      const tier = btn.dataset.tier;
      const refinedQuery = tier ? `${baseQueryText} ${tier.toLowerCase()} budget` : baseQueryText;
      appendMessage("user", tier ? `${type === "hotel" ? "Hotels" : "Restaurants"} — ${tier} budget` : `${type === "hotel" ? "Hotels" : "Restaurants"} — any budget`);
      flashVoiceLink();
      processVoiceCommand(refinedQuery);
    });
  });
}

// ─── Visible "Here's what I understood" panel (transparency for smart_query) ──
function renderInterpretedPanel(interpreted) {
  document.getElementById("interpreted-panel")?.remove();
  if (!interpreted) return;

  const chips = [];
  if (interpreted.matched_place) chips.push({ icon: "fa-solid fa-location-dot", text: `Place: ${interpreted.matched_place}` });
  if (interpreted.category && interpreted.category.length) chips.push({ icon: "fa-solid fa-shapes", text: `Category: ${interpreted.category.join(", ")}` });
  if (interpreted.vibe && interpreted.vibe.length) chips.push({ icon: "fa-solid fa-face-smile", text: `Vibe: ${interpreted.vibe.join(", ")}` });
  if (interpreted.season) chips.push({ icon: "fa-solid fa-cloud-sun", text: `Season: ${interpreted.season}` });
  if (interpreted.state && interpreted.state.length) chips.push({ icon: "fa-solid fa-map", text: `State: ${interpreted.state.join(", ")}` });
  if (interpreted.district && interpreted.district.length) chips.push({ icon: "fa-solid fa-map-pin", text: `District: ${interpreted.district.join(", ")}` });
  if (interpreted.tags_activities && interpreted.tags_activities.length) chips.push({ icon: "fa-solid fa-tags", text: `Interests: ${interpreted.tags_activities.slice(0, 4).join(", ")}` });
  if (interpreted.budget) chips.push({ icon: "fa-solid fa-indian-rupee-sign", text: `Budget: ${interpreted.budget.label}` });

  if (!chips.length) return; // nothing confidently detected — don't show an empty panel

  const panel = document.createElement("div");
  panel.id = "interpreted-panel";
  panel.className = "interpreted-panel";
  panel.innerHTML = `
    <span class="interpreted-panel-label"><i class="fa-solid fa-wand-magic-sparkles"></i> Here's what I understood:</span>
    <div class="interpreted-chips">
      ${chips.map(c => `<span class="interpreted-chip"><i class="${c.icon}"></i> ${c.text}</span>`).join("")}
    </div>
  `;

  const anchor = document.getElementById("rec-panel") || document.getElementById("destination-section");
  anchor?.insertAdjacentElement("afterend", panel);
}

function handleServiceQuery(cleanCmd) {
  let type = null;
  if (HOTEL_KEYWORDS.some(k => cleanCmd.includes(k))) type = "hotel";
  else if (RESTAURANT_KEYWORDS.some(k => cleanCmd.includes(k))) type = "restaurant";
  else if (SHOPPING_KEYWORDS.some(k => cleanCmd.includes(k))) type = "shopping";
  if (!type) return false;

  const db = getServiceDb(type);
  if (!db.length) {
    appendMessage("assistant", t(getServiceNotFoundKey(type)));
    speak(t(getServiceNotFoundKey(type)));
    return true;
  }

  const jharKeywords = ["jharkhand", "झारखंड", "jarkhand"];
  const kashmirKeywords = ["kashmir", "jammu", "कश्मीर", "जम्मू"];

  let state = null;
  if (kashmirKeywords.some(k => cleanCmd.includes(k))) state = "Jammu and Kashmir";
  else if (jharKeywords.some(k => cleanCmd.includes(k))) state = "Jharkhand";
  else if (activePlace) state = activePlace.state;

  // Try to detect a specific district mentioned in the query
  const allDistricts = [...new Set(db.map(d => d.district).filter(Boolean))];
  let district = null;
  for (const d of allDistricts) {
    if (cleanCmd.includes(d.toLowerCase())) { district = d; break; }
  }
  // Fall back to the currently viewed place's district for "nearby/here" style queries
  if (!district && activePlace && NEARBY_KEYWORDS.some(w => cleanCmd.includes(w))) {
    district = activePlace.location;
  }

  let filtered = db.slice();
  if (state) {
    const stateFiltered = filtered.filter(it => it.state && it.state.toLowerCase() === state.toLowerCase());
    if (stateFiltered.length) filtered = stateFiltered;
  }
  if (district) {
    const districtFiltered = filtered.filter(it => it.district && it.district.toLowerCase() === district.toLowerCase());
    if (districtFiltered.length) filtered = districtFiltered;
  }

  // Budget filtering (hotels/restaurants only — no price data for shopping).
  // Tolerant of "cheap"/"budget"/"luxury"-style words, "under 3000"-style
  // numeric phrases, and the "<tier> budget" phrases the budget-picker sends.
  let budget = null;
  if (type === "hotel" || type === "restaurant") {
    budget = detectBudgetFromText(cleanCmd);
    if (budget) {
      const priceKey = type === "hotel" ? "pricePerNight" : "avgPrice";
      const budgetFiltered = filterByBudget(filtered, priceKey, budget);
      if (budgetFiltered.length) filtered = budgetFiltered;
      else {
        appendMessage("assistant", `I couldn't find any ${type === "hotel" ? "hotels" : "restaurants"} in that budget here, so here are the closest matches by rating instead.`);
      }
    }
  }

  filtered = filtered.slice().sort((a, b) => (b.rating || 0) - (a.rating || 0));
  const top = filtered.slice(0, 6);

  if (!top.length) {
    appendMessage("assistant", t(getServiceNotFoundKey(type)));
    speak(t(getServiceNotFoundKey(type)));
    return true;
  }

  const scopeLabel = district || state || "";
  const headerText = `${t(getServiceHeaderKey(type))}${scopeLabel ? " — " + scopeLabel : ""}`;

  playSound("success");
  appendMessage("assistant", `${headerText}: ${top.map(i => i.name).join(", ")}`);
  speak(`${headerText}. ${top.slice(0, 3).map(i => i.name).join(", ")}`);
  renderServiceRecommendations(top, type, headerText);

  if (type === "hotel" || type === "restaurant") {
    const baseQuery = (district || state) ? `${type === "hotel" ? "hotels" : "restaurants"} in ${district || state}` : `${type === "hotel" ? "hotels" : "restaurants"}`;
    renderBudgetPicker(type, baseQuery, budget ? budget.band : null);
  }
  return true;
}

// ─── Smart Query Orchestrator ──────────────────────────────────────────────────
// Tries the flexible backend parser (/api/smart_query) first, since it can
// read tags/activities/vibe/season/budget out of ANY phrasing — coherent
// sentences or a jumbled pile of keywords — and it's budget-aware for hotels
// and restaurants. If the ML server isn't running, or it genuinely finds
// nothing, this returns false and the caller falls back to the original
// client-side keyword matching, so the chatbot never breaks when the
// optional Python server is offline.
async function handleSmartQuery(cleanCmd) {
  const data = await fetchSmartQuery(cleanCmd);
  if (!data) return false;

  // Guard: if the query is clearly about hotels/restaurants/shopping but the
  // backend didn't come back with that service type — e.g. an older/stale
  // recommend_server.py that doesn't recognize the "shopping" intent yet —
  // don't accept whatever it *did* return (often generic tourist-place
  // recommendations) as a substitute. Fall through to handleServiceQuery,
  // which reads services_db.js directly and can't get the category wrong.
  const wantsHotel = HOTEL_KEYWORDS.some(k => cleanCmd.includes(k));
  const wantsRestaurant = RESTAURANT_KEYWORDS.some(k => cleanCmd.includes(k));
  const wantsShopping = SHOPPING_KEYWORDS.some(k => cleanCmd.includes(k));
  if ((wantsHotel && !data.hotels) ||
      (wantsRestaurant && !data.restaurants) ||
      (wantsShopping && !data.shopping)) {
    return false;
  }

  if (data.hotels) {
    if (!data.hotels.length) return false;
    const mapped = data.hotels.map(h => ({
      name: h.name, district: h.district, state: h.state, type: h.type,
      starRating: h.star_rating, pricePerNight: h.price_per_night,
      budgetCategory: h.budget_category, rating: h.rating,
      amenities: h.notes ? h.notes.split(",").map(s => s.trim()) : [],
      nearbyAttractions: [], recommendedFor: h.recommended_for,
    }));
    const headerText = t(getServiceHeaderKey("hotel"));
    playSound("success");
    appendMessage("assistant", `${headerText}: ${mapped.map(i => i.name).join(", ")}`);
    speak(`${headerText}. ${mapped.slice(0, 3).map(i => i.name).join(", ")}`);
    renderServiceRecommendations(mapped, "hotel", headerText);
    renderInterpretedPanel(data.interpreted);
    renderBudgetPicker("hotel", cleanCmd, data.interpreted?.budget?.band || null);
    return true;
  }

  if (data.restaurants) {
    if (!data.restaurants.length) return false;
    const mapped = data.restaurants.map(r => ({
      name: r.name, district: r.district, state: r.state,
      cuisine: r.cuisine ? r.cuisine.split(",").map(s => s.trim()) : [],
      pureVeg: r.pure_veg, mealType: r.meal_type, avgPrice: r.avg_price,
      budgetCategory: r.budget_category, rating: r.rating, timing: r.timing,
      nearestLandmark: r.landmark, recommendedFor: r.recommended_for,
    }));
    const headerText = t(getServiceHeaderKey("restaurant"));
    playSound("success");
    appendMessage("assistant", `${headerText}: ${mapped.map(i => i.name).join(", ")}`);
    speak(`${headerText}. ${mapped.slice(0, 3).map(i => i.name).join(", ")}`);
    renderServiceRecommendations(mapped, "restaurant", headerText);
    renderInterpretedPanel(data.interpreted);
    renderBudgetPicker("restaurant", cleanCmd, data.interpreted?.budget?.band || null);
    return true;
  }

  if (data.shopping) {
    if (!data.shopping.length) return false;
    const mapped = data.shopping.map(s => ({
      name: s.name, district: s.district, state: s.state, category: s.category,
      products: s.products, timing: s.timing, nearestLandmark: s.landmark,
      rating: s.rating, specialAttraction: s.special_attraction, recommendedFor: s.recommended_for,
    }));
    const headerText = t(getServiceHeaderKey("shopping"));
    playSound("success");
    appendMessage("assistant", `${headerText}: ${mapped.map(i => i.name).join(", ")}`);
    speak(`${headerText}. ${mapped.slice(0, 3).map(i => i.name).join(", ")}`);
    renderServiceRecommendations(mapped, "shopping", headerText);
    renderInterpretedPanel(data.interpreted);
    return true;
  }

  if (data.recommendations) {
    if (!data.recommendations.length) return false;
    const label = data.interpreted?.matched_place || "places you might like";
    const top3 = data.recommendations.slice(0, 3).map(r => r.place_name).join(", ");
    playSound("success");
    appendMessage("assistant", `Based on ${label}, here are some suggestions: ${top3}`);
    speak(`Here are some places you might like: ${top3}`);
    renderRecommendations(data.recommendations, label);
    renderInterpretedPanel(data.interpreted);
    return true;
  }

  return false;
}

// ─── Voice Command Processing ─────────────────────────────────────────────────
async function processVoiceCommand(command) {
  const cleanCmd = command.toLowerCase().trim();

  // 1. Help
  if (cleanCmd.includes("help") || cleanCmd.includes("instructions") ||
    cleanCmd.includes("how to use") || cleanCmd.includes("madad") ||
    cleanCmd.includes("sahayata") || cleanCmd.includes("सहायता")) {
    speakHelp(); return;
  }

  // 2. State listing — English, Hindi, Hinglish
  const jharKeywords = ["jharkhand", "झारखंड", "jarkhand"];
  const kashmirKeywords = ["kashmir", "jammu", "कश्मीर", "जम्मू"];
  const listKeywords = ["places", "list", "visit", "suggest", "sthan", "jagah", "batao", "बताएं", "स्थान"];

  if (jharKeywords.some(k => cleanCmd.includes(k)) && listKeywords.some(k => cleanCmd.includes(k))) {
    listPlacesByState("Jharkhand"); return;
  }
  if (kashmirKeywords.some(k => cleanCmd.includes(k)) && listKeywords.some(k => cleanCmd.includes(k))) {
    listPlacesByState("Jammu and Kashmir"); return;
  }

  // 2.4 Flexible smart query — handles messy/coherent phrasing, tags,
  // activities, vibe, season, and budget-aware hotels/restaurants. Silently
  // falls through if the optional ML server is offline or finds nothing.
  if (await handleSmartQuery(cleanCmd)) return;

  // 2.5 Hotels / Restaurants / Shopping recommendations (client-side fallback)
  if (handleServiceQuery(cleanCmd)) return;

  // 3. Best match
  const matches = findBestMatches(cleanCmd);
  let matchedPlace = (matches.length && matches[0].score >= 60) ? matches[0].place : null;

  if (!matchedPlace) {
    const cats = [
      ["waterfall", "jharni", "jharna", "झरना"], 
      ["temple", "mandir", "मंदिर"],
      ["lake", "jheel", "झील"],
      ["dam", "bandh", "बांध"],
      ["wildlife", "jungle", "van"]
    ];
    for (const [cat, ...aliases] of cats) {
      if ([cat, ...aliases].some(a => cleanCmd.includes(a))) {
        if (suggestByCategory(cat)) return;
      }
    }

    if (pendingCategory) {
      if (jharKeywords.some(k => cleanCmd.includes(k))) return suggestCategoryByState(pendingCategory, "Jharkhand");
      if (kashmirKeywords.some(k => cleanCmd.includes(k))) return suggestCategoryByState(pendingCategory, "Jammu and Kashmir");
    }

    appendMessage("assistant", t("no_match"));
    speak(t("no_match_speak"));
    return;
  }

  activePlace = matchedPlace;
  displayPlaceCard(matchedPlace);

  if (cleanCmd.includes("where") || cleanCmd.includes("location") || cleanCmd.includes("kahan") || cleanCmd.includes("कहां")) {
    playSound("success");
    appendMessage("assistant", `${matchedPlace.name} ${t("location_label")}: ${matchedPlace.location}`);
    speak(`${matchedPlace.name} ${t("location_label")} ${matchedPlace.location}`);
  } else {
    playSound("success");
    appendMessage("assistant", matchedPlace.summary);
    speak(`${matchedPlace.name}. ${matchedPlace.audioDescription}`);
  }
}

// ─── Help ─────────────────────────────────────────────────────────────────────
function speakHelp() {
  playSound("success");
  appendMessage("assistant", t("voice_help_activated"));
  speak(t("help_text"));
}

// ─── List Places ──────────────────────────────────────────────────────────────
function listPlacesByState(stateName) {
  playSound("success");
  const places = travelDatabase.filter(p => p.state.toLowerCase() === stateName.toLowerCase());
  const names = places.map(p => p.name).join(", ");
  appendMessage("assistant", `${t("places_in")} ${stateName}: ${names}`);
  speak(`${t("here_are_top")} ${stateName}. ${names}. ${t("which_one")}`);
  activePlace = null;
  selectedPlace = null;
  window.selectedPlace = null;
  document.getElementById("destination-placeholder").style.display = "block";
  document.getElementById("destination-placeholder").querySelector("h3").innerText = `${stateName} ${t("jharkhand_label").replace("Jharkhand", "").trim()}`;
  document.getElementById("destination-placeholder").querySelector("p").innerText = `${t("spoken_list")} ${names}. ${t("ask_details")}`;
  document.getElementById("destination-details").style.display = "none";
  document.getElementById("destination-section").classList.remove("active-place");
  const chips = document.getElementById("suggestion-chips");
  if (chips) { chips.style.display = "none"; chips.innerHTML = ""; }
  clearResultPanels();
}

// ─── Reviews Tab Helpers ───────────────────────────────────────────────────────
function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[ch]));
}

function ratingStarsMarkup(rating) {
  const r = Math.max(0, Math.min(5, Math.round(parseFloat(rating) || 0)));
  return "★".repeat(r) + "☆".repeat(5 - r);
}

// Dataset sentiment is a raw compound score roughly in [-1, 1]; turn it into
// a readable label + tone so it's actually useful at a glance in the UI.
function sentimentInfo(raw) {
  const score = parseFloat(raw);
  if (isNaN(score)) {
    return { text: t("sentiment_unknown") || "No sentiment data", tone: "neutral" };
  }
  if (score > 0.2) return { text: `${t("sentiment_positive") || "Positive"} (${score.toFixed(2)})`, tone: "positive" };
  if (score < -0.2) return { text: `${t("sentiment_negative") || "Negative"} (${score.toFixed(2)})`, tone: "negative" };
  return { text: `${t("sentiment_mixed") || "Mixed"} (${score.toFixed(2)})`, tone: "neutral" };
}

function renderReviewsPanel(place) {
  const rating = parseFloat(place.rating);
  const ratingEl = document.getElementById("place-rating");
  const starsEl = document.getElementById("place-rating-stars");
  ratingEl.innerText = !isNaN(rating) ? rating.toFixed(1) : (place.rating || t("No rating recorded"));
  starsEl.innerText = !isNaN(rating) ? ratingStarsMarkup(rating) : "";

  const sentiment = sentimentInfo(place.sentiment);
  const sentEl = document.getElementById("review-sentiment");
  sentEl.innerText = sentiment.text;
  sentEl.className = `sentiment-badge sentiment-badge--${sentiment.tone}`;

  const reviewsEl = document.getElementById("reviews-container");
  const reviewText = (place.reviews || "").trim();
  reviewsEl.innerHTML = reviewText
    ? `<div class="review"><i class="fa-solid fa-quote-left review-quote-icon" aria-hidden="true"></i><p class="review-text">${escapeHtml(reviewText)}</p></div>`
    : `<p class="review-text review-text--empty">${t("no_reviews") || "No reviews available yet."}</p>`;
}

// ─── Display Place Card ───────────────────────────────────────────────────────
function displayPlaceCard(place) {
  selectedPlace = place;
  window.selectedPlace = place;
  document.getElementById("destination-placeholder").style.display = "none";
  document.getElementById("destination-details").style.display = "block";
  document.getElementById("destination-content").style.display = "block";

  document.getElementById("place-name").innerText = place.name;
  document.getElementById("place-badge").innerText = place.state;
  document.getElementById("category-badge").innerText = place.category;
  document.getElementById("place-description").innerText = place.summary;
  document.getElementById("place-accessibility").innerText = place.accessibility || t("accessibility");
  renderReviewsPanel(place);

  updateCarousel(place);
  document.getElementById("destination-section").classList.add("active-place");
  renderNearbyPlaces(place);
  renderSuggestionChips(place);

  fetchSimilarPlaces(place.name, 4).then(recs => renderRecommendations(recs, place.name));
}

// ─── Toggle Listening ─────────────────────────────────────────────────────────
function toggleListening() {
  initAudioContext();
  if (isSpeaking) stopAllAudio();

  if (window.location.protocol === "file:") {
    playSound("error");
    appendMessage("assistant", t("mic_local_blocked"));
    speak(t("local_file_speak"));
    return;
  }

  if (!recognition) setupSpeechRecognition();
  if (isStarting) return;

  if (isListening) {
    recognition.stop();
  } else if (recognition) {
    try {
      isStarting = true;
      updateMicStatus(t("mic_starting"));
      recognition.start();
    } catch (e) {
      isStarting = false;
      console.warn("Recognition start failed:", e);
    }
  }
}

// ─── First Greeting ───────────────────────────────────────────────────────────
function triggerFirstGreeting() {
  if (welcomeSpoken) return;
  welcomeSpoken = true;
  initAudioContext();
  speak(t("greeting"));
}

// ─── Tab Switching ────────────────────────────────────────────────────────────
function initTabs() {
  document.querySelectorAll(".detail-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      const view = btn.dataset.view;
      document.querySelectorAll(".detail-tab").forEach(x => x.classList.remove("active"));
      btn.classList.add("active");
      document.querySelectorAll(".detail-panel").forEach(x => x.classList.remove("active-panel"));
      document.getElementById(`${view}-panel`)?.classList.add("active-panel");
    });
  });
}

// ─── DOMContentLoaded Setup ───────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  setupSpeechRecognition();
  initTabs();
  setVoiceBadge("ready");
  renderHintChips();

  // Local file warning
  if (window.location.protocol === "file:") {
    setTimeout(() => {
      appendMessage("assistant", t("local_file_warning"));
    }, 600);
  }

  // Preload TTS voices
  if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = () => {};
  }

  // Mic button
  document.getElementById("mic-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    triggerFirstGreeting();
    toggleListening();
  });

  // Greeting on first body click
  document.body.addEventListener("click", () => triggerFirstGreeting(), { once: true });

  // Help button (desktop + mobile)
  function handleHelpClick(e) {
    e.stopPropagation();
    triggerFirstGreeting();
    speakHelp();
  }
  document.getElementById("help-btn").addEventListener("click", handleHelpClick);
  document.getElementById("help-btn-mobile")?.addEventListener("click", handleHelpClick);

  // Clear transcript
  document.getElementById("clear-transcript-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    document.getElementById("transcript-logs").innerHTML = `<div class="msg-bubble assistant">${t("logs_cleared")}</div>`;
    playSound("success");
  });

  // Chat form (type to send)
  const chatInput = document.getElementById("chat-input");
  const chatSubmit = document.getElementById("chat-submit-btn");

  function sendTypedMessage() {
    const text = chatInput.value.trim();
    if (!text) return;
    triggerFirstGreeting();
    appendMessage("user", text);
    chatInput.value = "";
    // Flash voice-log link to show connection
    flashVoiceLink();
    processVoiceCommand(text);
  }

  chatSubmit?.addEventListener("click", sendTypedMessage);
  chatInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); sendTypedMessage(); }
  });

  // Contrast toggle (desktop + mobile)
  const contrastToggle = document.getElementById("contrast-toggle");
  const contrastToggleMobile = document.getElementById("contrast-toggle-mobile");
  function handleContrastClick(e) {
    e.stopPropagation();
    const isHC = document.body.classList.toggle("high-contrast");
    contrastToggle.setAttribute("aria-pressed", isHC);
    contrastToggleMobile?.classList.toggle("active", isHC);
    localStorage.setItem("high-contrast", isHC);
    playSound("success");
    const msg = isHC ? t("contrast_on") : t("contrast_off");
    appendMessage("assistant", msg);
    speak(msg);
  }
  contrastToggle.addEventListener("click", handleContrastClick);
  contrastToggleMobile?.addEventListener("click", handleContrastClick);

  if (localStorage.getItem("high-contrast") === "true") {
    document.body.classList.add("high-contrast");
    contrastToggle.setAttribute("aria-pressed", "true");
    contrastToggleMobile?.classList.add("active");
  }

  // Font size (desktop + mobile)
  let currentScale = parseFloat(localStorage.getItem("text-scale")) || 1.0;
  document.documentElement.style.setProperty("--text-scale", currentScale);

  function handleFontIncrease(e) {
    e.stopPropagation();
    if (currentScale < 1.6) {
      currentScale += 0.15;
      document.documentElement.style.setProperty("--text-scale", currentScale);
      localStorage.setItem("text-scale", currentScale);
      playSound("success");
      const msg = t("text_increased");
      speak(msg); appendMessage("assistant", msg);
    } else speak(t("text_max"));
  }
  function handleFontDecrease(e) {
    e.stopPropagation();
    if (currentScale > 0.85) {
      currentScale -= 0.15;
      document.documentElement.style.setProperty("--text-scale", currentScale);
      localStorage.setItem("text-scale", currentScale);
      playSound("success");
      const msg = t("text_decreased");
      speak(msg); appendMessage("assistant", msg);
    } else speak(t("text_min"));
  }
  document.getElementById("font-increase").addEventListener("click", handleFontIncrease);
  document.getElementById("font-decrease").addEventListener("click", handleFontDecrease);
  document.getElementById("font-increase-mobile")?.addEventListener("click", handleFontIncrease);
  document.getElementById("font-decrease-mobile")?.addEventListener("click", handleFontDecrease);

  // Keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    if (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA") return;
    if (e.code === "Space") {
      if (e.repeat) return;
      e.preventDefault();
      triggerFirstGreeting();
      toggleListening();
    }
    if (e.code === "Escape") {
      e.preventDefault();
      stopAllAudio();
      playSound("stop");
      appendMessage("assistant", t("audio_silenced"));
    }
    if (e.key.toLowerCase() === "c" && !e.ctrlKey && !e.altKey) contrastToggle.click();
    if (e.key.toLowerCase() === "h" && !e.ctrlKey && !e.altKey) document.getElementById("help-btn").click();
  });

  // Location button
  document.getElementById("location-btn")?.addEventListener("click", () => requestLocation());
});