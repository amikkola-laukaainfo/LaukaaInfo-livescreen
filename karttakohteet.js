document.addEventListener('DOMContentLoaded', () => {
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
    const categoryFilter = document.getElementById('category-filter');
    const statusText = document.getElementById('status-text');

    // 2. Load Data
    if (typeof window.getKarttaKohteet === 'function') {
        const geojson = window.getKarttaKohteet();
        if (geojson && geojson.features) {
            allFeatures = geojson.features;
            populateCategories();
            renderMarkers();
            statusText.textContent = `Yhteensä ${allFeatures.length} kohdetta.`;
        } else {
            statusText.textContent = "Virhe datan lataamisessa.";
            statusText.style.color = "red";
        }
    } else {
        statusText.textContent = "Datalähdettä ei löytynyt.";
        statusText.style.color = "red";
    }

    // 3. Populate Categories
    function populateCategories() {
        const categories = [...new Set(allFeatures.map(f => f.properties.category))].sort();
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
        const selectedCat = categoryFilter.value;

        const filtered = allFeatures.filter(f => {
            if (selectedCat === 'all') return true;
            return f.properties.category === selectedCat;
        });

        const newMarkers = [];
        const coords = [];

        filtered.forEach(f => {
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
                    <div style="margin-top: 10px; display: flex; gap: 8px;">
                        ${props.website ? `<a href="${props.website}" target="_blank" style="background: #0056b3; color: white; padding: 4px 10px; border-radius: 4px; text-decoration: none; font-size: 0.8rem;">Verkkosivu</a>` : ''}
                        ${props.email ? `<a href="mailto:${props.email}" style="background: #666; color: white; padding: 4px 10px; border-radius: 4px; text-decoration: none; font-size: 0.8rem;">Sähköposti</a>` : ''}
                    </div>
                </div>`;

                marker.bindPopup(popupHtml);
                newMarkers.push(marker);
            }
        });

        markersGroup.addLayers(newMarkers);

        if (coords.length > 0) {
            const bounds = L.latLngBounds(coords);
            map.fitBounds(bounds.pad(0.1));
        }

        statusText.textContent = `Näytetään ${filtered.length} kohdetta.`;
    }

    // 5. Filter Event Listener
    categoryFilter.addEventListener('change', renderMarkers);
});
