// =============================================================================
// mini-app.js — LaukaaInfo Mini (PWA)
// =============================================================================
(function () {
    'use strict';

    const SB_URL = 'https://duxluwyqxvbmkkjzuzkz.supabase.co';
    const SB_KEY = 'sb_publishable_HgfWyipuSO7gvsVUR1smNQ_aXox2OPu';
    const KSE_URL = 'https://keskisuomievents.fi/api/v1/event/?text=laukaa&start=today&sort=start_time&include=location&page_size=60';

    const STORAGE_KEYS = {
        AREA: 'laukaa_mini_area',
        FAVS: 'laukaa_mini_favorites',
        CACHE: 'laukaa_mini_cache_v1'
    };

    const AREAS = [
        { id: 'all', label: 'Koko Laukaa', lat: 62.414, lon: 25.952 },
        { id: 'laukaa_kk', label: 'Laukaan kirkonkylä', lat: 62.4141, lon: 25.9519, keys: ['laukaa', 'kirkonkylä', 'saraakallio', 'peurunka'] },
        { id: 'lievestuore', label: 'Lievestuore', lat: 62.2614, lon: 26.2055, keys: ['lievestuore', 'haarla', 'nokkakivi'] },
        { id: 'leppavesi', label: 'Leppävesi', lat: 62.3278, lon: 25.8442, keys: ['leppävesi', 'leppavesi'] },
        { id: 'vihtavuori', label: 'Vihtavuori', lat: 62.3711, lon: 25.9011, keys: ['vihtavuori'] },
        { id: 'aijala', label: 'Äijälä', lat: 62.495, lon: 26.075, keys: ['äijälä', 'aijala'] },
        { id: 'tarvaala', label: 'Tarvaala', lat: 62.390, lon: 26.040, keys: ['tarvaala'] }
    ];

    const state = {
        tab: 'home',
        area: localStorage.getItem(STORAGE_KEYS.AREA) || 'all',
        search: '',
        eventFilter: 'all', // all | today | week
        nearbyCat: 'all',   // all | place | company | story | event
        mapCat: 'all',
        gps: null,          // { lat, lon }
        favorites: loadFavorites(),
        places: [],
        events: [],
        stories: [],
        companies: [],
        leafletMap: null,
        deferredPrompt: null
    };

    function loadFavorites() {
        try {
            const raw = localStorage.getItem(STORAGE_KEYS.FAVS);
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch (_) {
            return [];
        }
    }

    function saveFavorites() {
        try {
            localStorage.setItem(STORAGE_KEYS.FAVS, JSON.stringify(state.favorites));
        } catch (_) {}
    }

    function esc(s) {
        if (s == null) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function distKm(lat1, lon1, lat2, lon2) {
        if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    function getRefCoords() {
        if (state.gps) return state.gps;
        const a = AREAS.find(x => x.id === state.area) || AREAS[0];
        return { lat: a.lat, lon: a.lon };
    }

    function matchesArea(itemText, lat, lon) {
        if (state.area === 'all') return true;
        const areaObj = AREAS.find(a => a.id === state.area);
        if (!areaObj) return true;
        const low = (itemText || '').toLowerCase();
        if (areaObj.keys && areaObj.keys.some(k => low.includes(k))) return true;
        if (lat != null && lon != null) {
            const d = distKm(areaObj.lat, areaObj.lon, lat, lon);
            if (d != null && d <= 8) return true;
        }
        return false;
    }

    function matchesSearch(item) {
        const q = state.search.trim().toLowerCase();
        if (!q) return true;
        const blob = `${item.title || ''} ${item.desc || ''} ${item.area || ''} ${item.category || ''}`.toLowerCase();
        return blob.includes(q);
    }

    function isFavorited(id) {
        return state.favorites.some(f => f.id === id);
    }

    function toggleFavorite(item) {
        const idx = state.favorites.findIndex(f => f.id === item.id);
        if (idx >= 0) {
            state.favorites.splice(idx, 1);
        } else {
            state.favorites.unshift({
                id: item.id,
                type: item.type,
                title: item.title,
                area: item.area || '',
                desc: item.desc || '',
                lat: item.lat ?? null,
                lon: item.lon ?? null,
                url: item.url || '',
                saved_at: new Date().toISOString().slice(0, 10)
            });
        }
        saveFavorites();
        render();
    }

    function allNormalizedItems() {
        const ref = getRefCoords();
        const combined = [
            ...state.events,
            ...state.places,
            ...state.stories,
            ...state.companies
        ];
        return combined.map(it => {
            const d = (it.lat != null && it.lon != null)
                ? distKm(ref.lat, ref.lon, Number(it.lat), Number(it.lon))
                : null;
            return Object.assign({}, it, { distanceKm: d });
        });
    }

    // -------------------------------------------------------------------------
    // Data-kerros: välimuistista heti -> taustalla päivitys
    // -------------------------------------------------------------------------
    function loadCache() {
        try {
            const raw = localStorage.getItem(STORAGE_KEYS.CACHE);
            if (!raw) return false;
            const c = JSON.parse(raw);
            if (Array.isArray(c.places)) state.places = c.places;
            if (Array.isArray(c.events)) state.events = c.events;
            if (Array.isArray(c.stories)) state.stories = c.stories;
            if (Array.isArray(c.companies)) state.companies = c.companies;
            return true;
        } catch (_) {
            return false;
        }
    }

    function saveCache() {
        try {
            localStorage.setItem(STORAGE_KEYS.CACHE, JSON.stringify({
                updatedAt: Date.now(),
                places: state.places.slice(0, 150),
                events: state.events.slice(0, 80),
                stories: state.stories.slice(0, 40),
                companies: state.companies.slice(0, 120)
            }));
        } catch (_) {}
    }

    async function sbFetch(path) {
        const res = await fetch(SB_URL + path, {
            headers: {
                apikey: SB_KEY,
                Authorization: 'Bearer ' + SB_KEY
            }
        });
        if (!res.ok) return [];
        const json = await res.json();
        return Array.isArray(json) ? json : [];
    }

    async function refreshData() {
        const statusEl = document.getElementById('mini-status-text');
        if (statusEl) statusEl.textContent = 'Päivitetään tietoja...';

        const [placesRaw, postsRaw, kseRaw, visitRaw, compRaw] = await Promise.allSettled([
            sbFetch('/rest/v1/places?select=*&limit=200'),
            sbFetch('/rest/v1/posts?select=id,type,title,description,place_id,municipality,status,visibility,created_at&type=in.(INFO,knowledge,article)&order=created_at.desc&limit=40'),
            fetch(KSE_URL).then(r => r.ok ? r.json() : null).catch(() => null),
            fetch('../tapahtumat_geo.json').then(r => r.ok ? r.json() : []).catch(() => []),
            fetch('../companies_data.json').then(r => r.ok ? r.json() : []).catch(() => [])
        ]);

        const storyByPlaceId = {};
        if (postsRaw.status === 'fulfilled' && postsRaw.value.length) {
            state.stories = postsRaw.value
                .filter(p => p && p.title && (!p.status || p.status === 'published') && p.visibility !== 'private')
                .map(p => {
                    if (p.place_id && !storyByPlaceId[p.place_id]) {
                        storyByPlaceId[p.place_id] = p.id;
                    }
                    return {
                        id: 'story:' + p.id,
                        place_id: p.place_id || null,
                        type: 'story',
                        badge: '📖 Tietokortti',
                        badgeClass: 'badge-story',
                        title: p.title,
                        area: p.municipality || 'Laukaa',
                        desc: (p.description || 'Paikallinen tietokortti ja taustatarina.').replace(/<[^>]+>/g, ''),
                        lat: null,
                        lon: null,
                        url: `../tietokortti.html?id=${encodeURIComponent(p.id)}`
                    };
                });
        }

        if (placesRaw.status === 'fulfilled' && placesRaw.value.length) {
            state.places = placesRaw.value
                .filter(p => p && (p.name || p.canonical_name))
                .map(p => {
                    const pid = p.place_id || p.id;
                    const linkedPostId = storyByPlaceId[pid];
                    return {
                        id: 'place:' + pid,
                        place_id: pid,
                        type: 'place',
                        badge: '📍 Paikka',
                        badgeClass: 'badge-place',
                        title: p.name || p.canonical_name,
                        area: p.municipality || 'Laukaa',
                        category: p.category || '',
                        desc: p.description || p.category || 'Paikallinen kohde Laukaassa',
                        lat: p.lat != null ? Number(p.lat) : null,
                        lon: p.lon != null ? Number(p.lon) : null,
                        url: linkedPostId
                            ? `../tietokortti.html?id=${encodeURIComponent(linkedPostId)}`
                            : `../tietokortti.html?place=${encodeURIComponent(pid)}&theme=yleinen`
                    };
                });
        }

        const mergedEvents = [];
        if (kseRaw.status === 'fulfilled' && kseRaw.value && Array.isArray(kseRaw.value.data)) {
            kseRaw.value.data.forEach(ev => {
                const name = ev.name?.fi || ev.name?.en || '';
                if (!name) return;
                const loc = ev.location || {};
                const coords = loc.position?.coordinates;
                const lon = Array.isArray(coords) ? Number(coords[0]) : null;
                const lat = Array.isArray(coords) ? Number(coords[1]) : null;
                mergedEvents.push({
                    id: 'event:kse-' + ev.id,
                    type: 'event',
                    badge: '📅 Tapahtuma',
                    badgeClass: 'badge-event',
                    title: name,
                    area: loc.name?.fi || loc.street_address?.fi || 'Laukaa',
                    dateStr: ev.start_time ? new Date(ev.start_time).toLocaleDateString('fi-FI') : '',
                    startTs: ev.start_time ? new Date(ev.start_time).getTime() : null,
                    desc: (ev.short_description?.fi || '').replace(/<[^>]+>/g, ''),
                    lat: (lat && lon && distKm(62.414, 25.952, lat, lon) <= 100) ? lat : null,
                    lon: (lat && lon && distKm(62.414, 25.952, lat, lon) <= 100) ? lon : null,
                    url: ev.info_url?.fi || '../tapahtumakartta.html'
                });
            });
        }
        if (visitRaw.status === 'fulfilled' && Array.isArray(visitRaw.value)) {
            visitRaw.value.slice(0, 40).forEach((ev, idx) => {
                if (!ev || !ev.nimi) return;
                const lat = ev.lat != null ? Number(ev.lat) : null;
                const lon = ev.lng != null ? Number(ev.lng) : null;
                const validCoord = lat != null && lon != null && distKm(62.414, 25.952, lat, lon) <= 100;
                mergedEvents.push({
                    id: 'event:visit-' + idx + '-' + ev.nimi.slice(0, 12),
                    type: 'event',
                    badge: '📅 Tapahtuma',
                    badgeClass: 'badge-event',
                    title: ev.nimi,
                    area: ev.paikka || 'Laukaa',
                    dateStr: ev.aika || '',
                    startTs: null,
                    desc: ev.aika ? `${ev.aika}${ev.paikka ? ' • ' + ev.paikka : ''}` : (ev.paikka || ''),
                    lat: validCoord ? lat : null,
                    lon: validCoord ? lon : null,
                    url: ev.url || '../tapahtumakartta.html'
                });
            });
        }
        if (mergedEvents.length) state.events = mergedEvents;

        if (compRaw.status === 'fulfilled' && Array.isArray(compRaw.value)) {
            state.companies = compRaw.value
                .filter(c => c && (c.nimi || c.name))
                .slice(0, 120)
                .map(c => ({
                    id: 'company:' + (c.id || c.slug || c.nimi),
                    type: 'company',
                    badge: '🏢 Palvelu',
                    badgeClass: 'badge-company',
                    title: c.nimi || c.name,
                    area: c.alue || c.paikkakunta || c.osoite || 'Laukaa',
                    category: c.kategoria || '',
                    desc: c.kuvaus || c.kategoria || 'Paikallinen yritys tai palvelu',
                    lat: c.lat != null ? Number(c.lat) : null,
                    lon: (c.lon ?? c.lng) != null ? Number(c.lon ?? c.lng) : null,
                    url: c.id ? `../kohdekortti.html?id=${encodeURIComponent(c.id)}` : '../index.html'
                }));
        }

        saveCache();
        if (statusEl) statusEl.textContent = state.gps ? 'GPS-etäisyydet päällä' : 'Laukaa lähelläsi';
        render();
    }

    // -------------------------------------------------------------------------
    // Renderöinti
    // -------------------------------------------------------------------------
    function renderCard(item) {
        const saved = isFavorited(item.id);
        const distText = item.distanceKm != null ? `${item.distanceKm.toFixed(1)} km` : '';
        return `
            <article class="mini-card" data-open-id="${esc(item.id)}">
                <div class="mini-card-body">
                    <div class="mini-card-meta">
                        <span class="badge ${esc(item.badgeClass || '')}">${esc(item.badge || '')}</span>
                        ${item.area ? `<span>📍 ${esc(item.area)}</span>` : ''}
                        ${distText ? `<span>• ${esc(distText)}</span>` : ''}
                    </div>
                    <h4 class="mini-card-title">${esc(item.title)}</h4>
                    ${item.desc ? `<div class="mini-card-desc">${esc(item.desc)}</div>` : ''}
                </div>
                <button class="fav-btn ${saved ? 'saved' : ''}" data-fav-id="${esc(item.id)}" type="button" title="Tallenna suosikkeihin">
                    ${saved ? '★' : '☆'}
                </button>
            </article>
        `;
    }

    function renderHome(items) {
        const areaObj = AREAS.find(a => a.id === state.area) || AREAS[0];
        const filtered = items.filter(it => matchesSearch(it) && matchesArea(`${it.title} ${it.area} ${it.desc}`, it.lat, it.lon));
        const events = filtered.filter(i => i.type === 'event').slice(0, 4);
        const stories = filtered.filter(i => i.type === 'story').slice(0, 3);
        const places = filtered
            .filter(i => i.type === 'place' || i.type === 'company')
            .sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999))
            .slice(0, 5);

        return `
            <div class="section-header">
                <span class="section-title">Ajankohtaista • ${esc(areaObj.label)}</span>
                <button class="section-link" data-jump-tab="events" type="button">Kaikki tapahtumat →</button>
            </div>
            <div class="cards-stack">
                ${events.length ? events.map(renderCard).join('') : '<div class="empty-box">Ei tapahtumia valitulle alueelle juuri nyt.</div>'}
            </div>

            <div class="section-header">
                <span class="section-title">Lähellä &amp; palvelut</span>
                <button class="section-link" data-jump-tab="nearby" type="button">Näytä kaikki →</button>
            </div>
            <div class="cards-stack">
                ${places.length ? places.map(renderCard).join('') : '<div class="empty-box">Ei kohteita hakuehdoilla.</div>'}
            </div>

            <div class="section-header">
                <span class="section-title">Paikallisia tietokortteja</span>
            </div>
            <div class="cards-stack">
                ${stories.length ? stories.map(renderCard).join('') : '<div class="empty-box">Ei julkaistuja tietokortteja valitulle alueelle.</div>'}
            </div>
        `;
    }

    function renderNearby(items) {
        const cats = [
            { id: 'all', label: 'Kaikki' },
            { id: 'place', label: '📍 Paikat' },
            { id: 'company', label: '🏢 Yritykset' },
            { id: 'event', label: '📅 Tapahtumat' },
            { id: 'story', label: '📖 Tietokortit' }
        ];
        const list = items
            .filter(it => (state.nearbyCat === 'all' || it.type === state.nearbyCat))
            .filter(it => matchesSearch(it))
            .filter(it => matchesArea(`${it.title} ${it.area} ${it.desc}`, it.lat, it.lon))
            .sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999))
            .slice(0, 40);

        return `
            <div class="chips-row">
                ${cats.map(c => `<button class="chip ${state.nearbyCat === c.id ? 'active' : ''}" data-nearby-cat="${c.id}" type="button">${c.label}</button>`).join('')}
            </div>
            <div class="section-header">
                <span class="section-title">Kohteet (${list.length})</span>
            </div>
            <div class="cards-stack">
                ${list.length ? list.map(renderCard).join('') : '<div class="empty-box">Ei osumia tällä suodatuksella.</div>'}
            </div>
        `;
    }

    function renderEvents(items) {
        const now = Date.now();
        const dayEnd = new Date();
        dayEnd.setHours(23, 59, 59, 999);
        const weekEnd = now + 7 * 86400 * 1000;

        const list = items
            .filter(it => it.type === 'event' && matchesSearch(it))
            .filter(it => {
                if (state.eventFilter === 'today') return it.startTs && it.startTs <= dayEnd.getTime();
                if (state.eventFilter === 'week') return !it.startTs || it.startTs <= weekEnd;
                return true;
            })
            .slice(0, 50);

        return `
            <div class="chips-row">
                <button class="chip ${state.eventFilter === 'all' ? 'active' : ''}" data-ev-filter="all" type="button">Kaikki</button>
                <button class="chip ${state.eventFilter === 'today' ? 'active' : ''}" data-ev-filter="today" type="button">Tänään</button>
                <button class="chip ${state.eventFilter === 'week' ? 'active' : ''}" data-ev-filter="week" type="button">Seuraavat 7 vrk</button>
            </div>
            <div class="section-header">
                <span class="section-title">Tapahtumat (${list.length})</span>
                <a class="section-link" href="../tapahtumakartta.html" style="text-decoration:none;">Avaa iso kartta →</a>
            </div>
            <div class="cards-stack">
                ${list.length ? list.map(renderCard).join('') : '<div class="empty-box">Ei tapahtumia valitulla aikavälillä.</div>'}
            </div>
        `;
    }

    function renderFavorites() {
        const favs = state.favorites.filter(matchesSearch);
        return `
            <div class="section-header">
                <span class="section-title">Tallennetut suosikit (${favs.length})</span>
            </div>
            <div class="cards-stack">
                ${favs.length
                    ? favs.map(renderCard).join('')
                    : '<div class="empty-box">Et ole vielä tallentanut kohteita. Napauta ☆-painiketta missä tahansa kortissa tallentaaksesi sen laitteellesi.</div>'}
            </div>
        `;
    }

    function renderMap(items) {
        const cats = [
            { id: 'all', label: 'Kaikki' },
            { id: 'place', label: '📍 Paikat' },
            { id: 'company', label: '🏢 Palvelut' },
            { id: 'event', label: '📅 Tapahtumat' }
        ];
        return `
            <div class="chips-row">
                ${cats.map(c => `<button class="chip ${state.mapCat === c.id ? 'active' : ''}" data-map-cat="${c.id}" type="button">${c.label}</button>`).join('')}
            </div>
            <div id="mini-map-wrap"><div id="mini-map"></div></div>
        `;
    }

    function initLeafletMap(items) {
        const mapEl = document.getElementById('mini-map');
        if (!mapEl || typeof L === 'undefined') return;
        const ref = getRefCoords();
        if (state.leafletMap) {
            state.leafletMap.remove();
            state.leafletMap = null;
        }
        const map = L.map('mini-map').setView([ref.lat, ref.lon], state.area === 'all' ? 11 : 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap',
            maxZoom: 18
        }).addTo(map);

        const geoItems = items.filter(it =>
            it.lat != null && it.lon != null &&
            (state.mapCat === 'all' || it.type === state.mapCat) &&
            matchesSearch(it)
        ).slice(0, 150);

        geoItems.forEach(it => {
            const m = L.marker([it.lat, it.lon]).addTo(map);
            m.bindPopup(`<strong>${esc(it.title)}</strong><br><small>${esc(it.area || '')}</small><br><a href="#" data-popup-id="${esc(it.id)}">Avaa esikatselu →</a>`);
            m.on('popupopen', () => {
                const link = document.querySelector(`[data-popup-id="${CSS.escape(it.id)}"]`);
                if (link) {
                    link.addEventListener('click', e => {
                        e.preventDefault();
                        openDetailSheet(it);
                    });
                }
            });
        });
        state.leafletMap = map;
    }

    function render() {
        const container = document.getElementById('mini-content');
        if (!container) return;

        const areaObj = AREAS.find(a => a.id === state.area) || AREAS[0];
        const areaLbl = document.getElementById('current-area-label');
        if (areaLbl) areaLbl.textContent = areaObj.label;

        const items = allNormalizedItems();
        if (state.tab === 'home') container.innerHTML = renderHome(items);
        else if (state.tab === 'nearby') container.innerHTML = renderNearby(items);
        else if (state.tab === 'events') container.innerHTML = renderEvents(items);
        else if (state.tab === 'favorites') container.innerHTML = renderFavorites();
        else if (state.tab === 'map') {
            container.innerHTML = renderMap(items);
            setTimeout(() => initLeafletMap(items), 30);
        }

        document.querySelectorAll('.nav-item').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === state.tab);
        });
    }

    // -------------------------------------------------------------------------
    // Bottom Sheet (kohteen esikatselu) & aluevalinta
    // -------------------------------------------------------------------------
    function openDetailSheet(item) {
        const sheet = document.getElementById('detail-sheet');
        const body = document.getElementById('detail-sheet-body');
        if (!sheet || !body || !item) return;

        const saved = isFavorited(item.id);
        const navUrl = (item.lat != null && item.lon != null)
            ? `https://www.google.com/maps/dir/?api=1&destination=${item.lat},${item.lon}`
            : null;

        body.innerHTML = `
            <div class="sheet-handle"></div>
            <div class="mini-card-meta">
                <span class="badge ${esc(item.badgeClass || '')}">${esc(item.badge || '')}</span>
                ${item.area ? `<span>📍 ${esc(item.area)}</span>` : ''}
                ${item.distanceKm != null ? `<span>• ${item.distanceKm.toFixed(1)} km</span>` : ''}
            </div>
            <h3 style="font-family:'Outfit',sans-serif;margin:0.25rem 0 0.5rem 0;">${esc(item.title)}</h3>
            <p style="font-size:0.86rem;color:var(--muted);line-height:1.5;margin:0 0 0.75rem 0;">${esc(item.desc || 'Paikallinen kohde LaukaaInfossa.')}</p>
            <div class="sheet-actions">
                <button id="sheet-fav-btn" class="btn-secondary" type="button">${saved ? '★ Tallennettu' : '☆ Tallenna'}</button>
                ${navUrl ? `<a class="btn-secondary" href="${esc(navUrl)}" target="_blank" rel="noopener">🧭 Reittiohjeet</a>` : `<button id="sheet-share-btn" class="btn-secondary" type="button">📤 Jaa</button>`}
            </div>
            <div style="display:flex;gap:0.6rem;margin-top:0.6rem;">
                ${item.url ? `<a class="btn-primary" href="${esc(item.url)}" style="flex:1;">Lue lisää →</a>` : ''}
                <button id="sheet-close-btn" class="btn-secondary" type="button">Sulje</button>
            </div>
        `;

        sheet.classList.add('open');
        document.getElementById('sheet-fav-btn')?.addEventListener('click', () => {
            toggleFavorite(item);
            openDetailSheet(item);
        });
        document.getElementById('sheet-share-btn')?.addEventListener('click', () => {
            if (navigator.share) {
                navigator.share({ title: item.title, text: item.desc || item.title, url: window.location.href }).catch(() => {});
            }
        });
        document.getElementById('sheet-close-btn')?.addEventListener('click', () => sheet.classList.remove('open'));
    }

    function openAreaSheet() {
        const sheet = document.getElementById('area-sheet');
        const grid = document.getElementById('area-options-grid');
        if (!sheet || !grid) return;
        grid.innerHTML = AREAS.map(a => `
            <button class="area-opt ${state.area === a.id ? 'active' : ''}" data-pick-area="${a.id}" type="button">
                📍 ${esc(a.label)}
            </button>
        `).join('');
        sheet.classList.add('open');
    }

    // -------------------------------------------------------------------------
    // Tapahtumakuuntelijat
    // -------------------------------------------------------------------------
    document.addEventListener('click', e => {
        const navBtn = e.target.closest('.nav-item');
        if (navBtn) {
            state.tab = navBtn.dataset.tab;
            render();
            return;
        }

        const favBtn = e.target.closest('[data-fav-id]');
        if (favBtn) {
            e.stopPropagation();
            const id = favBtn.dataset.favId;
            const item = allNormalizedItems().find(x => x.id === id) || state.favorites.find(x => x.id === id);
            if (item) toggleFavorite(item);
            return;
        }

        const card = e.target.closest('[data-open-id]');
        if (card) {
            const id = card.dataset.openId;
            const item = allNormalizedItems().find(x => x.id === id) || state.favorites.find(x => x.id === id);
            if (item) openDetailSheet(item);
            return;
        }

        const jump = e.target.closest('[data-jump-tab]');
        if (jump) {
            state.tab = jump.dataset.jumpTab;
            render();
            return;
        }

        const nCat = e.target.closest('[data-nearby-cat]');
        if (nCat) {
            state.nearbyCat = nCat.dataset.nearbyCat;
            render();
            return;
        }

        const eFil = e.target.closest('[data-ev-filter]');
        if (eFil) {
            state.eventFilter = eFil.dataset.evFilter;
            render();
            return;
        }

        const mCat = e.target.closest('[data-map-cat]');
        if (mCat) {
            state.mapCat = mCat.dataset.mapCat;
            render();
            return;
        }

        const pickArea = e.target.closest('[data-pick-area]');
        if (pickArea) {
            state.area = pickArea.dataset.pickArea;
            localStorage.setItem(STORAGE_KEYS.AREA, state.area);
            document.getElementById('area-sheet')?.classList.remove('open');
            render();
            return;
        }
    });

    document.getElementById('btn-area-picker')?.addEventListener('click', openAreaSheet);
    document.getElementById('btn-close-area')?.addEventListener('click', () => {
        document.getElementById('area-sheet')?.classList.remove('open');
    });
    document.getElementById('area-sheet')?.addEventListener('click', e => {
        if (e.target.id === 'area-sheet') e.target.classList.remove('open');
    });
    document.getElementById('detail-sheet')?.addEventListener('click', e => {
        if (e.target.id === 'detail-sheet') e.target.classList.remove('open');
    });

    document.getElementById('mini-search')?.addEventListener('input', e => {
        state.search = e.target.value || '';
        render();
    });

    document.getElementById('btn-gps-toggle')?.addEventListener('click', () => {
        const btn = document.getElementById('btn-gps-toggle');
        if (state.gps) {
            state.gps = null;
            btn?.classList.remove('active');
            render();
            return;
        }
        if (!navigator.geolocation) {
            alert('Selain ei tue sijaintia.');
            return;
        }
        navigator.geolocation.getCurrentPosition(
            pos => {
                state.gps = { lat: pos.coords.latitude, lon: pos.coords.longitude };
                btn?.classList.add('active');
                state.tab = 'nearby';
                render();
            },
            () => alert('Sijainnin haku estetty. Voit käyttää aluevalintaa ylhäältä.')
        );
    });

    // PWA-asennusbanneri (Android beforeinstallprompt + iOS Safari -ohje)
    const isStandalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent || '');

    window.addEventListener('beforeinstallprompt', e => {
        e.preventDefault();
        state.deferredPrompt = e;
        document.getElementById('install-banner')?.classList.add('show');
    });

    if (isIos && !isStandalone && !localStorage.getItem('laukaa_mini_ios_dismissed')) {
        const banner = document.getElementById('install-banner');
        const titleEl = document.getElementById('install-banner-title');
        const descEl = document.getElementById('install-banner-desc');
        const actBtn = document.getElementById('btn-install-app');
        const disBtn = document.getElementById('btn-dismiss-install');
        if (titleEl) titleEl.textContent = 'Lisää iPhonen kotinäyttöön';
        if (descEl) descEl.innerHTML = 'Paina Safarin <strong>Jaa (↑)</strong> → <strong>Lisää kotinäyttöön</strong>.';
        if (actBtn) actBtn.textContent = 'Ohje';
        if (disBtn) disBtn.style.display = '';
        banner?.classList.add('show');
    }

    document.getElementById('btn-dismiss-install')?.addEventListener('click', () => {
        localStorage.setItem('laukaa_mini_ios_dismissed', '1');
        document.getElementById('install-banner')?.classList.remove('show');
    });

    document.getElementById('btn-install-app')?.addEventListener('click', async () => {
        if (state.deferredPrompt) {
            state.deferredPrompt.prompt();
            await state.deferredPrompt.userChoice;
            state.deferredPrompt = null;
            document.getElementById('install-banner')?.classList.remove('show');
            return;
        }
        if (isIos) {
            const sheet = document.getElementById('detail-sheet');
            const body = document.getElementById('detail-sheet-body');
            if (sheet && body) {
                body.innerHTML = `
                    <div class="sheet-handle"></div>
                    <h3 style="font-family:'Outfit',sans-serif;margin:0 0 0.5rem 0;">📱 Asenna LaukaaInfo Mini iPhoneen</h3>
                    <ol style="font-size:0.86rem;color:var(--muted);line-height:1.6;padding-left:1.2rem;margin:0 0 1rem 0;">
                        <li>Varmista, että sivu on auki <strong>Safarissa</strong> (<code>laukaainfo.fi/mini/</code>).</li>
                        <li>Paina alareunan tai yläreunan <strong>Jaa</strong>-kuvaketta (neliö ja nuoli ylöspäin).</li>
                        <li>Valitse listasta <strong>Lisää kotinäyttöön</strong>.</li>
                        <li>Jätä <em>Avaa verkkosovelluksena</em> päälle ja paina <strong>Lisää</strong>.</li>
                    </ol>
                    <button id="ios-guide-close" class="btn-primary" type="button" style="width:100%;">Selvä, sulje</button>
                `;
                sheet.classList.add('open');
                document.getElementById('ios-guide-close')?.addEventListener('click', () => sheet.classList.remove('open'));
            }
        }
    });

    // Käynnistys: välimuistista heti -> taustalla päivitys
    if (loadCache()) render();
    refreshData();
})();

