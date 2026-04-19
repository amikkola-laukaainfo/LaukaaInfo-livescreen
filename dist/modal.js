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
                            <div class="lki-info-item"><span>📍</span> <span id="lki-modal-address">Laukaa</span></div>
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
        
        if (isSlim && company.id) {
            try {
                // Lisätään kevyt latausilmaisin kuvaukseen tai muuhun sopivaan paikkaan
                const descEl = document.getElementById('lki-modal-description');
                const originalDesc = descEl.innerHTML;
                descEl.innerHTML += '<div class="lki-loading-dots" style="margin-top:10px; opacity:0.6; font-style:italic;">Ladataan lisätietoja...</div>';

                const dataSourceUrl = 'https://www.mediazoo.fi/laukaainfo-web/get_companies.php';
                const response = await fetch(`${dataSourceUrl}?id=${encodeURIComponent(company.id)}&t=${Date.now()}`);
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
                    
                    // Renderöidään uudelleen täysillä tiedoilla
                    renderContent(company);
                }
            } catch (error) {
                console.error("Virhe ladattaessa lisätietoja:", error);
            }
        }
    }

    function renderContent(company) {
        const package = (company.package || company.taso || 'perus').toLowerCase();
        const container = document.getElementById('lki-modal-container');
        
        // Tier styles
        container.className = 'lki-modal-container ' + package;
        
        // Badge
        const badgeContainer = document.getElementById('lki-modal-badge-container');
        if (package === 'premium') {
            badgeContainer.innerHTML = '<span class="lki-badge premium">PREMIUM JYVÄSKYLÄ / LAUKAA</span>';
        } else if (package === 'pro') {
            badgeContainer.innerHTML = '<span class="lki-badge pro">SUOSITELTU</span>';
        } else {
            badgeContainer.innerHTML = '';
        }

        if (company.service_mode === 'SERVICE_AREA') {
            badgeContainer.innerHTML += '<span class="lki-badge service-area" style="background: #fff3e0; color: #e65100; border: 1px solid #ffccbc;">🟠 PALVELEE ALUEELLA</span>';
        }

        // Basic Info
        document.getElementById('lki-modal-title').textContent = company.nimi;
        document.getElementById('lki-modal-category').textContent = company.kategoria || company.category || '';
        
        // Use full description if available, otherwise fallback to mainoslause
        const rawDescription = company.esittely || company.description || company.mainoslause || '';
        document.getElementById('lki-modal-description').textContent = rawDescription.replace(/@@/g, '');
        document.getElementById('lki-modal-address').textContent = company.osoite || 'Laukaa';
        
        const phone = company.puhelin || company.phone || '';
        const phoneItem = document.getElementById('lki-modal-phone-item');
        if (phone && phone !== '-') {
            document.getElementById('lki-modal-phone').textContent = phone;
            phoneItem.style.display = 'flex';
        } else {
            phoneItem.style.display = 'none';
        }

        const email = company.email || '';
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

        // Media Slider
        renderSlider(company, package);

        // CTAs
        renderCTAs(company, package);
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

    function renderSlider(company, package) {
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

        // If no media, use logo or default
        if (mediaItems.length === 0) {
            const logo = company.logo && company.logo !== '-' ? company.logo : 'logo.png';
            mediaItems.push({ type: 'image', url: logo });
        }

        // Generate slides
        mediaItems.forEach(item => {
            const slide = document.createElement('div');
            slide.className = 'swiper-slide';

            if (item.type === 'video') {
                const videoUrl = item.url;
                if (videoUrl.includes('youtube.com/embed/')) {
                    // Muted autoplay parameter for premium
                    const autoplay = (package === 'premium') ? '&autoplay=1&mute=1' : '';
                    slide.innerHTML = `<iframe src="${videoUrl}?rel=0${autoplay}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
                } else if (videoUrl.endsWith('.mp4')) {
                    slide.innerHTML = `<video src="${videoUrl}" controls ${package === 'premium' ? 'autoplay muted' : ''}></video>`;
                } else {
                    slide.innerHTML = `<iframe src="${videoUrl}" allowfullscreen></iframe>`;
                }
            } else {
                slide.innerHTML = `<img src="${item.url}" alt="${company.nimi}" loading="lazy">`;
            }
            wrapper.appendChild(slide);
        });

        // Initialize Swiper
        if (swiperInstance) {
            swiperInstance.destroy(true, true);
        }

        // Wait for DOM to catch up
        setTimeout(() => {
            swiperInstance = new Swiper('#lki-modal-swiper', {
                pagination: { el: '.swiper-pagination', clickable: true },
                navigation: { nextEl: '.swiper-button-next', prevEl: '.swiper-button-prev' },
                loop: mediaItems.length > 1,
                autoplay: (package === 'premium' && mediaItems.length > 1) ? { delay: 5000 } : false,
            });
        }, 50);
    }

    function renderCTAs(company, package) {
        const footer = document.getElementById('lki-modal-footer');
        footer.innerHTML = '';

        // Company Card Link (Lue lisää)
        const slug = slugify(company.nimi);
        const isPremium = (company.tyyppi === 'maksu' || company.tyyppi === 'paid' || package === 'premium');
        const isInDist = window.location.pathname.includes('/dist/') || 
                         window.location.hostname === 'laukaainfo.fi' || 
                         window.location.hostname.includes('github.io');
        const distPrefix = isInDist ? '' : 'dist/';
        
        const cardUrl = isPremium 
            ? `${distPrefix}yritys/${slug}.html`
            : `yrityskortti.html?id=${slug}`;

        footer.innerHTML += `<a href="${cardUrl}" class="lki-cta-btn card">📄 Yrityssivulle</a>`;

        // WhatsApp
        const wa = company.whatsapp || (company.puhelin && package !== 'perus' ? company.puhelin : '');
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
        const web = company.nettisivu || company.website || '';
        if (web && web !== '-' && web !== '') {
            const url = web.startsWith('http') ? web : `http://${web}`;
            footer.innerHTML += `<a href="${url}" target="_blank" class="lki-cta-btn website">🌐 Verkkosivut</a>`;
        }
    }

    return {
        open: open,
        close: close
    };
})();
