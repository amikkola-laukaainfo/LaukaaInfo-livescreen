/**
 * generate_tietokortit.js
 *
 * Generoi staattisen, hakukoneystävällisen tietokortit.html -nostosivun
 * Supabase posts-taulun tietokorttien (type: INFO / knowledge / article) pohjalta.
 *
 * Ajetaan automaattisesti osana build.js:ää, jotta Google löytää kaikki
 * uudet tietokorttilinkit, otsikot, alkukappaleet ja julkaisuajankohdat.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const SUPABASE_URL = 'https://duxluwyqxvbmkkjzuzkz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_HgfWyipuSO7gvsVUR1smNQ_aXox2OPu';

function fetchJson(endpoint) {
    return new Promise((resolve) => {
        const options = {
            hostname: new URL(SUPABASE_URL).hostname,
            path: endpoint,
            method: 'GET',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': 'Bearer ' + SUPABASE_KEY,
                'Accept': 'application/json'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve(Array.isArray(parsed) ? parsed : []);
                } catch (e) {
                    console.warn(`  ⚠ JSON-parsintavirhe (${endpoint}):`, e.message);
                    resolve([]);
                }
            });
        });

        req.on('error', (err) => {
            console.warn(`  ⚠ Yhteysvirhe (${endpoint}):`, err.message);
            resolve([]);
        });
        req.setTimeout(8000, () => {
            req.destroy();
            resolve([]);
        });
        req.end();
    });
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function stripMarkdown(text) {
    if (!text) return '';
    return String(text)
        .replace(/^#+\s+/gm, '')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/[`>~]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function buildExcerpt(post) {
    const rawDesc = (post.description || '').trim();
    const rawContent = (post.content || '').trim();

    let source = rawDesc;
    if (!source && rawContent) {
        // Poimitaan ensimmäinen varsinainen tekstikappale (ei pelkkä otsikkorivi)
        const paragraphs = rawContent
            .split(/\n\s*\n/)
            .map(p => p.trim())
            .filter(p => p && !p.startsWith('#'));
        source = paragraphs[0] || rawContent;
    }

    const clean = stripMarkdown(source).replace(/\s*Kuva:\s*.*$/i, '').trim();
    if (clean.length <= 185) return clean;
    return clean.slice(0, 182).replace(/\s+\S*$/, '') + '…';
}

function formatFinnishDate(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return '';
    const day = d.getDate();
    const month = d.getMonth() + 1;
    const year = d.getFullYear();
    return `${day}.${month}.${year}`;
}

function getIsoDate(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().split('T')[0];
}

async function generateTietokortitPage() {
    console.log('===================================================');
    console.log('LaukaaInfo: Generoidaan tietokortit.html nostosivu');
    console.log('===================================================');

    const [posts, places] = await Promise.all([
        fetchJson('/rest/v1/posts?select=id,type,title,description,content,image_url,created_at,published_at,updated_at,place_id,municipality,publisher_name,visibility,status,post_attachments(type,url),post_media(media_type,url)&type=in.(INFO,knowledge,article)&order=published_at.desc.nullslast,created_at.desc&limit=200'),
        fetchJson('/rest/v1/places?select=id,place_id,name,canonical_name&limit=500')
    ]);

    const placeMap = new Map();
    places.forEach(p => {
        if (p.place_id) placeMap.set(p.place_id, p.name || p.canonical_name || p.place_id);
        if (p.id) placeMap.set(p.id, p.name || p.canonical_name || p.id);
    });

    const publicPosts = posts.filter(p => {
        const vis = (p.visibility || 'public').toLowerCase();
        const st = (p.status || 'published').toLowerCase();
        return vis === 'public' && st !== 'draft' && st !== 'archived' && p.id && p.title;
    });

    console.log(`  ✓ Löydettiin ${publicPosts.length} julkista tietokorttia`);

    const cardsHtml = publicPosts.map(post => {
        const attImg = Array.isArray(post.post_attachments)
            ? post.post_attachments.find(a => a && a.type === 'image' && a.url)?.url
            : null;
        const mediaImg = Array.isArray(post.post_media)
            ? post.post_media.find(m => m && m.media_type === 'image' && m.url)?.url
            : null;
        const imgUrl = attImg || mediaImg || post.image_url || '';

        const dateRaw = post.published_at || post.created_at || '';
        const fiDate = formatFinnishDate(dateRaw);
        const isoDate = getIsoDate(dateRaw);
        const placeName = (post.place_id && placeMap.get(post.place_id)) || post.municipality || 'Laukaa';
        const excerpt = buildExcerpt(post);
        const cardUrl = `tietokortti.html?id=${encodeURIComponent(post.id)}`;

        const thumbHtml = imgUrl
            ? `<div class="tk-thumb"><img src="${escapeHtml(imgUrl)}" alt="${escapeHtml(post.title)}" loading="lazy" onerror="this.parentElement.classList.add('tk-thumb-fallback');this.remove()"></div>`
            : `<div class="tk-thumb tk-thumb-fallback"><span class="tk-thumb-icon">📖</span></div>`;

        return `
            <a class="tk-card" href="${cardUrl}">
                ${thumbHtml}
                <div class="tk-card-body">
                    <div class="tk-card-meta">
                        <span class="tk-badge">📖 Tietokortti</span>
                        <span class="tk-place">📍 ${escapeHtml(placeName)}</span>
                    </div>
                    <h2 class="tk-card-title">${escapeHtml(post.title)}</h2>
                    ${excerpt ? `<p class="tk-card-excerpt">${escapeHtml(excerpt)}</p>` : ''}
                    <div class="tk-card-footer">
                        ${fiDate ? `<time class="tk-date" datetime="${escapeHtml(isoDate)}">Julkaistu ${escapeHtml(fiDate)}</time>` : '<span class="tk-date">LaukaaInfo</span>'}
                        <span class="tk-read-more">Lue kortti →</span>
                    </div>
                </div>
            </a>`;
    }).join('\n');

    const jsonLdItems = publicPosts.map((post, idx) => ({
        '@type': 'ListItem',
        'position': idx + 1,
        'url': `https://laukaainfo.fi/tietokortti.html?id=${encodeURIComponent(post.id)}`,
        'name': post.title
    }));

    const jsonLd = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        'name': 'Tietokortit – LaukaaInfo',
        'description': 'Laukaan paikalliset tietokortit: historiaa, kohteita, hankkeita ja oppaita Laukaasta.',
        'url': 'https://laukaainfo.fi/tietokortit.html',
        'mainEntity': {
            '@type': 'ItemList',
            'numberOfItems': publicPosts.length,
            'itemListElement': jsonLdItems
        }
    });

    const updatedLabel = formatFinnishDate(new Date().toISOString());

    const html = `<!DOCTYPE html>
<html lang="fi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Tietokortit – Laukaan paikallistietoa ja oppaita | LaukaaInfo</title>

    <meta name="description" content="Selaa LaukaaInfon tietokortteja: paikkoihin ja ilmiöihin syventyvää paikallistietoa, historiaa ja ajankohtaisia oppaita Laukaasta.">
    <meta name="robots" content="index, follow">
    <link rel="canonical" href="https://laukaainfo.fi/tietokortit.html">

    <meta property="og:title" content="Tietokortit – LaukaaInfo">
    <meta property="og:description" content="Laukaan paikalliset tietokortit: historiaa, kohteita ja syventävää paikallistietoa.">
    <meta property="og:type" content="website">
    <meta property="og:url" content="https://laukaainfo.fi/tietokortit.html">
    <meta property="og:image" content="https://laukaainfo.fi/hero-kuva.webp">

    <link rel="icon" href="logo.png">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Outfit:wght@600;700;800&display=swap" rel="stylesheet">

    <script type="application/ld+json">${jsonLd}</script>

    <style>
        :root {
            --bg-page: #f8fafc;
            --surface: #ffffff;
            --surface-muted: #f1f5f9;
            --primary: #7c5539;
            --primary-light: #fbf7f2;
            --text-main: #0f172a;
            --text-muted: #475569;
            --text-light: #64748b;
            --border-color: #e2e8f0;
            --shadow-sm: 0 1px 3px rgba(15, 23, 42, 0.06);
            --shadow-md: 0 10px 24px rgba(15, 23, 42, 0.08);
        }

        * { box-sizing: border-box; margin: 0; padding: 0; }

        body {
            background-color: var(--bg-page);
            color: var(--text-main);
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            line-height: 1.55;
            -webkit-font-smoothing: antialiased;
        }

        .top-nav {
            position: sticky;
            top: 0;
            z-index: 50;
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(12px);
            border-bottom: 1px solid var(--border-color);
            padding: 0.75rem 1.5rem;
        }

        .nav-inner {
            max-width: 1180px;
            margin: 0 auto;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 1rem;
        }

        .brand-link {
            display: flex;
            align-items: center;
            gap: 0.6rem;
            text-decoration: none;
            color: var(--text-main);
            font-family: 'Outfit', sans-serif;
            font-weight: 700;
            font-size: 1.15rem;
        }

        .brand-logo {
            width: 32px;
            height: 32px;
            border-radius: 8px;
            object-fit: cover;
        }

        .nav-links {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            flex-wrap: wrap;
        }

        .nav-btn {
            text-decoration: none;
            color: var(--text-muted);
            font-size: 0.875rem;
            font-weight: 500;
            padding: 0.4rem 0.75rem;
            border-radius: 9999px;
            transition: background 0.15s, color 0.15s;
        }

        .nav-btn:hover {
            background: var(--surface-muted);
            color: var(--text-main);
        }

        .page-wrap {
            max-width: 1180px;
            margin: 0 auto;
            padding: 2rem 1.25rem 4rem;
        }

        .page-header {
            margin-bottom: 2rem;
            display: flex;
            flex-wrap: wrap;
            justify-content: space-between;
            align-items: flex-end;
            gap: 1rem;
            border-bottom: 1px solid var(--border-color);
            padding-bottom: 1.25rem;
        }

        .page-kicker {
            display: inline-block;
            font-size: 0.78rem;
            font-weight: 700;
            letter-spacing: 0.06em;
            text-transform: uppercase;
            color: var(--primary);
            background: var(--primary-light);
            padding: 0.25rem 0.7rem;
            border-radius: 9999px;
            margin-bottom: 0.6rem;
        }

        .page-title {
            font-family: 'Outfit', sans-serif;
            font-size: clamp(1.75rem, 3vw, 2.35rem);
            font-weight: 800;
            color: var(--text-main);
            line-height: 1.2;
        }

        .page-lead {
            color: var(--text-muted);
            margin-top: 0.45rem;
            max-width: 680px;
            font-size: 0.98rem;
        }

        .page-stats {
            font-size: 0.82rem;
            color: var(--text-light);
            text-align: right;
        }

        .tk-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
            gap: 1.25rem;
        }

        .tk-card {
            display: flex;
            flex-direction: column;
            background: var(--surface);
            border: 1px solid var(--border-color);
            border-radius: 16px;
            overflow: hidden;
            text-decoration: none;
            color: inherit;
            box-shadow: var(--shadow-sm);
            transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
        }

        .tk-card:hover {
            transform: translateY(-3px);
            box-shadow: var(--shadow-md);
            border-color: #cbd5e1;
        }

        .tk-thumb {
            width: 100%;
            aspect-ratio: 16 / 9;
            background: var(--surface-muted);
            overflow: hidden;
        }

        .tk-thumb img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: block;
            transition: transform 0.3s ease;
        }

        .tk-card:hover .tk-thumb img {
            transform: scale(1.03);
        }

        .tk-thumb-fallback {
            display: flex;
            align-items: center;
            justify-content: center;
            background: linear-gradient(135deg, #fbf7f2 0%, #e2e8f0 100%);
        }

        .tk-thumb-icon {
            font-size: 2.2rem;
        }

        .tk-card-body {
            padding: 1rem 1.1rem 1.1rem;
            display: flex;
            flex-direction: column;
            flex: 1;
        }

        .tk-card-meta {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 0.5rem;
            flex-wrap: wrap;
            margin-bottom: 0.55rem;
            font-size: 0.76rem;
        }

        .tk-badge {
            background: var(--primary-light);
            color: var(--primary);
            font-weight: 700;
            padding: 0.18rem 0.55rem;
            border-radius: 9999px;
        }

        .tk-place {
            color: var(--text-light);
            font-weight: 500;
        }

        .tk-card-title {
            font-family: 'Outfit', sans-serif;
            font-size: 1.08rem;
            font-weight: 700;
            line-height: 1.3;
            color: var(--text-main);
            margin-bottom: 0.5rem;
        }

        .tk-card-excerpt {
            font-size: 0.87rem;
            color: var(--text-muted);
            line-height: 1.5;
            margin-bottom: 0.9rem;
            display: -webkit-box;
            -webkit-line-clamp: 3;
            -webkit-box-orient: vertical;
            overflow: hidden;
        }

        .tk-card-footer {
            margin-top: auto;
            padding-top: 0.7rem;
            border-top: 1px solid var(--surface-muted);
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-size: 0.78rem;
        }

        .tk-date {
            color: var(--text-light);
        }

        .tk-read-more {
            color: var(--primary);
            font-weight: 600;
        }

        .empty-state {
            background: var(--surface);
            border: 1px dashed var(--border-color);
            border-radius: 16px;
            padding: 2.5rem;
            text-align: center;
            color: var(--text-muted);
        }

        footer {
            text-align: center;
            padding: 2rem 1rem;
            border-top: 1px solid var(--border-color);
            color: var(--text-light);
            font-size: 0.85rem;
            background: var(--surface);
        }

        footer a {
            color: var(--primary);
            text-decoration: none;
        }
    </style>
</head>
<body>
    <nav class="top-nav">
        <div class="nav-inner">
            <a href="index.html" class="brand-link">
                <img src="logo.png" alt="LaukaaInfo" class="brand-logo">
                <span>LaukaaInfo</span>
            </a>
            <div class="nav-links">
                <a href="index.html" class="nav-btn">Etusivu</a>
                <a href="alueet.html" class="nav-btn">Paikat</a>
                <a href="asiahaku.html" class="nav-btn">Teemat</a>
                <a href="ajankohtaista.html" class="nav-btn">Ajankohtaista</a>
                <a href="sitemap.xml" class="nav-btn">Sitemap</a>
            </div>
        </div>
    </nav>

    <main class="page-wrap">
        <header class="page-header">
            <div>
                <span class="page-kicker">📖 Paikallistiedon arkisto</span>
                <h1 class="page-title">LaukaaInfon tietokortit</h1>
                <p class="page-lead">Kootut tietokortit Laukaan paikoista, historiasta, hankkeista ja paikallisista aiheista.</p>
            </div>
            <div class="page-stats">
                <div><strong>${publicPosts.length}</strong> tietokorttia</div>
                <div>Päivitetty ${escapeHtml(updatedLabel)}</div>
            </div>
        </header>

        ${publicPosts.length > 0
            ? `<section class="tk-grid" aria-label="Tietokortit">${cardsHtml}</section>`
            : `<div class="empty-state">Julkaistuja tietokortteja ei löytynyt vielä.</div>`
        }
    </main>

    <footer>
        <p>&copy; 2026 LaukaaInfo • <a href="index.html">Etusivu</a> • <a href="alueet.html">Alueet</a> • <a href="tietosuoja.html">Tietosuoja</a></p>
    </footer>
</body>
</html>
`;

    const outPath = path.join(__dirname, 'tietokortit.html');
    if (publicPosts.length === 0 && fs.existsSync(outPath)) {
        console.log('  ⚠ Ei verkkoyhteyttä tai 0 korttia – säilytetään olemassa oleva tietokortit.html');
        return { count: 0, preserved: true };
    }

    fs.writeFileSync(outPath, html, 'utf8');
    console.log(`✅ Luotiin ${outPath} (${publicPosts.length} korttia)`);

    return { count: publicPosts.length };
}

if (require.main === module) {
    generateTietokortitPage().catch(e => {
        console.error('Tietokortit-sivun generointi epäonnistui:', e);
        process.exit(1);
    });
}

module.exports = { generateTietokortitPage };

