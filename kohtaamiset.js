/**
 * Laukaan Kohtaamispaikka
 * kohtaamiset.js – v2 (2026-07-09)
 *
 * Uudet ominaisuudet:
 *  - Sivupalkki + mobiilipainikkeet kategoriafiltteröintiin
 *  - Vapaakenttähaku (otsikko + kuvaus + tagit)
 *  - Tunniste (tag) -tuki: klikatessa suodattaa saman tagin
 *  - Laskurit sivupalkissa (montako ilmoitusta per kategoria)
 *  - Supabase-fallback mock-dataan kuten ennen
 */

// ===================================================
// KATEGORIAT — Uusi 7-tyypin malli + legacy-mapitus
// ===================================================

/** Uudet päätyypit (tallentuvat encounters.type -kenttään) */
const ENCOUNTER_CATEGORIES = {
    'search':     { title: 'Etsin',               emoji: '🔍', color: '#a855f7', description: 'Etsin jotain tai jotakuta' },
    'offer':      { title: 'Tarjoan',             emoji: '🟢', color: '#22c55e', description: 'Voin tarjota jotain' },
    'sell':       { title: 'Myyn',                emoji: '🛒', color: '#eab308', description: 'Myyn jotain' },
    'give':       { title: 'Annan',               emoji: '🎁', color: '#14b8a6', description: 'Annan jotain ilmaiseksi' },
    'notice':     { title: 'Ilmoitan',            emoji: '📢', color: '#ef4444', description: 'Haluan kertoa paikallisesta asiasta' },
    'idea':       { title: 'Idea',                emoji: '💡', color: '#f97316', description: 'Minulla on idea tai kehitysajatus' },
    'lost_found': { title: 'Kadonnut / löytynyt', emoji: '🎒', color: '#f59e0b', description: 'Jotain on kadonnut tai löytynyt' },
};

/**
 * Sub-kategorioiden nimet (encounters.sub_category -kenttä)
 */
const SUB_CATEGORY_LABELS = {
    'service':       'Palvelua',
    'item':          'Tavaraa',
    'space':         'Tilaa tai paikkaa',
    'work':          'Työtä tai tekijää',
    'collaboration': 'Yhteistyötä',
    'event_staff':   'Tapahtumaan osallistujia',
    'skill':         'Osaamista',
    'transport':     'Kyytiä',
    'help':          'Apua',
    'lost':          'Kadonnut',
    'found':         'Löytynyt',
    'other':         'Muuta',
};

/**
 * Legacy-mapitus: vanha type → uusi kategoria + sub_category
 * Käytetään kun encounters.type on vanha arvo (esim. need_help, offer_service)
 */
const LEGACY_MAP = {
    'service_request': { cat: 'search',     sub: 'service' },
    'need_help':       { cat: 'search',     sub: 'service' },
    'offer_service':   { cat: 'offer',      sub: 'service' },
    'b2b_collab':      { cat: 'search',     sub: 'collaboration' },
    'event_staff':     { cat: 'search',     sub: 'event_staff' },
    'space_rental':    { cat: 'search',     sub: 'space' },
    'work_and_gigs':   { cat: 'search',     sub: 'work' },
    'local_notice':    { cat: 'notice',     sub: null },
    'lost_and_found':  { cat: 'lost_found', sub: null },
    'community':       { cat: 'notice',     sub: null },
    'high_value':      { cat: 'sell',       sub: null },
};

/**
 * Palauttaa uuden kategoriaobjektin mille tahansa type-arvolle (uusi tai legacy).
 * @param {string} type  encounters.type -kentän arvo
 * @param {string|null} subCategory  encounters.sub_category -kentän arvo (valinnainen)
 * @returns {{ emoji, title, color, subLabel }}
 */
function resolveCategory(type, subCategory = null) {
    // Uusi ID → suora haku
    if (ENCOUNTER_CATEGORIES[type]) {
        const cat = ENCOUNTER_CATEGORIES[type];
        const subLabel = (subCategory && SUB_CATEGORY_LABELS[subCategory]) || null;
        return { ...cat, subLabel };
    }
    // Legacy ID → mapitus
    const mapped = LEGACY_MAP[type];
    if (mapped) {
        const cat = ENCOUNTER_CATEGORIES[mapped.cat] || ENCOUNTER_CATEGORIES['notice'];
        const effectiveSub = subCategory || mapped.sub;
        const subLabel = (effectiveSub && SUB_CATEGORY_LABELS[effectiveSub]) || null;
        return { ...cat, subLabel };
    }
    // Fallback
    return { emoji: '📢', title: 'Ilmoitus', color: '#64748b', subLabel: null };
}

/** @deprecated Käytä resolveCategory() uudessa koodissa */
const categories = {
    ...Object.fromEntries(Object.entries(ENCOUNTER_CATEGORIES).map(([k, v]) => [k, { ...v, icon: v.emoji }])),
    // Legacy-aliakset taaksepäin-yhteensopivuuteen
    'service_request': { title: 'Etsin • Palvelua',     icon: '🔍', emoji: '🔍', color: '#a855f7' },
    'need_help':       { title: 'Etsin • Palvelua',     icon: '🔍', emoji: '🔍', color: '#a855f7' },
    'offer_service':   { title: 'Tarjoan • Palvelua',   icon: '🟢', emoji: '🟢', color: '#22c55e' },
    'work_and_gigs':   { title: 'Etsin • Työtä',        icon: '🔍', emoji: '🔍', color: '#a855f7' },
    'community':       { title: 'Ilmoitan',             icon: '📢', emoji: '📢', color: '#ef4444' },
    'space_rental':    { title: 'Etsin • Tilaa',        icon: '🔍', emoji: '🔍', color: '#a855f7' },
    'b2b_collab':      { title: 'Etsin • Yhteistyötä',  icon: '🔍', emoji: '🔍', color: '#a855f7' },
    'event_staff':     { title: 'Etsin • Osallistujia', icon: '🔍', emoji: '🔍', color: '#a855f7' },
    'high_value':      { title: 'Myyn',                 icon: '🛒', emoji: '🛒', color: '#eab308' },
    'local_notice':    { title: 'Ilmoitan',             icon: '📢', emoji: '📢', color: '#ef4444' },
    'lost_and_found':  { title: 'Kadonnut / löytynyt',  icon: '🎒', emoji: '🎒', color: '#f59e0b' },
};

// ===================================================
// MOCK-DATA (tageilla varustettuna)
// ===================================================
const mockEncounters = [
    {
        id: '1',
        type: 'need_help',
        title: 'Nurmikon leikkuu ja pihatyöt (Demo)',
        description: 'Etsin reipasta tekijää leikkaamaan omakotitalon nurmikon (n. 800m2) kerran viikossa kesän ajan. Omat välineet plussaa, mutta meiltäkin löytyy työnnettävä leikkuri.',
        price_info: '20€ / kerta',
        location: 'Lievestuore',
        tags: ['pihatyöt', 'nurmikko', 'kesä'],
        created_at: new Date(Date.now() - 86400000 * 2).toISOString()
    },
    {
        id: '2',
        type: 'work_and_gigs',
        title: 'Tietokoneiden asennus ja opastus (Demo)',
        description: 'Olen IT-alan opiskelija ja autan mielelläni uuden tietokoneen tai puhelimen käyttöönotossa. Voin opastaa myös pankkitunnusten käytössä turvallisesti.',
        price_info: '25€ / h',
        location: 'Koko Laukaa',
        tags: ['it-tuki', 'tietokone', 'opastus'],
        created_at: new Date(Date.now() - 86400000 * 1).toISOString()
    },
    {
        id: '3',
        type: 'work_and_gigs',
        title: 'Tarjouspyyntö: Toimistotilojen siivous (Demo)',
        description: 'Etsimme paikallista siivousyritystä hoitamaan toimistomme (150m2) siivouksen kerran viikossa. Yhteydenotot vain y-tunnuksellisilta toimijoilta.',
        price_info: 'Pyydä tarjous',
        location: 'Laukaa kk',
        tags: ['siivous', 'toimistot', 'säännöllinen'],
        created_at: new Date(Date.now() - 86400000 * 5).toISOString()
    },
    {
        id: '4',
        type: 'community',
        title: 'Leppäveden Kyläjuhlat: Järjestyksenvalvojia (Demo)',
        description: 'Etsimme vapaaehtoisia järjestyksenvalvojia (JV-kortti vaaditaan) kyläjuhliin lauantaille. Tarjoamme ruoat ja kahvit.',
        price_info: 'Vapaaehtoistyö',
        location: 'Leppävesi',
        tags: ['talkoot', 'kyläjuhla', 'JV-kortti'],
        created_at: new Date(Date.now() - 86400000 * 10).toISOString()
    },
    {
        id: '5',
        type: 'space_rental',
        title: 'Vuokrataan peräkärry kuomulla (Demo)',
        description: 'Tilava ja siisti kuomullinen peräkärry vuokralle muuttoihin tai puutarhajätteelle. Kantavuus 500kg.',
        price_info: '20€ / vrk',
        location: 'Vihtavuori',
        tags: ['peräkärry', 'vuokra', 'muutto'],
        created_at: new Date(Date.now() - 86400000 * 3).toISOString()
    },
    {
        id: '6',
        type: 'high_value',
        title: 'Myydään: Traktorimönkijä Polaris Sportsman (Demo)',
        description: 'Hyväkuntoinen ja säännöllisesti huollettu mönkijä lumilevyllä ja vinssillä. Ajettu vain 1500km. Loistava talven lumitöihin tai metsätöihin.',
        price_info: '5 500 €',
        location: 'Vehniä',
        tags: ['mönkijä', 'myynti', 'talvi'],
        created_at: new Date(Date.now() - 86400000 * 1).toISOString()
    },
    {
        id: '7',
        type: 'offer_service',
        title: 'Piensähkötyöt ja asennukset (Demo)',
        description: 'Sähköasentaja tarjoaa palveluja piensähkötöihin: pistorasiat, valaisinasennukset, vikavirtasuojat jne. Nopea reagointi, paikallinen tekijä.',
        price_info: '55€ / h + alv',
        location: 'Laukaa',
        tags: ['sähkötyöt', 'asennus', 'remontti'],
        created_at: new Date(Date.now() - 86400000 * 4).toISOString()
    },
    {
        id: '8',
        type: 'work_and_gigs',
        title: 'Keikkatyö: DJ juhlatilaisuuksiin (Demo)',
        description: 'Kokenut DJ haluaa keikkatöitä häihin, syntymäpäiville ja yritystapahtumiin. Oma kalusto (äänijärjestelmä + valot). Esiintynyt 50+ tilaisuudessa.',
        price_info: 'Sopimuksen mukaan',
        location: 'Koko Laukaa',
        tags: ['DJ', 'musiikki', 'juhlat'],
        created_at: new Date(Date.now() - 86400000 * 2).toISOString()
    }
];

