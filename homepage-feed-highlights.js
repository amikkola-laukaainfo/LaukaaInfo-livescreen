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
        pikkuilmoitus: 'Ajankohtaista'
    };

    function escapeHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function truncate(text, maxLength) {
        if (!text) return '';
        text = text.trim();
        if (text.length <= maxLength) return escapeHtml(text);
        return escapeHtml(text.slice(0, maxLength).replace(/\s+$/, '')) + '…';
    }

    function createCard(item) {
        const img = item.image || (item.media && Array.isArray(item.media) ? item.media.find(m => m.type === 'image' && m.url)?.url : null) || placeholderImage;
        const title = escapeHtml(item.title || item.name || 'Laukaa-syöte');
        const desc = truncate(item.description || item.summary || '', 110);
        const type = escapeHtml(typeLabels[item.type] || 'Julkaisu');
        const targetUrl = item.id ? `index.html?item=${encodeURIComponent(item.id)}&feed=open` : 'index.html?feed=open';

        const card = document.createElement('article');
        card.className = 'homepage-feed-highlights__card';

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
        action.innerHTML = '<button type="button" class="btn-radar homepage-feed-highlights__button">Avaa koko syöte</button>';
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
            const selected = (promoted.length ? promoted : items).slice(0, maxHighlights);
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
