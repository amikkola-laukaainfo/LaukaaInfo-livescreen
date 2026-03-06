const areaMetadata = {
    'lievestuore': {
        slug: 'lievestuore',
        name: 'Lievestuore',
        lat: 62.2625,
        lon: 26.2039,
        desc: 'Lievestuore on Laukaan kunnan itäosassa sijaitseva eloisa taajama, joka tunnetaan erityisesti vahvasta kylähengestään, upeista järvimaisemistaan ja monipuolisista palveluistaan. Tältä sivulta löydät Lievestuoreen yritykset, uutiset ja tapahtumat kootusti yhdestä paikasta.',
        bloggerId: '7148270853674792022'
    },
    'laukaa': {
        slug: 'laukaa',
        name: 'Laukaa',
        lat: 62.41407,
        lon: 25.95194,
        desc: 'Laukaan kirkonkylä on kunnan hallinnollinen ja kaupallinen keskus, joka tarjoaa kattavat palvelut asukkaille ja vierailijoille. Kirkonkylän rantamaisemat ja aktiivinen yrityskenttä tekevät siitä houkuttelevan paikan asioida ja viihtyä.',
        bloggerId: null
    },
    'vihtavuori': {
        slug: 'vihtavuori',
        name: 'Vihtavuori',
        lat: 62.370563,
        lon: 25.902297,
        desc: 'Vihtavuori on tunnettu teollisuushistoriastaan, vireistä urheiluseuroistaan ja viihtyisästä asuinympäristöstään. Se on yksi Laukaan keskeisimmistä taajamista, jossa yhdistyvät luonnonläheisyys ja hyvät palvelut.',
        bloggerId: null
    },
    'leppavesi': {
        slug: 'leppavesi',
        name: 'Leppävesi',
        lat: 62.326386,
        lon: 25.840924,
        desc: 'Leppävesi on kasvava ja dynaaminen taajama lähellä Jyväskylän rajaa. Alue tarjoaa monipuolisia palveluita erityisesti lapsiperheille ja rakentajille, ja se on tunnettu aktiivisesta kehityksestään.',
        bloggerId: null
    },
    'vehnia': {
        slug: 'vehnia',
        name: 'Vehniä',
        lat: 62.4381,
        lon: 25.6825,
        desc: 'Vehniä on vireä kylä nelostien varrella, jossa maaseudun rauha kohtaa hyvät liikenneyhteydet. Kylä on tunnettu yhteisöllisyydestään ja omaleimaisista yrittäjistään.',
        bloggerId: null
    }
};

document.addEventListener('DOMContentLoaded', () => {
    initRegionPage();
});

async function initRegionPage() {
    const params = new URLSearchParams(window.location.search);

    // Recognize region from the file name or path, handling trailing slashes
    const pathParts = window.location.pathname.split('/').filter(p => p.length > 0);
    const pathArea = pathParts.length > 0 ? pathParts.pop().replace('.html', '').toLowerCase() : '';

    const areaSlug = params.get('area')?.toLowerCase() || pathArea;
    const catParam = params.get('cat')?.toLowerCase();
    const tagParam = params.get('tag')?.toLowerCase();

    if (!areaSlug || !areaMetadata[areaSlug]) {
        console.warn('Aluetta ei tunnistettu:', areaSlug);
        return;
    }

    const area = areaMetadata[areaSlug];

    // Lukitaan alue hakukoneelle ja script.js:lle
    localStorage.setItem('selectedRegion', areaSlug);
    localStorage.setItem('regionCoords', JSON.stringify({ lat: area.lat, lon: area.lon }));

    updateMetadata(area, catParam, tagParam);

    // Odota että allCompanies on ladattu
    await waitForData();

    const filtered = filterByArea(areaSlug, catParam, tagParam);
    renderRegionContent(area, filtered, catParam, tagParam);
    initRegionMap(area, filtered);
    fetchRegionNews(area);
}

