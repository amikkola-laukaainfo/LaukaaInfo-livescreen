let allCompanies = [];
let allRssItems = []; // Global storage for RSS content
let allGeoEvents = []; // Global storage for event coordinates
let currentCompany = null;
let currentMediaIndex = 0;
let map = null;
let markers = null;
let isHomePage = false; // Global flag for homepage context
let userCoords = null; // Globaali sijainti

const FEATURED_LINKS = [
    { name: 'Ravintolat', url: 'laukaan-ravintolat.html', icon: '🍴' },
    { name: 'Autohuollot', url: 'laukaan-autohuollot.html', icon: '🔧' },
    { name: 'Parturit & Kauneus', url: 'laukaan-parturit-ja-kauneus.html', icon: '💇' }
];

function slugify(text) {
    if (!text) return "";
    return text.toString().toLowerCase().trim()
        .replace(/\s+/g, '-')
        .replace(/[äÄàáâãäå]/g, 'a')
        .replace(/[öÖòóôõöø]/g, 'o')
        .replace(/[åÅ]/g, 'a')
        .replace(/[^\w-]/g, '')
        .replace(/--+/g, '-')
        .replace(/^-+/, '')
        .replace(/-+$/, '');
}

function normalizeForSearch(text) {
    if (!text) return "";
    return text.toString().toLowerCase()
        .replace(/[äÄàáâãäå]/g, 'a')
        .replace(/[öÖòóôõöø]/g, 'o')
        .replace(/[åÅ]/g, 'a');
}

/**
 * Korjaa Facebook-linkit WebView-yhteensopiviksi.
 * Muuntaa fb:// linkit tavallisiksi https linkeiksi, jotta WebView ei heitä erroria.
 */
function fixFacebookLink(url) {
    if (!url || typeof url !== 'string') return url;
    let fixedUrl = url.trim();
    if (fixedUrl.startsWith('fb://')) {
        fixedUrl = fixedUrl.replace('fb://group/', 'https://www.facebook.com/groups/')
                           .replace('fb://page/', 'https://www.facebook.com/')
                           .replace('fb://profile/', 'https://www.facebook.com/profile.php?id=')
                           .replace('fb://', 'https://www.facebook.com/');
        console.log("Facebook-linkki korjattu:", url, "->", fixedUrl);
    }
    return fixedUrl;
}

// Globaali klikkauskuuntelija Facebook-linkeille
document.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (link && link.href) {
        const url = link.href;
        if (url.startsWith('fb://')) {
            link.href = fixFacebookLink(url);
        }
    }
}, true);

const welcomeCompany = {
    id: "welcome",
    nimi: "Tervetuloa Laukaan yrityshakuun",
    mainoslause: "Mitä haluat tietää, löytää tai tehdä Laukaassa?",
    esittely: "Hae yrityksiä, tapahtumia ja tiedotteita Laukaasta. Etsi esim. parturi, kahvila, taajama Laukaassa.",
    osoite: "Laukaa",
    puhelin: "",
    email: "",
    nettisivu: "",
    karttalinkki: "",
    media: [
        { type: "image", url: "icons/icon-512.png" }
    ]
};

