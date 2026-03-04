let allCompanies = [];
let allRssItems = []; // Global storage for RSS content
let allLievestuoreItems = []; // Global storage for Lievestuore Blogger posts
let currentCompany = null;
let currentMediaIndex = 0;
let map = null;
let markers = null;

const welcomeCompany = {
    id: "welcome",
    nimi: "Tervetuloa Laukaan yrityshakuun",
    mainoslause: "Löydä paikalliset palvelut, yrittäjät ja elämykset.",
    esittely: "Tämä on Laukaan yrityshaku. Valitse haluamasi yritys listalta tai käytä hakua löytääksesi etsimäsi palvelut. Voit myös suodattaa yrityksiä toimialan mukaan.",
    osoite: "Laukaa",
    puhelin: "",
    email: "",
    nettisivu: "",
    karttalinkki: "",
    media: [
        { type: "image", url: "icons/icon-512.png" }
    ]
};

document.addEventListener('DOMContentLoaded', () => {
    // Sidebar Navigation Logic
    const hamburgerBtn = document.getElementById('hamburger-btn');
    const closeBtn = document.getElementById('close-sidebar-btn');
    const sidebarMenu = document.getElementById('sidebar-menu');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    const submenuToggles = document.querySelectorAll('.submenu-toggle');
    const sidebarLinks = document.querySelectorAll('.sidebar-link:not(.disabled-link)');

    function openSidebar() {
        if (sidebarMenu) sidebarMenu.classList.add('active');
        if (sidebarOverlay) sidebarOverlay.classList.add('active');
        document.body.style.overflow = 'hidden'; // Estetään taustan skrollaus
    }

    function closeSidebar() {
        if (sidebarMenu) sidebarMenu.classList.remove('active');
        if (sidebarOverlay) sidebarOverlay.classList.remove('active');
        document.body.style.overflow = ''; // Palautetaan skrollaus
    }

    if (hamburgerBtn) hamburgerBtn.addEventListener('click', openSidebar);
    if (closeBtn) closeBtn.addEventListener('click', closeSidebar);
    if (sidebarOverlay) sidebarOverlay.addEventListener('click', closeSidebar);

    // Accordion submenu functionality
    submenuToggles.forEach(toggle => {
        toggle.addEventListener('click', (e) => {
            e.preventDefault();
            const parentLi = toggle.parentElement;
            const submenu = parentLi.querySelector('.submenu');

            parentLi.classList.toggle('open');
            if (submenu) {
                submenu.classList.toggle('open');
            }
        });
    });

    // Sulje sidebar kun mitä tahansa linkkiä painetaan (tärkeää ankkurilinkeille)
    document.querySelectorAll('.sidebar-menu a').forEach(link => {
        link.addEventListener('click', (e) => {
            const href = link.getAttribute('href');
            // Jos linkki on pelkkä # tai submenu-toggle, älä sulje automaattisesti jos halutaan pitää auki
            if (href === '#' || link.classList.contains('submenu-toggle')) return;

            closeSidebar();
        });
    });

    // Tarkistetaan onko osoitteessa ankkuri ja korjataan skrollaus viiveellä (RSS-sisällön lataus siirtää sivua)
    handleInitialHashScroll();


    // Alustetaan feedit taustalla hakuun (myös etusivulla)
    initRSSFeeds();

    // Alustetaan yritysdata dynaamisesti (Kauppa-sivu tai -valikot)
    loadCompanyData();

    // Alustetaan haitari (Kauppa-sivu)
    if (document.getElementById('toggle-map-btn')) {
        initAccordion();
    }
});

function initAccordion() {
    const toggleBtn = document.getElementById('toggle-map-btn');
    const content = document.getElementById('map-accordion-content');

    if (toggleBtn && content) {
        toggleBtn.addEventListener('click', () => {
            const isOpen = content.classList.toggle('open');
            toggleBtn.querySelector('.icon').style.transform = isOpen ? 'rotate(180deg)' : 'rotate(0deg)';

            if (isOpen && map) {
                // Leaflet needs a resize trigger when shown in a previously hidden container
                setTimeout(() => {
                    map.invalidateSize();
                }, 300);
            }
        });
    }
}

const categoryColors = {
    'Autokorjaamot': '#4a5568',
    'Elintarvike': '#f6ad55',
    'Juhlatilat': '#ed64a6',
    'Kauneus ja terveys': '#ff4d94',
    'Koti-rakennus': '#718096',
    'Majoitus': '#667eea',
    'Matkailu & Elämykset': '#00cc66',
    'Ravinto & Vapaa-aika': '#ff9900',
    'Ruokailu': '#f56565',
    'Perinnematkailu & Juhlat': '#996633',
    'Muu': '#0056b3'
};

const categoryIcons = {
    'Autokorjaamot': '🔧',
    'Elintarvike': '🛒',
    'Juhlatilat': '🎊',
    'Kauneus ja terveys': '💄',
    'Koti-rakennus': '🏠',
    'Majoitus': '🏨',
    'Matkailu & Elämykset': '🌲',
    'Ravinto & Vapaa-aika': '🍽️',
    'Ruokailu': '🍕',
    'Perinnematkailu & Juhlat': '💒',
    'Muu': '🏢'
};

