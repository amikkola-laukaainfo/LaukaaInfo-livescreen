// LaukaaInfo Internationalization (i18n) System
// Supports: fi, en (prepared for sv, de, fr, es)

const I18N_CONFIG = {
    languages: ['fi', 'en', 'sv', 'de', 'fr', 'es'],
    defaultLanguage: 'fi',
    storageKey: 'laukaainfo_lang'
};

const UI_TRANSLATIONS = {
    fi: {
        "nav_home": "Etusivu",
        "nav_shop": "Kauppa",
        "nav_feed": "Feed-julkaisu",
        "nav_buy_visibility": "Osta lisää näkyvyyttä",
        "nav_business_visibility": "Yritysnäkyvyys",
        "nav_search_links": "Hakulinkit",
        "nav_featured": "Suosituimmat",
        "nav_categories": "Kategoriat",
        "nav_areas": "Taajamat",
        "nav_current": "Ajankohtaista",
        "nav_events": "Tapahtumat",
        "nav_news": "Tiedotteet",
        "nav_decisions": "Päätöksenteko",
        "nav_feedback": "Palautteet",
        "nav_paths": "Päätösten polut",
        "nav_search_explore": "Hae ja tutki",
        "nav_maps": "Kartat & Elämykset",
        "nav_map_points": "Karttakohteet",
        "nav_story_map": "Tarinakartta",
        "nav_memorial_map": "Muistokartta",
        "hero_title": "LaukaaInfo",
        "hero_subheading": "Kaikki Laukaasta yhdessä paikassa",
        "hero_tagline": "Löydä paikalliset palvelut, yritykset ja uutiset helposti. Autamme sinua järjestämään elämäsi tärkeät hetket Laukaassa.",
        "hero_button": "Mitä olet järjestämässä?",
        "btn_next": "Seuraava",
        "btn_back": "Takaisin",
        "btn_results": "Näytä tulokset",
        "search_loading": "Ladataan...",
        "search_no_results": "Ei tuloksia valituilla ehdoilla.",
        "service_path_title": "Valitse tarve",
        "service_path_desc": "Autamme sinua löytämään oikeat palvelut askel kerrallaan.",
        "search_multiple_desc": "Voit valita useamman vaihtoehdon.",
        "btn_reset": "Aloita alusta",
        "btn_print": "Tulosta PDF / Paperille",
        "feature_youtube_title": "Laukaa YouTube",
        "feature_youtube_desc": "Videoita, tapahtumia ja tunnelmia suoraan Laukaasta.",
        "feature_youtube_btn": "Katso videot",
        "feature_fb_title": "Keskustelu",
        "feature_fb_desc": "Liity Laukaan omaan Facebook-ryhmään ja osallistu.",
        "feature_fb_btn": "Liity ryhmään",
        "feature_news_title": "Ajankohtaista",
        "feature_news_desc": "Tärkeimmät uutiset ja kuntatiedotteet kootusti.",
        "feature_news_btn": "Lue uutiset",
        "feature_feed_title": "Laukaa-syöte",
        "feature_feed_desc": "Seuraa asukkaiden ja yritysten omia julkaisuja.",
        "feature_feed_btn": "Avaa syöte",
        "need_haat_title": "Häät",
        "need_haat_desc": "Suunnittele unelmiesi häät Laukaassa. Löydä tilat, tarjoilut ja elämykset.",
        "need_haat_btn": "Suunnittele häät",
        "need_section_title": "Mitä olet järjestämässä tai mitä palvelua tarvitset?",
        "need_section_desc": "Valitse alta tilanteesi, niin autamme sinua löytämään juuri oikeat paikalliset ratkaisut ja palvelut."
    },
    en: {
        "nav_home": "Home",
        "nav_shop": "Shop",
        "nav_feed": "Feed Post",
        "nav_buy_visibility": "Buy More Visibility",
        "nav_business_visibility": "Business Visibility",
        "nav_search_links": "Search Links",
        "nav_featured": "Featured",
        "nav_categories": "Categories",
        "nav_areas": "Areas",
        "nav_current": "Latest News",
        "nav_events": "Events",
        "nav_news": "Bulletins",
        "nav_decisions": "Decision Making",
        "nav_feedback": "Feedback",
        "nav_paths": "Decision Paths",
        "nav_search_explore": "Search & Explore",
        "nav_maps": "Maps & Experiences",
        "nav_map_points": "Map Points",
        "nav_story_map": "Story Map",
        "nav_memorial_map": "Memorial Map",
        "hero_title": "LaukaaInfo",
        "hero_subheading": "Everything about Laukaa in one place",
        "hero_tagline": "Find local services, businesses, and news easily. We help you organize the important moments of your life in Laukaa.",
        "hero_button": "What are you organizing?",
        "btn_next": "Next",
        "btn_back": "Back",
        "btn_results": "Show Results",
        "search_loading": "Loading...",
        "search_no_results": "No results found with selected criteria.",
        "service_path_title": "Select your need",
        "service_path_desc": "We help you find the right services step by step.",
        "search_multiple_desc": "You can select multiple options.",
        "btn_reset": "Start over",
        "btn_print": "Print PDF / Paper",
        "feature_youtube_title": "Laukaa YouTube",
        "feature_youtube_desc": "Videos, events and atmosphere directly from Laukaa.",
        "feature_youtube_btn": "Watch videos",
        "feature_fb_title": "Discussion",
        "feature_fb_desc": "Join Laukaa's own Facebook group and participate.",
        "feature_fb_btn": "Join group",
        "feature_news_title": "Latest News",
        "feature_news_desc": "The most important news and bulletins collected in one place.",
        "feature_news_btn": "Read news",
        "feature_feed_title": "Laukaa Feed",
        "feature_feed_desc": "Follow publications from local residents and businesses.",
        "feature_feed_btn": "Open feed",
        "need_haat_title": "Weddings",
        "need_haat_desc": "Plan your dream wedding in Laukaa. Find venues, catering, and experiences.",
        "need_haat_btn": "Plan wedding",
        "need_section_title": "What are you organizing or what service do you need?",
        "need_section_desc": "Select your situation below and we will help you find the right local solutions and services."
    }
};