document.addEventListener('DOMContentLoaded', async () => {
    isHomePage = !!document.getElementById('homepage-categories');
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


    // Ladataan tapahtumien paikkatieto ENSIN, jotta se on käytössä kun RSS-feedit latautuvat
    await loadGeoEvents();

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
        userCoords = e.latlng;
        // Aktivoidaan tapahtumien haku automaattisesti jos sijainti löytyy
        const rssCheckbox = document.getElementById('include-rss');
        if (rssCheckbox) rssCheckbox.checked = true;

        // Päivitetään haku nähdäksemme lähimmät heti
        filterCatalog();

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
        const lat = parseFloat(company.lat);
        const lon = parseFloat(company.lon || company.lng);

        if (!isNaN(lat) && !isNaN(lon)) {
            validMarkers++;
            
            let markerHtml = '';
            let popupContent = '';
            let isPro = false;
            let isPremiumPkg = false;
            
            if (company.isRss) {
                // Tapahtuman merkki
                markerHtml = `
                    <div style="
                        background-color: #ff9900;
                        width: 24px;
                        height: 24px;
                        border-radius: 50%;
                        border: 2px solid white;
                        box-shadow: 0 2px 5px rgba(0,0,0,0.3);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 14px;
                    ">🎉</div>
                `;
                
                const routeUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
                
                popupContent = `
                    <div style="font-family: 'Outfit', sans-serif; min-width: 180px;">
                        <span class="news-badge event" style="font-size: 0.7rem; margin-bottom: 5px; display: inline-block;">TAPAHTUMA</span>
                        <h4 style="margin: 0 0 5px 0; color: #cc7a00;">${company.title}</h4>
                        <div style="font-size: 0.8rem; margin-bottom: 8px; color: #666;">📅 ${company.dateStr}</div>
                        <div style="display: flex; flex-direction: column; gap: 5px;">
                            <a href="${company.link}" target="_blank" style="
                                display: block;
                                background: #cc7a00;
                                color: white;
                                text-decoration: none;
                                text-align: center;
                                padding: 6px 10px;
                                border-radius: 4px;
                                cursor: pointer;
                                width: 100%;
                                font-size: 0.8rem;
                                box-sizing: border-box;
                            ">Lue lisää</a>
                            <a href="${routeUrl}" target="_blank" style="
                                display: block;
                                background: #28a745;
                                color: white;
                                text-decoration: none;
                                text-align: center;
                                padding: 6px 10px;
                                border-radius: 4px;
                                cursor: pointer;
                                width: 100%;
                                font-size: 0.8rem;
                                box-sizing: border-box;
                            ">🚗 Reittiohjeet</a>
                        </div>
                    </div>
                `;
            } else {
                // Yrityksen merkki
                const pkgStr = (company.package || company.paketti || '').toLowerCase();
                const typeStr = (company.tyyppi || company.type || '').toLowerCase();
                isPro = pkgStr.includes('pro') || typeStr.includes('pro');
                isPremiumPkg = pkgStr.includes('premium') || typeStr.includes('premium');
                
                const baseColor = categoryColors[company.kategoria] || '#0056b3';
                const markerColor = isPro ? '#ffd700' : (isPremiumPkg ? '#ff4d4d' : baseColor);
                const markerSize = (isPro || isPremiumPkg) ? '26px' : '20px';

                if (isPremiumPkg) {
                    markerHtml = `
                        <div class="premium-marker-inner pulsing-premium">
                            <div class="marker-dot"></div>
                        </div>
                    `;
                } else if (isPro) {
                    markerHtml = `
                        <div class="pro-marker-inner pulsing-pro">
                            <div class="marker-dot"></div>
                        </div>
                    `;
                } else {
                    markerHtml = `
                        <div style="
                            background-color: ${markerColor};
                            width: ${markerSize};
                            height: ${markerSize};
                            border-radius: 50% 50% 50% 0;
                            transform: rotate(-45deg);
                            border: 2px solid white;
                            box-shadow: 0 2px 5px rgba(0,0,0,0.3);
                        "></div>
                    `;
                }

                const mapsUrl = company.karttalinkki && company.karttalinkki !== '-' 
                    ? company.karttalinkki 
                    : `https://www.google.com/maps?q=${company.lat},${company.lon}`;

                const isPremium = company.tyyppi === 'maksu' || company.tyyppi === 'paid';
                const isInDist = window.location.pathname.includes('/dist/') || 
                                 window.location.hostname === 'laukaainfo.fi' || 
                                 window.location.hostname.includes('github.io');
                const distPrefix = isInDist ? '' : 'dist/';
                
                const cardUrl = isPremium 
                    ? `${distPrefix}yritys/${slugify(company.nimi)}.html`
                    : `yrityskortti.html?id=${slugify(company.nimi)}${localStorage.getItem('selectedRegion') && localStorage.getItem('selectedRegion') !== 'all' ? `&region=${localStorage.getItem('selectedRegion')}` : ''}`;

                popupContent = `
                    <div style="font-family: 'Outfit', sans-serif; min-width: 150px;">
                        <h4 style="margin: 0 0 5px 0; color: #0056b3;">${company.nimi}</h4>
                        <div style="font-size: 0.8rem; margin-bottom: 8px; color: #666; display: flex; align-items: center; gap: 5px;">
                            ${company.kategoria}
                            ${(function() {
                                let icons = '';
                                const combined = `${company.tags || ''},${company.palvelutapa || ''}`.toLowerCase();
                                if (combined.includes('toimipiste')) icons += '🏢';
                                if (combined.includes('kotikaynti') || combined.includes('kotikäynti')) icons += '🏠';
                                if (combined.includes('etapalvelu') || combined.includes('etäpalvelu')) icons += '💻';
                                if (combined.includes('toimitus')) icons += '🚚';
                                return icons ? `<span style="margin-left:5px;">${icons}</span>` : '';
                            })()}
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 5px;">
                            <a href="${cardUrl}" style="
                                display: block;
                                background: #0056b3;
                                color: white;
                                text-decoration: none;
                                text-align: center;
                                padding: 6px 10px;
                                border-radius: 4px;
                                cursor: pointer;
                                width: 100%;
                                font-size: 0.8rem;
                                box-sizing: border-box;
                            ">Näytä tiedot</a>
                            <a href="${mapsUrl}" target="_blank" style="
                                display: block;
                                background: #28a745;
                                color: white;
                                text-decoration: none;
                                text-align: center;
                                padding: 6px 10px;
                                border-radius: 4px;
                                cursor: pointer;
                                width: 100%;
                                font-size: 0.8rem;
                                box-sizing: border-box;
                            ">📍 Googlessa</a>
                        </div>
                    </div>
                `;
            }

            const icon = L.divIcon({
                html: markerHtml,
                className: `custom-marker ${isPro ? 'is-pro' : ''} ${isPremiumPkg ? 'is-premium' : ''}`,
                iconSize: [30, 30],
                iconAnchor: [15, 30],
                popupAnchor: [0, -30]
            });

            const marker = L.marker([lat, lon], { icon: icon });
            
            // Integrate New Media Modal
            marker.on('click', function(e) {
                if (window.LkiModal && typeof LkiModal.open === 'function') {
                    // Slight delay to prevent immediate closing if Leaflet handles clicks weirdly
                    setTimeout(() => LkiModal.open(company), 50);
                }
            });

            marker.bindPopup(popupContent);
            markers.addLayer(marker);
            bounds.push([lat, lon]);
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
 * Ladataan tapahtumien geo-tiedot JSON-tiedostosta.
 */
async function loadGeoEvents() {
    try {
        const response = await fetch('tapahtumat_geo.json');
        if (!response.ok) throw new Error('Tapahtumien paikkatietoja ei löytynyt.');
        allGeoEvents = await response.json();
        console.log('Geo-tapahtumat ladattu:', allGeoEvents.length);
    } catch (error) {
        console.warn('Virhe geo-tapahtumien latauksessa:', error);
    }
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

/**
 * Tallentaa Lievestuoreen Blogger-uutiset globaaliin RSS-muistiin.
 */
window.storeLievestuoreItems = function(data) {
    if (!data || !data.feed || !data.feed.entry) return;
    
    data.feed.entry.forEach(entry => {
        const title = entry.title.$t;
        const link = entry.link.find(l => l.rel === 'alternate').href;
        const dateStr = entry.published.$t;
        const date = new Date(dateStr);
        
        // Pick first image
        let imageUrl = '';
        if (entry.content && entry.content.$t) {
            const imgMatch = entry.content.$t.match(/<img[^>]+src="([^">]+)"/);
            if (imgMatch) imageUrl = imgMatch[1];
        }
        
        const item = {
            title,
            link,
            date,
            dateStr: date.toLocaleDateString('fi-FI'),
            imageUrl,
            description: (entry.summary ? entry.summary.$t : (entry.content ? entry.content.$t.replace(/<[^>]*>/g, '').substring(0, 120) : '')),
            type: 'Tiedote',
            typeClass: 'news',
            isRss: true
        };
        
        if (!allRssItems.find(i => i.link === item.link)) {
            allRssItems.push(item);
        }
    });

    console.log('Lievestuoreen uutiset tallennettu hakuun:', data.feed.entry.length);
};


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
                    // Yritetään mäpätä paikkatieto jos se löytyy
                    if (isEvent) {
                        // 1. Ensisijaisesti täsmällinen URL- tai nimi-mätsäys
                        let geo = allGeoEvents.find(ge => ge.url === rssItem.link || ge.nimi === rssItem.title);
                        
                        // 2. Toissijaisesti hieman joustavampi nimi-mätsäys (ilman välilyöntejä ja pienellä kirjoitettuna)
                        if (!geo && rssItem.title) {
                            const normalize = (s) => (s || "").toLowerCase().replace(/[^a-z0-9äö]/g, "").trim();
                            const normalizedTitle = normalize(rssItem.title);
                            geo = allGeoEvents.find(ge => normalize(ge.nimi) === normalizedTitle);
                        }
                        
                        if (geo) {
                            rssItem.lat = geo.lat;
                            rssItem.lon = geo.lng; // Normalisoidaan 'lon' muotoon kuten yrityksillä
                            rssItem.paikka = geo.paikka;
                        }
                    }
                    
                    allRssItems.push(rssItem);
                    // Update search results if RSS checkbox is active
                    if (document.getElementById('include-rss')?.checked) {
                        filterCatalog(!isHomePage);
                    }
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
                    } else if (titleLower.includes('kunnanvaltuusto') && (titleLower.includes('maaliskuu 2026') || titleLower.includes('2.3.2026'))) {
                        analysisLink = `
                            <div style="margin-top: 10px;">
                                <a href="asiahaku.html?cat=kunnanvaltuusto&issue=2026-03-v" class="btn-primary" style="font-size: 0.85rem; padding: 6px 14px; background: #28a745; display: inline-flex; align-items: center; gap: 6px;">
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
    const dataSourceUrl = 'https://www.mediazoo.fi/laukaainfo-web/get_companies.php';
    console.log('Yritetään hakea yritystietoja:', dataSourceUrl);
    try {
        let json = null;
        const cached = sessionStorage.getItem('laukaainfo_companies_slim');
        const cacheTime = sessionStorage.getItem('laukaainfo_companies_slim_time');
        
        if (cached && cacheTime && (Date.now() - parseInt(cacheTime) < 1800000)) { // 30 min cache
            json = JSON.parse(cached);
            console.log('Käytetään välimuistissa olevaa yritysdataa');
        } else {
            try {
                const response = await fetch(dataSourceUrl + '?t=' + Date.now());
                console.log('Vastaus saatu:', response.status);
                if (!response.ok) throw new Error('HTTP Error: ' + response.status);
                json = await response.json();
                sessionStorage.setItem('laukaainfo_companies_slim', JSON.stringify(json));
                sessionStorage.setItem('laukaainfo_companies_slim_time', Date.now().toString());
            } catch (networkError) {
                console.warn('Verkkovirhe tai rate limit (429) rajapinnassa, käytetään paikallista varadataa:', networkError);
                const isSubdir = window.location.pathname.includes('/yritys/');
                const prefix = isSubdir ? '../' : './';
                const localRes = await fetch(prefix + 'companies_data.json');
                json = await localRes.json();
            }
        }

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

            // Process tags and slugs (stored in allCompanies)
            company.tags = (company.tags || '').toLowerCase();
            company.alue_slug = (company.alue_slug || '').toLowerCase();
            company.kunta_slug = (company.kunta_slug || '').toLowerCase();
        });

        initCompanyCatalog();
        initMap(allCompanies);
        initCategories(allCompanies);
        initShareGenerator(allCompanies);

        // URL-parametrin (haku) tarkistus
        const queryParams = new URLSearchParams(window.location.search);
        const urlParam = queryParams.get('haku') || queryParams.get('yritys') || queryParams.get('open');
        const freeQuery = queryParams.get('q'); // Vapaa tekstihaku: ?q=hakutermi
        const hashParam = window.location.hash;

        let searchKeyword = urlParam;
        if (!searchKeyword && hashParam && hashParam.startsWith('#haku-')) {
            searchKeyword = hashParam.replace('#haku-', '').replace(/-/g, ' ');
        }

        // Vapaa tekstihaku ?q= — täyttää hakukentän ja suorittaa haun automaattisesti
        const freeSearchInput = document.getElementById('company-search');
        if (freeQuery && freeSearchInput) {
            console.log('Vapaa tekstihaku URL-parametrista (?q=):', freeQuery);
            freeSearchInput.value = freeQuery;
            // Simuloidaan Hae-painikkeen klikkaus jotta kaikki logiikka ajautuu
            const searchBtn = document.getElementById('search-btn');
            if (searchBtn) {
                searchBtn.click();
            } else {
                filterCatalog();
            }
            updateSpotlight(welcomeCompany);
            setTimeout(() => {
                const searchSection = document.getElementById('kauppa-search');
                if (searchSection) searchSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 300);

        } else {
            let selectedCompany = null;
            if (searchKeyword) {
                const lowerKeyword = searchKeyword.toLowerCase().trim();
                console.log('[Deep-link] Yritetään avata yritystä hakusanalla:', lowerKeyword);
                
                // Etsitään yrityksen nimestä, url-ystävällisestä muodosta tai slugista
                selectedCompany = allCompanies.find(c => {
                    if (!c.nimi) return false;
                    const name = c.nimi.toLowerCase();
                    const slug = slugify(c.nimi);
                    const k_slug = slugify(lowerKeyword);
                    
                    const isExactMatch = name === lowerKeyword || slug === lowerKeyword;
                    const isSlugMatch = slug === k_slug;
                    const isPartialMatch = name.includes(lowerKeyword);
                    
                    return isExactMatch || isSlugMatch || isPartialMatch;
                });
            }

            if (selectedCompany) {
                console.log('[Deep-link] Löydetty yritys:', selectedCompany.nimi);
                updateSpotlight(selectedCompany);

                // AVATAAN MYÖS LkiModal jos ?open= parametri on käytössä
                const openParam = queryParams.get('open');
                if (openParam && window.LkiModal) {
                    // Pieni viive varmistaa, että kartta ja markkerit ovat täysin valmiina
                    setTimeout(() => {
                        console.log('[Deep-link] Avataan LkiModal ja keskitetään kartta yritykselle:', selectedCompany.nimi);
                        
                        // Keskitytään karttaan
                        if (map && selectedCompany.lat && selectedCompany.lon) {
                            map.setView([selectedCompany.lat, selectedCompany.lon], 15);
                        }
                        
                        window.LkiModal.open(selectedCompany);
                    }, 1200); // Hieman kasvatettu viive varmuuden vuoksi
                }

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

                // Skrollataan automaattisesti kohtaan (jos ei avattu modaalia)
                if (!openParam) {
                    setTimeout(() => {
                        const spotlight = document.getElementById('company-spotlight');
                        if (spotlight) spotlight.scrollIntoView({ behavior: 'smooth' });
                    }, 800);
                }
            } else {
                if (searchKeyword) {
                    console.warn('[Deep-link] Yritystä ei löytynyt hakusanalla:', searchKeyword);
                }
                console.log('Päivitetään spotlight avaustilanteella');
                updateSpotlight(welcomeCompany);
            }
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

    searchInput.addEventListener('input', () => {
        filterCatalog(!isHomePage); // On homepage, only update map, don't render list while typing
        showSuggestions();
    });

    searchInput.addEventListener('keydown', handleSearchKeydown);

    const rssToggle = document.getElementById('include-rss');
    if (rssToggle) {
        rssToggle.addEventListener('change', () => {
            filterCatalog();
        });
    }

    if (categorySelect) {
        categorySelect.addEventListener('change', () => {
            filterCatalog();
        });
    }

    const serviceMethodSelect = document.getElementById('service-method-select');
    if (serviceMethodSelect) {
        serviceMethodSelect.addEventListener('change', () => {
            filterCatalog();
        });
    }

    const searchBtn = document.getElementById('search-btn');
    if (searchBtn) {
        searchBtn.addEventListener('click', () => {
            const query = searchInput.value.trim();
            if (tryRedirectToRegion(query)) return;
            filterCatalog();
        });
    }

    const mapSearchInput = document.getElementById('map-local-search');
    if (mapSearchInput) {
        mapSearchInput.addEventListener('input', () => {
            filterMapMarkers(mapSearchInput.value);
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

function filterCatalog(renderList = true) {
    const searchEl = document.getElementById('company-search');
    if (!searchEl) return;

    const searchTerm = (searchEl.value || '').toLowerCase().trim();
    const categoryEl = document.getElementById('category-filter');
    const category = categoryEl ? categoryEl.value : 'all';

    const serviceMethodEl = document.getElementById('service-method-select');
    const serviceMethod = serviceMethodEl ? serviceMethodEl.value : 'all';

    const regionCoords = JSON.parse(localStorage.getItem('regionCoords'));
    const selectedRegion = localStorage.getItem('selectedRegion');

    const matches = allCompanies.map(company => {
        const name = (company.nimi || '').toLowerCase();
        const tagline = (company.mainoslause || '').toLowerCase();
        const desc = (company.esittely || '').toLowerCase();
        const searchableDesc = desc;
        const cat = (company.kategoria || '').toLowerCase();

        let score = 0;
        if (name.includes(searchTerm)) score += 100;
        if (tagline.includes(searchTerm)) score += 50;

        // Only search description for longer terms to avoid noise
        if (searchTerm.length > 1 && searchableDesc.includes(searchTerm)) score += 10;

        // Tag search logic (replaces hashtag parsing)
        const combinedTags = normalizeForSearch(`${company.tags || ''},${company.palvelutapa || ''}`);
        const normalizedSearch = normalizeForSearch(searchTerm);
        if (searchTerm.length > 1 && combinedTags) {
            const tags = combinedTags.split(',').map(t => t.trim());
            if (tags.some(tag => tag.includes(normalizedSearch))) {
                score += 120; // High priority for tag and service method matches
            }
        }

        // Exact prefix match in name gets a boost
        if (name.startsWith(searchTerm)) score += 150;

        let matchesServiceMethod = true;
        if (serviceMethod !== 'all') {
            matchesServiceMethod = combinedTags.includes(serviceMethod);
        }

        // Treat empty search as a match-all if a region or category is selected
        if (searchTerm.length === 0 && (selectedRegion !== 'all' || category !== 'all' || serviceMethod !== 'all')) {
            score = 1;
        }

        const matchesCategory = category === 'all' || company.kategoria === category;
        
        // Yhtenäinen premium-määritys
        const isPremium = company.tyyppi === 'paid' || company.tyyppi === 'maksu' || company.taso === 'premium';

        // Regional filtering & Distance calculation
        let matchesRegion = true;
        
        // Ensisijainen vertailupiste etäisyydelle: käyttäjän GPS. Toissijainen: valittu alue.
        const refLat = userCoords ? userCoords.lat : (regionCoords ? regionCoords.lat : null);
        const refLon = userCoords ? userCoords.lng : (regionCoords ? regionCoords.lon : null);

        if (refLat && refLon && company.lat && company.lon) {
            const dist = getHaversineDistance(refLat, refLon, parseFloat(company.lat), parseFloat(company.lon));
            company.distanceText = dist < 1 ? `${Math.round(dist * 1000)} m` : `${dist.toFixed(1)} km`;
            company.distanceValue = dist;
            
            // Aluesuodatus (vain jos ei ole premium)
            if (selectedRegion && selectedRegion !== 'all' && !isPremium) {
                matchesRegion = dist <= 13; // 13km radius
            }
        } else {
            company.distanceText = null;
            company.distanceValue = null;
            if (selectedRegion && selectedRegion !== 'all' && !isPremium) {
                matchesRegion = false;
            }
        }

        return { company, score, matchesCategory, matchesRegion, matchesServiceMethod, isPremium };
    }).filter(m => m.score > 0 && m.matchesCategory && m.matchesRegion && m.matchesServiceMethod);

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
    const villages = [
        { id: 'laukaa', name: 'Laukaa kk' },
        { id: 'leppavesi', name: 'Leppävesi' },
        { id: 'lievestuore', name: 'Lievestuore' },
        { id: 'vehnia', name: 'Vehniä' },
        { id: 'vihtavuori', name: 'Vihtavuori' }
    ];
    const regionMatches = searchTerm.length > 1 ? villages.filter(v =>
        v.name.toLowerCase().includes(searchTerm) || v.id.includes(searchTerm)
    ).map(v => ({ ...v, isRegion: true })) : [];

    let combinedResults = [...regionMatches, ...filtered];

    // RSS Hybrid Search
    // Sallitaan tapahtumien haku ilman hakusanaa, jos sijainti (userCoords) on tiedossa
    if (includeRss && (searchTerm.length > 0 || userCoords)) {
        let rssMatches = allRssItems.filter(item => {
            // Jos hakusana puuttuu, näytetään vain ne tapahtumat joilla on koordinaatit
            if (searchTerm.length === 0) return (item.lat && item.lon);
            
            const titleMatch = item.title.toLowerCase().includes(searchTerm);
            const descMatch = (item.description && item.description.toLowerCase().includes(searchTerm));
            
            // Priorisoidaan nimen alkuosan täsmäävyyttä (boost) if needed elsewhere, 
            // mutta tässä palautetaan true jos jompikumpi täsmää.
            return titleMatch || descMatch;
        });

        // Lisätään score dynaamisesti (boostataan nimen alkuosan täsmäävyyttä)
        rssMatches.forEach(item => {
            const title = (item.title || "").toLowerCase();
            item.score = 0;
            if (title.startsWith(searchTerm)) item.score += 200; // Korkea priority
            else if (title.includes(searchTerm)) item.score += 100;
        });
        
        // Järjestetään RSS-osumat (jos on useita)
        rssMatches.sort((a, b) => b.score - a.score);

        // Lasketaan etäisyys RSS-tapahtumille jos mahdollista
        const refLat = userCoords ? userCoords.lat : (regionCoords ? regionCoords.lat : null);
        const refLon = userCoords ? userCoords.lng : (regionCoords ? regionCoords.lon : null);

        if (refLat && refLon) {
            rssMatches.forEach(item => {
                if (item.lat && item.lon) {
                    const dist = getHaversineDistance(refLat, refLon, parseFloat(item.lat), parseFloat(item.lon));
                    item.distanceValue = dist;
                    item.distanceText = dist < 1 ? `${Math.round(dist * 1000)} m` : `${dist.toFixed(1)} km`;
                }
            });
            // Järjestetään tapahtumat etäisyyden mukaan
            rssMatches.sort((a, b) => (a.distanceValue || 999) - (b.distanceValue || 999));
            
            // Merkitään lähin tapahtuma jos se on riittävän lähellä (esim. < 50km)
            if (rssMatches.length > 0 && rssMatches[0].distanceValue < 50) {
                rssMatches[0].isNearest = true;
            }
        }

        combinedResults = [...combinedResults, ...rssMatches];
    }

    filteredSuggestions = filtered.slice(0, 8); // Keep suggestions mainly business-centric or extend later

    // On the homepage, hide results if search is empty AND no user coordinates are found
    if (isHomePage && searchTerm.length === 0 && !userCoords) {
        renderCatalog([]);
    } else if (renderList) {
        renderCatalog(combinedResults);
    }

    // Päivitetään myös kartta vastaamaan filtteriä
    // Näytetään merkkejä jos: ei olla etusivulla TAI on hakusana TAI on käyttäjän sijainti
    if (map && markers && (!isHomePage || searchTerm.length > 0 || userCoords)) {
        // Suodatetaan vain ne kohteet joilla on koordinaatit
        const mapItems = combinedResults.filter(item => (item.lat && (item.lon || item.lng)));
        addMarkersToMap(mapItems);
    }
}

function filterMapMarkers(term) {
    const searchTerm = (term || '').toLowerCase().trim();
    if (searchTerm.length === 0) {
        addMarkersToMap(allCompanies);
        return;
    }

    const matches = allCompanies.filter(company => {
        const name = (company.nimi || '').toLowerCase();
        const cat = (company.kategoria || '').toLowerCase();
        const tags = (company.tags || '').toLowerCase();
        const ptapa = (company.palvelutapa || '').toLowerCase();
        return name.includes(searchTerm) || cat.includes(searchTerm) || tags.includes(searchTerm) || ptapa.includes(searchTerm);
    });

    if (map && markers) {
        addMarkersToMap(matches);
    }
}

function initCategories(companies) {
    const categories = [...new Set(companies.map(c => c.kategoria))].sort();

    renderNavCategories(categories);
    renderHomepageCategories(categories);
}

function renderNavCategories(categories) {
    const navFeatured = document.getElementById("nav-featured");
    const sidebarFeatured = document.getElementById('sidebar-featured');
    const navMenu = document.getElementById("nav-categories");
    const sidebarMenu = document.getElementById('sidebar-categories');

    // Populate Featured Menu (Suosituimmat)
    const featuredHtml = FEATURED_LINKS.map(link => `
        <li><a href="${link.url}" style="font-weight: 600; color: var(--primary-blue);">${link.icon} ${link.name}</a></li>
    `).join('');

    if (navFeatured) navFeatured.innerHTML = featuredHtml;
    if (sidebarFeatured) sidebarFeatured.innerHTML = featuredHtml.replace(/style="[^"]*"/g, 'class="sidebar-link"');

    // Populate Regular Categories
    const headerHtml = `<li><span style="display: block; padding: 0.5rem 1rem; font-size: 0.8em; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--primary-blue); opacity: 0.7; cursor: default; border-bottom: 1px solid rgba(0,0,0,0.05); margin-bottom: 0.2rem;">Koko Laukaa</span></li>`;

    const categoriesHtml = categories.map(cat => `
        <li><a href="kategoria.html?cat=${encodeURIComponent(cat)}&region=all">${cat}</a></li>
    `).join('');

    if (navMenu) navMenu.innerHTML = headerHtml + categoriesHtml;
    if (sidebarMenu) {
        sidebarMenu.innerHTML = headerHtml + categories.map(cat => `
            <li><a href="kategoria.html?cat=${encodeURIComponent(cat)}&region=all" class="sidebar-link">${cat}</a></li>
        `).join('');
    }
}

function renderHomepageCategories(categories) {
    const container = document.getElementById('homepage-categories');
    if (!container) return;

    // Luetaan valittu alue dropdownista tai localStoragesta
    const regionEl = document.getElementById('region-select');
    const selectedRegion = (regionEl ? regionEl.value : null)
        || localStorage.getItem('selectedRegion')
        || 'all';

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
        card.className = 'category-card';
        
        if (cleanCat === 'Ruokailu') {
            card.href = 'laukaan-ravintolat.html';
        } else if (cleanCat === 'Autokorjaamot') {
            card.href = 'laukaan-autohuollot.html';
        } else if (cleanCat === 'Hyvinvointi ja terveys') {
            card.href = 'laukaan-parturit-ja-kauneus.html';
        } else {
            card.href = `kategoria.html?cat=${encodeURIComponent(cat)}&region=${encodeURIComponent(selectedRegion)}`;
        }
        
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
    if (!searchInput) return;

    const searchTerm = searchInput.value.trim().toLowerCase();
    if (searchTerm.length < 1) {
        suggestionsList.style.display = 'none';
        return;
    }

    const villages = [
        { id: 'laukaa', name: 'Laukaa kk' },
        { id: 'leppavesi', name: 'Leppävesi' },
        { id: 'lievestuore', name: 'Lievestuore' },
        { id: 'vehnia', name: 'Vehniä' },
        { id: 'vihtavuori', name: 'Vihtavuori' }
    ];

    let suggestions = [];

    // 1. Check for Region matches
    const regionMatches = villages.filter(v => v.name.toLowerCase().includes(searchTerm) || v.id.includes(searchTerm));
    regionMatches.forEach(v => {
        suggestions.push({ type: 'region', id: v.id, name: v.name });
    });

    // Determine current region context for categories/tags
    // If user typed a region name already, use that as context
    const contextRegion = villages.find(v => searchTerm.includes(v.name.toLowerCase()) || searchTerm.includes(v.id));
    const companiesInContext = contextRegion
        ? allCompanies.filter(c => (c.alue_slug || '').toLowerCase() === contextRegion.id)
        : allCompanies;

    // 2. Collect Categories and Tags from context
    const categories = [...new Set(companiesInContext.map(c => c.kategoria))].filter(Boolean);
    const tags = [...new Set(companiesInContext.flatMap(c => {
        const combined = `${c.tags || ''},${c.palvelutapa || ''}`;
        return combined.split(',').map(t => t.trim()).filter(Boolean);
    }))];

    // 3. Match Categories
    const catMatches = categories
        .filter(c => c.toLowerCase().includes(searchTerm))
        .map(c => ({ type: 'category', name: c, region: contextRegion?.id }));

    // 4. Match Tags
    const tagMatches = tags
        .filter(t => t.toLowerCase().includes(searchTerm))
        .map(t => ({ type: 'tag', name: t, region: contextRegion?.id }));

    // Merge and alphabetize categories and tags
    let mixedCatTags = [...catMatches, ...tagMatches].sort((a, b) => a.name.localeCompare(b.name, 'fi'));
    suggestions = [...suggestions, ...mixedCatTags];

    // 5. Match Businesses (only if term is longer or no other major matches)
    if (searchTerm.length >= 2) {
        const busMatches = allCompanies
            .filter(c => c.nimi.toLowerCase().includes(searchTerm))
            .map(c => ({ type: 'business', company: c }))
            .slice(0, 5);
        suggestions = [...suggestions, ...busMatches];
    }

    // 6. Match RSS if checkbox is checked
    const includeRss = document.getElementById('include-rss')?.checked;
    if (includeRss && searchTerm.length > 0) {
        const rssMatches = allRssItems.filter(item =>
            item.title.toLowerCase().includes(searchTerm) ||
            (item.description && item.description.toLowerCase().includes(searchTerm))
        ).map(item => ({ ...item, type: 'rss' }));
        suggestions = [...suggestions, ...rssMatches.slice(0, 3)];
    }

    filteredSuggestions = suggestions.slice(0, 10);

    if (filteredSuggestions.length === 0) {
        suggestionsList.style.display = 'none';
        return;
    }

    suggestionsList.innerHTML = '';
    activeSuggestionIndex = -1;

    filteredSuggestions.forEach((item, index) => {
        const li = document.createElement('li');
        let html = '';
        let label = '';
        let badge = '';

        if (item.type === 'region') {
            label = item.name;
            badge = '<span class="suggestion-region">Alue</span>';
        } else if (item.type === 'category') {
            label = item.name;
            badge = `<span class="suggestion-cat">Kategoria${item.region ? ' (' + item.region + ')' : ''}</span>`;
        } else if (item.type === 'tag') {
            label = `#${item.name}`;
            badge = `<span class="suggestion-tag">Tunniste${item.region ? ' (' + item.region + ')' : ''}</span>`;
        } else if (item.type === 'business') {
            label = item.company.nimi;
            badge = `<span class="suggestion-cat">${item.company.kategoria}</span>`;
        } else if (item.type === 'rss') {
            label = item.title;
            badge = `<span class="suggestion-tag">${item.type}</span>`;
        }

        // Highlight
        const regex = new RegExp(`(${searchTerm})`, 'gi');
        const highlightedLabel = label.replace(regex, '<mark>$1</mark>');

        li.innerHTML = `<div class="search-suggestion-main"><span class="search-suggestion-label">${highlightedLabel}</span>${badge}</div>`;
        li.onclick = (e) => {
            // If user clicked a tag pill, don't trigger the main li click
            if (e.target.classList.contains('suggestion-tag-pill')) return;
            selectSuggestion(item);
        };

        if (item.type === 'region') {
            const regionCompanies = allCompanies.filter(c => (c.alue_slug || '').toLowerCase() === item.id);
            const regionTags = [...new Set(regionCompanies.flatMap(c => {
                const combined = `${c.tags || ''},${c.palvelutapa || ''}`;
                return combined.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
            }))].slice(0, 3);

            if (regionTags.length > 0) {
                const tagCont = document.createElement('div');
                tagCont.className = 'suggestion-tags-container';
                regionTags.forEach(tag => {
                    const tagPill = document.createElement('span');
                    tagPill.className = 'suggestion-tag-pill';
                    tagPill.textContent = tag;
                    tagPill.onclick = (e) => {
                        e.stopPropagation();
                        selectSuggestion({ type: 'tag', name: tag, region: item.id });
                    };
                    tagCont.appendChild(tagPill);
                });
                li.appendChild(tagCont);
            }
        }

        suggestionsList.appendChild(li);
    });

    suggestionsList.style.display = 'block';
}

