document.addEventListener('DOMContentLoaded', () => {
    fetchBloggerFeed();
});

function fetchBloggerFeed() {
    // Käytetään Bloggerin tukemaa JSONP-mekanismia ("json-in-script" ja callback)
    // Tällä ohitetaan Fetch API:n CORS-rajoitukset ja Service Workerin CORS-estot lähes kaikilla selaimilla.
    const blogId = '7148270853674792022';
    const script = document.createElement('script');
    script.src = `https://www.blogger.com/feeds/${blogId}/posts/default?alt=json-in-script&callback=renderBloggerFeed`;
    script.onerror = () => {
        document.getElementById('blogger-feed').innerHTML = '<p>Uutisten haku epäonnistui.</p>';
    };
    document.body.appendChild(script);
}

// Globaali funktio Bloggerin palauttaman datan käsittelyyn
function renderBloggerFeed(data) {
    const container = document.getElementById('blogger-feed');
    const entries = data.feed.entry || [];

    container.innerHTML = '';

    if (entries.length === 0) {
        container.innerHTML = '<p>Ei julkaisuja.</p>';
        return;
    }

    entries.slice(0, 10).forEach(entry => {
        const title = entry.title.$t;
        let content = entry.content ? entry.content.$t : (entry.summary ? entry.summary.$t : '');

        // Extract the first image from the content if it exists
        let imageUrl = '';
        const imgMatch = content.match(/<img[^>]+src="([^">]+)"/);
        if (imgMatch) {
            imageUrl = imgMatch[1];
        }

        // Strip HTML to get a clean description snippet
        let rawText = content.replace(/<[^>]*>?/gm, '').trim();
        // Optional: Limit length
        if (rawText.length > 200) {
            rawText = rawText.substring(0, 200) + '...';
        }

        // Get link to the post
        let link = '#';
        if (entry.link) {
            const altLink = entry.link.find(l => l.rel === 'alternate');
            if (altLink) link = altLink.href;
        }

        // Format date
        const publishedDate = new Date(entry.published.$t);
        const dateStr = publishedDate.toLocaleDateString('fi-FI');

        const postEl = document.createElement('div');
        postEl.className = 'rss-item'; // Käytetään samaa tyyliä kuin etusivulla
        postEl.innerHTML = `
            ${imageUrl ? `<img src="${imageUrl}" class="rss-item-image" loading="lazy" alt="Kuva uutiseen">` : ''}
            <div class="rss-meta"><span class="date">📅 ${dateStr}</span></div>
            <h3><a href="${link}" target="_blank">${title}</a></h3>
            <p class="description">${rawText}</p>
        `;

        container.appendChild(postEl);
    });
}
