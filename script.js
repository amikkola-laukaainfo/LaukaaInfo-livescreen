let allCompanies = [];
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
    }

    function closeSidebar() {
        if (sidebarMenu) sidebarMenu.classList.remove('active');
        if (sidebarOverlay) sidebarOverlay.classList.remove('active');
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

    // Sulje sidebar kun normaalia linkkiä painetaan
    sidebarLinks.forEach(link => {
        link.addEventListener('click', () => {
            closeSidebar();
        });
    });

    // Alustetaan feedit
    initRSSFeeds();
    loadCompanyData();
});

const categoryColors = {
    'Kauneus ja terveys': '#ff4d94',
    'Matkailu & Elämykset': '#00cc66',
    'Ravinto & Vapaa-aika': '#ff9900',
    'Perinnematkailu & Juhlat': '#996633',
    'Muu': '#0056b3'
};

function initMap(companies) {
    if (map) return;

    // Laukaa keskipiste
    map = L.map('company-map').setView([62.4128, 25.9477], 11);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    markers = L.markerClusterGroup();
    addMarkersToMap(companies);
    map.addLayer(markers);
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
                        <button onclick="selectFromMap('${company.id}')" style="
                            background: #0056b3;
                            color: white;
                            border: none;
                            padding: 5px 10px;
                            border-radius: 4px;
                            cursor: pointer;
                            width: 100%;
                            font-size: 0.8rem;
                        ">Näytä tiedot</button>
                    </div>
                `);

                markers.addLayer(marker);
                bounds.push([lat, lon]);
            }
        }
    });

    console.log(`Kartta: Lisätty ${validMarkers} markeria ${companies.length} yrityksestä.`);

    if (bounds.length > 0) {
        map.fitBounds(bounds, { padding: [50, 50] });
    } else {
        console.warn('Kartta: Ei löytynyt yrityksiä, joilla on validit koordinaatit.');
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
}

/**
 * Yleiskäyttöinen RSS-haku merkistötuella ja kuvan poiminnalla.
 */
async function fetchRSSFeed(url, container, emptyMessage, encoding = 'utf-8') {
    // Käytetään ensisijaisesti paikallista PHP-proxya webhotellissa
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
            container.innerHTML = '';

            if (items.length === 0) {
                container.innerHTML = `<p>${emptyMessage}</p>`;
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
                // Tehdään tämä ENNEN tuplapoistoa, jotta ei hylätä uutta tapahtumaa vanhan (jo päättyneen) takia
                if (container.id === 'events-container' && dateObj && !isNaN(dateObj)) {
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

                parsedItems.push({
                    title,
                    link,
                    date: dateObj,
                    imageUrl,
                    description,
                    dateStr: dateObj && !isNaN(dateObj) ? dateObj.toLocaleDateString('fi-FI') : ''
                });
            }

            // Järjestetään tapahtumat päivämäärän mukaan (lähin ensin)
            if (container.id === 'events-container') {
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
                if (container.id === 'decisions-container') {
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
                    <div class="rss-meta"><span class="date">📅 ${item.dateStr}</span></div>
                    <h3><a href="${item.link}" target="_blank">${item.title}</a></h3>
                    <p class="description">${item.description}</p>
                    ${analysisLink}
                `;
                container.appendChild(rssElement);
            }
            return; // Onnistui!
        } catch (error) {
            console.warn(`Proxy ${proxyUrl} epäonnistui:`, error);
            lastError = error;
        }
    }

    console.error(`Kaikki RSS-haut epäonnistuivat: ${url}`, lastError);
    container.innerHTML = `<p>Tietojen lataus epäonnistui (CORS/Network error).</p>`;
}

/**
 * Yritysdata ja katalogi
 */
