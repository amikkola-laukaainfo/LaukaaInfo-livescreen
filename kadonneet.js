document.addEventListener('DOMContentLoaded', () => {
    fetchBloggerFeed();
});

// LostReFound iframe ohjaustoiminnot
window.reloadLostnfoundFrame = function() {
    const frame = document.getElementById('lostnfound-iframe');
    const loader = document.getElementById('iframe-loader');
    if (frame) {
        if (loader) {
            loader.style.display = 'flex';
            loader.style.opacity = '1';
        }
        // Pakotetaan uudelleenlataus
        const baseSrc = 'https://lostnfound-f0d25.web.app/';
        frame.src = baseSrc + (baseSrc.includes('?') ? '&' : '?') + 't=' + Date.now();
    }
};

window.handleFrameLoad = function() {
    const loader = document.getElementById('iframe-loader');
    if (loader) {
        loader.style.opacity = '0';
        setTimeout(() => {
            loader.style.display = 'none';
        }, 300);
    }
};

function fetchBloggerFeed() {
    // Käytetään Bloggerin tukemaa JSONP-mekanismia ("json-in-script" ja callback)
    const blogId = '4420177675488772919';
    const script = document.createElement('script');
    script.src = `https://www.blogger.com/feeds/${blogId}/posts/default?alt=json-in-script&callback=renderBloggerFeed&max-results=6`;
    script.onerror = () => {
        const container = document.getElementById('blogger-feed');
        if (container) {
            container.innerHTML = '<p class="kn-empty-text">Arkistoilmoitusten haku ei onnistunut juuri nyt. Voit tarkastella tuoreimpia ilmoituksia suoraan yläpuolen LostReFound-palvelusta.</p>';
        }
    };
    document.body.appendChild(script);
}

// Globaali funktio Bloggerin palauttaman datan käsittelyyn
window.renderBloggerFeed = function(data) {
    const container = document.getElementById('blogger-feed');
    if (!container) return;

    const entries = data.feed?.entry || [];
    container.innerHTML = '';

    if (entries.length === 0) {
        container.innerHTML = '<p class="kn-empty-text">Ei vanhempia arkistoituja ilmoituksia.</p>';
        return;
    }

    const grid = document.createElement('div');
    grid.className = 'kn-archive-grid';

    entries.slice(0, 6).forEach(entry => {
        const title = entry.title?.$t || 'Ilmoitus';
        let content = entry.content ? entry.content.$t : (entry.summary ? entry.summary.$t : '');

        // Etsitään ensimmäinen kuva
        let imageUrl = '';
        const imgMatch = content.match(/<img[^>]+src="([^">]+)"/);
        if (imgMatch) {
            imageUrl = imgMatch[1];
        }

        // Puhdistetaan tekstisisältö
        let rawText = content.replace(/<[^>]*>?/gm, '').trim();
        if (rawText.length > 140) {
            rawText = rawText.substring(0, 140) + '...';
        }

        // Haetaan linkki postaukseen
        let link = '#';
        if (entry.link) {
            const altLink = entry.link.find(l => l.rel === 'alternate');
            if (altLink) link = altLink.href;
        }

        // Päivämäärä
        const publishedDate = entry.published?.$t ? new Date(entry.published.$t) : new Date();
        const dateStr = publishedDate.toLocaleDateString('fi-FI');

        const postEl = document.createElement('article');
        postEl.className = 'kn-archive-card';
        postEl.innerHTML = `
            ${imageUrl ? `<div class="kn-archive-img-wrap"><img src="${imageUrl}" class="kn-archive-img" loading="lazy" alt="${title}"></div>` : ''}
            <div class="kn-archive-body">
                <div class="kn-archive-meta">
                    <span class="kn-badge-date">📅 ${dateStr}</span>
                    <span class="kn-badge-source">Tiedote</span>
                </div>
                <h4 class="kn-archive-title"><a href="${link}" target="_blank" rel="noopener noreferrer">${title}</a></h4>
                <p class="kn-archive-desc">${rawText}</p>
                <a href="${link}" target="_blank" rel="noopener noreferrer" class="kn-archive-link">Lue koko ilmoitus &rarr;</a>
            </div>
        `;

        grid.appendChild(postEl);
    });

    container.appendChild(grid);
};