function initMap(companies) {
    if (map) return;
    if (!document.getElementById('company-map')) return;

    // Laukaa keskipiste
    map = L.map('company-map').setView([62.4128, 25.9477], 11);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    markers = L.markerClusterGroup();
    addMarkersToMap(companies);
    map.addLayer(markers);

    // Geolocation & Address Search Control
    const LocateControl = L.Control.extend({
        options: { position: 'topleft' },
        onAdd: function (map) {
            const container = L.DomUtil.create('div', 'leaflet-control-locate-wrapper');
            container.style.position = 'relative';
            container.style.display = 'flex';
            container.style.alignItems = 'center';

            const button = L.DomUtil.create('a', 'leaflet-control-locate leaflet-bar-part', container);
            button.innerHTML = '📍';
            button.href = '#';
            button.title = 'Näytä oma sijainti';

            // Address Search (Desktop)
            const searchContainer = L.DomUtil.create('div', 'map-address-search', container);
            searchContainer.innerHTML = `
                <input type="text" placeholder="Kirjoita osoite..." id="map-addr-input">
                <button id="map-addr-btn">HAE</button>
            `;

            L.DomEvent.on(button, 'click', function (e) {
                L.DomEvent.stopPropagation(e);
                L.DomEvent.preventDefault(e);
                map.locate({ setView: true, maxZoom: 15 });
            });

            const input = searchContainer.querySelector('#map-addr-input');
            const searchBtn = searchContainer.querySelector('#map-addr-btn');

            const handleSearch = (e) => {
                L.DomEvent.stopPropagation(e);
                const query = input.value;
                if (!query) return;

                fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + ', Laukaa')}`)
                    .then(res => res.json())
                    .then(data => {
                        if (data && data.length > 0) {
                            const result = data[0];
                            const latlng = [parseFloat(result.lat), parseFloat(result.lon)];
                            map.setView(latlng, 15);

                            if (userMarker) map.removeLayer(userMarker);
                            const userIcon = L.divIcon({
                                className: 'user-location-marker',
                                iconSize: [20, 20],
                                iconAnchor: [10, 10]
                            });
                            userMarker = L.marker(latlng, { icon: userIcon }).addTo(map);
                            userMarker.bindPopup(`Sijainti: ${query}`).openPopup();
                        } else {
                            alert("Osoitetta ei löytynyt.");
                        }
                    })
                    .catch(err => console.error("Geocoding error:", err));
            };

            L.DomEvent.on(searchBtn, 'click', handleSearch);
            L.DomEvent.on(input, 'keydown', (e) => {
                if (e.key === 'Enter') handleSearch(e);
            });

            return container;
        }
    });

    map.addControl(new LocateControl());

    let userMarker;
    map.on('locationfound', function (e) {
        if (userMarker) map.removeLayer(userMarker);

        const userIcon = L.divIcon({
            className: 'user-location-marker',
            iconSize: [20, 20],
            iconAnchor: [10, 10]
        });

        userMarker = L.marker(e.latlng, { icon: userIcon }).addTo(map);
        userMarker.bindPopup("Olet tässä").openPopup();
    });

    map.on('locationerror', function (e) {
        if (e.code === 1) { // PERMISSION_DENIED
            alert("Sijainti estetty. Varmista, että käytät sivua https-osoitteessa ja olet sallinut paikannuksen selaimen asetuksista.");
        } else {
            alert("Sijaintia ei voitu hakea: " + e.message);
        }
    });
}

function addMarkersToMap(companies) {
    markers.clearLayers();
    const bounds = [];
    let validMarkers = 0;

    companies.forEach(company => {
        if (company.lat && company.lon) {
            const lat = parseFloat(company.lat);
            const lon = parseFloat(company.lon);

            if (!isNaN(lat) && !isNaN(lon)) {
                validMarkers++;
                const color = categoryColors[company.kategoria] || '#0056b3';
                const markerHtml = `
                    <div style="
                        background-color: ${color};
                        width: 20px;
                        height: 20px;
                        border-radius: 50% 50% 50% 0;
                        transform: rotate(-45deg);
                        border: 2px solid white;
                        box-shadow: 0 2px 5px rgba(0,0,0,0.3);
                    "></div>
                `;

                const icon = L.divIcon({
                    html: markerHtml,
                    className: 'custom-marker',
                    iconSize: [20, 20],
                    iconAnchor: [10, 20],
                    popupAnchor: [0, -20]
                });

                const marker = L.marker([lat, lon], { icon: icon });

                marker.bindPopup(`
                    <div style="font-family: 'Outfit', sans-serif; min-width: 150px;">
                        <h4 style="margin: 0 0 5px 0; color: #0056b3;">${company.nimi}</h4>
                        <div style="font-size: 0.8rem; margin-bottom: 8px; color: #666;">${company.kategoria}</div>
                        <a href="yrityskortti.html?id=${company.id}${localStorage.getItem('selectedRegion') && localStorage.getItem('selectedRegion') !== 'all' ? `&region=${localStorage.getItem('selectedRegion')}` : ''}" style="
                            display: block;
                            background: #0056b3;
                            color: white;
                            text-decoration: none;
                            text-align: center;
                            padding: 5px 10px;
                            border-radius: 4px;
                            cursor: pointer;
                            width: 100%;
                            font-size: 0.8rem;
                            box-sizing: border-box;
                            margin-top: 5px;
                        ">Näytä tiedot</a>
                    </div>
                `);

                markers.addLayer(marker);
                bounds.push([lat, lon]);
            }
        }
    });

    console.log(`Kartta: Lisätty ${validMarkers} markeria ${companies.length} yrityksestä.`);

    const regionCoords = JSON.parse(localStorage.getItem('regionCoords'));
    const selectedRegion = localStorage.getItem('selectedRegion');

    if (selectedRegion && selectedRegion !== 'all' && regionCoords) {
        // Ensisijaisesti keskitys valittuun taajamaan
        map.setView([regionCoords.lat, regionCoords.lon], 13);

        // Jos on tuloksia, voidaan hieman hienosäätää jos ne ovat LÄHELLÄ valittua keskipistettä
        // Tämä estää sen, että kaukana olevat premium-yritykset vetävät kameran pois taajamasta
        const localBounds = bounds.filter(b => {
            const d = getHaversineDistance(regionCoords.lat, regionCoords.lon, b[0], b[1]);
            return d < 5; // KARTTAKESKITYS: Vain 5km säteellä olevat vaikuttavat zoomiin
        });

        if (localBounds.length > 0) {
            const latLngs = localBounds.map(b => L.latLng(b[0], b[1]));
            // Lisätään aina taajaman oma keskipiste rajoihin, niin kamera ei karkaa liian kauas
            latLngs.push(L.latLng(regionCoords.lat, regionCoords.lon));
            const b = L.latLngBounds(latLngs);
            map.fitBounds(b.pad(0.3));
            // Suojataan liian kauas tai liian lähelle menolta
            if (map.getZoom() < 12) map.setZoom(12);
            if (map.getZoom() > 15) map.setZoom(15);
        } else {
            // Jos ei ole osumia 5km säteellä, pidetään kamera tiukasti keskipisteessä
            map.setView([regionCoords.lat, regionCoords.lon], 13);
        }
    } else if (bounds.length > 0) {
        map.fitBounds(bounds, { padding: [50, 50] });
    } else {
        // Oletusnäkymä jos ei tuloksia eikä aluetta
        map.setView([62.4128, 25.9477], 11);
    }
}

function selectFromMap(companyId) {
    const company = allCompanies.find(c => c.id === companyId);
    if (company) {
        updateSpotlight(company);

        // Korostetaan katalogissa
        document.querySelectorAll('.catalog-item').forEach(el => {
            // Huom: ID-täsmäys on varmempi jos koodissa on useita saman nimisiä
            if (el.onclick.toString().includes(company.id) || el.textContent.includes(company.nimi)) {
                el.classList.add('active');
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else {
                el.classList.remove('active');
            }
        });

        // Skrollataan spotlightiin
        document.getElementById('company-spotlight').scrollIntoView({ behavior: 'smooth' });
    }
}

/**
 * Alustaa kaikki RSS-syötteet.
 */
function initRSSFeeds() {
    fetchRSSFeed('https://www.laukaa.fi/asukkaat/kategoria/uutiset/feed/', document.getElementById('news-container'), 'Ei uusia uutiset tällä hetkellä.', 'utf-8');
    fetchRSSFeed('https://laukaa.oncloudos.com/cgi/DREQUEST.PHP?page=rss/meetingitems&show=30', document.getElementById('decisions-container'), 'Ei uusia päätöksiä.', 'iso-8859-1');
    fetchRSSFeed('https://visitlaukaa.fi/evofeed', document.getElementById('events-container'), 'Ei tulevia tapahtumia.', 'utf-8');
    fetchRSSFeed('https://laukaa.trimblefeedback.com/eFeedback/API/Feed/rss', document.getElementById('feedback-container'), 'Ei uusia palautteita.', 'utf-8');
    // Ladataan Lievestuoreen Blogger-syöte taustalla hakua varten
    fetchLievestuoreItems();
}

/**
 * Hakee Lievestuoreen Blogger-uutiset taustalla hakua varten (ei renderöi näytölle).
 */
function fetchLievestuoreItems() {
    const blogId = '7148270853674792022';
    const script = document.createElement('script');
    script.src = `https://www.blogger.com/feeds/${blogId}/posts/default?alt=json-in-script&callback=storeLievestuoreItems&max-results=20`;
    script.onerror = () => console.warn('Lievestuoreen Blogger-syötteen haku epäonnistui.');
    document.body.appendChild(script);
}

// Globaali callback Blogger JSONP:lle – tallentaa tiedot hakuun
function storeLievestuoreItems(data) {
    const entries = data.feed.entry || [];
    allLievestuoreItems = [];
    entries.forEach(entry => {
        const title = entry.title.$t;
        let content = entry.content ? entry.content.$t : (entry.summary ? entry.summary.$t : '');
        let rawText = content.replace(/<[^>]*>?/gm, '').trim();
        if (rawText.length > 200) rawText = rawText.substring(0, 200) + '...';
        let link = '#';
        if (entry.link) {
            const altLink = entry.link.find(l => l.rel === 'alternate');
            if (altLink) link = altLink.href;
        }
        const publishedDate = new Date(entry.published.$t);
        const dateStr = publishedDate.toLocaleDateString('fi-FI');
        allLievestuoreItems.push({
            title,
            link,
            description: rawText,
            dateStr,
            type: 'Lievestuore',
            typeClass: 'lievestuore',
            isRss: true
        });
    });
    console.log(`Lievestuoreen uutisia ladattu hakuun: ${allLievestuoreItems.length}`);
}

/**
 * Yleiskäyttöinen RSS-haku merkistötuella ja kuvan poiminnalla.
 */
async function fetchRSSFeed(url, container, emptyMessage, encoding = 'utf-8') {
    // Determine type based on URL or container
    const isEvent = url.includes('evofeed');
    const typeLabel = isEvent ? 'Tapahtuma' : 'Tiedote';
    const typeClass = isEvent ? 'event' : 'news';

    // Proxies...
    // Use only the server‑side PHP proxy to avoid CORS issues
    const proxies = [
        `https://www.mediazoo.fi/laukaainfo-web/proxy.php?url=${encodeURIComponent(url)}&encoding=${encoding}`,
        `proxy.php?url=${encodeURIComponent(url)}&encoding=${encoding}`,
        `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
        `https://thingproxy.freeboard.io/fetch/${url}`
    ];

    let lastError = null;

    for (const proxyUrl of proxies) {
        try {
            console.log(`Yritetään hakea RSS: ${url} käyttäen proxya: ${proxyUrl}`);
            const response = await fetch(proxyUrl);
            if (!response.ok) throw new Error(`HTTP virhe: ${response.status}`);

            const buffer = await response.arrayBuffer();

            // TÄRKEÄÄ: Jos käytetään omaa proxy.php:tä, se on jo kääntänyt sisällön UTF-8:ksi.
            // Jos käytetään muita proxyja, TextDecoder käyttää alkuperäistä encoding-parametria.
            const decoding = proxyUrl.includes('proxy.php') ? 'utf-8' : encoding;
            const decoder = new TextDecoder(decoding);
            let text = decoder.decode(buffer);

            // Jos proxy on allorigins (/get), sisältö on kääritty JSONiin
            if (proxyUrl.includes('allorigins.win/get')) {
                try {
                    const jsonRes = JSON.parse(text);
                    if (jsonRes.contents) {
                        text = jsonRes.contents;
                    }
                } catch (e) {
                    console.warn('Allorigins JSON parsimisvirhe:', e);
                }
            }

            const parser = new DOMParser();
            const xml = parser.parseFromString(text, 'text/xml');

            // Jos XML-parsinta palauttaa virheen, jatketaan seuraavaan proxyyn
            if (xml.querySelector('parsererror')) {
                console.warn(`Parsintavirhe proxyn ${proxyUrl} kanssa, kokeillaan seuraavaa.`);
                continue;
            }

            const items = xml.querySelectorAll('item').length > 0 ? xml.querySelectorAll('item') : xml.querySelectorAll('entry');
            if (container) container.innerHTML = '';

            if (items.length === 0) {
                if (container) container.innerHTML = `<p>${emptyMessage}</p>`;
                return;
            }

            const parsedItems = [];
            const seenTitles = new Set();
            const now = new Date();
            const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const title = (item.querySelector('title')?.textContent || 'Ei otsikkoa').trim();
                const link = item.querySelector('link')?.textContent || item.querySelector('link')?.getAttribute('href') || '#';

                let dateObj = null;

                // Erityiskäsittely visitlaukaa.fi/evofeed -syötteelle, jossa tapahtuman aika on sisältötekstissä
                if (url.includes('evofeed')) {
                    const descText = item.querySelector('description')?.textContent || item.querySelector('content\\:encoded')?.textContent || '';
                    const startMatch = descText.match(/START:\s*[^,]*,\s*(\d{1,2})\s*([a-zäö]{3,6})\s*(\d{4})\s*(\d{2}:\d{2}:\d{2})/i);
                    if (startMatch) {
                        const day = parseInt(startMatch[1]);
                        const monthStr = startMatch[2].toLowerCase();
                        const year = parseInt(startMatch[3]);
                        const time = startMatch[4];
                        const months = {
                            'tammi': 0, 'helmi': 1, 'maali': 2, 'huhti': 3, 'touko': 4, 'kesä': 5,
                            'heinä': 6, 'elo': 7, 'syys': 8, 'loka': 9, 'marras': 10, 'joulu': 11
                        };
                        let monthIdx = -1;
                        for (const key in months) {
                            if (monthStr.startsWith(key)) { monthIdx = months[key]; break; }
                        }
                        if (monthIdx !== -1) {
                            const [h, m, s] = time.split(':').map(Number);
                            dateObj = new Date(year, monthIdx, day, h, m, s);
                        }
                    }
                }

                // Jos ei evofeed-erikoisaikaa, käytetään normaaleja tageja
                if (!dateObj) {
                    const dateNode = item.querySelector('pubDate') || item.querySelector('published') || item.querySelector('updated') || item.querySelector('dc\\:date');
                    if (dateNode) {
                        try {
                            dateObj = new Date(dateNode.textContent);
                        } catch (e) {
                            dateObj = null;
                        }
                    }
                }

                // Tapahtumien suodatus: näytetään vain tulevat (tai tämän päivän) tapahtumat
                // Tehdään tämä globaalisti isEvent-perusteella, jotta myös haku suodattaa vanhat
                if (isEvent && dateObj && !isNaN(dateObj)) {
                    if (dateObj < todayStart) continue;
                }

                // Estetään tuplat (vasta suodatuksen jälkeen)
                const dedupeKey = title.toLowerCase();
                if (seenTitles.has(dedupeKey)) continue;
                seenTitles.add(dedupeKey);

                let imageUrl = '';
                const enclosure = item.querySelector('enclosure');
                const mediaContent = item.querySelector('content[url]') || item.querySelector('thumbnail');
                if (enclosure && enclosure.getAttribute('type')?.includes('image')) imageUrl = enclosure.getAttribute('url');
                else if (mediaContent) imageUrl = mediaContent.getAttribute('url');
                else {
                    const desc = item.querySelector('description')?.textContent || '';
                    const imgMatch = desc.match(/<img[^>]+src="([^">]+)"/);
                    if (imgMatch) imageUrl = imgMatch[1];
                }

                const descriptionNode = item.querySelector('description') || item.querySelector('summary') || item.querySelector('content');
                let description = descriptionNode ? descriptionNode.textContent : '';
                description = description.replace(/<[^>]*>/g, ' ').trim();
                if (url.includes('evofeed')) description = description.replace(/START:.*END:.*(?= )/g, '').trim();
                description = description.substring(0, 120) + (description.length > 120 ? '...' : '');

                const rssItem = {
                    title,
                    link,
                    date: dateObj,
                    imageUrl,
                    description,
                    dateStr: dateObj && !isNaN(dateObj) ? dateObj.toLocaleDateString('fi-FI') : '',
                    type: typeLabel,
                    typeClass: typeClass,
                    isRss: true
                };

                parsedItems.push(rssItem);

                // Add to global storage for search, avoid duplicates
                if (!allRssItems.find(i => i.link === rssItem.link)) {
                    allRssItems.push(rssItem);
                }
            }

            // After parsing ALL items, we can handle the display if container exists
            if (!container) return; // Background collection only

            // Järjestetään tapahtumat päivämäärän mukaan (lähin ensin)
            if (container?.id === 'events-container') {
                parsedItems.sort((a, b) => {
                    const aValid = a.date && !isNaN(a.date);
                    const bValid = b.date && !isNaN(b.date);

                    if (!aValid && !bValid) return 0;
                    if (!aValid) return 1;
                    if (!bValid) return -1;

                    return a.date.getTime() - b.date.getTime();
                });
            }

            const limit = 5;
            const finalItems = parsedItems.slice(0, limit);

            for (const item of finalItems) {
                const rssElement = document.createElement('div');
                rssElement.className = 'rss-item';

                let analysisLink = '';
                // Jos kyseessä on päätöksenteko ja otsikko täsmää helmikuun 2026 kunnanhallitukseen
                if (container?.id === 'decisions-container') {
                    const titleLower = item.title.toLowerCase();
                    if (titleLower.includes('kunnanhallitus') && (titleLower.includes('helmikuu 2026') || titleLower.includes('23.2.2026'))) {
                        analysisLink = `
                            <div style="margin-top: 10px;">
                                <a href="asiahaku.html?cat=kunnanhallitus&issue=2026-02" class="btn-primary" style="font-size: 0.85rem; padding: 6px 14px; background: #28a745; display: inline-flex; align-items: center; gap: 6px;">
                                    <span>🔍</span> Lue AI-analyysi
                                </a>
                            </div>`;
                    }
                }

                rssElement.innerHTML = `
                    ${item.imageUrl ? `<img src="${item.imageUrl}" class="rss-item-image" loading="lazy">` : ''}
                    <div class="rss-meta"><span class="date">📅 ${item.dateStr}</span> <span class="news-badge ${item.typeClass}">${item.type}</span></div>
                    <h3><a href="${item.link}" target="_blank">${item.title}</a></h3>
                    <p class="description">${item.description}</p>
                    ${analysisLink}
                `;
                if (container) container.appendChild(rssElement);
            }
            return; // Onnistui!
        } catch (error) {
            console.warn(`Proxy ${proxyUrl} epäonnistui:`, error);
            lastError = error;
        }
    }

    console.error(`Kaikki RSS-haut epäonnistuivat: ${url}`, lastError);
    if (container) {
        container.innerHTML = `<p>Tietojen lataus epäonnistui (CORS/Network error).</p>`;
    }
}

