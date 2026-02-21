document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize Map
    // Coordinates default to Laukaa/Lievestuore area
    const map = L.map('muisto-map').setView([62.336, 26.046], 10);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    // Group markers using MarkerCluster
    const markersGroup = L.markerClusterGroup({
        chunkedLoading: true,
        maxClusterRadius: 50
    });
    map.addLayer(markersGroup);

    // 2. Data store & Filters
    let allMuistot = [];
    const areaFilter = document.getElementById('filter-area');
    const decadeFilter = document.getElementById('filter-decade');
    const searchInput = document.getElementById('search-input');

    // 3. Fetch Data using PapaParse
    Papa.parse('muistokartta_data.csv', {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: function (results) {
            allMuistot = results.data;
            populateFilters();
            renderMarkers(); // initial render
        },
        error: function (err) {
            console.error('Virhe CSV-tiedoston lukemisessa:', err);
            document.getElementById('muisto-map').innerHTML = '<div style="padding: 20px; text-align: center; color: red;">Virhe aineiston lataamisessa. Varmista että olet paikallisella palvelimella (CORS).</div>';
        }
    });

    // 4. Populate Dropdowns dynamically
    function populateFilters() {
        const areas = [...new Set(allMuistot.map(m => m.area).filter(v => v))].sort();
        const decades = [...new Set(allMuistot.map(m => m.decade).filter(v => v))].sort();

        areas.forEach(area => {
            const opt = document.createElement('option');
            opt.value = area;
            opt.textContent = area;
            areaFilter.appendChild(opt);
        });

        decades.forEach(decade => {
            const opt = document.createElement('option');
            opt.value = decade;
            opt.textContent = decade;
            decadeFilter.appendChild(opt);
        });
    }

    // 5. Render Map Markers based on current filter states
    function renderMarkers() {
        markersGroup.clearLayers();

        const selectedArea = areaFilter.value;
        const selectedDecade = decadeFilter.value;
        const searchText = searchInput.value.toLowerCase();

        const filteredMuistot = allMuistot.filter(item => {
            if (selectedArea && item.area !== selectedArea) return false;
            if (selectedDecade && item.decade !== selectedDecade) return false;

            if (searchText) {
                const searchString = `${item.title} ${item.description} ${item.topics} ${item.author}`.toLowerCase();
                if (!searchString.includes(searchText)) return false;
            }
            return true;
        });

        // Add markers
        const newMarkers = [];

        filteredMuistot.forEach(item => {
            const lat = parseFloat(item.lat);
            const lng = parseFloat(item.lng);
            if (isNaN(lat) || isNaN(lng)) return;

            const marker = L.marker([lat, lng]);

            // Construct popup content
            let popupContent = `
                <div style="font-family: inherit; max-width: 250px;">
                    <h3 style="margin: 0 0 5px 0; color: #0056b3; font-size: 1.1rem;">${escapeHtml(item.title)}</h3>
                    <div style="margin-bottom: 8px; font-size: 0.85rem; color: #666; font-weight: 500;">
                        📍 ${escapeHtml(item.area)} &nbsp;|&nbsp; 📅 ${escapeHtml(item.decade)}
                    </div>
                    <p style="margin: 0 0 10px 0; font-size: 0.95rem; line-height: 1.4;">${escapeHtml(item.description)}</p>
                    <div style="margin-bottom: 10px; font-size: 0.85rem; color: #555;"><i>Tarinan kertoja: ${escapeHtml(item.author)}</i></div>
            `;

            // Tags
            if (item.topics) {
                const tags = item.topics.split(';').map(t => `<span style="display:inline-block; background:#f0f0f0; padding:2px 6px; border-radius:4px; font-size:0.75rem; margin:0 4px 4px 0;">#${escapeHtml(t.trim())}</span>`).join('');
                popupContent += `<div style="margin-bottom: 10px;">${tags}</div>`;
            }

            // Links
            if (item.youtube || item.filelink) {
                popupContent += `<div style="display:flex; gap:8px; margin-top:10px;">`;
                if (item.youtube) {
                    popupContent += `<a href="${encodeURI(item.youtube)}" target="_blank" style="background:#ff0000; color:white; text-decoration:none; padding:4px 8px; border-radius:4px; font-size:0.8rem; font-weight:bold;">🎥 YouTube</a>`;
                }
                if (item.filelink) {
                    popupContent += `<a href="${encodeURI(item.filelink)}" target="_blank" style="background:#0056b3; color:white; text-decoration:none; padding:4px 8px; border-radius:4px; font-size:0.8rem; font-weight:bold;">🔗 Linkki</a>`;
                }
                popupContent += `</div>`;
            }

            popupContent += `</div>`;

            marker.bindPopup(popupContent);
            newMarkers.push(marker);
        });

        markersGroup.addLayers(newMarkers);

        // Adjust map bounds if desired (optional)
        if (newMarkers.length > 0) {
            // Uncomment next line to automatically pan to results
            // map.fitBounds(L.featureGroup(newMarkers).getBounds().pad(0.1));
        }
    }

    // Filter event listeners
    areaFilter.addEventListener('change', renderMarkers);
    decadeFilter.addEventListener('change', renderMarkers);
    searchInput.addEventListener('input', renderMarkers);

    // Utility: prevent XSS for raw data
    function escapeHtml(unsafe) {
        if (!unsafe) return '';
        return unsafe
            .toString()
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
});
