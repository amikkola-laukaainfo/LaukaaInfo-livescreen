const fs = require('fs');
const path = require('path');

/**
 * Slugify helper matching yrityskortti.js/script.js logic
 */
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
    
    const data = JSON.parse(fs.readFileSync(companiesFile, 'utf8'));
    const companies = data.results || [];
    
    // Read the base yrityskortti.html as a template
    // We'll use a slightly modified version that doesn't rely solely on JS for SEO
    const templatePath = path.join(__dirname, 'yrityskortti.html');
    if (!fs.existsSync(templatePath)) {
        console.error('Error: yrityskortti.html template not found');
        return;
    }
    let template = fs.readFileSync(templatePath, 'utf8');
    
    let generatedCount = 0;
    
    companies.forEach(company => {
        // Logic: tyyppi === 'maksu' (or normalized variations)
        const isPremium = company.tyyppi === 'maksu' || company.tyyppi === 'paid';
        
        if (isPremium) {
            const name = company.nimi;
            const slug = slugify(name);
            const id = company.id;
            
            // 1. Determine OG Image
            let ogImage = "https://laukaainfo.fi/og-yrityskortti.png";
            if (company.media && company.media.length > 0) {
                const firstImg = company.media.find(m => m.type === 'image');
                if (firstImg && firstImg.url) {
                    ogImage = firstImg.url;
                    // Ensure absolute URL if it's a relative path from the server
                    if (!ogImage.startsWith('http')) {
                        ogImage = "https://www.mediazoo.fi/laukaainfo-web/" + ogImage;
                    }
                }
            } else if (company.logo && company.logo !== '-' && company.logo !== '') {
                ogImage = company.logo;
                if (!ogImage.startsWith('http')) {
                    ogImage = "https://www.mediazoo.fi/laukaainfo-web/" + ogImage;
                }
            }
            
            // 2. SEO Description
            let description = company.mainoslause || company.esittely || "Kylien ja asukkaiden oma tietopankki.";
            if (description.includes('@@')) {
                description = description.split('@@')[0].trim();
            }
            description = description.substring(0, 160).trim();
            
            // 3. Schema.org LocalBusiness
            const schema = {
                "@context": "https://schema.org",
                "@type": "LocalBusiness",
                "name": name,
                "description": company.mainoslause || company.esittely,
                "address": {
                    "@type": "PostalAddress",
                    "streetAddress": company.osoite
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
            
            // 4. Inject into template
            let pageContent = template;
            
            // Remove existing OG tags to avoid duplication
            pageContent = pageContent.replace(/<!-- Open Graph Tags -->[\s\S]*?<!-- Fonts & Styles -->/, '<!-- Fonts & Styles -->');
            // Also remove any standalone OG metas if they weren't in that block
            pageContent = pageContent.replace(/<meta property="og:.*?>/g, '');
            
            // Replace Title
            pageContent = pageContent.replace(/<title>.*?<\/title>/, `<title>${name} – LaukaaInfo</title>`);
            
            // 4.5 Fix relative paths for assets since we're now in a subdirectory
            // style.css -> ../style.css
            // script.js -> ../script.js
            // logo.png -> ../logo.png
            // index.html -> ../index.html
            pageContent = pageContent.replace(/(href|src|action)="([^"]+?\.(html|css|js|png|json|png|jpg|jpeg|gif|svg|ico)(\?[^"]*)?)"/g, (match, attr, path) => {
                if (path.startsWith('http') || path.startsWith('//') || path.startsWith('data:') || path.startsWith('../') || path.startsWith('mailto:') || path.startsWith('tel:')) {
                    return match;
                }
                return `${attr}="../${path}"`;
            });
            
            // 5. Ensure OG URL is correct
            const ogTags = `
    <!-- Generated Premium OG Tags -->
    <meta property="og:title" content="${name} – LaukaaInfo">
    <meta property="og:description" content="${description}">
    <meta property="og:image" content="${ogImage}">
    <meta property="og:url" content="https://laukaainfo.fi/yritys/${slug}.html">
    <meta property="og:type" content="business.business">
    <meta property="og:site_name" content="LaukaaInfo">
    <script type="application/ld+json">${JSON.stringify(schema)}</script>
`;
            
            // We'll insert these before </head>
            pageContent = pageContent.replace('</head>', ogTags + '</head>');
            
            // Final path - yritys/ subdirectory
            const outputPath = path.join(yritysDir, `${slug}.html`);
            fs.writeFileSync(outputPath, pageContent);
            generatedCount++;
        }
    });
    
    console.log(`✓ Successfully generated ${generatedCount} premium company pages.`);
}

if (require.main === module) {
    generatePremiumPages();
}

module.exports = { generatePremiumPages };