/**
 * Korjaa skrollauspositiota jos sivulle tultaessa on ankkurilinkki (#-loppuinen URL).
 * RSS-syötteet ja muut dynaamiset sisällöt siirtävät sivun elementtejä latautuessaan,
 * joten alkuperäinen selain-skrollaus osuu usein väärään kohtaan.
 */
function handleInitialHashScroll() {
    const hash = window.location.hash;
    if (hash && hash.length > 1) {
        // Odotetaan että RSS-feedit ovat todennäköisesti latautuneet (tai ainakin yritys alkanut)
        setTimeout(() => {
            const element = document.querySelector(hash);
            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }, 1500); // 1.5 sekunnin viive yleensä riittää RSS-renderöintiin
    }
}

/**
 * Yritysdata ja katalogi
 */
async function loadCompanyData() {
    // Käytetään palvelimen proxyä, joka hoitaa CORS-ongelmat ja datan muunnoksen
    const dataSourceUrl = 'https://www.mediazoo.fi/laukaainfo-web/get_companies.php';
    console.log('Yritetään hakea yritystietoja:', dataSourceUrl);
    try {
        const response = await fetch(dataSourceUrl + '?t=' + Date.now());
        console.log('Vastaus saatu:', response.status, response.statusText);

        const json = await response.json();
        // New response format: {results: [...], total: N, page: N, limit: N}
        allCompanies = Array.isArray(json) ? json : (json.results || []);
        console.log('Yrityksiiä ladattu:', allCompanies.length);

        // Normalize URLs
        const baseUrl = dataSourceUrl.substring(0, dataSourceUrl.lastIndexOf('/') + 1);
        allCompanies.forEach(company => {
            if (company.media) {
                company.media.forEach(item => {
                    if (item.url && !item.url.startsWith('http') && !item.url.startsWith('//')) {
                        item.url = baseUrl + item.url;
                    }
                });
            }
            if (company.logo && !company.logo.startsWith('http') && !company.logo.startsWith('//') && company.logo !== '-') {
                company.logo = baseUrl + company.logo;
            }
        });

        initCompanyCatalog();
        initMap(allCompanies);
        initCategories(allCompanies);

        // URL-parametrin (haku) tarkistus
        const queryParams = new URLSearchParams(window.location.search);
        const urlParam = queryParams.get('haku') || queryParams.get('yritys');
        const hashParam = window.location.hash;

        let searchKeyword = urlParam;
        if (!searchKeyword && hashParam && hashParam.startsWith('#haku-')) {
            searchKeyword = hashParam.replace('#haku-', '').replace(/-/g, ' ');
        }

        let selectedCompany = null;
        if (searchKeyword) {
            const lowerKeyword = searchKeyword.toLowerCase();
            // Etsitään yrityksen nimestä tai url-ystävällisestä muodosta
            selectedCompany = allCompanies.find(c => {
                if (!c.nimi) return false;
                const nameMatch = c.nimi.toLowerCase().includes(lowerKeyword);
                const urlFriendlyName = c.nimi.toLowerCase().replace(/[^a-z0-9äö]/g, '').includes(lowerKeyword.replace(/[^a-z0-9äö]/g, ''));
                return nameMatch || urlFriendlyName;
            });
        }

        if (selectedCompany) {
            console.log('Avataan yritys URL-parametrin perusteella:', selectedCompany.nimi);
            updateSpotlight(selectedCompany);

            // Asetetaan sana hakukenttään
            const searchInput = document.getElementById('company-search');
            if (searchInput) {
                searchInput.value = selectedCompany.nimi;
                filterCatalog();

                // Korostetaan katalogissa
                document.querySelectorAll('.catalog-item').forEach(el => {
                    if (el.querySelector('h4').textContent === selectedCompany.nimi) {
                        el.classList.add('active');
                        setTimeout(() => {
                            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }, 500);
                    }
                });
            }

            // Skrollataan automaattisesti kohtaan
            setTimeout(() => {
                const spotlight = document.getElementById('company-spotlight');
                if (spotlight) spotlight.scrollIntoView({ behavior: 'smooth' });
            }, 800);
        } else {
            console.log('Päivitetään spotlight avaustilanteella');
            updateSpotlight(welcomeCompany);
        }
    } catch (error) {
        console.error('Virhe yritysdatan latauksessa:', error);
        document.body.innerHTML += '<div style="background:red;color:white;padding:1rem;">Virhe yritysdatan latauksessa. Tarkista PHP-tiedostot palvelimella.</div>';
    }
}


