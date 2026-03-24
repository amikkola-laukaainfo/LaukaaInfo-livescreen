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

        markersGroup.addLayers(newMarkers);

        if (coords.length > 0) {
            const bounds = L.latLngBounds(coords);
            map.fitBounds(bounds.pad(0.1));
        }

        statusText.textContent = `Näytetään ${filtered.length} kohdetta.`;
    }

    // 5. Filter Event Listener
    categoryFilter.addEventListener('change', renderMarkers);

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

    // Call after data is loaded and categories are populated
    handleUrlParams();

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