// ===================================================
// TILA
// ===================================================
let activeFilter   = 'all';
let activePlaceId  = 'all';
let activeThemeId  = 'all';
let activeTag      = null;
let searchQuery    = '';
let sortOrder      = 'newest';
let allEncounters  = [];
let placesList     = [];
let themesList     = [];
let themePlacesMap = [];
let encounterCache = null;
let encounterCacheTime = 0;

// ===================================================
// DATAN HAKU (Encounters, Places, Themes, Theme_Places)
// ===================================================
// RPC-APUFUNKTIOT (create, update, delete, contact)
// ===================================================

async function createEncounterRpc(params) {
    if (!window.LaukaaSupabase) throw new Error('Supabase ei ole alustettu');
    
    // Tarkistetaan onko aktiivinen organisaatioistunto sessionStorage-muistissa
    const finalParams = { ...params };
    const orgSession = window.LaukaaOrgSession ? window.LaukaaOrgSession.getSession() : null;

    if (orgSession && orgSession.session_token) {
        // Jos organisaatiotunnus täsmää tai sitä ei ole asetettu, liitetään istunto automaattisesti
        if (!finalParams.p_organization_id || finalParams.p_organization_id === orgSession.org_id) {
            finalParams.p_org_session_token = orgSession.session_token;
            finalParams.p_organization_id = orgSession.org_id;
            if (!finalParams.p_creator_type) {
                finalParams.p_creator_type = 'ORGANIZATION';
            }
        }
    }

    const { data, error } = await window.LaukaaSupabase.rpc('create_encounter', finalParams);
    if (error) throw error;

    // Jos saatiin palautteena anonyymi edit_token, tallennetaan se localStorage-muistiin
    if (data && data.encounter_id && data.edit_token && window.LaukaaEditTokens) {
        window.LaukaaEditTokens.saveToken(data.encounter_id, data.edit_token);
    }

    return data;
}

async function updateEncounterRpc(encounterId, editToken = null, updates = {}, orgSessionToken = null, organizationId = null) {
    if (!window.LaukaaSupabase) throw new Error('Supabase ei ole alustettu');

    let effectiveEditToken = editToken || (window.LaukaaEditTokens ? window.LaukaaEditTokens.getToken(encounterId) : null);
    let effectiveOrgToken = orgSessionToken;
    let effectiveOrgId = organizationId;

    if (!effectiveOrgToken && window.LaukaaOrgSession) {
        const session = window.LaukaaOrgSession.getSession();
        if (session) {
            effectiveOrgToken = session.session_token;
            effectiveOrgId = effectiveOrgId || session.org_id;
        }
    }

    const { data, error } = await window.LaukaaSupabase.rpc('update_encounter_with_token', {
        p_encounter_id: encounterId,
        p_edit_token: effectiveEditToken || null,
        p_org_session_token: effectiveOrgToken || null,
        p_organization_id: effectiveOrgId || null,
        p_title: updates.title || null,
        p_description: updates.description || null,
        p_price_info: updates.price_info || null,
        p_status: updates.status || null
    });
    if (error) throw error;
    return data;
}

async function deleteEncounterRpc(encounterId, editToken = null, orgSessionToken = null, organizationId = null) {
    if (!window.LaukaaSupabase) throw new Error('Supabase ei ole alustettu');

    let effectiveEditToken = editToken || (window.LaukaaEditTokens ? window.LaukaaEditTokens.getToken(encounterId) : null);
    let effectiveOrgToken = orgSessionToken;
    let effectiveOrgId = organizationId;

    if (!effectiveOrgToken && window.LaukaaOrgSession) {
        const session = window.LaukaaOrgSession.getSession();
        if (session) {
            effectiveOrgToken = session.session_token;
            effectiveOrgId = effectiveOrgId || session.org_id;
        }
    }

    const { data, error } = await window.LaukaaSupabase.rpc('delete_encounter_with_token', {
        p_encounter_id: encounterId,
        p_edit_token: effectiveEditToken || null,
        p_org_session_token: effectiveOrgToken || null,
        p_organization_id: effectiveOrgId || null
    });
    if (error) throw error;

    if (window.LaukaaEditTokens) {
        window.LaukaaEditTokens.removeToken(encounterId);
    }
    return data;
}

async function getEncounterContactRpc(encounterId, editToken = null) {
    if (!window.LaukaaSupabase) throw new Error('Supabase ei ole alustettu');
    const { data, error } = await window.LaukaaSupabase.rpc('get_encounter_contact', {
        p_encounter_id: encounterId,
        p_edit_token: editToken
    });
    if (error) throw error;
    return data;
}

// Globaali API-rajapinta
window.LaukaaKohtaamiset = {
    createEncounter: createEncounterRpc,
    updateEncounter: updateEncounterRpc,
    deleteEncounter: deleteEncounterRpc,
    getContact: getEncounterContactRpc,
    beginOrgSession: (orgId, key) => (window.LaukaaOrgSession ? window.LaukaaOrgSession.beginSession(orgId, key) : Promise.reject('OrgSession ei alustettu')),
    endOrgSession: () => (window.LaukaaOrgSession ? window.LaukaaOrgSession.endSession() : Promise.resolve(true)),
    getOrgSession: () => (window.LaukaaOrgSession ? window.LaukaaOrgSession.getSession() : null)
};

// ===================================================
async function fetchEncounters(currentUser = null) {
    if (!currentUser && encounterCache && Date.now() - encounterCacheTime < 5 * 60 * 1000) {
        return encounterCache;
    }
    try {
        if (window.LaukaaSupabase) {
            let data, error;

            if (currentUser) {
                // Kirjautunut: näytä julkiset + omat kaikissa tiloissa suorasta taulusta
                ({ data, error } = await window.LaukaaSupabase
                    .from('encounters')
                    .select('*')
                    .or(`status.eq.active,and(user_id.eq.${currentUser.id},status.in.(draft,closed,archived))`)
                    .order('created_at', { ascending: false }));
            } else {
                // Anonyymi: luetaan aina encounters_public -näkymästä (RLS-turvattu, ei salaisuuksia)
                ({ data, error } = await window.LaukaaSupabase
                    .from('encounters_public')
                    .select('*')
                    .order('created_at', { ascending: false }));
            }

            if (error) {
                console.error('Supabase fetch error:', error);
                // Käyttöliittymä ei korvaa aitoa tietokantavirhettä mock-datalla
                const errBanner = document.getElementById('km-db-error-banner');
                if (errBanner) {
                    errBanner.style.display = 'block';
                    errBanner.innerText = 'Kohtaamisten lataus epäonnistui tietokantavirheen vuoksi.';
                }
                return [];
            }
            if (data !== null) {
                const res = data.map(d => ({ ...d, is_encounter: true, tags: Array.isArray(d.tags) ? d.tags : [] }));
                if (!currentUser) {
                    encounterCache = res;
                    encounterCacheTime = Date.now();
                }
                return res;
            }
        }
    } catch (e) {
        console.error('Virhe haettaessa Supabasesta:', e);
        return [];
    }
    // Vain jos Supabase-asiakasta ei ole määritelty lainkaan (paikallinen offline-testaus)
    return mockEncounters.map(m => ({ ...m, is_encounter: true }));
}

async function fetchPlacesList() {
    if (window.LaukaaSupabase) {
        try {
            const { data, error } = await window.LaukaaSupabase
                .from('places')
                .select('place_id, name, canonical_name, address')
                .order('name');
            if (!error && data && data.length > 0) return data;
        } catch (e) {
            console.warn('Virhe haettaessa paikkoja Supabasesta:', e);
        }
    }
    return [
        { place_id: 'p-kirjasto', name: 'Laukaan pääkirjasto', canonical_name: 'Laukaan pääkirjasto' },
        { place_id: 'p-peurunka', name: 'Peurunka', canonical_name: 'Peurunka' },
        { place_id: 'p-satama', name: 'Laukaan satama', canonical_name: 'Laukaan satama' },
        { place_id: 'p-vihtavuori', name: 'Vihtavuori', canonical_name: 'Vihtavuori' },
        { place_id: 'p-lievestuore', name: 'Lievestuore', canonical_name: 'Lievestuore' },
        { place_id: 'p-leppavesi', name: 'Leppävesi', canonical_name: 'Leppävesi' },
        { place_id: 'p-vehnia', name: 'Vehniä', canonical_name: 'Vehniä' },
        { place_id: 'p-saraakallio', name: 'Saraakallio', canonical_name: 'Saraakallio' },
        { place_id: 'p-hitonhauta', name: 'Hitonhauta', canonical_name: 'Hitonhauta' },
    ];
}