let activeSuggestionIndex = -1;
let filteredSuggestions = [];

function initCompanyCatalog() {
    const searchInput = document.getElementById('company-search');
    const categorySelect = document.getElementById('category-filter');
    const suggestionsList = document.getElementById('search-suggestions');

    // Jos ollaan sivulla jossa ei ole hakukenttiä, lopetetaan
    if (!searchInput) return;

    const categories = [...new Set(allCompanies.map(c => c.kategoria))].sort();
    if (categorySelect) {
        categories.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat;
            option.textContent = cat;
            categorySelect.appendChild(option);
        });
    }

    const isHomePage = !!document.getElementById('homepage-categories');

    searchInput.addEventListener('input', () => {
        filterCatalog();
        if (!isHomePage) {
            showSuggestions();
        }
    });

    searchInput.addEventListener('keydown', handleSearchKeydown);

    const rssToggle = document.getElementById('include-rss');
    if (rssToggle) {
        rssToggle.addEventListener('change', () => {
            filterCatalog();
        });
    }

    const lievestuoreToggle = document.getElementById('include-lievestuore');
    if (lievestuoreToggle) {
        lievestuoreToggle.addEventListener('change', () => {
            filterCatalog();
        });
    }

    if (categorySelect) {
        categorySelect.addEventListener('change', () => {
            filterCatalog();
        });
    }

    const searchBtn = document.getElementById('search-btn');
    if (searchBtn) {
        searchBtn.addEventListener('click', () => {
            filterCatalog();
        });
    }

    // Piilotetaan ehdotukset kun klikataan muualle
    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !suggestionsList.contains(e.target)) {
            suggestionsList.style.display = 'none';
        }
    });

    if (!isHomePage) {
        renderCatalog(allCompanies);
    } else {
        initRegionFilter();
    }
}

