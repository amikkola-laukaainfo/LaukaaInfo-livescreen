document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const routeId = urlParams.get('id');

    const isEmbed = urlParams.get('embed') === '1' || urlParams.get('embed') === 'true';
    if (isEmbed) {
        document.body.classList.add('is-embed-mode');
        
        // Add "LaukaaInfo ↗" link badge pointing to standalone page
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
            // Otherwise fallback link href="index.html" navigates to LaukaaInfo frontpage
        });
    }

    if (!routeId) {
        document.getElementById('route-title').textContent = 'Reittiä ei löytynyt';
        return;
    }

    const AI_SUPABASE_URL = 'https://duxluwyqxvbmkkjzuzkz.supabase.co';
    const AI_SUPABASE_KEY = 'sb_publishable_HgfWyipuSO7gvsVUR1smNQ_aXox2OPu';
    
    // Initialize Supabase if not already done
    const supabase = window.supabase.createClient(AI_SUPABASE_URL, AI_SUPABASE_KEY);
    
    let currentRouteData = null;

    // Load initial route data (no GeoJSON if private without code)
    async function loadRoute(code = null) {
        try {
            const { data, error } = await supabase.rpc('get_route_with_access', {
                route_id: routeId,
                provided_code: code
            });

            if (error) throw error;
            if (!data) throw new Error('No data returned');

            currentRouteData = data;
            renderRouteState();
            
        } catch (err) {
            console.error('Virhe reitin latauksessa:', err);
            document.getElementById('route-title').textContent = 'Reittiä ei löytynyt tai tapahtui virhe.';
        }
    }

    function renderRouteState() {
        const d = currentRouteData;
        if (!d) return;

        // Determine route title with GeoJSON fallback if needed
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
        document.title = `${finalTitle} – LaukaaInfo`;
        document.getElementById('route-desc').textContent = d.description || '';
        
        if (d.distance_meters) {
            document.getElementById('route-distance').innerHTML = `<span class="iconify" data-icon="material-symbols:route"></span> ${(d.distance_meters / 1000).toFixed(1).replace('.', ',')} km`;
        }

        // Fetch place name if possible (optional enhancement, assuming place_id is available)
        if (d.place_id) {
            supabase.from('places').select('name').eq('place_id', d.place_id).single().then(res => {
                if (res.data) {
                    document.getElementById('route-place').innerHTML = `<span class="iconify" data-icon="material-symbols:location-on"></span> ${res.data.name}`;
                }
            });
        }

        // View logic
        if (d.visibility === 'private' && !d.access_granted) {
            // Show lock screen
            document.getElementById('lock-screen').style.display = 'block';
            document.getElementById('content-area').style.display = 'none';
            document.getElementById('route-badge').textContent = '🔒 Suojattu elämyspolku';
            document.getElementById('route-badge').style.background = '#ffe4e6';
            document.getElementById('route-badge').style.color = '#e11d48';
        } else if (d.access_granted) {
            // Show content
            document.getElementById('lock-screen').style.display = 'none';
            document.getElementById('content-area').style.display = 'block';
            
            if (d.visibility === 'private') {
                document.getElementById('route-badge').textContent = '🔒 Suojattu (Avattu)';
                document.getElementById('route-badge').style.background = '#e0e7ff';
                document.getElementById('route-badge').style.color = '#4338ca';
            } else {
                document.getElementById('route-badge').textContent = d.category || 'Reitti';
            }

            renderGeoJSON(d.route_geojson);
        }
    }

    function renderGeoJSON(geoJsonStr) {
        if (!geoJsonStr) return;
        
        let geojson;
        try {
            geojson = typeof geoJsonStr === 'string' ? JSON.parse(geoJsonStr) : geoJsonStr;
        } catch (e) {
            console.error('Virhe GeoJSON:n parsimisessa', e);
            return;
        }

        // Init Map
        const map = L.map('map');
        window._leafletMap = map;  // stored for GPS user marker
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(map);

        // Add GeoJSON to map
        const points = [];
        let routeLineCoords = [];  // [[lng, lat], ...] from GeoJSON LineString

        const geojsonLayer = L.geoJSON(geojson, {
            style: function (feature) {
                if (feature.geometry && feature.geometry.type === 'LineString') {
                    return { color: '#059669', weight: 5, opacity: 0.8 };
                }
                return {};
            },
            pointToLayer: function (feature, latlng) {
                const marker = L.circleMarker(latlng, {
                    radius: 8,
                    fillColor: "#e11d48",
                    color: "#fff",
                    weight: 2,
                    opacity: 1,
                    fillOpacity: 0.8
                });
                return marker;
            },
            onEachFeature: function (feature, layer) {
                if (feature.geometry.type === 'LineString') {
                    // Capture route coords for GPS distance/progress calculations
                    routeLineCoords = feature.geometry.coordinates; // [[lng, lat], ...]
                }
                if (feature.geometry.type === 'Point' && feature.properties) {
                    const p = feature.properties;
                    // Attach coordinates and layer ref directly for GPS engine
                    p._lat = feature.geometry.coordinates[1];
                    p._lng = feature.geometry.coordinates[0];
                    p._layer = layer;
                    points.push(p);

                    // Bind click event to open custom modal instead of default popup
                    layer.on('click', () => {
                        window.openPointModal(p);
                    });
                }
            }
        }).addTo(map);

        // Sort by explicit `order` property — fallback to initial index if missing or equal
        points.forEach((p, idx) => {
            p._initialIdx = idx;
        });
        points.sort((a, b) => {
            const ao = (a.order != null && !isNaN(a.order)) ? Number(a.order) : Infinity;
            const bo = (b.order != null && !isNaN(b.order)) ? Number(b.order) : Infinity;
            if (ao !== bo) return ao - bo;
            return a._initialIdx - b._initialIdx;
        });

        // Expose globally for GPS navigation engine
        window.routeLineCoords = routeLineCoords;
        window.totalRouteLength = computeRouteLength(routeLineCoords);

        map.fitBounds(geojsonLayer.getBounds(), { padding: [50, 50] });

        function isPointUnlocked(p) {
            if (!p) return true;
            const mode = p.unlock_mode || (p.unlock_mode === 'ON_LOCATION' || p.unlock_mode === 'REQUIRE_PREVIOUS' ? p.unlock_mode : 'PUBLIC');
            if (mode === 'PUBLIC') return true;
            if (p._unlocked) return true;
            const pointId = p.id || `pt_${p._lat || p.lat}_${p._lng || p.lng}`;
            try {
                if (localStorage.getItem('unlocked_point_' + pointId) === 'true') {
                    p._unlocked = true;
                    if (p.locked_content) {
                        if (p.locked_content.description) p.description = p.locked_content.description;
                        if (p.locked_content.imageUrl) p.imageUrl = p.locked_content.imageUrl;
                        if (p.locked_content.image) p.image = p.locked_content.image;
                        if (p.locked_content.audioUrl) p.audioUrl = p.locked_content.audioUrl;
                        if (p.locked_content.audio) p.audio = p.locked_content.audio;
                        if (p.locked_content.youtubeUrl) p.youtubeUrl = p.locked_content.youtubeUrl;
                        if (p.locked_content.infoLink) p.infoLink = p.locked_content.infoLink;
                    }
                    return true;
                }
            } catch(e) {}

            // For REQUIRE_PREVIOUS, enforce that the previous point in sequence must be unlocked first
            if (mode === 'REQUIRE_PREVIOUS' && window.routePoints && Array.isArray(window.routePoints)) {
                const idx = window.routePoints.findIndex(pt => (pt.id || `pt_${pt._lat || pt.lat}_${pt._lng || pt.lng}`) === pointId);
                if (idx > 0) {
                    const prevPoint = window.routePoints[idx - 1];
                    if (!isPointUnlocked(prevPoint)) {
                        return false;
                    }
                }
            }
            return false;
        }
        window.isPointUnlocked = isPointUnlocked;

        // Render Points Timeline
        const pointsList = document.getElementById('points-list');
        document.getElementById('point-count').textContent = `(${points.length})`;
        
        pointsList.innerHTML = points.map((p, idx) => {
            const unlocked = isPointUnlocked(p);

            if (!unlocked) {
                const radius = p.unlock_radius || p.arrival_radius || 30;
                return `
                <div class="point-card point-card-locked" id="point-card-${idx}" style="cursor: pointer; border-left: 4px solid #f59e0b; background: #fffbeb; padding: 12px 14px; border-radius: 10px; margin-bottom: 8px;" onclick="window.openPointModal(window.routePoints[${idx}])">
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
                        <h3 style="margin:0; font-size:14px; font-weight:700; color:#1e293b;">${idx + 1}. ${p.title || p.name || 'Piste ' + (idx + 1)}</h3>
                        <span class="point-locked-badge" style="font-size: 10px; font-weight: 700; background: #fef3c7; color: #b45309; padding: 2px 8px; border-radius: 12px; white-space: nowrap;">🔒 Avautuu kohteessa</span>
                    </div>
                    <div class="point-locked-teaser" style="font-size: 12px; color: #78350f; margin-top: 6px;">📍 Saavu kohteeseen (${radius} m) avataksesi tarinan</div>
                </div>
                `;
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
                const btnText = parts.join(' / ');
                mediaPreview = `<div style="margin-top: 10px;"><button class="btn-light" style="padding: 6px 12px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; border: 1px solid #cbd5e1; background: #f8fafc;" onclick="window.openPointModal(window.routePoints[${idx}])">${btnText}</button></div>`;
            } else if (hasDesc || hasLink) {
                mediaPreview = `<div style="margin-top: 10px;"><button class="btn-light" style="padding: 6px 12px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; border: 1px solid #cbd5e1; background: #f8fafc;" onclick="window.openPointModal(window.routePoints[${idx}])">Näytä tiedot</button></div>`;
            }

            return `
            <div class="point-card" id="point-card-${idx}" style="cursor: pointer;" onclick="window.openPointModal(window.routePoints[${idx}])">
                <h3>${idx + 1}. ${p.title || p.name || 'Piste ' + (idx + 1)}</h3>
                ${mediaPreview}
            </div>
            `;
        }).join('');
        
        window.routePoints = points;

        // Start GPS navigation engine after route is rendered
        if (navigator.geolocation) {
            initGPS(points);
        }
    }

    // ─── GPS NAVIGATION ENGINE ───────────────────────────────────────────────

    let gpsWatchId = null;
    let gpsActive = false;
    let userMarker = null;
    let userAccuracyCircle = null;

    // Navigation state — direction-aware, monotonically progressing
    let nextPointIndex = 0;          // index of next unvisited point
    let progressIndex = 0;           // highest visited index (never decreases)
    const visitedPoints = new Set(); // set of visited point indices
    let approachToastVisible = false;
    let _insideCount = 0;            // consecutive GPS readings inside arrival_radius
    let _arrivalCooldownUntil = 0;   // timestamp: block new arrivals until this time

    // Route deviation state machine
    const ROUTE_STATES = { ON_ROUTE: 0, SLIGHTLY_OFF: 1, OFF_ROUTE: 2, LEFT_ROUTE: 3 };
    let routeState = ROUTE_STATES.ON_ROUTE;
    let offRouteSince = null;
    const OFF_ROUTE_TIMEOUT_MS = 15000; // ms before showing LEFT_ROUTE alert

    // ─── GEOMETRY HELPERS ────────────────────────────────────────────────────

    // Haversine — returns distance in metres
    function haversineMeters(lat1, lng1, lat2, lng2) {
        const R = 6371000;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLng / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    // Distance from point to line segment, in metres
    function distanceToSegmentMeters(lat, lng, lat1, lng1, lat2, lng2) {
        const dx = lat2 - lat1, dy = lng2 - lng1;
        if (dx === 0 && dy === 0) return haversineMeters(lat, lng, lat1, lng1);
        const t = Math.max(0, Math.min(1,
            ((lat - lat1) * dx + (lng - lng1) * dy) / (dx * dx + dy * dy)
        ));
        return haversineMeters(lat, lng, lat1 + t * dx, lng1 + t * dy);
    }

    // Minimum distance from point to GeoJSON LineString (coords = [[lng,lat],...])
    function distanceToLineString(lat, lng, coords) {
        if (!coords || coords.length < 2) return Infinity;
        let minDist = Infinity;
        for (let i = 0; i < coords.length - 1; i++) {
            const d = distanceToSegmentMeters(
                lat, lng,
                coords[i][1], coords[i][0],
                coords[i + 1][1], coords[i + 1][0]
            );
            if (d < minDist) minDist = d;
        }
        return minDist;
    }

    // Total route length from LineString coords
    function computeRouteLength(coords) {
        if (!coords || coords.length < 2) return 0;
        let total = 0;
        for (let i = 0; i < coords.length - 1; i++) {
            total += haversineMeters(coords[i][1], coords[i][0], coords[i + 1][1], coords[i + 1][0]);
        }
        return total;
    }

    // Project (lat, lng) onto route → cumulative distance from route start
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
            if (d < bestDist) {
                bestDist = d;
                bestProjected = cumDist + t * segLen;
            }
            cumDist += segLen;
        }
        return bestProjected;
    }

    // ─── GPS CORE ────────────────────────────────────────────────────────────

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

        // Chrome on Android requires HTTPS for Geolocation API.
        // Detect HTTP early and show a clear message instead of a cryptic error.
        if (location.protocol === 'http:' && !location.hostname.includes('localhost')) {
            if (gpsBtn) {
                gpsBtn.className = 'error';
                gpsLabel.textContent = 'GPS ei käytettävissä';
            }
            showGpsErrorBanner(
                '🔒 GPS vaatii suojatun yhteyden',
                'Chrome edellyttää HTTPS-osoitetta sijaintitietoihin. ' +
                'Avaa sivu osoitteella <strong>https://</strong>laukaainfo.fi/... ' +
                'tai kokeile Operaa / Firefoxia.'
            );
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

                // err.code: 1=PERMISSION_DENIED, 2=POSITION_UNAVAILABLE, 3=TIMEOUT
                let label = 'GPS-virhe';
                let detail = '';
                if (err.code === 1) {
                    label  = 'Sijaintilupa evätty';
                    detail = 'Myönnä sijaintilupa selaimelle: asetukset → sivuston asetukset → sijainti → Salli. ' +
                             'Chromessa lupa voidaan myöntää vain HTTPS-sivuille.';
                } else if (err.code === 2) {
                    label  = 'Sijaintia ei saatu';
                    detail = 'GPS-signaali ei tavoita laitettasi. Siirry avoimemmalle alueelle tai tarkista ' +
                             'puhelimen sijaintipalvelut.';
                } else if (err.code === 3) {
                    label  = 'GPS aikakatkaisu';
                    detail = 'Sijainnin haku kesti liian kauan. Kokeile uudelleen ulkona.';
                }

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
            banner.style.cssText = [
                'background:#fef2f2', 'border:1px solid #fecaca', 'border-radius:12px',
                'padding:1rem 1.2rem', 'margin-bottom:1.2rem', 'font-size:0.82rem',
                'line-height:1.5', 'color:#991b1b'
            ].join(';');
            // Insert before the map element
            const mapEl = document.getElementById('map');
            if (mapEl && mapEl.parentNode) mapEl.parentNode.insertBefore(banner, mapEl);
        }
        banner.innerHTML =
            `<strong style="display:block;margin-bottom:0.3rem;">⚠️ ${title}</strong>${detail}`;
        banner.style.display = 'block';
    }


    function stopGPS() {
        if (gpsWatchId !== null) navigator.geolocation.clearWatch(gpsWatchId);
        gpsWatchId = null;
        gpsActive = false;
        const gpsBtn = document.getElementById('gps-status-btn');
        const gpsLabel = document.getElementById('gps-label');
        if (gpsBtn) { gpsBtn.className = ''; gpsLabel.textContent = 'GPS pois'; }
        closeProximityToast();
        closeArrivalToast();
        const panel = document.getElementById('gps-progress-panel');
        if (panel) panel.style.display = 'none';
    }

    function onPositionUpdate(pos, points) {
        const userLat = pos.coords.latitude;
        const userLng = pos.coords.longitude;
        const accuracy = pos.coords.accuracy || 15;

        updateUserMarker(userLat, userLng, accuracy);
        updateRouteStatus(userLat, userLng);
        updateProgressPanel(userLat, userLng);
        checkNextPoint(userLat, userLng, accuracy, points);
    }

    // ─── USER MARKER ─────────────────────────────────────────────────────────

    function updateUserMarker(lat, lng, accuracy) {
        const map = window._leafletMap;
        if (!map || !window.L) return;

        if (userMarker) {
            userMarker.setLatLng([lat, lng]);
        } else {
            const icon = L.divIcon({
                html: `<div style="width:16px;height:16px;background:#2563eb;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 4px rgba(37,99,235,0.25);position:relative;z-index:2;"></div>`,
                className: '',
                iconSize: [16, 16],
                iconAnchor: [8, 8]
            });
            userMarker = L.marker([lat, lng], { icon, zIndexOffset: 1000 }).addTo(map);
        }

        // Accuracy uncertainty circle — shown when accuracy > 10 m
        if (accuracy && accuracy > 10) {
            if (userAccuracyCircle) {
                userAccuracyCircle.setLatLng([lat, lng]).setRadius(accuracy);
            } else {
                userAccuracyCircle = L.circle([lat, lng], {
                    radius: accuracy,
                    color: '#2563eb',
                    fillColor: '#2563eb',
                    fillOpacity: 0.08,
                    weight: 1,
                    opacity: 0.3
                }).addTo(map);
            }
        }
    }

    // ─── ROUTE STATUS STATE MACHINE ──────────────────────────────────────────

    function updateRouteStatus(userLat, userLng) {
        const coords = window.routeLineCoords || [];
        if (coords.length < 2) return;
        const statusEl = document.getElementById('gps-route-status');
        if (!statusEl) return;

        const dist = Math.round(distanceToLineString(userLat, userLng, coords));

        let targetState;
        if (dist <= 30)       targetState = ROUTE_STATES.ON_ROUTE;
        else if (dist <= 75)  targetState = ROUTE_STATES.SLIGHTLY_OFF;
        else if (dist <= 150) targetState = ROUTE_STATES.OFF_ROUTE;
        else                  targetState = ROUTE_STATES.LEFT_ROUTE;

        if (targetState > routeState) {
            // Getting worse — update immediately
            routeState = targetState;
            if (routeState >= ROUTE_STATES.OFF_ROUTE && !offRouteSince) {
                offRouteSince = Date.now();
            }
        } else if (targetState < routeState) {
            // Getting better — update immediately, reset timer
            routeState = targetState;
            offRouteSince = null;
        }

        // Show LEFT_ROUTE only after sustained 15 s deviation
        const showLeftRoute = routeState === ROUTE_STATES.LEFT_ROUTE &&
                              offRouteSince &&
                              (Date.now() - offRouteSince) >= OFF_ROUTE_TIMEOUT_MS;
        const displayState = showLeftRoute ? ROUTE_STATES.LEFT_ROUTE
                                           : Math.min(routeState, ROUTE_STATES.OFF_ROUTE);

        const cfg = [
            { emoji: '🟢', text: 'Reitillä',                     color: '#059669', bg: '#ecfdf5' },
            { emoji: '🟡', text: `Hieman sivussa — ${dist} m`,    color: '#b45309', bg: '#fffbeb' },
            { emoji: '🟠', text: `Poikkeama — ${dist} m`,         color: '#c2410c', bg: '#fff7ed' },
            { emoji: '🔴', text: `Poistunut reitiltä — ${dist} m`,color: '#b91c1c', bg: '#fef2f2' },
        ][displayState];

        statusEl.textContent = `${cfg.emoji} ${cfg.text}`;
        statusEl.style.color = cfg.color;
        statusEl.style.background = cfg.bg;
    }

    // ─── PROGRESS PANEL ──────────────────────────────────────────────────────

    function updateProgressPanel(userLat, userLng) {
        const coords = window.routeLineCoords || [];
        const totalLen = window.totalRouteLength || 0;
        if (coords.length < 2 || totalLen === 0) return;

        const projDist = projectToRouteDistance(userLat, userLng, coords);

        // Monotonically increasing: progressIndex never goes backward (handles return trip)
        if (projDist > (window._maxProjDist || 0)) window._maxProjDist = projDist;
        const effectiveDist = window._maxProjDist || 0;
        const pct = Math.min(100, Math.round((effectiveDist / totalLen) * 100));

        const fill = document.getElementById('gps-progress-bar-fill');
        const text = document.getElementById('gps-progress-text');
        if (fill) fill.style.width = pct + '%';
        if (text) text.textContent =
            `${(effectiveDist / 1000).toFixed(1).replace('.', ',')} km` +
            ` / ${(totalLen / 1000).toFixed(1).replace('.', ',')} km`;
    }

    // ─── NEXT POINT NAVIGATION ───────────────────────────────────────────────
    // Only ever checks points[nextPointIndex] — never loops over all points.
    // This makes paluumatka (return trip) completely safe: visited points stay frozen.

    function checkNextPoint(userLat, userLng, accuracy, points) {
        const nextEl = document.getElementById('gps-next-point');
        if (nextPointIndex >= points.length) {
            if (nextEl) nextEl.innerHTML = '🎉 Kaikki kokemuspisteet saavutettu!';
            return;
        }

        const p = points[nextPointIndex];
        const pLat = p._lat ?? p.lat;
        const pLng = p._lng ?? p.lng;
        if (pLat == null || pLng == null) return;

        const dist = Math.round(haversineMeters(userLat, userLng, pLat, pLng));
        const arrivalR  = p.arrival_radius  ?? 30;
        const warningR  = p.warning_radius  ?? p.notificationDistance ?? 100;

        // Update "next point" info panel
        updateNextPointDisplay(p, dist, nextPointIndex, points.length);

        // Proximity map zoom & pulse marker management
        updateMapProximity(p, dist, nextPointIndex);

        // ── ARRIVAL LOGIC ────────────────────────────────────────────────────
        //
        // Finnish smartphone GPS reality (Traficom / GPS.gov):
        //   Open terrain:  2–5 m accuracy
        //   Forest path:   5–15 m accuracy
        //   Dense forest: 10–30 m accuracy
        //
        // Rule: user arrives only when BOTH conditions hold:
        //   1. dist <= arrival_radius   (GPS position is inside the zone)
        //   2. accuracy <= arrival_radius + 15
        //      (GPS is accurate enough to trust this reading)
        //
        // Additionally we require 2 consecutive readings inside the zone
        // to avoid triggering from a single noisy GPS spike.
        //
        // If dist is inside the zone but accuracy is too poor, we stay in
        // the "approaching" state and wait for a better GPS fix.

        // Do not trigger new arrival toast while an arrival toast or modal is currently active,
        // or while the arrival cooldown is in effect (prevents adjacent points from firing too fast)
        const arrivalToastEl = document.getElementById('arrival-toast');
        const isArrivalToastVisible = arrivalToastEl && arrivalToastEl.classList.contains('visible');
        const pointModalEl = document.getElementById('point-modal');
        const isModalActive = pointModalEl && (pointModalEl.classList.contains('active') || pointModalEl.style.display === 'flex');
        const isCooldown = Date.now() < _arrivalCooldownUntil;

        if (isArrivalToastVisible || isModalActive || isCooldown) {
            _insideCount = 0;
            return;
        }

        // If current point is locked (e.g. REQUIRE_PREVIOUS), pause arrival triggering until previous point is viewed
        if (!isPointUnlocked(p)) {
            _insideCount = 0;
            return;
        }

        const accuracyThreshold = arrivalR + 15; // e.g. 45 m for 30 m arrival_radius
        const accuracyOk = accuracy <= accuracyThreshold;

        if (dist <= arrivalR) {
            if (accuracyOk) {
                _insideCount++;
                if (_insideCount >= 2) {
                    // ✅ ARRIVED — two solid readings inside the zone
                    _insideCount = 0;
                    visitedPoints.add(nextPointIndex);
                    markPointVisited(nextPointIndex, p);
                    showArrivalToast(p);
                    nextPointIndex++;
                    progressIndex = Math.max(progressIndex, nextPointIndex);
                }
                // else: wait for second reading (no toast yet)
            } else {
                // Inside zone but GPS too imprecise — show gentle warning text
                _insideCount = 0; // reset; imprecise reading doesn't count
                const nextEl = document.getElementById('gps-next-point');
                if (nextEl) {
                    const name = p.title || p.name || `Piste ${nextPointIndex + 1}`;
                    nextEl.innerHTML =
                        `<span class="next-label">GPS TARKENTUU...</span>` +
                        `<span class="next-name">${name} — noin ${dist} m</span>` +
                        `<span class="next-dist" style="color:#f59e0b;">📡 Tarkkuus ±${Math.round(accuracy)} m — odotetaan parempaa signaalia</span>`;
                }
            }
        } else {
            // Outside arrival zone
            _insideCount = 0;
            // Don't show approach toast while arrival cooldown or another toast is active
            if (dist <= warningR && !approachToastVisible && Date.now() >= _arrivalCooldownUntil) {
                showApproachingToast(p, dist);
            }
        }
    }

    // ─── PROXIMITY ZOOM & PULSE MARKERS ──────────────────────────────────────
    let _lastZone = null;
    let _lastZonePointIdx = -1;

    function setMarkerPulse(p, type) {
        const map = window._leafletMap;
        if (!map || !window.L) return;
        const pLat = p._lat ?? p.lat;
        const pLng = p._lng ?? p.lng;
        if (pLat == null || pLng == null) return;

        if (!type) {
            if (p._pulseMarker) {
                map.removeLayer(p._pulseMarker);
                p._pulseMarker = null;
            }
            return;
        }

        const html = `<div class="lki-pulse-ring ${type}"></div>`;
        const icon = L.divIcon({
            className: 'lki-pulse-wrapper',
            html: html,
            iconSize: [0, 0],
            iconAnchor: [0, 0]
        });

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
        if (dist <= arrivalR) {
            currentZone = 3;
        } else if (dist <= 50) {
            currentZone = 2;
        } else if (dist <= 100) {
            currentZone = 1;
        }

        // Only act when zone changes or target point changes to prevent continuous map jittering
        if (currentZone !== _lastZone || idx !== _lastZonePointIdx) {
            _lastZone = currentZone;
            _lastZonePointIdx = idx;

            if (currentZone === 3) {
                setMarkerPulse(p, 'arrival');
                map.flyTo([pLat, pLng], 18, { duration: 1.2 });
            } else if (currentZone === 2) {
                setMarkerPulse(p, 'near');
                map.flyTo([pLat, pLng], 17, { duration: 1.0 });
            } else if (currentZone === 1) {
                setMarkerPulse(p, 'approach');
                map.flyTo([pLat, pLng], 16, { duration: 1.2 });
            } else {
                setMarkerPulse(p, null);
            }
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
            : (i === idx       ? '<span style="color:#2563eb;">◉</span>'
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
        try {
            localStorage.setItem('unlocked_point_' + pointId, 'true');
        } catch(e) {}

        // Unpack locked_content if present
        if (p.locked_content) {
            if (p.locked_content.description) p.description = p.locked_content.description;
            if (p.locked_content.imageUrl) p.imageUrl = p.locked_content.imageUrl;
            if (p.locked_content.image) p.image = p.locked_content.image;
            if (p.locked_content.audioUrl) p.audioUrl = p.locked_content.audioUrl;
            if (p.locked_content.audio) p.audio = p.locked_content.audio;
            if (p.locked_content.youtubeUrl) p.youtubeUrl = p.locked_content.youtubeUrl;
            if (p.locked_content.infoLink) p.infoLink = p.locked_content.infoLink;
        }

        // Turn map marker green
        if (p._layer && p._layer.setStyle) {
            p._layer.setStyle({ fillColor: '#059669', radius: 10 });
        }
        // Arrival pulse on marker, clear after 3 seconds
        setMarkerPulse(p, 'arrival');
        setTimeout(() => {
            setMarkerPulse(p, null);
        }, 3000);

        // Highlight timeline card and update locked state UI
        const card = document.getElementById(`point-card-${idx}`);
        if (card) {
            card.style.borderLeft = '4px solid #059669';
            card.style.background = '#f0fdf4';
            const badge = card.querySelector('.point-locked-badge');
            if (badge) {
                badge.style.background = '#dcfce7';
                badge.style.color = '#15803d';
                badge.innerHTML = '🔓 Sisältö avattu';
            }
            const teaser = card.querySelector('.point-locked-teaser');
            if (teaser) {
                teaser.style.color = '#047857';
                teaser.innerHTML = '✨ Olet saapunut kohteeseen – napauta lukeaksesi tarinan!';
            }
        }
    }

    // ─── TOASTS ──────────────────────────────────────────────────────────────

    // "Kohde lähestyy" — amber approaching toast
    function showApproachingToast(p, distMeters) {
        approachToastVisible = true;
        const name = p.title || p.name || 'Kohde';
        document.getElementById('toast-label').textContent = 'Kohde lähestyy';
        document.getElementById('toast-icon').textContent = '📍';
        document.getElementById('toast-point-name').textContent = name;
        document.getElementById('toast-point-dist').textContent = `Noin ${distMeters} m päässä`;

        const toast = document.getElementById('proximity-toast');
        toast.style.borderLeftColor = '#f59e0b';
        toast.classList.add('visible');

        document.getElementById('toast-open-btn').onclick = () => {
            window.openPointModal && window.openPointModal(p);
        };
        clearTimeout(window._toastTimer);
        window._toastTimer = setTimeout(() => {
            approachToastVisible = false;
            closeProximityToast();
        }, 8000);
    }

    // "Olet saapunut" — green arrival toast (separate element)
    function showArrivalToast(p) {
        approachToastVisible = false;
        closeProximityToast();

        // Set cooldown: next arrival cannot trigger for 8 seconds after this toast appears.
        // This prevents adjacent points from immediately overwriting the current toast.
        _arrivalCooldownUntil = Date.now() + 8000;

        const name = p.title || p.name || 'Kohde';
        document.getElementById('arrival-name').textContent = name;
        const toast = document.getElementById('arrival-toast');
        toast.classList.add('visible');

        document.getElementById('arrival-open-btn').onclick = () => {
            // Extend cooldown while user has opened the modal — next arrival
            // should not fire until well after the modal is closed.
            _arrivalCooldownUntil = Date.now() + 5000;
            window.openPointModal && window.openPointModal(p);
            closeArrivalToast();
        };

        // Auto-open modal if point is configured with auto_open: true
        if (p.auto_open === true) {
            setTimeout(() => {
                window.openPointModal && window.openPointModal(p);
            }, 600);
        }

        clearTimeout(window._arrivalTimer);
        window._arrivalTimer = setTimeout(closeArrivalToast, 15000);
    }

    window.closeArrivalToast = function() {
        const toast = document.getElementById('arrival-toast');
        if (toast) toast.classList.remove('visible');
        clearTimeout(window._arrivalTimer);
    };
    document.getElementById('arrival-close-btn').addEventListener('click', window.closeArrivalToast);

    window.closeProximityToast = function() {
        document.getElementById('proximity-toast').classList.remove('visible');
        clearTimeout(window._toastTimer);
        approachToastVisible = false;
    };
    document.getElementById('toast-close-btn').addEventListener('click', window.closeProximityToast);

    // Start
    loadRoute();
    document.getElementById('btn-unlock').addEventListener('click', async () => {
        const code = document.getElementById('access-code').value.trim();
        if (!code) return;

        document.getElementById('btn-unlock').disabled = true;
        document.getElementById('btn-unlock').textContent = 'Tarkistetaan...';
        document.getElementById('unlock-error').style.display = 'none';

        await loadRoute(code);

        if (currentRouteData && !currentRouteData.access_granted) {
            document.getElementById('unlock-error').style.display = 'block';
            document.getElementById('btn-unlock').disabled = false;
            document.getElementById('btn-unlock').textContent = 'Avaa reitti';
        }
    });

    // Modal Logic & Helpers
    function getYoutubeId(url) {
        if (!url || typeof url !== 'string') return null;
        const trimmed = url.trim();
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|shorts\/)([^#\&\?]*).*/;
        const match = trimmed.match(regExp);
        if (match && match[2] && match[2].length === 11) return match[2];
        if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
        return null;
    }

    function isValidVideoUrl(url) {
        if (!url || typeof url !== 'string') return false;
        const trimmed = url.trim();
        if (trimmed.length < 3) return false;
        if (getYoutubeId(trimmed)) return true;
        if (/\.(mp4|webm|ogg)(\?.*)?$/i.test(trimmed)) return true;
        if (trimmed.includes('youtube.com') || trimmed.includes('youtu.be') || trimmed.includes('vimeo.com')) return true;
        return false;
    }

    function isValidImageUrl(url) {
        if (!url || typeof url !== 'string') return false;
        const trimmed = url.trim();
        if (trimmed.length < 5) return false;
        const lower = trimmed.toLowerCase();
        if (['kuva', 'kuvat', 'image', 'images', 'photo', 'photos', 'none', 'null', 'undefined', '-', 'kuva.jpg'].includes(lower)) return false;
        if (isValidVideoUrl(trimmed)) return false;
        if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:image/') || trimmed.startsWith('blob:') || trimmed.startsWith('/') || trimmed.startsWith('./')) {
            return true;
        }
        if (/\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?.*)?$/i.test(trimmed)) return true;
        return false;
    }

    function isValidLinkUrl(url) {
        if (!url || typeof url !== 'string') return false;
        const trimmed = url.trim();
        if (trimmed.length < 5) return false;
        if (isValidVideoUrl(trimmed) || isValidImageUrl(trimmed)) return false;
        if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('www.')) {
            return true;
        }
        return false;
    }

    function isValidAudioUrl(url) {
        if (!url || typeof url !== 'string') return false;
        const trimmed = url.trim();
        if (trimmed.length < 5) return false;
        const lower = trimmed.toLowerCase();
        if (['audio', 'aanileike', 'aani', 'sound', 'none', 'null', 'undefined', '-'].includes(lower)) return false;
        if (isValidVideoUrl(trimmed) || isValidImageUrl(trimmed)) return false;
        if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:audio/') || trimmed.startsWith('blob:') || trimmed.startsWith('/') || trimmed.startsWith('./')) {
            return true;
        }
        if (/\.(mp3|m4a|wav|ogg|aac|flac)(\?.*)?$/i.test(trimmed)) return true;
        return false;
    }

    let pointSwiperInstance = null;

    window.openPointModal = function(p) {
        if (!p) return;

        const mediaContainer = document.getElementById('point-modal-media-container');
        const tabsContainer = document.getElementById('point-modal-tabs');
        const linkContainer = document.getElementById('point-modal-link-container');
        
        mediaContainer.innerHTML = '';
        mediaContainer.style.display = 'none';
        if (tabsContainer) { tabsContainer.innerHTML = ''; tabsContainer.style.display = 'none'; }
        if (linkContainer) { linkContainer.innerHTML = ''; linkContainer.style.display = 'none'; }

        // Check if point is locked
        if (window.isPointUnlocked && !window.isPointUnlocked(p)) {
            const modalTitle = p.title || p.name || 'Salainen kokemuspiste';
            const radius = p.unlock_radius || p.arrival_radius || 30;
            const points = window.routePoints || [];
            const idx = points.findIndex(pt => pt === p || (pt.id && pt.id === p.id));

            let sequenceNotice = '';
            if (idx > 0) {
                const prevPoint = points[idx - 1];
                const prevUnlocked = window.isPointUnlocked(prevPoint);
                if (!prevUnlocked) {
                    const prevName = prevPoint ? (prevPoint.title || prevPoint.name || `Piste #${idx}`) : `Piste #${idx}`;
                    sequenceNotice = `
                        <div style="margin-top: 0.9rem; padding: 0.7rem 0.8rem; background: #fff7ed; border: 1px solid #ffedd5; border-radius: 10px; font-size: 0.83rem; color: #c2410c; text-align: left;">
                            <strong>🔢 Kokemuspolku kierretään järjestyksessä:</strong><br/>
                            Avaa ensin aiemmat kokemuspisteet (esim. <em>${idx}. ${prevName}</em>) kiertämällä polku järjestyksessä.
                        </div>
                    `;
                }
            }
            
            document.getElementById('point-modal-title').textContent = modalTitle;
            document.getElementById('point-modal-desc').innerHTML = `
                <div style="text-align:center; padding: 1.5rem 1rem; background: #fffbeb; border: 1px solid #fef3c7; border-radius: 14px; margin-top: 1rem;">
                    <div style="font-size: 2.8rem; margin-bottom: 0.6rem;">🔒</div>
                    <h4 style="margin: 0 0 0.5rem 0; color: #92400e; font-size: 1.15rem; font-weight: 700;">Avautuu vasta kohteessa</h4>
                    <p style="margin: 0; color: #b45309; font-size: 0.9rem; line-height: 1.55;">
                        Tämän kokemuspisteen tarina ja sisältö paljastuvat vasta kun saavut fyysisesti kohteeseen!
                    </p>
                    ${sequenceNotice}
                    <div style="margin-top: 1.2rem; padding: 0.75rem; background: #fef08a; border-radius: 10px; font-size: 0.85rem; font-weight: 700; color: #78350f; display: inline-flex; align-items: center; gap: 6px;">
                        📍 Avautumisetäisyys: ${radius} m
                    </div>
                </div>
            `;
            document.getElementById('point-modal').style.display = 'flex';
            return;
        }

        const modalTitle = p.title || p.name || 'Nimetön piste';
        const modalDesc = p.description || p.desc || p.text || p.details || '';
        if (linkContainer) { linkContainer.innerHTML = ''; linkContainer.style.display = 'none'; }

        // 1. Extract Video URLs
        const rawVideoSources = [
            p.youtubeUrl, p.youtube_url, p.youtube, p.videoUrl, p.video_url, p.video, 
            p.youtube_id, p.video_id, p.media, p.imageUrl, p.image
        ].flat().filter(Boolean);

        const videos = [];
        rawVideoSources.forEach(item => {
            let url = typeof item === 'string' ? item : (item.url || item.blobUrl || item.videoUrl || item.youtubeUrl);
            if (url && typeof url === 'string' && isValidVideoUrl(url)) {
                const trimmed = url.trim();
                if (!videos.includes(trimmed)) videos.push(trimmed);
            }
        });

        // 2. Extract Image URLs
        const rawImageSources = [
            p.imageUrl, p.images, p.image, p.media, p.photos, p.photo, p.picture
        ].flat().filter(Boolean);

        const images = [];
        rawImageSources.forEach(item => {
            let url = typeof item === 'string' ? item : (item.url || item.blobUrl || item.imageUrl);
            if (url && typeof url === 'string' && isValidImageUrl(url)) {
                const trimmed = url.trim();
                if (!images.includes(trimmed)) images.push(trimmed);
            }
        });

        // 3. Extract Audio URLs
        const rawAudioSources = [
            p.audioUrl, p.audio_url, p.audio, p.audioId, p.media
        ].flat().filter(Boolean);

        const audios = [];
        rawAudioSources.forEach(item => {
            let url = typeof item === 'string' ? item : (item.url || item.blobUrl || item.audioUrl);
            if (url && typeof url === 'string' && isValidAudioUrl(url)) {
                const trimmed = url.trim();
                if (!audios.includes(trimmed)) audios.push(trimmed);
            }
        });

        // 4. Extract External Link
        const rawLinkSources = [p.infoLink, p.info_link, p.link, p.url, p.website].flat().filter(Boolean);
        let targetLink = null;
        for (const item of rawLinkSources) {
            let url = typeof item === 'string' ? item : item.url;
            if (url && typeof url === 'string' && isValidLinkUrl(url)) {
                targetLink = url.trim().startsWith('www.') ? 'https://' + url.trim() : url.trim();
                break;
            }
        }

        // Render Title & Description with inline audio player bar if audio exists
        document.getElementById('point-modal-title').textContent = modalTitle;
        
        let audioBarHtml = '';
        if (audios.length > 0) {
            audioBarHtml = `
                <div style="margin-top: 20px; padding: 14px 18px; background: rgba(37, 99, 235, 0.08); border-radius: 14px; border: 1px solid rgba(37, 99, 235, 0.2); display: flex; align-items: center; gap: 14px;">
                    <span style="font-size: 1.8rem; flex-shrink: 0;">🎧</span>
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-size: 0.72rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: #2563eb; margin-bottom: 6px;">Äänileike kuunneltavissa</div>
                        <audio controls style="width: 100%; height: 36px; outline: none;">
                            <source src="${audios[0]}">
                        </audio>
                    </div>
                </div>`;
        }
        document.getElementById('point-modal-desc').innerHTML = (modalDesc ? modalDesc.replace(/\n/g, '<br>') : '') + audioBarHtml;

        // Helper to render video view
        function renderVideoView(videoUrl) {
            mediaContainer.style.display = 'block';
            const ytId = getYoutubeId(videoUrl);
            if (ytId) {
                mediaContainer.innerHTML = `
                    <div class="lki-modal-video-wrapper">
                        <iframe src="https://www.youtube.com/embed/${ytId}?autoplay=1" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>
                        <a href="https://www.youtube.com/watch?v=${ytId}" target="_blank" rel="noopener" class="lki-modal-yt-link">📺 Katso YouTubessa &rarr;</a>
                    </div>`;
            } else if (videoUrl.match(/\.(mp4|webm|ogg)(\?.*)?$/i)) {
                mediaContainer.innerHTML = `<video controls autoplay style="width:100%; height:100%; object-fit: contain;"><source src="${videoUrl}"></video>`;
            } else {
                mediaContainer.innerHTML = `<iframe src="${videoUrl}" allowfullscreen style="width:100%; height:100%; border:none;"></iframe>`;
            }
        }

        // Helper to render image slider view
        function renderImageView(imgList) {
            mediaContainer.style.display = 'block';
            if (pointSwiperInstance) {
                pointSwiperInstance.destroy(true, true);
                pointSwiperInstance = null;
            }

            if (imgList.length === 1) {
                mediaContainer.innerHTML = `<img src="${imgList[0]}" alt="${modalTitle}" style="width:100%; height:100%; object-fit: contain;">`;
            } else {
                mediaContainer.innerHTML = `
                    <div class="swiper" id="point-modal-swiper">
                        <div class="swiper-wrapper">
                            ${imgList.map(img => `<div class="swiper-slide"><img src="${img}" alt="${modalTitle}" style="width:100%; height:100%; object-fit: contain;"></div>`).join('')}
                        </div>
                        <div class="swiper-pagination"></div>
                        <div class="swiper-button-next"></div>
                        <div class="swiper-button-prev"></div>
                    </div>`;
                
                setTimeout(() => {
                    if (typeof Swiper !== 'undefined') {
                        pointSwiperInstance = new Swiper('#point-modal-swiper', {
                            pagination: { el: '.swiper-pagination', clickable: true },
                            navigation: { nextEl: '.swiper-button-next', prevEl: '.swiper-button-prev' },
                            loop: true,
                        });
                    }
                }, 50);
            }
        }

        // Helper to render audio view in media container
        function renderAudioView(audioUrl) {
            mediaContainer.style.display = 'block';
            if (pointSwiperInstance) {
                pointSwiperInstance.destroy(true, true);
                pointSwiperInstance = null;
            }
            mediaContainer.innerHTML = `
                <div style="width:100%; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; background:#0f172a; padding:24px; text-align:center; box-sizing:border-box;">
                    <div style="font-size:3.5rem; margin-bottom:10px;">🎧</div>
                    <div style="color:#f8fafc; font-size:1.2rem; font-weight:800; margin-bottom:14px;">Kuuntele äänileike</div>
                    <audio controls autoplay style="width:100%; max-width:440px; outline:none; border-radius:30px;">
                        <source src="${audioUrl}">
                        Selaimesi ei tue äänitoistoa.
                    </audio>
                </div>`;
        }

        // Determine initial view state
        let currentTab = 'none';
        if (images.length > 0) {
            currentTab = 'images';
            renderImageView(images);
        } else if (videos.length > 0) {
            currentTab = 'video';
            renderVideoView(videos[0]);
        } else if (audios.length > 0) {
            currentTab = 'audio';
            renderAudioView(audios[0]);
        }

        // Build Content Selector Tabs at bottom of modal
        const availableTabs = [];
        if (images.length > 0) {
            const imgLabel = images.length > 1 ? `🖼️ Esittelykuvat (${images.length})` : `🖼️ Esittelykuva`;
            availableTabs.push({ id: 'images', label: imgLabel });
        }
        if (videos.length > 0) {
            availableTabs.push({ id: 'video', label: `🎬 Video ${videos.length > 1 ? `(${videos.length})` : ''}` });
        }
        if (audios.length > 0) {
            availableTabs.push({ id: 'audio', label: `🎧 Äänileike ${audios.length > 1 ? `(${audios.length})` : ''}` });
        }
        if (targetLink) {
            availableTabs.push({ id: 'link', label: `🌐 Lisätietoa` });
        }

        if (tabsContainer && availableTabs.length > 0) {
            tabsContainer.style.display = 'flex';
            tabsContainer.innerHTML = availableTabs.map(t => `
                <button type="button" class="point-modal-tab-btn ${t.id === 'video' ? 'video-btn' : ''} ${t.id === 'audio' ? 'audio-btn' : ''} ${t.id === 'link' ? 'link-btn' : ''} ${t.id === currentTab ? 'active' : ''}" data-tab="${t.id}">
                    ${t.label}
                </button>
            `).join('');

            tabsContainer.querySelectorAll('.point-modal-tab-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const tabId = btn.getAttribute('data-tab');
                    
                    if (tabId === 'link') {
                        window.open(targetLink, '_blank', 'noopener,noreferrer');
                        return;
                    }

                    tabsContainer.querySelectorAll('.point-modal-tab-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');

                    if (tabId === 'images') {
                        renderImageView(images);
                    } else if (tabId === 'video') {
                        renderVideoView(videos[0]);
                    } else if (tabId === 'audio') {
                        renderAudioView(audios[0]);
                    }
                });
            });
        }

        // External Link Footer Button
        if (targetLink && linkContainer) {
            linkContainer.style.display = 'flex';
            linkContainer.innerHTML = `<a href="${targetLink}" target="_blank" rel="noopener" class="lki-cta-btn website">Lisätietoa kohteesta &rarr;</a>`;
        }

        document.getElementById('point-modal').classList.add('active');
    };

    function closePointModal() {
        document.getElementById('point-modal').classList.remove('active');
        document.getElementById('point-modal-media-container').innerHTML = ''; // Stop video
        if (pointSwiperInstance) {
            pointSwiperInstance.destroy(true, true);
            pointSwiperInstance = null;
        }
    }

    const closeModalBtn = document.getElementById('point-modal-close');
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', closePointModal);
    }

    document.getElementById('point-modal').addEventListener('click', (e) => {
        if (e.target.id === 'point-modal') {
            closePointModal();
        }
    });
});