function handleSearchKeydown(e) {
    const suggestionsList = document.getElementById('search-suggestions');
    if (!suggestionsList || suggestionsList.style.display === 'none') return;
    const items = suggestionsList.querySelectorAll('li');

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
        } else {
            const query = (document.getElementById('company-search')?.value || '').trim();
            if (tryRedirectToRegion(query)) {
                e.preventDefault();
            }
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

    if (item.type === 'region') {
        window.location.href = `${item.id}.html`;
    } else if (item.type === 'category') {
        // Pakotetaan kategoriat koko Laukaa näkymään (region=all)
        window.location.href = `kategoria.html?cat=${encodeURIComponent(item.name)}&region=all`;
    } else if (item.type === 'tag') {
        // Tags stay within region context
        let region = item.region || localStorage.getItem('selectedRegion');
        if (isHomePage && !item.region) {
            window.location.href = `koko-laukaa.html?tag=${encodeURIComponent(item.name.toLowerCase())}`;
        } else {
            region = region || 'laukaa';
            window.location.href = `${region}.html?tag=${encodeURIComponent(item.name.toLowerCase())}`;
        }
    } else if (item.type === 'business') {
        if (searchInput) searchInput.value = item.company.nimi;
        const region = localStorage.getItem('selectedRegion');
        const regionParam = (region && region !== 'all') ? `&region=${region}` : '';
        const isPaid = item.company.tyyppi === 'maksu' || item.company.tyyppi === 'paid';
        
        const isInDist = window.location.pathname.includes('/dist/') || 
                         window.location.hostname === 'laukaainfo.fi' || 
                         window.location.hostname.includes('github.io');
        const distPrefix = isInDist ? '' : 'dist/';
        
        const cardUrl = isPaid 
            ? `${distPrefix}yritys/${slugify(item.company.nimi)}.html` 
            : `yrityskortti.html?id=${slugify(item.company.nimi)}${regionParam}`;
            
        window.location.href = cardUrl;
    } else if (item.type === 'rss') {
        window.open(item.link, '_blank');
    }
}

