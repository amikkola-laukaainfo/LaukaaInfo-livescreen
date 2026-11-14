// media-spotlight.js
(async () => {
    const wrapper = document.getElementById('media-gallery-wrapper');
    if (!wrapper) return;

    // 1️⃣ Fetch feed data from Supabase posts table (uusimmat hyväksytyt julkaisut)
    const SUPABASE_URL = 'https://duxluwyqxvbmkkjzuzkz.supabase.co';
    const SUPABASE_KEY = 'sb_publishable_HgfWyipuSO7gvsVUR1smNQ_aXox2OPu';
    let feedItems = [];
    try {
        const resp = await fetch(
            `${SUPABASE_URL}/rest/v1/posts?select=*&status=eq.APPROVED&type=neq.pikkuilmoitus&order=is_promoted.desc,published_at.desc&limit=24`,
            { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
        );
        if (resp.ok) {
            const posts = await resp.json();
            feedItems = (posts || []).map(p => {
                let img = p.image_url || p.image;
                if (!img && p.video_id) {
                    img = `https://img.youtube.com/vi/${p.video_id}/hqdefault.jpg`;
                }
                return { ...p, image: img };
            });
        }
    } catch (e) {
        console.error('Media Spotlight - Supabase feed fetch error:', e);
    }

    // 2️⃣ Load companies data
    let companies = [];
    try {
        const resp = await fetch('companies_data.json');
        const json = await resp.json();
        companies = json.companies || json.results || [];
    } catch (e) {
        console.error('Media Spotlight – companies fetch error:', e);
    }

    // 3️⃣ Helper to create a slide
    const createSlide = ({src, type = 'image', link, sourceLabel}) => {
        const slide = document.createElement('div');
        slide.className = 'swiper-slide';
        
        const anchor = document.createElement('a');
        anchor.href = link;
        anchor.target = '_blank';
        anchor.className = 'media-gallery-link';
        anchor.title = `Avaa ${sourceLabel}`;

        if (type === 'video') {
            anchor.innerHTML = `<video src="${src}" muted autoplay loop playsinline></video>`;
        } else {
            anchor.innerHTML = `<img src="${src}" alt="${sourceLabel}" loading="lazy" onerror="this.closest('.swiper-slide').remove()">`;
        }
        
        // badge overlay
        const badge = document.createElement('div');
        badge.className = 'media-source-badge';
        badge.textContent = sourceLabel;
        anchor.appendChild(badge);
        
        slide.appendChild(anchor);
        return slide;
    };

    // Slugify helper (identical to script.js)
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

    // 4️⃣ Gather media objects (max 48)
    const media = [];
    // From feed items – expect `media` array or `image`
    feedItems.forEach(item => {
        const itemLink = `index.html?item=${item.id}&feed=open`;
        const sourceLabel = item.publisher || item.publisher_name || item.org_name || 'Laukaa';
        if (item.media && Array.isArray(item.media) && item.media.length > 0) {
            item.media.forEach(m => {
                if (m && m.url) {
                    media.push({
                        src: m.url,
                        type: m.type || 'image',
                        link: itemLink,
                        sourceLabel: sourceLabel
                    });
                }
            });
        } else if (item.image) {
            media.push({
                src: item.image,
                type: 'image',
                link: itemLink,
                sourceLabel: sourceLabel
            });
        }
    });

    // From companies – prefer logo, then media, then images
    companies.forEach(comp => {
        const companyLink = `yrityskortti.html?id=${slugify(comp.nimi)}`;
        const sourceLabel = comp.nimi || 'Yritys';
        let foundImg = null;
        if (comp.logo && comp.logo !== '-' && comp.logo.trim() !== '') {
            foundImg = comp.logo;
        } else if (comp.media && comp.media.length) {
            const m = comp.media.find(x => x && x.url) || comp.media[0];
            if (m && m.url) foundImg = m.url;
        } else if (comp.images && comp.images.length) {
            foundImg = comp.images[0];
        }

        if (foundImg) {
            media.push({
                src: foundImg,
                type: 'image',
                link: companyLink,
                sourceLabel: sourceLabel
            });
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
