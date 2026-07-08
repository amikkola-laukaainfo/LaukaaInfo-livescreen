/**
 * Laukaan Kohtaamispaikka (Digitaalinen ekosysteemi)
 * Käsittelee kohtaamiset.html -sivun listauksen sekä ilmoituskortti.html -sivun datan.
 */

const categories = {
    'need_help': { title: 'Tarvitsen palvelun', icon: '🟢', color: '#22c55e' },
    'offer_service': { title: 'Tarjoan palvelua', icon: '🔵', color: '#3b82f6' },
    'offer_skills': { title: 'Tarjoan osaamistani', icon: '🟠', color: '#f97316' },
    'b2b_request': { title: 'Yritysten tarjouspyyntö', icon: '🟣', color: '#a855f7' },
    'gig': { title: 'Työkeikka', icon: '🟡', color: '#eab308' },
    'volunteer': { title: 'Talkoot', icon: '❤️', color: '#ef4444' },
    'space_rental': { title: 'Tilat ja kalusto', icon: '🏠', color: '#14b8a6' },
    'b2b_collab': { title: 'Yhteistyöhaku', icon: '🤝', color: '#6366f1' },
    'event_staff': { title: 'Tapahtumahaku', icon: '🎉', color: '#ec4899' },
    'high_value': { title: 'Arvotavarat (>2000€)', icon: '💎', color: '#fbbf24' }
};

// Mock-data ensimmäisen vaiheen käyttöliittymän testaukseen
const mockEncounters = [
    {
        id: '1',
        type: 'need_help',
        title: 'Nurmikon leikkuu ja pihatyöt',
        description: 'Etsin reipasta tekijää leikkaamaan omakotitalon nurmikon (n. 800m2) kerran viikossa kesän ajan. Omat välineet plussaa, mutta meiltäkin löytyy työnnettävä leikkuri.',
        price_info: '20€ / kerta',
        location: 'Lievestuore',
        created_at: new Date(Date.now() - 86400000 * 2).toISOString() // 2 päivää sitten
    },
    {
        id: '2',
        type: 'offer_skills',
        title: 'Tietokoneiden asennus ja opastus',
        description: 'Olen IT-alan opiskelija ja autan mielelläni uuden tietokoneen tai puhelimen käyttöönotossa. Voin opastaa myös pankkitunnusten ja vahvan tunnistautumisen käytössä turvallisesti.',
        price_info: '25€ / h',
        location: 'Koko Laukaa',
        created_at: new Date(Date.now() - 86400000 * 1).toISOString()
    },
    {
        id: '3',
        type: 'b2b_request',
        title: 'Tarjouspyyntö: Toimistotilojen siivous',
        description: 'Etsimme paikallista siivousyritystä hoitamaan toimistomme (150m2) siivouksen kerran viikossa. Yhteydenotot vain y-tunnuksellisilta toimijoilta.',
        price_info: 'Pyydä tarjous',
        location: 'Laukaa kk',
        created_at: new Date(Date.now() - 86400000 * 5).toISOString()
    },
    {
        id: '4',
        type: 'volunteer',
        title: 'Leppäveden Kyläjuhlat: Järjestyksenvalvojia',
        description: 'Etsimme vapaaehtoisia järjestyksenvalvojia (JV-kortti vaaditaan) kyläjuhliin lauantaille. Tarjoamme ruoat ja kahvit koko päiväksi sekä mahtavan yhteishengen!',
        price_info: 'Vapaaehtoistyö',
        location: 'Leppävesi',
        created_at: new Date(Date.now() - 86400000 * 10).toISOString()
    },
    {
        id: '5',
        type: 'space_rental',
        title: 'Vuokrataan peräkärry kuomulla',
        description: 'Tilava ja siisti kuomullinen peräkärry vuokralle muuttoihin tai puutarhajätteelle. Kantavuus 500kg.',
        price_info: '20€ / vrk',
        location: 'Vihtavuori',
        created_at: new Date(Date.now() - 86400000 * 3).toISOString()
    },
    {
        id: '6',
        type: 'high_value',
        title: 'Myydään: Traktorimönkijä Polaris Sportsman',
        description: 'Hyväkuntoinen ja säännöllisesti huollettu mönkijä lumilevyllä ja vinssillä. Ajettu vain 1500km. Tästä loistava peli talven lumitöihin tai metsätöihin.',
        price_info: '5 500 €',
        location: 'Vehniä',
        created_at: new Date(Date.now() - 86400000 * 1).toISOString()
    }
];