function tryRedirectToRegion(query) {
    if (!query || query.length < 3) return false;
    const villages = ['lievestuore', 'laukaa', 'vihtavuori', 'leppavesi', 'vehnia'];
    const parts = query.toLowerCase().split(' ').map(p => p.trim());

    const foundVillage = villages.find(v => parts.includes(v));
    if (foundVillage) {
        // Redir to area page (HTML format)
        const remainingQuery = parts.filter(p => p !== foundVillage).join('-').trim();
        let targetUrl = `/${foundVillage}.html`;
        if (remainingQuery) {
            targetUrl += `?tag=${encodeURIComponent(remainingQuery)}`;
        }
        window.location.href = targetUrl;
        return true;
    }
    return false;
}

function renderCatalog(companies) {
    const list = document.getElementById('catalog-list');
    if (!list) return; // Katalogi ei ole näkyvissä tällä sivulla

    list.innerHTML = '';
    const searchTerm = document.getElementById('company-search')?.value.trim();

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

        if (itemData.isRegion) {
            item.classList.add('region-result');
            item.innerHTML = `
                <span class="news-badge region" style="background: var(--primary-blue); color: white;">Alue</span>
                <h4>${itemData.name}</h4>
                <div style="font-size: 0.85rem; margin-top: 5px;">Siirry alueen sivulle ↗</div>
            `;
            item.onclick = () => {
                window.location.href = `${itemData.id}.html`;
            };
        } else if (itemData.isRss) {
            // RSS Item Rendering
            item.classList.add('rss-result');
            if (itemData.isNearest) item.classList.add('is-nearest');
            
            const nearestBadge = itemData.isNearest ? '<span class="nearest-badge">⭐ Lähin tapahtuma</span>' : '';
            const distHtml = itemData.distanceText ? `<span class="dist-badge">🚗 ${itemData.distanceText}</span>` : '';
            const routeLink = (itemData.lat && itemData.lon) ? `<div style="font-size: 0.8rem; margin-top: 5px; color: #28a745;">📍 Katso reitti tapahtumapaikalle</div>` : '';

            item.innerHTML = `
                <div class="catalog-item-header">
                    <span class="news-badge ${itemData.typeClass}">${itemData.type}</span>
                    ${distHtml}
                </div>
                ${nearestBadge}
                <h4>${itemData.title}</h4>
                <div style="font-size: 0.8rem; opacity: 0.7; margin-top: 5px;">📅 ${itemData.dateStr}</div>
                ${routeLink}
            `;
            item.onclick = () => {
                window.open(itemData.link, '_blank');
            };
        } else {
            // Business Item Rendering
            const company = itemData;
            const hasSpotlight = document.getElementById('company-spotlight');

            if (currentCompany && currentCompany.id === company.id) item.classList.add('active');

            // Find matching tags / palvelutapa for display in the catalog
            let displayedCat = company.kategoria;
            let serviceIcons = '';
            
            const tags = (company.tags || '').split(',').map(t => t.trim().toLowerCase());
            const pvtapa = (company.palvelutapa || '').split(',').map(t => t.trim().toLowerCase());
            const combinedTags = [...new Set([...tags, ...pvtapa])];

            if (combinedTags.length > 0) {
                // Add icons based on tags / palvelutapa
                if (combinedTags.includes('toimipiste')) serviceIcons += '<span class="service-icon" title="Toimipiste">🏢</span>';
                if (combinedTags.includes('kotikaynti') || combinedTags.includes('kotikäynti')) serviceIcons += '<span class="service-icon" title="Kotikäynti">🏠</span>';
                if (combinedTags.includes('etapalvelu') || combinedTags.includes('etäpalvelu')) serviceIcons += '<span class="service-icon" title="Etäpalvelu">💻</span>';
                if (combinedTags.includes('toimitus')) serviceIcons += '<span class="service-icon" title="Toimitus">🚚</span>';
                
                const lowerSearch = searchTerm ? searchTerm.toLowerCase() : '';
                if (lowerSearch.length > 1) {
                    const matchedTags = combinedTags.filter(t => t.includes(lowerSearch) && t !== '');
                    if (matchedTags.length > 0) {
                        displayedCat += ` - ${matchedTags.join(', ')}`;
                    }
                }
            }

            const distHtml = company.distanceText ? `<span class="dist-badge">🚗 ${company.distanceText}</span>` : '';
            item.innerHTML = `
                <div class="catalog-item-header">
                    <h4>${company.nimi} <span style="margin-left:5px; font-weight:normal;">${serviceIcons}</span></h4>
                    ${distHtml}
                </div>
                <span class="cat-tag">${displayedCat}</span>
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
                    const isPaid = company.tyyppi === 'maksu' || company.tyyppi === 'paid';
                    
                    const isInDist = window.location.pathname.includes('/dist/') || 
                                     window.location.hostname === 'laukaainfo.fi' || 
                                     window.location.hostname.includes('github.io');
                    const distPrefix = isInDist ? '' : 'dist/';
                    
                    const cardUrl = `yrityskortti.html?id=${slugify(company.nimi)}${regionParam}`;
                        
                    window.location.href = cardUrl;
                }
            };
        }
        list.appendChild(item);
    });
}

/**
 * Spotlight ja Slider
 */
async function updateSpotlight(company) {
    if (!company) return;
    console.log('Päivitetään spotlight:', company.nimi, 'Mediaa:', company.media ? company.media.length : 0);
    currentCompany = company;
    currentMediaIndex = 0;

    const nameEl = document.getElementById('spotlight-name');
    const taglineEl = document.getElementById('spotlight-tagline');
    const descEl = document.getElementById('spotlight-desc');
    const detailsEl = document.getElementById('spotlight-details');

    // Alustava renderöinti niillä tiedoilla mitä meillä on
    if (nameEl) nameEl.textContent = company.nimi;
    if (taglineEl) taglineEl.textContent = company.mainoslause;
    if (descEl) descEl.textContent = company.esittely || company.mainoslause;
    
    renderSpotlightDetails(company, detailsEl);

    // Jos data on vajaata (Slim), haetaan täydet tiedot taustalla
    const isSlim = !company.puhelin && !company.email && (!company.media || company.media.length <= 1);
    if (isSlim && company.id && company.id !== 'welcome') {
        try {
            const dataSourceUrl = 'https://www.mediazoo.fi/laukaainfo-web/get_companies.php';
            let fullData = null;
            const fullCached = sessionStorage.getItem('laukaainfo_full_' + company.id);
            
            if (fullCached) {
                fullData = JSON.parse(fullCached);
            } else {
                try {
                    const response = await fetch(`${dataSourceUrl}?id=${encodeURIComponent(company.id)}&t=${Date.now()}`);
                    if (!response.ok) throw new Error('HTTP Error ' + response.status);
                    const data = await response.json();
                    if (data.results && data.results[0]) {
                        fullData = data.results[0];
                    }
                } catch(e) {
                    console.warn('Lisätietojen haku APIsta epäonnistui (429), ladataan varadata.', e);
                    const isSubdir = window.location.pathname.includes('/yritys/');
                    const prefix = isSubdir ? '../' : './';
                    const localRes = await fetch(prefix + 'companies_data.json');
                    const localJson = await localRes.json();
                    const allLocal = Array.isArray(localJson) ? localJson : (localJson.results || []);
                    fullData = allLocal.find(c => c.id === company.id);
                }
                
                if (fullData) {
                    sessionStorage.setItem('laukaainfo_full_' + company.id, JSON.stringify(fullData));
                }
            }
            
            if (fullData) {
                // Normalisoidaan URL:t (kuten init-vaiheessa)
                const baseUrl = dataSourceUrl.substring(0, dataSourceUrl.lastIndexOf('/') + 1);
                if (fullData.media) {
                    fullData.media.forEach(item => {
                        if (item.url && !item.url.startsWith('http') && !item.url.startsWith('//')) {
                            item.url = baseUrl + item.url;
                        }
                    });
                }
                
                // Päivitetään yrityksen objekti
                Object.assign(company, fullData);
                
                // Päivitetään UI uudelleen
                if (descEl) descEl.textContent = company.esittely || company.mainoslause;
                renderSpotlightDetails(company, detailsEl);
                
                // Päivitetään myös toiminnot (esim. nettisivunappi saattaa ilmestyä)
                const actionsEl = document.getElementById('spotlight-actions');
                if (actionsEl) renderSpotlightActions(company, actionsEl);
            }
        } catch (e) {
            console.error("Virhe Spotlight-lisätietojen latauksessa:", e);
        }
    } else {
        const actionsEl = document.getElementById('spotlight-actions');
        if (actionsEl) renderSpotlightActions(company, actionsEl);
    }

    // Aina lopuksi piirretään media ja Slider
    renderMedia(0);
    renderSliderNav();
    preloadCompanyMedia(company);
}

function renderSpotlightDetails(company, detailsEl) {
    if (!detailsEl) return;
    
    let waysMarkup = '';
    const ways = (company.palvelutapa || '').split(',').map(t => t.trim().toLowerCase());
    const combinedWays = [...new Set([...(company.tags || '').split(',').map(t => t.trim().toLowerCase()), ...ways])];
    
    let waysIcons = '';
    let waysLabels = [];
    if (combinedWays.includes('toimipiste')) { waysIcons += '🏢 '; waysLabels.push('Toimipiste'); }
    if (combinedWays.includes('kotikaynti') || combinedWays.includes('kotikäynti')) { waysIcons += '🏠 '; waysLabels.push('Kotikäynti'); }
    if (combinedWays.includes('etapalvelu') || combinedWays.includes('etäpalvelu')) { waysIcons += '💻 '; waysLabels.push('Etäpalvelu'); }
    if (combinedWays.includes('toimitus')) { waysIcons += '🚚 '; waysLabels.push('Toimitus'); }

    if (waysIcons) {
        waysMarkup = `<div style="margin-top:8px; padding-top:8px; border-top:1px solid rgba(0,0,0,0.05); font-weight:500;">
            <span title="${waysLabels.join(', ')}">${waysIcons}</span> 
            <span style="font-size:0.9em; opacity:0.8;">${waysLabels.join(', ')}</span>
        </div>`;
    }

    detailsEl.innerHTML = `
        <div>📍 ${company.osoite || 'Laukaa'}</div>
        <div>📞 ${company.puhelin || '-'}</div>
        <div>📧 ${company.email || '-'}</div>
        ${waysMarkup}
    `;
}

function renderSpotlightActions(company, actionsEl) {
    if (!actionsEl) return;
    
    let actionButtons = '';
    
    if (company.nettisivu) {
        actionButtons += `<a href="${company.nettisivu}" target="_blank" class="btn-primary">🌐 Kotisivut</a>`;
    }
    
    if (company.karttalinkki) {
        // Fix: Use company properties correctly
        const lat = company.lat;
        const lon = company.lon || company.lng;
        const mapsUrl = company.karttalinkki && company.karttalinkki !== '-' 
            ? company.karttalinkki 
            : (lat && lon ? `https://www.google.com/maps?q=${lat},${lon}` : null);

        if (mapsUrl) {
            actionButtons += `<a href="${mapsUrl}" target="_blank" class="btn-primary" style="background: #28a745;">📍 Kartta</a>`;
        }
    }
    
    actionsEl.innerHTML = actionButtons || '<p style="color:#666; font-style:italic;">Ei lisätietoja saatavilla.</p>';
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

/**
 * PWA Service Worker Registration & Update Management
 */
function initPWAUpdates() {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            // Check if we are in a subdirectory (like /logica/ or /yritys/)
            const isSubDir = window.location.pathname.includes('/logica/') || window.location.pathname.includes('/yritys/');
            const swPath = isSubDir ? '../sw.js' : 'sw.js';

            navigator.serviceWorker.register(swPath).then(reg => {
                console.log('Service Worker rekisteröity');

                // Tarkista päivitykset
                reg.addEventListener('updatefound', () => {
                    const newWorker = reg.installing;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            showUpdateBanner();
                        }
                    });
                });
            }).catch(err => console.error('Service Worker virhe:', err));
        });

        // Kuuntele ohjaimen vaihtumista (uusi SW ottaa vallan)
        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (!refreshing) {
                window.location.reload();
                refreshing = true;
            }
        });
    }
}

