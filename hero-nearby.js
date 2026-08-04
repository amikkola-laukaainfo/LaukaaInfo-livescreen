/**
 * hero-nearby.js
 * "Lähelläsi" -paikkaverkkowidget hero-osuuteen.
 *
 * Mobiili: sijaintilupa pyydetään suoraan napin klikkauksesta
 * Desktop: näytetään osoitteen kirjoituskenttä + Nominatim-geokoodaus
 *
 * Molemmat reitit päätyvät: haversine-etäisyys → 5 lähintä → tietoa-paikasta.html?id=
 */

(function () {
    'use strict';

    const SB_URL = 'https://duxluwyqxvbmkkjzuzkz.supabase.co';
    const SB_KEY = 'sb_publishable_HgfWyipuSO7gvsVUR1smNQ_aXox2OPu';
    const PLACE_PAGE = 'tietoa-paikasta.html';
    const MAX_RESULTS = 5;

    // Fallback-paikat jos koordinaatteja ei saada / Supabase tyhjä
    const FALLBACK_PLACES = [
        { name: 'Lievestuoreen keskusta', id: 'lievestuore-keskusta' },
        { name: 'Peurunka', id: 'peurunka' },
        { name: 'Laukaan kirkko', id: 'laukaan-kirkko' },
        { name: 'Laukaan tori', id: 'laukaan-tori' },
        { name: 'Vehniä', id: 'vehnia' },
    ];

    // ─── Haversine ──────────────────────────────────────────────────────────────
    function haversineKm(lat1, lon1, lat2, lon2) {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a =
            Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) *
            Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    function fmtDist(km) {
        if (km < 1) return Math.round(km * 1000) + '\u00a0m';
        return km.toFixed(1).replace('.', ',') + '\u00a0km';
    }

    // ─── Supabase fetch ──────────────────────────────────────────────────────────
    async function fetchNearby(userLat, userLon) {
        if (!window.supabase) return null;
        const sbClient = window.supabase.createClient(SB_URL, SB_KEY);
        const { data, error } = await sbClient
            .from('places')
            .select('place_id, name, canonical_name, type, lat, lon')
            .not('lat', 'is', null)
            .not('lon', 'is', null)
            .limit(500);

        if (error || !data || data.length === 0) return null;

        return data
            .map(p => ({
                ...p,
                dist: haversineKm(userLat, userLon, p.lat, p.lon),
            }))
            .sort((a, b) => a.dist - b.dist)
            .slice(0, MAX_RESULTS);
    }

    // ─── Nominatim geocode (desktop) ─────────────────────────────────────────────
    async function geocodeAddress(query) {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=fi`;
        const res = await fetch(url, { headers: { 'Accept-Language': 'fi' } });
        const json = await res.json();
        if (!json || json.length === 0) return null;
        return { lat: parseFloat(json[0].lat), lon: parseFloat(json[0].lon), label: json[0].display_name };
    }

    // ─── Render ──────────────────────────────────────────────────────────────────
    function renderList(places, distLabel) {
        const trigger  = document.getElementById('nearby-trigger');
        const loading  = document.getElementById('nearby-loading');
        const listWrap = document.getElementById('nearby-list');
        const placeUl  = document.getElementById('nearby-places');
        const label    = document.getElementById('nearby-label');

        if (trigger)  trigger.hidden  = true;
        if (loading)  loading.hidden  = true;
        if (listWrap) listWrap.hidden = false;

        if (label) label.textContent = distLabel || 'Lähelläsi';

        placeUl.innerHTML = '';
        places.forEach((p, i) => {
            const li   = document.createElement('li');
            li.className = 'nearby-place-item';
            li.style.animationDelay = `${i * 60}ms`;

            const a = document.createElement('a');
            a.className = 'nearby-place-link';
            a.href = `${PLACE_PAGE}?id=${encodeURIComponent(p.place_id || p.id)}`;

            const nameSpan = document.createElement('span');
            nameSpan.className = 'nearby-place-name';
            nameSpan.textContent = p.canonical_name || p.name;

            a.appendChild(nameSpan);

            if (p.dist != null) {
                const distSpan = document.createElement('span');
                distSpan.className = 'nearby-place-dist';
                distSpan.textContent = fmtDist(p.dist);
                a.appendChild(distSpan);
            }

            li.appendChild(a);
            placeUl.appendChild(li);
        });
    }

    function renderFallback() {
        renderList(FALLBACK_PLACES.map(p => ({ place_id: p.id, name: p.name })), 'Tutki paikkoja');
    }

    function showLoading() {
        const trigger = document.getElementById('nearby-trigger');
        const loading = document.getElementById('nearby-loading');
        if (trigger) trigger.hidden = true;
        if (loading) loading.hidden = false;
    }

    function showError(msg) {
        const loading  = document.getElementById('nearby-loading');
        const errEl    = document.getElementById('nearby-error');
        if (loading) loading.hidden = true;
        if (errEl) {
            errEl.hidden = false;
            errEl.textContent = msg || 'Sijaintia ei saatu.';
        }
    }

    // ─── Main flow ───────────────────────────────────────────────────────────────
    async function handleGeoResult(lat, lon, label) {
        showLoading();
        try {
            const places = await fetchNearby(lat, lon);
            if (places && places.length > 0) {
                renderList(places, label || 'Lähelläsi');
            } else {
                renderFallback();
            }
        } catch (e) {
            console.error('hero-nearby: Supabase-haku epäonnistui', e);
            renderFallback();
        }
    }

    // Mobiili: geolocation suoraan
    async function startGeolocation() {
        if (!navigator.geolocation) {
            renderFallback();
            return;
        }
        showLoading();
        navigator.geolocation.getCurrentPosition(
            async pos => {
                await handleGeoResult(pos.coords.latitude, pos.coords.longitude, 'Lähelläsi');
            },
            err => {
                console.warn('hero-nearby: geolocation error', err);
                renderFallback();
            },
            { timeout: 8000, maximumAge: 60000 }
        );
    }

    // Desktop: osoitekenttä → Nominatim → paikat
    async function startAddressSearch(query) {
        if (!query || query.trim().length < 2) return;
        showLoading();
        try {
            const geo = await geocodeAddress(query + ' Laukaa');
            if (!geo) {
                showError('Osoitetta ei löydetty. Tarkista kirjoitusasu.');
                // Palauta kirjoituskenttä näkyviin
                const form = document.getElementById('nearby-desktop-form');
                const loading = document.getElementById('nearby-loading');
                if (loading) loading.hidden = true;
                if (form) form.hidden = false;
                return;
            }
            await handleGeoResult(geo.lat, geo.lon, query.trim());
        } catch (e) {
            console.error('hero-nearby: geocode error', e);
            renderFallback();
        }
    }

    // ─── isMobile check ──────────────────────────────────────────────────────────
    function isMobileDevice() {
        return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
               window.matchMedia('(max-width: 768px)').matches;
    }

    // ─── Init ────────────────────────────────────────────────────────────────────
    function init() {
        const trigger      = document.getElementById('nearby-trigger');
        const desktopForm  = document.getElementById('nearby-desktop-form');
        const desktopInput = document.getElementById('nearby-address-input');
        const desktopBtn   = document.getElementById('nearby-address-btn');

        if (!trigger) return; // Widget ei ole sivulla

        const mobile = isMobileDevice();

        // Mobiili: näytä trigger-nappi suoraan geo-kutsulle
        // Desktop: näytä trigger joka avaa tekstikentän
        if (mobile) {
            trigger.textContent = ''; // Aseta sisältö
            trigger.innerHTML = '<span class="nearby-pin-icon">📍</span> Lähelläsi';
            trigger.addEventListener('click', startGeolocation);
        } else {
            trigger.innerHTML = '<span class="nearby-pin-icon">📍</span> Tutki paikkoja';
            trigger.addEventListener('click', () => {
                trigger.hidden = true;
                if (desktopForm) desktopForm.hidden = false;
                if (desktopInput) desktopInput.focus();
            });
        }

        // Desktop form submit
        if (desktopBtn && desktopInput) {
            desktopBtn.addEventListener('click', () => {
                startAddressSearch(desktopInput.value);
            });
            desktopInput.addEventListener('keydown', e => {
                if (e.key === 'Enter') startAddressSearch(desktopInput.value);
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
