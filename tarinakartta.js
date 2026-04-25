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
    let userMarker = null;
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

    // ── Helper: Normalize Image URL ──────────────────────────────
    function getStepImageUrl(rawUrl) {
        if (!rawUrl || !rawUrl.trim()) return null;
        let url = rawUrl.split('|')[0].trim();
        if (url.includes('drive.google.com') || url.includes('drive_cache/')) {
            const idMatch = url.match(/(?:id=|\/d\/|file\/d\/|drive_cache\/)([a-zA-Z0-9_-]+)/);
            if (idMatch) return `https://www.mediazoo.fi/laukaainfo-web/get_image.php?id=${idMatch[1]}`;
        }
        return url;
    }
    
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
    Papa.parse('tarinakartta_data.csv?v=' + Date.now(), {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: function (results) {
            allSteps = results.data.sort((a, b) => parseInt(a.step_order) - parseInt(b.step_order));
            if (allSteps.length > 0) {
                populateCategories();
                
                const urlParams = new URLSearchParams(window.location.search);
                const startupStep = urlParams.get('step');
                const startupCategory = urlParams.get('category');
                const startupTopic = urlParams.get('topic');

                if (startupStep) {
                    const found = allSteps.find(s => s.step_order === startupStep);
                    if (found) {
                        categorySelect.value = found.category || '';
                        populateTopics(found.category);
                        topicSelect.value = found.topic || '';
                        populateStories(found.category, found.topic);
                    }
                } else if (startupCategory) {
                    categorySelect.value = startupCategory;
                    populateTopics(startupCategory);
                    if (startupTopic) {
                        topicSelect.value = startupTopic;
                        populateStories(startupCategory, startupTopic);
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
        applyFilters(true); // Estetään hyppääminen kartalle vasta ensimmäisestä valinnasta
    });

    topicSelect.addEventListener('change', () => {
        const cat = categorySelect.value;
        const topic = topicSelect.value;
        populateStories(cat, topic);
        storySelect.value = '';
        applyFilters(false); // Nyt on hyvä mennä kartalle
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

    function applyFilters(skipMap = false) {
        const cat = categorySelect.value;
        const topic = topicSelect.value;

        filteredSteps = allSteps.filter(s => {
            if (cat && s.category !== cat) return false;
            if (topic && s.topic !== topic) return false;
            return true;
        });

        buildMapMarkers(skipMap);
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
            
            goToStep(0, skipMap);
        } else {
            storyDisplay.style.display = 'none';
            stepTitle.textContent = 'Ei tarinoita valinnalla';
            stepCounter.textContent = '0 / 0';
            detailDesc.textContent = 'Valitse eri teema tai aihe.';
            stepImage.style.display = 'none';
            imagePlaceholder.style.display = 'block';
        }
    }

    function buildMapMarkers(skipMap = false) {
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

            const imageUrl = getStepImageUrl(step.image_url);
            let imageHtml = '';
            if (imageUrl) {
                imageHtml = `
                    <div style="margin: 8px 0; border-radius: 8px; overflow: hidden; background: #f0f4f8; height: 120px; display: flex; align-items: center; justify-content: center;">
                        <img src="${imageUrl}" data-lightbox="${imageUrl}" alt="${escapeHtml(step.title)}" style="width: 100%; height: 100%; object-fit: cover; cursor: zoom-in;" title="Klikkaa suurentaaksesi">
                    </div>
                `;
            }

            let videoHtml = '';
            if (step.youtube_url && step.youtube_url.trim()) {
                const getYoutubeId = (url) => {
                    if (!url) return null;
                    const regExp = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|youtube\.com\/shorts\/)([^"&?\/\s]{11})/;
                    const match = url.match(regExp);
                    return (match && match[1]) ? match[1] : null;
                };
                const vId = getYoutubeId(step.youtube_url.trim());
                if (vId) {
                    videoHtml = `
                        <div style="margin-top:8px; border-radius:8px; overflow:hidden; position:relative; padding-bottom:56.25%; height:0; box-shadow:0 2px 8px rgba(0,0,0,0.15);">
                            <iframe src="https://www.youtube.com/embed/${vId}?autoplay=1&mute=1&rel=0" 
                                style="position:absolute; top:0; left:0; width:100%; height:100%;" 
                                frameborder="0" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>
                        </div>
                        <a href="https://www.youtube.com/watch?v=${vId}" target="_blank" style="display:block; margin-top:5px; font-size:0.75rem; color:#0056b3; text-decoration:none; font-weight:600; text-align:right;">📺 Katso YouTubessa &rarr;</a>
                    `;
                }
            }

            const popupHtml = `
                <div style="min-width: 180px;">
                    <h3 style="margin: 0 0 5px 0; color: #0056b3; font-size: 1rem; font-family: 'Outfit', sans-serif;">${escapeHtml(step.title)}</h3>
                    <div style="font-size: 0.85rem; color: #666; margin-bottom: 4px;">Askel ${index + 1} / ${filteredSteps.length}</div>
                    ${imageHtml}
                    ${videoHtml}
                    <a href="https://www.google.com/maps/search/?api=1&query=${lat},${lng}" target="_blank" style="background: #28a745; color: white; padding: 5px 10px; border-radius: 4px; text-decoration: none; font-size: 0.75rem; display: inline-flex; align-items: center; gap: 5px; font-weight: 600; margin-top: 5px;">📍 Avaa Google Mapsissa</a>
                </div>
            `;
            marker.bindPopup(popupHtml);

            marker.on('click', () => goToStep(index));
            markers.push(marker);
            pathCoords.push([lat, lng]);
        });

        if (skipMap) return;
        
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
            
            let imageUrl = getStepImageUrl(step.image_url) || 'icons/icon-512.png';
            
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

    function goToStep(index, skipMap = false) {
        if (index < 0 || index >= filteredSteps.length) return;

        currentStepIndex = index;
        const step = filteredSteps[index];
        const lat = parseFloat(step.lat);
        const lng = parseFloat(step.lng);

        // Päivitä osoitepalkki (ilman sivun latausta)
        const url = new URL(window.location);
        url.searchParams.set('step', step.step_order);
        window.history.replaceState({}, '', url);

        // Päivitä UI
        stepTitle.textContent = step.title;
        detailTitle.textContent = step.title;
        stepCounter.textContent = `Askel ${index + 1} / ${filteredSteps.length}`;
        detailDesc.innerHTML = escapeHtml(step.description || '').replace(/\\n/g, '<br>').replace(/\n/g, '<br>');

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
        const sliderContainer = document.getElementById('step-image-slider');
        const sliderPrev = document.getElementById('slider-prev');
        const sliderNext = document.getElementById('slider-next');
        const sliderDots = document.getElementById('slider-dots');
        
        if (sliderContainer) sliderContainer.innerHTML = '';
        if (sliderDots) sliderDots.innerHTML = '';
        
        if (step.image_url && step.image_url.trim()) {
            const urls = step.image_url.split('|').map(u => u.trim()).filter(u => u);
            
            if (urls.length > 0) {
                imagePlaceholder.style.display = 'none';
                
                urls.forEach((rawUrl, idx) => {
                    let url = getStepImageUrl(rawUrl);
                    
                    const img = document.createElement('img');
                    img.src = url;
                    img.style.minWidth = '100%';
                    img.style.flexShrink = '0';
                    img.style.objectFit = 'cover';
                    sliderContainer.appendChild(img);
                    
                    if (urls.length > 1) {
                        const dot = document.createElement('div');
                        dot.style.width = '8px';
                        dot.style.height = '8px';
                        dot.style.borderRadius = '50%';
                        dot.style.background = idx === 0 ? 'white' : 'rgba(255,255,255,0.5)';
                        dot.style.cursor = 'pointer';
                        dot.dataset.idx = idx;
                        sliderDots.appendChild(dot);
                    }
                });
                
                let currentSlide = 0;
                const updateSlider = () => {
                    sliderContainer.style.transform = `translateX(-${currentSlide * 100}%)`;
                    Array.from(sliderDots.children).forEach((dot, i) => {
                        dot.style.background = i === currentSlide ? 'white' : 'rgba(255,255,255,0.5)';
                    });
                };
                
                Array.from(sliderDots.children).forEach(dot => {
                    dot.onclick = () => {
                        currentSlide = parseInt(dot.dataset.idx);
                        updateSlider();
                    };
                });
                
                if (urls.length > 1) {
                    sliderPrev.style.display = 'flex';
                    sliderNext.style.display = 'flex';
                    sliderPrev.onclick = () => {
                        currentSlide = (currentSlide - 1 + urls.length) % urls.length;
                        updateSlider();
                    };
                    sliderNext.onclick = () => {
                        currentSlide = (currentSlide + 1) % urls.length;
                        updateSlider();
                    };
                } else {
                    sliderPrev.style.display = 'none';
                    sliderNext.style.display = 'none';
                }
            } else {
                imagePlaceholder.style.display = 'block';
                if (sliderPrev) sliderPrev.style.display = 'none';
                if (sliderNext) sliderNext.style.display = 'none';
            }
        } else {
            imagePlaceholder.style.display = 'block';
            if (sliderPrev) sliderPrev.style.display = 'none';
            if (sliderNext) sliderNext.style.display = 'none';
        }

        // Lisätietoa & Sijainti linkit
        let metaHtml = '';
        if (step.more_info_url && step.more_info_url.trim()) {
            const infoUrl = step.more_info_url.trim();
            if (infoUrl.includes('?reitti=')) {
                metaHtml += `<a href="${infoUrl}" onclick="
                    event.preventDefault();
                    try {
                        const absUrl = new URL(this.getAttribute('href'), window.location.href);
                        const reittiUrl = absUrl.searchParams.get('reitti');
                        const select = document.getElementById('reitti-select');
                        if(select && reittiUrl) {
                            select.value = reittiUrl;
                            select.dispatchEvent(new Event('change'));
                        }
                    } catch(e) { console.error('reitti link error', e); }
                    setTimeout(function(){ document.getElementById('kavelyreitit-section').scrollIntoView({behavior: 'smooth', block: 'start'}); }, 300);
                " style="color: #0056b3; font-weight: 600; text-decoration: none; display: block; margin-bottom: 8px;">&rarr; Siirry kävelyreitille</a>`;
            } else {
                metaHtml += `<a href="${infoUrl}" target="_blank" style="color: #0056b3; font-weight: 600; text-decoration: none; display: block; margin-bottom: 8px;">&rarr; Lue lisää tästä kohteesta</a>`;
            }
        }
        
        if (!isNaN(lat) && !isNaN(lng)) {
            const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
            metaHtml += `<a href="${mapsUrl}" target="_blank" style="color: #28a745; font-weight: 600; text-decoration: none; display: flex; align-items: center; gap: 5px;">📍 Sijainti Google Mapsissa</a>`;
        }

        if (metaHtml) {
            detailMeta.innerHTML = metaHtml;
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

        // YouTube hallinta
        const youtubeArea = document.getElementById('youtube-area');
        const youtubeIframe = document.getElementById('step-youtube');
        if (step.youtube_url && step.youtube_url.trim() && youtubeArea && youtubeIframe) {
            let yUrl = step.youtube_url.trim();
            
            const getYoutubeId = (url) => {
                if (!url) return null;
                const regExp = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|youtube\.com\/shorts\/)([^"&?\/\s]{11})/;
                const match = url.match(regExp);
                if (match && match[1]) {
                    console.log("YouTube ID parsed (top map):", match[1], "from URL:", url);
                    return match[1];
                }
                return null;
            };

            const videoId = getYoutubeId(yUrl);
            if (videoId) {
                youtubeIframe.src = `https://www.youtube.com/embed/${videoId}`;
                youtubeArea.style.display = 'block';
            } else {
                youtubeArea.style.display = 'none';
            }
        } else if (youtubeArea) {
            youtubeArea.style.display = 'none';
            if (youtubeIframe) youtubeIframe.src = '';
        }

        // Kartta
        if (!skipMap && !isNaN(lat) && !isNaN(lng)) {
            map.flyTo([lat, lng], 13, { duration: 1.2 });
        }

        // Highlight-markkeri & Popup
        markers.forEach((m, i) => {
            const isSelected = i === index;
            const el = m.getElement();
            if (!el) return;
            const inner = el.querySelector('div');
            if (inner) {
                inner.style.backgroundColor = isSelected ? '#e85d04' : '#0056b3';
                inner.style.transform = isSelected ? 'scale(1.3)' : 'scale(1)';
                inner.style.transition = 'all 0.2s ease';
            }
            m.setZIndexOffset(isSelected ? 1000 : 0);
            
            if (isSelected) {
                // Pieni viive jotta flyTo ehtii alkaa/loppua ja markkeri on näkyvissä
                setTimeout(() => m.openPopup(), 600);
            }
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

    // Location Logic
    const locateBtn = document.getElementById('btn-locate-user');
    if (locateBtn) {
        locateBtn.addEventListener('click', locateUser);
    }

    function locateUser() {
        if (!navigator.geolocation) {
            alert("Selaimesi ei tue paikannusta.");
            return;
        }

        locateBtn.classList.add('loading');
        
        navigator.geolocation.getCurrentPosition((position) => {
            const { latitude, longitude } = position.coords;
            const userPos = [latitude, longitude];

            if (userMarker) {
                userMarker.setLatLng(userPos);
            } else {
                userMarker = L.circleMarker(userPos, {
                    radius: 8,
                    fillColor: "#007bff",
                    color: "#fff",
                    weight: 3,
                    fillOpacity: 0.8
                }).addTo(map).bindPopup("Olet tässä");
            }

            // Etsi lähin kohde
            if (filteredSteps.length > 0) {
                let minDist = Infinity;
                let closestIdx = -1;

                filteredSteps.forEach((step, i) => {
                    if (step.lat && step.lng) {
                        const d = calculateDistance(latitude, longitude, parseFloat(step.lat), parseFloat(step.lng));
                        if (d < minDist) {
                            minDist = d;
                            closestIdx = i;
                        }
                    }
                });

                if (closestIdx !== -1) {
                    goToStep(closestIdx);
                }
            } else {
                map.setView(userPos, 14);
            }

            locateBtn.classList.remove('loading');
        }, (error) => {
            console.error("Geolocation error:", error);
            locateBtn.classList.remove('loading');
            alert("Sijaintia ei voitu hakea. Varmista että GPS on päällä ja olet antanut luvan.");
        }, { enableHighAccuracy: true });
    }

    function calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

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

    function escapeHtml(unsafe) {
        if (!unsafe) return '';
        return unsafe.toString()
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
});
