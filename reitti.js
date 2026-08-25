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

        // Basic Info
        document.getElementById('route-title').textContent = d.title || 'Nimetön reitti';
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
                    points.push(feature.properties);
                    if (feature.properties.title) {
                        layer.bindPopup(`<b>${feature.properties.title}</b>`);
                    }
                }
            }
        }).addTo(map);

        map.fitBounds(geojsonLayer.getBounds(), { padding: [50, 50] });

        // Render Points Timeline
        const pointsList = document.getElementById('points-list');
        document.getElementById('point-count').textContent = `(${points.length})`;
        
        pointsList.innerHTML = points.map((p, idx) => {
            let mediaHtml = '';
            if (p.media) {
                // p.media is assumed to be an array or string url. Handle accordingly.
                const mediaUrl = Array.isArray(p.media) ? p.media[0] : p.media;
                if (mediaUrl) {
                    mediaHtml = `<div class="media-container"><img src="${mediaUrl}" alt="${p.title}"></div>`;
                }
            }

            return `
            <div class="point-card">
                <h3>${idx + 1}. ${p.title || 'Piste ' + (idx + 1)}</h3>
                ${p.description ? `<p>${p.description}</p>` : ''}
                ${mediaHtml}
            </div>
            `;
        }).join('');
    }

    // Unlock event
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

    // Start
    loadRoute();
});
