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
            <div class="point-card" style="cursor: pointer;" onclick="window.openPointModal(window.routePoints[${idx}])">
                <h3>${idx + 1}. ${p.title || p.name || 'Piste ' + (idx + 1)}</h3>
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

        const modalTitle = p.title || p.name || 'Nimetön piste';
        const modalDesc = p.description || p.desc || p.text || p.details || '';

        const mediaContainer = document.getElementById('point-modal-media-container');
        const tabsContainer = document.getElementById('point-modal-tabs');
        const linkContainer = document.getElementById('point-modal-link-container');
        
        mediaContainer.innerHTML = '';
        mediaContainer.style.display = 'none';
        if (tabsContainer) { tabsContainer.innerHTML = ''; tabsContainer.style.display = 'none'; }
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
