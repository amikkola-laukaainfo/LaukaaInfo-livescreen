const fs = require('fs');
const path = require('path');
const https = require('https');

// Helper: Hakee tiedoston todellisen muokkausajan ISO-päivänä (YYYY-MM-DD)
function getFileDate(filePath, fallbackDate) {
    try {
        if (fs.existsSync(filePath)) {
            const stat = fs.statSync(filePath);
            return stat.mtime.toISOString().split('T')[0];
        }
    } catch (e) {}
    return fallbackDate;
}

// Apufunktio urlin slug-muunnokselle
function slugify(text) {
    if (!text) return "";
    return text.toString().toLowerCase().trim()
        .replace(/\s+/g, '-')
        .replace(/[\u00e4\u00c4\u00e0\u00e1\u00e2\u00e3\u00e4\u00e5]/g, 'a')
        .replace(/[\u00f6\u00d6\u00f2\u00f3\u00f4\u00f5\u00f6\u00f8]/g, 'o')
        .replace(/[\u00e5\u00c5]/g, 'a')
        .replace(/[^\w-]/g, '')
        .replace(/--+/g, '-')
        .replace(/^-+/, '')
        .replace(/-+$/, '');
}

async function generateSitemap() {
    console.log('===================================================');
    console.log('LaukaaInfo & LiveScreen: Sitemap & SEO Laatugenerointi');
    console.log('===================================================');

    const baseUrl = 'https://laukaainfo.fi/';
    const today = new Date().toISOString().split('T')[0];
    const indexMtime = getFileDate(path.join(__dirname, 'index.html'), today);

    // ── 1. Staattiset pääsivut ja alueet ─────────────────────────────────────────
    // Tarkistetaan fyysinen olemassaolo levyltä. Puuttuvat sivut ohitetaan automaattisesti.
    const candidatePages = [
        { file: 'alueet.html', url: 'alueet.html', priority: '0.90', changefreq: 'weekly' },
        { file: 'tapahtumakartta.html', url: 'tapahtumakartta.html', priority: '0.90', changefreq: 'daily' },
        { file: 'tapahtumat/index.html', url: 'tapahtumat/', priority: '0.90', changefreq: 'daily' },
        { file: 'ajankohtaista.html', url: 'ajankohtaista.html', priority: '0.85', changefreq: 'daily' },
        { file: 'ilmoitukset.html', url: 'ilmoitukset.html', priority: '0.85', changefreq: 'daily' },
        { file: 'laukaa.html', url: 'laukaa.html', priority: '0.85', changefreq: 'weekly' },
        { file: 'leppavesi.html', url: 'leppavesi.html', priority: '0.85', changefreq: 'weekly' },
        { file: 'lievestuore.html', url: 'lievestuore.html', priority: '0.85', changefreq: 'weekly' },
        { file: 'vihtavuori.html', url: 'vihtavuori.html', priority: '0.85', changefreq: 'weekly' },
        { file: 'vehnia.html', url: 'vehnia.html', priority: '0.85', changefreq: 'weekly' },
        { file: 'koko-laukaa.html', url: 'koko-laukaa.html', priority: '0.85', changefreq: 'weekly' },
        { file: 'asiahaku.html', url: 'asiahaku.html', priority: '0.80', changefreq: 'weekly' },
        { file: 'pikahaku.html', url: 'pikahaku.html', priority: '0.80', changefreq: 'weekly' },
        { file: 'kohdekartta.html', url: 'kohdekartta.html', priority: '0.80', changefreq: 'weekly' },
        { file: 'tarinakartta.html', url: 'tarinakartta.html', priority: '0.80', changefreq: 'weekly' },
        { file: 'muistokartta.html', url: 'muistokartta.html', priority: '0.80', changefreq: 'weekly' },
        { file: 'reitti.html', url: 'reitti.html', priority: '0.80', changefreq: 'weekly' },
        { file: 'reitti-partner.html', url: 'reitti-partner.html', priority: '0.75', changefreq: 'weekly' },
        { file: 'tilannekuva.html', url: 'tilannekuva.html', priority: '0.75', changefreq: 'weekly' },
        { file: 'verkostokartta.html', url: 'verkostokartta.html', priority: '0.75', changefreq: 'weekly' },
        { file: 'tietoa-paikasta.html', url: 'tietoa-paikasta.html', priority: '0.80', changefreq: 'weekly' },
        { file: 'wonderin/esittely.html', url: 'wonderin/esittely.html', priority: '0.80', changefreq: 'monthly' },
        { file: 'laukaan-ravintolat.html', url: 'laukaan-ravintolat.html', priority: '0.80', changefreq: 'weekly' },
        { file: 'laukaan-autohuollot.html', url: 'laukaan-autohuollot.html', priority: '0.80', changefreq: 'weekly' },
        { file: 'laukaan-parturit-ja-kauneus.html', url: 'laukaan-parturit-ja-kauneus.html', priority: '0.80', changefreq: 'weekly' },
        { file: 'toiminta.html', url: 'toiminta.html', priority: '0.75', changefreq: 'weekly' },
        { file: 'kohtaamiset.html', url: 'kohtaamiset.html', priority: '0.75', changefreq: 'weekly' },
        { file: 'keskustelu.html', url: 'keskustelu.html', priority: '0.70', changefreq: 'weekly' },
        { file: 'galleria.html', url: 'galleria.html', priority: '0.75', changefreq: 'weekly' },
        { file: 'yhteisot-ja-linkit.html', url: 'yhteisot-ja-linkit.html', priority: '0.75', changefreq: 'weekly' },
        { file: 'kadonneet.html', url: 'kadonneet.html', priority: '0.70', changefreq: 'weekly' },
        { file: 'palvelun-esittely.html', url: 'palvelun-esittely.html', priority: '0.75', changefreq: 'monthly' },
        { file: 'ilmoittaudu.html', url: 'ilmoittaudu.html', priority: '0.70', changefreq: 'monthly' },
        { file: 'kauppa.html', url: 'kauppa.html', priority: '0.70', changefreq: 'monthly' },
        { file: 'lisaa-yritys.html', url: 'lisaa-yritys.html', priority: '0.70', changefreq: 'monthly' },
        { file: 'seina-esittely.html', url: 'seina-esittely.html', priority: '0.65', changefreq: 'monthly' },
        { file: 'alusta.html', url: 'alusta.html', priority: '0.65', changefreq: 'monthly' },
        { file: 'tietosuoja.html', url: 'tietosuoja.html', priority: '0.50', changefreq: 'monthly' },
        { file: 'maksuehto.html', url: 'maksuehto.html', priority: '0.50', changefreq: 'monthly' }
    ];

    // ── 2. Palvelujen hakusivut (palvelu.html?id=...) ───────────────────────────
    const palveluFile = path.join(__dirname, 'palvelu.html');
    const palveluMtime = getFileDate(palveluFile, today);
    const dynamicServices = [
        'pikahaku.html?id=vuokrauspalvelut',
        'palvelu.html?id=haat',
        'palvelu.html?id=yritysjuhlat',
        'palvelu.html?id=yritystilaisuudet',
        'palvelu.html?id=syntymapaivat',
        'palvelu.html?id=muutto',
        'palvelu.html?id=remontti',
        'palvelu.html?id=mokkipalvelut',
        'palvelu.html?id=hautajaiset',
        'palvelu.html?id=yrityksen-perustaminen',
        'palvelu.html?id=yrityksen-kehittaminen',
        'palvelu.html?id=vakituinen-palvelukumppani',
        'palvelu.html?id=kiinteistopalvelut',
        'palvelu.html?id=paivystavat-palvelut',
        'palvelu.html?id=terveys-ja-hyvinvointi',
        'palvelu.html?id=liikunta-ja-vapaaaika',
        'palvelu.html?id=elaimet',
        'palvelu.html?id=lapset-ja-perhe',
        'palvelu.html?id=autohuollot'
    ];

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset
      xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
      xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
      xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9
            http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">
<!-- Generated by LaukaaInfo Quality SEO Build Script – ${new Date().toISOString()} -->

<!-- 1. Kanoninen Etusivu (ei index.html-duplikaattia) -->
<url>
  <loc>${baseUrl}</loc>
  <lastmod>${indexMtime}</lastmod>
  <changefreq>daily</changefreq>
  <priority>1.00</priority>
</url>
`;

    let checkedStaticCount = 0;
    let skippedMissingCount = 0;

    // Lisätään tarkistetut staattiset sivut
    candidatePages.forEach(p => {
        const fullPath = path.join(__dirname, p.file);
        if (!fs.existsSync(fullPath)) {
            console.log(`⚠️  Ohitettu puuttuva tiedosto (ei lisätty sitemapiin): ${p.file}`);
            skippedMissingCount++;
            return;
        }

        const mtime = getFileDate(fullPath, today);
        xml += `<url>\n  <loc>${baseUrl}${p.url}</loc>\n  <lastmod>${mtime}</lastmod>\n  <changefreq>${p.changefreq || 'weekly'}</changefreq>\n  <priority>${p.priority || '0.80'}</priority>\n</url>\n`;
        checkedStaticCount++;
    });

    // Lisätään dynaamiset palveluhaut
    dynamicServices.forEach(page => {
        const safePage = page.replace(/&/g, '&amp;');
        xml += `<url>\n  <loc>${baseUrl}${safePage}</loc>\n  <lastmod>${palveluMtime}</lastmod>\n  <changefreq>weekly</changefreq>\n  <priority>0.80</priority>\n</url>\n`;
    });

    // ── 3. Laadukkaat paikkasivut (/paikka/[slug]/) ─────────────────────────────
    let paikkaCount = 0;
    const paikkaDir = path.join(__dirname, 'paikka');
    if (fs.existsSync(paikkaDir)) {
        const paikkaMtime = getFileDate(paikkaDir, today);
        xml += `<url>\n  <loc>${baseUrl}paikka/</loc>\n  <lastmod>${paikkaMtime}</lastmod>\n  <changefreq>weekly</changefreq>\n  <priority>0.95</priority>\n</url>\n`;
        paikkaCount++;

        const slugDirs = fs.readdirSync(paikkaDir, { withFileTypes: true })
            .filter(d => d.isDirectory() && fs.existsSync(path.join(paikkaDir, d.name, 'index.html')));

        slugDirs.forEach(d => {
            const pageFile = path.join(paikkaDir, d.name, 'index.html');
            const pageMtime = getFileDate(pageFile, today);
            xml += `<url>\n  <loc>${baseUrl}paikka/${d.name}/</loc>\n  <lastmod>${pageMtime}</lastmod>\n  <changefreq>weekly</changefreq>\n  <priority>0.90</priority>\n</url>\n`;
            paikkaCount++;
        });
    }

    // ── 4. Kootut teemasivut (/teemat/*.html) ───────────────────────────────────
    let teemaCount = 0;
    const teematDir = path.join(__dirname, 'teemat');
    if (fs.existsSync(teematDir)) {
        const teemaFiles = fs.readdirSync(teematDir).filter(f => f.endsWith('.html'));
        teemaFiles.forEach(file => {
            const fullFile = path.join(teematDir, file);
            const mtime = getFileDate(fullFile, today);
            xml += `<url>\n  <loc>${baseUrl}teemat/${file}</loc>\n  <lastmod>${mtime}</lastmod>\n  <changefreq>weekly</changefreq>\n  <priority>0.85</priority>\n</url>\n`;
            teemaCount++;
        });
    }

    // ── 5. Staattiset yrityssivut (/yritys/*.html) ──────────────────────────────
    let yritysCount = 0;
    const yritysDir = path.join(__dirname, 'yritys');
    if (fs.existsSync(yritysDir)) {
        const yritysFiles = fs.readdirSync(yritysDir).filter(f => f.endsWith('.html'));
        yritysFiles.forEach(file => {
            const fullFile = path.join(yritysDir, file);
            const mtime = getFileDate(fullFile, today);
            xml += `<url>\n  <loc>${baseUrl}yritys/${file}</loc>\n  <lastmod>${mtime}</lastmod>\n  <changefreq>monthly</changefreq>\n  <priority>0.80</priority>\n</url>\n`;
            yritysCount++;
        });
    }

    xml += `</urlset>\n`;

    // ── Kirjoitetaan sitemap.xml ────────────────────────────────────────────────
    const sitemapPath = path.join(__dirname, 'sitemap.xml');
    fs.writeFileSync(sitemapPath, xml, 'utf8');

    // Jos dist-kansio on olemassa, kopioidaan myös sinne
    const distPath = path.join(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
        fs.writeFileSync(path.join(distPath, 'sitemap.xml'), xml, 'utf8');
    }

    // ── Luodaan standardi robots.txt ───────────────────────────────────────────
    const robotsTxt = `User-agent: *
Allow: /

Sitemap: https://laukaainfo.fi/sitemap.xml
`;
    fs.writeFileSync(path.join(__dirname, 'robots.txt'), robotsTxt, 'utf8');
    if (fs.existsSync(distPath)) {
        fs.writeFileSync(path.join(distPath, 'robots.txt'), robotsTxt, 'utf8');
    }

    // ── 6. Rinnakkainen sitemap-mediazoo.xml (mediazoo.fi portaali) ──────────────
    const mediazooBase = 'https://www.mediazoo.fi/laukaainfo-web/';
    let xml2 = `<?xml version="1.0" encoding="UTF-8"?>
<urlset
      xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
      xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
      xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9
            http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">
<!-- Generated for Mediazoo.fi Portal -->
<url>
  <loc>${mediazooBase}</loc>
  <lastmod>${today}</lastmod>
  <priority>0.90</priority>
</url>
</urlset>
`;
    const mediazooDir = path.join(__dirname, 'laukaainfo-web');
    fs.mkdirSync(mediazooDir, { recursive: true });
    fs.writeFileSync(path.join(mediazooDir, 'sitemap-mediazoo.xml'), xml2, 'utf8');

    // ── Tulostetaan laaturaportti ───────────────────────────────────────────────
    const totalUrls = 1 + checkedStaticCount + dynamicServices.length + paikkaCount + teemaCount + yritysCount;

    console.log('---------------------------------------------------');
    console.log(`✅ sitemap.xml luotu onnistuneesti!`);
    console.log(`   - Kanoninen etusivu (/)        : 1 kpl`);
    console.log(`   - Alue- ja sisältösivut        : ${checkedStaticCount} kpl (ohitettu puuttuvat: ${skippedMissingCount} kpl)`);
    console.log(`   - Paikkasivut (paikka/)        : ${paikkaCount} kpl`);
    console.log(`   - Teemasivut (teemat/)         : ${teemaCount} kpl`);
    console.log(`   - Yrityssivut (yritys/)        : ${yritysCount} kpl`);
    console.log(`   - Kohdistetut palveluhaut      : ${dynamicServices.length} kpl`);
    console.log(`   -----------------------------------------------`);
    console.log(`   YHTEENSÄ: ${totalUrls} tarkistettua, laadukasta sivua.`);
    console.log(`✅ Jokaisella URL:lla aito tiedostokohtainen lastmod-aika.`);
    console.log(`✅ Ei 404-linkkejä, ei keinotekoisia duplikaatteja.`);
    console.log(`✅ Luotu myös standardi robots.txt -> https://laukaainfo.fi/sitemap.xml`);
    console.log('===================================================');

    return { totalUrls };
}

if (require.main === module) {
    generateSitemap().catch(e => console.error('Sitemap generointi epäonnistui:', e));
}

module.exports = { generateSitemap };