function initRegionFilter() {
    const regionSelect = document.getElementById('region-select');
    if (!regionSelect) return;

    const villageCoords = {
        'laukaa': { lat: 62.41407, lon: 25.95194 },
        'leppavesi': { lat: 62.326386, lon: 25.840924 },
        'lievestuore': { lat: 62.2625, lon: 26.2039 },
        'vehnia': { lat: 62.4381, lon: 25.6825 },
        'vihtavuori': { lat: 62.370563, lon: 25.902297 }
    };

    // Restore from URL first, then localStorage (case-insensitive)
    const params = new URLSearchParams(window.location.search);
    const urlRegion = params.get('region');
    const rawSavedRegion = urlRegion || localStorage.getItem('selectedRegion') || 'all';
    const savedRegion = rawSavedRegion.toLowerCase();

    if (villageCoords[savedRegion] || savedRegion === 'all') {
        regionSelect.value = savedRegion;
        if (savedRegion !== 'all') {
            localStorage.setItem('regionCoords', JSON.stringify(villageCoords[savedRegion]));
            localStorage.setItem('selectedRegion', savedRegion);
        }
    }

    regionSelect.addEventListener('change', () => {
        const val = regionSelect.value;
        const url = new URL(window.location.href);

        localStorage.setItem('selectedRegion', val);

        if (val === 'all') {
            localStorage.removeItem('regionCoords');
            url.searchParams.delete('region');
        } else {
            localStorage.setItem('regionCoords', JSON.stringify(villageCoords[val]));
            url.searchParams.set('region', val);
        }

        // Päivitä URL ilman sivun latausta
        window.history.pushState({}, '', url);

        // Päivitä haku ja kartta heti kun alue muuttuu
        filterCatalog();

        // Päivitä myös kategoriat (linkit), jotta niissä säilyy uusi alue
        if (typeof allCompanies !== 'undefined' && allCompanies.length > 0) {
            initCategories(allCompanies);
        }
    });

    // Sync when user navigates back/forward
    window.addEventListener('popstate', () => {
        const currentParams = new URLSearchParams(window.location.search);
        const newReg = currentParams.get('region') || 'all';
        regionSelect.value = newReg;
        localStorage.setItem('selectedRegion', newReg);
        if (newReg === 'all') {
            localStorage.removeItem('regionCoords');
        } else if (villageCoords[newReg]) {
            localStorage.setItem('regionCoords', JSON.stringify(villageCoords[newReg]));
        }
        filterCatalog();
        if (typeof allCompanies !== 'undefined' && allCompanies.length > 0) {
            initCategories(allCompanies);
        }
    });
}