async function fetchThemesList() {
    if (window.LaukaaSupabase) {
        try {
            const { data, error } = await window.LaukaaSupabase
                .from('tags')
                .select('tag_id, name, category_id')
                .order('name');
            if (!error && data && data.length > 0) return data;
        } catch (e) {
            console.warn('Virhe haettaessa teemoja Supabasesta:', e);
        }
    }
    return [
        { tag_id: 'kirjastot', name: 'Kirjastot' },
        { tag_id: 'kulttuuri', name: 'Kulttuuri' },
        { tag_id: 'lukeminen', name: 'Lukeminen' },
        { tag_id: 'liikunta', name: 'Liikunta & Urheilu' },
        { tag_id: 'luonto', name: 'Luonto & Retkeily' },
        { tag_id: 'tapahtumat', name: 'Tapahtumat' },
        { tag_id: 'talkoot', name: 'Talkoot & Vapaaehtoistyö' },
        { tag_id: 'tilat', name: 'Tilat & Vuokraus' },
        { tag_id: 'it-tuki', name: 'IT-tuki & Digiapu' },
        { tag_id: 'siivous', name: 'Siivous & Kotiapu' },
        { tag_id: 'pihatyot', name: 'Pihatyöt & Puutarha' },
        { tag_id: 'musiikki', name: 'Musiikki & Esiintyjät' },
    ];
}

async function fetchThemePlacesMap() {
    if (window.LaukaaSupabase) {
        try {
            const { data, error } = await window.LaukaaSupabase
                .from('theme_places')
                .select('place_id, tag_id');
            if (!error && data) return data;
        } catch (e) {
            console.warn('Virhe haettaessa theme_places-taulua Supabasesta:', e);
        }
    }
    return [
        { place_id: 'p-kirjasto', tag_id: 'kirjastot' },
        { place_id: 'p-kirjasto', tag_id: 'kulttuuri' },
        { place_id: 'p-kirjasto', tag_id: 'lukeminen' },
        { place_id: 'p-peurunka', tag_id: 'liikunta' },
        { place_id: 'p-peurunka', tag_id: 'tapahtumat' },
        { place_id: 'p-satama', tag_id: 'tapahtumat' },
        { place_id: 'p-satama', tag_id: 'luonto' },
    ];
}

// ===================================================
// INIT
// ===================================================
document.addEventListener('DOMContentLoaded', () => {
    const grid = document.getElementById('km-grid');
    if (grid) {
        initKohtaamisetFeed();
    } else {
        const single = document.getElementById('ad-single-container');
        if (single) initIlmoituskortti();
    }
});

async function initKohtaamisetFeed() {
    // 1. Hae kaikki aineistot rinnakkain
    const [encounters, places, themes, themePlaces] = await Promise.all([
        fetchEncounters(),
        fetchPlacesList(),
        fetchThemesList(),
        fetchThemePlacesMap()
    ]);

    allEncounters  = encounters;
    placesList     = places;
    themesList     = themes;
    themePlacesMap = themePlaces;

    // 2. Alusta valikot
    renderPlaceSelectOptions();
    await updateThemeDropdown();

    // 3. Tapahtumakuuntelijat
    const searchInput = document.getElementById('km-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            searchQuery = searchInput.value.trim().toLowerCase();
            updateActiveFiltersBar();
            renderFeed();
        });
    }

    const placeSelect = document.getElementById('km-place-select');
    if (placeSelect) {
        placeSelect.addEventListener('change', async (e) => {
            activePlaceId = e.target.value;
            await updateThemeDropdown();
            updateActiveFiltersBar();
            renderFeed();
        });
    }

    const themeSelect = document.getElementById('km-theme-select');
    if (themeSelect) {
        themeSelect.addEventListener('change', (e) => {
            activeThemeId = e.target.value;
            updateActiveFiltersBar();
            renderFeed();
        });
    }

    const typeSelect = document.getElementById('km-type-select');
    if (typeSelect) {
        typeSelect.addEventListener('change', (e) => {
            setCategoryFilter(e.target.value);
        });
    }

    const sortSelect = document.getElementById('km-sort-select');
    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            sortOrder = e.target.value;
            renderFeed();
        });
    }

    // Pika-osastot (preset chips)
    const presetChips = document.getElementById('km-preset-chips');
    if (presetChips) {
        presetChips.querySelectorAll('.km-chip').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const cat = e.target.dataset.cat;
                setCategoryFilter(cat);
            });
        });
    }

    renderSidebar();
    renderMobileCats();
    updateActiveFiltersBar();
    initOrgSessionUI();
    renderFeed();

    // Piilota spinner
    const loading = document.getElementById('km-loading');
    if (loading) loading.style.display = 'none';

    // URL ?id= pop-up modal check
    const urlParams = new URLSearchParams(window.location.search);
    const targetId = urlParams.get('id');
    if (targetId && window.LkiModal) {
        const found = allEncounters.find(a => a.id === targetId || a.id?.toString() === targetId);
        if (found) {
            setTimeout(() => LkiModal.open(found), 100);
        }
    }
}

// ===================================================
// ORGANISAATION ISTUNTO & JULKAISUKOODI UI
// ===================================================

function initOrgSessionUI() {
    renderOrgSessionBar();

    // Kuunnellaan istunnon tilaa globaalisti
    window.addEventListener('laukaa:org_session_changed', () => {
        renderOrgSessionBar();
        renderFeed();
    });

    const keyInput = document.getElementById('km-org-code-input');
    if (keyInput) {
        keyInput.addEventListener('input', () => formatOrgKeyInput(keyInput));
    }
}

function renderOrgSessionBar() {
    const bar = document.getElementById('km-org-session-bar');
    if (!bar) return;

    const session = window.LaukaaOrgSession ? window.LaukaaOrgSession.getSession() : null;

    if (session) {
        let expiryStr = '';
        if (session.expires_at) {
            const expD = new Date(session.expires_at);
            expiryStr = ` (Voimassa klo ${expD.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' })} asti)`;
        }

        bar.innerHTML = `
            <div class="km-org-bar-active">
                <div class="km-org-bar-left">
                    <span class="km-org-badge-icon">🏢</span>
                    <div>
                        <strong class="km-org-name">${escapeHtml(session.org_name)}</strong>
                        <span class="km-org-status">Aktiivinen organisaatioistunto${expiryStr}</span>
                    </div>
                </div>
                <div class="km-org-bar-actions">
                    <a href="julkaise.html" class="km-org-action-link" title="Siirry Seinä-julkaisupisteeseen">
                        <span class="iconify" data-icon="lucide:layout-grid"></span> Seinä-näkymä
                    </a>
                    <button type="button" class="km-org-logout-btn" onclick="handleOrgLogout()">
                        Kirjaudu ulos ✕
                    </button>
                </div>
            </div>
        `;
        bar.style.display = 'block';
    } else {
        bar.innerHTML = `
            <div class="km-org-bar-idle">
                <div class="km-org-idle-text">
                    <span class="iconify" data-icon="lucide:building-2"></span>
                    <span>Julkaisetko organisaation, yrityksen tai yhdistyksen puolesta?</span>
                </div>
                <button type="button" class="km-org-login-trigger-btn" onclick="openOrgLoginModal()">
                    🔑 Kirjaudu organisaatiokoodilla
                </button>
            </div>
        `;
        bar.style.display = 'block';
    }
}

function openOrgLoginModal() {
    const modal = document.getElementById('km-org-login-modal');
    if (!modal) return;
    const input = document.getElementById('km-org-code-input');
    const errBox = document.getElementById('km-org-login-error');
    if (input) input.value = '';
    if (errBox) {
        errBox.innerText = '';
        errBox.style.display = 'none';
    }
    modal.classList.add('active');
    setTimeout(() => { if (input) input.focus(); }, 120);
}

function closeOrgLoginModal() {
    const modal = document.getElementById('km-org-login-modal');
    if (modal) modal.classList.remove('active');
}

function formatOrgKeyInput(input) {
    if (!input) return;
    let val = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (val.length > 4) {
        val = val.substring(0, 4) + '-' + val.substring(4, 8);
    }
    input.value = val;
}

async function handleOrgLoginSubmit(event) {
    if (event) event.preventDefault();

    const input = document.getElementById('km-org-code-input');
    const errBox = document.getElementById('km-org-login-error');
    const btn = document.getElementById('km-org-login-submit-btn');

    if (!input) return;
    const rawKey = input.value.trim().toUpperCase();

    if (errBox) {
        errBox.innerText = '';
        errBox.style.display = 'none';
    }

    if (!rawKey || rawKey.replace('-', '').length < 6) {
        if (errBox) {
            errBox.innerText = 'Syötä organisaation 8-merkkinen julkaisukoodi (esim. ABCD-1234)';
            errBox.style.display = 'block';
        }
        return;
    }

    if (btn) {
        btn.disabled = true;
        btn.innerText = 'Tarkistetaan koodia...';
    }

    try {
        if (!window.LaukaaOrgSession) {
            throw new Error('Istuntohallinta ei ole käytettävissä');
        }

        const session = await window.LaukaaOrgSession.beginSession(null, rawKey);
        closeOrgLoginModal();
        renderOrgSessionBar();
        renderFeed();
        
        alert(`✅ Kirjauduttu organisaationa: ${session.org_name || session.org_id}!\nIstunto on voimassa tässä selaimessa 8 tuntia.`);
    } catch (err) {
        console.error('Org login error:', err);
        if (errBox) {
            errBox.innerText = err.message || 'Virheellinen julkaisukoodi tai palvelinvirhe.';
            errBox.style.display = 'block';
        }
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerText = 'Kirjaudu sisään';
        }
    }
}

async function handleOrgLogout() {
    if (!confirm('Haluatko varmasti sulkea organisaation julkaisuistunnon?')) return;
    try {
        if (window.LaukaaOrgSession) {
            await window.LaukaaOrgSession.endSession();
        }
        renderOrgSessionBar();
        renderFeed();
    } catch (e) {
        console.warn('Logout error:', e);
    }
}

