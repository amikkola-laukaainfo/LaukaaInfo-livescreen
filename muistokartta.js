document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize Map
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
    let allTags = [];         // deduplikoitu tag-lista autocompletea varten
    let activeTagIndex = -1;  // näppäimistönavigaatiolle

    const areaFilter = document.getElementById('filter-area');
    const decadeFilter = document.getElementById('filter-decade');
    const searchInput = document.getElementById('search-input');
    const tagSuggest = document.getElementById('tag-suggestions');

    // 3. Fetch Data using PapaParse
    Papa.parse('muistokartta_data.csv', {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: function (results) {
            allMuistot = results.data;
            populateFilters();
            buildTagIndex();
            renderMarkers(); // initial render
        },
        error: function (err) {
            console.error('Virhe CSV-tiedoston lukemisessa:', err);
            document.getElementById('muisto-map').innerHTML =
                '<div style="padding: 20px; text-align: center; color: red;">Virhe aineiston lataamisessa. Varmista että olet paikallisella palvelimella (CORS).</div>';
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

    // 5. Build tag index from all CSV topics
    function buildTagIndex() {
        const tagSet = new Set();
        allMuistot.forEach(m => {
            if (m.topics) {
                m.topics.split(';').forEach(t => {
                    const tag = t.trim().toLowerCase();
                    if (tag) tagSet.add(tag);
                });
            }
        });
        allTags = [...tagSet].sort();
    }

    // 6. Hashtag autocomplete
    function showTagSuggestions(query) {
        if (!query || query.length < 2) {
            hideTagSuggestions();
            return;
        }

        // Jos käyttäjä kirjoittaa #, hakee tageja
        const cleanQuery = query.startsWith('#') ? query.slice(1).toLowerCase() : query.toLowerCase();

        const matches = allTags.filter(tag => tag.includes(cleanQuery));

        if (matches.length === 0) {
            hideTagSuggestions();
            return;
        }

        activeTagIndex = -1;
        tagSuggest.innerHTML = '';

        matches.slice(0, 10).forEach((tag, i) => {
            const item = document.createElement('div');
            item.className = 'tag-suggestion-item';
            item.setAttribute('role', 'option');
            item.setAttribute('data-index', i);

            // Korosta matchaava osa
            const highlighted = tag.replace(
                new RegExp(`(${escapeRegex(cleanQuery)})`, 'gi'),
                '<span class="tag-match">$1</span>'
            );
            item.innerHTML = `<span class="tag-hash">#</span>${highlighted}`;

            item.addEventListener('mousedown', (e) => {
                e.preventDefault(); // estä blur ennen klikkausta
                applyTag(tag);
            });

            tagSuggest.appendChild(item);
        });

        tagSuggest.classList.add('visible');
    }

    function hideTagSuggestions() {
        tagSuggest.classList.remove('visible');
        tagSuggest.innerHTML = '';
        activeTagIndex = -1;
    }

    function applyTag(tag) {
        searchInput.value = tag;
        hideTagSuggestions();
        renderMarkers();
        searchInput.focus();
    }

    // Näppäimistönavigointi (ylös/alas/enter/esc)
    searchInput.addEventListener('keydown', (e) => {
        const items = tagSuggest.querySelectorAll('.tag-suggestion-item');
        if (!tagSuggest.classList.contains('visible') || items.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            activeTagIndex = Math.min(activeTagIndex + 1, items.length - 1);
            updateActiveItem(items);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            activeTagIndex = Math.max(activeTagIndex - 1, -1);
            updateActiveItem(items);
        } else if (e.key === 'Enter' && activeTagIndex >= 0) {
            e.preventDefault();
            applyTag(items[activeTagIndex].textContent.replace('#', '').trim());
        } else if (e.key === 'Escape') {
            hideTagSuggestions();
        }
    });

    function updateActiveItem(items) {
        items.forEach((item, i) => {
            item.classList.toggle('active', i === activeTagIndex);
        });
    }

    // 7. Render Map Markers based on current filter states
    function renderMarkers() {
        markersGroup.clearLayers();

        const selectedArea = areaFilter.value;
        const selectedDecade = decadeFilter.value;
        const searchText = searchInput.value.toLowerCase().replace(/^#/, '');

        const filteredMuistot = allMuistot.filter(item => {
            if (selectedArea && item.area !== selectedArea) return false;
            if (selectedDecade && item.decade !== selectedDecade) return false;

            if (searchText) {
                const searchString = `${item.title} ${item.description} ${item.topics} ${item.author}`.toLowerCase();
                if (!searchString.includes(searchText)) return false;
            }
            return true;
        });

        const newMarkers = [];

        filteredMuistot.forEach(item => {
            const lat = parseFloat(item.lat);
            const lng = parseFloat(item.lng);
            if (isNaN(lat) || isNaN(lng)) return;

            const marker = L.marker([lat, lng]);

            let popupContent = `
                <div style="font-family: inherit; max-width: 260px;">
                    <h3 style="margin: 0 0 5px 0; color: #0056b3; font-size: 1.05rem;">${escapeHtml(item.title)}</h3>
                    <div style="margin-bottom: 8px; font-size: 0.82rem; color: #666; font-weight: 500;">
                        📍 ${escapeHtml(item.area)} &nbsp;|&nbsp; 📅 ${escapeHtml(item.decade)}
                    </div>
                    <p style="margin: 0 0 10px 0; font-size: 0.92rem; line-height: 1.45;">${escapeHtml(item.description)}</p>
                    <div style="margin-bottom: 8px; font-size: 0.82rem; color: #555;"><i>Tarinan kertoja: ${escapeHtml(item.author)}</i></div>
            `;

            // Tags — klikattavia
            if (item.topics) {
                const tags = item.topics.split(';').map(t =>
                    `<span style="display:inline-block; background:#e9f0fa; color:#0056b3; padding:2px 7px; border-radius:12px; font-size:0.75rem; margin:0 4px 4px 0; cursor:pointer; font-weight:600;" onclick="document.getElementById('search-input').value='${escapeHtml(t.trim())}'; document.getElementById('search-input').dispatchEvent(new Event('input'));">#${escapeHtml(t.trim())}</span>`
                ).join('');
                popupContent += `<div style="margin-bottom: 10px;">${tags}</div>`;
            }

            if (item.youtube || item.filelink) {
                popupContent += `<div style="display:flex; gap:8px; margin-top:10px;">`;
                if (item.youtube) popupContent += `<a href="${encodeURI(item.youtube)}" target="_blank" style="background:#ff0000; color:white; text-decoration:none; padding:4px 8px; border-radius:4px; font-size:0.8rem; font-weight:bold;">🎥 YouTube</a>`;
                if (item.filelink) popupContent += `<a href="${encodeURI(item.filelink)}" target="_blank" style="background:#0056b3; color:white; text-decoration:none; padding:4px 8px; border-radius:4px; font-size:0.8rem; font-weight:bold;">🔗 Linkki</a>`;
                popupContent += `</div>`;
            }

            popupContent += `</div>`;

            marker.bindPopup(popupContent);

            // Päivitetään lisäruutu kun markeria klikataan
            marker.on('click', () => {
                updateMuistoMedia(item);
            });

            newMarkers.push(marker);
        });

        markersGroup.addLayers(newMarkers);
    }

    /**
     * Päivittää kartan alla olevan media-osion
     */
    function updateMuistoMedia(item) {
        const mediaCard = document.getElementById('muisto-media-card');
        const mediaContainer = document.getElementById('muisto-media-container');
        const titleEl = document.getElementById('muito-detail-title');
        const descEl = document.getElementById('muito-detail-desc');
        const metaEl = document.getElementById('muito-detail-meta');

        if (!mediaCard) return;

        // Näytetään kortti
        mediaCard.style.display = 'block';
        mediaCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

        // Päivitetään tekstit
        titleEl.textContent = item.title;
        descEl.textContent = item.description;
        metaEl.innerHTML = `📍 ${escapeHtml(item.area)} &nbsp;|&nbsp; 📅 ${escapeHtml(item.decade)} &nbsp;|&nbsp; ✍️ ${escapeHtml(item.author)}`;

        // Tyhjennetään media ja ladataan uusi
        mediaContainer.innerHTML = '<div style="display:flex; align-items:center; justify-content:center; height:100%; color:#666;">Ladataan mediaa...</div>';

        const imgUrl = item.image_url || 'icons/icon-512.png';
        const img = new Image();

        img.onload = () => {
            mediaContainer.innerHTML = '';
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.objectFit = item.image_url ? 'cover' : 'contain';
            if (!item.image_url) {
                img.style.backgroundColor = 'white';
                img.style.padding = '20px';
            }
            img.style.animation = 'fadeIn 0.5s ease-in-out';
            mediaContainer.appendChild(img);
        };

        img.onerror = () => {
            mediaContainer.innerHTML = '<div style="display:flex; align-items:center; justify-content:center; height:100%; color:#666;">Kuvaa ei voitu ladata.</div>';
        };

        img.src = imgUrl;
    }

    // Filter event listeners
    areaFilter.addEventListener('change', renderMarkers);
    decadeFilter.addEventListener('change', renderMarkers);

    searchInput.addEventListener('input', () => {
        renderMarkers();
        showTagSuggestions(searchInput.value);
    });

    searchInput.addEventListener('blur', () => {
        // Pieni viive, jotta mousedown-klikkaus ehtii rekisteröityä
        setTimeout(hideTagSuggestions, 150);
    });

    searchInput.addEventListener('focus', () => {
        if (searchInput.value.length >= 2) {
            showTagSuggestions(searchInput.value);
        }
    });

    // Utilities
    function escapeHtml(unsafe) {
        if (!unsafe) return '';
        return unsafe.toString()
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
});
