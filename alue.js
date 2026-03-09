const REGIONS_CSV_URL = 'https://www.mediazoo.fi/laukaainfo-web/get_alueet.php';
let areaMetadata = {};

document.addEventListener('DOMContentLoaded', () => {
    initRegionPage();
});

async function fetchRegionMetadata() {
    try {
        const response = await fetch(REGIONS_CSV_URL);
        if (!response.ok) throw new Error('Alue-CSV lataus epäonnistui');

        // PHP proxy palauttaa suoraan jäsennellyn JSON-kirjaston
        const data = await response.json();

        // Tarkistetaan virheet
        if (data.error) {
            console.error('PHP Proxy virhe:', data.error);
            return;
        }

        // Kopioidaan tulokset areaMetadata-objektiin
        areaMetadata = data;

    } catch (error) {
        console.error('Virhe alueiden haussa:', error);
    }
}

async function initRegionPage() {
    const params = new URLSearchParams(window.location.search);

    // Recognize region from the file name or path, handling trailing slashes
    const pathParts = window.location.pathname.split('/').filter(p => p.length > 0);
    const pathArea = pathParts.length > 0 ? pathParts.pop().replace('.html', '').toLowerCase() : '';

    const areaSlug = params.get('area')?.toLowerCase() || pathArea;
    const catParam = params.get('cat')?.toLowerCase();
    const tagParam = params.get('tag')?.toLowerCase();

    // Hae ensin alueiden metadata CSV:stä
    await fetchRegionMetadata();

    let area;
    if (areaSlug === 'koko-laukaa') {
        area = {
            slug: 'koko-laukaa',
            name: 'Koko Laukaa',
            desc: 'Hae yrityksiä ja palveluita koko Laukaan alueelta.',
            lat: 62.4128,
            lon: 25.9477
        };
    } else {
        if (!areaSlug || !areaMetadata[areaSlug]) {
            console.warn('Aluetta ei tunnistettu:', areaSlug);
            const container = document.getElementById('catalog-list') || document.body;
            container.innerHTML = '<p style="padding: 2rem;">Aluetta ei löytynyt tai dataa ladataan. Tarkista URL-osoite.</p>';
            return;
        }
        area = areaMetadata[areaSlug];
    }

    // Lukitaan alue hakukoneelle ja script.js:lle
    localStorage.setItem('selectedRegion', areaSlug);
    localStorage.setItem('regionCoords', JSON.stringify({ lat: area.lat, lon: area.lon }));

    updateMetadata(area, catParam, tagParam);

    // Päivitetään hakukenttä jos meillä on tagi tai kategoria (auttaa korostuksessa)
    const searchInput = document.getElementById('company-search');
    if (searchInput && (tagParam || catParam)) {
        searchInput.value = tagParam || catParam.replace(/-/g, ' ');
    }

    // Odota että allCompanies on ladattu
    await waitForData();

    const filtered = filterByArea(areaSlug, catParam, tagParam);
    renderRegionContent(area, areaSlug, filtered, catParam, tagParam);
    initRegionMap(area, filtered);
    fetchRegionNews(area);
}

function updateMetadata(area, cat, tag) {
    const titleEl = document.getElementById('region-title');
    const pageTitleEl = document.getElementById('page-title');
    const seoDescEl = document.getElementById('seo-description');

    let titleText = area.name;
    if (tag) { const tagCap = tag.charAt(0).toUpperCase() + tag.slice(1); titleText = `${tagCap.endsWith('t') ? tagCap : tagCap + 't'} - ${area.name}`; }
    else if (cat) titleText = `${cat.charAt(0).toUpperCase() + cat.slice(1)} - ${area.name}`;

    titleEl.textContent = titleText;
    pageTitleEl.textContent = `${titleText} | LaukaaInfo`;

    let seoText = `<h3>${area.name} – yritykset, palvelut ja uutiset</h3>`;
    seoText += `<p>${area.desc}</p>`;
    if (tag || cat) {
        seoText += `<p>Tunnisteet: <strong>${tag || cat}</strong>.</p>`;
    }
    seoDescEl.innerHTML = seoText;
}

async function waitForData() {
    return new Promise(resolve => {
        const check = () => {
            if (typeof allCompanies !== 'undefined' && allCompanies.length > 0) {
                resolve();
            } else {
                setTimeout(check, 100);
            }
        };
        check();
    });
}