// Suora hallintamodaali organisaatiolle tai edit-tokenin haltijalle
async function openDirectManageModal(ad, mode = 'ORG') {
    const existing = document.getElementById('km-direct-manage-modal');
    if (existing) existing.remove();

    const isOrg = mode === 'ORG';
    const orgSession = window.LaukaaOrgSession ? window.LaukaaOrgSession.getSession() : null;
    const currentToken = window.LaukaaEditTokens ? window.LaukaaEditTokens.getToken(ad.id) : null;

    const modalHtml = `
        <div class="modal-overlay active" id="km-direct-manage-modal" style="display:flex;">
            <div class="modal-content" style="max-width:540px; background:#fff; border-radius:20px; padding:1.75rem; box-shadow:0 20px 40px rgba(0,0,0,0.2);">
                <button class="modal-close" onclick="document.getElementById('km-direct-manage-modal').remove()">&times;</button>
                <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.5rem;">
                    <span style="font-size:1.5rem;">${isOrg ? '🏢' : '🔑'}</span>
                    <h2 class="modal-title" style="margin:0; font-size:1.25rem;">${isOrg ? 'Organisaation ilmoituksen hallinta' : 'Ilmoituksen pika-hallinta'}</h2>
                </div>
                <p style="color:#64748b; font-size:0.85rem; margin-bottom:1.25rem;">
                    ${isOrg ? `Kirjautuneena organisaationa <strong>${escapeHtml(orgSession?.org_name)}</strong>.` : 'Hallinnoi aiemmin jättämääsi ilmoitusta suoraan selaimessasi.'}
                </p>

                <div id="km-manage-feedback" style="display:none; margin-bottom:1rem; padding:0.75rem; border-radius:8px; font-size:0.88rem;"></div>

                <form id="km-direct-manage-form" style="display:flex; flex-direction:column; gap:0.85rem;">
                    <div>
                        <label style="display:block; font-size:0.82rem; font-weight:700; color:#334155; margin-bottom:0.25rem;">Otsikko</label>
                        <input type="text" id="km-manage-title" value="${escapeHtml(ad.title)}" style="width:100%; padding:0.5rem 0.75rem; border:1px solid #cbd5e1; border-radius:8px; font-size:0.92rem;" required>
                    </div>

                    <div>
                        <label style="display:block; font-size:0.82rem; font-weight:700; color:#334155; margin-bottom:0.25rem;">Kuvaus</label>
                        <textarea id="km-manage-desc" rows="4" style="width:100%; padding:0.5rem 0.75rem; border:1px solid #cbd5e1; border-radius:8px; font-size:0.92rem; font-family:inherit;" required>${escapeHtml(ad.description)}</textarea>
                    </div>

                    <div>
                        <label style="display:block; font-size:0.82rem; font-weight:700; color:#334155; margin-bottom:0.25rem;">Hintatiedot / Korvaus</label>
                        <input type="text" id="km-manage-price" value="${escapeHtml(ad.price_info || '')}" style="width:100%; padding:0.5rem 0.75rem; border:1px solid #cbd5e1; border-radius:8px; font-size:0.92rem;">
                    </div>

                    <div>
                        <label style="display:block; font-size:0.82rem; font-weight:700; color:#334155; margin-bottom:0.25rem;">Tila</label>
                        <select id="km-manage-status" style="width:100%; padding:0.5rem 0.75rem; border:1px solid #cbd5e1; border-radius:8px; font-size:0.92rem; background:#fff;">
                            <option value="active" ${ad.status === 'active' ? 'selected' : ''}>🟢 Aktiivinen</option>
                            <option value="resolved" ${ad.status === 'resolved' ? 'selected' : ''}>⏳ Ratkaistu / Valmis</option>
                            <option value="closed" ${ad.status === 'closed' ? 'selected' : ''}>🔒 Suljettu (ei näy julkisesti)</option>
                        </select>
                    </div>

                    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:0.75rem; gap:0.5rem; flex-wrap:wrap;">
                        <button type="button" id="km-manage-delete-btn" style="background:#fee2e2; color:#b91c1c; border:1px solid #fca5a5; padding:0.55rem 1rem; border-radius:8px; font-weight:700; font-size:0.85rem; cursor:pointer;">
                            🗑️ Poista ilmoitus
                        </button>
                        <div style="display:flex; gap:0.5rem;">
                            <button type="button" onclick="document.getElementById('km-direct-manage-modal').remove()" style="background:#f1f5f9; color:#475569; border:none; padding:0.55rem 1rem; border-radius:8px; font-weight:700; font-size:0.85rem; cursor:pointer;">
                                Peruuta
                            </button>
                            <button type="submit" id="km-manage-save-btn" style="background:#0ea5e9; color:#fff; border:none; padding:0.55rem 1.25rem; border-radius:8px; font-weight:700; font-size:0.85rem; cursor:pointer;">
                                💾 Tallenna muutokset
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const form = document.getElementById('km-direct-manage-form');
    const deleteBtn = document.getElementById('km-manage-delete-btn');
    const fb = document.getElementById('km-manage-feedback');

    form.onsubmit = async (e) => {
        e.preventDefault();
        const saveBtn = document.getElementById('km-manage-save-btn');
        saveBtn.disabled = true;
        saveBtn.innerText = 'Tallennetaan...';

        const newTitle = document.getElementById('km-manage-title').value.trim();
        const newDesc = document.getElementById('km-manage-desc').value.trim();
        const newPrice = document.getElementById('km-manage-price').value.trim();
        const newStatus = document.getElementById('km-manage-status').value;

        try {
            await updateEncounterRpc(ad.id, currentToken, {
                title: newTitle,
                description: newDesc,
                price_info: newPrice,
                status: newStatus
            });

            fb.style.display = 'block';
            fb.style.background = '#dcfce7';
            fb.style.color = '#166534';
            fb.innerText = '✅ Ilmoitus päivitetty onnistuneesti!';

            // Päivitetään lokaali data
            ad.title = newTitle;
            ad.description = newDesc;
            ad.price_info = newPrice;
            ad.status = newStatus;

            setTimeout(() => {
                document.getElementById('km-direct-manage-modal')?.remove();
                if (typeof initKohtaamisetFeed === 'function') renderFeed();
                else window.location.reload();
            }, 1200);
        } catch (err) {
            console.error('Update error:', err);
            fb.style.display = 'block';
            fb.style.background = '#fee2e2';
            fb.style.color = '#991b1b';
            fb.innerText = '❌ Virhe tallennuksessa: ' + (err.message || 'Tarkista oikeudet');
            saveBtn.disabled = false;
            saveBtn.innerText = '💾 Tallenna muutokset';
        }
    };

    deleteBtn.onclick = async () => {
        if (!confirm('Haluatko varmasti poistaa tämän ilmoituksen pysyvästi?')) return;
        deleteBtn.disabled = true;
        deleteBtn.innerText = 'Poistetaan...';

        try {
            await deleteEncounterRpc(ad.id, currentToken);
            alert('✅ Ilmoitus poistettu onnistuneesti!');
            document.getElementById('km-direct-manage-modal')?.remove();
            if (typeof initKohtaamisetFeed === 'function') {
                allEncounters = allEncounters.filter(x => x.id !== ad.id);
                renderFeed();
            } else {
                window.location.href = 'kohtaamiset.html';
            }
        } catch (err) {
            console.error('Delete error:', err);
            fb.style.display = 'block';
            fb.style.background = '#fee2e2';
            fb.style.color = '#991b1b';
            fb.innerText = '❌ Poisto epäonnistui: ' + (err.message || 'Tarkista oikeudet');
            deleteBtn.disabled = false;
            deleteBtn.innerText = '🗑️ Poista ilmoitus';
        }
    };
}
// ===================================================
function renderPlaceSelectOptions() {
    const select = document.getElementById('km-place-select');
    if (!select) return;

    select.innerHTML = '<option value="all">📍 Kaikki paikat (Koko Laukaa)</option>';
    placesList.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.place_id || p.name;
        opt.textContent = `📍 ${p.name}`;
        select.appendChild(opt);
    });
}

async function updateThemeDropdown() {
    const themeSelect = document.getElementById('km-theme-select');
    if (!themeSelect) return;

    const currentTheme = activeThemeId;
    themeSelect.innerHTML = '<option value="all">🏷️ Kaikki teemat</option>';

    const contextBanner = document.getElementById('km-context-banner');
    const contextText   = document.getElementById('km-context-text');

    if (activePlaceId !== 'all') {
        const placeObj  = placesList.find(p => p.place_id === activePlaceId || p.name === activePlaceId);
        const placeUuid = placeObj ? placeObj.place_id : activePlaceId;
        const placeName = placeObj ? placeObj.name : activePlaceId;

        // Etsi theme_places kytkökset kyseiselle paikalle
        const placeThemeLinks = themePlacesMap.filter(tp => tp.place_id === placeUuid || tp.place_id === activePlaceId);
        const placeTagIds     = new Set(placeThemeLinks.map(tp => tp.tag_id));

        if (placeTagIds.size > 0) {
            if (contextBanner && contextText) {
                contextText.innerHTML = `📍 Valitulla paikalla (<strong>${escapeHtml(placeName)}</strong>) on ${placeTagIds.size} omaleimaista teemaa (theme_places), jotka on nostettu teemavalikon kärkeen.`;
                contextBanner.style.display = 'flex';
            }

            // Ryhmä 1: Paikan aidot teemat
            const groupPlace = document.createElement('optgroup');
            groupPlace.label = '📍 Paikkaan liittyvät teemat';

            const genuineThemes = themesList.filter(t => placeTagIds.has(t.tag_id || t.name));
            genuineThemes.forEach(t => {
                const opt = document.createElement('option');
                opt.value = t.tag_id || t.name;
                opt.textContent = `📍 ${t.name}`;
                groupPlace.appendChild(opt);
            });
            themeSelect.appendChild(groupPlace);

            // Ryhmä 2: Muut teemat
            const groupOther = document.createElement('optgroup');
            groupOther.label = '🌐 Muut teemat';
            const otherThemes = themesList.filter(t => !placeTagIds.has(t.tag_id || t.name));
            otherThemes.forEach(t => {
                const opt = document.createElement('option');
                opt.value = t.tag_id || t.name;
                opt.textContent = t.name;
                groupOther.appendChild(opt);
            });
            themeSelect.appendChild(groupOther);
        } else {
            if (contextBanner && contextText) {
                contextText.innerHTML = `📍 Kohteelle <strong>${escapeHtml(placeName)}</strong> ei ole asetettu omia teemoja. Näytetään kaikki yleiset teemat.`;
                contextBanner.style.display = 'flex';
            }

            themesList.forEach(t => {
                const opt = document.createElement('option');
                opt.value = t.tag_id || t.name;
                opt.textContent = t.name;
                themeSelect.appendChild(opt);
            });
        }
    } else {
        if (contextBanner) contextBanner.style.display = 'none';

        themesList.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.tag_id || t.name;
            opt.textContent = t.name;
            themeSelect.appendChild(opt);
        });
    }

    themeSelect.value = currentTheme;
}

// ===================================================
// SIVUPALKKI & MOBIILIVALIKKO
// ===================================================
function renderSidebar() {
    const list = document.getElementById('km-cat-list');
    if (!list) return;

    const counts = countByCategory(allEncounters);
    list.innerHTML = '';

    const allItem = makeSidebarItem('all', '📋', 'Kaikki ilmoitukset', '#64748b', counts.all);
    list.appendChild(allItem);

    Object.entries(ENCOUNTER_CATEGORIES).forEach(([key, cat]) => {
        const item = makeSidebarItem(key, cat.emoji, cat.title, cat.color, counts[key] || 0);
        list.appendChild(item);
    });
}

function makeSidebarItem(key, emoji, title, color, count) {
    const li = document.createElement('li');
    li.className = `km-cat-item ${activeFilter === key ? 'active' : ''}`;
    if (activeFilter === key) li.style.setProperty('--active-color', color);

    li.innerHTML = `
        <span class="km-cat-dot" style="background:${color};"></span>
        <span style="flex:1; min-width:0;">${title}</span>
        ${count > 0 ? `<span class="km-cat-count">${count}</span>` : ''}
    `;
    li.onclick = () => setCategoryFilter(key);
    return li;
}

function renderMobileCats() {
    const select = document.getElementById('km-mobile-cat-select');
    if (!select) return;

    const counts = countByCategory(allEncounters);
    select.innerHTML = '';

    const allOpt = document.createElement('option');
    allOpt.value = 'all';
    allOpt.textContent = `Kaikki kategoriat (${counts.all})`;
    select.appendChild(allOpt);

    Object.entries(ENCOUNTER_CATEGORIES).forEach(([key, cat]) => {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = `${cat.emoji} ${cat.title} (${counts[key] || 0})`;
        select.appendChild(opt);
    });

    select.value = activeFilter;
    select.onchange = (e) => setCategoryFilter(e.target.value);
}

// ===================================================
// FILTTERÖINTI APUFUNKTIOT
// ===================================================
function setCategoryFilter(key) {
    activeFilter = key;
    const typeSelect = document.getElementById('km-type-select');
    if (typeSelect) typeSelect.value = key;
    renderSidebar();
    renderMobileCats();
    updateActiveFiltersBar();
    renderFeed();
}

function setPlaceFilter(placeId) {
    activePlaceId = placeId;
    const placeSelect = document.getElementById('km-place-select');
    if (placeSelect) placeSelect.value = placeId;
    updateThemeDropdown();
    updateActiveFiltersBar();
    renderFeed();
}

function setThemeFilter(themeId) {
    activeThemeId = themeId;
    const themeSelect = document.getElementById('km-theme-select');
    if (themeSelect) themeSelect.value = themeId;
    updateActiveFiltersBar();
    renderFeed();
}

function setTagFilter(tag) {
    activeTag = tag;
    updateActiveFiltersBar();
    renderFeed();
}

function clearTagFilter() {
    activeTag = null;
    updateActiveFiltersBar();
    renderFeed();
}

function clearSearchQuery() {
    searchQuery = '';
    const input = document.getElementById('km-search-input');
    if (input) input.value = '';
    updateActiveFiltersBar();
    renderFeed();
}

function clearAllFilters() {
    activeFilter  = 'all';
    activePlaceId = 'all';
    activeThemeId = 'all';
    activeTag     = null;
    searchQuery   = '';

    const searchInput = document.getElementById('km-search-input');
    if (searchInput) searchInput.value = '';

    const placeSelect = document.getElementById('km-place-select');
    if (placeSelect) placeSelect.value = 'all';

    const themeSelect = document.getElementById('km-theme-select');
    if (themeSelect) themeSelect.value = 'all';

    const typeSelect = document.getElementById('km-type-select');
    if (typeSelect) typeSelect.value = 'all';

    renderSidebar();
    renderMobileCats();
    updateThemeDropdown();
    updateActiveFiltersBar();
    renderFeed();
}

function updateActiveFiltersBar() {
    const bar = document.getElementById('km-active-filters-bar');
    const container = document.getElementById('km-active-chips-container');
    if (!bar || !container) return;

    container.innerHTML = '';
    let hasFilters = false;

    if (searchQuery) {
        hasFilters = true;
        container.innerHTML += `<span class="km-active-chip">🔍 "${escapeHtml(searchQuery)}" <button class="km-active-chip-remove" onclick="clearSearchQuery()">✕</button></span>`;
    }

    if (activePlaceId !== 'all') {
        hasFilters = true;
        const placeObj = placesList.find(p => p.place_id === activePlaceId || p.name === activePlaceId);
        const placeName = placeObj ? placeObj.name : activePlaceId;
        container.innerHTML += `<span class="km-active-chip">📍 ${escapeHtml(placeName)} <button class="km-active-chip-remove" onclick="setPlaceFilter('all')">✕</button></span>`;
    }

    if (activeThemeId !== 'all') {
        hasFilters = true;
        const themeObj = themesList.find(t => t.tag_id === activeThemeId || t.name === activeThemeId);
        const themeName = themeObj ? themeObj.name : activeThemeId;
        container.innerHTML += `<span class="km-active-chip">🏷️ ${escapeHtml(themeName)} <button class="km-active-chip-remove" onclick="setThemeFilter('all')">✕</button></span>`;
    }

    if (activeFilter !== 'all') {
        hasFilters = true;
        const catObj = ENCOUNTER_CATEGORIES[activeFilter];
        const catTitle = catObj ? `${catObj.emoji} ${catObj.title}` : activeFilter;
        container.innerHTML += `<span class="km-active-chip">${catTitle} <button class="km-active-chip-remove" onclick="setCategoryFilter('all')">✕</button></span>`;
    }

    if (activeTag) {
        hasFilters = true;
        container.innerHTML += `<span class="km-active-chip">🏷️ #${escapeHtml(activeTag)} <button class="km-active-chip-remove" onclick="clearTagFilter()">✕</button></span>`;
    }

    bar.style.display = hasFilters ? 'flex' : 'none';
}