class I18nManager {
    constructor() {
        this.currentLang = localStorage.getItem(I18N_CONFIG.storageKey) || I18N_CONFIG.defaultLanguage;
        // Ensure language is supported
        if (!I18N_CONFIG.languages.includes(this.currentLang)) {
            this.currentLang = I18N_CONFIG.defaultLanguage;
        }
    }

    setLanguage(lang) {
        if (I18N_CONFIG.languages.includes(lang)) {
            this.currentLang = lang;
            localStorage.setItem(I18N_CONFIG.storageKey, lang);
            this.translatePage();
            // Trigger custom event for other scripts (like search logic)
            window.dispatchEvent(new CustomEvent('languageChanged', { detail: { lang } }));
        }
    }

    t(key) {
        const translations = UI_TRANSLATIONS[this.currentLang] || UI_TRANSLATIONS[I18N_CONFIG.defaultLanguage];
        return translations[key] || key;
    }

    // Helper for objects in needs_config.js
    getText(obj) {
        if (!obj) return "";
        if (typeof obj === 'string') return obj;
        return obj[this.currentLang] || obj['fi'] || "";
    }

    translatePage() {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            const translation = this.t(key);
            
            if (el.tagName === 'INPUT' && (el.type === 'placeholder' || el.hasAttribute('placeholder'))) {
                el.placeholder = translation;
            } else {
                el.textContent = translation;
            }
        });
        
        // Update language switcher active state
        document.querySelectorAll('.lang-btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-lang') === this.currentLang);
        });

        // Update html lang attribute
        document.documentElement.lang = this.currentLang;
    }
}

const i18n = new I18nManager();

// Run translation when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    i18n.translatePage();
});

// Export to window
window.i18n = i18n;