async function loadCompanyData() {
    const dataSourceUrl = 'https://www.mediazoo.fi/laukaainfo-web/get_companies.php';
    console.log('Yritetään hakea yritystietoja:', dataSourceUrl);
    try {
        const response = await fetch(dataSourceUrl + '?t=' + Date.now());
        console.log('Vastaus saatu:', response.status, response.statusText);

        const text = await response.text();
        console.log('Raw data pituus:', text.length);

        try {
            allCompanies = JSON.parse(text);
        } catch (e) {
            console.error('JSON parsimisvirhe. Data ei ole validia JSONia:', text.substring(0, 200));
            throw e;
        }

        // Normalisoidaan URL:t, jos ne ovat suhteellisia ja data haetaan ulkoiselta palvelimelta
        const baseUrl = dataSourceUrl.substring(0, dataSourceUrl.lastIndexOf('/') + 1);
        allCompanies.forEach(company => {
            if (company.media) {
                company.media.forEach(item => {
                    if (item.url) {
                        // 1. Korjataan vanhentuneet/virheelliset drive_cache linkit välityspalvelimelle
                        if (item.url.includes('drive_cache/')) {
                            const match = item.url.match(/drive_cache\/([a-zA-Z0-9_-]+)/);
                            if (match) {
                                const fileId = match[1];
                                console.log(`Korjattu Drive-välimuistiosoite: ${item.url} -> get_image.php?id=${fileId}`);
                                item.url = (item.url.startsWith('http') ? baseUrl : '') + "get_image.php?id=" + fileId;
                            }
                        }
                        // 2. Normalisoidaan suhteelliset polut (huom: yllä oleva korjaus voi jättää sen suhteelliseksi)
                        if (!item.url.startsWith('http') && !item.url.startsWith('//')) {
                            console.log(`Normalisoidaan suhteellinen URL: ${item.url} -> ${baseUrl}${item.url}`);
                            item.url = baseUrl + item.url;
                        }
                    }
                });
            }
        });

        console.log('Yrityksiä ladattu:', allCompanies.length);

        if (allCompanies.length > 0 && allCompanies[0]._debug_headers) {
            console.log('CSV Sarakkeet:', allCompanies[0]._debug_headers.join(', '));
        }

        // Diagnostiikkaa: Tulostetaan ensimmäisten yritysten koordinaatit
        console.log('Esimerkki koordinaateista (ensimmäiset 5):');
        allCompanies.slice(0, 5).forEach(c => {
            console.log(`- ${c.nimi}: lat="${c.lat}", lon="${c.lon}"`);
        });

        initCompanyCatalog();
        initMap(allCompanies);

        // URL-parametrin (haku) tarkistus
        const queryParams = new URLSearchParams(window.location.search);
        const urlParam = queryParams.get('haku') || queryParams.get('yritys');
        // Tarkistetaan myös hash (esim. #haku-mediazoo)
        const hashParam = window.location.hash;

        let searchKeyword = urlParam;
        if (!searchKeyword && hashParam && hashParam.startsWith('#haku-')) {
            searchKeyword = hashParam.replace('#haku-', '').replace(/-/g, ' ');
        }

        // Mahdollistetaan myös suora polku jos .htaccess on ohjannut sen parametriksi mutta se tulee URL:stä tms. (varmistus)
        const pathname = window.location.pathname;
        const pathMatch = pathname.match(/\/haku-(.*)/);
        if (!searchKeyword && pathMatch) {
            searchKeyword = decodeURIComponent(pathMatch[1]).replace(/-/g, ' ');
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
        console.error('Yritystietojen haku epäonnistui:', error);
        document.getElementById('catalog-list').innerHTML = `<p style="padding: 1rem; color: #dc3545;">Virhe ladattaessa tietoja: ${error.message}</p>`;
    }
}

let activeSuggestionIndex = -1;
let filteredSuggestions = [];

function initCompanyCatalog() {
    const searchInput = document.getElementById('company-search');
    const categorySelect = document.getElementById('category-filter');
    const suggestionsList = document.getElementById('search-suggestions');

    const categories = [...new Set(allCompanies.map(c => c.kategoria))].sort();
    categories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat;
        option.textContent = cat;
        categorySelect.appendChild(option);
    });

    searchInput.addEventListener('input', () => {
        filterCatalog();
        showSuggestions();
    });

    searchInput.addEventListener('keydown', handleSearchKeydown);

    categorySelect.addEventListener('change', () => {
        filterCatalog();
    });

    // Piilotetaan ehdotukset kun klikataan muualle
    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !suggestionsList.contains(e.target)) {
            suggestionsList.style.display = 'none';
        }
    });

    renderCatalog(allCompanies);
}

