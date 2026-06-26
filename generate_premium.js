const fs = require('fs');
const path = require('path');

/**
 * Slugify helper matching yrityskortti.js/script.js logic
 */
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

function generatePremiumPages() {
    console.log('--- Generating Premium Company Pages ---');
    
    const companiesFile = path.join(__dirname, 'companies_data.json');
    const distDir = path.join(__dirname, 'dist');
    const yritysDir = path.join(distDir, 'yritys');
    
    if (!fs.existsSync(yritysDir)) {
        fs.mkdirSync(yritysDir, { recursive: true });
    }
    
    if (!fs.existsSync(companiesFile)) {
        console.error('Error: companies_data.json not found');
        return;
    }
    
    // Read with BOM stripping (Windows editors may prepend \uFEFF)
    let rawJson = fs.readFileSync(companiesFile, 'utf8');
    if (rawJson.charCodeAt(0) === 0xFEFF) rawJson = rawJson.slice(1);
    const data = JSON.parse(rawJson);
    const companies = data.results || [];

    // Ladataan profilointidata (ai_and_seo-kent\u00e4t) jos saatavilla
    let profilingData = {};
    const profilingFile = path.join(__dirname, 'company_profiling_data.json');
    if (fs.existsSync(profilingFile)) {
        try {
            let rawProfiling = fs.readFileSync(profilingFile, 'utf8');
            if (rawProfiling.charCodeAt(0) === 0xFEFF) rawProfiling = rawProfiling.slice(1);
            profilingData = JSON.parse(rawProfiling);
            console.log(`Profilointidata ladattu: ${Object.keys(profilingData).length} yrityst\u00e4`);
        } catch (e) {
            console.warn('Varoitus: profilointidatan luku ep\u00e4onnistui:', e.message);
        }
    }

    // Apufunktio: etsii yrityksen profilointidatan ID:ll\u00e4 tai nimell\u00e4
    function findProfiling(company) {
        const id = String(company.id);
        const idWithPrefix = id.startsWith('company-') ? id : 'company-' + id;
        const idWithoutPrefix = id.replace('company-', '');

        return profilingData[idWithPrefix]
            || profilingData[idWithoutPrefix]
            || Object.values(profilingData).find(p => {
                const pNimi = (p.name || (p.core && p.core.nimi) || '').toLowerCase().trim();
                return pNimi === (company.nimi || '').toLowerCase().trim();
            })
            || null;
    }

    // Read the base yrityskortti.html as a template
    const templatePath = path.join(__dirname, 'yrityskortti.html');
    if (!fs.existsSync(templatePath)) {
        console.error('Error: yrityskortti.html template not found');
        return;
    }
    let template = fs.readFileSync(templatePath, 'utf8');
    
    let generatedCount = 0;
    
    companies.forEach(company => {
        const isPremium = company.tyyppi === 'maksu' || company.tyyppi === 'paid';
        
        if (isPremium) {
            const name = company.nimi;
            const slug = slugify(name);

            // Haetaan profilointidata ja ai_and_seo
            const profiling = findProfiling(company);
            const aiSeo = (profiling && profiling.ai_and_seo) || company.ai_and_seo || null;

            // 1. OG Image
            let ogImage = "https://laukaainfo.fi/og-yrityskortti.png";
            if (company.media && company.media.length > 0) {
                const firstImg = company.media.find(m => m.type === 'image');
                if (firstImg && firstImg.url) {
                    ogImage = firstImg.url;
                    if (!ogImage.startsWith('http')) ogImage = "https://www.mediazoo.fi/laukaainfo-web/" + ogImage;
                }
            } else if (company.logo && company.logo !== '-' && company.logo !== '') {
                ogImage = company.logo;
                if (!ogImage.startsWith('http')) ogImage = "https://www.mediazoo.fi/laukaainfo-web/" + ogImage;
            }
            
            // 2. SEO Description - k\u00e4ytet\u00e4\u00e4n ai_summary ensisijaisesti
            let description = '';
            if (aiSeo && aiSeo.ai_summary) {
                description = aiSeo.ai_summary.substring(0, 160).trim();
                console.log(`  [AI] ${name}: k\u00e4ytet\u00e4\u00e4n ai_summary`);
            } else {
                description = company.mainoslause || company.esittely || "Kylien ja asukkaiden oma tietopankki.";
                if (description.includes('@@')) description = description.replace(/@@/g, '').trim();
                description = description.substring(0, 160).trim();
            }
            
            // 3. Schema.org LocalBusiness
            const schema = {
                "@context": "https://schema.org",
                "@type": "LocalBusiness",
                "@id": `https://laukaainfo.fi/yritys/${slug}.html`,
                "name": name,
                "description": description,
                "address": {
                    "@type": "PostalAddress",
                    "streetAddress": company.osoite || '',
                    "addressLocality": "Laukaa",
                    "addressCountry": "FI"
                },
                "telephone": company.puhelin,
                "url": company.nettisivu || `https://laukaainfo.fi/yritys/${slug}.html`,
                "image": ogImage
            };
            if (company.lat && company.lon) {
                schema.geo = {
                    "@type": "GeoCoordinates",
                    "latitude": company.lat,
                    "longitude": company.lon
                };
            }
            // Lis\u00e4t\u00e4\u00e4n palvelualueet ai_and_seo:sta
            if (aiSeo && aiSeo.service_areas_text && aiSeo.service_areas_text.length > 0) {
                schema.areaServed = aiSeo.service_areas_text;
            }
            // sameAs some-linkit
            const sameAs = ['facebook','instagram','linkedin','tiktok'].reduce((acc, k) => {
                let v = (company[k] || '').trim();
                if (v && v !== '-') {
                    if (!v.startsWith('http')) v = 'https://' + v;
                    acc.push(v);
                }
                return acc;
            }, []);
            if (sameAs.length > 0) schema.sameAs = sameAs;

            // 4. FAQ Schema (jos saatavilla)
            let faqSchemaTag = '';
            if (aiSeo && aiSeo.faq && aiSeo.faq.length > 0) {
                const faqSchema = {
                    "@context": "https://schema.org",
                    "@type": "FAQPage",
                    "mainEntity": aiSeo.faq.map(item => ({
                        "@type": "Question",
                        "name": item.question,
                        "acceptedAnswer": { "@type": "Answer", "text": item.answer }
                    }))
                };
                faqSchemaTag = `\n    <script type="application/ld+json">${JSON.stringify(faqSchema)}<\/script>`;
                console.log(`  [FAQ] ${name}: ${aiSeo.faq.length} kysymyst\u00e4 lis\u00e4tty`);
            }

            // 5. Inject into template
            let pageContent = template;
            
            // Remove existing OG tags to avoid duplication
            pageContent = pageContent.replace(/<!-- Open Graph Tags -->[\s\S]*?<!-- Fonts & Styles -->/, '<!-- Fonts & Styles -->');
            pageContent = pageContent.replace(/<meta property="og:.*?>/g, '');
            
            // Replace Title
            pageContent = pageContent.replace(/<title>.*?<\/title>/, `<title>${name} \u2013 LaukaaInfo<\/title>`);
            
            // Fix relative paths
            pageContent = pageContent.replace(/(href|src|action)="([^"]+?\.(html|css|js|png|json|png|jpg|jpeg|gif|svg|ico)(\?[^"]*)?)"/g, (match, attr, p) => {
                if (p.startsWith('http') || p.startsWith('//') || p.startsWith('data:') || p.startsWith('../') || p.startsWith('mailto:') || p.startsWith('tel:')) {
                    return match;
                }
                return `${attr}="../${p}"`;
            });
            
            // 6. OG + Schema tags
            const ogTags = `
    <!-- Generated Premium OG Tags -->
    <meta property="og:title" content="${name} \u2013 LaukaaInfo">
    <meta property="og:description" content="${description}">
    <meta property="og:image" content="${ogImage}">
    <meta property="og:url" content="https://laukaainfo.fi/yritys/${slug}.html">
    <meta property="og:type" content="business.business">
    <meta property="og:site_name" content="LaukaaInfo">
    <meta name="description" content="${description}">
    <script type="application/ld+json">${JSON.stringify(schema)}<\/script>${faqSchemaTag}
`;
            pageContent = pageContent.replace('<\/head>', ogTags + '<\/head>');
            
            const outputPath = path.join(yritysDir, `${slug}.html`);
            fs.writeFileSync(outputPath, pageContent);
            generatedCount++;
            console.log(`  \u2713 Generoitu: yritys/${slug}.html`);
        }
    });
    
    console.log(`\n\u2713 Yhteens\u00e4 generoitu ${generatedCount} premium-yrityssivua.`);
}

if (require.main === module) {
    generatePremiumPages();
}

module.exports = { generatePremiumPages };

