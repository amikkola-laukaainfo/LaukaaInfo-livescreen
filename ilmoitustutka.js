/**
 * Ilmoitustutka (Ad Radar) - LaukaaInfo
 * Etsii ja näyttää lähellä olevat yritykset, joilla on mainos tai tarjous.
 */

const Ilmoitustutka = (function () {
    let userLat = null;
    let userLon = null;
    let radarMap = null;
    let radarMarkers = null;

    function init() {
        console.log("Ilmoitustutka alustetaan...");
        createRadarButton();
    }

    function createRadarButton() {
        // Etsitään sopiva paikka napille (esim. hakukentän alapuolelle)
        const container = document.querySelector('.main-search-box');
        if (!container) return;

        const radarWrapper = document.createElement('div');
        radarWrapper.className = 'radar-action-wrapper';
        radarWrapper.innerHTML = `
            <div class="radar-pwa-box">
                <button id="radar-trigger-btn" class="btn-radar">
                    <span>📍</span> Ilmoitustutka – Näytä lähellä olevat tarjoukset
                </button>
            </div>
            <div id="radar-results-container" class="radar-results-hidden">
                <div class="radar-header">
                    <h3>Lähialueen tarjoukset</h3>
                    <button id="close-radar-btn" class="btn-close-radar">&times;</button>
                </div>
                
                <div class="radar-location-search" id="radar-desktop-search">
                    <input type="text" id="radar-search-input" placeholder="Hae osoite tai kylä (esim. Laukaa)...">
                    <button id="radar-search-btn" class="btn-small">Hae</button>
                    <span class="radar-hint">tai klikkaa karttaa</span>
                </div>

                <div id="radar-map-container" class="radar-map-view"></div>
                <div id="radar-ads-list" class="radar-ads-grid">
                    <p class="loading-text">Paikannetaan sijaintia...</p>
                </div>
            </div>
        `;

        container.appendChild(radarWrapper);

        document.getElementById('radar-trigger-btn').addEventListener('click', startRadar);
        document.getElementById('close-radar-btn').addEventListener('click', closeRadar);
        document.getElementById('radar-search-btn').addEventListener('click', searchLocation);
        document.getElementById('radar-search-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') searchLocation();
        });
    }

    async function searchLocation() {
        const query = document.getElementById('radar-search-input').value;
        if (!query) return;

        try {
            const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + ', Laukaa')}`);
            const data = await response.json();
            if (data && data.length > 0) {
                userLat = parseFloat(data[0].lat);
                userLon = parseFloat(data[0].lon);
                processRadar();
            } else {
                alert("Paikkaa ei löytynyt. Kokeile tarkempaa hakua.");
            }
        } catch (e) {
            console.error("Hakuvirhe:", e);
        }
    }

    async function waitForData() {
        if (typeof allCompanies !== 'undefined' && allCompanies && allCompanies.length > 0) {
            return Promise.resolve();
        }
        return new Promise(resolve => {
            const check = () => {
                if (typeof allCompanies !== 'undefined' && allCompanies && allCompanies.length > 0) {
                    resolve();
                } else {
                    setTimeout(check, 100);
                }
            };
            check();
        });
    }

    function startRadar() {
        const results = document.getElementById('radar-results-container');
        results.classList.remove('radar-results-hidden');
        results.classList.add('radar-results-visible');

        results.scrollIntoView({ behavior: 'smooth', block: 'start' });

        const isDesktop = window.innerWidth > 600;

        if (isDesktop) {
            // Desktop: Ei kysytä lupaa automaattisesti, vaan odotetaan haku tai kartan klikkaus
            document.getElementById('radar-ads-list').innerHTML = "<p class='info-msg'>Anna sijainti hakemalla osoite tai klikkaamalla karttaa.</p>";
            // Jos meillä on jo tallennettu sijainti, käytetään sitä
            const stored = localStorage.getItem('userCoords');
            if (stored) {
                try {
                    const parsed = JSON.parse(stored);
                    userLat = parsed.lat;
                    userLon = parsed.lng;
                    processRadar();
                } catch(e) {}
            }
        } else {
            // Mobile: Kysytään lupaa heti
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        userLat = position.coords.latitude;
                        userLon = position.coords.longitude;

                        // Varmistetaan että data on ladattu ennen käsittelyä
                        waitForData().then(() => {
                            processRadar();
                        });
                    },
                    (error) => {
                        console.error("Sijaintivirhe:", error);
                        let msg = "Sijaintia ei voitu hakea.";
                        if (error.code === 1) msg = "Sijaintilupa evätty. Salli sijainti selaimen asetuksista.";
                        document.getElementById('radar-ads-list').innerHTML = `<p class='error-msg'>${msg}</p>`;
                    },
                    { enableHighAccuracy: true }
                );
            } else {
                document.getElementById('radar-ads-list').innerHTML = "<p class='error-msg'>Selaimesi ei tue paikannusta.</p>";
            }
        }
    }

    function closeRadar() {
        const results = document.getElementById('radar-results-container');
        results.classList.remove('radar-results-visible');
        results.classList.add('radar-results-hidden');
    }

    async function processRadar() {
        if (typeof allCompanies === 'undefined' || !allCompanies || allCompanies.length === 0) {
            console.warn("Ilmoitustutka: allCompanies ei ole vielä valmis.");
            return;
        }

        console.log("Ilmoitustutka prosessoi yrityksiä (yhteensä):", allCompanies.length);

        // 1. Käsittele perinteiset yritystarjoukset (allCompanies)
        const allWithDistance = allCompanies.filter(c => c.lat && c.lon).map(c => {
            const dist = calculateDistance(userLat, userLon, parseFloat(c.lat), parseFloat(c.lon));
            const hasLinkAd = (c.mainoslinkit && c.mainoslinkit.length > 2);
            const hasSlogan = (c.mainoslause && c.mainoslause.trim().length > 0);
            
            const isPremium = c.tyyppi === 'paid' || c.tyyppi === 'maksu' || c.taso === 'premium';

            let type = 'none';
            if (hasLinkAd) type = 'offer';
            else if (hasSlogan) type = 'ad';

            return { ...c, distanceInKm: dist, type: type, radarType: 'yritys', isPremium: isPremium };
        });

        // 2. Hae Supabasesta Offers (Feed-tarjoukset) ja Encounters (Kohtaamiset)
        let sbOffers = [];
        let sbEncounters = [];

        try {
            if (window.supabase) {
                const SB_URL = 'https://duxluwyqxvbmkkjzuzkz.supabase.co';
                const SB_KEY = 'sb_publishable_HgfWyipuSO7gvsVUR1smNQ_aXox2OPu';
                window.aiSb = window.aiSb || window.supabase.createClient(SB_URL, SB_KEY);
                const sb = window.aiSb;

                // Hae aktiiviset offers
                const { data: offersData } = await sb.from('offers').select('*').eq('status', 'active');
                if (offersData) {
                    offersData.forEach(o => {
                        if (o.place_id) {
                            // Etsi paikan koordinaatit
                            const placeInfo = allCompanies.find(c => c.place_id === o.place_id || c.id === o.place_id);
                            if (placeInfo && placeInfo.lat && placeInfo.lon) {
                                const dist = calculateDistance(userLat, userLon, parseFloat(placeInfo.lat), parseFloat(placeInfo.lon));
                                sbOffers.push({
                                    id: o.id,
                                    nimi: o.name,
                                    mainoslause: o.description,
                                    lat: placeInfo.lat,
                                    lon: placeInfo.lon,
                                    distanceInKm: dist,
                                    type: 'offer',
                                    radarType: 'feed_offer',
                                    isPremium: false,
                                    link: o.photo_url || '#'
                                });
                            }
                        }
                    });
                }

                // Hae aktiiviset encounters
                const { data: encData } = await sb.from('encounters').select('*').eq('status', 'active');
                if (encData) {
                    encData.forEach(e => {
                        let lat = e.latitude;
                        let lon = e.longitude;
                        
                        // Jos koordinaatit puuttuu mutta on location_id, haetaan se allCompaniesista
                        if ((!lat || !lon) && e.location_id) {
                            const placeInfo = allCompanies.find(c => c.place_id === e.location_id || c.id === e.location_id);
                            if (placeInfo && placeInfo.lat && placeInfo.lon) {
                                lat = parseFloat(placeInfo.lat);
                                lon = parseFloat(placeInfo.lon);
                            }
                        }

                        if (lat && lon) {
                            const dist = calculateDistance(userLat, userLon, lat, lon);
                            sbEncounters.push({
                                id: e.id,
                                nimi: e.location_name || 'Ilmoitus',
                                mainoslause: e.description,
                                lat: lat,
                                lon: lon,
                                distanceInKm: dist,
                                type: 'ad',
                                radarType: 'encounter',
                                isPremium: false,
                                link: '#'
                            });
                        }
                    });
                }
            }
        } catch (err) {
            console.error("Ilmoitustutka: Supabase haku epäonnistui", err);
        }

        // Lajittelu: Premium ensin, sitten tyyppi, sitten etäisyys
        const premiumItems = allWithDistance.filter(c => c.isPremium).sort((a, b) => a.distanceInKm - b.distanceInKm);
        const otherYritysOffers = allWithDistance.filter(c => !c.isPremium && c.type === 'offer');
        const otherYritysAds = allWithDistance.filter(c => !c.isPremium && c.type === 'ad');

        // Yhdistetään kaikki ilmoitukset (Feed ja Yritys)
        const allOffers = [...otherYritysOffers, ...sbOffers].sort((a, b) => a.distanceInKm - b.distanceInKm);
        const allAds = [...otherYritysAds, ...sbEncounters].sort((a, b) => a.distanceInKm - b.distanceInKm);
        
        const sorted = [...premiumItems, ...allOffers, ...allAds];

        const adCount = sorted.length;
        const othersToRetrieve = Math.max(0, 5 - adCount);

        const others = allWithDistance.filter(c => !c.isPremium && c.type === 'none')
            .sort((a, b) => a.distanceInKm - b.distanceInKm)
            .slice(0, othersToRetrieve);
        // Merkkaa others yritykseksi
        others.forEach(o => o.radarType = 'yritys');

        const combinedResults = [...sorted, ...others];

        renderRadarResults(premiumItems, allOffers, allAds, others);
        updateRadarMap(combinedResults);
    }

    function calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    function renderRadarResults(offers, ads, others) {
        const list = document.getElementById('radar-ads-list');
        if (offers.length === 0 && ads.length === 0 && others.length === 0) {
            list.innerHTML = "<p>Ei yrityksiä lähistöllä juuri nyt.</p>";
            return;
        }

        list.innerHTML = '';

        // Tärkeimmät tarjoukset
        offers.forEach(o => list.appendChild(createAdCard(o, 'offer')));

        // Ilmoitukset / Sloganit
        ads.forEach(a => list.appendChild(createAdCard(a, 'ad')));

        // Muut lähitienoot
        others.forEach(c => list.appendChild(createAdCard(c, 'none')));
    }

    function createAdCard(ad, type) {
        const distText = ad.distanceInKm < 1
            ? `${Math.round(ad.distanceInKm * 1000)} m`
            : `${ad.distanceInKm.toFixed(1)} km`;

        const card = document.createElement('div');
        card.className = `radar-ad-card is-${type}`;

        let badgeText = '📍 LÄHELLÄ';
        let badgeClass = 'badge-nearby';
        
        if (ad.radarType === 'feed_offer') {
            badgeText = '🏷️ FEED-TARJOUS';
            badgeClass = 'badge-offer';
        } else if (ad.radarType === 'encounter') {
            badgeText = '🤝 KOHTAAMINEN';
            badgeClass = 'badge-encounter';
        } else if (type === 'offer') {
            badgeText = '🔥 TARJOUS';
            badgeClass = 'badge-offer';
        } else if (type === 'ad') {
            badgeText = '📢 MAINOS';
            badgeClass = 'badge-ad';
        }

        let mainosText = ad.mainoslause || '';
        if (mainosText.includes('@@')) mainosText = mainosText.replace(/@@/g, '').trim();
        if (type === 'none' && !mainosText) mainosText = ad.kategoria || 'Yritys';

        let adLink = '#';
        if (ad.radarType === 'feed_offer' && ad.link && ad.link !== '#') {
            adLink = ad.link;
        } else if (ad.mainoslinkit) {
            try {
                const links = JSON.parse(ad.mainoslinkit);
                if (links && links.length > 0) {
                    adLink = links[0];
                    if (typeof cleanUrl === 'function') {
                        adLink = cleanUrl(adLink, true);
                    }
                }
            } catch (e) { }
        }

        let primaryBtnLink = '#';
        if (ad.radarType === 'feed_offer' || ad.radarType === 'encounter') {
            primaryBtnLink = '#'; // Ei välttämättä omaa sivua, voisi olla tietty haku/modal
        } else {
            primaryBtnLink = `${ad.isPremium ? 'yritys/' : ''}${ad.isPremium ? slugify(ad.nimi) + '.html' : 'yrityskortti.html?id=' + ad.id}`;
        }

        let primaryBtnHTML = '';
        if (ad.radarType === 'yritys' || !ad.radarType) {
           primaryBtnHTML = `<a href="${primaryBtnLink}" class="btn-small">Avaa</a>`;
        }

        card.innerHTML = `
            <div class="radar-ad-dist">${distText}</div>
            <div class="radar-ad-content">
                <div class="radar-ad-badge ${badgeClass}">${badgeText}</div>
                <h4>${ad.nimi}</h4>
                <p>${mainosText}</p>
                <div class="radar-ad-actions">
                    ${primaryBtnHTML}
                    ${(adLink !== '#') ? `<a href="${adLink}" target="_blank" class="btn-small secondary">Lue lisää</a>` : ''}
                </div>
            </div>
        `;
        return card;
    }

    function updateRadarMap(ads) {
        if (!typeof L === 'undefined') return;

        const mapCont = document.getElementById('radar-map-container');
        if (!mapCont) return;

        // Alustetaan kartta jos ei ole vielä
        if (!radarMap) {
            radarMap = L.map('radar-map-container').setView([userLat, userLon], 14);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap'
            }).addTo(radarMap);
            radarMarkers = L.featureGroup().addTo(radarMap);

            // Lisätään klikkauskuuntelija kartalle manuaalista valintaa varten
            radarMap.on('click', (e) => {
                userLat = e.latlng.lat;
                userLon = e.latlng.lng;
                processRadar();
            });
        } else {
            radarMap.setView([userLat, userLon], 14);
            radarMarkers.clearLayers();
        }

        // Käyttäjän marker
        L.circleMarker([userLat, userLon], {
            radius: 8,
            fillColor: "#007bff",
            color: "#fff",
            weight: 3,
            fillOpacity: 0.8
        }).addTo(radarMarkers).bindPopup("Olet tässä");

        // Ilmoitus-markerit
        ads.forEach(ad => {
            const color = (typeof categoryColors !== 'undefined' && categoryColors[ad.kategoria]) ? categoryColors[ad.kategoria] : '#ff9900';
            const marker = L.circleMarker([parseFloat(ad.lat), parseFloat(ad.lon)], {
                radius: 6,
                fillColor: color,
                color: "#fff",
                weight: 2,
                fillOpacity: 0.9
            }).addTo(radarMarkers);

            marker.bindPopup(`<b>${ad.nimi}</b><br>${ad.mainoslause}`);
        });

        if (ads.length > 0) {
            radarMap.fitBounds(radarMarkers.getBounds().pad(0.2));
        }
    }

    return {
        init: init
    };
})();

// Varmistetaan että allCompanies on ladattu ennen kuin tutka alustetaan täysin, 
// mutta nappi voidaan luoda heti
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', Ilmoitustutka.init);
} else {
    Ilmoitustutka.init();
}