function filterCatalog() {
    const searchEl = document.getElementById('company-search');
    if (!searchEl) return;

    const searchTerm = (searchEl.value || '').toLowerCase().trim();
    const categoryEl = document.getElementById('category-filter');
    const category = categoryEl ? categoryEl.value : 'all';

    const regionCoords = JSON.parse(localStorage.getItem('regionCoords'));
    const selectedRegion = localStorage.getItem('selectedRegion');

    const matches = allCompanies.map(company => {
        const name = (company.nimi || '').toLowerCase();
        const tagline = (company.mainoslause || '').toLowerCase();
        const desc = (company.esittely || '').toLowerCase();
        const cat = (company.kategoria || '').toLowerCase();

        let score = 0;
        if (name.includes(searchTerm)) score += 100;
        if (tagline.includes(searchTerm)) score += 50;
        // Only search description for longer terms to avoid noise
        if (searchTerm.length > 1 && desc.includes(searchTerm)) score += 10;

        // Exact prefix match in name gets a boost
        if (name.startsWith(searchTerm)) score += 150;

        // Treat empty search as a match-all if a region or category is selected
        if (searchTerm.length === 0 && (selectedRegion !== 'all' || category !== 'all')) {
            score = 1;
        }

        const matchesCategory = category === 'all' || company.kategoria === category;
        const isPremium = company.tyyppi === 'paid' || company.taso === 'premium';

        // Regional filtering
        let matchesRegion = true;
        if (selectedRegion && selectedRegion !== 'all' && regionCoords) {
            if (isPremium) {
                matchesRegion = true; // Premium bypasses region filter radius
            } else if (company.lat && company.lon) {
                const dist = getHaversineDistance(regionCoords.lat, regionCoords.lon, parseFloat(company.lat), parseFloat(company.lon));
                matchesRegion = dist <= 13; // 13km radius
            } else {
                matchesRegion = false; // No coords and not premium -> hidden when region selected
            }
        }

        if (selectedRegion && selectedRegion !== 'all' && regionCoords && company.lat && company.lon) {
            const dist = getHaversineDistance(regionCoords.lat, regionCoords.lon, parseFloat(company.lat), parseFloat(company.lon));
            company.distanceText = dist < 1 ? `${Math.round(dist * 1000)} m` : `${dist.toFixed(1)} km`;
            company.distanceValue = dist;
        } else {
            company.distanceText = null;
            company.distanceValue = null;
        }

        return { company, score, matchesCategory, matchesRegion, isPremium };
    }).filter(m => m.score > 0 && m.matchesCategory && m.matchesRegion);

    // Sort: Premium first, then by score, then by distance (if available), then alphabetically
    matches.sort((a, b) => {
        if (a.isPremium && !b.isPremium) return -1;
        if (!a.isPremium && b.isPremium) return 1;

        if (b.score !== a.score) return b.score - a.score;

        if (a.company.distanceValue !== null && b.company.distanceValue !== null) {
            return a.company.distanceValue - b.company.distanceValue;
        }

        return (a.company.nimi || '').localeCompare(b.company.nimi || '', 'fi');
    });

    const filtered = matches.map(m => m.company);

    // RSS Hybrid Search
    const includeRss = document.getElementById('include-rss')?.checked;
    const includeLievestuore = document.getElementById('include-lievestuore')?.checked;
    let combinedResults = [...filtered];

    if (includeRss && searchTerm.length > 0) {
        const rssMatches = allRssItems.filter(item => {
            return item.title.toLowerCase().includes(searchTerm) ||
                item.description.toLowerCase().includes(searchTerm);
        });
        combinedResults = [...combinedResults, ...rssMatches];
    }

    if (includeLievestuore && searchTerm.length > 0) {
        const lievestuoreMatches = allLievestuoreItems.filter(item => {
            return item.title.toLowerCase().includes(searchTerm) ||
                item.description.toLowerCase().includes(searchTerm);
        });
        combinedResults = [...combinedResults, ...lievestuoreMatches];
    }

    filteredSuggestions = filtered.slice(0, 8); // Keep suggestions mainly business-centric or extend later

    // On the homepage, hide results if search is empty
    const isHomePage = !!document.getElementById('homepage-categories');
    if (isHomePage && searchTerm.length === 0) {
        renderCatalog([]);
    } else {
        renderCatalog(combinedResults);
    }

    // Päivitetään myös kartta vastaamaan filtteriä
    if (map && markers) {
        addMarkersToMap(filtered);
    }
}

function initCategories(companies) {
    const categories = [...new Set(companies.map(c => c.kategoria))].sort();

    renderNavCategories(categories);
    renderHomepageCategories(categories);
}

function renderNavCategories(categories) {
    const navMenu = document.querySelector('.nav-item a[href="index.html"] + .dropdown-menu');
    const sidebarMenu = document.getElementById('sidebar-categories');

    if (navMenu) {
        // Säilytetään "Lisää yritys"
        const firstItem = navMenu.querySelector('li');
        navMenu.innerHTML = '';
        if (firstItem) navMenu.appendChild(firstItem);

        categories.forEach(cat => {
            const li = document.createElement('li');
            const region = localStorage.getItem('selectedRegion');
            const regionParam = (region && region !== 'all') ? `&region=${region}` : '';
            li.innerHTML = `<a href="kategoria.html?cat=${encodeURIComponent(cat)}${regionParam}">${cat}</a>`;
            navMenu.appendChild(li);
        });
    }

    if (sidebarMenu) {
        sidebarMenu.innerHTML = '';
        categories.forEach(cat => {
            const li = document.createElement('li');
            const region = localStorage.getItem('selectedRegion');
            const regionParam = (region && region !== 'all') ? `&region=${region}` : '';
            li.innerHTML = `<a href="kategoria.html?cat=${encodeURIComponent(cat)}${regionParam}" class="sidebar-link">${cat}</a>`;
            sidebarMenu.appendChild(li);
        });
    }
}

function renderHomepageCategories(categories) {
    const container = document.getElementById('homepage-categories');
    if (!container) return;

    container.innerHTML = '';

    categories.forEach(cat => {
        // Robust lookup: try direct match, then lowercase, then slug-like
        const cleanCat = cat.trim();
        const icon = categoryIcons[cleanCat] ||
            categoryIcons[cleanCat.replace('-', ' ')] ||
            categoryIcons[cleanCat.replace(' ', '-')] ||
            Object.entries(categoryIcons).find(([k]) => k.toLowerCase() === cleanCat.toLowerCase())?.[1] ||
            '🏢';
        const card = document.createElement('a');
        const region = localStorage.getItem('selectedRegion');
        const regionParam = (region && region !== 'all') ? `&region=${region}` : '';
        card.href = `kategoria.html?cat=${encodeURIComponent(cat)}${regionParam}`;
        card.className = 'category-card';
        card.innerHTML = `
            <span class="cat-icon">${icon}</span>
            <h3>${cat}</h3>
        `;
        container.appendChild(card);
    });
}

