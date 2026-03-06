/**
 * Mainostutka (Ad Radar) - LaukaaInfo
 * Etsii ja näyttää lähellä olevat yritykset, joilla on mainos tai tarjous.
 */

const Mainostutka = (function () {
    let userLat = null;
    let userLon = null;
    let radarMap = null;
    let radarMarkers = null;

    function init() {
        console.log("Mainostutka alustetaan...");
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
                    <span>📍</span> Mainostutka – Näytä lähellä olevat tarjoukset
                </button>
            </div>
            <div id="radar-results-container" class="radar-results-hidden">
                <div class="radar-header">
                    <h3>Lähialueen tarjoukset</h3>
                    <button id="close-radar-btn" class="btn-close-radar">&times;</button>
                </div>
                <div id="radar-map-container" class="radar-map-view"></div>
                <div id="radar-ads-list" class="radar-ads-grid">
                    <p class="loading-text">Paiinitetaan sijaintia...</p>
                </div>
            </div>
        `;

        container.appendChild(radarWrapper);

        document.getElementById('radar-trigger-btn').addEventListener('click', startRadar);
        document.getElementById('close-radar-btn').addEventListener('click', closeRadar);
    }

    function startRadar() {
        const results = document.getElementById('radar-results-container');
        results.classList.remove('radar-results-hidden');
        results.classList.add('radar-results-visible');

        results.scrollIntoView({ behavior: 'smooth', block: 'start' });

        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    userLat = position.coords.latitude;
                    userLon = position.coords.longitude;
                    processRadar();
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

    function closeRadar() {
        const results = document.getElementById('radar-results-container');
        results.classList.remove('radar-results-visible');
        results.classList.add('radar-results-hidden');
    }

    function processRadar() {
        if (typeof allCompanies === 'undefined') return;

        // Lasketaan etäisyys kaikille yrityksille joilla on koordinaatit
        const allWithDistance = allCompanies.filter(c => c.lat && c.lon).map(c => {
            const dist = calculateDistance(userLat, userLon, parseFloat(c.lat), parseFloat(c.lon));
            const hasTagAd = (c.mainoslause && c.mainoslause.trim().length > 0);
            const hasLinkAd = (c.mainoslinkit && c.mainoslinkit.length > 2);
            return { ...c, distanceInKm: dist, hasAd: (hasTagAd || hasLinkAd) };
        });

        // Erotetaan mainokset ja muut
        const ads = allWithDistance.filter(c => c.hasAd).sort((a, b) => a.distanceInKm - b.distanceInKm);
        const others = allWithDistance.filter(c => !c.hasAd).sort((a, b) => a.distanceInKm - b.distanceInKm).slice(0, 5);

        const combinedResults = [...ads, ...others];

        renderRadarResults(ads, others);
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

    function renderRadarResults(ads, others) {
        const list = document.getElementById('radar-ads-list');
        if (ads.length === 0 && others.length === 0) {
            list.innerHTML = "<p>Ei yrityksiä lähistöllä juuri nyt.</p>";
            return;
        }

        list.innerHTML = '';

        // Lisätään mainokset ensin
        ads.forEach(ad => {
            list.appendChild(createAdCard(ad, true));
        });

        // Lisätään muut
        others.forEach(company => {
            list.appendChild(createAdCard(company, false));
        });
    }

    function createAdCard(ad, isAd) {
        const distText = ad.distanceInKm < 1
            ? `${Math.round(ad.distanceInKm * 1000)} m`
            : `${ad.distanceInKm.toFixed(1)} km`;

        const card = document.createElement('div');
        card.className = `radar-ad-card ${isAd ? 'is-hot-ad' : 'is-normal'}`;

        let mainosText = ad.mainoslause || '';
        if (mainosText.includes('@@')) mainosText = mainosText.split('@@')[0];
        if (!isAd && !mainosText) mainosText = ad.kategoria || 'Yritys';

        let adLink = '#';
        if (ad.mainoslinkit) {
            try {
                const links = JSON.parse(ad.mainoslinkit);
                if (links && links.length > 0) adLink = links[0];
            } catch (e) { }
        }

        card.innerHTML = `
            <div class="radar-ad-dist">${distText}</div>
            <div class="radar-ad-content">
                <div class="radar-ad-badge">${isAd ? '🔥 TARJOUS' : '📍 LÄHELLÄ'}</div>
                <h4>${ad.nimi}</h4>
                <p>${mainosText}</p>
                <div class="radar-ad-actions">
                    <a href="yrityskortti.html?id=${ad.id}" class="btn-small">Avaa</a>
                    ${(isAd && adLink !== '#') ? `<a href="${adLink}" target="_blank" class="btn-small secondary">Tarjous</a>` : ''}
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

        // Mainos-markerit
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
    document.addEventListener('DOMContentLoaded', Mainostutka.init);
} else {
    Mainostutka.init();
}