function updateMetadata(area, cat, tag) {
    const titleEl = document.getElementById('region-title');
    const pageTitleEl = document.getElementById('page-title');
    const seoDescEl = document.getElementById('seo-description');

    let titleText = area.name;
    if (tag) titleText = `${tag.charAt(0).toUpperCase() + tag.slice(1)}t - ${area.name}`;
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

function filterByArea(areaSlug, catParam, tagParam) {
    return allCompanies.filter(c => {
        const matchArea = (c.alue_slug || '').toLowerCase() === areaSlug;
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

function renderRegionContent(area, filtered, cat, tag) {
    // Kategoriat alueella
    const regionCats = [...new Set(filtered.map(c => c.kategoria))].sort();
    const catGrid = document.getElementById('region-categories');
    if (catGrid) {
        catGrid.innerHTML = '';
        regionCats.forEach(c => {
            const icon = (typeof categoryIcons !== 'undefined' && categoryIcons[c]) ? categoryIcons[c] : '🏢';
            const card = document.createElement('a');
            const catSlug = c.toLowerCase().replace(/ /g, '-');
            card.href = `${area.slug}.html?cat=${encodeURIComponent(catSlug)}`;
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
            pill.href = `${area.slug}.html?tag=${encodeURIComponent(t)}`;
            pill.className = 'tag-pill';
            pill.textContent = t;
            tagCloud.appendChild(pill);
        });
    }

    // Yritysnäytteet
    const featured = [...filtered].sort((a, b) => (b.karusellipaino || 0) - (a.karusellipaino || 0)).slice(0, 8);
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

    const regionMap = L.map('company-map').setView([area.lat, area.lon], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(regionMap);

    const markers = L.markerClusterGroup();
    companies.forEach(company => {
        if (company.lat && company.lon) {
            const marker = L.marker([parseFloat(company.lat), parseFloat(company.lon)]);
            marker.bindPopup(`<b>${company.nimi}</b><br>${company.kategoria}<br><br><a href="yrityskortti.html?id=${company.id}" class="btn-primary" style="color:white; padding: 5px 10px; font-size: 0.8rem;">Avaa kortti</a>`);
            markers.addLayer(marker);
        }
    });
    regionMap.addLayer(markers);
}

function fetchRegionNews(area) {
    const container = document.getElementById('blogger-feed');
    if (!container) return;

    if (area.bloggerId) {
        const blogId = area.bloggerId;
        const script = document.createElement('script');
        script.src = `https://www.blogger.com/feeds/${blogId}/posts/default?alt=json-in-script&callback=renderRegionBloggerFeed&max-results=5`;
        document.body.appendChild(script);
    } else {
        container.innerHTML = '<p>Alueen uutisia ei saatavilla tällä hetkellä.</p>';
    }
}

window.renderRegionBloggerFeed = function (data) {
    const container = document.getElementById('blogger-feed');
    if (!container) return;

    const entries = data.feed.entry || [];
    container.innerHTML = '';

    if (entries.length === 0) {
        container.innerHTML = '<p>Ei julkaisuja.</p>';
        return;
    }

    entries.slice(0, 10).forEach(entry => {
        const title = entry.title.$t;
        let content = entry.content ? entry.content.$t : (entry.summary ? entry.summary.$t : '');

        // Extract the first image from the content if it exists
        let imageUrl = '';
        const imgMatch = content.match(/<img[^>]+src="([^">]+)"/);
        if (imgMatch) {
            imageUrl = imgMatch[1];
        }

        // Strip HTML to get a clean description snippet
        let rawText = content.replace(/<[^>]*>?/gm, '').trim();
        // Optional: Limit length
        if (rawText.length > 200) {
            rawText = rawText.substring(0, 200) + '...';
        }

        const link = entry.link.find(l => l.rel === 'alternate')?.href || '#';
        const publishedDate = new Date(entry.published.$t);
        const dateStr = publishedDate.toLocaleDateString('fi-FI');

        const postEl = document.createElement('div');
        postEl.className = 'rss-item';
        postEl.innerHTML = `
            ${imageUrl ? '<img src="' + imageUrl + '" class="rss-item-image" loading="lazy" alt="Kuva uutiseen">' : ''}
            <div class="rss-meta"><span class="date">📅 ${dateStr}</span></div>
            <h3><a href="${link}" target="_blank">${title}</a></h3>
            <p class="description">${rawText}</p>
        `;

        container.appendChild(postEl);
    });
};