// Tiedostonimet vs. CSV:n alue_slug-arvot eivät aina täsmää täsmälleen.
// Tämä kartta yhdistää HTML-tiedoston slugin kaikkiin hyväksyttäviin alue_slug-arvoihin.
const AREA_SLUG_ALIASES = {
    'laukaa': ['laukaa', 'laukaa kk', 'laukaa keskusta'],
    'leppavesi': ['leppavesi', 'leppävesi'],
    'lievestuore': ['lievestuore'],
    'vehnia': ['vehnia', 'vehniä'],
    'vihtavuori': ['vihtavuori'],
    'koko-laukaa': [] // Kaikki alueet – käsitellään erikseen
};

function filterByArea(areaSlug, catParam, tagParam) {
    // Sallitut alue_slug-arvot tälle sivulle (normalisoituna pieniksi kirjaimiksi)
    const allowedSlugs = AREA_SLUG_ALIASES[areaSlug] || [areaSlug];

    return allCompanies.filter(c => {
        const companySlug = (c.alue_slug || '').toLowerCase().trim();
        const matchArea = areaSlug === 'koko-laukaa' || allowedSlugs.includes(companySlug);
        if (!matchArea) return false;

        if (tagParam) {
            const tags = (c.tags || '').toLowerCase();
            return tags.includes(tagParam);
        }
        if (catParam) {
            return (c.kategoria || '').toLowerCase() === catParam.replace(/-/g, ' ');
        }
        return true;
    });
}

function renderRegionContent(area, areaSlug, filtered, cat, tag) {
    // Kategoriat alueella
    const regionCats = [...new Set(filtered.map(c => c.kategoria))].sort();
    const catGrid = document.getElementById('region-categories');
    if (catGrid) {
        catGrid.innerHTML = '';
        regionCats.forEach(c => {
            const icon = (typeof categoryIcons !== 'undefined' && categoryIcons[c]) ? categoryIcons[c] : '🏢';
            const card = document.createElement('a');
            // Kohdistetaan kategoria nykyiseen alueeseen (tyypillisesti region=alue_slug)
            const regionParam = areaSlug === 'koko-laukaa' ? 'all' : areaSlug;
            card.href = `kategoria.html?cat=${encodeURIComponent(c)}&region=${encodeURIComponent(regionParam)}`;
            card.className = 'category-card';
            card.innerHTML = `<span class="cat-icon">${icon}</span><h3>${c}</h3>`;
            catGrid.appendChild(card);
        });
    }

    // Tägit alueella
    const tagCloud = document.getElementById('region-tag-cloud');
    if (tagCloud) {
        const allTags = filtered.flatMap(c => (c.tags || '').split(',').map(t => t.trim().toLowerCase())).filter(t => t.length > 0);
        const tagCounts = allTags.reduce((acc, t) => { acc[t] = (acc[t] || 0) + 1; return acc; }, {});
        const uniqueTags = Object.keys(tagCounts).sort((a, b) => tagCounts[b] - tagCounts[a]).slice(0, 12);

        tagCloud.innerHTML = '';
        uniqueTags.forEach(t => {
            const pill = document.createElement('a');
            pill.href = `${areaSlug}.html?tag=${encodeURIComponent(t)}`;
            pill.className = 'tag-pill';
            pill.textContent = t;
            tagCloud.appendChild(pill);
        });
    }

    // Yritysnäytteet, järjestetään satunnaisesti mutta painotettuna
    const featured = [...filtered].map(c => {
        const weight = parseFloat(c.karusellipaino) || 0;
        const sortScore = (Math.random() * 10) + (weight / 10);
        return { ...c, sortScore };
    }).sort((a, b) => b.sortScore - a.sortScore).slice(0, 8);
    if (typeof renderCatalog === 'function') {
        renderCatalog(featured);
    }

    renderNearby(area);
}

