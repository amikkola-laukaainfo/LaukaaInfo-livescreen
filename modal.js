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
                    </div>
                    <div class="lki-modal-footer" id="lki-modal-footer"></div>
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

    function open(company) {
        init();
        if (!company) return;

        console.log("Opening LkiModal for:", company.nimi, company);

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

        // Basic Info
        document.getElementById('lki-modal-title').textContent = company.nimi;
        document.getElementById('lki-modal-category').textContent = company.kategoria || company.category || '';
        document.getElementById('lki-modal-description').textContent = company.esittely || company.description || company.mainoslause || '';
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

        // Media Slider
        renderSlider(company, package);

        // CTAs
        renderCTAs(company, package);

        // Show
        modalOverlay.classList.add('active');
        document.body.style.overflow = 'hidden';
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

        footer.innerHTML += `<a href="${cardUrl}" class="lki-cta-btn card">📄 Katso sivu</a>`;

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
