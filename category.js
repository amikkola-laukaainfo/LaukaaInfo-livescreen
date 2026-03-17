(function () {
    let userCoords = null;
    let distanceCache = new Map();
    let categoryCompanies = [];
    let map, markers;

    let selectedRegion = 'all';
    let regionCoords = null;
    let villageName = '';

    const villageCoordsMap = {
        'laukaa': { lat: 62.41407, lon: 25.95194 },
        'leppavesi': { lat: 62.326386, lon: 25.840924 },
        'lievestuore': { lat: 62.2625, lon: 26.2039 },
        'vehnia': { lat: 62.4381, lon: 25.6825 },
        'vihtavuori': { lat: 62.370563, lon: 25.902297 }
    };

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

    document.addEventListener('DOMContentLoaded', () => {
        const params = new URLSearchParams(window.location.search);
        const category = params.get('cat');
        const regionFromUrl = params.get('region');

        // Resolve selected region: URL takes absolute priority
        const rawRegion = (regionFromUrl || localStorage.getItem('selectedRegion') || 'all').trim();
        selectedRegion = rawRegion.toLowerCase();

        // Resolve coordinates
        regionCoords = villageCoordsMap[selectedRegion];
        if (!regionCoords && selectedRegion !== 'all') {
            const storedCoords = localStorage.getItem('regionCoords');
            if (storedCoords) {
                try {
                    regionCoords = JSON.parse(storedCoords);
                } catch (e) { console.error("Error parsing stored coords", e); }
            }
        }

        // Update localStorage to match current state
        if (selectedRegion !== 'all') {
            localStorage.setItem('selectedRegion', selectedRegion);
            if (regionCoords) {
                localStorage.setItem('regionCoords', JSON.stringify(regionCoords));
            }
        }

        const storedUserCoords = localStorage.getItem('userCoords');
        if (storedUserCoords) {
            try {
                const parsed = JSON.parse(storedUserCoords);
                if (parsed && typeof parsed.lat === 'number' && typeof parsed.lng === 'number') {
                    userCoords = L.latLng(parsed.lat, parsed.lng);
                }
            } catch (e) { console.error("Error parsing stored user coords", e); }
        }

        if (!category) {
            window.location.href = 'index.html';
            return;
        }

        const friendlyRegions = {
            'all': '',
            'laukaa': 'Laukaa',
            'leppavesi': 'Leppävesi',
            'lievestuore': 'Lievestuore',
            'vehnia': 'Vehniä',
            'vihtavuori': 'Vihtavuori'
        };

        villageName = friendlyRegions[selectedRegion] || '';
        const displayTitle = villageName ? `${category} - ${villageName}` : category;

        document.getElementById('category-name').textContent = displayTitle;
        document.title = `${displayTitle} – LaukaaInfo`;

        // Icon selection
        const categoryIcons = {
            'Auto ja kuljetus': '🚗',
            'Kaupat ja ostokset': '🛍️',
            'Hyvinvointi ja terveys': '🏥',
            'Ruokailu': '🍕',
            'Palvelut': '💼',
            'Rakentaminen ja remontointi': '🏠',
            'Elintarvikkeet': '🛒',
            'Juhlatilat': '🎊',
            'Majoitus': '🏨',
            'Autokorjaamot': '🔧',
            'Matkailu & Elämykset': '🌲',
            'Ravinto & Vapaa-aika': '🍽️',
            'Perinnematkailu & Juhlat': '💒',
            'Muu': '🏢'
        };
        const cleanCat = (category || '').trim();
        const icon = categoryIcons[cleanCat] ||
            categoryIcons[cleanCat.replace('-', ' ')] ||
            categoryIcons[cleanCat.replace(' ', '-')] ||
            Object.entries(categoryIcons).find(([k]) => k.toLowerCase() === cleanCat.toLowerCase())?.[1] ||
            '🏢';
        document.getElementById('category-icon').textContent = icon;

        loadData(category);
    });

    async function loadData(category) {
        try {
            const dataSourceUrl = 'https://www.mediazoo.fi/laukaainfo-web/get_companies.php';
            const response = await fetch(dataSourceUrl + '?t=' + Date.now());
            const json = await response.json();
            // New response format: {results: [...], total: N, page: N, limit: N}
            const allCompanies = Array.isArray(json) ? json : (json.results || []);

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

            const rawCategoryCompanies = allCompanies.filter(c => c.kategoria === category);

            if (regionCoords && selectedRegion && selectedRegion !== 'all') {
                console.log(`Filtering by region: ${selectedRegion} (13km radius)`);
                categoryCompanies = rawCategoryCompanies.filter(c => {
                    // Yhtenäinen premium-määritys
                    const isPremium = c.tyyppi === 'paid' || c.tyyppi === 'maksu' || c.taso === 'premium' || (c.media && c.media.length > 0);
                    if (isPremium) return true;

                    if (c.lat && c.lon) {
                        const dist = getHaversineDistance(regionCoords.lat, regionCoords.lon, parseFloat(c.lat), parseFloat(c.lon));
                        return dist <= 13; // 13km limit
                    }
                    return false; // No coords and not paid -> hide
                });
            } else {
                categoryCompanies = rawCategoryCompanies;
            }

            // Initial render
            updateDisplay();
            initMap(categoryCompanies);
            initCarousel();
        } catch (error) {
            console.error('Error loading data:', error);
        }
    }

    async function updateDisplay() {
        // Ensisijainen vertailupiste: käyttäjän sijainti. Toissijainen: valittu taajama.
        const referenceCoords = userCoords || (regionCoords ? L.latLng(regionCoords.lat, regionCoords.lon) : null);

        if (referenceCoords) {
            await calculateDistances(referenceCoords);
        }

        // Default: Sort alphabetically by name
        const sortAlphabetically = (a, b) => a.nimi.localeCompare(b.nimi, 'fi');

        // Distance: Sort by distanceValue
        const sortByDistance = (a, b) => (a.distanceValue || Infinity) - (b.distanceValue || Infinity);

        const currentSort = referenceCoords ? sortByDistance : sortAlphabetically;

        // Separate Premium and Free
        // Yhtenäinen premium-määritys: has media OR tyyppi is "maksu/paid"
        let premium = categoryCompanies.filter(c => (c.media && c.media.length > 0) || c.tyyppi === 'maksu' || c.tyyppi === 'paid' || c.taso === 'premium');
        const free = categoryCompanies.filter(c => !((c.media && c.media.length > 0) || c.tyyppi === 'maksu' || c.tyyppi === 'paid' || c.taso === 'premium')).sort(currentSort);

        // Probabilistic Weighted Sort for Premium Companies
        // Higher karusellipaino (0-100) increases the chance of being at the top
        premium = premium.map(c => {
            const weight = parseFloat(c.karusellipaino) || 0;
            // sortScore is a combination of weight-biased random and a baseline random
            // Companies with 100 weight will have scores in range [10, 20]
            // Companies with 0 weight will have scores in range [0, 10]
            const sortScore = (Math.random() * 10) + (weight / 10);
            return { ...c, sortScore };
        }).sort((a, b) => b.sortScore - a.sortScore);

        // First 5 go to carousel, the rest to the directory list
        const carouselItems = premium.slice(0, 5);
        const remainingPremium = premium.slice(5);

        // Map random free companies to fill carousel if needed
        let displayCarousel = [...carouselItems];
        if (displayCarousel.length < 5 && free.length > 0) {
            const needed = 5 - displayCarousel.length;
            const shuffledFree = [...free].sort(() => 0.5 - Math.random());
            const randomPicks = shuffledFree.slice(0, needed);
            displayCarousel = [...displayCarousel, ...randomPicks];
        }

        renderFeatured(displayCarousel);
        renderDirectory(remainingPremium, free);
    }

    async function calculateDistances(reference) {
        if (!reference) return;

        // Use OSRM Table API for batch distances
        const coords = categoryCompanies
            .filter(c => c.lat && c.lon)
            .map(c => `${c.lon},${c.lat}`)
            .join(';');

        if (!coords) return;

        try {
            const url = `https://router.project-osrm.org/table/v1/driving/${reference.lng},${reference.lat};${coords}?sources=0&annotations=distance`;
            const response = await fetch(url);
            const data = await response.json();

            if (data.code === 'Ok' && data.distances && data.distances[0]) {
                let companyIdx = 0;
                categoryCompanies.forEach(company => {
                    if (company.lat && company.lon) {
                        const distInMeters = data.distances[0][companyIdx + 1];
                        if (distInMeters !== null) {
                            company.distanceValue = distInMeters;
                            company.distanceText = distInMeters < 1000
                                ? `${Math.round(distInMeters)} m`
                                : `${(distInMeters / 1000).toFixed(1)} km`;
                        }
                        companyIdx++;
                    }
                });
            }
        } catch (err) {
            console.warn("OSRM error, falling back to straight-line distance:", err);
            // Fallback to Haversine
            categoryCompanies.forEach(company => {
                if (company.lat && company.lon) {
                    const dist = getHaversineDistance(reference.lat, reference.lng, parseFloat(company.lat), parseFloat(company.lon));
                    company.distanceValue = dist * 1000;
                    company.distanceText = dist < 1 ? `${Math.round(dist * 1000)} m` : `${dist.toFixed(1)} km`;
                }
            });
        }
    }

    function getHaversineDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Radius of the earth in km
        const dLat = deg2rad(lat2 - lat1);
        const dLon = deg2rad(lon2 - lon1);
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    function deg2rad(deg) {
        return deg * (Math.PI / 180);
    }

    function initCarousel() {
        const track = document.getElementById('featured-carousel');
        const prevBtn = document.getElementById('carousel-prev');
        const nextBtn = document.getElementById('carousel-next');
        if (!track) return;

        const scrollStep = 350 + 32;

        if (prevBtn) {
            prevBtn.onclick = () => {
                track.scrollBy({ left: -scrollStep, behavior: 'smooth' });
            };
        }

        if (nextBtn) {
            nextBtn.onclick = () => {
                track.scrollBy({ left: scrollStep, behavior: 'smooth' });
            };
        }
    }

    function renderFeatured(companies) {
        const section = document.getElementById('featured-section');
        const container = document.getElementById('featured-carousel');

        if (companies.length > 0) {
            section.style.display = 'block';
            container.innerHTML = '';

            // Only show top 5 in carousel
            const featured = companies.slice(0, 5);

            featured.forEach(c => {
                const item = document.createElement('div');
                item.className = 'carousel-item';

                let mediaHtml = '';

                const defaultImages = {
                    'auto ja kuljetus': [
                        'https://images.unsplash.com/photo-1549317661-bd32c8ce0be2?auto=format&fit=crop&q=80&w=400',
                        'https://images.unsplash.com/photo-1613214149922-f1809fea1b0b?auto=format&fit=crop&q=80&w=400',
                        'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&q=80&w=400'
                    ],
                    'elintarvikkeet': [
                        'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&q=80&w=400',
                        'https://images.unsplash.com/photo-1583258292688-d0213dc5a3a8?auto=format&fit=crop&q=80&w=400',
                        'https://images.unsplash.com/photo-1550989460-0adf9ea622e2?auto=format&fit=crop&q=80&w=400'
                    ],
                    'hyvinvointi ja terveys': [
                        'https://images.unsplash.com/photo-1552693673-1bf958298935?auto=format&fit=crop&q=80&w=400',
                        'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&q=80&w=400',
                        'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?auto=format&fit=crop&q=80&w=400'
                    ],
                    'juhlatilat': [
                        'https://images.unsplash.com/photo-1519225421980-715cb0215aed?auto=format&fit=crop&q=80&w=400',
                        'https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?auto=format&fit=crop&q=80&w=400',
                        'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&q=80&w=400'
                    ],
                    'kaupat ja ostokset': [
                        'https://images.unsplash.com/photo-1481437156560-3205f6a55735?auto=format&fit=crop&q=80&w=400',
                        'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&q=80&w=400',
                        'https://images.unsplash.com/photo-1556740738-b6a63e27c4df?auto=format&fit=crop&q=80&w=400'
                    ],
                    'majoitus': [
                        'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&q=80&w=400',
                        'https://images.unsplash.com/photo-1582719478250-c89409817361?auto=format&fit=crop&q=80&w=400',
                        'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&q=80&w=400'
                    ],
                    'palvelut': [
                        'https://images.unsplash.com/photo-1581561515277-2da15779ec36?auto=format&fit=crop&q=80&w=400',
                        'https://images.unsplash.com/photo-1600880292203-757bb62b4baf?auto=format&fit=crop&q=80&w=400',
                        'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&q=80&w=400'
                    ],
                    'rakentaminen ja remontointi': [
                        'https://images.unsplash.com/photo-1581094288338-2314dddb7ece?auto=format&fit=crop&q=80&w=400',
                        'https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&q=80&w=400',
                        'https://images.unsplash.com/photo-1504307651254-35680f356db3?auto=format&fit=crop&q=80&w=400'
                    ],
                    'ruokailu': [
                        'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&q=80&w=400',
                        'https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&q=80&w=400',
                        'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&q=80&w=400'
                    ],
                    'muu': [
                        'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&q=80&w=400',
                        'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&q=80&w=400',
                        'https://images.unsplash.com/photo-1497215728101-856f4ea42174?auto=format&fit=crop&q=80&w=400'
                    ]
                };

                let imageUrl = '';
                if (c.media && c.media[0] && c.media[0].type === 'image') {
                    imageUrl = c.media[0].url;
                } else {
                    const cleanCat = (c.kategoria || '').replace(/-/g, ' ').trim().toLowerCase();
                    const imagesArray = defaultImages[cleanCat] ||
                        Object.entries(defaultImages).find(([k]) => k === cleanCat)?.[1] ||
                        defaultImages['muu'];
                    imageUrl = imagesArray[Math.floor(Math.random() * imagesArray.length)];
                }
                mediaHtml = `<img src="${imageUrl}" style="width:100%; height:150px; object-fit:cover; border-radius:8px; margin-bottom:1rem;" alt="${c.nimi}">`;

                const distHtml = c.distanceText ? `<span style="background:var(--accent-blue); color:white; padding:2px 8px; border-radius:10px; font-size:0.75rem; margin-left:10px;">${c.distanceText}</span>` : '';

                // Truncate description at @@
                let description = (c.mainoslause || '').trim();
                if (description.includes('@@')) {
                    description = description.split('@@')[0].trim();
                }

                if (!description) {
                    description = 'Tutustu yritykseen ja sen tarjoamiin palveluihin.';
                }

                // Clean website URL
                const websiteShow = (c.nettisivu || '').replace(/^https?:\/\//, '').replace(/\/$/, '');

                const isPaid = c.tyyppi === 'maksu' || c.tyyppi === 'paid';
                const cardUrl = isPaid ? `yritys/${slugify(c.nimi)}.html` : `yrityskortti.html?id=${slugify(c.nimi)}`;

                item.innerHTML = `
                <a href="${cardUrl}" style="text-decoration: none; color: inherit; display: block;">
                    <span class="premium-badge">SUOSITELTU ${distHtml}</span>
                    ${mediaHtml}
                    <h3>${c.nimi}</h3>
                    <p>${description}</p>
                    <div style="margin-top:1rem;">
                        <strong>${websiteShow}</strong>
                    </div>
                </a>
            `;
                container.appendChild(item);
            });
        }
    }

    function renderDirectory(premium, free) {
        const list = document.getElementById('company-list');
        list.innerHTML = '';

        if (premium.length > 0) {
            const h2 = document.createElement('h2');
            h2.textContent = '⭐ Suositellut yritykset';
            h2.style.gridColumn = '1 / -1';
            h2.style.marginTop = '2rem';
            list.appendChild(h2);

            premium.forEach(c => {
                list.appendChild(createCompanyCard(c));
            });
        }

        if (free.length > 0) {
            const h2 = document.createElement('h2');
            h2.textContent = 'Palveluhakemisto';
            h2.style.gridColumn = '1 / -1';
            h2.style.marginTop = '4rem';
            list.appendChild(h2);

            free.forEach(c => {
                list.appendChild(createCompanyCard(c));
            });
        }
    }

    function createCompanyCard(c) {
        const card = document.createElement('div');
        card.className = 'company-card';

        const isPremium = c.media && c.media.length > 0;
        const distBadge = c.distanceText ? `<span style="display:inline-block; background:#eef; color:var(--primary-blue); padding:3px 10px; border-radius:15px; font-size:0.8rem; font-weight:bold; margin-bottom:10px;">🚗 ${c.distanceText}</span>` : '';

        // Same logic as carousel for premium companies
        let description = c.mainoslause || '';
        if (isPremium && description.includes('@@')) {
            description = description.split('@@')[0].trim();
        }

        const websiteShow = (c.nettisivu || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
        const infoHtml = isPremium && websiteShow
            ? `<div style="margin-top:0.5rem;"><strong>${websiteShow}</strong></div>`
            : `<p class="address">${c.osoite || 'Laukaa'}</p>`;

        const isPaid = c.tyyppi === 'maksu' || c.tyyppi === 'paid';
        const isInDist = window.location.pathname.includes('/dist/');
        const distPrefix = isInDist ? '' : 'dist/';
        const cardUrl = isPaid ? `${distPrefix}${slugify(c.nimi)}.html` : `yrityskortti.html?id=${slugify(c.nimi)}`;

        card.innerHTML = `
        ${distBadge}
        <h3>${c.nimi}</h3>
        ${infoHtml}
        <p>${description}</p>
        <div style="margin-top:1rem; display:flex; gap:10px;">
            <a href="${cardUrl}" class="btn-primary" style="padding:0.4rem 1rem; font-size:0.8rem;">TIEDOT</a>
            ${c.nettisivu ? `<a href="${c.nettisivu}" target="_blank" class="btn-primary" style="padding:0.4rem 1rem; font-size:0.8rem; background:#666;">WWW</a>` : ''}
        </div>
    `;
        return card;
    }

    function initMap(companies) {
        if (map) return;

        map = L.map('category-map').setView([62.4128, 25.9477], 11);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }).addTo(map);

        markers = L.markerClusterGroup();

        companies.forEach(company => {
            if (company.lat && company.lon) {
                const marker = L.marker([company.lat, company.lon]);
                marker.bindPopup(`
                <strong>${company.nimi}</strong><br>${company.osoite}<br><br>
                <a href="yrityskortti.html?id=${slugify(company.nimi)}" style="
                    display: block;
                    background: #0056b3;
                    color: white;
                    text-decoration: none;
                    text-align: center;
                    padding: 5px 10px;
                    border-radius: 4px;
                    font-size: 0.8rem;
                ">Näytä tiedot</a>
            `);
                markers.addLayer(marker);
            }
        });

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
                                const latlng = L.latLng(parseFloat(result.lat), parseFloat(result.lon));
                                map.setView(latlng, 15);

                                userCoords = latlng;
                                localStorage.setItem('userCoords', JSON.stringify({ lat: userCoords.lat, lng: userCoords.lng }));
                                updateDisplay();

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
            localStorage.setItem('userCoords', JSON.stringify({ lat: userCoords.lat, lng: userCoords.lng }));
            updateDisplay();

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

        // Redundant check to ensure state is correct before map logic
        const urlParams = new URLSearchParams(window.location.search);
        const urlReg = urlParams.get('region');
        if (urlReg) {
            const normalizedReg = urlReg.trim().toLowerCase();
            if (villageCoordsMap[normalizedReg]) {
                selectedRegion = normalizedReg;
                regionCoords = villageCoordsMap[normalizedReg];
            }
        }

        const group = new L.featureGroup(markers.getLayers());
        const hasMarkers = markers.getLayers().length > 0;

        if (selectedRegion && selectedRegion !== 'all' && regionCoords) {
            // Use precise village center at zoom level 13 as requested.
            // We no longer use fitBounds for regional views to ensure the center remains exactly 
            // on the village coordinates (e.g. Vihtavuori school) and doesn't drift towards nearby markers.
            map.setView([regionCoords.lat, regionCoords.lon], 13);
        } else if (hasMarkers) {
            map.fitBounds(group.getBounds().pad(0.1));
        } else {
            // Default center
            map.setView([62.4128, 25.9477], 11);
        }
    }
})();