function renderNearby(area) {
    const nearbyList = document.getElementById('nearby-list');
    if (!nearbyList) return;

    const nearby = allCompanies.filter(c => {
        if (!c.lat || !c.lon || (c.alue_slug || '').toLowerCase() === area.slug) return false;
        const dist = getHaversineDistance(area.lat, area.lon, parseFloat(c.lat), parseFloat(c.lon));
        return dist <= 12; // 12km säde
    })
        .sort((a, b) => {
            const dA = getHaversineDistance(area.lat, area.lon, parseFloat(a.lat), parseFloat(a.lon));
            const dB = getHaversineDistance(area.lat, area.lon, parseFloat(b.lat), parseFloat(b.lon));
            return dA - dB;
        })
        .slice(0, 8);

    nearbyList.innerHTML = '';
    nearby.forEach(company => {
        const item = document.createElement('div');
        item.className = 'catalog-item';
        const dist = getHaversineDistance(area.lat, area.lon, parseFloat(company.lat), parseFloat(company.lon));
        const distText = dist < 1 ? `${Math.round(dist * 1000)} m` : `${dist.toFixed(1)} km`;

        item.innerHTML = `
            <div class="catalog-item-header">
                <h4>${company.nimi}</h4>
                <span class="dist-badge">🚗 ${distText}</span>
            </div>
            <span class="cat-tag">${company.kategoria}</span>
        `;
        item.onclick = () => {
            const region = localStorage.getItem('selectedRegion');
            const regionParam = (region && region !== 'all') ? `&region=${region}` : '';
            window.location.href = `yrityskortti.html?id=${company.id}${regionParam}`;
        };
        nearbyList.appendChild(item);
    });
}

function initRegionMap(area, companies) {
    const mapContainer = document.getElementById('company-map');
    if (!mapContainer || typeof L === 'undefined') return;

    let regionMap;
    // Tarkistetaan onko kartta jo alustettu (esim. script.js toimesta)
    // script.js asettaa globaalit 'map' ja 'markers' muuttujat
    if (typeof map !== 'undefined' && map) {
        regionMap = map;
        console.log('[Alue] Päivitetään olemassaoleva kartta alueelle:', area.name);
        const zoom = area.slug === 'koko-laukaa' ? 10 : 13;
        regionMap.setView([area.lat, area.lon], zoom);
    } else if (mapContainer._leaflet_id) {
        console.warn('[Alue] Kartta-id löytyi, mutta map-muuttuja on hukassa.');
        return;
    } else {
        // Ensimmäinen alustus
        const zoom = area.slug === 'koko-laukaa' ? 10 : 13;
        regionMap = L.map('company-map').setView([area.lat, area.lon], zoom);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(regionMap);
        if (typeof map !== 'undefined') map = regionMap;
    }

    // Käytetään globaalia markers-ryhmää jos se on olemassa, muuten luodaan uusi
    let targetMarkers;
    if (typeof markers !== 'undefined') {
        if (!markers) {
            markers = L.markerClusterGroup({
                showCoverageOnHover: false,
                maxClusterRadius: 50
            });
            regionMap.addLayer(markers);
        }
        targetMarkers = markers;
        targetMarkers.clearLayers();
    } else {
        targetMarkers = L.markerClusterGroup();
        regionMap.addLayer(targetMarkers);
    }

    // Lisätään vain kyseisen alueen/-haun mukaiset markerit
    companies.forEach(company => {
        if (company.lat && company.lon) {
            const marker = L.marker([parseFloat(company.lat), parseFloat(company.lon)]);
            marker.bindPopup(`<b>${company.nimi}</b><br>${company.kategoria}<br><br><a href="yrityskortti.html?id=${company.id}" class="btn-primary" style="color:white; padding: 5px 10px; font-size: 0.8rem;">Avaa kortti</a>`);
            targetMarkers.addLayer(marker);
        }
    });
}

function fetchRegionNews(area) {
    const container = document.getElementById('blogger-feed');
    const eventsContainer = document.getElementById('events-feed');
    if (!container) return;

    console.log('[Blogger] Alustetaan uutishaku alueelle:', area.name, area);

    let feedUrl = null;

    if (area.bloggerUrl) {
        // Käytetään suoraa blogspot-URL:a – ei numerista ID:tä (ID voi pyöristyä väärin)
        // Normalisoidaan URL (poistetaan trailing slash)
        const baseUrl = area.bloggerUrl.replace(/\/$/, '');
        feedUrl = `${baseUrl}/feeds/posts/default?alt=json-in-script&callback=renderBloggerFeed&max-results=5`;
        console.log('[Blogger] Haetaan feed blogspot-URL:lla:', feedUrl);
    } else if (area.bloggerId) {
        feedUrl = `https://www.blogger.com/feeds/${area.bloggerId}/posts/default?alt=json-in-script&callback=renderBloggerFeed&max-results=5`;
        console.log('[Blogger] Haetaan feedit blog-ID:llä:', area.bloggerId);
    }

    if (feedUrl) {
        const script = document.createElement('script');
        script.src = feedUrl;
        script.id = 'blogger-script-tag';
        script.onerror = () => {
            console.error('[Blogger] Script-lataus epäonnistui, URL:', script.src);
            container.innerHTML = '<p>Uutisten lataus epäonnistui (Blogger-virhe).</p>';
        };
        // Poista vanha script-tagi jos sellainen on
        const oldScript = document.getElementById('blogger-script-tag');
        if (oldScript) oldScript.remove();

        document.body.appendChild(script);
    } else {
        console.log('[Blogger] Ei bloggerId- eikä bloggerUrl-arvoa alueelle:', area.name);
        const fallbackHtml = `
            <div class="no-news-message" style="padding: 2rem; background: rgba(0,0,0,0.03); border-radius: 12px; text-align: center;">
                <p style="margin-bottom: 0.5rem; font-weight: 500;">Tämän alueen uutissyöte ja tapahtumakalenteri päivittyvät tänne myöhemmin.</p>
                <p style="font-size: 0.9rem; opacity: 0.7;">Seuraa tiedotusta!</p>
            </div>
        `;
        container.innerHTML = fallbackHtml;
        if (eventsContainer) eventsContainer.innerHTML = fallbackHtml;
    }
}

