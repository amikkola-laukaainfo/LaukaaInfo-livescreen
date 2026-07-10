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
// KATEGORIAT
// ===================================================
const categories = {
    'need_help':     { title: 'Tarvitsen palvelun',     icon: '🟢', emoji: '🟢', color: '#22c55e' },
    'offer_service': { title: 'Tarjoan palvelua',       icon: '🔵', emoji: '🔵', color: '#3b82f6' },
    'offer_skills':  { title: 'Tarjoan osaamistani',    icon: '🟠', emoji: '🟠', color: '#f97316' },
    'b2b_request':   { title: 'Yritysten tarjouspyyntö',icon: '🟣', emoji: '🟣', color: '#a855f7' },
    'gig':           { title: 'Työkeikka',              icon: '🟡', emoji: '🟡', color: '#eab308' },
    'volunteer':     { title: 'Talkoot',                icon: '❤️', emoji: '❤️', color: '#ef4444' },
    'space_rental':  { title: 'Tilat ja kalusto',       icon: '🏠', emoji: '🏠', color: '#14b8a6' },
    'b2b_collab':    { title: 'Yhteistyöhaku',          icon: '🤝', emoji: '🤝', color: '#6366f1' },
    'event_staff':   { title: 'Tapahtumahaku',          icon: '🎉', emoji: '🎉', color: '#ec4899' },
    'high_value':    { title: 'Arvotavarat (>2000€)',   icon: '💎', emoji: '💎', color: '#fbbf24' }
};

// ===================================================
// MOCK-DATA (tageilla varustettuna)
// ===================================================
const mockEncounters = [
    {
        id: '1',
        type: 'need_help',
        title: 'Nurmikon leikkuu ja pihatyöt',
        description: 'Etsin reipasta tekijää leikkaamaan omakotitalon nurmikon (n. 800m2) kerran viikossa kesän ajan. Omat välineet plussaa, mutta meiltäkin löytyy työnnettävä leikkuri.',
        price_info: '20€ / kerta',
        location: 'Lievestuore',
        tags: ['pihatyöt', 'nurmikko', 'kesä'],
        created_at: new Date(Date.now() - 86400000 * 2).toISOString()
    },
    {
        id: '2',
        type: 'offer_skills',
        title: 'Tietokoneiden asennus ja opastus',
        description: 'Olen IT-alan opiskelija ja autan mielelläni uuden tietokoneen tai puhelimen käyttöönotossa. Voin opastaa myös pankkitunnusten käytössä turvallisesti.',
        price_info: '25€ / h',
        location: 'Koko Laukaa',
        tags: ['it-tuki', 'tietokone', 'opastus'],
        created_at: new Date(Date.now() - 86400000 * 1).toISOString()
    },
    {
        id: '3',
        type: 'b2b_request',
        title: 'Tarjouspyyntö: Toimistotilojen siivous',
        description: 'Etsimme paikallista siivousyritystä hoitamaan toimistomme (150m2) siivouksen kerran viikossa. Yhteydenotot vain y-tunnuksellisilta toimijoilta.',
        price_info: 'Pyydä tarjous',
        location: 'Laukaa kk',
        tags: ['siivous', 'toimistot', 'säännöllinen'],
        created_at: new Date(Date.now() - 86400000 * 5).toISOString()
    },
    {
        id: '4',
        type: 'volunteer',
        title: 'Leppäveden Kyläjuhlat: Järjestyksenvalvojia',
        description: 'Etsimme vapaaehtoisia järjestyksenvalvojia (JV-kortti vaaditaan) kyläjuhliin lauantaille. Tarjoamme ruoat ja kahvit.',
        price_info: 'Vapaaehtoistyö',
        location: 'Leppävesi',
        tags: ['talkoot', 'kyläjuhla', 'JV-kortti'],
        created_at: new Date(Date.now() - 86400000 * 10).toISOString()
    },
    {
        id: '5',
        type: 'space_rental',
        title: 'Vuokrataan peräkärry kuomulla',
        description: 'Tilava ja siisti kuomullinen peräkärry vuokralle muuttoihin tai puutarhajätteelle. Kantavuus 500kg.',
        price_info: '20€ / vrk',
        location: 'Vihtavuori',
        tags: ['peräkärry', 'vuokra', 'muutto'],
        created_at: new Date(Date.now() - 86400000 * 3).toISOString()
    },
    {
        id: '6',
        type: 'high_value',
        title: 'Myydään: Traktorimönkijä Polaris Sportsman',
        description: 'Hyväkuntoinen ja säännöllisesti huollettu mönkijä lumilevyllä ja vinssillä. Ajettu vain 1500km. Loistava talven lumitöihin tai metsätöihin.',
        price_info: '5 500 €',
        location: 'Vehniä',
        tags: ['mönkijä', 'myynti', 'talvi'],
        created_at: new Date(Date.now() - 86400000 * 1).toISOString()
    },
    {
        id: '7',
        type: 'offer_service',
        title: 'Piensähkötyöt ja asennukset',
        description: 'Sähköasentaja tarjoaa palveluja piensähkötöihin: pistorasiat, valaisinasennukset, vikavirtasuojat jne. Nopea reagointi, paikallinen tekijä.',
        price_info: '55€ / h + alv',
        location: 'Laukaa',
        tags: ['sähkötyöt', 'asennus', 'remontti'],
        created_at: new Date(Date.now() - 86400000 * 4).toISOString()
    },
    {
        id: '8',
        type: 'gig',
        title: 'Keikkatyö: DJ juhlatilaisuuksiin',
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
let activeFilter  = 'all';
let activeTag     = null;
let searchQuery   = '';
let sortOrder     = 'newest';
let allEncounters = [];

// ===================================================
// DATAN HAKU
// ===================================================
async function fetchEncounters() {
    try {
        if (window.LaukaaSupabase) {
            const { data, error } = await window.LaukaaSupabase
                .from('encounters')
                .select('*')
                .eq('status', 'active')
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Supabase fetch error:', error);
                return mockEncounters;
            }
            // Supabase on käytettävissä: palautetaan aina Supabase-data
            // (myös tyhjänä taulukkona kun ilmoituksia ei ole vielä)
            // → mock-data ei sekoitu oikeiden ID:iden kanssa
            if (data !== null) {
                return data.map(d => ({ ...d, tags: Array.isArray(d.tags) ? d.tags : [] }));
            }
        }
    } catch (e) {
        console.warn('Virhe haettaessa Supabasesta, käytetään mock-dataa:', e);
    }
    // Fallback: käytetään mock-dataa vain jos Supabase ei ole saatavilla
    return mockEncounters;
}

// ===================================================
// INIT
// ===================================================
document.addEventListener('DOMContentLoaded', () => {
    const grid = document.getElementById('km-grid');
    if (grid) {
        initKohtaamisetFeed();
    } else {
        // ilmoituskortti.html käyttää myös tätä scriptia
        const single = document.getElementById('ad-single-container');
        if (single) initIlmoituskortti();
    }
});

async function initKohtaamisetFeed() {
    // Haku-input
    const searchInput = document.getElementById('km-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            searchQuery = searchInput.value.trim().toLowerCase();
            renderFeed();
        });
    }

    // Lajittelu
    const sortSelect = document.getElementById('km-sort-select');
    if (sortSelect) {
        sortSelect.addEventListener('change', () => {
            sortOrder = sortSelect.value;
            renderFeed();
        });
    }

    allEncounters = await fetchEncounters();

    renderSidebar();
    renderMobileCats();
    renderFeed();

    // Piilota spinner
    const loading = document.getElementById('km-loading');
    if (loading) loading.style.display = 'none';
}

