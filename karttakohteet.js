document.addEventListener('DOMContentLoaded', async () => {
    // 1. Initialize Map
    const map = L.map('kohteet-map').setView([62.4128, 25.9477], 11);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    // JSON-kohteiden markkerit (joilla ei ole place_id-vastinetta lähellä)
    const markersGroup = L.markerClusterGroup({ chunkedLoading: true, maxClusterRadius: 50 });
    map.addLayer(markersGroup);

    // Place_id-kohteiden markkerit (korvaavat läheiset JSON-kohteet)
    const placeMarkersGroup = L.markerClusterGroup({ chunkedLoading: true, maxClusterRadius: 50 });
    map.addLayer(placeMarkersGroup);

    const nameFilter = document.getElementById('name-filter');
    const statusText = document.getElementById('status-text');

    // Piilota kategoriasuodatin – ei enää käytössä
    const catFilterGroup = document.getElementById('category-filter');
    if (catFilterGroup) {
        const filterGroup = catFilterGroup.closest('.filter-group');
        if (filterGroup) filterGroup.style.display = 'none';
    }

    // allFeatures = JSON-kohteet jotka EIVÄT saa place_id-vastinetta (jäävät näkyviin)
    // visiblePlaces = Supabase-paikat jotka KORVAAVAT lähellä olevan JSON-kohteen
    let allFeatures = [];
    let visiblePlaces = [];

    // 2. Load JSON Data
    if (typeof window.getKarttaKohteet === 'function') {
        const geojson = window.getKarttaKohteet();
        if (geojson && geojson.features) {
            allFeatures = geojson.features;
        }
    }

    // Haversin-etäisyys metreinä
    function haversineMeters(lat1, lon1, lat2, lon2) {
        const R = 6371000;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    // 3. Load Places from Supabase ja deduploi
    try {
        const SB_URL = 'https://duxluwyqxvbmkkjzuzkz.supabase.co';
        const SB_KEY = 'sb_publishable_HgfWyipuSO7gvsVUR1smNQ_aXox2OPu';
        const sbClient = window.supabase ? window.supabase.createClient(SB_URL, SB_KEY) : null;
        if (sbClient) {
            const { data: places, error } = await sbClient
                .from('places')
                .select('place_id, name, canonical_name, type, municipality, lat, lon, description')
                .not('lat', 'is', null)
                .not('lon', 'is', null);

            if (!error && places) {
                const DEDUP_THRESHOLD_M = 80;

                // Kerätään place_id-kohteet joilla on JSON-vastine lähellä
                // Set välttää duplikaatit jos useampi JSON-kohde on saman paikan lähellä
                const matchedPlaceIds = new Set();

                // Suodatetaan allFeatures: poistetaan ne joille löytyy Supabase-paikka läheltä
                allFeatures = allFeatures.filter(f => {
                    if (f.geometry.type !== 'Point') return true;
                    const [fLon, fLat] = f.geometry.coordinates;
                    const matchingPlace = places.find(p =>
                        haversineMeters(fLat, fLon, p.lat, p.lon) < DEDUP_THRESHOLD_M
                    );
                    if (matchingPlace) {
                        // Merkitään tämä Supabase-paikka näytettäväksi
                        matchedPlaceIds.add(matchingPlace.place_id);
                        return false; // poistetaan JSON-kohde
                    }
                    return true; // pidetään JSON-kohde
                });

                // Vain ne Supabase-paikat jotka korvaavat JSON-kohteen
                visiblePlaces = places.filter(p => matchedPlaceIds.has(p.place_id));
            }
        }
    } catch (e) {
        console.warn('Supabase places lataus epäonnistui:', e);
    }

    const totalCount = allFeatures.length + visiblePlaces.length;
    statusText.textContent = `Yhteensä ${totalCount} kohdetta.`;

    renderMarkers();

    // 4. Render Markers – suodatetaan vain nimen perusteella
    function renderMarkers() {
        markersGroup.clearLayers();
        placeMarkersGroup.clearLayers();
        const searchVal = nameFilter ? nameFilter.value.trim().toLowerCase() : '';

        // JSON-kohteet (joilla ei ole place_id-vastinetta)
        const filteredFeatures = allFeatures.filter(f => {
            if (!searchVal) return true;
            const props = f.properties;
            return props.name && props.name.toLowerCase().includes(searchVal);
        });

        // Place_id-kohteet (korvaavat JSON-kohteet)
        const filteredPlaces = visiblePlaces.filter(p => {
            if (!searchVal) return true;
            return (p.name && p.name.toLowerCase().includes(searchVal)) ||
                (p.canonical_name && p.canonical_name.toLowerCase().includes(searchVal));
        });

        const newMarkers = [];
        const newPlaceMarkers = [];
        const coords = [];

        // Rakennetaan JSON-markerit
        filteredFeatures.forEach(f => {
            const props = f.properties;
            const geom = f.geometry;
            if (geom.type === 'Point') {
                const [lon, lat] = geom.coordinates;
                coords.push([lat, lon]);
                const marker = L.marker([lat, lon]);
                const popupHtml = `<div style="min-width: 200px;">
                    <h3 style="margin: 0 0 5px 0; color: #0056b3;">${props.name}</h3>
                    <div style="font-size: 0.85rem; color: #666; margin-bottom: 8px;">${props.category || ''}</div>
                    ${props.address ? `<div style="font-size: 0.9rem; margin-bottom: 5px;">📍 ${props.address}</div>` : ''}
                    ${props.phone ? `<div style="font-size: 0.9rem; margin-bottom: 5px;">📞 ${props.phone}</div>` : ''}
                    <div style="margin-top: 10px; display: flex; gap: 8px; flex-wrap: wrap;">
                        ${props.website ? `<a href="${props.website}" target="_blank" style="background: #0056b3; color: white; padding: 4px 10px; border-radius: 4px; text-decoration: none; font-size: 0.8rem;">Verkkosivu</a>` : ''}
                        ${props.email ? `<a href="mailto:${props.email}" style="background: #666; color: white; padding: 4px 10px; border-radius: 4px; text-decoration: none; font-size: 0.8rem;">Sähköposti</a>` : ''}
                        <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${props.name}, ${props.address || 'Laukaa'}`)}" target="_blank" style="background: #28a745; color: white; padding: 4px 10px; border-radius: 4px; text-decoration: none; font-size: 0.8rem;">📍 Googlessa</a>
                    </div>
                </div>`;
                marker.bindPopup(popupHtml);
                newMarkers.push(marker);
            }
        });

        // Rakennetaan place_id-markerit (vihreä ikoni = Supabase-paikka)
        const placeTypeLabel = {
            NATURE: 'Luontokohde', LANDMARK: 'Nähtävyys',
            SERVICE: 'Palvelu', BUILDING: 'Rakennus', AREA: 'Alue', ROUTE: 'Reitti'
        };
        const placeIcon = L.divIcon({
            className: '',
            html: `<div style="width:28px;height:28px;background:#059669;border:3px solid white;border-radius:50%;box-shadow:0 2px 8px rgba(5,150,105,0.5);display:flex;align-items:center;justify-content:center;">
                       <svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='white'><path d='M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z'/></svg>
                   </div>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14]
        });

        filteredPlaces.forEach(place => {
            const label = placeTypeLabel[place.type] || 'Paikka';
            const title = place.name || place.canonical_name;
            const popupHtml = `<div style="min-width:200px;">
                <div style="font-size:0.75rem;font-weight:700;text-transform:uppercase;color:#059669;margin-bottom:4px;">📍 ${label}</div>
                <h3 style="margin:0 0 6px 0;color:#064e3b;font-size:1rem;">${title}</h3>
                ${place.description
                    ? `<p style="font-size:0.85rem;color:#555;margin:0 0 10px;">${place.description.slice(0, 120)}${place.description.length > 120 ? '…' : ''}</p>`
                    : `<p style="font-size:0.85rem;color:#888;margin:0 0 10px;">${label} – ${place.municipality || 'Laukaa'}</p>`}
                <a href="tietoa-paikasta.html?id=${encodeURIComponent(place.place_id)}" style="display:inline-block;background:#059669;color:white;padding:5px 12px;border-radius:20px;text-decoration:none;font-size:0.8rem;font-weight:700;">Tietoja paikasta →</a>
            </div>`;
            const marker = L.marker([place.lat, place.lon], { icon: placeIcon }).bindPopup(popupHtml);
            newPlaceMarkers.push(marker);
            coords.push([place.lat, place.lon]);
        });

        markersGroup.addLayers(newMarkers);
        placeMarkersGroup.addLayers(newPlaceMarkers);

        if (coords.length > 0) {
            const bounds = L.latLngBounds(coords);
            map.fitBounds(bounds.pad(0.1));
        }

        const shown = filteredFeatures.length + filteredPlaces.length;
        statusText.textContent = searchVal
            ? `Näytetään ${shown} kohdetta haulla "${searchVal}".`
            : `Yhteensä ${totalCount} kohdetta.`;
    }

    // 5. Nimihaku
    if (nameFilter) {
        nameFilter.addEventListener('input', renderMarkers);
    }

    // 6. Jakaminen (share-nappi)
    const shareBtn = document.getElementById('share-map-btn');
    if (shareBtn) {
        shareBtn.addEventListener('click', async () => {
            const searchVal = nameFilter ? nameFilter.value.trim() : '';
            const url = new URL(window.location.href);
            if (searchVal) {
                url.searchParams.set('search', searchVal);
            } else {
                url.searchParams.delete('search');
            }
            url.searchParams.delete('cat');
            const shareData = {
                title: 'LaukaaInfo - Karttakohteet',
                text: searchVal ? `Karttakohteet haulla: ${searchVal}` : 'Tutki Laukaan kohteita kartalla',
                url: url.toString()
            };
            try {
                if (navigator.share) {
                    await navigator.share(shareData);
                } else {
                    await navigator.clipboard.writeText(url.toString());
                    const orig = shareBtn.innerHTML;
                    shareBtn.innerHTML = '<span>Kopioitu!</span> ✅';
                    setTimeout(() => { shareBtn.innerHTML = orig; }, 2000);
                }
            } catch (err) {
                console.error('Sharing failed', err);
            }
        });
    }

    // 7. URL-parametrit: ?search=hakusana
    const urlParams = new URLSearchParams(window.location.search);
    const searchParam = urlParams.get('search') || urlParams.get('cat');
    if (searchParam && nameFilter) {
        nameFilter.value = searchParam;
        renderMarkers();
    }
});