function showSuggestions() {
    const suggestionsList = document.getElementById('search-suggestions');
    const searchInput = document.getElementById('company-search');
    const searchTerm = searchInput.value.trim().toLowerCase();
    const includeRss = document.getElementById('include-rss')?.checked;

    if (searchTerm.length < 1) {
        suggestionsList.style.display = 'none';
        return;
    }

    // Get suggestions from businesses with scoring
    let businessMatches = allCompanies.map(c => {
        const name = (c.nimi || '').toLowerCase();
        let score = 0;
        if (name.startsWith(searchTerm)) score += 200;
        else if (name.includes(searchTerm)) score += 100;

        const isPremium = c.tyyppi === 'paid' || c.taso === 'premium';
        return { company: c, score, isPremium };
    }).filter(m => m.score > 0);

    businessMatches.sort((a, b) => {
        if (a.isPremium && !b.isPremium) return -1;
        if (!a.isPremium && b.isPremium) return 1;
        return b.score - a.score || (a.company.nimi || '').localeCompare(b.company.nimi || '', 'fi');
    });

    let suggestions = businessMatches.map(m => m.company).slice(0, 6);

    // Add RSS suggestions if enabled
    if (includeRss) {
        const rssSuggestions = allRssItems
            .filter(i => i.title.toLowerCase().includes(searchTerm))
            .slice(0, 4);
        suggestions = [...suggestions, ...rssSuggestions];
    }

    // Add Lievestuore suggestions if enabled
    const includeLievestuore = document.getElementById('include-lievestuore')?.checked;
    if (includeLievestuore) {
        const lievestuoreSuggestions = allLievestuoreItems
            .filter(i => i.title.toLowerCase().includes(searchTerm))
            .slice(0, 4);
        suggestions = [...suggestions, ...lievestuoreSuggestions];
    }

    filteredSuggestions = suggestions; // Update global filteredSuggestions for keyboard nav

    if (suggestions.length === 0) {
        suggestionsList.style.display = 'none';
        return;
    }

    suggestionsList.innerHTML = '';
    activeSuggestionIndex = -1;

    suggestions.forEach((item, index) => {
        const li = document.createElement('li');
        const isRss = item.isRss;
        const name = isRss ? item.title : item.nimi;
        const cat = isRss ? item.type : item.kategoria;

        // Highlight search term
        const regex = new RegExp(`(${searchTerm})`, 'gi');
        const highlightedName = name.replace(regex, '<mark>$1</mark>');

        li.innerHTML = `
            <span>${isRss ? '📢 ' : ''}${highlightedName}</span>
            <span class="suggestion-cat">${cat}</span>
        `;

        li.onclick = () => {
            selectSuggestion(item);
        };

        suggestionsList.appendChild(li);
    });

    suggestionsList.style.display = 'block';
}

function handleSearchKeydown(e) {
    const suggestionsList = document.getElementById('search-suggestions');
    const items = suggestionsList.querySelectorAll('li');

    if (suggestionsList.style.display === 'none') return;

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeSuggestionIndex = (activeSuggestionIndex + 1) % items.length;
        updateActiveSuggestion(items);
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeSuggestionIndex = (activeSuggestionIndex - 1 + items.length) % items.length;
        updateActiveSuggestion(items);
    } else if (e.key === 'Enter') {
        if (activeSuggestionIndex > -1) {
            e.preventDefault();
            selectSuggestion(filteredSuggestions[activeSuggestionIndex]);
        }
    } else if (e.key === 'Escape') {
        suggestionsList.style.display = 'none';
    }
}

function updateActiveSuggestion(items) {
    items.forEach((item, index) => {
        item.classList.toggle('selected', index === activeSuggestionIndex);
        if (index === activeSuggestionIndex) {
            item.scrollIntoView({ block: 'nearest' });
        }
    });
}

function selectSuggestion(item) {
    const searchInput = document.getElementById('company-search');
    const suggestionsList = document.getElementById('search-suggestions');

    if (suggestionsList) suggestionsList.style.display = 'none';

    if (item.isRss) {
        window.open(item.link, '_blank');
    } else {
        if (searchInput) searchInput.value = item.nimi;
        // Ohjataan yrityskorttiin alueen kanssa
        const region = localStorage.getItem('selectedRegion');
        const regionParam = (region && region !== 'all') ? `&region=${region}` : '';
        window.location.href = `yrityskortti.html?id=${item.id}${regionParam}`;
    }
}

function renderCatalog(companies) {
    const list = document.getElementById('catalog-list');
    if (!list) return; // Katalogi ei ole näkyvissä tällä sivulla

    list.innerHTML = '';
    const searchTerm = document.getElementById('company-search')?.value.trim();
    const isHomePage = !!document.getElementById('homepage-categories');

    if (companies.length === 0) {
        if (isHomePage && (!searchTerm || searchTerm.length === 0)) {
            // Keep it empty so CSS :empty hides it
            return;
        }
        list.innerHTML = '<p style="padding: 1rem; opacity: 0.6;">Ei löytynyt osumia.</p>';
        return;
    }
    companies.forEach(itemData => {
        const item = document.createElement('div');
        item.className = 'catalog-item';

        if (itemData.isRss) {
            // RSS Item Rendering
            item.classList.add('rss-result');
            item.innerHTML = `
                <span class="news-badge ${itemData.typeClass}">${itemData.type}</span>
                <h4>${itemData.title}</h4>
                <div style="font-size: 0.8rem; opacity: 0.7; margin-top: 5px;">📅 ${itemData.dateStr}</div>
                <div style="font-size: 0.85rem; margin-top: 5px;">Linkki lähteeseen ↗</div>
            `;
            item.onclick = () => {
                window.open(itemData.link, '_blank');
            };
        } else {
            // Business Item Rendering
            const company = itemData;
            const hasSpotlight = document.getElementById('company-spotlight');

            if (currentCompany && currentCompany.id === company.id) item.classList.add('active');

            const distHtml = company.distanceText ? `<span class="dist-badge">🚗 ${company.distanceText}</span>` : '';
            item.innerHTML = `
                <div class="catalog-item-header">
                    <h4>${company.nimi}</h4>
                    ${distHtml}
                </div>
                <span class="cat-tag">${company.kategoria}</span>
            `;

            item.onclick = () => {
                if (hasSpotlight) {
                    document.querySelectorAll('.catalog-item').forEach(el => el.classList.remove('active'));
                    item.classList.add('active');
                    updateSpotlight(company);
                } else {
                    // No spotlight (likely homepage), go to details page
                    const region = localStorage.getItem('selectedRegion');
                    const regionParam = (region && region !== 'all') ? `&region=${region}` : '';
                    window.location.href = `yrityskortti.html?id=${company.id}${regionParam}`;
                }
            };
        }
        list.appendChild(item);
    });
}

