document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const routeId = urlParams.get('id');

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
        const geojsonLayer = L.geoJSON(geojson, {
            style: function (feature) {
                return { color: '#059669', weight: 5, opacity: 0.8 };
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
                if (feature.geometry.type === 'Point' && feature.properties) {
                    const p = feature.properties;
                    points.push(p);
                    
                    // Bind click event to open custom modal instead of default popup
                    layer.on('click', () => {
                        window.openPointModal(p);
                    });
                }
            }
        }).addTo(map);

        map.fitBounds(geojsonLayer.getBounds(), { padding: [50, 50] });

        // Render Points Timeline
        const pointsList = document.getElementById('points-list');
        document.getElementById('point-count').textContent = `(${points.length})`;
        
        pointsList.innerHTML = points.map((p, idx) => {
            let mediaPreview = '';
            const pMedia = p.media || p.imageUrl || p.image || p.youtubeUrl || p.youtube || p.videoUrl || p.video;
            if (pMedia) {
                mediaPreview = `<div style="margin-top: 10px;"><button class="btn-light" style="padding: 6px 12px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; border: 1px solid #cbd5e1; background: #f8fafc;" onclick="window.openPointModal(window.routePoints[${idx}])">Näytä sisältö</button></div>`;
            } else if (p.description || p.link || p.url || p.infoLink) {
                mediaPreview = `<div style="margin-top: 10px;"><button class="btn-light" style="padding: 6px 12px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; border: 1px solid #cbd5e1; background: #f8fafc;" onclick="window.openPointModal(window.routePoints[${idx}])">Näytä tiedot</button></div>`;
            }

            return `
            <div class="point-card" style="cursor: pointer;" onclick="window.openPointModal(window.routePoints[${idx}])">
                <h3>${idx + 1}. ${p.title || 'Piste ' + (idx + 1)}</h3>
                ${mediaPreview}
            </div>
            `;
        }).join('');
        
        window.routePoints = points;

        // Start GPS tracking after route is rendered (auto-start)
        if (navigator.geolocation) {
            initGPS(points);
        }
    }

    // ─── GPS PROXIMITY SYSTEM ───────────────────────────────────────────────

    let gpsWatchId = null;
    let gpsActive = false;
    let proximityState = {};  // { pointKey: { triggered: bool, lastDist: number } }
    let activeToastPoint = null;
    let userMarker = null;
    let gpsMap = null;  // reference set after map init

    // Haversine formula — returns distance in metres
    function haversineMeters(lat1, lng1, lat2, lng2) {
        const R = 6371000;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLng / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    function pointKey(p, idx) {
        return p.id || p.title || ('point_' + idx);
    }

    function initGPS(points) {
        const gpsBtn = document.getElementById('gps-status-btn');
        const gpsLabel = document.getElementById('gps-label');

        window.toggleGPS = function() {
            if (gpsActive) {
                stopGPS();
            } else {
                startGPS(points);
            }
        };

        // Auto-start silently — user can dismiss
        startGPS(points);
    }

    function startGPS(points) {
        if (!navigator.geolocation) return;
        const gpsBtn = document.getElementById('gps-status-btn');
        const gpsLabel = document.getElementById('gps-label');

        gpsWatchId = navigator.geolocation.watchPosition(
            (pos) => onPositionUpdate(pos, points),
            (err) => {
                console.warn('GPS-virhe:', err.message);
                if (gpsBtn) { gpsBtn.className = 'error'; gpsLabel.textContent = 'GPS-virhe'; }
            },
            { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
        );
        gpsActive = true;
        if (gpsBtn) { gpsBtn.className = 'active'; gpsLabel.textContent = 'GPS päällä'; }
    }

    function stopGPS() {
        if (gpsWatchId !== null) navigator.geolocation.clearWatch(gpsWatchId);
        gpsWatchId = null;
        gpsActive = false;
        const gpsBtn = document.getElementById('gps-status-btn');
        const gpsLabel = document.getElementById('gps-label');
        if (gpsBtn) { gpsBtn.className = ''; gpsLabel.textContent = 'GPS pois'; }
        closeProximityToast();
    }

    function onPositionUpdate(pos, points) {
        const userLat = pos.coords.latitude;
        const userLng = pos.coords.longitude;

        // Update user marker on map
        updateUserMarker(userLat, userLng);

        // Check each point with a notificationDistance
        points.forEach((p, idx) => {
            const dist = p.notificationDistance || p.notification_distance_m || 0;
            if (!dist) return;

            const key = pointKey(p, idx);
            if (!proximityState[key]) proximityState[key] = { triggered: false, lastDist: Infinity };
            const state = proximityState[key];

            const pointLat = p.lat || (p.geometry && p.geometry.coordinates && p.geometry.coordinates[1]);
            const pointLng = p.lng || (p.geometry && p.geometry.coordinates && p.geometry.coordinates[0]);
            if (pointLat == null || pointLng == null) return;

            const currentDist = Math.round(haversineMeters(userLat, userLng, pointLat, pointLng));
            state.lastDist = currentDist;

            if (!state.triggered && currentDist <= dist) {
                // Enter proximity zone — show toast
                state.triggered = true;
                showProximityToast(p, currentDist);
            } else if (state.triggered && currentDist > dist * 3) {
                // Reset hysteresis — left zone
                state.triggered = false;
            }
        });
    }

    function updateUserMarker(lat, lng) {
        // Find current map instance
        const mapEl = document.getElementById('map');
        if (!mapEl || !mapEl._leaflet_id) return;
        const map = window._leafletMap;
        if (!map) return;

        const L = window.L;
        if (!L) return;

        if (userMarker) {
            userMarker.setLatLng([lat, lng]);
        } else {
            const icon = L.divIcon({
                html: `<div style="width:16px;height:16px;background:#2563eb;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 4px rgba(37,99,235,0.25);"></div>`,
                className: '',
                iconSize: [16, 16],
                iconAnchor: [8, 8]
            });
            userMarker = L.marker([lat, lng], { icon, zIndexOffset: 1000 }).addTo(map);
        }
    }

    function showProximityToast(p, distMeters) {
        activeToastPoint = p;
        document.getElementById('toast-point-name').textContent = p.title || 'Kohde';
        document.getElementById('toast-point-dist').textContent = `Noin ${distMeters} m päässä`;

        const toast = document.getElementById('proximity-toast');
        toast.classList.add('visible');

        // Wire open button
        document.getElementById('toast-open-btn').onclick = () => {
            window.openPointModal && window.openPointModal(p);
        };

        // Auto-hide after 12 s
        clearTimeout(window._toastTimer);
        window._toastTimer = setTimeout(closeProximityToast, 12000);
    }

    window.closeProximityToast = function() {
        document.getElementById('proximity-toast').classList.remove('visible');
        clearTimeout(window._toastTimer);
        activeToastPoint = null;
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
        if (!url) return null;
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|shorts\/)([^#\&\?]*).*/;
        const match = url.match(regExp);
        return (match && match[2].length === 11) ? match[2] : null;
    }

    let pointSwiperInstance = null;

    window.openPointModal = function(p) {
        if (!p) return;

        document.getElementById('point-modal-title').textContent = p.title || 'Nimetön piste';
        document.getElementById('point-modal-desc').innerHTML = p.description ? p.description.replace(/\n/g, '<br>') : '';
        
        const mediaContainer = document.getElementById('point-modal-media-container');
        const tabsContainer = document.getElementById('point-modal-tabs');
        const linkContainer = document.getElementById('point-modal-link-container');
        
        mediaContainer.innerHTML = '';
        mediaContainer.style.display = 'none';
        if (tabsContainer) { tabsContainer.innerHTML = ''; tabsContainer.style.display = 'none'; }
        if (linkContainer) { linkContainer.innerHTML = ''; linkContainer.style.display = 'none'; }

        // 1. Extract Image URLs
        const rawImages = [p.imageUrl, p.images, p.image, p.media].flat().filter(Boolean);
        const images = [];
        rawImages.forEach(item => {
            let url = typeof item === 'string' ? item : (item.url || item.blobUrl || item.imageUrl);
            if (url && typeof url === 'string') {
                if (!url.includes('youtube.com') && !url.includes('youtu.be') && !url.match(/\.(mp4|webm|ogg)$/i)) {
                    if (!images.includes(url)) images.push(url);
                }
            }
        });

        // 2. Extract Video URLs (YouTube & direct video files)
        const rawVideos = [p.youtubeUrl, p.youtube, p.videoUrl, p.video, p.video_url, p.imageUrl, p.media, p.images].flat().filter(Boolean);
        const videos = [];
        rawVideos.forEach(item => {
            let url = typeof item === 'string' ? item : (item.url || item.blobUrl);
            if (url && typeof url === 'string') {
                const isYt = url.includes('youtube.com') || url.includes('youtu.be');
                const isFile = url.match(/\.(mp4|webm|ogg)$/i);
                if (isYt || isFile) {
                    if (!videos.includes(url)) videos.push(url);
                }
            }
        });

        const targetLink = p.infoLink || p.link || p.url;
        const hasDesc = !!(p.description || p.text);

        // Helper to render video view
        function renderVideoView(videoUrl) {
            mediaContainer.style.display = 'block';
            const ytId = getYoutubeId(videoUrl);
            if (ytId) {
                mediaContainer.innerHTML = `
                    <div class="lki-modal-video-wrapper">
                        <iframe src="https://www.youtube.com/embed/${ytId}?autoplay=1" allow="autoplay; encrypted-media" allowfullscreen></iframe>
                        <a href="https://www.youtube.com/watch?v=${ytId}" target="_blank" class="lki-modal-yt-link">📺 Katso YouTubessa &rarr;</a>
                    </div>`;
            } else if (videoUrl.match(/\.(mp4|webm|ogg)$/i)) {
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
                mediaContainer.innerHTML = `<img src="${imgList[0]}" alt="Kuva" style="width:100%; height:100%; object-fit: contain;">`;
            } else {
                mediaContainer.innerHTML = `
                    <div class="swiper" id="point-modal-swiper">
                        <div class="swiper-wrapper">
                            ${imgList.map(img => `<div class="swiper-slide"><img src="${img}" alt="Kuva" style="width:100%; height:100%; object-fit: contain;"></div>`).join('')}
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

        // Determine default view mode
        let currentTab = 'none';
        if (videos.length > 0) {
            currentTab = 'video';
            renderVideoView(videos[0]);
        } else if (images.length > 0) {
            currentTab = 'images';
            renderImageView(images);
        }

        // Build Content Selector Tabs if multiple elements exist
        const availableTabs = [];
        if (videos.length > 0) availableTabs.push({ id: 'video', label: `🎬 Video ${videos.length > 1 ? `(${videos.length})` : ''}` });
        if (images.length > 0) availableTabs.push({ id: 'images', label: `🖼️ Kuvat (${images.length})` });
        if (hasDesc) availableTabs.push({ id: 'text', label: `📝 Kuvaus` });
        if (targetLink) availableTabs.push({ id: 'link', label: `🌐 Lisätiedot` });

        if (tabsContainer && availableTabs.length > 1) {
            tabsContainer.style.display = 'flex';
            tabsContainer.innerHTML = availableTabs.map(t => `
                <button type="button" class="point-modal-tab-btn ${t.id === 'video' ? 'video-btn' : ''} ${t.id === currentTab ? 'active' : ''}" data-tab="${t.id}">
                    ${t.label}
                </button>
            `).join('');

            tabsContainer.querySelectorAll('.point-modal-tab-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const tabId = btn.getAttribute('data-tab');
                    tabsContainer.querySelectorAll('.point-modal-tab-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');

                    if (tabId === 'video') {
                        renderVideoView(videos[0]);
                    } else if (tabId === 'images') {
                        renderImageView(images);
                    } else if (tabId === 'text') {
                        if (pointSwiperInstance) { pointSwiperInstance.destroy(true, true); pointSwiperInstance = null; }
                        mediaContainer.style.display = 'none';
                        mediaContainer.innerHTML = '';
                        document.getElementById('point-modal-desc').scrollIntoView({ behavior: 'smooth' });
                    } else if (tabId === 'link') {
                        window.open(targetLink, '_blank');
                    }
                });
            });
        }

        // External Link Footer
        if (targetLink && linkContainer) {
            linkContainer.style.display = 'flex';
            linkContainer.innerHTML = `<a href="${targetLink}" target="_blank" class="lki-cta-btn website">Lisätietoja &rarr;</a>`;
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