function filterCatalog() {
    const searchTerm = (document.getElementById('company-search').value || '').toLowerCase().trim();
    const category = document.getElementById('category-filter').value;

    const filtered = allCompanies.filter(company => {
        const nimi = (company.nimi || '').toLowerCase();
        const mainoslause = (company.mainoslause || '').toLowerCase();
        const esittely = (company.esittely || '').toLowerCase();

        const matchesSearch = nimi.includes(searchTerm) ||
            mainoslause.includes(searchTerm) ||
            esittely.includes(searchTerm);

        const matchesCategory = category === 'all' || company.kategoria === category;
        return matchesSearch && matchesCategory;
    });

    filteredSuggestions = filtered.slice(0, 8); // Näytetään max 8 ehdotusta
    renderCatalog(filtered);

    // Päivitetään myös kartta vastaamaan filtteriä
    if (map && markers) {
        addMarkersToMap(filtered);
    }
}

function showSuggestions() {
    const suggestionsList = document.getElementById('search-suggestions');
    const searchTerm = document.getElementById('company-search').value.trim();

    if (searchTerm.length < 1 || filteredSuggestions.length === 0) {
        suggestionsList.style.display = 'none';
        return;
    }

    suggestionsList.innerHTML = '';
    activeSuggestionIndex = -1;

    filteredSuggestions.forEach((company, index) => {
        const li = document.createElement('li');

        // Korostetaan hakutermi nimeen
        const regex = new RegExp(`(${searchTerm})`, 'gi');
        const highlightedName = company.nimi.replace(regex, '<mark>$1</mark>');

        li.innerHTML = `
            <span>${highlightedName}</span>
            <span class="suggestion-cat">${company.kategoria}</span>
        `;

        li.onclick = () => {
            selectSuggestion(company);
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

function selectSuggestion(company) {
    const searchInput = document.getElementById('company-search');
    const suggestionsList = document.getElementById('search-suggestions');

    searchInput.value = company.nimi;
    suggestionsList.style.display = 'none';

    // Filtteröidään katalogi valitun mukaan ja päivitetään spotlight
    filterCatalog();
    updateSpotlight(company);

    // Korostetaan katalogissa
    document.querySelectorAll('.catalog-item').forEach(el => {
        if (el.querySelector('h4').textContent === company.nimi) {
            el.classList.add('active');
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
            el.classList.remove('active');
        }
    });
}

function renderCatalog(companies) {
    const list = document.getElementById('catalog-list');
    list.innerHTML = '';
    if (companies.length === 0) {
        list.innerHTML = '<p style="padding: 1rem; opacity: 0.6;">Ei löytynyt yrityksiä.</p>';
        return;
    }
    companies.forEach(company => {
        const item = document.createElement('div');
        item.className = 'catalog-item';
        if (currentCompany && currentCompany.id === company.id) item.classList.add('active');
        item.innerHTML = `<h4>${company.nimi}</h4><span class="cat-tag">${company.kategoria}</span>`;
        item.onclick = () => {
            document.querySelectorAll('.catalog-item').forEach(el => el.classList.remove('active'));
            item.classList.add('active');
            updateSpotlight(company);
        };
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

    document.getElementById('spotlight-name').textContent = company.nimi;
    document.getElementById('spotlight-tagline').textContent = company.mainoslause;
    document.getElementById('spotlight-desc').textContent = company.esittely || company.mainoslause;
    document.getElementById('spotlight-details').innerHTML = `
        <div>📍 ${company.osoite}</div>
        <div>📞 ${company.puhelin || '-'}</div>
        <div>📧 ${company.email || '-'}</div>
    `;
    let actionButtons = '';
    if (company.nettisivu) {
        actionButtons += `<a href="${company.nettisivu}" target="_blank" class="btn-primary">🌐 Kotisivut</a>`;
    }
    if (company.karttalinkki) {
        actionButtons += `<a href="${company.karttalinkki}" target="_blank" class="btn-primary" style="background: #28a745;">📍 Kartta</a>`;
    }
    document.getElementById('spotlight-actions').innerHTML = actionButtons;

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