function countByCategory(encounters) {
    const counts = { all: encounters.length };
    Object.keys(ENCOUNTER_CATEGORIES).forEach(k => { counts[k] = 0; });
    encounters.forEach(e => {
        const resolved = resolveCategory(e.type, e.sub_category);
        const key = Object.keys(ENCOUNTER_CATEGORIES).find(k => ENCOUNTER_CATEGORIES[k].title === resolved.title && ENCOUNTER_CATEGORIES[k].emoji === resolved.emoji);
        if (key) counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
}

// ===================================================
// FEED-RENDERÖINTI (MISSÄ + MISTÄ + MITÄ)
// ===================================================
function renderFeed() {
    const grid = document.getElementById('km-grid');
    if (!grid) return;

    let filtered = [...allEncounters];

    // 1. Kategoria / Tyyppi
    if (activeFilter !== 'all') {
        if (activeFilter === 'space') {
            filtered = filtered.filter(ad => ad.type === 'space_rental' || ad.sub_category === 'space' || (ad.tags || []).includes('tila'));
        } else if (activeFilter === 'talkoot') {
            filtered = filtered.filter(ad => (ad.tags || []).includes('talkoot') || ad.type === 'community');
        } else if (activeFilter === 'event') {
            filtered = filtered.filter(ad => ad.type === 'event_staff' || (ad.tags || []).includes('tapahtumat'));
        } else {
            const target = ENCOUNTER_CATEGORIES[activeFilter];
            filtered = filtered.filter(ad => {
                const resolved = resolveCategory(ad.type, ad.sub_category);
                return target && resolved.title === target.title && resolved.emoji === target.emoji;
            });
        }
    }

    // 2. Paikka suodatus (Place)
    if (activePlaceId !== 'all') {
        const placeObj  = placesList.find(p => p.place_id === activePlaceId || p.name === activePlaceId);
        const placeName = (placeObj ? placeObj.name : activePlaceId).toLowerCase();
        const placeUuid = placeObj ? placeObj.place_id : activePlaceId;

        filtered = filtered.filter(ad => {
            if (ad.place_id && ad.place_id === placeUuid) return true;
            if (ad.location && ad.location.toLowerCase().includes(placeName)) return true;
            return false;
        });
    }

    // 3. Teema suodatus (Theme)
    if (activeThemeId !== 'all') {
        const themeObj  = themesList.find(t => t.tag_id === activeThemeId || t.name === activeThemeId);
        const themeName = (themeObj ? themeObj.name : activeThemeId).toLowerCase();
        const themeId   = themeObj ? themeObj.tag_id : activeThemeId;

        filtered = filtered.filter(ad => {
            const tags = (ad.tags || []).map(t => t.toLowerCase());
            if (tags.includes(themeName) || tags.includes(themeId.toLowerCase())) return true;
            if (ad.theme_tag_id && ad.theme_tag_id === themeId) return true;
            return false;
        });
    }

    // 4. Tekstihaku
    if (searchQuery) {
        filtered = filtered.filter(ad => {
            const tags = (ad.tags || []).join(' ').toLowerCase();
            return (
                (ad.title || '').toLowerCase().includes(searchQuery) ||
                (ad.description || '').toLowerCase().includes(searchQuery) ||
                (ad.location || '').toLowerCase().includes(searchQuery) ||
                tags.includes(searchQuery)
            );
        });
    }

    // 5. Klikattu Tag-suodatin
    if (activeTag) {
        filtered = filtered.filter(ad =>
            Array.isArray(ad.tags) && ad.tags.map(t => t.toLowerCase()).includes(activeTag.toLowerCase())
        );
    }

    // Lajittelu
    filtered.sort((a, b) => {
        const da = new Date(a.created_at), db = new Date(b.created_at);
        return sortOrder === 'newest' ? db - da : da - db;
    });

    // Päivitä preset chips -aktiivisuudet
    const presetContainer = document.getElementById('km-preset-chips');
    if (presetContainer) {
        presetContainer.querySelectorAll('.km-chip').forEach(chip => {
            if (chip.dataset.cat === activeFilter) {
                chip.classList.add('active');
            } else {
                chip.classList.remove('active');
            }
        });
    }

    // Tulosten määrä
    const countEl = document.getElementById('km-result-count');
    if (countEl) {
        countEl.textContent = filtered.length === 0
            ? 'Ei tuloksia valitulla haulla'
            : `${filtered.length} kohtaamis${filtered.length === 1 ? 'i' : 'ta'}`;
    }

    grid.innerHTML = '';

    if (filtered.length === 0) {
        grid.innerHTML = `
            <div class="km-empty">
                <div class="km-empty-icon">🔍</div>
                <h3>Ei ilmoituksia valituilla hakuehdoilla</h3>
                <p>Kokeile vaihtaa paikkaa, teemaa tai tyhjennä hakusuodattimet.</p>
                <button onclick="clearAllFilters()" class="km-btn-primary" style="display:inline-flex; margin-top:1rem; gap:0.5rem; border:none; cursor:pointer;">
                    🔄 Tyhjennä kaikki suodattimet
                </button>
            </div>`;
        return;
    }

    filtered.forEach(ad => {
        const cat = resolveCategory(ad.type, ad.sub_category);
        const dateStr = new Date(ad.created_at).toLocaleDateString('fi-FI');
        const tags = Array.isArray(ad.tags) ? ad.tags : [];

        const isResolved = tags.includes('resolved');
        const displayTags = tags.filter(t => t !== 'resolved');

        const tagsHtml = displayTags.length
            ? `<div class="km-card-tags">${displayTags.map(t =>
                `<button class="km-tag${activeTag === t ? ' active' : ''}"
                    onclick="event.preventDefault(); setTagFilter('${escapeHtml(t)}')"
                    title="Suodata teemalla: ${escapeHtml(t)}">🏷️ ${escapeHtml(t)}</button>`
              ).join('')}</div>`
            : '';

        const resolvedBadge = isResolved
            ? `<div style="background:#fefce8; color:#a16207; padding:4px 8px; border-radius:6px; font-size:0.75rem; font-weight:700; display:inline-block; margin-bottom:0.5rem; border:1px solid #fef08a;">⏳ Ratkaistu</div>`
            : '';

        const subBadge = cat.subLabel
            ? `<span style="display:inline-block; margin-left:6px; padding:1px 7px; background:${cat.color}20; color:${cat.color}; border-radius:50px; font-size:0.78rem; font-weight:600;">${escapeHtml(cat.subLabel)}</span>`
            : '';

        const card = document.createElement('a');
        card.href = `ilmoituskortti.html?id=${ad.id}&slug=${generateSlug(ad.title)}`;
        card.className = 'km-card';
        card.style.borderTopColor = cat.color;
        if (isResolved) card.style.opacity = '0.85';

        const publisherBadge = renderPublisherBadge(ad);
        const orgSession = window.LaukaaOrgSession ? window.LaukaaOrgSession.getSession() : null;
        const isOrgMine = orgSession && (ad.organization_id === orgSession.org_id || (ad.publisher_name && ad.publisher_name.toLowerCase() === orgSession.org_name.toLowerCase()));
        const hasEditToken = window.LaukaaEditTokens && window.LaukaaEditTokens.getToken(ad.id);

        let manageBadgeHtml = '';
        if (isOrgMine) {
            manageBadgeHtml = `<span style="background:#e0e7ff; color:#3730a3; padding:2px 7px; border-radius:6px; font-size:0.73rem; font-weight:700; display:inline-block; margin-bottom:0.4rem; border:1px solid #c7d2fe;">🏢 Organisaatiosi ilmoitus</span>`;
        }

        const manageBtnHtml = (isOrgMine || hasEditToken)
            ? `<button type="button" class="km-card-manage-btn" onclick="event.preventDefault(); event.stopPropagation(); openDirectManageModal(allEncounters.find(x => x.id === '${ad.id}'), '${isOrgMine ? 'ORG' : 'TOKEN'}')" style="background:#f0fdf4; color:#15803d; border:1px solid #bbf7d0; font-size:0.75rem; font-weight:700; border-radius:6px; padding:3px 8px; cursor:pointer; display:inline-flex; align-items:center; gap:4px;">✏️ Hallinnoi</button>`
            : '';

        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:0.5rem;">
                <span class="km-card-badge" style="color:${cat.color};">${cat.emoji} ${cat.title}${subBadge}</span>
                ${manageBtnHtml}
            </div>
            ${manageBadgeHtml}
            ${publisherBadge ? `<div style="margin-bottom:4px;">${publisherBadge}</div>` : ''}
            ${resolvedBadge}
            <h3 class="km-card-title">${escapeHtml(ad.title)}</h3>
            <p class="km-card-desc">${escapeHtml(ad.description).substring(0, 110)}${ad.description.length > 110 ? '…' : ''}</p>
            ${tagsHtml}
            <div class="km-card-footer">
                <span class="km-card-location"
                    onclick="event.preventDefault(); event.stopPropagation(); setPlaceFilter('${escapeHtml(ad.place_id || ad.location)}')"
                    title="Suodata paikalla: ${escapeHtml(ad.location || '—')}"
                    style="cursor:pointer;">
                    <span class="iconify" data-icon="lucide:map-pin" style="font-size:0.85rem; color:#0ea5e9;"></span>
                    <strong style="color:#334155;">📍 ${escapeHtml(ad.location || 'Koko Laukaa')}</strong>
                </span>
                <span class="km-card-price">${escapeHtml(ad.price_info || '')}</span>
            </div>
            <div style="font-size:0.72rem; color:#94a3b8; text-align:right; margin-top:2px;">
                ${dateStr}
            </div>
        `;

        grid.appendChild(card);
    });
}

// ===================================================
// ILMOITUSKORTTI-SIVU (ilmoituskortti.html)
// ===================================================
async function initIlmoituskortti() {
    const params  = new URLSearchParams(window.location.search);
    const id      = params.get('id');
    const spinner = document.getElementById('loading-spinner');
    const container = document.getElementById('ad-single-container');

    if (!id) {
        if (spinner) spinner.innerHTML = 'Ilmoitusta ei löytynyt.';
        return;
    }

    allEncounters = await fetchEncounters();
    const ad = allEncounters.find(a => a.id === id || a.id?.toString() === id);

    if (!ad) {
        if (spinner) spinner.innerHTML = 'Ilmoitusta ei löytynyt tai se on vanhentunut.';
        return;
    }

    if (spinner) spinner.style.display = 'none';
    container.style.display = 'block';

    if (window.LaukaaSupabase && !sessionStorage.getItem('km_viewed_' + ad.id)) {
        sessionStorage.setItem('km_viewed_' + ad.id, '1');
        (async () => { try { await window.LaukaaSupabase.rpc('increment_stat', { p_encounter_id: ad.id, p_stat_type: 'view' }); } catch(e) {} })();
    }

    const cat = resolveCategory(ad.type, ad.sub_category);
    const header = document.getElementById('ad-header');
    if (header) header.style.backgroundColor = cat.color;

    const subBadgeDetail = cat.subLabel
        ? ` <span style="font-size:0.85em; opacity:0.9; font-weight:500; margin-left:6px; padding:2px 8px; background:rgba(255,255,255,0.25); border-radius:50px;">· ${escapeHtml(cat.subLabel)}</span>`
        : '';
    document.getElementById('ad-badge').innerHTML = `${cat.emoji} ${cat.title}${subBadgeDetail}`;

    // Julkaisijabadge yksittäispää varten
    const publisherBadge = renderPublisherBadge(ad);
    if (publisherBadge) {
        const badgeEl = document.getElementById('ad-publisher-badge');
        if (badgeEl) {
            badgeEl.innerHTML = publisherBadge;
            badgeEl.style.display = 'block';
        } else {
            // Fallback: lisätään badge-elementin jälkeen otsikkoa
            const titleEl = document.getElementById('ad-title');
            if (titleEl) {
                const div = document.createElement('div');
                div.style.cssText = 'margin-bottom: 0.75rem;';
                div.innerHTML = publisherBadge;
                titleEl.parentNode.insertBefore(div, titleEl);
            }
        }
    }
        
    document.getElementById('ad-title').innerText = ad.title;
    document.getElementById('ad-desc').innerText = ad.description;
    
    // Kuva jos saatavilla
    const imgUrl = ad.image_url || ad.photo_url;
    if (imgUrl) {
        const existingImg = document.getElementById('ad-single-image-wrap');
        if (!existingImg) {
            const imgDiv = document.createElement('div');
            imgDiv.id = 'ad-single-image-wrap';
            imgDiv.style.cssText = 'margin-bottom: 1.5rem; text-align: center; border-radius: 12px; overflow: hidden;';
            imgDiv.innerHTML = `<img id="ad-single-image" src="${escapeHtml(imgUrl)}" alt="${escapeHtml(ad.title)}" style="max-width:100%; max-height:450px; object-fit:cover; border-radius:12px;" />`;
            const descEl = document.getElementById('ad-desc');
            if (descEl && descEl.parentNode) {
                descEl.parentNode.insertBefore(imgDiv, descEl);
            }
        }
    }
    
    // SEO & Meta päivitykset (Googlea ja tekoälybotteja varten)
    document.title = `${ad.title} – LaukaaInfo Kohtaamiset`;
    
    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
        metaDesc = document.createElement('meta');
        metaDesc.name = 'description';
        document.head.appendChild(metaDesc);
    }
    const plainDesc = (ad.description || '').replace(/\n/g, ' ').trim();
    metaDesc.content = plainDesc.substring(0, 155) + (plainDesc.length > 155 ? '...' : '');

    document.getElementById('ad-price').innerText = ad.price_info;
    document.getElementById('ad-location').innerText = ad.location;

    // Rakenteelliset linkit
    const links = ad.structured_links || {};
    let linksHtml = '';
    
    if (links.website) {
        linksHtml += `<a href="${escapeHtml(links.website)}" onclick="if(window.LaukaaSupabase)(async()=>{try{await window.LaukaaSupabase.rpc('increment_stat',{p_encounter_id:'${ad.id}',p_stat_type:'click'})}catch(e){}})()" target="_blank" style="background:#0ea5e9; color:white; padding:10px 15px; border-radius:8px; text-decoration:none; display:inline-flex; align-items:center; gap:6px; font-weight:600; font-size:0.95rem;">
            <span class="iconify" data-icon="lucide:globe"></span> Verkkosivu
        </a>`;
    }
    if (links.phone) {
        linksHtml += `<a href="tel:${escapeHtml(links.phone)}" style="background:#10b981; color:white; padding:10px 15px; border-radius:8px; text-decoration:none; display:inline-flex; align-items:center; gap:6px; font-weight:600; font-size:0.95rem;">
            <span class="iconify" data-icon="lucide:phone"></span> Soita
        </a>`;
    }
    if (links.whatsapp) {
        const waNum = links.whatsapp.replace(/[^0-9]/g, '');
        linksHtml += `<a href="https://wa.me/${waNum}" target="_blank" style="background:#25D366; color:white; padding:10px 15px; border-radius:8px; text-decoration:none; display:inline-flex; align-items:center; gap:6px; font-weight:600; font-size:0.95rem;">
            <span class="iconify" data-icon="mdi:whatsapp"></span> WhatsApp
        </a>`;
    }
    if (links.facebook) {
        linksHtml += `<a href="${escapeHtml(links.facebook)}" target="_blank" style="background:#1877F2; color:white; padding:10px 15px; border-radius:8px; text-decoration:none; display:inline-flex; align-items:center; gap:6px; font-weight:600; font-size:0.95rem;">
            <span class="iconify" data-icon="mdi:facebook"></span> Facebook
        </a>`;
    }
    if (links.instagram) {
        linksHtml += `<a href="${escapeHtml(links.instagram)}" target="_blank" style="background:#E1306C; color:white; padding:10px 15px; border-radius:8px; text-decoration:none; display:inline-flex; align-items:center; gap:6px; font-weight:600; font-size:0.95rem;">
            <span class="iconify" data-icon="mdi:instagram"></span> Instagram
        </a>`;
    }
    if (links.linkedin) {
        linksHtml += `<a href="${escapeHtml(links.linkedin)}" target="_blank" style="background:#0077b5; color:white; padding:10px 15px; border-radius:8px; text-decoration:none; display:inline-flex; align-items:center; gap:6px; font-weight:600; font-size:0.95rem;">
            <span class="iconify" data-icon="mdi:linkedin"></span> LinkedIn
        </a>`;
    }
    if (links.tiktok) {
        linksHtml += `<a href="${escapeHtml(links.tiktok)}" target="_blank" style="background:#000000; color:white; padding:10px 15px; border-radius:8px; text-decoration:none; display:inline-flex; align-items:center; gap:6px; font-weight:600; font-size:0.95rem;">
            <span class="iconify" data-icon="ic:baseline-tiktok"></span> TikTok
        </a>`;
    }
    if (links.youtube) {
        linksHtml += `<a href="${escapeHtml(links.youtube)}" target="_blank" style="background:#FF0000; color:white; padding:10px 15px; border-radius:8px; text-decoration:none; display:inline-flex; align-items:center; gap:6px; font-weight:600; font-size:0.95rem;">
            <span class="iconify" data-icon="mdi:youtube"></span> YouTube
        </a>`;
    }
    if (links.pdf) {
        linksHtml += `<a href="${escapeHtml(links.pdf)}" target="_blank" style="background:#ef4444; color:white; padding:10px 15px; border-radius:8px; text-decoration:none; display:inline-flex; align-items:center; gap:6px; font-weight:600; font-size:0.95rem;">
            <span class="iconify" data-icon="mdi:file-pdf-box"></span> PDF-esite
        </a>`;
    }
    if (links.maps) {
        linksHtml += `<a href="${escapeHtml(links.maps)}" target="_blank" style="background:#34d399; color:white; padding:10px 15px; border-radius:8px; text-decoration:none; display:inline-flex; align-items:center; gap:6px; font-weight:600; font-size:0.95rem;">
            <span class="iconify" data-icon="mdi:map-marker"></span> Kartta
        </a>`;
    }
    if (links.booking) {
        linksHtml += `<a href="${escapeHtml(links.booking)}" onclick="if(window.LaukaaSupabase)(async()=>{try{await window.LaukaaSupabase.rpc('increment_stat',{p_encounter_id:'${ad.id}',p_stat_type:'click'})}catch(e){}})()" target="_blank" style="background:#8b5cf6; color:white; padding:10px 15px; border-radius:8px; text-decoration:none; display:inline-flex; align-items:center; gap:6px; font-weight:600; font-size:0.95rem;">
            <span class="iconify" data-icon="mdi:calendar-check"></span> Ajanvaraus
        </a>`;
    }
    if (links.rss) {
        linksHtml += `<a href="${escapeHtml(links.rss)}" target="_blank" style="background:#f97316; color:white; padding:10px 15px; border-radius:8px; text-decoration:none; display:inline-flex; align-items:center; gap:6px; font-weight:600; font-size:0.95rem;">
            <span class="iconify" data-icon="mdi:rss"></span> RSS
        </a>`;
    }

    if (linksHtml) {
        const linksContainer = document.createElement('div');
        linksContainer.id = 'ad-structured-links';
        linksContainer.style.cssText = 'display:flex; gap:10px; flex-wrap:wrap; margin-bottom:1.5rem; justify-content:center;';
        linksContainer.innerHTML = linksHtml;
        
        // Etsi hinta-container ja lisää linkit sen perään
        const priceContainer = document.querySelector('.ad-single-price');
        if (priceContainer && priceContainer.parentNode && !document.getElementById('ad-structured-links')) {
            priceContainer.parentNode.insertBefore(linksContainer, priceContainer.nextSibling);
        }
    }

    // Tagit
    const tagsContainer = document.getElementById('ad-tags');
    const isResolved = Array.isArray(ad.tags) && ad.tags.includes('resolved');
    const displayTags = Array.isArray(ad.tags) ? ad.tags.filter(t => t !== 'resolved') : [];

    if (tagsContainer && displayTags.length > 0) {
        tagsContainer.innerHTML = displayTags.map(t =>
            `<a href="kohtaamiset.html" class="km-tag" onclick="sessionStorage.setItem('km_tag','${escapeHtml(t)}')">${escapeHtml(t)}</a>`
        ).join('');
    }

    const d = new Date(ad.created_at);
    const dateEl = document.getElementById('ad-date');
    if (dateEl) dateEl.innerText = d.toLocaleDateString('fi-FI');

    // Yhteydenottonappi
    const btn = document.getElementById('ad-contact-btn');
    if (btn) {
        if (isResolved) {
            btn.style.display = 'none';
            // Lisää ratkaistu-banneri kuvauksen alkuun
            const descEl = document.getElementById('ad-desc');
            const resolvedBanner = document.createElement('div');
            resolvedBanner.style.cssText = 'background:#fefce8; color:#a16207; padding:12px; border-radius:8px; font-weight:600; margin-bottom:1.5rem; border:1px solid #fef08a; display:flex; gap:8px; align-items:center;';
            resolvedBanner.innerHTML = '<span class="iconify" data-icon="lucide:check-circle" style="font-size:1.2rem;"></span> Ilmoittaja on merkinnyt asian valmiiksi. Uusia yhteydenottoja ei voi enää lähettää, ja ilmoitus poistuu pian järjestelmästä.';
            if (descEl && descEl.parentNode) {
                descEl.parentNode.insertBefore(resolvedBanner, descEl);
            }
        } else if (ad.allow_messages !== false) {
            btn.href = '#';
            btn.innerText = 'Ota yhteyttä ilmoittajaan';
            btn.onclick = (e) => {
                e.preventDefault();
                openContactModal(ad.id, ad.allow_messages !== false);
            };
        } else {
            btn.href = '#';
            btn.innerText = 'Ei viestintää saatavilla';
            btn.style.opacity = '0.5';
            btn.style.cursor = 'not-allowed';
            btn.onclick = (e) => e.preventDefault();
        }
    }

    // Auth-, Organisaatio- ja Edit-token-tarkistus hallintanapille
    let canManage = false;
    let manageMode = 'USER';

    if (window.LaukaaAuth) {
        const user = await window.LaukaaAuth.getUser();
        if (user) {
            const isOwner = ad.user_id === user.id;
            const isMod = await window.LaukaaAuth.isModerator();
            if (isOwner || isMod) {
                canManage = true;
                manageMode = 'AUTH';
            }
        }
    }

    const orgSession = window.LaukaaOrgSession ? window.LaukaaOrgSession.getSession() : null;
    const isOrgOwner = orgSession && (ad.organization_id === orgSession.org_id || (ad.publisher_name && ad.publisher_name.toLowerCase() === orgSession.org_name.toLowerCase()));
    const hasEditToken = window.LaukaaEditTokens && window.LaukaaEditTokens.getToken(ad.id);

    if (isOrgOwner) {
        canManage = true;
        manageMode = 'ORG';
    } else if (hasEditToken) {
        canManage = true;
        manageMode = 'TOKEN';
    }

    if (canManage) {
        const manageBtn = document.querySelector('.manage-btn');
        if (manageBtn) {
            const label = manageMode === 'ORG'
                ? '🏢 Muokkaa organisaation ilmoitusta'
                : (manageMode === 'TOKEN' ? '🔑 Muokkaa ilmoitustasi' : '✏️ Muokkaa ilmoitusta');
            manageBtn.innerHTML = `<span class="iconify" data-icon="lucide:settings-2"></span> ${label}`;
            manageBtn.style.color = '#10b981';
            manageBtn.style.fontWeight = '700';
            manageBtn.onclick = (e) => {
                e.preventDefault();
                openDirectManageModal(ad, manageMode === 'ORG' ? 'ORG' : 'TOKEN');
            };
        }
    }
}

// ===================================================
// APUFUNKTIOT
// ===================================================
function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ===================================================
// JULKAISIJABADGE
// ===================================================
function renderPublisherBadge(ad) {
    const type = ad.publisher_type || 'personal';
    const name = ad.publisher_name ? escapeHtml(ad.publisher_name) : null;

    if (type === 'company' && name) {
        return `<span class="km-publisher-badge km-publisher-company">🏢 ${name}</span>`;
    }
    if (type === 'association' && name) {
        return `<span class="km-publisher-badge km-publisher-association">🏛️ ${name}</span>`;
    }
    if (type === 'location' && name) {
        return `<span class="km-publisher-badge km-publisher-location">📍 ${name}</span>`;
    }
    if (type === 'event' && name) {
        return `<span class="km-publisher-badge km-publisher-event">🎉 ${name}</span>`;
    }
    if (type === 'network' && name) {
        return `<span class="km-publisher-badge km-publisher-network">🤝 ${name}</span>`;
    }
    if (type === 'service' && name) {
        return `<span class="km-publisher-badge km-publisher-service">🛍️ ${name}</span>`;
    }
    // personal tai tuntematon – ei badgea
    return '';
}

function generateSlug(text) {
    if (!text) return '';
    return text.toString().toLowerCase()
        .replace(/ä/g, 'a')
        .replace(/ö/g, 'o')
        .replace(/å/g, 'a')
        .replace(/\s+/g, '-')           // välilyönnit viivoiksi
        .replace(/[^\w\-]+/g, '')       // poista erikoismerkit
        .replace(/\-\-+/g, '-')         // yhdistä peräkkäiset viivat
        .replace(/^-+/, '')             // poista viivat alusta
        .replace(/-+$/, '');            // poista viivat lopusta
}

// ===================================================
// YHTEYDENOTTOMODAALI – Anonyymi viestijärjestelmä
// ===================================================
const KM_API = 'https://mediazoo.fi/laukaainfo-web/kohtaamiset_api.php';

function openContactModal(adId, allowMessages = true) {
    const modal = document.getElementById('contact-modal');
    if (!modal) return;

    // Tallenna ilmoituksen id modaaliin
    const idField = document.getElementById('contact-ad-id');
    if (idField) idField.value = adId;

    // Nollaa lomake ja palaute
    const form = document.getElementById('contact-form');
    if (form) form.reset();
    if (idField) idField.value = adId; // reset poistaa arvon, palautetaan

    const feedback = document.getElementById('modal-feedback');
    if (feedback) { feedback.style.display = 'none'; feedback.className = ''; }

    const titleEl   = modal.querySelector('.modal-title');
    const msgGroup  = document.getElementById('contact-message-group');
    const msgInput  = document.getElementById('contact-message');
    const submitBtn = document.getElementById('contact-submit-btn');

    // allow_messages vaikuttaa otsikkoon/kuvauksen ohjeeseen
    if (allowMessages === false) {
        if (titleEl)   titleEl.innerText = 'Lähetä yhteydenottopyyntö';
        if (msgGroup)  msgGroup.style.display = 'none';
        if (msgInput)  { msgInput.required = false; msgInput.value = '(Yhteydenottopyyntö)'; }
        if (submitBtn) submitBtn.innerText = 'Lähetä pyyntö';
    } else {
        if (titleEl)   titleEl.innerText = 'Lähetä viesti';
        if (msgGroup)  msgGroup.style.display = 'block';
        if (msgInput)  { msgInput.required = true; msgInput.value = ''; }
        if (submitBtn) submitBtn.innerText = 'Lähetä viesti';
    }

    modal.classList.add('active');
}

function closeContactModal() {
    const modal = document.getElementById('contact-modal');
    if (!modal) return;
    modal.classList.remove('active');
    const form = document.getElementById('contact-form');
    if (form) form.reset();
    const feedback = document.getElementById('modal-feedback');
    if (feedback) { feedback.style.display = 'none'; feedback.className = ''; }
}

document.addEventListener('DOMContentLoaded', () => {
    const contactForm = document.getElementById('contact-form');
    if (!contactForm) return;

    contactForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const btn      = document.getElementById('contact-submit-btn');
        const feedback = document.getElementById('modal-feedback');
        const adId     = document.getElementById('contact-ad-id')?.value || '';
        const name     = document.getElementById('contact-name')?.value.trim() || '';
        const email    = document.getElementById('contact-email')?.value.trim() || '';
        const message  = document.getElementById('contact-message')?.value.trim() || '';
        const honeypot = document.getElementById('contact-website')?.value || '';

        if (!adId || !name || !email) return;

        btn.disabled  = true;
        btn.innerText = 'Lähetetään...';
        if (feedback) { feedback.style.display = 'none'; feedback.className = ''; }

        const formData = new FormData();
        formData.append('encounter_id', adId);
        formData.append('sender_name',  name);
        formData.append('sender_email', email);
        formData.append('message_body', message || '(Yhteydenottopyyntö)');
        formData.append('website',      honeypot); // honeypot

        try {
            const res    = await fetch(KM_API + '?action=start_conversation', { method: 'POST', body: formData });
            const result = await res.json();

            if (result.success) {
                // Tallenna token sessionStorageen – käyttäjä voi avata linkin suoraan
                if (result.conversation_id && result.initiator_token) {
                    sessionStorage.setItem('km_conv_' + result.conversation_id, result.initiator_token);
                }

                if (feedback) {
                    feedback.innerHTML = `
                        <strong>✅ Viesti lähetetty!</strong><br>
                        Sait sähköpostiisi linkin keskusteluun. Kumpikaan sähköpostiosoite ei näy toiselle.
                        ${result.conversation_id
                            ? `<br><a href="keskustelu.html?id=${result.conversation_id}&token=${result.initiator_token}"
                                style="color:#166534; font-weight:700;" target="_blank">Avaa keskustelu →</a>`
                            : ''}`;
                    feedback.style.cssText = 'color:#166534; background:#dcfce7; border:1px solid #86efac; padding:.75rem 1rem; border-radius:8px; font-size:.88rem; display:block;';
                }
                contactForm.reset();
                document.getElementById('contact-ad-id').value = adId;
                if (btn) btn.innerText = 'Lähetetty ✓';
            } else {
                throw new Error(result.error || 'Tuntematon virhe');
            }
        } catch (err) {
            console.error(err);
            if (feedback) {
                feedback.innerText = 'Virhe: ' + err.message;
                feedback.style.cssText = 'color:#991b1b; background:#fee2e2; border:1px solid #fca5a5; padding:.75rem 1rem; border-radius:8px; font-size:.88rem; display:block;';
            }
        } finally {
            if (btn) { btn.disabled = false; if (btn.innerText !== 'Lähetetty ✓') btn.innerText = 'Lähetä viesti'; }
        }
    });
});

// ===================================================
// RAPORTOINTIMODAALI
// ===================================================
function openReportModal() {
    const modal = document.getElementById('report-modal');
    if (!modal) return;
    
    // Hae adId oikeasta kentästä (contact modal field tai URL)
    const adIdField = document.getElementById('contact-ad-id');
    const adId = (adIdField && adIdField.value) ? adIdField.value : new URLSearchParams(window.location.search).get('id');
    
    const reportAdIdField = document.getElementById('report-ad-id');
    if (reportAdIdField) reportAdIdField.value = adId;

    const form = document.getElementById('report-form');
    if (form) form.reset();
    const feedback = document.getElementById('report-feedback');
    if (feedback) { feedback.style.display = 'none'; feedback.className = ''; }

    modal.classList.add('active');
}

function closeReportModal() {
    const modal = document.getElementById('report-modal');
    if (!modal) return;
    modal.classList.remove('active');
    const form = document.getElementById('report-form');
    if (form) form.reset();
    const feedback = document.getElementById('report-feedback');
    if (feedback) { feedback.style.display = 'none'; feedback.className = ''; }
}

document.addEventListener('DOMContentLoaded', () => {
    const reportForm = document.getElementById('report-form');
    if (!reportForm) return;

    reportForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const btn      = document.getElementById('report-submit-btn');
        const feedback = document.getElementById('report-feedback');
        const targetId = document.getElementById('report-ad-id')?.value || '';
        const reason   = document.getElementById('report-reason')?.value.trim() || '';
        const honeypot = document.getElementById('report-website')?.value || '';

        if (!targetId || !reason) return;

        btn.disabled  = true;
        btn.innerText = 'Lähetetään...';
        if (feedback) { feedback.style.display = 'none'; feedback.className = ''; }

        const formData = new FormData();
        formData.append('type',      'encounter');
        formData.append('target_id', targetId);
        formData.append('reason',    reason);
        formData.append('website',   honeypot);

        try {
            const res    = await fetch(KM_API + '?action=report', { method: 'POST', body: formData });
            const result = await res.json();

            if (result.success) {
                if (feedback) {
                    feedback.innerText = '✅ ' + (result.message || 'Raportti lähetetty onnistuneesti.');
                    feedback.style.cssText = 'color:#166534; background:#dcfce7; border:1px solid #86efac; padding:.75rem 1rem; border-radius:8px; font-size:.88rem; display:block;';
                }
                reportForm.reset();
                if (btn) btn.innerText = 'Lähetetty ✓';
                setTimeout(closeReportModal, 3000);
            } else {
                throw new Error(result.error || 'Tuntematon virhe');
            }
        } catch (err) {
            console.error(err);
            if (feedback) {
                feedback.innerText = 'Virhe: ' + err.message;
                feedback.style.cssText = 'color:#991b1b; background:#fee2e2; border:1px solid #fca5a5; padding:.75rem 1rem; border-radius:8px; font-size:.88rem; display:block;';
            }
        } finally {
            if (btn) { btn.disabled = false; if (btn.innerText !== 'Lähetetty ✓') btn.innerText = 'Lähetä ilmoitus'; }
        }
    });
});
