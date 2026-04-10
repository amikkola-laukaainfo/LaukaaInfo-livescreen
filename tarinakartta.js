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
    const categorySelect = document.getElementById('theme-select');
    const topicSelect = document.getElementById('category-select');
    const storySelect = document.getElementById('story-select');

    // Elements — info
    const stepTitle = document.getElementById('step-title');
    const stepCounter = document.getElementById('step-counter');
    const detailTitle = document.getElementById('detail-title');
    const detailDesc = document.getElementById('detail-desc');
    const detailMeta = document.getElementById('detail-meta');
    const stepImage = document.getElementById('step-image');
    const imagePlaceholder = document.getElementById('image-placeholder');
    const prevBtn = document.getElementById('prev-step');
    const nextBtn = document.getElementById('next-step');
    const storyDisplay = document.getElementById('story-display');
    const stepSlider = document.getElementById('step-slider');
    
    // QR elements
    const showQrBtn = document.getElementById('show-qr-btn');
    const qrModal = document.getElementById('qr-modal');
    const qrOverlay = document.getElementById('qr-overlay');
    const qrContainer = document.getElementById('qrcode-container');
    const closeQrBtn = document.getElementById('close-qr');
    const copyLinkBtn = document.getElementById('copy-link-btn');
    const copyImgBtn = document.getElementById('copy-img-btn');

    // Audio elements
    const audioArea = document.getElementById('audio-area');
    const stepAudio = document.getElementById('step-audio');

    // 2. Fetch Story Data
    Papa.parse('tarinakartta_data.csv', {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: function (results) {
            allSteps = results.data.sort((a, b) => parseInt(a.step_order) - parseInt(b.step_order));
            if (allSteps.length > 0) {
                populateCategories();
                
                // Jos meillä on syvälinkki, asetetaan select-valikot sen mukaisesti
                const startupStep = new URLSearchParams(window.location.search).get('step');
                if (startupStep) {
                    const found = allSteps.find(s => s.step_order === startupStep);
                    if (found) {
                        categorySelect.value = found.category || '';
                        populateTopics(found.category);
                        topicSelect.value = found.topic || '';
                        populateStories(found.category, found.topic);
                    }
                }
                
                applyFilters(); // initial render
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

    // ── Filtteri & Kartta ────────────────────────────────────────────
    let pendingStepOrder = new URLSearchParams(window.location.search).get('step');

    function applyFilters() {
        const cat = categorySelect.value;
        const topic = topicSelect.value;

        filteredSteps = allSteps.filter(s => {
            if (cat && s.category !== cat) return false;
            if (topic && s.topic !== topic) return false;
            return true;
        });

        buildMapMarkers();
        renderSlider();

        if (filteredSteps.length > 0) {
            storyDisplay.style.display = 'grid';
            
            // Tarkistetaan onko meillä "syvälinkki" odottamassa
            if (pendingStepOrder) {
                const targetIdx = filteredSteps.findIndex(s => s.step_order === pendingStepOrder);
                pendingStepOrder = null; // Kulutetaan heti
                if (targetIdx >= 0) {
                    goToStep(targetIdx);
                    return;
                }
            }
            
            goToStep(0);
        } else {
            storyDisplay.style.display = 'none';
            stepTitle.textContent = 'Ei tarinoita valinnalla';
            stepCounter.textContent = '0 / 0';
            detailDesc.textContent = 'Valitse eri teema tai aihe.';
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

    function renderSlider() {
        if (!stepSlider) return;
        stepSlider.innerHTML = '';
        
        if (filteredSteps.length === 0) {
            stepSlider.style.display = 'none';
            return;
        }
        
        stepSlider.style.display = 'flex';
        
        filteredSteps.forEach((step, index) => {
            const card = document.createElement('div');
            card.className = 'slider-card';
            card.dataset.index = index;
            
            let imageUrl = 'icons/icon-512.png'; // fallback
            if (step.image_url && step.image_url.trim()) {
                imageUrl = step.image_url.trim();
                // Normalisoidaan Google Drive -linkit
                if (imageUrl.includes('drive.google.com') || imageUrl.includes('drive_cache/')) {
                    const idMatch = imageUrl.match(/(?:id=|\/d\/|file\/d\/|drive_cache\/)([a-zA-Z0-9_-]+)/);
                    if (idMatch) imageUrl = `https://www.mediazoo.fi/laukaainfo-web/get_image.php?id=${idMatch[1]}`;
                }
            }
            
            card.innerHTML = `
                <div class="slider-card-number">${index + 1}</div>
                <img src="${imageUrl}" alt="${step.title}" loading="lazy">
                <div class="slider-card-overlay">
                    <div class="slider-card-title">${step.title}</div>
                    <div class="slider-card-link">Tarkennus &rarr;</div>
                </div>
            `;
            
            card.addEventListener('click', () => {
                goToStep(index);
            });
            
            stepSlider.appendChild(card);
        });
    }

    function goToStep(index) {
        if (index < 0 || index >= filteredSteps.length) return;

        currentStepIndex = index;
        const step = filteredSteps[index];

        // Päivitä osoitepalkki (ilman sivun latausta)
        const url = new URL(window.location);
        url.searchParams.set('step', step.step_order);
        window.history.replaceState({}, '', url);

        // Päivitä UI
        stepTitle.textContent = step.title;
        detailTitle.textContent = step.title;
        stepCounter.textContent = `Askel ${index + 1} / ${filteredSteps.length}`;
        detailDesc.textContent = step.description;

        // Päivitä slider
        document.querySelectorAll('.slider-card').forEach((card, i) => {
            if (i === index) {
                card.classList.add('active');
                card.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            } else {
                card.classList.remove('active');
            }
        });

        // Synkronoi tarina-valikko
        storySelect.value = step.step_order;

        // Kuva
        if (step.image_url && step.image_url.trim()) {
            let url = step.image_url.trim();

            // Normalisoidaan Drive-linkit ja välimuistilinkit
            if (url.includes('drive.google.com') || url.includes('drive_cache/')) {
                const idMatch = url.match(/(?:id=|\/d\/|file\/d\/|drive_cache\/)([a-zA-Z0-9_-]+)/);
                if (idMatch) {
                    url = `https://www.mediazoo.fi/laukaainfo-web/get_image.php?id=${idMatch[1]}`;
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
            detailMeta.innerHTML = `<a href="${step.more_info_url}" target="_blank" style="color: #0056b3; font-weight: 600; text-decoration: none;">&rarr; Lue lisää tästä kohteesta</a>`;
            detailMeta.style.display = 'block';
        } else {
            detailMeta.style.display = 'none';
        }

        // QR nappula näkyviin
        if (showQrBtn) showQrBtn.style.display = 'flex';

        // Audio hallinta
        if (step.audio_url && step.audio_url.trim()) {
            stepAudio.src = step.audio_url.trim();
            stepAudio.load();
            audioArea.style.display = 'block';
        } else {
            stepAudio.pause();
            stepAudio.src = '';
            audioArea.style.display = 'none';
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

    // QR Code Logic
    if (showQrBtn) {
        showQrBtn.addEventListener('click', () => {
            const currentUrl = window.location.href;
            qrContainer.innerHTML = ''; // Tyhjennä vanha
            
            const canvas = document.createElement('canvas');
            qrContainer.appendChild(canvas);
            
            QRCode.toCanvas(canvas, currentUrl, {
                width: 250,
                margin: 2,
                color: {
                    dark: '#0056b3',
                    light: '#ffffff'
                }
            }, function (error) {
                if (error) console.error(error);
                qrModal.style.display = 'flex';
                qrOverlay.style.display = 'block';
            });
        });
    }

    const closeQr = () => {
        qrModal.style.display = 'none';
        qrOverlay.style.display = 'none';
    };

    if (closeQrBtn) closeQrBtn.addEventListener('click', closeQr);
    if (qrOverlay) qrOverlay.addEventListener('click', closeQr);

    // Copy Link Logic
    if (copyLinkBtn) {
        copyLinkBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(window.location.href).then(() => {
                const originalText = copyLinkBtn.textContent;
                copyLinkBtn.textContent = '✅ Kopioitu!';
                setTimeout(() => { copyLinkBtn.textContent = originalText; }, 2000);
            });
        });
    }

    // Copy Image Logic
    if (copyImgBtn) {
        copyImgBtn.addEventListener('click', () => {
            const canvas = qrContainer.querySelector('canvas');
            if (!canvas) return;
            
            canvas.toBlob((blob) => {
                const item = new ClipboardItem({ 'image/png': blob });
                navigator.clipboard.write([item]).then(() => {
                    const originalText = copyImgBtn.textContent;
                    copyImgBtn.textContent = '✅ Kuva kopioitu!';
                    setTimeout(() => { copyImgBtn.textContent = originalText; }, 2000);
                });
            }, 'image/png');
        });
    }
});
