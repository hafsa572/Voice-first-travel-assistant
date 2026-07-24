// ─── i18n / Language System ───────────────────────────────────────────────────
// Supports: English (en), Hindi (hi), Hinglish (hl)

const TRANSLATIONS = {
  en: {
    // UI labels
    contrast: "Contrast",
    help: "Help",
    use_location: "Use My Location",
    nearby_places: "Nearby Places",
    nearby_empty: "Enable location to see nearby places",
    ready: "Ready",
    voice_command: "Voice Command",
    voice_hint: "Click mic or press Spacebar to speak",
    ready_assist: "Ready to assist",
    press: "Press",
    to_talk: "to talk",
    to_stop: "to stop",
    no_place: "No Place Selected",
    speak_prompt: "Speak to the assistant to inquire about places in Jharkhand and Jammu & Kashmir.",
    tab_desc: "Description",
    tab_images: "Images",
    tab_reviews: "Reviews",
    accessibility: "Accessibility Guide",
    conv_log: "Conversation Log",
    clear: "Clear",
    voice_connected: "Voice connected to log",
    type_query: "Type your query here...",
    welcome_msg: "Hello! I am your travel voice assistant. Click the microphone or hold the spacebar to ask me about tourist destinations in Jharkhand and J&K.",
    listening: "Listening...",
    speaking: "Speaking...",
    audio_stopped: "Audio stopped",
    cancelled: "Cancelled",
    km_away: "km away",
    no_nearby: "No nearby places found",
    // Voice responses
    greeting: "Hello, I am your Travel Voice Assistant and I am here to guide you. Hold the spacebar or tap the microphone to talk. You can ask for tourist places, hotels, restaurants, or shopping spots in Jharkhand or Jammu and Kashmir.",
    help_text: "You are using the Drishti Travel Voice Assistant. You can talk to me by clicking the microphone button or pressing your spacebar. Ask me about destinations in Jharkhand or Jammu and Kashmir. For example, you can say: Suggest places in Jharkhand, or Tell me about Parasnath Hill. You can also ask for hotels, restaurants, or shopping spots, for example: Suggest hotels in Ranchi, or Restaurants near here. Once a place is selected, you can ask follow-up questions such as: How do I reach there? Press Escape at any time to stop the voice output.",
    logs_cleared: "Logs cleared. I am ready to assist.",
    contrast_on: "High contrast mode enabled.",
    contrast_off: "High contrast mode disabled.",
    text_increased: "Text size increased.",
    text_decreased: "Text size decreased.",
    text_max: "Text size is already at maximum level.",
    text_min: "Text size is already at minimum level.",
    local_file_warning: "⚠️ Local File Detected: Web speech recognition is blocked by browser security rules when opening HTML files directly. To make it listen properly, please run a local server (e.g. run python -m http.server 8000 in your terminal and open http://localhost:8000). You can also use the chat bar below to type your messages.",
    local_file_speak: "Voice recognition is blocked on local files. Please run a local server or type your question in the chat input below.",
    no_match: "I couldn't identify the place. Are you looking for:\n• Waterfalls\n• Temples\n• Lakes\n• Dams\n• Wildlife\n\nOr a specific state?",
    no_match_speak: "Could you tell me the category or state you are interested in?",
    fallback: "I couldn't find a matching tourist place or action. You can ask for a list of places in Jharkhand or Jammu & Kashmir, or ask about specific sites like Dal Lake or Netarhat.",
    showing_details: "Showing details for",
    you_selected: "You selected",
    ask_more: "Ask me more about it!",
    similar_to: "Similar to",
    ai_picks: "— AI Picks",  /*  flag  */
    jharkhand_label: "Jharkhand Destinations",
    places_in: "Tourist spots in",
    spoken_list: "Spoken list:",
    ask_details: "Ask details about any of these!",
    here_are_top: "Here are the top tourist destinations in",
    which_one: "Which one would you like to hear details about?",
    found_several: "I found several",
    destinations: "destinations.",
    which_state: "Which state would you like to explore?",
    popular_in: "Popular",
    places_label: "places in",
    which_explore: "Which one would you like to explore?",
    couldnt_find: "I couldn't find",
    destinations_in: "destinations in",
    location_label: "is located at",
    mic_starting: "Starting microphone...",
    no_speech: "I did not hear anything. Please speak clearly into your microphone.",
    mic_denied: "Microphone access was denied. Please allow microphone access in your browser settings.",
    network_error: "A network error occurred. Speech recognition requires an internet connection.",
    no_mic: "No microphone was detected. Please plug in a microphone.",
    mic_cancelled: "Listening was cancelled.",
    mic_error_generic: "Speech recognition error",
    mic_not_supported: "Speech recognition is not supported in this browser. Please use Chrome or Edge for full voice commands. You can click the Help button to hear options.",
    voice_help_activated: "Voice Help Guide activated. Listen to instructions.",
    audio_silenced: "Audio silenced.",
    mic_local_blocked: "⚠️ Local File Restriction: Microphone voice recognition requires a local server. Please use the chat form below to type commands or run python -m http.server.",
    hotel_results_label: "Recommended Hotels",
    restaurant_results_label: "Recommended Restaurants",
    shopping_results_label: "Recommended Shopping Spots",
    no_hotel_found: "Sorry, I couldn't find any hotels matching that. Try asking for hotels in a specific district like Ranchi, Srinagar, or Jamshedpur.",
    no_restaurant_found: "Sorry, I couldn't find any restaurants matching that. Try asking for restaurants in a specific district like Ranchi or Jamshedpur.",
    no_shopping_found: "Sorry, I couldn't find any shopping spots matching that. Try asking for markets in a specific district like Ranchi or Dhanbad.",
    // Quick category chips (empty-state)
    chip_waterfall: "Waterfalls",
    chip_temple: "Temples",
    chip_lake: "Lakes",
    chip_dam: "Dams",
    chip_wildlife: "Wildlife",
    chip_hotels: "Hotels",
    chip_restaurants: "Restaurants",
    chip_shopping: "Shopping",
    // Follow-up suggestion chips (after a place is selected)
    chip_how_to_reach: "How do I reach?",
    chip_hotels_nearby: "Hotels nearby",
    chip_restaurants_nearby: "Restaurants nearby",
    chip_show_images: "Show images",
    chip_accessibility_info: "Accessibility info",
    // Reviews tab
    sentiment_positive: "Positive",
    sentiment_negative: "Negative",
    sentiment_mixed: "Mixed",
    sentiment_unknown: "No sentiment data",
    no_reviews: "No reviews available yet.",
  },

  hi: {
    contrast: "कंट्रास्ट",
    help: "सहायता",
    use_location: "मेरी लोकेशन उपयोग करें",
    nearby_places: "पास के स्थान",
    nearby_empty: "पास के स्थान देखने के लिए लोकेशन चालू करें",
    ready: "तैयार",
    voice_command: "वॉइस कमांड",
    voice_hint: "माइक दबाएं या स्पेसबार से बोलें",
    ready_assist: "सहायता के लिए तैयार",
    press: "दबाएं",
    to_talk: "बोलने के लिए",
    to_stop: "रोकने के लिए",
    no_place: "कोई स्थान नहीं चुना",
    speak_prompt: "झारखंड के स्थानों के बारे में पूछने के लिए बोलें।",
    tab_desc: "विवरण",
    tab_images: "चित्र",
    tab_reviews: "समीक्षाएं",
    accessibility: "पहुंच मार्गदर्शिका",
    conv_log: "बातचीत लॉग",
    clear: "साफ करें",
    voice_connected: "आवाज़ लॉग से जुड़ी है",
    type_query: "अपना प्रश्न यहाँ टाइप करें...",
    welcome_msg: "नमस्ते! मैं आपका ट्रैवल वॉइस असिस्टेंट हूं। झारखंड के पर्यटन स्थलों के बारे में पूछने के लिए माइक बटन दबाएं।",
    listening: "सुन रहा हूं...",
    speaking: "बोल रहा हूं...",
    audio_stopped: "ऑडियो बंद",
    cancelled: "रद्द किया",
    km_away: "किमी दूर",
    no_nearby: "कोई पास का स्थान नहीं मिला",
    greeting: "नमस्ते! मैं आपका ट्रैवल वॉइस असिस्टेंट हूं। माइक दबाएं और झारखंड या जम्मू-कश्मीर के पर्यटन स्थलों, होटल, रेस्टोरेंट या बाज़ार के बारे में पूछें।",
    help_text: "आप दृष्टि ट्रैवल वॉइस असिस्टेंट का उपयोग कर रहे हैं। माइक बटन दबाएं या स्पेसबार से बोलें। झारखंड या जम्मू-कश्मीर के स्थानों के बारे में पूछें जैसे — झारखंड के स्थान बताएं, या पारसनाथ के बारे में बताएं। आप होटल, रेस्टोरेंट या बाज़ार के बारे में भी पूछ सकते हैं, जैसे — रांची में होटल बताएं। एस्केप दबाकर ऑडियो रोकें।",
    logs_cleared: "लॉग साफ हो गया। मैं सहायता के लिए तैयार हूं।",
    contrast_on: "हाई कंट्रास्ट मोड चालू हुआ।",
    contrast_off: "हाई कंट्रास्ट मोड बंद हुआ।",
    text_increased: "टेक्स्ट का आकार बढ़ा।",
    text_decreased: "टेक्स्ट का आकार घटा।",
    text_max: "टेक्स्ट पहले से अधिकतम आकार पर है।",
    text_min: "टेक्स्ट पहले से न्यूनतम आकार पर है।",
    local_file_warning: "⚠️ लोकल फ़ाइल मिली: ब्राउज़र सुरक्षा नियमों के कारण HTML फ़ाइल खोलने पर वॉइस रिकग्निशन अवरुद्ध है। कृपया local server चलाएं।",
    local_file_speak: "वॉइस रिकग्निशन लोकल फ़ाइलों पर काम नहीं करता। कृपया नीचे चैट बॉक्स में लिखें।",
    no_match: "स्थान पहचाना नहीं जा सका। क्या आप ढूंढ रहे हैं:\n• झरना\n• मंदिर\n• झील\n• बांध\n• वन्यजीव",
    no_match_speak: "कृपया श्रेणी या राज्य बताएं जिसमें आप रुचि रखते हैं।",
    fallback: "मिलान नहीं मिला। झारखंड के स्थानों की सूची मांगें या Netarhat, Parasnath जैसे विशिष्ट स्थान पूछें।",
    showing_details: "का विवरण दिखा रहा हूं",
    you_selected: "आपने चुना",
    ask_more: "इसके बारे में और पूछें!",
    similar_to: "से मिलते-जुलते",
    ai_picks: "— AI सुझाव",
    jharkhand_label: "झारखंड के गंतव्य",
    places_in: "पर्यटन स्थल",
    spoken_list: "सूची:",
    ask_details: "इनमें से किसी के बारे में विवरण पूछें!",
    here_are_top: "के शीर्ष पर्यटन स्थल हैं",
    which_one: "आप किसके बारे में जानना चाहते हैं?",
    found_several: "मुझे कई मिले",
    destinations: "गंतव्य।",
    which_state: "आप किस राज्य में जाना चाहते हैं?",
    popular_in: "लोकप्रिय",
    places_label: "स्थान",
    which_explore: "आप कौन सा देखना चाहते हैं?",
    couldnt_find: "नहीं मिला",
    destinations_in: "गंतव्य",
    location_label: "यहाँ स्थित है",
    mic_starting: "माइक शुरू हो रहा है...",
    no_speech: "कुछ सुनाई नहीं दिया। कृपया स्पष्ट रूप से बोलें।",
    mic_denied: "माइक की अनुमति नहीं मिली। ब्राउज़र सेटिंग में अनुमति दें।",
    network_error: "नेटवर्क त्रुटि हुई। वॉइस के लिए इंटरनेट आवश्यक है।",
    no_mic: "कोई माइक नहीं मिला। माइक लगाएं।",
    mic_cancelled: "सुनना रद्द किया।",
    mic_error_generic: "वॉइस त्रुटि",
    mic_not_supported: "यह ब्राउज़र वॉइस रिकग्निशन सपोर्ट नहीं करता। Chrome या Edge उपयोग करें।",
    voice_help_activated: "वॉइस सहायता गाइड सक्रिय। निर्देश सुनें।",
    audio_silenced: "ऑडियो बंद।",
    mic_local_blocked: "⚠️ लोकल फ़ाइल: वॉइस के लिए local server आवश्यक है। नीचे चैट में लिखें।",
    hotel_results_label: "सुझाए गए होटल",
    restaurant_results_label: "सुझाए गए रेस्टोरेंट",
    shopping_results_label: "सुझाए गए बाज़ार",
    no_hotel_found: "माफ़ कीजिए, मुझे मेल खाता कोई होटल नहीं मिला। रांची, श्रीनगर या जमशेदपुर जैसे किसी जिले में होटल पूछें।",
    no_restaurant_found: "माफ़ कीजिए, मुझे मेल खाता कोई रेस्टोरेंट नहीं मिला। रांची या जमशेदपुर जैसे किसी जिले में रेस्टोरेंट पूछें।",
    no_shopping_found: "माफ़ कीजिए, मुझे मेल खाता कोई बाज़ार नहीं मिला। रांची या धनबाद जैसे किसी जिले में बाज़ार पूछें।",
    chip_waterfall: "झरने",
    chip_temple: "मंदिर",
    chip_lake: "झीलें",
    chip_dam: "बांध",
    chip_wildlife: "वन्यजीव",
    chip_hotels: "होटल",
    chip_restaurants: "रेस्टोरेंट",
    chip_shopping: "बाज़ार",
    chip_how_to_reach: "कैसे पहुंचें?",
    chip_hotels_nearby: "पास के होटल",
    chip_restaurants_nearby: "पास के रेस्टोरेंट",
    chip_show_images: "चित्र देखें",
    chip_accessibility_info: "पहुंच जानकारी",
    // Reviews tab
    sentiment_positive: "सकारात्मक",
    sentiment_negative: "नकारात्मक",
    sentiment_mixed: "मिश्रित",
    sentiment_unknown: "समीक्षा जानकारी उपलब्ध नहीं",
    no_reviews: "अभी तक कोई समीक्षा उपलब्ध नहीं है।",
  },

  hl: {
    contrast: "Contrast",
    help: "Help / Madad",
    use_location: "Meri Location Use Karo",
    nearby_places: "Paas ke Jagah",
    nearby_empty: "Location ON karo paas ke jagah dekhne ke liye",
    ready: "Taiyaar",
    voice_command: "Voice Command",
    voice_hint: "Mic dabao ya Spacebar se bolo",
    ready_assist: "Help ke liye taiyaar hoon",
    press: "Dabao",
    to_talk: "bolne ke liye",
    to_stop: "rokne ke liye",
    no_place: "Koi jagah nahi chuni",
    speak_prompt: "Jharkhand ke jagahon ke baare mein poochho.",
    tab_desc: "Vivaran",
    tab_images: "Tasveerein",
    tab_reviews: "Reviews",
    accessibility: "Accessibility Guide",
    conv_log: "Baat-cheet Log",
    clear: "Clear Karo",
    voice_connected: "Voice log se connected hai",
    type_query: "Yahan apna sawaal likhein...",
    welcome_msg: "Namaste! Main aapka Travel Voice Assistant hoon. Mic button dabao ya spacebar se Jharkhand ke tourist places ke baare mein poochho.",
    listening: "Sun raha hoon...",
    speaking: "Bol raha hoon...",
    audio_stopped: "Audio band",
    cancelled: "Cancel ho gaya",
    km_away: "km door",
    no_nearby: "Koi paas ki jagah nahi mili",
    greeting: "Namaste! Main aapka Travel Voice Assistant hoon. Spacebar dabao ya mic tap karo aur Jharkhand ya Jammu-Kashmir ke tourist places, hotels, restaurants ya shopping ke baare mein poochho.",
    help_text: "Aap Drishti Travel Voice Assistant use kar rahe hain. Mic dabao ya spacebar se bolo. Jharkhand ya Jammu-Kashmir ke jagah poochho jaise — Jharkhand ke jagah batao, ya Parasnath ke baare mein batao. Aap hotels, restaurants ya shopping ke baare mein bhi poochh sakte hain, jaise — Ranchi mein hotels batao. Esc dabao audio rokne ke liye.",
    logs_cleared: "Logs saaf ho gaye. Main help ke liye taiyaar hoon.",
    contrast_on: "High contrast mode on ho gaya.",
    contrast_off: "High contrast mode off ho gaya.",
    text_increased: "Text bada ho gaya.",
    text_decreased: "Text chota ho gaya.",
    text_max: "Text pehle se sabse bada hai.",
    text_min: "Text pehle se sabse chota hai.",
    local_file_warning: "⚠️ Local File mili: Browser security ki wajah se voice recognition yahan kaam nahi karega. Local server chalao ya neeche chat box mein likhein.",
    local_file_speak: "Voice recognition local files par kaam nahi karta. Neeche chat input mein likhein.",
    no_match: "Jagah pehchani nahi gayi. Kya aap dhoondh rahe hain:\n• Waterfall / Jharni\n• Mandir\n• Jheel\n• Bandh / Dam\n• Wildlife",
    no_match_speak: "Kripaya category ya rajya batayein jisme aap interested hain.",
    fallback: "Koi tourist jagah nahi mili. Jharkhand ke tourist places ki list maango ya Netarhat, Parasnath jaisi jagah poochho.",
    showing_details: "ka detail dikh raha hai",
    you_selected: "Aapne choose kiya",
    ask_more: "Iske baare mein aur poochho!",
    similar_to: "se milta-julta",
    ai_picks: "— AI Picks",
    jharkhand_label: "Jharkhand ke Destinations",
    places_in: "Tourist spots",
    spoken_list: "List:",
    ask_details: "Inme se kisi ke baare mein detail poochho!",
    here_are_top: "ke top tourist places hain",
    which_one: "Aap kiske baare mein jaanna chahte hain?",
    found_several: "Mujhe kai",
    destinations: "destinations mile.",
    which_state: "Aap kaunse state mein jaana chahte hain?",
    popular_in: "Popular",
    places_label: "jagahein",
    which_explore: "Aap kaun sa dekhna chahte hain?",
    couldnt_find: "Nahi mila",
    destinations_in: "mein destination",
    location_label: "yahan hai",
    mic_starting: "Mic shuru ho raha hai...",
    no_speech: "Kuch sunai nahi diya. Kripaya clearly bolein.",
    mic_denied: "Mic ki permission nahi mili. Browser settings mein allow karein.",
    network_error: "Network error aayi. Voice ke liye internet chahiye.",
    no_mic: "Koi mic nahi mila. Mic lagaao.",
    mic_cancelled: "Sunna cancel ho gaya.",
    mic_error_generic: "Voice error",
    mic_not_supported: "Ye browser voice recognition support nahi karta. Chrome ya Edge use karein.",
    voice_help_activated: "Voice Help Guide active. Instructions sunein.",
    audio_silenced: "Audio band ho gaya.",
    mic_local_blocked: "⚠️ Local File: Voice ke liye local server chahiye. Neeche chat mein likhein.",
    hotel_results_label: "Recommended Hotels",
    restaurant_results_label: "Recommended Restaurants",
    shopping_results_label: "Recommended Shopping Spots",
    no_hotel_found: "Sorry, mujhe koi matching hotel nahi mila. Ranchi, Srinagar ya Jamshedpur jaise kisi district mein hotel poochho.",
    no_restaurant_found: "Sorry, mujhe koi matching restaurant nahi mila. Ranchi ya Jamshedpur jaise kisi district mein restaurant poochho.",
    no_shopping_found: "Sorry, mujhe koi matching shopping spot nahi mila. Ranchi ya Dhanbad jaise kisi district mein market poochho.",
    chip_waterfall: "Waterfalls",
    chip_temple: "Mandir",
    chip_lake: "Jheelein",
    chip_dam: "Dam / Bandh",
    chip_wildlife: "Wildlife",
    chip_hotels: "Hotels",
    chip_restaurants: "Restaurants",
    chip_shopping: "Shopping",
    chip_how_to_reach: "Kaise pahunchein?",
    chip_hotels_nearby: "Paas ke hotels",
    chip_restaurants_nearby: "Paas ke restaurants",
    chip_show_images: "Images dekho",
    chip_accessibility_info: "Accessibility info",
    // Reviews tab
    sentiment_positive: "Positive",
    sentiment_negative: "Negative",
    sentiment_mixed: "Mixed",
    sentiment_unknown: "Sentiment data nahi mila",
    no_reviews: "Abhi tak koi review available nahi hai.",
  }
};

