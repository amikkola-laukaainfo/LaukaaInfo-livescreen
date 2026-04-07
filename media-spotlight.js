// media-spotlight.js
(async () => {
    const wrapper = document.getElementById('media-gallery-wrapper');
    if (!wrapper) return;

    // 1️⃣ Fetch feed data
    const feedEl = document.getElementById('homepage-feed');
    // Fallback URL if we are on the standalone gallery page
    const feedUrl = feedEl?.dataset.feedSrc || 'https://www.mediazoo.fi/laukaainfo-web/api.php';
    let feedItems = [];
    if (feedUrl) {
        try {
            const resp = await fetch(`${feedUrl}${feedUrl.includes('?') ? '&' : '?'}ts=${Date.now()}`);
            const json = await resp.json();
            feedItems = (json.data || []).slice(0, 24); // Show more items on standalone page
        } catch (e) {
            console.error('Media Spotlight – feed fetch error:', e);
        }
    }

    // 2️⃣ Load companies data
    let companies = [];
    try {
        const resp = await fetch('companies_data.json');
        const json = await resp.json();
        companies = json.companies || [];
    } catch (e) {
        console.error('Media Spotlight – companies fetch error:', e);
    }

    // 3️⃣ Helper to create a slide
    const createSlide = ({src, type = 'image', link, sourceLabel}) => {
        const slide = document.createElement('div');
        slide.className = 'swiper-slide';
        slide.title = `Avaa ${sourceLabel}`;
        slide.onclick = () => window.open(link, '_blank');

        if (type === 'video') {
            slide.innerHTML = `<video src="${src}" muted autoplay loop playsinline></video>`;
        } else {
            slide.innerHTML = `<img src="${src}" alt="${sourceLabel}">`;
        }
        // badge overlay
        const badge = document.createElement('div');
        badge.className = 'media-source-badge';
        badge.textContent = sourceLabel;
        slide.appendChild(badge);
        return slide;
    };

    // 4️⃣ Gather media objects (max 12)
    const media = [];
    // From feed items – expect `media` array or `image`
    feedItems.forEach(item => {
        if (item.media && Array.isArray(item.media)) {
            item.media.forEach(m => {
                if (m.url) {
                    media.push({
                        src: m.url,
                        type: m.type || 'image',
                        link: item.link || '#',
                        sourceLabel: 'Feed'
                    });
                }
            });
        } else if (item.image) {
            media.push({
                src: item.image,
                type: 'image',
                link: item.link || '#',
                sourceLabel: 'Feed'
            });
        }
    });
    // From companies – prefer logo, then first media entry
    companies.forEach(comp => {
        if (comp.logo && comp.logo !== '-') {
            media.push({
                src: comp.logo,
                type: 'image',
                link: `yrityskortti.html?id=${encodeURIComponent(comp.nimi)}`,
                sourceLabel: 'Yritys'
            });
        } else if (comp.media && comp.media.length) {
            const m = comp.media[0];
            if (m.url) {
                media.push({
                    src: m.url,
                    type: m.type || 'image',
                    link: `yrityskortti.html?id=${encodeURIComponent(comp.nimi)}`,
                    sourceLabel: 'Yritys'
                });
            }
        }
    });

    const selected = media.slice(0, 48);
    selected.forEach(item => wrapper.appendChild(createSlide(item)));

    // 5️⃣ Initialise Swiper (already loaded via CDN)
    new Swiper('.media-gallery', {
        slidesPerView: 3,
        spaceBetween: 10,
        navigation: {
            nextEl: '.swiper-button-next',
            prevEl: '.swiper-button-prev',
        },
        breakpoints: {
            0: { slidesPerView: 1 },
            768: { slidesPerView: 3 },
        },
        loop: true,
        autoplay: { delay: 5000, disableOnInteraction: false },
    });
})();
