/**
 * LaukaaInfo Media Modal Component
 * Handles rich media display, tiered packages, and lead generation CTAs.
 */

window.LkiModal = (function() {
    let modalOverlay = null;
    let swiperInstance = null;

    function slugify(text) {
        if (!text) return "";
        return text.toString().toLowerCase().trim()
            .replace(/\s+/g, '-')
            .replace(/[äÄàáâãäå]/g, 'a')
            .replace(/[öÖòóôõöø]/g, 'o')
            .replace(/[åÅ]/g, 'a')
            .replace(/[^\w-]/g, '')
            .replace(/--+/g, '-')
            .replace(/^-+/, '')
            .replace(/-+$/, '');
    }

    function init() {
        if (modalOverlay) return;

        // Create modal DOM structure
        const html = `
            <div class="lki-modal-overlay" id="lki-modal-overlay">
                <button class="lki-modal-close" onclick="LkiModal.close()">&times;</button>
                <div class="lki-modal-container" id="lki-modal-container">
                    <div class="lki-modal-media">
                        <div class="swiper" id="lki-modal-swiper">
                            <div class="swiper-wrapper" id="lki-modal-swiper-wrapper"></div>
                            <div class="swiper-pagination"></div>
                            <div class="swiper-button-next"></div>
                            <div class="swiper-button-prev"></div>
                        </div>
                    </div>
                    <div class="lki-modal-body">
                        <div id="lki-modal-badge-container"></div>
                        <h2 class="lki-modal-title" id="lki-modal-title"></h2>
                        <span class="lki-modal-category" id="lki-modal-category"></span>
                        <div class="lki-modal-description" id="lki-modal-description"></div>
                        <div class="lki-modal-info-grid" id="lki-modal-info-grid">
                            <div class="lki-info-item" style="display: flex; align-items: center; flex-wrap: wrap;"><span>📍</span> <span id="lki-modal-address">Laukaa</span> <button class="lki-modal-share-location-btn" id="lki-modal-share-location-btn" title="Kopioi jakolinkki kohteeseen" aria-label="Kopioi jakolinkki kohteeseen">🔗</button> <span class="lki-modal-share-location-feedback" id="lki-modal-share-location-feedback" style="display: none;">Kopioitu! ✅</span></div>
                            <div class="lki-info-item" id="lki-modal-phone-item"><span>📞</span> <span id="lki-modal-phone"></span></div>
                            <div class="lki-info-item" id="lki-modal-email-item"><span>✉️</span> <span id="lki-modal-email"></span></div>
                        </div>
                        <div class="lki-modal-footer" id="lki-modal-footer"></div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', html);
        modalOverlay = document.getElementById('lki-modal-overlay');

        // Close on overlay click
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) close();
        });

        // Close on ESC
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modalOverlay.classList.contains('active')) close();
        });
    }

    async function open(company) {
        init();
        if (!company) return;

        console.log("Opening LkiModal for:", company.nimi, company);

        // Näytetään heti ne tiedot mitä meillä on (Slim-data)
        renderContent(company);
        
        // Show modal early for better UX
        modalOverlay.classList.add('active');
        document.body.style.overflow = 'hidden';

        // Jos kriittiset tiedot puuttuvat (Slim-data), ladataan ne lennosta
        const isSlim = !company.puhelin && !company.email && (!company.media || company.media.length <= 1);
        
        // Käytetään yrityksen omaa rowid:tä, ei feedin item-id:tä
        const companyLookupId = company.business_id || company.business_rowid || company.id;

        // Fetchataan lisätietoja vain yritys/yhteisö-tyypeille — ei ilmoituksille, tapahtumille jne.
        const isBusinessType = !company.type || company.type === 'business' || company.type === 'community';

        if (isSlim && companyLookupId && isBusinessType) {
            const descEl = document.getElementById('lki-modal-description');
            const loadingDot = document.createElement('div');
            loadingDot.className = 'lki-loading-dots';
            loadingDot.style.cssText = 'margin-top:10px; opacity:0.6; font-style:italic;';
            loadingDot.textContent = 'Ladataan lisätietoja...';
            descEl.appendChild(loadingDot);

            try {
                const dataSourceUrl = 'https://www.mediazoo.fi/laukaainfo-web/get_companies.php';
                const response = await fetch(`${dataSourceUrl}?id=${encodeURIComponent(companyLookupId)}&t=${Date.now()}`);
                const data = await response.json();
                
                if (data.results && data.results[0]) {
                    const fullData = data.results[0];
                    
                    // Normalisoidaan URL:t (kuten init-vaiheessa)
                    const baseUrl = dataSourceUrl.substring(0, dataSourceUrl.lastIndexOf('/') + 1);
                    if (fullData.media) {
                        fullData.media.forEach(item => {
                            if (item.url && !item.url.startsWith('http') && !item.url.startsWith('//')) {
                                item.url = baseUrl + item.url;
                            }
                        });
                    }
                    if (fullData.logo && !fullData.logo.startsWith('http') && !fullData.logo.startsWith('//') && fullData.logo !== '-') {
                        fullData.logo = baseUrl + fullData.logo;
                    }

                    // Päivitetään yrityksen objekti (niin että se säilyy muistissa seuraavaa klikkausta varten)
                    Object.assign(company, fullData);
                    
                    // Renderöidään uudelleen täysillä tiedoilla (poistaa myös loading-tekstin)
                    renderContent(company);
                } else {
                    // Ei tuloksia — poistetaan latausteksti manuaalisesti
                    loadingDot.remove();
                }
            } catch (error) {
                console.error("Virhe ladattaessa lisätietoja:", error);
                // Poistetaan latausteksti myös virhetilanteessa
                loadingDot.remove();
            }
        }
    }

    const ENCOUNTER_CATEGORIES = {
        'search':     { title: 'Etsin',               emoji: '🔍', color: '#a855f7' },
        'offer':      { title: 'Tarjoan',             emoji: '🟢', color: '#22c55e' },
        'sell':       { title: 'Myyn',                emoji: '🛒', color: '#eab308' },
        'give':       { title: 'Annan',               emoji: '🎁', color: '#14b8a6' },
        'notice':     { title: 'Ilmoitan',            emoji: '📢', color: '#ef4444' },
        'idea':       { title: 'Idea',                emoji: '💡', color: '#f97316' },
        'lost_found': { title: 'Kadonnut / löytynyt', emoji: '🎒', color: '#f59e0b' },
    };

    const SUB_CATEGORY_LABELS = {
        'service':       'Palvelua',
        'item':          'Tavaraa',
        'space':         'Tilaa tai paikkaa',
        'work':          'Työtä tai tekijää',
        'collaboration': 'Yhteistyötä',
        'event_staff':   'Tapahtumaan osallistujia',
        'skill':         'Osaamista',
        'transport':     'Kyytiä',
        'help':          'Apua',
        'lost':          'Kadonnut',
        'found':         'Löytynyt',
        'other':         'Muuta',
    };

    const LEGACY_MAP = {
        'service_request': { cat: 'search',     sub: 'service' },
        'need_help':       { cat: 'search',     sub: 'service' },
        'offer_service':   { cat: 'offer',      sub: 'service' },
        'b2b_collab':      { cat: 'search',     sub: 'collaboration' },
        'event_staff':     { cat: 'search',     sub: 'event_staff' },
        'space_rental':    { cat: 'search',     sub: 'space' },
        'work_and_gigs':   { cat: 'search',     sub: 'work' },
        'local_notice':    { cat: 'notice',     sub: null },
        'lost_and_found':  { cat: 'lost_found', sub: null },
        'community':       { cat: 'notice',     sub: null },
        'high_value':      { cat: 'sell',       sub: null },
    };

    function resolveEncounterCategory(type, subCategory = null) {
        if (ENCOUNTER_CATEGORIES[type]) {
            const cat = ENCOUNTER_CATEGORIES[type];
            const subLabel = (subCategory && SUB_CATEGORY_LABELS[subCategory]) || null;
            return { ...cat, subLabel };
        }
        const mapped = LEGACY_MAP[type];
        if (mapped) {
            const cat = ENCOUNTER_CATEGORIES[mapped.cat] || ENCOUNTER_CATEGORIES['notice'];
            const effectiveSub = subCategory || mapped.sub;
            const subLabel = (effectiveSub && SUB_CATEGORY_LABELS[effectiveSub]) || null;
            return { ...cat, subLabel };
        }
        return { emoji: '📢', title: 'Ilmoitus', color: '#64748b', subLabel: null };
    }

    function isEncounterItem(item) {
        if (!item) return false;
        if (item.is_encounter || item.entity_type === 'encounter') return true;
        if (item.sub_category !== undefined && item.sub_category !== null) return true;
        if (item.price_info !== undefined && item.price_info !== null && item.price_info !== '') return true;
        const encounterTypes = ['search', 'offer', 'sell', 'give', 'notice', 'idea', 'lost_found',
                                'service_request', 'need_help', 'offer_service', 'work_and_gigs',
                                'space_rental', 'b2b_collab', 'event_staff', 'local_notice', 'lost_and_found'];
        if (item.type && encounterTypes.includes(item.type.toLowerCase())) return true;
        return false;
    }

    function renderContent(company) {
        const isEncounter = isEncounterItem(company);
        const tier = (company.package || company.taso || 'perus').toLowerCase();
        const container = document.getElementById('lki-modal-container');
        
        // Badge & Title & Category
        const badgeContainer = document.getElementById('lki-modal-badge-container');
        if (isEncounter) {
            container.className = 'lki-modal-container perus';
            const catInfo = resolveEncounterCategory(company.type, company.sub_category);
            const subPart = catInfo.subLabel ? ` · ${catInfo.subLabel}` : '';
            badgeContainer.innerHTML = `<span class="lki-badge encounter-badge" style="background: ${catInfo.color}; color: #ffffff; padding: 6px 14px; border-radius: 50px; font-weight: 700; font-size: 0.9rem; display: inline-flex; align-items: center; gap: 6px;">${catInfo.emoji} ${catInfo.title}${subPart}</span>`;
            document.getElementById('lki-modal-title').textContent = company.title || company.nimi || 'Ilmoitus';
            document.getElementById('lki-modal-category').textContent = `${catInfo.emoji} ${catInfo.title}${subPart}`;
        } else {
            // Tier styles
            container.className = 'lki-modal-container ' + tier;
            
            // Badge
            if (tier === 'premium') {
                badgeContainer.innerHTML = '<span class="lki-badge premium">PREMIUM JYVÄSKYLÄ / LAUKAA</span>';
            } else if (tier === 'pro') {
                badgeContainer.innerHTML = '<span class="lki-badge pro">SUOSITELTU</span>';
            } else {
                badgeContainer.innerHTML = '';
            }

            if (company.service_mode === 'SERVICE_AREA') {
                badgeContainer.innerHTML += '<span class="lki-badge service-area" style="background: #e65100; color: #ffffff; border: 1px solid #bf4500;">🟠 PALVELEE ALUEELLA</span>';
            }

            // Basic Info
            document.getElementById('lki-modal-title').textContent = company.nimi;
            document.getElementById('lki-modal-category').textContent = company.kategoria || company.category || '';
        }
        
        // Use full description if available, otherwise fallback to mainoslause
        const rawDescription = company.esittely || company.description || company.mainoslause || '';
        let cleanDesc = rawDescription.replace(/@@/g, '');
        
        // Escape HTML for safety, then linkify URLs
        const tempDiv = document.createElement('div');
        tempDiv.textContent = cleanDesc;
        let escapedDesc = tempDiv.innerHTML;
        
        const urlRegex = /(https?:\/\/[^\s<]+[^\s<.,;:!?'"])/g;
        const linkedDesc = escapedDesc.replace(urlRegex, function(url) {
            return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color: var(--primary-blue); text-decoration: underline;">${url}</a>`;
        });
        
        document.getElementById('lki-modal-description').innerHTML = linkedDesc;
        
        const locName = company.place_name || company.location || company.location_name || company.osoite || 'Laukaa';
        document.getElementById('lki-modal-address').textContent = locName;
        
        const phone = company.contact_phone || company.puhelin || company.phone || '';
        const phoneItem = document.getElementById('lki-modal-phone-item');
        if (phone && phone !== '-') {
            document.getElementById('lki-modal-phone').textContent = phone;
            phoneItem.style.display = 'flex';
        } else {
            phoneItem.style.display = 'none';
        }

        const email = company.contact_email || company.email || '';
        const emailItem = document.getElementById('lki-modal-email-item');
        if (email && email !== '-') {
            document.getElementById('lki-modal-email').textContent = email;
            emailItem.style.display = 'flex';
        } else {
            emailItem.style.display = 'none';
        }

        // Service Methods (Palvelutapa)
        let waysMarkup = '';
        const tags = (company.tags || '').split(',').map(t => t.trim().toLowerCase());
        const pvtapa = (company.palvelutapa || '').split(',').map(t => t.trim().toLowerCase());
        const combinedWays = [...new Set([...tags, ...pvtapa])];
        
        let waysIcons = '';
        let waysLabels = [];
        if (combinedWays.includes('toimipiste')) { waysIcons += '🏢 '; waysLabels.push('Toimipiste'); }
        if (combinedWays.includes('kotikaynti') || combinedWays.includes('kotikäynti')) { waysIcons += '🏠 '; waysLabels.push('Kotikäynti'); }
        if (combinedWays.includes('etapalvelu') || combinedWays.includes('etäpalvelu')) { waysIcons += '💻 '; waysLabels.push('Etäpalvelu'); }
        if (combinedWays.includes('toimitus')) { waysIcons += '🚚 '; waysLabels.push('Toimitus'); }

        const infoGrid = document.getElementById('lki-modal-info-grid');
        // Clean old way info
        const oldWay = infoGrid.querySelector('.lki-info-way');
        if (oldWay) oldWay.remove();

        if (waysIcons) {
            waysMarkup = `
                <div class="lki-info-item" style="grid-column: 1 / -1; margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(0,0,0,0.05); flex-direction: column; align-items: flex-start;">
                    <div style="font-weight: 700; font-size: 0.75rem; text-transform: uppercase; color: var(--primary-blue); opacity: 0.7; margin-bottom: 4px;">Palvelun tyyppi</div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 1.2rem;">${waysIcons}</span>
                        <span style="font-size: 0.9rem; font-weight: 500;">${waysLabels.join(', ')}</span>
                    </div>
                </div>
            `;
            const wayDiv = document.createElement('div');
            wayDiv.className = 'lki-info-way'; 
            wayDiv.innerHTML = waysMarkup;
            infoGrid.appendChild(wayDiv);
        }

        // Service Area Confirmation
        const oldConfirmation = infoGrid.querySelector('.lki-service-confirmation');
        if (oldConfirmation) oldConfirmation.remove();

        if (company.service_mode === 'SERVICE_AREA') {
            const confDiv = document.createElement('div');
            confDiv.className = 'lki-info-item lki-service-confirmation';
            confDiv.style.gridColumn = '1 / -1';
            confDiv.style.background = '#f0fff4';
            confDiv.style.border = '1px solid #c6f6d5';
            confDiv.style.borderRadius = '8px';
            confDiv.style.padding = '10px';
            confDiv.style.marginTop = '10px';
            confDiv.style.display = 'flex';
            confDiv.style.flexDirection = 'column';
            confDiv.style.gap = '4px';

            confDiv.innerHTML = `
                <div style="color: #2f855a; font-weight: bold; display: flex; align-items: center; gap: 6px;">
                    <span style="font-size: 1.1rem;">✔</span> Palvelee myös tällä alueella
                </div>
                <div style="font-size: 0.85rem; color: #276749; display: flex; align-items: center; gap: 6px;">
                    <span>🚗</span> Liikkuva palvelu
                </div>
                ${company.service_note ? `<div style="font-size: 0.85rem; color: #666; font-style: italic; margin-top: 4px; padding-top: 4px; border-top: 1px dotted #ccc;">${company.service_note}</div>` : ''}
            `;
            infoGrid.appendChild(confDiv);
        }

        // Encounter-spesifit lisätiedot (Hinta, Julkaisija, Päivämäärä)
        const oldPrice = infoGrid.querySelector('.lki-price-item');
        if (oldPrice) oldPrice.remove();
        const oldPub = infoGrid.querySelector('.lki-publisher-item');
        if (oldPub) oldPub.remove();
        const oldDate = infoGrid.querySelector('.lki-date-item');
        if (oldDate) oldDate.remove();

        if (company.price_info) {
            const priceDiv = document.createElement('div');
            priceDiv.className = 'lki-info-item lki-price-item';
            priceDiv.style.cssText = 'grid-column: 1 / -1; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 10px 14px; margin-top: 8px; font-weight: 700; color: #15803d; font-size: 1.05rem; display: flex; align-items: center; gap: 8px;';
            priceDiv.innerHTML = `<span>💰 Hinta / Palkkio:</span> <span>${company.price_info}</span>`;
            infoGrid.appendChild(priceDiv);
        }

        if (company.publisher_name) {
            const pubDiv = document.createElement('div');
            pubDiv.className = 'lki-info-item lki-publisher-item';
            pubDiv.style.cssText = 'grid-column: 1 / -1; color: #475569; font-weight: 600; font-size: 0.9rem; margin-top: 4px; display: flex; align-items: center; gap: 6px;';
            pubDiv.innerHTML = `<span>👤 Julkaisija:</span> <span>${company.publisher_name}</span>`;
            infoGrid.appendChild(pubDiv);
        }

        if (company.created_at) {
            const dateStr = new Date(company.created_at).toLocaleDateString('fi-FI', { day: 'numeric', month: 'long', year: 'numeric' });
            const dateDiv = document.createElement('div');
            dateDiv.className = 'lki-info-item lki-date-item';
            dateDiv.style.cssText = 'grid-column: 1 / -1; color: #94a3b8; font-size: 0.82rem; margin-top: 2px; display: flex; align-items: center; gap: 6px;';
            dateDiv.innerHTML = `<span>📅 Julkaistu:</span> <span>${dateStr}</span>`;
            infoGrid.appendChild(dateDiv);
        }

        // Jakolinkki kohteeseen
        const shareBtn = document.getElementById('lki-modal-share-location-btn');
        const shareFeedback = document.getElementById('lki-modal-share-location-feedback');
        if (shareBtn) {
            let shareUrl = '';
            const baseUrl = window.location.protocol + '//' + window.location.host + window.location.pathname;
            const isFeedItem = company.publish_at || company.type === 'event' || company.type === 'notice' || company.type === 'story' || company.type === 'offer' || company.type === 'video' || company.type === 'pikkuilmoitus';
            
            if (isFeedItem && company.id) {
                shareUrl = `${baseUrl}?item=${encodeURIComponent(company.id)}&feed=open`;
            } else {
                const slug = slugify(company.nimi || company.title || '');
                shareUrl = `${baseUrl}?open=${encodeURIComponent(slug)}`;
            }

            shareBtn.onclick = (e) => {
                e.stopPropagation();
                e.preventDefault();
                navigator.clipboard.writeText(shareUrl).then(() => {
                    shareFeedback.style.display = 'inline';
                    setTimeout(() => {
                        shareFeedback.style.display = 'none';
                    }, 2000);
                }).catch(err => {
                    console.error('Error copying link to clipboard:', err);
                    // Fallback jos clipboard api ei ole käytettävissä
                    const textarea = document.createElement('textarea');
                    textarea.value = shareUrl;
                    textarea.style.position = 'fixed';
                    document.body.appendChild(textarea);
                    textarea.select();
                    try {
                        document.execCommand('copy');
                        shareFeedback.style.display = 'inline';
                        setTimeout(() => {
                            shareFeedback.style.display = 'none';
                        }, 2000);
                    } catch (err2) {
                        console.error('Fallback copy failed:', err2);
                    }
                    document.body.removeChild(textarea);
                });
            };
        }

        // Media Slider
        renderSlider(company, tier);

        // CTAs
        renderCTAs(company, tier);
    }

    function close() {
        if (!modalOverlay) return;
        modalOverlay.classList.remove('active');
        document.body.style.overflow = '';
        
        // Stop videos in swiper
        const iframes = modalOverlay.querySelectorAll('iframe');
        iframes.forEach(f => {
            const src = f.src;
            f.src = '';
            f.src = src;
        });
        
        const videos = modalOverlay.querySelectorAll('video');
        videos.forEach(v => v.pause());
    }

    function renderSlider(company, tier) {
        const wrapper = document.getElementById('lki-modal-swiper-wrapper');
        wrapper.innerHTML = '';

        // Combine media from multiple fields
        let mediaItems = [];
        
        // 1. Existing media array
        if (Array.isArray(company.media)) {
            mediaItems = mediaItems.concat(company.media);
        }
        
        // 2. Dedicated images/videos arrays (from the new get_companies.php)
        if (Array.isArray(company.images)) {
            company.images.forEach(url => {
                if (!mediaItems.find(m => m.url === url)) {
                    mediaItems.push({ type: 'image', url: url });
                }
            });
        }
        if (Array.isArray(company.videos)) {
            company.videos.forEach(url => {
                const videoUrl = url.includes('youtube.com') || url.includes('youtu.be') ? url : url;
                if (!mediaItems.find(m => m.url === videoUrl)) {
                    mediaItems.push({ type: 'video', url: videoUrl });
                }
            });
        }

        // 3. Handle singular video_id or youtube_url from feed items
        let feedVideoUrl = company.video_id ? `https://www.youtube.com/embed/${company.video_id}` : null;
        if (!feedVideoUrl && company.youtube_url) {
            let vid = '';
            const ytUrl = company.youtube_url;
            if (ytUrl.includes('youtube.com/watch?v=')) {
                vid = ytUrl.split('v=')[1]?.split('&')[0];
            } else if (ytUrl.includes('youtu.be/')) {
                vid = ytUrl.split('youtu.be/')[1]?.split('?')[0];
            } else if (ytUrl.includes('youtube.com/shorts/')) {
                vid = ytUrl.split('/shorts/')[1]?.split('?')[0]?.split('&')[0];
            } else if (ytUrl.includes('youtube.com/embed/')) {
                vid = ytUrl.split('/embed/')[1]?.split('?')[0];
            }
            if (vid) {
                feedVideoUrl = `https://www.youtube.com/embed/${vid}`;
            }
        }
        if (feedVideoUrl) {
            if (!mediaItems.find(m => m.url === feedVideoUrl)) {
                mediaItems.push({ type: 'video', url: feedVideoUrl });
            }
        }

        // If no media, use logo or default (also check singular 'image' and 'image_url' from Supabase)
        if (mediaItems.length === 0) {
            const fallbackImg = company.images?.[0] || company.image || company.image_url || (company.logo && company.logo !== '-' ? company.logo : 'logo.png');
            mediaItems.push({ type: 'image', url: fallbackImg });
        }

        // Generate slides
        mediaItems.forEach(item => {
            const slide = document.createElement('div');
            slide.className = 'swiper-slide';

            if (item.type === 'video') {
                const videoUrl = item.url;
                if (videoUrl.includes('youtube.com/embed/')) {
                    // Muted autoplay parameter for all
                    const autoplay = '&autoplay=1&mute=1';
                    const watchUrl = videoUrl.replace('embed/', 'watch?v=');
                    slide.innerHTML = `
                        <div class="lki-modal-video-wrapper">
                            <iframe src="${videoUrl}?rel=0${autoplay}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
                            <a href="${watchUrl}" target="_blank" class="lki-modal-yt-link">📺 Katso YouTubessa &rarr;</a>
                        </div>
                    `;
                } else if (videoUrl.endsWith('.mp4')) {
                    slide.innerHTML = `<video src="${videoUrl}" controls ${tier === 'premium' ? 'autoplay muted' : ''}></video>`;
                } else {
                    slide.innerHTML = `<iframe src="${videoUrl}" allowfullscreen></iframe>`;
                }
            } else {
                slide.innerHTML = `<img src="${item.url}" alt="${company.nimi}" loading="lazy">`;
            }
            wrapper.appendChild(slide);
        });

        // Initialize Swiper ONLY if more than 1 item
        if (swiperInstance) {
            swiperInstance.destroy(true, true);
            swiperInstance = null;
        }

        if (mediaItems.length > 1) {
            // Wait for DOM to catch up
            setTimeout(() => {
                if (typeof Swiper === 'undefined') {
                    console.error('Swiper not loaded - check script tags');
                    return;
                }
                console.log('Initializing Swiper for modal...', company.nimi);
                swiperInstance = new Swiper('#lki-modal-swiper', {
                    pagination: { el: '.swiper-pagination', clickable: true },
                    navigation: { nextEl: '.swiper-button-next', prevEl: '.swiper-button-prev' },
                    loop: true,
                    autoplay: (tier === 'premium') ? { delay: 5000, disableOnInteraction: false } : false,
                });
            }, 50);
        } else {
            // If only 1 item, ensure Swiper classes don't mess with it
            const swiperEl = document.getElementById('lki-modal-swiper');
            if (swiperEl) {
                const pag = swiperEl.querySelector('.swiper-pagination');
                const next = swiperEl.querySelector('.swiper-button-next');
                const prev = swiperEl.querySelector('.swiper-button-prev');
                if (pag) pag.style.display = 'none';
                if (next) next.style.display = 'none';
                if (prev) prev.style.display = 'none';
            }
        }
    }

    function renderCTAs(company, tier) {
        const footer = document.getElementById('lki-modal-footer');
        footer.innerHTML = '';
        
        // Add a "Hide" button for mobile
        const hideBtn = document.createElement('button');
        hideBtn.className = 'lki-footer-hide-btn';
        hideBtn.innerHTML = '✕ Piilota painikkeet';
        hideBtn.onclick = () => {
            footer.style.display = 'none';
        };
        footer.appendChild(hideBtn);

        // Encounter-tyyppinen CTA: Suora linkki Kohtaamispaikkaan (kohtaamiset.html)
        if (isEncounterItem(company)) {
            const encId = company.id || '';
            const encUrl = `kohtaamiset.html?id=${encodeURIComponent(encId)}`;
            footer.innerHTML += `<a href="${encUrl}" class="lki-cta-btn feed" style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: #ffffff; font-weight: 700; padding: 12px 18px; border-radius: 8px; text-decoration: none; display: inline-flex; align-items: center; gap: 8px; font-size: 0.95rem; justify-content: center; width: 100%; box-sizing: border-box; margin-bottom: 8px; border: none;">📋 Katso kaikki ilmoitukset (Kohtaamispaikka) →</a>`;

            const phone = company.contact_phone || company.puhelin || company.phone || '';
            if (phone && phone !== '-' && phone !== '') {
                const waNum = phone.replace(/[^0-9]/g, '');
                if (waNum) {
                    footer.innerHTML += `<a href="https://wa.me/${waNum}" target="_blank" class="lki-cta-btn whatsapp">💬 WhatsApp</a>`;
                }
                footer.innerHTML += `<a href="tel:${phone.replace(/[^0-9+]/g, '')}" class="lki-cta-btn phone">📞 Soita</a>`;
            }

            const email = company.contact_email || company.email || '';
            if (email && email !== '-') {
                footer.innerHTML += `<a href="mailto:${email}" class="lki-cta-btn email">✉️ Sähköposti</a>`;
            }
            return;
        }

        // Company Card Link (Lue lisää)
        let companyName = company.publisher_name || company.nimi;
        let isPremium = (company.tyyppi === 'maksu' || company.tyyppi === 'paid' || tier === 'premium');

        const bId = company.business_id || company.business_rowid;
        if (bId && typeof window !== 'undefined' && Array.isArray(window.allCompanies)) {
            const found = window.allCompanies.find(c => c.id == bId || c.id === `company-${bId}` || c.business_id == bId);
            if (found) {
                companyName = found.nimi;
                isPremium = (found.tyyppi === 'maksu' || found.tyyppi === 'paid' || (found.package && found.package.toLowerCase() === 'premium'));
            }
        }

        // Company Card Link - only if companyName is available
        if (companyName && companyName.trim()) {
            const slug = slugify(companyName);
            const isInDist = window.location.pathname.includes('/dist/') || 
                             window.location.hostname === 'laukaainfo.fi' || 
                             window.location.hostname.includes('github.io');
            const distPrefix = isInDist ? '' : 'dist/';
            
            const cardUrl = isPremium 
                ? `${distPrefix}yritys/${slug}.html`
                : `yrityskortti.html?id=${slug}`;

            footer.innerHTML += `<a href="${cardUrl}" class="lki-cta-btn card">📄 Yrityssivulle</a>`;
        } else {
            // Show disabled button with message if no company name
            footer.innerHTML += `<span class="lki-cta-btn card" style="opacity: 0.5; cursor: not-allowed; text-decoration: none;">📄 Ei linkkiä määritetty</span>`;
        }

        // Local Feed Link (Laukaa-syöte)
        const rowid = String(company.business_id || company.business_rowid || company.id).replace('company-', '');
        footer.innerHTML += `<a href="https://laukaainfo.fi/?feed=open&rowid=${rowid}" target="_blank" class="lki-cta-btn feed">📱 Syöte</a>`;

        // WhatsApp
        const wa = company.whatsapp || (company.puhelin && tier !== 'perus' ? company.puhelin : '');
        if (wa && wa !== '-' && wa !== '0') {
            const waNum = wa.replace(/[^0-9]/g, '');
            const url = waNum.startsWith('http') ? waNum : `https://wa.me/${waNum}`;
            footer.innerHTML += `<a href="${url}" target="_blank" class="lki-cta-btn whatsapp">💬 WhatsApp</a>`;
        }

        // Email
        const email = company.email || '';
        if (email && email !== '-') {
            footer.innerHTML += `<a href="mailto:${email}" class="lki-cta-btn email">✉️ Sähköposti</a>`;
        }

        // Phone (Soita) - Mobile only
        const phone = company.puhelin || company.phone || '';
        if (phone && phone !== '-' && phone !== '') {
            const phoneNum = phone.replace(/[^0-9+]/g, '');
            footer.innerHTML += `<a href="tel:${phoneNum}" class="lki-cta-btn phone desktop-hide">📞 Soita</a>`;
        }

        // Website
        const web = company.nettisivu || company.website || company.website_url || '';
        if (web && web !== '-' && web !== '') {
            const url = web.startsWith('http') ? web : `http://${web}`;
            footer.innerHTML += `<a href="${url}" target="_blank" class="lki-cta-btn website">🌐 Verkkosivut</a>`;
        }

        // Facebook
        const fb = company.facebook_url || company.facebook || '';
        if (fb && fb !== '-') {
            const url = fb.startsWith('http') ? fb : `https://${fb}`;
            footer.innerHTML += `<a href="${url}" target="_blank" class="lki-cta-btn facebook" style="background:#1877F2;color:white;border-color:#1877F2;">f Facebook</a>`;
        }

        // Instagram
        const ig = company.instagram_url || company.instagram || '';
        if (ig && ig !== '-') {
            const url = ig.startsWith('http') ? ig : `https://${ig}`;
            footer.innerHTML += `<a href="${url}" target="_blank" class="lki-cta-btn instagram" style="background:#E1306C;color:white;border-color:#E1306C;">📸 Instagram</a>`;
        }
    }

    return {
        open: open,
        close: close
    };
})();
