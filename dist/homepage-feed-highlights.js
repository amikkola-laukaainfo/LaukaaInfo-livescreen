(function () {
    'use strict';

    const root = document.getElementById('homepage-feed-highlights');
    if (!root) return;

    const feedEl = document.getElementById('homepage-feed');
    const feedUrl = feedEl?.dataset.feedSrc || 'https://www.mediazoo.fi/laukaainfo-web/api.php';
    const maxHighlights = 3;
    const placeholderImage = 'kuvia/syote.jpg';

    const typeLabels = {
        event: 'Tapahtuma',
        business: 'Yritys',
        community: 'Yhteisö',
        story: 'Tarina',
        offer: 'Tarjous',
        notice: 'Ilmoitus',
        video: 'Video',
        pikkuilmoitus: 'Ajankohtaista',
        kohde: 'Kohde'
    };

    function escapeHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function shuffleArray(array) {
        const cloned = array.slice();
        for (let i = cloned.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [cloned[i], cloned[j]] = [cloned[j], cloned[i]];
        }
        return cloned;
    }

    async function loadKohdekortit() {
        try {
            const response = await fetch(`kohdekortit/kohteet.json?ts=${Date.now()}`);
            if (!response.ok) {
                throw new Error(`Kohdekortit haussa HTTP ${response.status}`);
            }
            const json = await response.json();
            return Array.isArray(json) ? json.filter(item => item && item.status !== 'inactive') : [];
        } catch (err) {
            console.warn('Kohdekorttien lataus epäonnistui:', err);
            return [];
        }
    }

    function normalizeKohdeEntity(entity) {
        return {
            source: 'kohde',
            id: entity.id,
            title: entity.name,
            description: entity.shortDescription || entity.description || '',
            image: Array.isArray(entity.images) && entity.images.length ? entity.images[0] : placeholderImage,
            type: 'kohde',
            targetUrl: `kohdekortti.html?id=${encodeURIComponent(entity.id)}`
        };
    }

    function truncate(text, maxLength) {
        if (!text) return '';
        text = text.trim();
        if (text.length <= maxLength) return escapeHtml(text);
        return escapeHtml(text.slice(0, maxLength).replace(/\s+$/, '')) + '…';
    }

    function createCard(item) {
        const title = escapeHtml(item.title || item.name || 'Laukaa-syöte');
        const desc = truncate(item.description || item.summary || '', 110);
        const type = escapeHtml(typeLabels[item.type] || 'Julkaisu');
        const targetUrl = item.targetUrl || (item.id ? `index.html?item=${encodeURIComponent(item.id)}&feed=open` : 'index.html?feed=open');

        const card = document.createElement('article');

        if (item.type === 'event') {
            card.className = 'homepage-feed-highlights__card homepage-feed-highlights__card--event-text';
            
            // Yritetään poimia pvm, API voi palauttaa dateStr tai start_time
            let dateStr = '—';
            if (item.dateStr) {
                dateStr = item.dateStr;
            } else if (item.start_time) {
                try { dateStr = new Date(item.start_time).toLocaleDateString('fi-FI'); } catch (e) {}
            }

            card.innerHTML = `
                <a href="${targetUrl}" class="homepage-feed-highlights__card-link">
                    <div class="homepage-feed-highlights__card-body homepage-feed-highlights__card-body--event-text">
                        <div class="homepage-feed-highlights__event-date-badge">
                            <span class="homepage-feed-highlights__event-date-icon">📅</span>
                            <span class="homepage-feed-highlights__event-date-text">${escapeHtml(dateStr)}</span>
                            <span class="homepage-feed-highlights__badge homepage-feed-highlights__badge--event">${type}</span>
                        </div>
                        <h3 class="homepage-feed-highlights__card-title">${title}</h3>
                        <p class="homepage-feed-highlights__card-desc">${desc}</p>
                        <span class="homepage-feed-highlights__card-cta">Näytä koko tapahtuma »</span>
                    </div>
                </a>
            `;
        } else {
            card.className = 'homepage-feed-highlights__card';
            const img = item.image || (item.media && Array.isArray(item.media) ? item.media.find(m => m.type === 'image' && m.url)?.url : null) || placeholderImage;
            card.innerHTML = `
                <a href="${targetUrl}" class="homepage-feed-highlights__card-link">
                    <div class="homepage-feed-highlights__card-media" style="background-image:url('${String(img).replace(/'/g, "\\'")}');"></div>
                    <div class="homepage-feed-highlights__card-body">
                        <span class="homepage-feed-highlights__badge">${type}</span>
                        <h3 class="homepage-feed-highlights__card-title">${title}</h3>
                        <p class="homepage-feed-highlights__card-desc">${desc}</p>
                        <span class="homepage-feed-highlights__card-cta">Näytä koko nosto »</span>
                    </div>
                </a>
            `;
        }
        return card;
    }

    function renderHighlights(items) {
        root.innerHTML = '';
        if (!items.length) {
            root.innerHTML = '<div class="homepage-feed-highlights__empty">Ei nostoja saatavilla juuri nyt.</div>';
            return;
        }

        const cards = document.createElement('div');
        cards.className = 'homepage-feed-highlights__cards';

        items.forEach(item => cards.appendChild(createCard(item)));
        root.appendChild(cards);

        const action = document.createElement('div');
        action.className = 'homepage-feed-highlights__footer';
        action.innerHTML = `
            <div style="display:flex; justify-content:center; gap:1rem; flex-wrap:wrap; width: 100%;">
                <button type="button" class="btn-radar homepage-feed-highlights__button">Avaa koko syöte</button>
                <a href="kohdekortit.html" class="btn-radar" style="text-decoration:none; display:inline-flex; align-items:center; justify-content:center; gap:0.5rem; background: linear-gradient(135deg, #f5a623, #e09010); color: #000; box-shadow: 0 4px 12px rgba(245, 166, 35, 0.35);">📅 Kalenteri</a>
            </div>
        `;
        root.appendChild(action);

        const feedBtn = document.getElementById('toggle-feed-btn');
        const openButton = action.querySelector('.homepage-feed-highlights__button');
        if (openButton) {
            openButton.addEventListener('click', () => {
                if (feedBtn && feedBtn.classList.contains('closed')) {
                    feedBtn.click();
                }
                const content = document.getElementById('feed-accordion-content');
                if (content) {
                    content.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            });
        }
    }

    async function loadHighlights() {
        root.innerHTML = '<div class="homepage-feed-highlights__loading">Ladataan nostoja…</div>';

        try {
            const response = await fetch(`${feedUrl}${feedUrl.includes('?') ? '&' : '?'}ts=${Date.now()}`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const json = await response.json();
            const items = Array.isArray(json) ? json : (json.data || []);
            if (!items || !items.length) {
                renderHighlights([]);
                return;
            }

            const promoted = items.filter(i => i.is_promoted || i.type === 'offer' || i.type === 'notice');
            const otherFeedItems = items.filter(i => !promoted.includes(i));
            const kohteet = await loadKohdekortit();
            const normalizedKohteet = shuffleArray(kohteet).map(normalizeKohdeEntity);

            const includeKohde = normalizedKohteet.length > 0 && Math.random() < 0.65;
            const kohdeCount = includeKohde ? Math.min(1 + Math.floor(Math.random() * 2), maxHighlights - 1) : 0;
            const feedCount = maxHighlights - kohdeCount;

            const selectedFeed = shuffleArray(promoted.concat(otherFeedItems)).slice(0, Math.max(1, feedCount));
            const selectedKohde = normalizedKohteet.slice(0, kohdeCount);
            const selected = shuffleArray([...selectedFeed, ...selectedKohde]).slice(0, maxHighlights);

            renderHighlights(selected);
        } catch (err) {
            console.error('Homepage feed highlights load failed:', err);
            root.innerHTML = '<div class="homepage-feed-highlights__error">Nostojen lataus epäonnistui. Yritä hetken kuluttua uudelleen.</div>';
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadHighlights);
    } else {
        loadHighlights();
    }
})();