// ===================================================
// SIVUPALKKI
// ===================================================
function renderSidebar() {
    const list = document.getElementById('km-cat-list');
    if (!list) return;

    // Laske määrät
    const counts = countByCategory(allEncounters);

    list.innerHTML = '';

    // "Kaikki" -item
    const allItem = makeSidebarItem('all', '📋', 'Kaikki ilmoitukset', '#64748b', counts.all);
    list.appendChild(allItem);

    Object.entries(categories).forEach(([key, cat]) => {
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

// ===================================================
// MOBIILIPAINIKKEET
// ===================================================
function renderMobileCats() {
    const container = document.getElementById('km-mobile-cats');
    if (!container) return;
    container.innerHTML = '';

    const counts = countByCategory(allEncounters);

    const allBtn = document.createElement('button');
    allBtn.className = `km-mobile-cat-btn ${activeFilter === 'all' ? 'active' : ''}`;
    allBtn.textContent = `Kaikki (${counts.all})`;
    allBtn.onclick = () => setCategoryFilter('all');
    container.appendChild(allBtn);

    Object.entries(categories).forEach(([key, cat]) => {
        const btn = document.createElement('button');
        btn.className = `km-mobile-cat-btn ${activeFilter === key ? 'active' : ''}`;
        btn.textContent = `${cat.emoji} ${cat.title}`;
        btn.onclick = () => setCategoryFilter(key);
        container.appendChild(btn);
    });
}

// ===================================================
// FILTTERÖINTI
// ===================================================
function setCategoryFilter(key) {
    activeFilter = key;
    activeTag = null; // Tyhjennä tagifiltteri kategorian vaihtuessa
    renderSidebar();
    renderMobileCats();
    updateTagFilterBar();
    renderFeed();
}

function setTagFilter(tag) {
    activeTag = tag;
    updateTagFilterBar();
    renderFeed();
}

function clearTagFilter() {
    activeTag = null;
    updateTagFilterBar();
    renderFeed();
}

function updateTagFilterBar() {
    const bar = document.getElementById('km-tag-filter-bar');
    const label = document.getElementById('km-active-tag-label');
    if (!bar || !label) return;

    if (activeTag) {
        label.textContent = activeTag;
        bar.classList.add('visible');
    } else {
        bar.classList.remove('visible');
    }
}

// Laske ilmoitusten määrät kategorioittain
function countByCategory(encounters) {
    const counts = { all: encounters.length };
    Object.keys(categories).forEach(k => { counts[k] = 0; });
    encounters.forEach(e => {
        if (counts[e.type] !== undefined) counts[e.type]++;
    });
    return counts;
}

// ===================================================
// FEED-RENDERÖINTI
// ===================================================
function renderFeed() {
    const grid = document.getElementById('km-grid');
    if (!grid) return;

    let filtered = [...allEncounters];

    // Kategoria
    if (activeFilter !== 'all') {
        filtered = filtered.filter(ad => ad.type === activeFilter);
    }

    // Haku (otsikko + kuvaus + tagit)
    if (searchQuery) {
        filtered = filtered.filter(ad => {
            const tags = (ad.tags || []).join(' ').toLowerCase();
            return (
                (ad.title || '').toLowerCase().includes(searchQuery) ||
                (ad.description || '').toLowerCase().includes(searchQuery) ||
                tags.includes(searchQuery)
            );
        });
    }

    // Tagifiltteri
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

    // Tulosten määrä
    const countEl = document.getElementById('km-result-count');
    if (countEl) {
        countEl.textContent = filtered.length === 0
            ? 'Ei tuloksia'
            : `${filtered.length} ilmoitu${filtered.length === 1 ? 's' : 'sta'}`;
    }

    grid.innerHTML = '';

    if (filtered.length === 0) {
        grid.innerHTML = `
            <div class="km-empty">
                <div class="km-empty-icon">🔍</div>
                <h3>Ei ilmoituksia</h3>
                <p>Valituilla suodattimilla ei löydy ilmoituksia juuri nyt.</p>
                <a href="jata-ilmoitus.html" class="km-btn-primary" style="display:inline-flex; margin-top:1rem;">
                    + Jätä ensimmäinen ilmoitus
                </a>
            </div>`;
        return;
    }

    filtered.forEach(ad => {
        const cat = categories[ad.type];
        if (!cat) return;

        const dateStr = new Date(ad.created_at).toLocaleDateString('fi-FI');
        const tags = Array.isArray(ad.tags) ? ad.tags : [];

        const tagsHtml = tags.length
            ? `<div class="km-card-tags">${tags.map(t =>
                `<button class="km-tag${activeTag === t ? ' active' : ''}"
                    onclick="event.preventDefault(); setTagFilter('${escapeHtml(t)}')"
                    title="Suodata: ${escapeHtml(t)}">${escapeHtml(t)}</button>`
              ).join('')}</div>`
            : '';

        const card = document.createElement('a');
        card.href = `ilmoituskortti.html?id=${ad.id}`;
        card.className = 'km-card';
        card.style.borderTopColor = cat.color;

        card.innerHTML = `
            <span class="km-card-badge" style="color:${cat.color};">${cat.emoji} ${cat.title}</span>
            <h3 class="km-card-title">${escapeHtml(ad.title)}</h3>
            <p class="km-card-desc">${escapeHtml(ad.description).substring(0, 110)}${ad.description.length > 110 ? '…' : ''}</p>
            ${tagsHtml}
            <div class="km-card-footer">
                <span class="km-card-location">
                    <span class="iconify" data-icon="lucide:map-pin" style="font-size:0.85rem;"></span>
                    ${escapeHtml(ad.location || '—')}
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

    const cat = categories[ad.type] || categories['need_help'];
    const header = document.getElementById('ad-header');
    if (header) header.style.backgroundColor = cat.color;

    document.getElementById('ad-badge').innerHTML = `${cat.emoji} ${cat.title}`;
    document.getElementById('ad-title').innerText = ad.title;
    document.getElementById('ad-desc').innerText = ad.description;
    document.getElementById('ad-price').innerText = ad.price_info;
    document.getElementById('ad-location').innerText = ad.location;

    // Tagit
    const tagsContainer = document.getElementById('ad-tags');
    if (tagsContainer && Array.isArray(ad.tags) && ad.tags.length > 0) {
        tagsContainer.innerHTML = ad.tags.map(t =>
            `<a href="kohtaamiset.html" class="km-tag" onclick="sessionStorage.setItem('km_tag','${escapeHtml(t)}')">${escapeHtml(t)}</a>`
        ).join('');
    }

    const btn = document.getElementById('ad-contact-btn');
    if (btn) {
        if (ad.contact_email) {
            btn.href = '#';
            btn.innerText = 'Ota yhteyttä ilmoittajaan';
            btn.onclick = (e) => {
                e.preventDefault();
                openContactModal(ad.id, ad.allow_messages !== false);
            };
        } else {
            btn.href = '#';
            btn.innerText = 'Ei yhteystietoja saatavilla';
            btn.style.opacity = '0.5';
            btn.style.cursor = 'not-allowed';
            btn.onclick = (e) => e.preventDefault();
        }
    }

    const d = new Date(ad.created_at);
    const dateEl = document.getElementById('ad-date');
    if (dateEl) dateEl.innerText = d.toLocaleDateString('fi-FI');
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