function showUpdateBanner() {
    // Luodaan banneri jos sitä ei vielä ole
    if (document.getElementById('sw-update-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'sw-update-banner';
    banner.className = 'sw-update-banner';
    banner.innerHTML = `
        <span>Uusi versio saatavilla!</span>
        <button class="btn-refresh" onclick="prepareUpdate()">Päivitä nyt</button>
    `;
    document.body.appendChild(banner);

    // Aktivoidaan animaatio viiveellä
    setTimeout(() => banner.classList.add('active'), 100);
}

window.prepareUpdate = function() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistration().then(reg => {
            if (reg && reg.waiting) {
                reg.waiting.postMessage({ type: 'SKIP_WAITING' });
            } else {
                // Varatoimenpide jos waiting-tilaa ei löydy
                window.location.reload();
            }
        });
    }
};

// Alustetaan PWA-päivitykset
initPWAUpdates();

/**
 * Jakolinkki generaattorin alustus
 */
function initShareGenerator(companies) {
    const typeSelect = document.getElementById('share-type');
    const targetInput = document.getElementById('share-target-input');
    const targetSelect = document.getElementById('share-target-select');
    const targetSubSelect = document.getElementById('share-target-subselect');
    const targetLabel = document.getElementById('share-target-label');
    const resultUrl = document.getElementById('share-result-url');
    const copyBtn = document.getElementById('copy-share-btn');
    const qrBtn = document.getElementById('show-qr-btn');
    const qrContainer = document.getElementById('qrcode-container');
    const datalist = document.getElementById('generator-business-list');
    const refInput = document.getElementById('share-ref-input');

    if (!typeSelect || !targetInput) return;

    datalist.innerHTML = '';
    companies.forEach(c => {
        if (c.nimi) {
            const option = document.createElement('option');
            option.value = c.nimi;
            datalist.appendChild(option);
        }
    });

    const regions = [
        { id: 'laukaa', name: 'Laukaa kk' },
        { id: 'leppavesi', name: 'Leppavesi' },
        { id: 'lievestuore', name: 'Lievestuore' },
        { id: 'vehnia', name: 'Vehnia' },
        { id: 'vihtavuori', name: 'Vihtavuori' }
    ];

    const feedTypes = [
        { id: 'all', name: 'Kaikki' },
        { id: 'event', name: 'Tapahtumat' },
        { id: 'notice', name: 'Ilmoitukset' },
        { id: 'offer', name: 'Tarjoukset' },
        { id: 'community', name: 'Yritykset ja Yhteisot' },
        { id: 'story', name: 'Tarinat' },
        { id: 'video', name: 'Videot' }
    ];

    const categories = [...new Set(companies.map(c => c.kategoria))].filter(Boolean).sort();

    function updateUrl() {
        const type = typeSelect.value;
        const textVal = targetInput.value.trim();
        const selVal = targetSelect.value;
        const subSelVal = targetSubSelect ? targetSubSelect.value : '';
        const refVal = refInput ? slugify(refInput.value.trim().substring(0, 60)) : '';
        const baseUrl = window.location.origin + window.location.pathname.replace('/index.html', '/');
        let generated = baseUrl;
        qrContainer.style.display = 'none';
        if (type === 'yritys') {
            const found = companies.find(c => c.nimi.toLowerCase() === textVal.toLowerCase());
            if (found) {
                generated = baseUrl + 'yrityskortti.html?id=' + slugify(found.nimi);
            } else if (textVal) {
                generated = baseUrl + '?haku=' + encodeURIComponent(textVal);
            }
        } else if (type === 'haku') {
            if (textVal) { generated = baseUrl + '?q=' + encodeURIComponent(textVal); }
        } else if (type === 'kategoria') {
            generated = baseUrl + 'kategoria.html?cat=' + encodeURIComponent(selVal) + '&region=all';
        } else if (type === 'taajama') {
            generated = baseUrl + selVal + '.html';
            if (subSelVal && subSelVal !== 'all') { generated += '?cat=' + encodeURIComponent(subSelVal); }
        } else if (type === 'feed') {
            if (subSelVal && subSelVal !== 'all') {
                const filterMap = { event:'tapahtumat', notice:'ilmoitukset', offer:'tarjoukset', community:'yritykset', story:'tarinat', video:'videot' };
                generated = baseUrl + '?filter=' + (filterMap[subSelVal] || subSelVal) + '&feed=open';
            } else {
                generated = baseUrl + '?feed=open';
            }
        }
        // Lisää tunniste (&ref=) jos käyttäjä on kirjoittanut sen
        if (refVal) {
            generated += (generated.includes('?') ? '&' : '?') + 'ref=' + refVal;
        }
        resultUrl.value = generated;
    }

    typeSelect.addEventListener('change', () => {
        const type = typeSelect.value;
        targetInput.style.display = 'none';
        targetSelect.style.display = 'none';
        if (targetSubSelect) targetSubSelect.style.display = 'none';
        targetInput.disabled = false;
        if (type === 'yritys') {
            targetLabel.textContent = 'Yrityksen nimi';
            targetInput.style.display = 'block';
            targetInput.placeholder = 'Kirjoita nimi ja valitse listasta...';
            targetInput.value = '';
            targetInput.setAttribute('list', 'generator-business-list');
        } else if (type === 'haku') {
            targetLabel.textContent = 'Hakusana';
            targetInput.style.display = 'block';
            targetInput.placeholder = 'esim. tapahtuma tai pizza';
            targetInput.value = '';
            targetInput.removeAttribute('list');
        } else if (type === 'kategoria') {
            targetLabel.textContent = 'Valitse kategoria';
            targetSelect.style.display = 'block';
            targetSelect.innerHTML = categories.map(c => '<option value="' + c + '">' + c + '</option>').join('');
        } else if (type === 'taajama') {
            targetLabel.textContent = 'Valitse taajama ja lisasuodatus';
            targetSelect.style.display = 'block';
            targetSelect.innerHTML = regions.map(r => '<option value="' + r.id + '">' + r.name + '</option>').join('');
            if (targetSubSelect) {
                targetSubSelect.style.display = 'block';
                targetSubSelect.innerHTML = '<option value="all">Kaikki toimialat</option>' +
                    categories.map(c => '<option value="' + c + '">' + c + '</option>').join('');
            }
        } else if (type === 'feed') {
            targetLabel.textContent = 'Valitse syotteen tyyppi';
            if (targetSubSelect) {
                targetSubSelect.style.display = 'block';
                targetSubSelect.innerHTML = feedTypes.map(ft => '<option value="' + ft.id + '">' + ft.name + '</option>').join('');
            }
        }
        updateUrl();
    });

    targetInput.addEventListener('input', updateUrl);
    targetSelect.addEventListener('change', updateUrl);
    if (targetSubSelect) targetSubSelect.addEventListener('change', updateUrl);
    if (refInput) refInput.addEventListener('input', updateUrl);

    copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(resultUrl.value).then(() => {
            const origText = copyBtn.textContent;
            copyBtn.textContent = 'Kopioitu!';
            copyBtn.style.background = '#28a745';
            setTimeout(() => { copyBtn.textContent = origText; copyBtn.style.background = ''; }, 2000);
        });
    });

    qrBtn.addEventListener('click', () => {
        qrContainer.innerHTML = '';
        qrContainer.style.display = 'flex';
        qrContainer.style.alignItems = 'flex-start';
        qrContainer.style.gap = '8px';
        if (typeof QRCode !== 'undefined') {
            const qrWrapper = document.createElement('div');
            qrWrapper.style.position = 'relative';
            qrContainer.appendChild(qrWrapper);

            new QRCode(qrWrapper, { text: resultUrl.value, width: 200, height: 200, colorDark: "#003366", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.H });

            // Lisää kopioi-nappi QR:n jälkeen pienellä viiveellä (canvas renderöityy async)
            setTimeout(() => {
                const canvas = qrWrapper.querySelector('canvas');
                if (!canvas) return;

                const copyQrBtn = document.createElement('button');
                copyQrBtn.className = 'qr-copy-btn';
                copyQrBtn.title = 'Kopioi QR-koodi leikepöydälle';
                copyQrBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
                qrContainer.appendChild(copyQrBtn);

                copyQrBtn.addEventListener('click', () => {
                    canvas.toBlob(blob => {
                        if (!blob) return;
                        try {
                            const item = new ClipboardItem({ 'image/png': blob });
                            navigator.clipboard.write([item]).then(() => {
                                copyQrBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#28a745" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
                                setTimeout(() => {
                                    copyQrBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
                                }, 2000);
                            }).catch(() => {
                                copyQrBtn.title = 'Kopiointi ei onnistunut (selain ei tue)';
                            });
                        } catch(e) {
                            copyQrBtn.title = 'Kopiointi ei tueta tässä selaimessa';
                        }
                    }, 'image/png');
                });
            }, 100);

            qrContainer.title = "";
        } else {
            qrContainer.innerHTML = 'QR-koodi ei saatavilla.';
        }
    });

    typeSelect.dispatchEvent(new Event('change'));
}
