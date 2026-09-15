/**
 * reitti-kehitys.js – Elämyspolun Audio-kehitysversio
 *
 * Arkkitehtuuri:
 *   ┌─ reitti.js GPS-moottori (täysi kopio) ─────────────────────────────┐
 *   │   handlePointAudio()  →  WARNING-ääni  →  AudioEngine.speak()      │
 *   │   markPointArrived()  →  ARRIVED-ääni  →  openAudioArrivalModal()  │
 *   └────────────────────────────────────────────────────────────────────┘
 *
 * AudioEngine kuuntelee GPS-moottorin tapahtumia — ei omaa GPS-silmukkaa.
 * Debug-simulaattori (?debug=1) kutsuu samoja funktioita kuin oikea GPS.
 *
 * GPS käynnistyy vasta "Aloita elämyspolku" -painikkeesta (audio autoplay -syistä).
 */

document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const routeId = urlParams.get('id');

    const isResetLocks = urlParams.get('reset') === '1' || urlParams.get('reset') === 'true' || urlParams.get('reset_locks') === '1';
    if (isResetLocks) {
        try {
            Object.keys(localStorage).forEach(key => {
                if (key.startsWith('unlocked_point_')) {
                    localStorage.removeItem(key);
                }
            });
        } catch(e) {}
    }

    const isEmbed = urlParams.get('embed') === '1' || urlParams.get('embed') === 'true';
    if (isEmbed) {
        document.body.classList.add('is-embed-mode');
        const standaloneUrl = window.location.href.replace(/([?&])embed=[^&]*&?/, '$1').replace(/[?&]$/, '');
        const badge = document.createElement('a');
        badge.className = 'embed-badge';
        badge.href = standaloneUrl;
        badge.target = '_blank';
        badge.rel = 'noopener noreferrer';
        badge.innerHTML = 'LaukaaInfo.fi <span class="iconify" data-icon="material-symbols:open-in-new"></span>';
        document.body.appendChild(badge);
    }

    // Smart Palaa-button handler
    const backBtn = document.getElementById('back-link');
    if (backBtn) {
        backBtn.addEventListener('click', (e) => {
            const ref = document.referrer;
            const host = window.location.hostname;
            if (ref && (ref.includes('laukaainfo.fi') || (host && ref.includes(host)))) {
                if (window.history.length > 1) {
                    e.preventDefault();
                    window.history.back();
                }
            }
        });
    }

    if (!routeId) {
        document.getElementById('route-title').textContent = 'Reittiä ei löytynyt';
        return;
    }

    const AI_SUPABASE_URL = 'https://duxluwyqxvbmkkjzuzkz.supabase.co';
    const AI_SUPABASE_KEY = 'sb_publishable_HgfWyipuSO7gvsVUR1smNQ_aXox2OPu';
    const supabase = window.supabase.createClient(AI_SUPABASE_URL, AI_SUPABASE_KEY);

    const ADMIN_PASSWORDS = ['admin', 'admin123', 'laukaa-admin', 'suunnittelija', 'master'];
    let isAdminMode = urlParams.get('admin') === '1' ||
                      urlParams.get('admin') === 'true' ||
                      urlParams.get('mode') === 'admin' ||
                      urlParams.get('admin_mode') === '1' ||
                      urlParams.get('preview') === 'all';

    let currentRouteData = null;

    // Follow-me / Auto-center state
    let isFollowingUser = false;
    let isFirstPosition = true;
    let lastUserLat = null;
    let lastUserLng = null;

    // ─── AUDIO-MOOTTORI ─────────────────────────────────────────────────────────
    // Ohut tapahtumakuuntelija — ei omaa GPS-/tilakonetta.

    const AudioEngine = {
        audioCtx: null,
        isMuted: false,
        isInitialized: false,
        currentAudio: null,
        isPlayingStory: false,

        init() {
            if (this.isInitialized) return;
            try {
                const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
                if (AudioCtxClass) {
                    this.audioCtx = new AudioCtxClass();
                    if (this.audioCtx.state === 'suspended') {
                        this.audioCtx.resume().catch(() => {});
                    }
                }
            } catch(e) {
                console.warn('[AudioEngine] AudioContext init error:', e);
            }
            // SpeechSynthesis: laukaistaan kerran käyttäjän kosketuksen yhteydessä
            if ('speechSynthesis' in window) {
                try {
                    window.speechSynthesis.cancel();
                    const dummy = new SpeechSynthesisUtterance('');
                    dummy.volume = 0.001;
                    window.speechSynthesis.speak(dummy);
                } catch(e) {}
            }
            this.isInitialized = true;
            console.log('[AudioEngine] Initialized.');
        },

        playChime(type = 'warning') {
            if (this.isMuted || !this.audioCtx) return;
            try {
                if (this.audioCtx.state === 'suspended') this.audioCtx.resume().catch(() => {});
                const osc  = this.audioCtx.createOscillator();
                const gain = this.audioCtx.createGain();
                osc.connect(gain);
                gain.connect(this.audioCtx.destination);
                const now = this.audioCtx.currentTime;
                if (type === 'warning') {
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(523.25, now);        // C5
                    osc.frequency.setValueAtTime(659.25, now + 0.15); // E5
                    gain.gain.setValueAtTime(0.18, now);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
                    osc.start(now); osc.stop(now + 0.5);
                } else if (type === 'arrival') {
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(523.25, now);        // C5
                    osc.frequency.setValueAtTime(659.25, now + 0.15); // E5
                    osc.frequency.setValueAtTime(783.99, now + 0.30); // G5
                    gain.gain.setValueAtTime(0.22, now);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
                    osc.start(now); osc.stop(now + 0.8);
                }
            } catch(e) {
                console.warn('[AudioEngine] Chime error:', e);
            }
        },

        speak(text, onEndCallback = null) {
            if (this.isMuted || !('speechSynthesis' in window) || !text) return;
            try {
                window.speechSynthesis.cancel();
                const utter = new SpeechSynthesisUtterance(text);
                utter.lang = 'fi-FI';
                utter.rate = 0.95;
                utter.pitch = 1.0;
                utter.volume = 1.0;
                if (onEndCallback) utter.onend = onEndCallback;
                window.speechSynthesis.speak(utter);
            } catch(e) {
                console.warn('[AudioEngine] TTS error:', e);
            }
        },

        playStory(url, onEndCallback = null) {
            if (this.isMuted) return;
            this.stop();
            const audio = new Audio(url);
            this.currentAudio = audio;
            this.isPlayingStory = true;
            audio.play().catch(err => {
                console.warn('[AudioEngine] Audio URL play error:', err);
                this.isPlayingStory = false;
            });
            audio.onended = () => {
                this.isPlayingStory = false;
                this.currentAudio = null;
                if (onEndCallback) onEndCallback();
            };
        },

        stop() {
            if (this.currentAudio) {
                this.currentAudio.pause();
                this.currentAudio.currentTime = 0;
                this.currentAudio = null;
            }
            if ('speechSynthesis' in window) window.speechSynthesis.cancel();
            this.isPlayingStory = false;
        },

        toggleMute() {
            this.isMuted = !this.isMuted;
            if (this.isMuted) this.stop();
            return this.isMuted;
        }
    };
    window.AudioEngine = AudioEngine;

    // ─── "ALOITA ELÄMYSPOLKU" OVERLAY ──────────────────────────────────────────
    // AudioContext + GPS aktivoituvat yhdellä napin painalluksella.

    const startAudioBtn     = document.getElementById('audio-start-btn');
    const audioOverlay      = document.getElementById('audio-start-overlay');
    const audioIndicatorBar = document.getElementById('audio-indicator-bar');
    let gpsStartedFromOverlay = false;

    if (startAudioBtn) {
        startAudioBtn.addEventListener('click', () => {
            if (gpsStartedFromOverlay) return;
            gpsStartedFromOverlay = true;

            AudioEngine.init();
            AudioEngine.playChime('arrival');

            if (audioOverlay)      audioOverlay.classList.add('hidden');
            if (audioIndicatorBar) audioIndicatorBar.style.display = 'flex';

            // GPS käynnistetään heti — routePoints on jo ladattu renderGeoJSON:ssa
            const pts = window.routePoints || [];
            if (pts.length > 0 && navigator.geolocation) {
                initGPS(pts);
                // Palauta mahdollinen aiempi edistyminen
                setTimeout(() => {
                    if (typeof restoreRouteProgress === 'function') restoreRouteProgress(pts);
                }, 300);
            }
        });
    }

    // ─── NAVIGATION / FOLLOW-ME ────────────────────────────────────────────────

    function recenterOnUser() {
        isFollowingUser = true;
        updateRecenterBtnUI();
        const map = window._leafletMap;
        if (map && lastUserLat != null && lastUserLng != null) {
            map.setView([lastUserLat, lastUserLng], Math.max(map.getZoom(), 16), {
                animate: true, duration: 0.6
            });
        }
    }
    window.recenterOnUser = recenterOnUser;

    function updateRecenterBtnUI() {
        const btn = document.getElementById('map-recenter-btn');
        if (!btn) return;
        if (isFollowingUser) {
            btn.classList.add('active');
            btn.title = 'Seurataan sijaintia (napauta vapauttaaksesi)';
        } else {
            btn.classList.remove('active');
            btn.title = 'Keskitä omaan sijaintiin';
        }
    }
    window.updateRecenterBtnUI = updateRecenterBtnUI;

    // ─── ROUTE LOADING ─────────────────────────────────────────────────────────

    async function loadRoute(code = null) {
        if (code && ADMIN_PASSWORDS.includes(code.trim().toLowerCase())) {
            isAdminMode = true;
        }
        try {
            let data = null;
            let error = null;

            if (code && !ADMIN_PASSWORDS.includes(code.trim().toLowerCase())) {
                const res = await supabase.rpc('get_route_with_access', {
                    route_id: routeId, provided_code: code
                });
                data = res.data; error = res.error;
            }

            if (!data || !data.access_granted) {
                const res = await supabase.rpc('get_route_with_access', {
                    route_id: routeId, provided_code: null
                });
                data = res.data; error = res.error;
            }

            if (isAdminMode && (!data || !data.access_granted || !data.route_geojson)) {
                const { data: directData } = await supabase
                    .from('routes').select('*').eq('id', routeId).single();
                if (directData) data = { ...directData, access_granted: true };
            }

            if (!data) throw new Error('No data returned');
            if (isAdminMode) data.access_granted = true;

            currentRouteData = data;
            renderRouteState();
            loadLaukaaInfoPlaces();

        } catch (err) {
            console.error('Virhe reitin latauksessa:', err);
            document.getElementById('route-title').textContent = 'Reittiä ei löytynyt tai tapahtui virhe.';
        }
    }

    function renderRouteState() {
        const d = currentRouteData;
        if (!d) return;

        let title = d.title;
        if (!title || title === 'Nimetön reitti') {
            if (d.route_geojson) {
                try {
                    const geo = typeof d.route_geojson === 'string' ? JSON.parse(d.route_geojson) : d.route_geojson;
                    if (geo.name && geo.name !== 'Uusi projekti') title = geo.name;
                    else if (geo.title) title = geo.title;
                    else if (geo.features?.[0]?.properties?.name) title = geo.features[0].properties.name;
                } catch (e) {}
            }
        }

        const finalTitle = title || 'Nimetön reitti';
        document.getElementById('route-title').textContent = finalTitle;
        document.title = `${finalTitle} (Audio) – LaukaaInfo`;
        document.getElementById('route-desc').textContent = d.description || '';

        if (d.distance_meters) {
            document.getElementById('route-distance').innerHTML =
                `<span class="iconify" data-icon="material-symbols:route"></span> ${(d.distance_meters / 1000).toFixed(1).replace('.', ',')} km`;
        }

        if (d.place_id) {
            supabase.from('places').select('name').eq('place_id', d.place_id).single().then(res => {
                if (res.data) {
                    document.getElementById('route-place').innerHTML =
                        `<span class="iconify" data-icon="material-symbols:location-on"></span> ${res.data.name}`;
                }
            });
        }

        if (d.visibility === 'private' && !d.access_granted) {
            document.getElementById('lock-screen').style.display = 'block';
            document.getElementById('content-area').style.display = 'none';
            document.getElementById('route-badge').textContent = '🔒 Suojattu elämyspolku';
            document.getElementById('route-badge').style.background = '#ffe4e6';
            document.getElementById('route-badge').style.color = '#e11d48';
        } else if (d.access_granted) {
            document.getElementById('lock-screen').style.display = 'none';
            document.getElementById('content-area').style.display = 'block';

            const badgeEl = document.getElementById('route-badge');
            if (isAdminMode) {
                if (badgeEl) {
                    badgeEl.textContent = '🔑 Admin-tila (Kaikki avattu)';
                    badgeEl.style.background = '#fef3c7';
                    badgeEl.style.color = '#b45309';
                    badgeEl.style.border = '1px solid #f59e0b';
                }
                if (!document.getElementById('admin-banner')) {
                    const header = document.querySelector('.header');
                    if (header) {
                        const adminBanner = document.createElement('div');
                        adminBanner.id = 'admin-banner';
                        adminBanner.style.cssText = 'background:linear-gradient(135deg,#fef3c7,#fffbe6);border:1.5px solid #f59e0b;border-radius:12px;padding:10px 14px;margin-top:1rem;font-size:13px;color:#92400e;font-weight:700;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;';
                        adminBanner.innerHTML = `
                            <span>🔑 <strong>Suunnittelijan Admin-tila aktiivinen:</strong> Kaikki kohdepisteet ja tarinasisällöt ovat suoraan avoinna esikatselua varten.</span>
                            <button onclick="window.location.href=window.location.pathname+'?id='+new URLSearchParams(window.location.search).get('id')" style="background:#b45309;color:#fff;border:none;border-radius:8px;padding:5px 12px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;">Poistu Admin-tilasta</button>
                        `;
                        header.appendChild(adminBanner);
                    }
                }
            } else if (d.visibility === 'private') {
                if (badgeEl) {
                    badgeEl.textContent = '🔒 Suojattu (Avattu)';
                    badgeEl.style.background = '#e0e7ff';
                    badgeEl.style.color = '#4338ca';
                }
            } else {
                if (badgeEl) badgeEl.textContent = d.category || 'Reitti';
            }

            renderGeoJSON(d.route_geojson);
        }
    }

    // ─── GEOJSON RENDERING ─────────────────────────────────────────────────────

    function renderGeoJSON(geoJsonStr) {
        if (!geoJsonStr) return;
        let geojson;
        try {
            geojson = typeof geoJsonStr === 'string' ? JSON.parse(geoJsonStr) : geoJsonStr;
        } catch (e) {
            console.error('Virhe GeoJSON:n parsimisessa', e);
            return;
        }

        nearbyPlacesEnabled = false;
        const initNearbyEl = document.getElementById('nearby-places-section');
        if (initNearbyEl) initNearbyEl.style.display = 'none';

        const map = L.map('map');
        window._leafletMap = map;

        // ─── ERILAISET KARTTAPOHJAT (TILE LAYERS) ──────────────────────────
        const tileLayers = {
            "osm": L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>'
            }),
            "topo": L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
                maxZoom: 17,
                attribution: 'Kartta: &copy; <a href="https://opentopomap.org" target="_blank">OpenTopoMap</a>'
            }),
            "esri_topo": L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
                maxZoom: 18,
                attribution: 'Kartta &copy; Esri &mdash; USGS, NOAA jne.'
            }),
            "positron": L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
                maxZoom: 20,
                subdomains: 'abcd',
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'
            }),
            "dark": L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                maxZoom: 20,
                subdomains: 'abcd',
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'
            }),
            "satellite": L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                maxZoom: 18,
                attribution: 'Kuvat &copy; Esri, i-cubed, USDA, USGS jne.'
            })
        };

        // Hae tallennettu karttatyyli tai käytä peruskarttaa (osm)
        let savedStyle = 'osm';
        try {
            savedStyle = localStorage.getItem('route_map_tile_style') || 'osm';
        } catch(e) {}
        if (!tileLayers[savedStyle]) savedStyle = 'osm';

        tileLayers[savedStyle].addTo(map);

        const baseMaps = {
            "🗺️ Peruskartta (OSM)": tileLayers.osm,
            "🥾 Maastokartta (OpenTopo)": tileLayers.topo,
            "🌲 Retkeily & Maasto (Esri Topo)": tileLayers.esri_topo,
            "🤍 Vaalea (CartoDB Positron)": tileLayers.positron,
            "🌙 Tumma / Yötila (CartoDB Dark)": tileLayers.dark,
            "🛰️ Ilmakuva (Esri Satelliitti)": tileLayers.satellite
        };

        L.control.layers(baseMaps, null, {
            position: 'topright',
            collapsed: true
        }).addTo(map);

        map.on('baselayerchange', function(e) {
            for (const [key, layer] of Object.entries(tileLayers)) {
                if (layer === e.layer) {
                    try { localStorage.setItem('route_map_tile_style', key); } catch(err) {}
                    break;
                }
            }
        });

        const RecenterControl = L.Control.extend({
            options: { position: 'bottomright' },
            onAdd: function() {
                const btn = L.DomUtil.create('button', 'leaflet-bar map-recenter-btn' + (isFollowingUser ? ' active' : ''));
                btn.id = 'map-recenter-btn';
                btn.title = isFollowingUser ? 'Seurataan sijaintia (napauta vapauttaaksesi)' : 'Keskitä omaan sijaintiin';
                btn.setAttribute('aria-label', 'Keskitä sijaintiin');
                btn.innerHTML = `<span class="iconify" data-icon="material-symbols:my-location"></span>`;
                L.DomEvent.disableClickPropagation(btn);
                L.DomEvent.on(btn, 'click', function(e) {
                    L.DomEvent.stop(e);
                    if (isFollowingUser) { isFollowingUser = false; updateRecenterBtnUI(); }
                    else recenterOnUser();
                });
                return btn;
            }
        });
        map.addControl(new RecenterControl());

        map.on('dragstart', function() {
            if (isFollowingUser) { isFollowingUser = false; updateRecenterBtnUI(); }
        });

        const points = [];
        let routeLineCoords = [];

        const geojsonLayer = L.geoJSON(geojson, {
            style: function(feature) {
                if (feature.geometry && feature.geometry.type === 'LineString') {
                    return { color: '#059669', weight: 5, opacity: 0.8 };
                }
                return {};
            },
            pointToLayer: function(feature, latlng) {
                return L.circleMarker(latlng, {
                    radius: 8, fillColor: '#e11d48', color: '#fff',
                    weight: 2, opacity: 1, fillOpacity: 0.8
                });
            },
            onEachFeature: function(feature, layer) {
                if (feature.geometry.type === 'LineString') {
                    routeLineCoords = feature.geometry.coordinates;
                    nearbyPlacesEnabled = feature.properties?.show_nearby !== false;
                    const nearbyEl = document.getElementById('nearby-places-section');
                    if (nearbyEl) nearbyEl.style.display = nearbyPlacesEnabled ? 'block' : 'none';
                }
                if (feature.geometry.type === 'Point' && feature.properties) {
                    const p = feature.properties;
                    p._lat = feature.geometry.coordinates[1];
                    p._lng = feature.geometry.coordinates[0];
                    p._layer = layer;
                    points.push(p);
                    layer.on('click', () => window.openPointModal(p));
                }
            }
        }).addTo(map);

        points.forEach((p, idx) => { p._initialIdx = idx; });
        points.sort((a, b) => {
            const ao = (a.order != null && !isNaN(a.order)) ? Number(a.order) : Infinity;
            const bo = (b.order != null && !isNaN(b.order)) ? Number(b.order) : Infinity;
            if (ao !== bo) return ao - bo;
            return a._initialIdx - b._initialIdx;
        });

        window.routePoints = points;
        window.routeLineCoords = routeLineCoords;
        window.totalRouteLength = computeRouteLength(routeLineCoords);

        map.fitBounds(geojsonLayer.getBounds(), { padding: [50, 50] });

        function isPointUnlocked(p) {
            if (!p) return true;
            if (isAdminMode) {
                if (p.locked_content) {
                    if (p.locked_content.description) p.description = p.locked_content.description;
                    if (p.locked_content.imageUrl)    p.imageUrl    = p.locked_content.imageUrl;
                    if (p.locked_content.image)       p.image       = p.locked_content.image;
                    if (p.locked_content.images)      p.images      = p.locked_content.images;
                    if (p.locked_content.audioUrl)    p.audioUrl    = p.locked_content.audioUrl;
                    if (p.locked_content.audio)       p.audio       = p.locked_content.audio;
                    if (p.locked_content.youtubeUrl)  p.youtubeUrl  = p.locked_content.youtubeUrl;
                    if (p.locked_content.infoLink)    p.infoLink    = p.locked_content.infoLink;
                }
                return true;
            }
            const mode = p.unlock_mode || 'PUBLIC';
            if (mode === 'PUBLIC') return true;
            if (p._unlocked) return true;
            const pointId = p.id || `pt_${p._lat || p.lat}_${p._lng || p.lng}`;
            try {
                if (localStorage.getItem('unlocked_point_' + pointId) === 'true') {
                    p._unlocked = true;
                    if (p.locked_content) {
                        if (p.locked_content.description) p.description = p.locked_content.description;
                        if (p.locked_content.imageUrl)    p.imageUrl    = p.locked_content.imageUrl;
                        if (p.locked_content.image)       p.image       = p.locked_content.image;
                        if (p.locked_content.audioUrl)    p.audioUrl    = p.locked_content.audioUrl;
                        if (p.locked_content.audio)       p.audio       = p.locked_content.audio;
                        if (p.locked_content.youtubeUrl)  p.youtubeUrl  = p.locked_content.youtubeUrl;
                        if (p.locked_content.infoLink)    p.infoLink    = p.locked_content.infoLink;
                    }
                    return true;
                }
            } catch(e) {}
            if (mode === 'REQUIRE_PREVIOUS' && window.routePoints && Array.isArray(window.routePoints)) {
                const idx = window.routePoints.findIndex(pt => (pt.id || `pt_${pt._lat || pt.lat}_${pt._lng || pt.lng}`) === pointId);
                if (idx > 0) {
                    const prevPoint = window.routePoints[idx - 1];
                    if (!isPointUnlocked(prevPoint)) return false;
                }
            }
            return false;
        }
        window.isPointUnlocked = isPointUnlocked;

        function getSkippedPointsText(fromIdx, targetIdx) {
            const skipped = [];
            for (let i = fromIdx + 1; i < targetIdx; i++) skipped.push(i + 1);
            if (skipped.length === 0) return '';
            if (skipped.length === 1) return `ohittaa kohteen ${skipped[0]}`;
            const last = skipped.pop();
            return `ohittaa kohteet ${skipped.join(', ')} ja ${last}`;
        }

        // Render Points Timeline
        const pointsList = document.getElementById('points-list');
        document.getElementById('point-count').textContent = `(${points.length})`;

        pointsList.innerHTML = points.map((p, idx) => {
            const unlocked = isPointUnlocked(p);

            if (!unlocked) {
                const radius = p.unlock_radius || p.arrival_radius || 30;
                const hasShortcut = !!(p.shortcut_to || p.shortcutTo);
                const shortcutBadge = hasShortcut
                    ? `<span class="shortcut-available-badge" onclick="event.stopPropagation(); window.openPointModal(window.routePoints[${idx}])" title="Tästä pisteestä on oikaisumahdollisuus">⏭ Oikaisu</span>`
                    : '';
                let lockedConnector = '';
                const lockedShortcutId = p.shortcut_to || p.shortcutTo;
                if (lockedShortcutId) {
                    const targetIdx = points.findIndex(pt => pt.id === lockedShortcutId);
                    if (targetIdx > idx) {
                        const targetPoint = points[targetIdx];
                        const targetName = targetPoint?.title || targetPoint?.name || `Piste ${targetIdx + 1}`;
                        const skipText = getSkippedPointsText(idx, targetIdx);
                        const skipLabel = skipText ? `<span class="shortcut-connector-skip">(${skipText})</span>` : '';
                        lockedConnector = `
                            <div class="shortcut-connector" id="shortcut-connector-${idx}">
                                <div class="shortcut-connector-arrow">
                                    <div class="shortcut-connector-arrow-line"></div>
                                    <div class="shortcut-connector-arrow-head"></div>
                                </div>
                                <div class="shortcut-connector-label" onclick="window.openPointModal(window.routePoints[${idx}])">
                                    ⏭ Oikaisu → ${targetName} ${skipLabel}
                                </div>
                            </div>`;
                    }
                }
                return `
                <div class="point-card point-card-locked" id="point-card-${idx}" style="cursor:pointer;border-left:4px solid #f59e0b;background:#fffbeb;padding:12px 14px;border-radius:10px;margin-bottom:8px;" onclick="window.openPointModal(window.routePoints[${idx}])">
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
                        <h3 style="margin:0;font-size:14px;font-weight:700;color:#1e293b;">${idx + 1}. ${p.title || p.name || 'Piste ' + (idx + 1)}</h3>
                        <div style="display:flex;gap:4px;align-items:center;flex-shrink:0;">
                            ${shortcutBadge}
                            <span class="point-locked-badge" style="font-size:10px;font-weight:700;background:#fef3c7;color:#b45309;padding:2px 8px;border-radius:12px;white-space:nowrap;">🔒 Avautuu kohteessa</span>
                        </div>
                    </div>
                    <div class="point-locked-teaser" style="font-size:12px;color:#78350f;margin-top:6px;">📍 Saavu kohteeseen (${radius} m) avataksesi tarinan</div>
                </div>
                ${lockedConnector}`;
            }

            let mediaPreview = '';
            const rawVideos = [p.youtubeUrl, p.youtube_url, p.youtube, p.videoUrl, p.video_url, p.video, p.youtube_id, p.video_id].flat().filter(Boolean);
            const hasVideo = rawVideos.some(v => isValidVideoUrl(typeof v === 'string' ? v : (v.url || '')));
            const rawImages = [p.imageUrl, p.images, p.image, p.media, p.photos, p.photo, p.picture].flat().filter(Boolean);
            const hasImage = rawImages.some(i => isValidImageUrl(typeof i === 'string' ? i : (i.url || '')));
            const rawAudios = [p.audioUrl, p.audio_url, p.audio, p.audioId].flat().filter(Boolean);
            const hasAudio = rawAudios.some(a => isValidAudioUrl(typeof a === 'string' ? a : (a.url || '')));
            const hasLink = !!(p.infoLink || p.info_link || p.link || p.url || p.website);
            const hasDesc = !!(p.description || p.desc || p.text || p.details);

            if (hasVideo || hasImage || hasAudio) {
                let parts = [];
                if (hasVideo) parts.push('🎬 Video');
                if (hasImage) parts.push('🖼️ Kuva');
                if (hasAudio) parts.push('🎧 Äänileike');
                mediaPreview = `<div style="margin-top:10px;"><button class="btn-light" style="padding:6px 12px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;border:1px solid #cbd5e1;background:#f8fafc;" onclick="window.openPointModal(window.routePoints[${idx}])">${parts.join(' / ')}</button></div>`;
            } else if (hasDesc || hasLink) {
                mediaPreview = `<div style="margin-top:10px;"><button class="btn-light" style="padding:6px 12px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;border:1px solid #cbd5e1;background:#f8fafc;" onclick="window.openPointModal(window.routePoints[${idx}])">Näytä tiedot</button></div>`;
            }

            const hasShortcutUnlocked = !!(p.shortcut_to || p.shortcutTo);
            const shortcutBadgeUnlocked = hasShortcutUnlocked
                ? `<span class="shortcut-available-badge" onclick="event.stopPropagation(); window.openPointModal(window.routePoints[${idx}])" title="Tästä pisteestä on oikaisumahdollisuus">⏭ Oikaisu</span>`
                : '';

            let shortcutConnector = '';
            const shortcutId = p.shortcut_to || p.shortcutTo;
            if (shortcutId) {
                const targetIdx = points.findIndex(pt => pt.id === shortcutId);
                if (targetIdx > idx) {
                    const targetPoint = points[targetIdx];
                    const targetName = targetPoint?.title || targetPoint?.name || `Piste ${targetIdx + 1}`;
                    const skipText = getSkippedPointsText(idx, targetIdx);
                    const skipLabel = skipText ? `<span class="shortcut-connector-skip">(${skipText})</span>` : '';
                    shortcutConnector = `
                        <div class="shortcut-connector" id="shortcut-connector-${idx}">
                            <div class="shortcut-connector-arrow">
                                <div class="shortcut-connector-arrow-line"></div>
                                <div class="shortcut-connector-arrow-head"></div>
                            </div>
                            <div class="shortcut-connector-label" onclick="window.openPointModal(window.routePoints[${idx}])">
                                ⏭ Oikaisu → ${targetName} ${skipLabel}
                            </div>
                        </div>`;
                }
            }

            return `
            <div class="point-card" id="point-card-${idx}" style="cursor:pointer;" onclick="window.openPointModal(window.routePoints[${idx}])">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
                    <h3 style="margin:0;">${idx + 1}. ${p.title || p.name || 'Piste ' + (idx + 1)}</h3>
                    ${shortcutBadgeUnlocked}
                </div>
                ${mediaPreview}
            </div>
            ${shortcutConnector}`;
        }).join('');

        window.routePoints = points;

        updateAllMarkerStyles();
        // GPS käynnistyy vasta "Aloita elämyspolku" -painikkeesta
        // (ei automaattisesti tässä)

        setTimeout(() => {
            if (typeof restoreRouteProgress === 'function' && gpsStartedFromOverlay) {
                restoreRouteProgress(points);
            }
        }, 300);
    }

    // ─── GPS NAVIGATION ENGINE ───────────────────────────────────────────────────

    let gpsWatchId = null;
    let gpsActive = false;
    let userMarker = null;
    let userAccuracyCircle = null;

    let nextPointIndex = 0;
    let progressIndex = 0;
    const visitedPoints  = new Set();
    const arrivedPoints  = new Set();
    const skippedPoints  = new Set();
    let approachToastVisible = false;
    let _insideCount = 0;
    let _arrivalCooldownUntil = 0;

    const ROUTE_STATES = { ON_ROUTE: 0, SLIGHTLY_OFF: 1, OFF_ROUTE: 2, LEFT_ROUTE: 3 };
    let routeState = ROUTE_STATES.ON_ROUTE;
    let offRouteSince = null;
    const OFF_ROUTE_TIMEOUT_MS = 15000;

    // ─── GEOMETRY HELPERS ────────────────────────────────────────────────────────

    function haversineMeters(lat1, lng1, lat2, lng2) {
        const R = 6371000;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLng / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    function distanceToSegmentMeters(lat, lng, lat1, lng1, lat2, lng2) {
        const dx = lat2 - lat1, dy = lng2 - lng1;
        if (dx === 0 && dy === 0) return haversineMeters(lat, lng, lat1, lng1);
        const t = Math.max(0, Math.min(1,
            ((lat - lat1) * dx + (lng - lng1) * dy) / (dx * dx + dy * dy)
        ));
        return haversineMeters(lat, lng, lat1 + t * dx, lng1 + t * dy);
    }

    function distanceToLineString(lat, lng, coords) {
        if (!coords || coords.length < 2) return Infinity;
        let minDist = Infinity;
        for (let i = 0; i < coords.length - 1; i++) {
            const d = distanceToSegmentMeters(lat, lng,
                coords[i][1], coords[i][0], coords[i + 1][1], coords[i + 1][0]);
            if (d < minDist) minDist = d;
        }
        return minDist;
    }

    function computeRouteLength(coords) {
        if (!coords || coords.length < 2) return 0;
        let total = 0;
        for (let i = 0; i < coords.length - 1; i++) {
            total += haversineMeters(coords[i][1], coords[i][0], coords[i + 1][1], coords[i + 1][0]);
        }
        return total;
    }

    function projectToRouteDistance(lat, lng, coords) {
        if (!coords || coords.length < 2) return 0;
        let bestDist = Infinity, bestProjected = 0, cumDist = 0;
        for (let i = 0; i < coords.length - 1; i++) {
            const segLen = haversineMeters(coords[i][1], coords[i][0], coords[i + 1][1], coords[i + 1][0]);
            const dx = coords[i + 1][1] - coords[i][1];
            const dy = coords[i + 1][0] - coords[i][0];
            const denom = dx * dx + dy * dy;
            const t = denom === 0 ? 0 : Math.max(0, Math.min(1,
                ((lat - coords[i][1]) * dx + (lng - coords[i][0]) * dy) / denom
            ));
            const nearLat = coords[i][1] + t * dx;
            const nearLng = coords[i][0] + t * dy;
            const d = haversineMeters(lat, lng, nearLat, nearLng);
            if (d < bestDist) { bestDist = d; bestProjected = cumDist + t * segLen; }
            cumDist += segLen;
        }
        return bestProjected;
    }

    // ─── GPS CORE ────────────────────────────────────────────────────────────────

    function initGPS(points) {
        window.toggleGPS = function() {
            if (gpsActive) stopGPS();
            else startGPS(points);
        };
        startGPS(points);
    }

    function startGPS(points) {
        const gpsBtn   = document.getElementById('gps-status-btn');
        const gpsLabel = document.getElementById('gps-label');

        if (location.protocol === 'http:' && !location.hostname.includes('localhost')) {
            if (gpsBtn) { gpsBtn.className = 'error'; gpsLabel.textContent = 'GPS ei käytettävissä'; }
            showGpsErrorBanner('🔒 GPS vaatii suojatun yhteyden',
                'Chrome edellyttää HTTPS-osoitetta sijaintitietoihin.');
            return;
        }
        if (!navigator.geolocation) {
            if (gpsBtn) { gpsBtn.className = 'error'; gpsLabel.textContent = 'GPS ei tuettu'; }
            showGpsErrorBanner('GPS ei ole käytettävissä', 'Selaimesi ei tue paikannusta.');
            return;
        }

        gpsWatchId = navigator.geolocation.watchPosition(
            (pos) => onPositionUpdate(pos, points),
            (err) => {
                console.warn('GPS-virhe:', err.code, err.message);
                let label = 'GPS-virhe', detail = '';
                if (err.code === 1) { label = 'Sijaintilupa evätty'; detail = 'Myönnä sijaintilupa selaimelle.'; }
                else if (err.code === 2) { label = 'Sijaintia ei saatu'; detail = 'GPS-signaali ei tavoita laitettasi.'; }
                else if (err.code === 3) { label = 'GPS aikakatkaisu'; detail = 'Kokeile uudelleen ulkona.'; }
                if (gpsBtn) { gpsBtn.className = 'error'; gpsLabel.textContent = label; }
                showGpsErrorBanner(label, detail);
                gpsActive = false;
            },
            { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
        );
        gpsActive = true;
        if (gpsBtn) { gpsBtn.className = 'active'; gpsLabel.textContent = 'GPS päällä'; }
        const panel = document.getElementById('gps-progress-panel');
        if (panel) panel.style.display = 'block';
    }

    function showGpsErrorBanner(title, detail) {
        let banner = document.getElementById('gps-error-banner');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'gps-error-banner';
            banner.style.cssText = 'background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:1rem 1.2rem;margin-bottom:1.2rem;font-size:0.82rem;line-height:1.5;color:#991b1b;';
            const mapEl = document.getElementById('map');
            if (mapEl && mapEl.parentNode) mapEl.parentNode.insertBefore(banner, mapEl);
        }
        banner.innerHTML = `<strong style="display:block;margin-bottom:0.3rem;">⚠️ ${title}</strong>${detail}`;
        banner.style.display = 'block';
    }

    function stopGPS() {
        if (gpsWatchId !== null) navigator.geolocation.clearWatch(gpsWatchId);
        gpsWatchId = null;
        gpsActive = false;
        const gpsBtn   = document.getElementById('gps-status-btn');
        const gpsLabel = document.getElementById('gps-label');
        if (gpsBtn) { gpsBtn.className = ''; gpsLabel.textContent = 'GPS pois'; }
        closeProximityToast();
        closeArrivalToast();
        const panel = document.getElementById('gps-progress-panel');
        if (panel) panel.style.display = 'none';
    }

    function onPositionUpdate(pos, points) {
        const userLat  = pos.coords.latitude;
        const userLng  = pos.coords.longitude;
        const accuracy = pos.coords.accuracy || 15;

        updateUserMarker(userLat, userLng, accuracy);
        updateRouteStatus(userLat, userLng);
        updateProgressPanel(userLat, userLng);
        checkNextPoint(userLat, userLng, accuracy, points);
        updateNearbyPlacesUI(userLat, userLng);

        // Päivitä audio-ilmaisimipalkin teksti
        updateAudioIndicatorText(userLat, userLng, points);
    }

    // ─── USER MARKER ─────────────────────────────────────────────────────────────

    function updateUserMarker(lat, lng, accuracy) {
        const map = window._leafletMap;
        if (!map || !window.L) return;
        if (userMarker) {
            userMarker.setLatLng([lat, lng]);
        } else {
            const icon = L.divIcon({
                html: `<div style="width:16px;height:16px;background:#2563eb;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 4px rgba(37,99,235,0.25);position:relative;z-index:2;"></div>`,
                className: '', iconSize: [16, 16], iconAnchor: [8, 8]
            });
            userMarker = L.marker([lat, lng], { icon, zIndexOffset: 1000 }).addTo(map);
        }
        if (accuracy && accuracy > 10) {
            if (userAccuracyCircle) {
                userAccuracyCircle.setLatLng([lat, lng]).setRadius(accuracy);
            } else {
                userAccuracyCircle = L.circle([lat, lng], {
                    radius: accuracy, color: '#2563eb', fillColor: '#2563eb',
                    fillOpacity: 0.08, weight: 1, opacity: 0.3
                }).addTo(map);
            }
        }
        lastUserLat = lat; lastUserLng = lng;
        if (isFirstPosition) {
            isFirstPosition = false;
            if (isFollowingUser) map.setView([lat, lng], Math.max(map.getZoom(), 16), { animate: true });
        } else if (isFollowingUser) {
            map.panTo([lat, lng], { animate: true, duration: 0.6 });
        }
    }

    // ─── ROUTE STATUS STATE MACHINE ──────────────────────────────────────────────

    function updateRouteStatus(userLat, userLng) {
        const coords = window.routeLineCoords || [];
        if (coords.length < 2) return;
        const statusEl = document.getElementById('gps-route-status');
        if (!statusEl) return;
        const dist = Math.round(distanceToLineString(userLat, userLng, coords));
        let targetState;
        if (dist <= 30) targetState = ROUTE_STATES.ON_ROUTE;
        else if (dist <= 75) targetState = ROUTE_STATES.SLIGHTLY_OFF;
        else if (dist <= 150) targetState = ROUTE_STATES.OFF_ROUTE;
        else targetState = ROUTE_STATES.LEFT_ROUTE;

        if (targetState > routeState) {
            routeState = targetState;
            if (routeState >= ROUTE_STATES.OFF_ROUTE && !offRouteSince) offRouteSince = Date.now();
        } else if (targetState < routeState) {
            routeState = targetState; offRouteSince = null;
        }
        const showLeftRoute = routeState === ROUTE_STATES.LEFT_ROUTE &&
                              offRouteSince && (Date.now() - offRouteSince) >= OFF_ROUTE_TIMEOUT_MS;
        const displayState = showLeftRoute ? ROUTE_STATES.LEFT_ROUTE : Math.min(routeState, ROUTE_STATES.OFF_ROUTE);
        const cfg = [
            { emoji: '🟢', text: 'Reitillä',                      color: '#059669', bg: '#ecfdf5' },
            { emoji: '🟡', text: `Hieman sivussa — ${dist} m`,     color: '#b45309', bg: '#fffbeb' },
            { emoji: '🟠', text: `Poikkeama — ${dist} m`,          color: '#c2410c', bg: '#fff7ed' },
            { emoji: '🔴', text: `Poistunut reitiltä — ${dist} m`, color: '#b91c1c', bg: '#fef2f2' },
        ][displayState];
        statusEl.textContent = `${cfg.emoji} ${cfg.text}`;
        statusEl.style.color = cfg.color;
        statusEl.style.background = cfg.bg;
    }

    // ─── PROGRESS PANEL ──────────────────────────────────────────────────────────

    function updateProgressPanel(userLat, userLng) {
        const coords   = window.routeLineCoords || [];
        const totalLen = window.totalRouteLength || 0;
        if (coords.length < 2 || totalLen === 0) return;
        const projDist = projectToRouteDistance(userLat, userLng, coords);
        if (projDist > (window._maxProjDist || 0)) window._maxProjDist = projDist;
        const effectiveDist = window._maxProjDist || 0;
        const pct = Math.min(100, Math.round((effectiveDist / totalLen) * 100));
        const fill = document.getElementById('gps-progress-bar-fill');
        const text  = document.getElementById('gps-progress-text');
        if (fill) fill.style.width = pct + '%';
        if (text) text.textContent =
            `${(effectiveDist / 1000).toFixed(1).replace('.', ',')} km` +
            ` / ${(totalLen / 1000).toFixed(1).replace('.', ',')} km`;
    }

    // ─── NEXT POINT NAVIGATION ───────────────────────────────────────────────────

    function checkNextPoint(userLat, userLng, accuracy, points) {
        const nextEl = document.getElementById('gps-next-point');
        if (nextPointIndex >= points.length) {
            if (nextEl) nextEl.innerHTML = '🎉 Kaikki kokemuspisteet saavutettu!';
            return;
        }
        const p    = points[nextPointIndex];
        const pLat = p._lat ?? p.lat;
        const pLng = p._lng ?? p.lng;
        if (pLat == null || pLng == null) return;

        const dist     = Math.round(haversineMeters(userLat, userLng, pLat, pLng));
        const arrivalR = p.arrival_radius  ?? p.properties?.arrival_radius ?? 30;
        const warningR = p.warning_radius  ?? p.properties?.warning_radius ?? p.notificationDistance ?? 100;

        handlePointAudio(p, dist);
        updateNextPointDisplay(p, dist, nextPointIndex, points.length);
        updateMapProximity(p, dist, nextPointIndex);

        const arrivalToastEl  = document.getElementById('arrival-toast');
        const isArrivalToastVisible = arrivalToastEl && arrivalToastEl.classList.contains('visible');
        const pointModalEl    = document.getElementById('point-modal');
        const isModalActive   = pointModalEl && pointModalEl.classList.contains('active');
        const isCooldown      = Date.now() < _arrivalCooldownUntil;

        if (isArrivalToastVisible || isModalActive || isCooldown) {
            _insideCount = 0; return;
        }

        if (arrivedPoints.has(nextPointIndex)) {
            const autoAdvanceThreshold = Math.max(arrivalR * 1.8, 45);
            let isMovingAway = dist >= autoAdvanceThreshold;
            if (!isMovingAway && nextPointIndex + 1 < points.length) {
                const nextP = points[nextPointIndex + 1];
                const nLat = nextP._lat ?? nextP.lat;
                const nLng = nextP._lng ?? nextP.lng;
                if (nLat != null && nLng != null) {
                    const distToNext = haversineMeters(userLat, userLng, nLat, nLng);
                    if (distToNext < dist && dist > arrivalR) isMovingAway = true;
                }
            }
            if (isMovingAway) { completeCurrentPoint(nextPointIndex); return; }
            return;
        }

        if (nextPointIndex + 1 < points.length && dist <= Math.max(arrivalR * 1.4, 40)) {
            const nextP = points[nextPointIndex + 1];
            const nLat = nextP._lat ?? nextP.lat;
            const nLng = nextP._lng ?? nextP.lng;
            if (nLat != null && nLng != null) {
                const distToNext = haversineMeters(userLat, userLng, nLat, nLng);
                if (distToNext < dist && !arrivedPoints.has(nextPointIndex)) {
                    markPointArrived(nextPointIndex, p);
                    completeCurrentPoint(nextPointIndex);
                    return;
                }
            }
        }

        if (p.unlock_mode === 'REQUIRE_PREVIOUS') {
            const pts = window.routePoints || [];
            const idx = pts.findIndex(pt => pt === p || (pt.id && pt.id === p.id));
            if (idx > 0) {
                const prev = pts[idx - 1];
                const prevVisited = prev._unlocked || (() => {
                    try {
                        const prevId = prev.id || `pt_${prev._lat || prev.lat}_${prev._lng || prev.lng}`;
                        return localStorage.getItem('unlocked_point_' + prevId) === 'true';
                    } catch(e) { return false; }
                })();
                if (!prevVisited) { _insideCount = 0; return; }
            }
        }

        const accuracyThreshold = arrivalR + 15;
        const accuracyOk = accuracy <= accuracyThreshold;
        const requiredReadings = accuracyOk ? 1 : (accuracy <= 80 ? 3 : 5);

        if (dist <= arrivalR) {
            _insideCount++;
            if (_insideCount >= requiredReadings) {
                _insideCount = 0;
                markPointArrived(nextPointIndex, p);
            } else {
                if (nextEl) {
                    const name = p.title || p.name || `Piste ${nextPointIndex + 1}`;
                    nextEl.innerHTML =
                        `<span class="next-label">SAAVUTAAN... (${_insideCount}/${requiredReadings})</span>` +
                        `<span class="next-name">${name} — noin ${dist} m</span>` +
                        `<span class="next-dist" style="color:#059669;">📍 Seiso paikalla hetki${!accuracyOk ? ` · GPS ±${Math.round(accuracy)} m` : ''}</span>`;
                }
            }
        } else if (dist > arrivalR * 2) {
            _insideCount = 0;
            if (dist <= warningR && !approachToastVisible && Date.now() >= _arrivalCooldownUntil) {
                showApproachingToast(p, dist);
            }
        }
    }

    // ─── PROXIMITY ZOOM & PULSE MARKERS ──────────────────────────────────────────

    let _lastZone = null;
    let _lastZonePointIdx = -1;

    function setMarkerPulse(p, type) {
        const map = window._leafletMap;
        if (!map || !window.L) return;
        const pLat = p._lat ?? p.lat;
        const pLng = p._lng ?? p.lng;
        if (pLat == null || pLng == null) return;
        if (!type) {
            if (p._pulseMarker) { map.removeLayer(p._pulseMarker); p._pulseMarker = null; }
            return;
        }
        const html = `<div class="lki-pulse-ring ${type}"></div>`;
        const icon = L.divIcon({ className: 'lki-pulse-wrapper', html, iconSize: [0, 0], iconAnchor: [0, 0] });
        if (p._pulseMarker) {
            p._pulseMarker.setIcon(icon);
        } else {
            p._pulseMarker = L.marker([pLat, pLng], { icon, zIndexOffset: -100, interactive: false }).addTo(map);
        }
    }

    function updateMapProximity(p, dist, idx) {
        const map = window._leafletMap;
        if (!map || !window.L) return;
        const pLat = p._lat ?? p.lat;
        const pLng = p._lng ?? p.lng;
        if (pLat == null || pLng == null) return;
        const arrivalR = p.arrival_radius ?? 30;
        let currentZone = 0;
        if (dist <= arrivalR) currentZone = 3;
        else if (dist <= 50) currentZone = 2;
        else if (dist <= 100) currentZone = 1;
        if (currentZone !== _lastZone || idx !== _lastZonePointIdx) {
            _lastZone = currentZone; _lastZonePointIdx = idx;
            if (currentZone === 3) setMarkerPulse(p, 'arrival');
            else if (currentZone === 2) setMarkerPulse(p, 'near');
            else if (currentZone === 1) setMarkerPulse(p, 'approach');
            else setMarkerPulse(p, null);
        }
    }

    function updateNextPointDisplay(p, dist, idx, total) {
        const nextEl = document.getElementById('gps-next-point');
        if (!nextEl) return;
        const name = p.title || p.name || `Piste ${idx + 1}`;
        const distText = dist >= 1000
            ? `${(dist / 1000).toFixed(1).replace('.', ',')} km`
            : `${dist} m`;
        const dots = Array.from({ length: total }, (_, i) =>
            visitedPoints.has(i) ? '<span style="color:#059669;">●</span>'
            : (i === idx ? '<span style="color:#2563eb;">◉</span>'
                         : '<span style="color:#cbd5e1;">○</span>')
        ).join(' ');
        nextEl.innerHTML =
            `<span class="next-label">SEURAAVA ${idx + 1}/${total}</span>` +
            `<span class="next-name">${name}</span>` +
            `<span class="next-dist">${distText} →</span>` +
            `<span class="next-dots">${dots}</span>`;
    }

    function markPointVisited(idx, p) {
        p._unlocked = true;
        const pointId = p.id || `pt_${p._lat || p.lat}_${p._lng || p.lng}`;
        try { localStorage.setItem('unlocked_point_' + pointId, 'true'); } catch(e) {}
        if (p.locked_content) {
            if (p.locked_content.description) p.description = p.locked_content.description;
            if (p.locked_content.imageUrl)    p.imageUrl    = p.locked_content.imageUrl;
            if (p.locked_content.image)       p.image       = p.locked_content.image;
            if (p.locked_content.audioUrl)    p.audioUrl    = p.locked_content.audioUrl;
            if (p.locked_content.audio)       p.audio       = p.locked_content.audio;
            if (p.locked_content.youtubeUrl)  p.youtubeUrl  = p.locked_content.youtubeUrl;
            if (p.locked_content.infoLink)    p.infoLink    = p.locked_content.infoLink;
        }
        if (p._layer && p._layer.setStyle) p._layer.setStyle({ fillColor: '#059669', radius: 10 });
        setMarkerPulse(p, 'arrival');
        setTimeout(() => setMarkerPulse(p, null), 3000);
        const card = document.getElementById(`point-card-${idx}`);
        if (card) {
            card.style.borderLeft = '4px solid #059669';
            card.style.background = '#f0fdf4';
            const badge  = card.querySelector('.point-locked-badge');
            const teaser = card.querySelector('.point-locked-teaser');
            if (badge)  { badge.style.background = '#dcfce7'; badge.style.color = '#15803d'; badge.innerHTML = '🔓 Sisältö avattu'; }
            if (teaser) { teaser.style.color = '#047857'; teaser.innerHTML = '✨ Olet saapunut kohteeseen – napauta lukeaksesi tarinan!'; }
        }
        updateAllMarkerStyles();
    }

    // ─── MARKER VISUAL STATE ENGINE ──────────────────────────────────────────────

    function updateAllMarkerStyles() {
        const points = window.routePoints;
        if (!points || !Array.isArray(points)) return;
        const activeIdx = nextPointIndex;
        points.forEach((p, idx) => {
            const card    = document.getElementById(`point-card-${idx}`);
            const unlocked = window.isPointUnlocked ? window.isPointUnlocked(p) : true;
            if (arrivedPoints.has(idx)) {
                if (p._layer && p._layer.setStyle) p._layer.setStyle({ fillColor: '#10b981', color: '#ffffff', weight: 3, radius: 13, fillOpacity: 1 });
                setMarkerPulse(p, 'arrival');
                if (card) {
                    card.style.borderLeft = '4px solid #10b981'; card.style.background = '#f0fdf4';
                    const badge  = card.querySelector('.point-locked-badge');
                    const teaser = card.querySelector('.point-locked-teaser');
                    if (badge)  { badge.style.background = '#bbf7d0'; badge.style.color = '#065f46'; badge.innerHTML = '📍 Saapunut'; }
                    if (teaser) { teaser.style.color = '#047857'; teaser.innerHTML = '📖 Avaa kokemuspiste tai paina Jatka alakortista'; }
                }
            } else if (visitedPoints.has(idx)) {
                if (p._layer && p._layer.setStyle) p._layer.setStyle({ fillColor: '#059669', color: '#ffffff', weight: 2, radius: 10, fillOpacity: 0.9 });
                setMarkerPulse(p, null);
                if (card) {
                    card.style.borderLeft = '4px solid #059669'; card.style.background = '#f0fdf4';
                    const badge  = card.querySelector('.point-locked-badge');
                    const teaser = card.querySelector('.point-locked-teaser');
                    if (badge)  { badge.style.background = '#dcfce7'; badge.style.color = '#15803d'; badge.innerHTML = '🔓 Sisältö avattu'; }
                    if (teaser) { teaser.style.color = '#047857'; teaser.innerHTML = '✨ Olet saapunut kohteeseen – napauta lukeaksesi tarinan!'; }
                }
            } else if (idx === activeIdx) {
                if (p._layer && p._layer.setStyle) p._layer.setStyle({ fillColor: '#2563eb', color: '#ffffff', weight: 3, radius: 12, fillOpacity: 1 });
                setMarkerPulse(p, 'approach');
                if (card) {
                    card.style.borderLeft = '4px solid #2563eb'; card.style.background = '#eff6ff';
                    const badge  = card.querySelector('.point-locked-badge');
                    const teaser = card.querySelector('.point-locked-teaser');
                    if (badge)  { badge.style.background = '#dbeafe'; badge.style.color = '#1e40af'; badge.innerHTML = '🎯 Seuraava kohde'; }
                    if (teaser) { teaser.style.color = '#1d4ed8'; teaser.innerHTML = `📍 Suuntaa kohteelle (${p.unlock_radius || p.arrival_radius || 30} m) avataksesi tarinan`; }
                }
            } else if (skippedPoints.has(idx)) {
                if (p._layer && p._layer.setStyle) p._layer.setStyle({ fillColor: '#94a3b8', color: '#ffffff', weight: 1, radius: 6, fillOpacity: 0.5 });
                setMarkerPulse(p, null);
                if (card) {
                    card.classList.add('point-card-skipped');
                    const badge  = card.querySelector('.point-locked-badge');
                    const teaser = card.querySelector('.point-locked-teaser');
                    if (badge)  { badge.className = 'shortcut-badge'; badge.innerHTML = '⏭ Ohitettu'; }
                    if (teaser) teaser.style.display = 'none';
                }
            } else {
                if (p._layer && p._layer.setStyle) p._layer.setStyle({ fillColor: '#e11d48', color: '#ffffff', weight: 2, radius: 8, fillOpacity: 0.7 });
                if (card) {
                    card.style.borderLeft = '4px solid #f59e0b'; card.style.background = '#fffbeb';
                    const badge = card.querySelector('.point-locked-badge');
                    if (badge) { badge.style.background = '#fef3c7'; badge.style.color = '#b45309'; badge.innerHTML = '🔒 Avautuu kohteessa'; }
                }
            }
        });
    }
    window.updateAllMarkerStyles = updateAllMarkerStyles;

    // ─── ACTIVATE POINT ──────────────────────────────────────────────────────────

    function activatePoint(targetIndex, opts = {}) {
        const { reason = 'arrived', fromIndex = null } = opts;
        const points = window.routePoints || [];
        if (reason === 'shortcut' && fromIndex !== null) {
            for (let i = fromIndex + 1; i < targetIndex; i++) skippedPoints.add(i);
        }
        nextPointIndex = targetIndex;
        progressIndex  = Math.max(progressIndex, targetIndex);
        updateAllMarkerStyles();
        if (targetIndex >= points.length) showRouteSummary(points);
    }
    window.activatePoint = activatePoint;

    // ─── LOPPUYHTEENVETO ─────────────────────────────────────────────────────────

    function showRouteSummary(points) {
        const summaryPanel = document.getElementById('route-summary-panel');
        if (!summaryPanel) return;
        const visitedCount = visitedPoints.size;
        const totalCount   = points.length;
        const skippedCount = skippedPoints.size;
        document.getElementById('summary-visited-count').textContent = visitedCount;
        document.getElementById('summary-total-count').textContent   = totalCount;
        let skippedInfo = '';
        if (skippedCount > 0) {
            const skippedNames = Array.from(skippedPoints).sort((a, b) => a - b)
                .map(i => `${i + 1}. ${points[i]?.title || points[i]?.name || ('Piste ' + (i + 1))}`);
            skippedInfo = `<div style="margin-top:0.5rem;padding:0.75rem;background:#f8fafc;border-radius:10px;font-size:0.8rem;color:#64748b;">⏭ Ohitit pisteet: ${skippedNames.join(', ')}</div>`;
        }
        document.getElementById('summary-skipped-info').innerHTML = skippedInfo;
        summaryPanel.classList.add('visible');
        summaryPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // ─── AUDIO & VIBRATION ───────────────────────────────────────────────────────
    let _audioCtx = null;
    function getAudioCtx() {
        if (!_audioCtx) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (AudioCtx) _audioCtx = new AudioCtx();
        }
        if (_audioCtx && _audioCtx.state === 'suspended') _audioCtx.resume().catch(() => {});
        return _audioCtx;
    }

    const audioMap = {
        test: new Audio('assets/audio/test.wav'),
        approach: new Audio('assets/audio/approach.wav'),
        arrival: new Audio('assets/audio/arrival.wav')
    };

    Object.values(audioMap).forEach(audio => {
        audio.preload = 'auto';
    });

    function unlockRouteAudio() {
        getAudioCtx();
        Object.values(audioMap).forEach(audio => {
            try { audio.load(); } catch(e) {}
        });
    }

    ['click', 'touchstart', 'pointerdown'].forEach(evt => {
        document.addEventListener(evt, () => {
            unlockRouteAudio();
            if (navigator && typeof navigator.vibrate === 'function') {
                try { navigator.vibrate(10); } catch(e) {}
            }
        }, { once: true, capture: true });
    });

    let audioNotificationsEnabled = true;
    try {
        const savedAudio = localStorage.getItem('route_audio_enabled');
        if (savedAudio === 'false') audioNotificationsEnabled = false;
    } catch(e) {}

    function updateAudioBtnUI() {
        const btn   = document.getElementById('audio-status-btn');
        const label = document.getElementById('audio-label');
        const dot   = document.getElementById('audio-dot');
        if (!btn) return;
        if (audioNotificationsEnabled) {
            btn.className = 'active';
            if (label) label.textContent = 'Äänet päällä';
            if (dot)   dot.textContent   = '🔊';
        } else {
            btn.className = 'muted';
            if (label) label.textContent = 'Äänet pois';
            if (dot)   dot.textContent   = '🔇';
        }
    }
    updateAudioBtnUI();

    function playAudioFile(name, fallbackBeepFn) {
        const audio = audioMap[name];
        if (!audio) {
            if (fallbackBeepFn) fallbackBeepFn();
            return;
        }
        try {
            audio.currentTime = 0;
            const p = audio.play();
            if (p && typeof p.catch === 'function') {
                p.catch(err => {
                    console.warn(`HTML5 Äänen (${name}) toisto epäonnistui, käytetään Web Audio -fallbackia:`, err);
                    if (fallbackBeepFn) fallbackBeepFn();
                });
            }
        } catch(e) {
            console.warn(`Äänen (${name}) käynnistys epäonnistui, käytetään Web Audio -fallbackia:`, e);
            if (fallbackBeepFn) fallbackBeepFn();
        }
    }

    function playTestBeepWebAudio() {
        try {
            const ctx = getAudioCtx();
            if (!ctx) return;
            const playSound = () => {
                const now = ctx.currentTime;
                const notes = [
                    { freq: 659.25, start: 0.00, duration: 0.11 },
                    { freq: 830.61, start: 0.12, duration: 0.11 },
                    { freq: 987.77, start: 0.24, duration: 0.14 }
                ];
                notes.forEach(note => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.connect(gain); gain.connect(ctx.destination);
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(note.freq, now + note.start);
                    const noteStart = now + note.start;
                    const noteEnd = noteStart + note.duration;
                    gain.gain.setValueAtTime(0.01, noteStart);
                    gain.gain.exponentialRampToValueAtTime(0.25, noteStart + 0.02);
                    gain.gain.exponentialRampToValueAtTime(0.001, noteEnd);
                    osc.start(noteStart); osc.stop(noteEnd);
                });
            };
            if (ctx.state === 'suspended') ctx.resume().then(() => playSound()).catch(() => {});
            else playSound();
        } catch(e) {}
    }

    function playTestBeep() {
        playAudioFile('test', playTestBeepWebAudio);
    }
    window.playTestBeep = playTestBeep;

    window.toggleAudioNotifications = function() {
        audioNotificationsEnabled = !audioNotificationsEnabled;
        try { localStorage.setItem('route_audio_enabled', String(audioNotificationsEnabled)); } catch(e) {}
        if (audioNotificationsEnabled) {
            unlockRouteAudio();
            playTestBeep();
            triggerVibration('test');
        }
        // Sync AudioEngine mute
        if (typeof AudioEngine !== 'undefined') {
            AudioEngine.isMuted = !audioNotificationsEnabled;
        }
        updateAudioBtnUI();
    };

    function playWarningBeepWebAudio() {
        try {
            const ctx = getAudioCtx();
            if (!ctx) return;
            const playSound = () => {
                const now  = ctx.currentTime;
                const osc  = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain); gain.connect(ctx.destination);
                osc.type = 'sine';
                osc.frequency.setValueAtTime(880, now);
                gain.gain.setValueAtTime(0.01, now);
                gain.gain.exponentialRampToValueAtTime(0.2, now + 0.03);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
                osc.start(now); osc.stop(now + 0.2);
            };
            if (ctx.state === 'suspended') ctx.resume().then(() => playSound()).catch(() => {});
            else playSound();
        } catch(e) {}
    }

    function playWarningBeep() {
        playAudioFile('approach', playWarningBeepWebAudio);
    }

    function playArrivalBeepWebAudio() {
        try {
            const ctx = getAudioCtx();
            if (!ctx) return;
            const playSound = () => {
                const now  = ctx.currentTime;
                const osc  = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain); gain.connect(ctx.destination);
                osc.type = 'sine';
                osc.frequency.setValueAtTime(587.33, now);
                osc.frequency.setValueAtTime(880.00, now + 0.14);
                gain.gain.setValueAtTime(0.01, now);
                gain.gain.exponentialRampToValueAtTime(0.3, now + 0.04);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
                osc.start(now); osc.stop(now + 0.45);
            };
            if (ctx.state === 'suspended') ctx.resume().then(() => playSound()).catch(() => {});
            else playSound();
        } catch(e) {}
    }

    function playArrivalBeep() {
        playAudioFile('arrival', playArrivalBeepWebAudio);
    }

    function triggerVibration(type) {
        if (navigator && typeof navigator.vibrate === 'function') {
            try {
                if (type === 'arrival') navigator.vibrate([250, 100, 250, 100, 700]);
                else if (type === 'approach') navigator.vibrate([180, 80, 180]);
                else if (type === 'test') navigator.vibrate([150, 70, 150]);
            } catch(e) {}
        }
    }
    function triggerFeedback(type) { triggerVibration(type); }
    window.triggerFeedback = triggerFeedback;
    window.triggerVibration = triggerVibration;

    /**
     * handlePointAudio — sama kuin reitti.js, mutta lisää AudioEngine.speak()-kutsut.
     * GPS-moottori kutsuu tätä joka GPS-päivityksellä.
     * Debug-simulaattori kutsuu myös tätä suoraan → sama koodi molemmissa.
     */
    function handlePointAudio(point, distance) {
        if (!point) return;
        const warningRadius  = Number(point.warning_radius  ?? point.properties?.warning_radius ?? 100);
        const arrivalRadius  = Number(point.arrival_radius  ?? point.properties?.arrival_radius ?? 30);
        const isAudioWarningAllowed = (point.audio_warning  ?? point.properties?.audio_warning)  !== false;
        const isAudioArrivalAllowed = (point.audio_arrival  ?? point.properties?.audio_arrival)  !== false;

        // 1. WARNING audio (lähestyminen ~100 m)
        if (!point._audioWarningPlayed && warningRadius > 0 &&
            distance <= warningRadius && distance > arrivalRadius) {
            if (audioNotificationsEnabled && isAudioWarningAllowed) {
                playWarningBeep();
                // ── AudioEngine: puhehuomio kuulokkeisiin ──
                if (AudioEngine.isInitialized) {
                    setTimeout(() => {
                        AudioEngine.speak(`Lähestyt kohdetta: ${point.title || point.name || 'Kokemuspiste'}`);
                    }, 300);
                }
            }
            triggerVibration('approach');
            point._audioWarningPlayed = true;
        }

        // 2. ARRIVAL audio (saapuminen ~30 m)
        if (!point._audioArrivalPlayed && arrivalRadius > 0 && distance <= arrivalRadius) {
            if (audioNotificationsEnabled && isAudioArrivalAllowed) {
                playArrivalBeep();
                // ── AudioEngine: saapumisilmoitus kuulokkeisiin ──
                if (AudioEngine.isInitialized) {
                    setTimeout(() => {
                        AudioEngine.speak(`Olet saapunut kohteeseen: ${point.title || point.name || 'Kokemuspiste'}`);
                    }, 400);
                }
            }
            triggerVibration('arrival');
            point._audioArrivalPlayed = true;
        }
    }

    // ─── TOASTS ──────────────────────────────────────────────────────────────────

    function showApproachingToast(p, distMeters) {
        approachToastVisible = true;
        const name = p.title || p.name || 'Kohde';
        document.getElementById('toast-label').textContent      = 'Kohde lähestyy';
        document.getElementById('toast-icon').textContent       = '📍';
        document.getElementById('toast-point-name').textContent = name;
        document.getElementById('toast-point-dist').textContent = `Noin ${distMeters} m päässä`;
        const toast = document.getElementById('proximity-toast');
        toast.style.borderLeftColor = '#f59e0b';
        toast.classList.add('visible');
        triggerFeedback('approach');
        document.getElementById('toast-open-btn').onclick = () => {
            window.openPointModal && window.openPointModal(p);
        };
        clearTimeout(window._toastTimer);
        window._toastTimer = setTimeout(() => {
            approachToastVisible = false;
            closeProximityToast();
        }, 8000);
    }

    function showArrivalToast(idx, p) {
        approachToastVisible = false;
        closeProximityToast();
        _arrivalCooldownUntil = Date.now() + 5000;
        const name = p.title || p.name || 'Kohde';
        document.getElementById('arrival-name').textContent = name;
        const toast = document.getElementById('arrival-toast');
        toast.classList.add('visible');
        triggerFeedback('arrival');
        document.getElementById('arrival-open-btn').onclick = () => {
            window.openPointModal && window.openPointModal(p);
            closeArrivalToast();
        };
        document.getElementById('arrival-next-btn').onclick = () => {
            completeCurrentPoint(idx);
            closeArrivalToast();
        };
        if (p.auto_open === true) {
            setTimeout(() => window.openPointModal && window.openPointModal(p), 600);
        }
    }

    window.closeArrivalToast = function() {
        const toast = document.getElementById('arrival-toast');
        if (toast) toast.classList.remove('visible');
    };
    document.getElementById('arrival-close-btn').addEventListener('click', window.closeArrivalToast);

    // ─── ARRIVED-TILAN HALLINTA ──────────────────────────────────────────────────

    function markPointArrived(idx, p) {
        arrivedPoints.add(idx);
        p._unlocked = true;
        const pointId = p.id || `pt_${p._lat || p.lat}_${p._lng || p.lng}`;
        try { localStorage.setItem('unlocked_point_' + pointId, 'true'); } catch(e) {}
        if (p.locked_content) {
            if (p.locked_content.description) p.description = p.locked_content.description;
            if (p.locked_content.imageUrl)    p.imageUrl    = p.locked_content.imageUrl;
            if (p.locked_content.image)       p.image       = p.locked_content.image;
            if (p.locked_content.audioUrl)    p.audioUrl    = p.locked_content.audioUrl;
            if (p.locked_content.audio)       p.audio       = p.locked_content.audio;
            if (p.locked_content.youtubeUrl)  p.youtubeUrl  = p.locked_content.youtubeUrl;
            if (p.locked_content.infoLink)    p.infoLink    = p.locked_content.infoLink;
        }
        updateAllMarkerStyles();
        showArrivedBar(idx, p);
        showArrivalToast(idx, p);
        // ── AudioEngine: avaa audio-saapumiskortti ──
        if (AudioEngine.isInitialized) {
            setTimeout(() => openAudioArrivalModal(idx, p), 800);
        }
        saveRouteProgress();
    }

    function completeCurrentPoint(idx) {
        arrivedPoints.delete(idx);
        visitedPoints.add(idx);
        hideArrivedBar();
        closeArrivalToast();
        closeAudioArrivalModal();
        const points = window.routePoints || [];
        const p = points[idx];
        if (p) markPointVisited(idx, p);
        const nextIdx = getNextAvailablePoint(idx);
        activatePoint(nextIdx, { reason: 'completed', fromIndex: idx });
        _arrivalCooldownUntil = Date.now() + 3000;
        saveRouteProgress();
    }
    window.completeCurrentPoint = completeCurrentPoint;

    function getNextAvailablePoint(fromIdx) { return fromIdx + 1; }

    function showArrivedBar(idx, p) {
        const bar = document.getElementById('arrived-bar');
        if (!bar) return;
        const name = p.title || p.name || `Piste ${idx + 1}`;
        document.getElementById('arrived-bar-name').textContent = `${idx + 1}. ${name}`;
        bar.style.display = 'flex';
        requestAnimationFrame(() => requestAnimationFrame(() => bar.classList.add('visible')));
        document.getElementById('arrived-bar-open-btn').onclick = () => {
            window.openPointModal && window.openPointModal(p);
        };
        document.getElementById('arrived-bar-next-btn').onclick = () => completeCurrentPoint(idx);
    }

    function hideArrivedBar() {
        const bar = document.getElementById('arrived-bar');
        if (!bar) return;
        bar.classList.remove('visible');
        setTimeout(() => { bar.style.display = 'none'; }, 400);
    }

    // ─── EDISTYMISEN PERSISTOINTI ────────────────────────────────────────────────

    function saveRouteProgress() {
        try {
            localStorage.setItem('route_progress_' + routeId, JSON.stringify({
                arrived: [...arrivedPoints], visited: [...visitedPoints],
                skipped: [...skippedPoints], nextPointIndex, savedAt: Date.now()
            }));
        } catch(e) {}
    }

    function loadRouteProgress() {
        try {
            const raw = localStorage.getItem('route_progress_' + routeId);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch(e) { return null; }
    }

    function restoreRouteProgress(points) {
        const saved = loadRouteProgress();
        if (!saved) return;
        const max = points.length;
        (saved.visited || []).forEach(i => { if (i < max) visitedPoints.add(i); });
        (saved.skipped || []).forEach(i => { if (i < max) skippedPoints.add(i); });
        if (saved.nextPointIndex != null && saved.nextPointIndex <= max) {
            nextPointIndex = saved.nextPointIndex;
        }
        (saved.arrived || []).forEach(i => {
            if (i < max) { arrivedPoints.add(i); const p = points[i]; if (p) showArrivedBar(i, p); }
        });
        updateAllMarkerStyles();
    }

    window.closeProximityToast = function() {
        document.getElementById('proximity-toast').classList.remove('visible');
        clearTimeout(window._toastTimer);
        approachToastVisible = false;
    };
    document.getElementById('toast-close-btn').addEventListener('click', window.closeProximityToast);

    // ─── AUDIO-INDIKAATTORIN PÄIVITYS ────────────────────────────────────────────

    function updateAudioIndicatorText(userLat, userLng, points) {
        const indicatorEl = document.getElementById('audio-indicator-text');
        if (!indicatorEl || nextPointIndex >= points.length) return;
        const p = points[nextPointIndex];
        const pLat = p._lat ?? p.lat;
        const pLng = p._lng ?? p.lng;
        if (pLat == null || pLng == null) return;
        const dist = Math.round(haversineMeters(userLat, userLng, pLat, pLng));
        const name = p.title || p.name || 'Kohde';
        indicatorEl.textContent = `🎧 Seuraava: ${name} · ${dist} m`;
    }

    // ─── AUDIO ARRIVAL MODAL (kuuloke-elämys pohjakortti) ────────────────────────

    function openAudioArrivalModal(idx, point) {
        const modal = document.getElementById('audio-arrival-modal');
        if (!modal) return;

        document.getElementById('arrival-modal-title').textContent =
            point.title || point.name || 'Kohteen nimi';
        document.getElementById('arrival-modal-desc').textContent =
            point.description || point.short_description || '';

        const imgEl  = document.getElementById('arrival-modal-img');
        const imgUrl = point.imageUrl || point.image || (Array.isArray(point.images) && point.images[0]);
        if (imgUrl) { imgEl.src = imgUrl; imgEl.style.display = 'block'; }
        else imgEl.style.display = 'none';

        // Kuuntele tarina -painike
        const listenBtn   = document.getElementById('btn-listen-story');
        const listenIcon  = document.getElementById('listen-story-icon');
        const listenLabel = document.getElementById('listen-story-label');

        // Palauta painike alkutilaan
        listenBtn.classList.remove('playing');
        if (listenIcon)  listenIcon.textContent  = '▶';
        if (listenLabel) listenLabel.textContent  = 'Kuuntele tarina';

        listenBtn.onclick = () => {
            if (AudioEngine.isPlayingStory) {
                AudioEngine.stop();
                listenBtn.classList.remove('playing');
                if (listenIcon)  listenIcon.textContent  = '▶';
                if (listenLabel) listenLabel.textContent  = 'Kuuntele tarina';
            } else {
                listenBtn.classList.add('playing');
                if (listenIcon)  listenIcon.textContent  = '⏹';
                if (listenLabel) listenLabel.textContent  = 'Pysäytä toisto';

                const audioUrl = point.audioUrl || point.audio_url ||
                    (point.audio && typeof point.audio === 'string' ? point.audio : null);
                if (audioUrl && isValidAudioUrl(audioUrl)) {
                    AudioEngine.playStory(audioUrl, () => {
                        listenBtn.classList.remove('playing');
                        if (listenIcon)  listenIcon.textContent  = '▶';
                        if (listenLabel) listenLabel.textContent  = 'Kuuntele tarina';
                    });
                } else {
                    // Fallback: lue kuvaus ääneen
                    const textToSpeak = point.description || point.title || point.name || '';
                    AudioEngine.speak(textToSpeak, () => {
                        listenBtn.classList.remove('playing');
                        if (listenIcon)  listenIcon.textContent  = '▶';
                        if (listenLabel) listenLabel.textContent  = 'Kuuntele tarina';
                    });
                }
            }
        };

        // Jatka reittiä -painike
        const continueBtn = document.getElementById('btn-continue-route');
        continueBtn.onclick = () => {
            AudioEngine.stop();
            completeCurrentPoint(idx);
            closeAudioArrivalModal();
        };

        modal.classList.add('visible');
    }

    function closeAudioArrivalModal() {
        const modal = document.getElementById('audio-arrival-modal');
        if (modal) modal.classList.remove('visible');
    }
    window.closeAudioArrivalModal = closeAudioArrivalModal;

    // ─── LÄHISTÖLLÄ -OSIO ────────────────────────────────────────────────────────

    let nearbyPlacesEnabled = false;
    let cachedLaukaaInfoPlaces = [];
    let isNearbySectionCollapsed = false;
    let lastNearbyUserLat = null;
    let lastNearbyUserLng = null;

    async function loadLaukaaInfoPlaces() {
        try {
            if (!supabase) return;
            let data = null;
            const rpcResult = await supabase.rpc('get_places_for_mixonet', { p_max_results: 350 });
            if (!rpcResult.error && rpcResult.data && rpcResult.data.length > 0) {
                data = rpcResult.data.map(p => ({
                    place_id: String(p.id), name: p.name, canonical_name: p.canonical_name,
                    type: p.type, lat: p.lat, lon: p.lon
                })).filter(p => p.lat != null && p.lon != null);
            } else {
                const fallback = await supabase.from('places')
                    .select('place_id, name, canonical_name, type, lat, lon')
                    .or('status.eq.active,status.eq.ACTIVE,status.eq.PUBLISHED,status.eq.published,status.is.null')
                    .not('lat', 'is', null).not('lon', 'is', null).limit(350);
                data = fallback.data ? fallback.data.map(p => ({ ...p, place_id: String(p.place_id) })) : null;
            }
            if (!data || data.length === 0) return;
            cachedLaukaaInfoPlaces = data;
            if (userMarker) {
                const latLng = userMarker.getLatLng();
                if (latLng) { updateNearbyPlacesUI(latLng.lat, latLng.lng, true); return; }
            }
            const pts = window.routePoints || [];
            if (pts.length > 0 && pts[0]._lat != null && pts[0]._lng != null) {
                updateNearbyPlacesUI(pts[0]._lat, pts[0]._lng, true);
            } else if (window.routeLineCoords && window.routeLineCoords.length > 0) {
                const first = window.routeLineCoords[0];
                updateNearbyPlacesUI(first[1], first[0], true);
            }
        } catch(e) { console.warn('[Lähistöllä] Latausvirhe:', e); }
    }

    function updateNearbyPlacesUI(userLat, userLng, force = false) {
        const container = document.getElementById('nearby-places-container');
        if (!nearbyPlacesEnabled || !container || !cachedLaukaaInfoPlaces.length) return;
        if (userLat == null || userLng == null) return;
        if (isNearbySectionCollapsed) return;
        if (!force && lastNearbyUserLat != null) {
            if (haversineMeters(userLat, userLng, lastNearbyUserLat, lastNearbyUserLng) < 10) return;
        }
        lastNearbyUserLat = userLat; lastNearbyUserLng = userLng;
        const routePointIds = new Set((window.routePoints || []).map(pt => pt.id).filter(Boolean));
        const withDist = cachedLaukaaInfoPlaces
            .filter(p => p.lat != null && p.lon != null && !routePointIds.has(p.place_id))
            .map(p => ({ ...p, distMeters: haversineMeters(userLat, userLng, Number(p.lat), Number(p.lon)) }))
            .sort((a, b) => a.distMeters - b.distMeters).slice(0, 4);
        if (withDist.length === 0) {
            container.innerHTML = `<div style="font-size:0.82rem;color:#94a3b8;padding:0.8rem;text-align:center;background:#f8fafc;border-radius:12px;">Ei muita LaukaaInfo-kohteita välittömässä läheisyydessä.</div>`;
            return;
        }
        container.innerHTML = withDist.map(p => {
            const name     = p.name || p.canonical_name || 'LaukaaInfo-kohde';
            const category = p.type || 'Kohde';
            const distStr  = p.distMeters >= 1000
                ? `${(p.distMeters / 1000).toFixed(1).replace('.', ',')} km`
                : `${Math.round(p.distMeters)} m`;
            return `
                <a href="tietoa-paikasta.html?id=${encodeURIComponent(p.place_id)}" target="_blank" rel="noopener" style="text-decoration:none;display:flex;align-items:center;justify-content:space-between;padding:0.75rem 1rem;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;transition:background 0.2s,border-color 0.2s;">
                    <div style="display:flex;align-items:center;gap:0.75rem;min-width:0;">
                        <span style="font-size:0.8rem;font-weight:800;color:#2563eb;background:#dbeafe;padding:0.25rem 0.65rem;border-radius:20px;white-space:nowrap;flex-shrink:0;">${distStr}</span>
                        <div style="min-width:0;">
                            <div style="font-size:0.92rem;font-weight:700;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${name}</div>
                            <div style="font-size:0.75rem;color:#64748b;">${category}</div>
                        </div>
                    </div>
                    <span style="font-size:0.82rem;font-weight:700;color:#059669;flex-shrink:0;margin-left:0.5rem;">Näytä →</span>
                </a>`;
        }).join('');
    }

    window.toggleNearbySection = function() {
        isNearbySectionCollapsed = !isNearbySectionCollapsed;
        const container = document.getElementById('nearby-places-container');
        const btn       = document.getElementById('toggle-nearby-btn');
        if (!container || !btn) return;
        if (isNearbySectionCollapsed) {
            container.style.display = 'none'; btn.textContent = 'Laajenna';
        } else {
            container.style.display = 'flex'; btn.textContent = 'Pienennä';
            if (userMarker) { const latLng = userMarker.getLatLng(); if (latLng) updateNearbyPlacesUI(latLng.lat, latLng.lng); }
        }
    };

    // ─── DEBUG-SIMULAATTORI (?debug=1) ───────────────────────────────────────────
    // Kutsuu täsmälleen samoja funktioita kuin oikea GPS-tapahtuma.

    const isDebugMode = urlParams.get('debug') === '1';
    if (isDebugMode) {
        // Injektoi kelluva debug-paneeli
        const debugPanel = document.createElement('div');
        debugPanel.id = 'debug-panel';
        debugPanel.style.cssText = [
            'position:fixed', 'bottom:1rem', 'right:1rem', 'z-index:999999',
            'background:rgba(15,23,42,0.95)', 'color:#f8fafc',
            'backdrop-filter:blur(12px)', 'border:1px solid rgba(255,255,255,0.15)',
            'border-radius:18px', 'padding:1.1rem 1.2rem', 'min-width:220px',
            'box-shadow:0 20px 60px rgba(0,0,0,0.4)', 'font-family:inherit',
            'font-size:0.78rem', 'font-weight:700'
        ].join(';');
        debugPanel.innerHTML = `
            <div style="font-size:0.65rem;font-weight:900;text-transform:uppercase;letter-spacing:0.1em;color:#94a3b8;margin-bottom:0.6rem;">
                🛠 DEBUG ?debug=1
            </div>
            <div style="font-size:0.72rem;color:#64748b;margin-bottom:0.75rem;">
                Seuraava piste: <span id="dbg-next-name">—</span>
            </div>
            <div style="display:flex;flex-direction:column;gap:0.5rem;">
                <div style="font-size:0.65rem;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;">Ääni-testit</div>
                <button id="dbg-chime-warning"  class="dbg-btn">🔔 Chime: Warning</button>
                <button id="dbg-chime-arrival"  class="dbg-btn">🎵 Chime: Arrival</button>
                <button id="dbg-speak-test"     class="dbg-btn">🗣️ Testaa puhe</button>
                <div style="height:1px;background:rgba(255,255,255,0.1);margin:0.25rem 0;"></div>
                <div style="font-size:0.65rem;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;">Etäisyyssimulaattori</div>
                <button id="dbg-sim-180" class="dbg-btn">↠ 180 m</button>
                <button id="dbg-sim-100" class="dbg-btn dbg-warn">⚠️ 100 m (WARNING)</button>
                <button id="dbg-sim-30"  class="dbg-btn dbg-arr">📍 30 m (ARRIVED)</button>
                <button id="dbg-sim-reset" class="dbg-btn dbg-reset">↺ RESET piste</button>
            </div>`;

        const style = document.createElement('style');
        style.textContent = `
            .dbg-btn { background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.15);
                color:#f8fafc; border-radius:10px; padding:0.45rem 0.7rem; font-size:0.75rem;
                font-weight:700; cursor:pointer; font-family:inherit; text-align:left;
                transition:background 0.15s; }
            .dbg-btn:hover { background:rgba(255,255,255,0.15); }
            .dbg-warn { border-color:#fbbf24; color:#fcd34d; }
            .dbg-arr  { border-color:#34d399; color:#6ee7b7; }
            .dbg-reset { border-color:#f87171; color:#fca5a5; }
        `;
        document.head.appendChild(style);
        document.body.appendChild(debugPanel);

        // Päivitä seuraava piste -teksti
        setInterval(() => {
            const pts  = window.routePoints || [];
            const name = pts[nextPointIndex]?.title || pts[nextPointIndex]?.name || `Piste ${nextPointIndex + 1}`;
            const dbgEl = document.getElementById('dbg-next-name');
            if (dbgEl) dbgEl.textContent = `#${nextPointIndex + 1} ${name}`;
        }, 500);

        // Ääni-testit
        document.getElementById('dbg-chime-warning').onclick = () => {
            AudioEngine.init();
            AudioEngine.playChime('warning');
        };
        document.getElementById('dbg-chime-arrival').onclick = () => {
            AudioEngine.init();
            AudioEngine.playChime('arrival');
        };
        document.getElementById('dbg-speak-test').onclick = () => {
            AudioEngine.init();
            const pts  = window.routePoints || [];
            const name = pts[nextPointIndex]?.title || 'Testikohde';
            AudioEngine.speak(`Lähestyt kohdetta: ${name}`);
        };

        /**
         * simulateDistToNextPoint — kutsuu täsmälleen samaa handlePointAudio-funktiota
         * kuin oikea GPS. Ei toista tapahtumaketjua.
         */
        function simulateDistToNextPoint(dist) {
            AudioEngine.init();
            const pts = window.routePoints || [];
            if (nextPointIndex >= pts.length) {
                alert('Kaikki pisteet jo käyty!'); return;
            }
            const p = pts[nextPointIndex];
            // Kutsutaan samaa handlePointAudio kuin GPS-moottori
            handlePointAudio(p, dist);
            // Jos etäisyys <= arrival_radius, trigger markPointArrived
            const arrivalR = Number(p.arrival_radius ?? 30);
            if (dist <= arrivalR && !arrivedPoints.has(nextPointIndex)) {
                markPointArrived(nextPointIndex, p);
            }
            console.log(`[DEBUG] simulateDistToNextPoint: dist=${dist} m → piste "${p.title || p.name}"`);
        }
        window.simulateDistToNextPoint = simulateDistToNextPoint;

        document.getElementById('dbg-sim-180').onclick = () => simulateDistToNextPoint(180);
        document.getElementById('dbg-sim-100').onclick = () => simulateDistToNextPoint(100);
        document.getElementById('dbg-sim-30').onclick  = () => simulateDistToNextPoint(30);
        document.getElementById('dbg-sim-reset').onclick = () => {
            const pts = window.routePoints || [];
            if (nextPointIndex < pts.length) {
                const p = pts[nextPointIndex];
                p._audioWarningPlayed = false;
                p._audioArrivalPlayed = false;
                arrivedPoints.delete(nextPointIndex);
                AudioEngine.stop();
                closeAudioArrivalModal();
                closeArrivalToast();
                updateAllMarkerStyles();
                console.log(`[DEBUG] RESET: piste "${p.title || p.name}" resetoitu`);
            }
        };
    }

    // ─── LOCK SCREEN ─────────────────────────────────────────────────────────────

    loadRoute();

    const handleUnlockSubmit = async () => {
        const inputEl = document.getElementById('access-code');
        const code    = inputEl ? inputEl.value.trim() : '';
        if (!code) return;
        document.getElementById('btn-unlock').disabled    = true;
        document.getElementById('btn-unlock').textContent = 'Tarkistetaan...';
        document.getElementById('unlock-error').style.display = 'none';
        await loadRoute(code);
        if (currentRouteData && !currentRouteData.access_granted) {
            document.getElementById('unlock-error').style.display = 'block';
            document.getElementById('btn-unlock').disabled    = false;
            document.getElementById('btn-unlock').textContent = 'Avaa reitti';
        }
    };

    const btnUnlock = document.getElementById('btn-unlock');
    if (btnUnlock) btnUnlock.addEventListener('click', handleUnlockSubmit);
    const accessCodeInput = document.getElementById('access-code');
    if (accessCodeInput) {
        accessCodeInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); handleUnlockSubmit(); }
        });
    }

    // ─── MODAL LOGIC & HELPERS ───────────────────────────────────────────────────

    function getYoutubeId(url) {
        if (!url || typeof url !== 'string') return null;
        const trimmed = url.trim();
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|shorts\/)([^#\&\?]*).*/;
        const match  = trimmed.match(regExp);
        if (match && match[2] && match[2].length === 11) return match[2];
        if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
        return null;
    }

    function isValidVideoUrl(url) {
        if (!url || typeof url !== 'string') return false;
        const t = url.trim();
        if (t.length < 3) return false;
        if (getYoutubeId(t)) return true;
        if (/\.(mp4|webm|ogg)(\?.*)?$/i.test(t)) return true;
        if (t.includes('youtube.com') || t.includes('youtu.be') || t.includes('vimeo.com')) return true;
        return false;
    }

    function isValidImageUrl(url) {
        if (!url || typeof url !== 'string') return false;
        const t = url.trim();
        if (t.length < 5) return false;
        const l = t.toLowerCase();
        if (['kuva','kuvat','image','images','photo','photos','none','null','undefined','-','kuva.jpg'].includes(l)) return false;
        if (isValidVideoUrl(t)) return false;
        if (t.startsWith('http://') || t.startsWith('https://') || t.startsWith('data:image/') ||
            t.startsWith('blob:') || t.startsWith('/') || t.startsWith('./')) return true;
        if (/\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?.*)?$/i.test(t)) return true;
        return false;
    }

    function isValidLinkUrl(url) {
        if (!url || typeof url !== 'string') return false;
        const t = url.trim();
        if (t.length < 5) return false;
        if (isValidVideoUrl(t) || isValidImageUrl(t)) return false;
        if (t.startsWith('http://') || t.startsWith('https://') || t.startsWith('www.')) return true;
        return false;
    }

    function isValidAudioUrl(url) {
        if (!url || typeof url !== 'string') return false;
        const t = url.trim();
        if (t.length < 5) return false;
        const l = t.toLowerCase();
        if (['audio','aanileike','aani','sound','none','null','undefined','-'].includes(l)) return false;
        if (isValidVideoUrl(t) || isValidImageUrl(t)) return false;
        if (t.startsWith('http://') || t.startsWith('https://') || t.startsWith('data:audio/') ||
            t.startsWith('blob:') || t.startsWith('/') || t.startsWith('./')) return true;
        if (/\.(mp3|m4a|wav|ogg|aac|flac)(\?.*)?$/i.test(t)) return true;
        return false;
    }

    let pointSwiperInstance = null;

    window.openPointModal = function(p) {
        if (!p) return;
        const mediaContainer = document.getElementById('point-modal-media-container');
        const tabsContainer  = document.getElementById('point-modal-tabs');
        const linkContainer  = document.getElementById('point-modal-link-container');
        mediaContainer.innerHTML = ''; mediaContainer.style.display = 'none';
        if (tabsContainer) { tabsContainer.innerHTML = ''; tabsContainer.style.display = 'none'; }
        if (linkContainer) { linkContainer.innerHTML = ''; linkContainer.style.display = 'none'; }

        const _allPoints = window.routePoints || [];
        const _pointIdx  = _allPoints.findIndex(pt => pt === p || (pt.id && pt.id === p.id));
        const _isArrived = arrivedPoints.has(_pointIdx);

        if (window.isPointUnlocked && !window.isPointUnlocked(p) && !_isArrived) {
            const modalTitle = p.title || p.name || 'Salainen kokemuspiste';
            const radius     = p.unlock_radius || p.arrival_radius || 30;
            const points     = window.routePoints || [];
            const idx        = _pointIdx;
            let sequenceNotice = '';
            if (idx > 0) {
                const prevPoint   = points[idx - 1];
                const prevUnlocked = window.isPointUnlocked(prevPoint);
                if (!prevUnlocked) {
                    const prevName = prevPoint ? (prevPoint.title || prevPoint.name || `Piste #${idx}`) : `Piste #${idx}`;
                    sequenceNotice = `<div style="margin-top:0.9rem;padding:0.7rem 0.8rem;background:#fff7ed;border:1px solid #ffedd5;border-radius:10px;font-size:0.83rem;color:#c2410c;text-align:left;"><strong>🔢 Kokemuspolku kierretään järjestyksessä:</strong><br/>Avaa ensin aiemmat kokemuspisteet (esim. <em>${idx}. ${prevName}</em>).</div>`;
                }
            }
            let shortcutNotice = '';
            const shortcutTargetIdLocked = p.shortcut_to || p.shortcutTo;
            if (shortcutTargetIdLocked) {
                const targetPoint = points.find(pt => pt.id === shortcutTargetIdLocked);
                const targetName  = targetPoint?.title || targetPoint?.name || 'myöhempään pisteeseen';
                shortcutNotice = `<div style="margin-top:0.9rem;padding:0.75rem 0.9rem;background:linear-gradient(135deg,#fff7ed,#fffbeb);border:1.5px solid #fed7aa;border-radius:12px;font-size:0.82rem;color:#92400e;text-align:left;display:flex;align-items:flex-start;gap:8px;"><span style="font-size:1.1rem;flex-shrink:0;">⏭</span><div><strong>Oikaisumahdollisuus:</strong> Tällä pisteellä voit halutessasi siirtyä suoraan pisteeseen <em>${targetName}</em>.</div></div>`;
            }
            document.getElementById('point-modal-title').textContent = modalTitle;
            document.getElementById('point-modal-desc').innerHTML = `
                <div style="text-align:center;padding:1.5rem 1rem;background:#fffbeb;border:1px solid #fef3c7;border-radius:14px;margin-top:1rem;">
                    <div style="font-size:2.8rem;margin-bottom:0.6rem;">🔒</div>
                    <h4 style="margin:0 0 0.5rem 0;color:#92400e;font-size:1.15rem;font-weight:700;">Avautuu vasta kohteessa</h4>
                    <p style="margin:0;color:#b45309;font-size:0.9rem;line-height:1.55;">Tämän kokemuspisteen tarina paljastuu vasta kun saavut fyysisesti kohteeseen!</p>
                    ${sequenceNotice}${shortcutNotice}
                    <div style="margin-top:1.2rem;padding:0.75rem;background:#fef08a;border-radius:10px;font-size:0.85rem;font-weight:700;color:#78350f;display:inline-flex;align-items:center;gap:6px;">📍 Avautumisetäisyys: ${radius} m</div>
                </div>`;
            document.getElementById('point-modal').classList.add('active');
            document.getElementById('point-modal').style.display = 'flex';
            return;
        }

        const modalTitle = p.title || p.name || 'Nimetön piste';
        const modalDesc  = p.description || p.desc || p.text || p.details || '';
        if (linkContainer) { linkContainer.innerHTML = ''; linkContainer.style.display = 'none'; }

        const rawVideoSources = [p.youtubeUrl, p.youtube_url, p.youtube, p.videoUrl, p.video_url, p.video, p.youtube_id, p.video_id, p.media, p.imageUrl, p.image].flat().filter(Boolean);
        const videos = [];
        rawVideoSources.forEach(item => {
            let url = typeof item === 'string' ? item : (item.url || item.blobUrl || item.videoUrl || item.youtubeUrl);
            if (url && typeof url === 'string' && isValidVideoUrl(url)) {
                const t = url.trim(); if (!videos.includes(t)) videos.push(t);
            }
        });

        const rawImageSources = [p.imageUrl, p.images, p.image, p.media, p.photos, p.photo, p.picture].flat().filter(Boolean);
        const images = [];
        rawImageSources.forEach(item => {
            let url = typeof item === 'string' ? item : (item.url || item.blobUrl || item.imageUrl);
            if (url && typeof url === 'string' && isValidImageUrl(url)) {
                const t = url.trim(); if (!images.includes(t)) images.push(t);
            }
        });

        const rawAudioSources = [p.audioUrl, p.audio_url, p.audio, p.audioId, p.media].flat().filter(Boolean);
        const audios = [];
        rawAudioSources.forEach(item => {
            let url = typeof item === 'string' ? item : (item.url || item.blobUrl || item.audioUrl);
            if (url && typeof url === 'string' && isValidAudioUrl(url)) {
                const t = url.trim(); if (!audios.includes(t)) audios.push(t);
            }
        });

        const rawLinkSources = [p.infoLink, p.info_link, p.link, p.url, p.website].flat().filter(Boolean);
        let targetLink = null;
        for (const item of rawLinkSources) {
            let url = typeof item === 'string' ? item : item.url;
            if (url && typeof url === 'string' && isValidLinkUrl(url)) {
                targetLink = url.trim().startsWith('www.') ? 'https://' + url.trim() : url.trim(); break;
            }
        }

        document.getElementById('point-modal-title').textContent = modalTitle;

        let audioBarHtml = '';
        if (audios.length > 0) {
            audioBarHtml = `<div style="margin-top:20px;padding:14px 18px;background:rgba(37,99,235,0.08);border-radius:14px;border:1px solid rgba(37,99,235,0.2);display:flex;align-items:center;gap:14px;"><span style="font-size:1.8rem;flex-shrink:0;">🎧</span><div style="flex:1;min-width:0;"><div style="font-size:0.72rem;font-weight:800;text-transform:uppercase;letter-spacing:0.05em;color:#2563eb;margin-bottom:6px;">Äänileike kuunneltavissa</div><audio controls style="width:100%;height:36px;outline:none;"><source src="${audios[0]}"></audio></div></div>`;
        }
        document.getElementById('point-modal-desc').innerHTML = (modalDesc ? modalDesc.replace(/\n/g, '<br>') : '') + audioBarHtml;

        function renderVideoView(videoUrl) {
            mediaContainer.style.display = 'block';
            const ytId = getYoutubeId(videoUrl);
            if (ytId) {
                mediaContainer.innerHTML = `<div class="lki-modal-video-wrapper"><iframe src="https://www.youtube.com/embed/${ytId}?autoplay=1" allow="autoplay;encrypted-media;picture-in-picture" allowfullscreen></iframe><a href="https://www.youtube.com/watch?v=${ytId}" target="_blank" rel="noopener" class="lki-modal-yt-link">📺 Katso YouTubessa &rarr;</a></div>`;
            } else if (videoUrl.match(/\.(mp4|webm|ogg)(\?.*)?$/i)) {
                mediaContainer.innerHTML = `<video controls autoplay style="width:100%;height:100%;object-fit:contain;"><source src="${videoUrl}"></video>`;
            } else {
                mediaContainer.innerHTML = `<iframe src="${videoUrl}" allowfullscreen style="width:100%;height:100%;border:none;"></iframe>`;
            }
        }

        function renderImageView(imgList) {
            mediaContainer.style.display = 'block';
            if (pointSwiperInstance) { pointSwiperInstance.destroy(true, true); pointSwiperInstance = null; }
            if (imgList.length === 1) {
                mediaContainer.innerHTML = `<img src="${imgList[0]}" alt="${modalTitle}" style="width:100%;height:100%;object-fit:contain;">`;
            } else {
                mediaContainer.innerHTML = `<div class="swiper" id="point-modal-swiper"><div class="swiper-wrapper">${imgList.map(img => `<div class="swiper-slide"><img src="${img}" alt="${modalTitle}" style="width:100%;height:100%;object-fit:contain;"></div>`).join('')}</div><div class="swiper-pagination"></div><div class="swiper-button-next"></div><div class="swiper-button-prev"></div></div>`;
                setTimeout(() => {
                    if (typeof Swiper !== 'undefined') {
                        pointSwiperInstance = new Swiper('#point-modal-swiper', {
                            pagination: { el: '.swiper-pagination', clickable: true },
                            navigation: { nextEl: '.swiper-button-next', prevEl: '.swiper-button-prev' },
                            loop: true
                        });
                    }
                }, 50);
            }
        }

        function renderAudioView(audioUrl) {
            mediaContainer.style.display = 'block';
            if (pointSwiperInstance) { pointSwiperInstance.destroy(true, true); pointSwiperInstance = null; }
            mediaContainer.innerHTML = `<div style="width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#0f172a;padding:24px;text-align:center;box-sizing:border-box;"><div style="font-size:3.5rem;margin-bottom:10px;">🎧</div><div style="color:#f8fafc;font-size:1.2rem;font-weight:800;margin-bottom:14px;">Kuuntele äänileike</div><audio controls autoplay style="width:100%;max-width:440px;outline:none;border-radius:30px;"><source src="${audioUrl}">Selaimesi ei tue äänitoistoa.</audio></div>`;
        }

        let currentTab = 'none';
        if (images.length > 0) { currentTab = 'images'; renderImageView(images); }
        else if (videos.length > 0) { currentTab = 'video'; renderVideoView(videos[0]); }
        else if (audios.length > 0) { currentTab = 'audio'; renderAudioView(audios[0]); }

        const availableTabs = [];
        if (images.length > 0) availableTabs.push({ id: 'images', label: images.length > 1 ? `🖼️ Esittelykuvat (${images.length})` : '🖼️ Esittelykuva' });
        if (videos.length > 0) availableTabs.push({ id: 'video', label: `🎬 Video ${videos.length > 1 ? `(${videos.length})` : ''}` });
        if (audios.length > 0) availableTabs.push({ id: 'audio', label: `🎧 Äänileike ${audios.length > 1 ? `(${audios.length})` : ''}` });
        if (targetLink) availableTabs.push({ id: 'link', label: '🌐 Lisätietoa' });

        if (tabsContainer && availableTabs.length > 0) {
            tabsContainer.style.display = 'flex';
            tabsContainer.innerHTML = availableTabs.map(t =>
                `<button type="button" class="point-modal-tab-btn ${t.id === 'video' ? 'video-btn' : ''} ${t.id === 'audio' ? 'audio-btn' : ''} ${t.id === 'link' ? 'link-btn' : ''} ${t.id === currentTab ? 'active' : ''}" data-tab="${t.id}">${t.label}</button>`
            ).join('');
            tabsContainer.querySelectorAll('.point-modal-tab-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const tabId = btn.getAttribute('data-tab');
                    if (tabId === 'link') {
                        try {
                            const win = window.open(targetLink, '_blank', 'noopener,noreferrer');
                            if (!win || win.closed || typeof win.closed === 'undefined') window.location.href = targetLink;
                        } catch(e) { window.location.href = targetLink; }
                        return;
                    }
                    tabsContainer.querySelectorAll('.point-modal-tab-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    if (tabId === 'images') renderImageView(images);
                    else if (tabId === 'video') renderVideoView(videos[0]);
                    else if (tabId === 'audio') renderAudioView(audios[0]);
                });
            });
        }

        if (linkContainer) {
            linkContainer.innerHTML = '';
            let hasFooterContent = false;
            if (targetLink) {
                const linkBtn = document.createElement('a');
                linkBtn.href = targetLink; linkBtn.target = '_blank'; linkBtn.rel = 'noopener';
                linkBtn.className = 'lki-cta-btn website';
                linkBtn.textContent = 'Lisätietoa kohteesta →';
                linkContainer.appendChild(linkBtn);
                hasFooterContent = true;
            }
            if (_isArrived) {
                const continueBtn = document.createElement('button');
                continueBtn.type = 'button'; continueBtn.className = 'lki-cta-btn continue';
                continueBtn.style.cssText = 'background:#059669;color:#fff;border:none;padding:12px 20px;border-radius:12px;font-size:0.95rem;font-weight:700;cursor:pointer;width:100%;margin-top:8px;display:flex;align-items:center;justify-content:center;gap:8px;font-family:inherit;transition:background 0.2s;';
                continueBtn.innerHTML = 'Jatka eteenpäin &rarr;';
                continueBtn.onclick = () => { completeCurrentPoint(_pointIdx); closePointModal(); };
                linkContainer.appendChild(continueBtn);
                hasFooterContent = true;
            }
            linkContainer.style.display = hasFooterContent ? 'flex' : 'none';
            if (hasFooterContent) { linkContainer.style.flexDirection = 'column'; linkContainer.style.gap = '8px'; }
        }

        // Oikaisu-paneeli
        const shortcutTargetId  = p.shortcut_to || p.shortcutTo;
        const shortcutPanelEl   = document.getElementById('shortcut-panel');
        const shortcutBtnNormal = document.getElementById('shortcut-btn-normal');
        const shortcutBtnTake   = document.getElementById('shortcut-btn-take');
        const shortcutTargetNameEl = document.getElementById('shortcut-target-name');
        if (shortcutPanelEl) shortcutPanelEl.classList.remove('visible');

        if (shortcutTargetId && shortcutPanelEl) {
            const points     = window.routePoints || [];
            const currentIdx = points.findIndex(pt => pt === p || (pt.id && pt.id === p.id));
            const targetIdx  = points.findIndex(pt => pt.id === shortcutTargetId);
            const isValidShortcut = (targetIdx > currentIdx && !visitedPoints.has(targetIdx) &&
                !skippedPoints.has(targetIdx) && targetIdx > nextPointIndex - 1);
            if (isValidShortcut) {
                const targetPoint = points[targetIdx];
                const targetName  = targetPoint?.title || targetPoint?.name || `Piste ${targetIdx + 1}`;
                if (shortcutTargetNameEl) shortcutTargetNameEl.textContent = targetName;
                const descEl = document.getElementById('shortcut-panel-desc');
                if (descEl) {
                    const skippedNums = [];
                    for (let i = currentIdx + 1; i < targetIdx; i++) skippedNums.push(i + 1);
                    if (skippedNums.length === 1) {
                        descEl.innerHTML = `Voit siirtyä suoraan pisteeseen <strong>${targetName}</strong>. Kohde <strong>${skippedNums[0]}</strong> ohitetaan — sen sisältö säilyy <strong>lukittuna</strong>.`;
                    } else if (skippedNums.length > 1) {
                        const lastNum = skippedNums.pop();
                        descEl.innerHTML = `Voit siirtyä suoraan pisteeseen <strong>${targetName}</strong>. Kohteet <strong>${skippedNums.join(', ')} ja ${lastNum}</strong> ohitetaan — niiden sisältö säilyy <strong>lukittuna</strong>.`;
                    } else {
                        descEl.innerHTML = `Voit siirtyä suoraan pisteeseen <strong>${targetName}</strong>. Ohitettujen pisteiden sisältö säilyy <strong>lukittuna</strong>.`;
                    }
                }
                shortcutPanelEl.classList.add('visible');
                if (shortcutBtnNormal) shortcutBtnNormal.onclick = () => shortcutPanelEl.classList.remove('visible');
                if (shortcutBtnTake) {
                    shortcutBtnTake.onclick = () => {
                        arrivedPoints.delete(currentIdx);
                        if (currentIdx >= 0 && !visitedPoints.has(currentIdx)) {
                            visitedPoints.add(currentIdx);
                            const currentP = points[currentIdx];
                            if (currentP) markPointVisited(currentIdx, currentP);
                        }
                        hideArrivedBar();
                        closeArrivalToast();
                        activatePoint(targetIdx, { reason: 'shortcut', fromIndex: currentIdx });
                        shortcutPanelEl.classList.remove('visible');
                        closePointModal();
                        saveRouteProgress();
                    };
                }
            }
        }

        document.getElementById('point-modal').classList.add('active');
    };

    function closePointModal() {
        const modal = document.getElementById('point-modal');
        if (modal) { modal.classList.remove('active'); modal.style.display = ''; }
        document.getElementById('point-modal-media-container').innerHTML = '';
        if (pointSwiperInstance) { pointSwiperInstance.destroy(true, true); pointSwiperInstance = null; }
    }

    const closeModalBtn = document.getElementById('point-modal-close');
    if (closeModalBtn) closeModalBtn.addEventListener('click', closePointModal);

    document.getElementById('point-modal').addEventListener('click', (e) => {
        if (e.target.id === 'point-modal') closePointModal();
    });
});