window.renderBloggerFeed = function (data) {
    console.log('[Blogger] Feed-data vastaanotettu:', data);
    const container = document.getElementById('blogger-feed');
    if (!container) {
        console.warn('[Blogger] Säilöä "blogger-feed" ei löytynyt.');
        return;
    }

    // Joustava parsiminen: Blogger voi palauttaa feed-objektin juuressa tai kiedottuna
    const feed = data.feed || data;
    const entries = feed.entry || [];

    container.innerHTML = '';

    if (entries.length === 0) {
        console.log('[Blogger] Ei syötteitä (entries.length === 0).');
        container.innerHTML = '<p>Ei julkaisuja.</p>';
        return;
    }

    // Etsi blogiin johtava linkki feedistä (usein alternate link feed-tasolla)
    let blogLink = '#';
    if (feed.link) {
        const altBlogLink = feed.link.find(l => l.rel === 'alternate');
        if (altBlogLink) blogLink = altBlogLink.href;
    }

    console.log(`[Blogger] Renderöidään ${entries.length} uutista.`);

    entries.slice(0, 5).forEach((entry, index) => {
        try {
            const title = entry.title ? entry.title.$t : 'Ei otsikkoa';
            let content = entry.content ? entry.content.$t : (entry.summary ? entry.summary.$t : '');

            // Poimi kuva jos sellainen on
            let imageUrl = '';
            // 1. Ensisijaisesti thumbnail-tagista (jos on)
            if (entry.media$thumbnail) {
                imageUrl = entry.media$thumbnail.url;
            } else {
                // 2. Toissijaisesti sisällöstä
                const imgMatch = content.match(/<img[^>]+src="([^">]+)"/);
                if (imgMatch) imageUrl = imgMatch[1];
            }

            // Puhdista HTML koodista snippetiä varten
            let rawText = content.replace(/<[^>]*>?/gm, '').trim();
            if (rawText.length > 200) {
                rawText = rawText.substring(0, 200) + '...';
            }

            // Etsi alternate-linkki
            let link = '#';
            if (entry.link) {
                const altLink = entry.link.find(l => l.rel === 'alternate');
                if (altLink) link = altLink.href;
            }

            const publishedDate = entry.published ? new Date(entry.published.$t) : new Date();
            const dateStr = publishedDate.toLocaleDateString('fi-FI');

            const postEl = document.createElement('div');
            postEl.className = 'rss-item';
            postEl.innerHTML = `
                ${imageUrl ? '<a href="' + link + '" target="_blank"><img src="' + imageUrl + '" class="rss-item-image" loading="lazy" alt="Kuva uutiseen"></a>' : ''}
                <div class="rss-meta"><span class="date">📅 ${dateStr}</span></div>
                <h3><a href="${link}" target="_blank">${title}</a></h3>
                <p class="description">${rawText}</p>
                <a href="${link}" target="_blank" class="read-more">Lue koko uutinen →</a>
            `;

            container.appendChild(postEl);
        } catch (err) {
            console.error(`[Blogger] Virhe syötteen ${index} parsimisessa:`, err, entry);
        }
    });

    // Lisää linkki koko blogiin
    if (blogLink && blogLink !== '#') {
        const allNewsLink = document.createElement('div');
        allNewsLink.className = 'view-all-news';
        allNewsLink.innerHTML = `<a href="${blogLink}" target="_blank" class="btn-secondary">Katso kaikki uutiset Bloggerissa</a>`;
        container.appendChild(allNewsLink);
    }
};