let activeFilter = 'all';

document.addEventListener('DOMContentLoaded', () => {
    const gridEl = document.getElementById('ad-grid');
    if (gridEl) {
        initKohtaamisetFeed();
    } else {
        const singleContainer = document.getElementById('ad-single-container');
        if (singleContainer) {
            initIlmoituskortti();
        }
    }
});

function initIlmoituskortti() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    const spinner = document.getElementById('loading-spinner');
    const container = document.getElementById('ad-single-container');

    if (!id) {
        if (spinner) spinner.innerHTML = 'Ilmoitusta ei löytynyt.';
        return;
    }

    // Haetaan mock-datasta
    const ad = mockEncounters.find(a => a.id === id);

    if (!ad) {
        if (spinner) spinner.innerHTML = 'Ilmoitusta ei löytynyt tai se on vanhentunut.';
        return;
    }

    if (spinner) spinner.style.display = 'none';
    container.style.display = 'block';

    const cat = categories[ad.type] || categories['need_help'];
    
    const header = document.getElementById('ad-header');
    header.style.backgroundColor = cat.color;

    document.getElementById('ad-badge').innerHTML = `${cat.icon} ${cat.title}`;
    document.getElementById('ad-title').innerText = ad.title;
    document.getElementById('ad-desc').innerText = ad.description;
    document.getElementById('ad-price').innerText = ad.price_info;
    document.getElementById('ad-location').innerText = ad.location;

    const d = new Date(ad.created_at);
    document.getElementById('ad-date').innerText = d.toLocaleDateString('fi-FI');
}

function initKohtaamisetFeed() {
    renderFilters();
    renderFeed();
}

function renderFilters() {
    const container = document.getElementById('filter-container');
    if (!container) return;

    container.innerHTML = '';

    // Kaikki -nappi
    const allBtn = document.createElement('button');
    allBtn.className = `filter-btn ${activeFilter === 'all' ? 'active' : ''}`;
    allBtn.innerText = 'Kaikki ilmoitukset';
    allBtn.onclick = () => { activeFilter = 'all'; renderFilters(); renderFeed(); };
    container.appendChild(allBtn);

    // Kategoriat
    Object.keys(categories).forEach(catKey => {
        const cat = categories[catKey];
        const btn = document.createElement('button');
        btn.className = `filter-btn ${activeFilter === catKey ? 'active' : ''}`;
        btn.innerHTML = `<span>${cat.icon}</span> ${cat.title}`;
        btn.onclick = () => { activeFilter = catKey; renderFilters(); renderFeed(); };
        container.appendChild(btn);
    });
}

function renderFeed() {
    const grid = document.getElementById('ad-grid');
    const spinner = document.getElementById('loading-spinner');
    
    if (spinner) spinner.style.display = 'none';
    if (!grid) return;

    grid.innerHTML = '';

    // Filtteröinti
    const filtered = activeFilter === 'all' 
        ? mockEncounters 
        : mockEncounters.filter(ad => ad.type === activeFilter);

    if (filtered.length === 0) {
        grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: #64748b; background: white; border-radius: 16px;">Ei ilmoituksia valitussa kategoriassa juuri nyt. Ole ensimmäinen ja jätä ilmoitus!</div>`;
        return;
    }

    // Luodaan kortit
    filtered.forEach(ad => {
        const cat = categories[ad.type];
        if (!cat) return; // Fallback jos tuntematon tyyppi

        const d = new Date(ad.created_at);
        const dateStr = d.toLocaleDateString('fi-FI');

        const card = document.createElement('a');
        card.href = `ilmoituskortti.html?id=${ad.id}`;
        card.className = 'ad-card';
        card.style.borderTopColor = cat.color;

        card.innerHTML = `
            <span class="ad-type-badge" style="color: ${cat.color};">${cat.icon} ${cat.title}</span>
            <h3 class="ad-title">${escapeHtml(ad.title)}</h3>
            <p class="ad-desc">${escapeHtml(ad.description).substring(0, 120)}${ad.description.length > 120 ? '...' : ''}</p>
            <div class="ad-meta">
                <div class="ad-location">
                    <span class="iconify" data-icon="lucide:map-pin"></span> ${escapeHtml(ad.location)}
                </div>
                <div class="ad-price">${escapeHtml(ad.price_info)}</div>
            </div>
            <div style="font-size: 0.75rem; color: #94a3b8; text-align: right; margin-top: 4px;">Julkaistu: ${dateStr}</div>
        `;

        grid.appendChild(card);
    });
}

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