/**
 * Spotlight ja Slider
 */
function updateSpotlight(company) {
    if (!company) return;
    console.log('Päivitetään spotlight:', company.nimi, 'Mediaa:', company.media ? company.media.length : 0);
    currentCompany = company;
    currentMediaIndex = 0;

    const nameEl = document.getElementById('spotlight-name');
    const taglineEl = document.getElementById('spotlight-tagline');
    const descEl = document.getElementById('spotlight-desc');
    const detailsEl = document.getElementById('spotlight-details');

    if (nameEl) nameEl.textContent = company.nimi;
    if (taglineEl) taglineEl.textContent = company.mainoslause;
    if (descEl) descEl.textContent = company.esittely || company.mainoslause;
    if (detailsEl) {
        detailsEl.innerHTML = `
            <div>📍 ${company.osoite}</div>
            <div>📞 ${company.puhelin || '-'}</div>
            <div>📧 ${company.email || '-'}</div>
        `;
    }
    const actionsEl = document.getElementById('spotlight-actions');
    if (actionsEl) {
        let actionButtons = '';
        if (company.nettisivu) {
            actionButtons += `<a href="${company.nettisivu}" target="_blank" class="btn-primary">🌐 Kotisivut</a>`;
        }
        if (company.karttalinkki) {
            actionButtons += `<a href="${company.karttalinkki}" target="_blank" class="btn-primary" style="background: #28a745;">📍 Kartta</a>`;
        }
        actionsEl.innerHTML = actionButtons;
    }

    renderMedia(0);
    renderSliderNav();
    preloadCompanyMedia(company);
}

/**
 * Esiladataan yrityksen kaikki kuvat taustalla
 */
function preloadCompanyMedia(company) {
    if (!company.media || company.media.length <= 1) return;

    console.log('Aloitetaan median esilataus yritykselle:', company.nimi);

    // Käydään läpi kaikki media paitsi ensimmäinen (joka ladataan heti)
    company.media.forEach((item, index) => {
        if (index === 0) return;

        if (item.type === 'image') {
            const img = new Image();
            img.src = item.url;
            img.onload = () => console.log('Esiladattu kuva:', item.url);
            img.onerror = () => console.warn('Esilataus epäonnistui:', item.url);
        }
    });
}

function renderMedia(index) {
    const container = document.getElementById('spotlight-media');
    if (!container) return; // Guard for missing element

    let mediaList = currentCompany.media || [];
    console.log('Piirretään media indeksiin:', index, 'Medialistasta:', mediaList);

    let isFallback = false;
    if (mediaList.length === 0) {
        mediaList = [{ type: 'image', url: 'icons/icon-512.png' }];
        isFallback = true;
    }

    const item = mediaList[index];
    if (item.type === 'video') {
        container.innerHTML = `<iframe src="${item.url}" allowfullscreen></iframe>`;
    } else {
        // Show loading state
        container.innerHTML = '<div class="placeholder-media">Ladataan kuvaa...</div>';

        const img = new Image();
        console.log('Ladataan kuvaa osoitteesta:', item.url);

        // Lisätään JS-tason aikakatkaisu (45 sekuntia)
        const loadTimeout = setTimeout(() => {
            if (!img.complete || img.naturalWidth === 0) {
                console.warn('Kuvan lataus aikakatkaistiin (45s):', item.url);
                img.src = ""; // Pysäytetään lataus
                container.innerHTML = `<div class="placeholder-media">Kuvan lataus kestää liian kauan tiedoston koosta tai palvelimesta johtuen<br><small style="font-size:0.75em; opacity: 0.7;">Varmista tieoston oikeudet Drivessa.</small></div>`;
            }
        }, 45000);

        // Tapahtumankuuntelijat AINA ennen src-asetusta
        img.onload = () => {
            clearTimeout(loadTimeout);
            console.log('Kuva ladattu onnistuneesti:', item.url, 'Koko:', img.width, 'x', img.height);
            container.innerHTML = '';
            container.appendChild(img);
        };

        img.onerror = () => {
            clearTimeout(loadTimeout);
            console.error('Kuvan lataus epäonnistui:', item.url);
            console.warn('Varmista, että PHP-välityspalvelin (get_image.php) toimii ja Drive-tiedosto on julkinen.');
            container.innerHTML = `<div class="placeholder-media">Kuvaa ei voitu ladata<br><small style="font-size:0.7em">${item.url}</small></div>`;
        };

        // Asetetaan tyylit ja lopuksi lataus käyntiin
        img.alt = currentCompany.nimi;

        if (currentCompany.id === 'welcome' || isFallback) {
            img.style.objectFit = 'contain';
            img.style.backgroundColor = 'white';
            img.style.padding = '20px';
            img.style.width = '100%';
            img.style.height = '100%';
        }

        img.src = item.url;
    }
}

function renderSliderNav() {
    const nav = document.getElementById('slider-nav');
    if (!nav) return; // Guard for missing element

    const mediaList = currentCompany.media || [];
    nav.innerHTML = '';

    if (mediaList.length <= 1) return;

    mediaList.forEach((_, index) => {
        const dot = document.createElement('div');
        dot.className = `slider-dot ${index === currentMediaIndex ? 'active' : ''}`;
        dot.onclick = () => {
            currentMediaIndex = index;
            renderMedia(index);
            updateSliderDots();
        };
        nav.appendChild(dot);
    });
}

function updateSliderDots() {
    document.querySelectorAll('.slider-dot').forEach((dot, index) => {
        dot.classList.toggle('active', index === currentMediaIndex);
    });
}

// PWA Install Logic
let deferredPrompt;
const installBtn = document.getElementById('pwa-install-btn');

window.addEventListener('beforeinstallprompt', (e) => {
    // Estetään oletusikkuna, jotta voimme näyttää oman nappimme
    e.preventDefault();
    deferredPrompt = e;
    // Näytetään asennusnappi
    if (installBtn) {
        installBtn.style.display = 'inline-block';
    }
});

if (installBtn) {
    installBtn.addEventListener('click', async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            console.log(`Käyttäjä valitsi: ${outcome}`);
            deferredPrompt = null;
            installBtn.style.display = 'none';
        }
    });
}

function getHaversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // km
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function deg2rad(deg) {
    return deg * (Math.PI / 180);
}
