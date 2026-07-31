document.addEventListener('DOMContentLoaded', async () => {
    // 1. Initialize Map
    const map = L.map('kohteet-map').setView([62.4128, 25.9477], 11);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    // Group markers using MarkerCluster
    const markersGroup = L.markerClusterGroup({
        chunkedLoading: true,
        maxClusterRadius: 50
    });
    map.addLayer(markersGroup);

    let allFeatures = [];
    let allPlacesData = [];
    const categoryFilter = document.getElementById('category-filter');
    const nameFilter = document.getElementById('name-filter');
    const statusText = document.getElementById('status-text');

    // 2. Load JSON Data
    if (typeof window.getKarttaKohteet === 'function') {
        const geojson = window.getKarttaKohteet();
        if (geojson && geojson.features) {
            allFeatures = geojson.features;
        }
    }

    // Haversin-etäisyys metreinä kahden koordinaattipisteen välillä
    function haversineMeters(lat1, lon1, lat2, lon2) {
        const R = 6371000;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    // 3. Load Places from Supabase
    const placeMarkersGroup = L.markerClusterGroup({ chunkedLoading: true, maxClusterRadius: 50 });
    map.addLayer(placeMarkersGroup);
    let placesLoaded = 0;
    let dedupedCount = 0;

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
                // Deduplikointi: poistetaan JSON-kohteet joille löytyy Supabase-paikka < 80m päässä
                // Mutta tallennetaan poistetun JSON-kohteen kategoria vastaavaan Supabase-paikkaan
                const DEDUP_THRESHOLD_M = 80;

                // Rakennetaan place_id -> merged_categories -hakemisto
                // Ensin alustetaan kaikilla paikoilla tyhjä lista
                const placeCategoryMap = {};
                places.forEach(p => { placeCategoryMap[p.place_id] = []; });

                allFeatures = allFeatures.filter(f => {
                    if (f.geometry.type !== 'Point') return true;
                    const [fLon, fLat] = f.geometry.coordinates;
                    const matchingPlace = places.find(p =>
                        haversineMeters(fLat, fLon, p.lat, p.lon) < DEDUP_THRESHOLD_M
                    );
                    if (matchingPlace) {
                        // Liitetään JSON-kohteen kategoria Supabase-paikkaan
                        const cat = f.properties && f.properties.category;
                        if (cat && !placeCategoryMap[matchingPlace.place_id].includes(cat)) {
                            placeCategoryMap[matchingPlace.place_id].push(cat);
                        }
                        dedupedCount++;
                        return false;
                    }
                    return true;
                });

                // Lisätään merged_categories kentät Supabase-paikka-objekteihin
                places.forEach(p => {
                    p.merged_categories = placeCategoryMap[p.place_id] || [];
                });

                allPlacesData = places;
                placesLoaded = allPlacesData.length;

                // Lisätään "Paikat"-suodatin
                const placeOpt = document.createElement('option');
                placeOpt.value = '__places__';
                placeOpt.textContent = `📍 Paikat (${placesLoaded})`;
                categoryFilter.appendChild(placeOpt);
            }
        }
    } catch (e) {
        console.warn('Supabase places lataus epäonnistui:', e);
    }

    populateCategories();
    renderMarkers();
    statusText.textContent = `Yhteensä ${allFeatures.length} kohdetta${placesLoaded > 0 ? ' + ' + placesLoaded + ' paikkaa' : ''}.`;
    handleUrlParams();

    // DEBUG: tulosta kategoriatilanne konsoliin
    const dbgJsonCats = {};
    allFeatures.forEach(f => {
        const c = f.properties && f.properties.category;
        if (c) dbgJsonCats[c] = (dbgJsonCats[c] || 0) + 1;
    });
    const dbgPlaceCats = {};
    allPlacesData.forEach(p => {
        if (p.merged_categories && p.merged_categories.length > 0) {
            p.merged_categories.forEach(c => {
                dbgPlaceCats[c] = (dbgPlaceCats[c] || 0) + 1;
            });
        }
    });
    console.log('[KarttaKohteet DEBUG] JSON-kohteet kategorioittain:', dbgJsonCats);
    console.log('[KarttaKohteet DEBUG] Supabase-paikat merged_categories:', dbgPlaceCats);
    console.log('[KarttaKohteet DEBUG] Deduplikoitu pois:', dedupedCount, 'kohdetta');



    // 3. Populate Categories
    function populateCategories() {
        // Kerää kategoriat JSON-kohteista
        const catSet = new Set(allFeatures.map(f => f.properties.category).filter(Boolean));
        // Lisää myös Supabase-paikoilta periytyvät merged_categories
        allPlacesData.forEach(p => {
            if (p.merged_categories) {
                p.merged_categories.forEach(cat => catSet.add(cat));
            }
        });
        const categories = [...catSet].sort();
        categories.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat;
            opt.textContent = cat;
            categoryFilter.appendChild(opt);
        });
    }

    // 4. Render Markers
    function renderMarkers() {
        markersGroup.clearLayers();
        placeMarkersGroup.clearLayers();
        const selectedCat = categoryFilter.value;
        const searchVal = nameFilter ? nameFilter.value.toLowerCase() : '';

        // Suodatetaan JSON kohteet
        const filteredFeatures = allFeatures.filter(f => {
            const props = f.properties;
            const nameMatch = searchVal === '' || (props.name && props.name.toLowerCase().includes(searchVal));
            const catMatch = selectedCat === 'all' || selectedCat === '__places__' || props.category === selectedCat;
            
            // Jos valittu '__places__', piilotetaan json kohteet kokonaan (tai voisi jättää jos halutaan vain paikat nimellä)
            if (selectedCat === '__places__') return false;
            
            return nameMatch && catMatch;
        });

        // Suodatetaan Supabase Paikat
        const filteredPlaces = allPlacesData.filter(p => {
            const nameMatch = searchVal === '' || (p.name && p.name.toLowerCase().includes(searchVal)) || (p.canonical_name && p.canonical_name.toLowerCase().includes(searchVal));
            // Näytetään paikka jos: kaikki valittu, tai '__places__' valittu,
            // tai valittu kategoria löytyy paikan merged_categories-listasta
            const catMatch = selectedCat === 'all' || selectedCat === '__places__' ||
                (p.merged_categories && p.merged_categories.includes(selectedCat));
            
            return nameMatch && catMatch;
        });

        const newMarkers = [];
        const newPlaceMarkers = [];
        const coords = [];

        // Rakennetaan JSON markerit
        filteredFeatures.forEach(f => {
            const props = f.properties;
            const geom = f.geometry;
            if (geom.type === 'Point') {
                const [lon, lat] = geom.coordinates;
                coords.push([lat, lon]);

                const marker = L.marker([lat, lon]);
                let popupHtml = `<div style="min-width: 200px;">
                    <h3 style="margin: 0 0 5px 0; color: #0056b3;">${props.name}</h3>
                    <div style="font-size: 0.85rem; color: #666; margin-bottom: 8px;">${props.category}</div>
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

        // Rakennetaan Paikat markerit
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
            const title = place.canonical_name || place.name;
            const popupHtml = `<div style="min-width:200px;">
                <div style="font-size:0.75rem;font-weight:700;text-transform:uppercase;color:#059669;margin-bottom:4px;">📍 ${label}</div>
                <h3 style="margin:0 0 6px 0;color:#064e3b;font-size:1rem;">${title}</h3>
                ${place.description ? `<p style="font-size:0.85rem;color:#555;margin:0 0 10px;">${place.description.slice(0,120)}${place.description.length>120?'…':''}</p>` : `<p style="font-size:0.85rem;color:#888;margin:0 0 10px;">${label} – ${place.municipality || 'Laukaa'}</p>`}
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

        statusText.textContent = `Näytetään ${filteredFeatures.length} kohdetta${filteredPlaces.length > 0 ? ' + ' + filteredPlaces.length + ' paikkaa' : ''}.`;
    }

    // 5. Filter Event Listeners
    categoryFilter.addEventListener('change', renderMarkers);
    if (nameFilter) {
        nameFilter.addEventListener('input', renderMarkers);
    }

    // 6. Handle URL Parameters for Deep Linking
    function handleUrlParams() {
        const params = new URLSearchParams(window.location.search);
        const catParam = params.get('cat') || params.get('search');
        
        if (catParam) {
            const lowerParam = catParam.toLowerCase();
            const options = Array.from(categoryFilter.options);
            
            // Try to find a matching category (exact or partial)
            const match = options.find(opt => 
                opt.value.toLowerCase() === lowerParam || 
                opt.value.toLowerCase().includes(lowerParam)
            );
            
            if (match) {
                categoryFilter.value = match.value;
                renderMarkers();
            }
        }
    }

    // Call handled above after async loads

    // 7. Share Functionality
    const shareBtn = document.getElementById('share-map-btn');
    if (shareBtn) {
        shareBtn.addEventListener('click', async () => {
            const currentCat = categoryFilter.value;
            const url = new URL(window.location.href);
            
            if (currentCat !== 'all') {
                url.searchParams.set('cat', currentCat);
            } else {
                url.searchParams.delete('cat');
            }
            url.searchParams.delete('search'); // Clean up search param

            const shareData = {
                title: 'LaukaaInfo - Karttakohteet',
                text: currentCat !== 'all' ? `Löytyi kohteita kategoriasta: ${currentCat}` : 'Tutki Laukaan kohteita kartalla',
                url: url.toString()
            };

            try {
                if (navigator.share) {
                    await navigator.share(shareData);
                } else {
                    await navigator.clipboard.writeText(url.toString());
                    const originalText = shareBtn.innerHTML;
                    shareBtn.innerHTML = '<span>Kopioitu!</span> ✅';
                    setTimeout(() => {
                        shareBtn.innerHTML = originalText;
                    }, 2000);
                }
            } catch (err) {
                console.error('Sharing failed', err);
            }
        });
    }
});
