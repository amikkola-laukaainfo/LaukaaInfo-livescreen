document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize Map
    const map = L.map('tarina-map').setView([62.336, 26.046], 10);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    let allSteps = [];       // kaikki CSV-rivit
    let filteredSteps = [];  // suodatettu näkymä
    let currentStepIndex = 0;
    let markers = [];
    let polyline = null;

    // Elements — valikot
    const categorySelect = document.getElementById('select-category');
    const topicSelect = document.getElementById('select-topic');
    const storySelect = document.getElementById('select-story');

    // Elements — info
    const stepTitle = document.getElementById('step-title');
    const stepCounter = document.getElementById('step-counter');
    const stepDescription = document.getElementById('step-description');
    const stepImage = document.getElementById('step-image');
    const imagePlaceholder = document.getElementById('image-placeholder');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const stepMoreInfo = document.getElementById('step-more-info');

    // 2. Fetch Story Data
    Papa.parse('tarinakartta_data.csv', {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: function (results) {
            allSteps = results.data.sort((a, b) => parseInt(a.step_order) - parseInt(b.step_order));
            if (allSteps.length > 0) {
                populateCategories();
                applyFilters(); // initial render — kaikki tarinat
            }
        },
        error: function (err) {
            console.error('Virhe tarinadatan latauksessa:', err);
            stepTitle.textContent = 'Virhe datan latauksessa';
        }
    });

    // ── Cascading Dropdowns ──────────────────────────────────────────

    function populateCategories() {
        const cats = [...new Set(allSteps.map(s => s.category).filter(Boolean))].sort();
        categorySelect.innerHTML = '<option value="">Kaikki teemat</option>';
        cats.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat;
            opt.textContent = cat;
            categorySelect.appendChild(opt);
        });
    }

    function populateTopics(category) {
        const source = category ? allSteps.filter(s => s.category === category) : allSteps;
        const topics = [...new Set(source.map(s => s.topic).filter(Boolean))].sort();

        topicSelect.innerHTML = '<option value="">Kaikki aiheet</option>';
        topics.forEach(topic => {
            const opt = document.createElement('option');
            opt.value = topic;
            opt.textContent = topic;
            topicSelect.appendChild(opt);
        });
        topicSelect.disabled = topics.length === 0;
    }

    function populateStories(category, topic) {
        let source = allSteps;
        if (category) source = source.filter(s => s.category === category);
        if (topic) source = source.filter(s => s.topic === topic);

        storySelect.innerHTML = '<option value="">Kaikki tarinat</option>';
        source.forEach(step => {
            const opt = document.createElement('option');
            opt.value = step.step_order;
            opt.textContent = step.story_name || step.title;
            storySelect.appendChild(opt);
        });
        storySelect.disabled = source.length === 0;
    }

    categorySelect.addEventListener('change', () => {
        const cat = categorySelect.value;
        populateTopics(cat);
        populateStories(cat, '');
        storySelect.value = '';
        applyFilters();
    });

    topicSelect.addEventListener('change', () => {
        const cat = categorySelect.value;
        const topic = topicSelect.value;
        populateStories(cat, topic);
        storySelect.value = '';
        applyFilters();
    });

    storySelect.addEventListener('change', () => {
        const selectedOrder = storySelect.value;
        if (selectedOrder) {
            const idx = filteredSteps.findIndex(s => s.step_order === selectedOrder);
            if (idx >= 0) goToStep(idx);
        } else {
            applyFilters();
        }
    });

    // ── Filtteri & Kartta ────────────────────────────────────────────

    function applyFilters() {
        const cat = categorySelect.value;
        const topic = topicSelect.value;

        filteredSteps = allSteps.filter(s => {
            if (cat && s.category !== cat) return false;
            if (topic && s.topic !== topic) return false;
            return true;
        });

        buildMapMarkers();
        if (filteredSteps.length > 0) {
            goToStep(0);
        } else {
            stepTitle.textContent = 'Ei tarinoita valinnalla';
            stepCounter.textContent = '0 / 0';
            stepDescription.textContent = 'Valitse eri teema tai aihe.';
            stepImage.style.display = 'none';
            imagePlaceholder.style.display = 'block';
        }
    }

    function buildMapMarkers() {
        // Poista vanhat
        markers.forEach(m => map.removeLayer(m));
        markers = [];
        if (polyline) { map.removeLayer(polyline); polyline = null; }

        const pathCoords = [];

        filteredSteps.forEach((step, index) => {
            const lat = parseFloat(step.lat);
            const lng = parseFloat(step.lng);
            if (isNaN(lat) || isNaN(lng)) return;

            const marker = L.marker([lat, lng], {
                icon: L.divIcon({
                    className: 'custom-div-icon',
                    html: `<div style="background-color:#0056b3; color:white; border-radius:50%; width:28px; height:28px; display:flex; align-items:center; justify-content:center; border:2px solid white; font-weight:bold; font-size:0.8rem; box-shadow:0 2px 6px rgba(0,0,0,0.3);">${index + 1}</div>`,
                    iconSize: [28, 28],
                    iconAnchor: [14, 14]
                })
            }).addTo(map);

            marker.on('click', () => goToStep(index));
            markers.push(marker);
            pathCoords.push([lat, lng]);
        });

        if (pathCoords.length > 1) {
            polyline = L.polyline(pathCoords, {
                color: '#0056b3',
                weight: 3,
                opacity: 0.5,
                dashArray: '6, 10'
            }).addTo(map);

            // Sovita näkymä kaikkiin pisteisiin
            map.fitBounds(L.latLngBounds(pathCoords).pad(0.15));
        } else if (pathCoords.length === 1) {
            map.flyTo(pathCoords[0], 13);
        }
    }

    function goToStep(index) {
        if (index < 0 || index >= filteredSteps.length) return;

        currentStepIndex = index;
        const step = filteredSteps[index];

        // Päivitä UI
        stepTitle.textContent = step.title;
        stepCounter.textContent = `Askel ${index + 1} / ${filteredSteps.length}`;
        stepDescription.textContent = step.description;

        // Synkronoi tarina-valikko
        storySelect.value = step.step_order;

        // Kuva
        if (step.image_url && step.image_url.trim()) {
            let url = step.image_url.trim();

            // Normalisoidaan Drive-linkit ja välimuistilinkit
            if (url.includes('drive.google.com') || url.includes('drive_cache/')) {
                const idMatch = url.match(/(?:id=|\/d\/|file\/d\/|drive_cache\/)([a-zA-Z0-9_-]+)/);
                if (idMatch) {
                    url = `get_image.php?id=${idMatch[1]}`;
                }
            }

            stepImage.src = url;
            stepImage.style.display = 'block';
            stepImage.style.opacity = '0';
            stepImage.onload = () => { stepImage.style.opacity = '1'; };
            imagePlaceholder.style.display = 'none';
        } else {
            stepImage.style.display = 'none';
            imagePlaceholder.style.display = 'block';
        }

        // Lisätietoa-linkki
        if (step.more_info_url && step.more_info_url.trim()) {
            stepMoreInfo.href = step.more_info_url;
            stepMoreInfo.style.display = 'block';
        } else {
            stepMoreInfo.style.display = 'none';
        }

        // Kartta
        const lat = parseFloat(step.lat);
        const lng = parseFloat(step.lng);
        if (!isNaN(lat) && !isNaN(lng)) {
            map.flyTo([lat, lng], 13, { duration: 1.2 });
        }

        // Highlight-markkeri
        markers.forEach((m, i) => {
            const el = m.getElement();
            if (!el) return;
            const inner = el.querySelector('div');
            if (inner) {
                inner.style.backgroundColor = i === index ? '#e85d04' : '#0056b3';
                inner.style.transform = i === index ? 'scale(1.3)' : 'scale(1)';
                inner.style.transition = 'all 0.2s ease';
            }
            m.setZIndexOffset(i === index ? 1000 : 0);
        });

        // Napit
        prevBtn.disabled = index === 0;
        nextBtn.disabled = index === filteredSteps.length - 1;
    }

    // Event Listeners
    prevBtn.addEventListener('click', () => goToStep(currentStepIndex - 1));
    nextBtn.addEventListener('click', () => goToStep(currentStepIndex + 1));
});