// Speech recognition language codes per UI language
const SPEECH_LANG = { en: "en-IN", hi: "hi-IN", hl: "hi-IN" };

// Speech synthesis language per UI language
const TTS_LANG = { en: "en-IN", hi: "hi-IN", hl: "hi-IN" };

let currentLang = localStorage.getItem("app-lang") || "en";

function t(key) {
  return (TRANSLATIONS[currentLang] && TRANSLATIONS[currentLang][key]) ||
         (TRANSLATIONS["en"] && TRANSLATIONS["en"][key]) || key;
}

function applyTranslations() {
  // All elements with data-i18n attribute
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    el.textContent = t(key);
  });
  // Placeholders
  document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
    const key = el.getAttribute("data-i18n-placeholder");
    el.placeholder = t(key);
  });
  // Update html lang attribute
  const langMap = { en: "en", hi: "hi", hl: "hi" };
  document.documentElement.lang = langMap[currentLang] || "en";
}

function setLanguage(lang) {
  if (!TRANSLATIONS[lang]) return;
  currentLang = lang;
  localStorage.setItem("app-lang", lang);

  // Update buttons
  document.querySelectorAll(".btn-lang").forEach(btn => {
    const isActive = btn.dataset.lang === lang;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-pressed", isActive ? "true" : "false");
  });

  applyTranslations();

  // Update speech recognition language if it exists (app.js exports recognition)
  if (window.updateRecognitionLang) {
    window.updateRecognitionLang(SPEECH_LANG[lang]);
  }

  // Re-render dynamically-built chips so their labels match the new language
  if (window.renderHintChips) window.renderHintChips();
  if (window.renderSuggestionChips && window.selectedPlace) window.renderSuggestionChips(window.selectedPlace);
}

// Initialize language switcher buttons
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".btn-lang").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      setLanguage(btn.dataset.lang);
      // Announce language change
      const msgs = { en: "Language changed to English", hi: "भाषा हिंदी में बदली", hl: "Language Hinglish ho gayi" };
      if (window.appendMessage) window.appendMessage("assistant", msgs[btn.dataset.lang] || "");
      if (window.speak) window.speak(msgs[btn.dataset.lang] || "");
    });
  });

  // Apply saved language
  setLanguage(currentLang);
  // Mark active lang button
  document.querySelectorAll(".btn-lang").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.lang === currentLang);
  });
});
