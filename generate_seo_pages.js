/**
 * generate_seo_pages.js
 * Generates static Directory & SEO layer HTML pages for LaukaaInfo.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { slugify, renderPlaceSeoPage, renderThemeSeoPage } = require('./seo_templates');

const SUPABASE_URL = 'https://duxluwyqxvbmkkjzuzkz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_HgfWyipuSO7gvsVUR1smNQ_aXox2OPu';

/**
 * Default pilot places dataset (used if Supabase has not set seo_indexed=true yet)
 */
const PILOT_PLACES = [
    {
        place_id: "vihtavuori",
        name: "Vihtavuori",
        description: "Vihtavuori on Laukaan keskeinen taajama ja perinteikäs teollisuus- sekä asuinalue, joka tunnetaan kauniista luonnostaan ja teollisesta historiastaan.",
        history_text: "Vihtavuoren kehitys liittyy vahvasti 1920-luvulla perustettuun ruutitehtaaseen, joka muodosti alueen teollisen selkärangan. Tänä päivänä Vihtavuori on elinvoimainen asuinalue, jossa yhdistyvät teollisuushistoria, modernit palvelut ja monipuoliset ulkoilureitit.",
        area: "Vihtavuori",
        seo_indexed: true,
        seo_slug: "vihtavuori",
        cover_image: "../hero-kuva.webp"
    },
    {
        place_id: "laukaan-satama",
        name: "Laukaan Satama",
        description: "Laukaan Satama on Kirkonkylän sydämessä sijaitseva suosittu kohtauspaikka, joka tarjoaa veneilypalveluita, ravintola-elämyksiä ja tapahtumia Saraaveden rannalla.",
        history_text: "Saraaveden rannalla sijaitseva Laukaan satama-alue on pitkään toiminut vesiliikenteen ja vapaa-ajan keskiönä. Satama yhdistää Laukaan kirkonkylän palvelut ja vesistöretkeilyn.",
        area: "Laukaa Kirkonkylä",
        seo_indexed: true,
        seo_slug: "laukaan-satama",
        cover_image: "../laukaan_ravintolat_header.png"
    },
    {
        place_id: "haaralan-tehdas",
        name: "Haarlan tehdas",
        description: "Haarlan entinen paperitehdas Lievestuoreella on merkittävä osa Laukaan ja Keski-Suomen teollisuushistoriaa.",
        history_text: "Haarlan selleritehdas ja paperiteollisuus Lievestuoreella vaikuttivat vuosikymmenien ajan alueen kehitykseen. Alueen historia ja tarinat ovat keskeinen osa Laukaan teollisuusperintöä.",
        area: "Lievestuore",
        seo_indexed: true,
        seo_slug: "haaralan-tehdas"
    },
    {
        place_id: "saraakallio",
        name: "Saraakallion kalliomaalaukset",
        description: "Pohjoismaiden laajin kalliomaalausalue Saraaveden rannalla Laukaassa. Saraakallion maalaukset ajoittuvat 5000–7000 vuoden taakse.",
        history_text: "Saraakallion kalliomaalaukset sisältävät yli 100 tunnistettua kuviohahmoa, kuten hirviä, ihmisiä ja veneitä. Ne kertovat kivikauden ihmisten elämästä, uskomuksista ja pyhistä paikoista.",
        area: "Laukaa Kirkonkylä",
        seo_indexed: true,
        seo_slug: "saraakallio"
    },
    {
        place_id: "peurunka",
        name: "Peurunka",
        description: "Monipuolinen matkailu-, kylpylä- ja hyvänolokeskus Peurunka-järven rannalla Laukaassa.",
        history_text: "Peurunka on toiminut vuosikymmeniä valtakunnallisesti tunnettuna kuntoutus- ja virkistyskeskuksena. Sen ympärillä on laajamuotoinen luonto- ja reittiverkosto.",
        area: "Peurunka",
        seo_indexed: true,
        seo_slug: "peurunka"
    },
    {
        place_id: "hitonhauta",
        name: "Hitonhauta",
        description: "Suosittu luontokohde ja vaikuttava rotkolaakso Laukaan Valkolassa.",
        history_text: "Jääkauden muovaama noin 800 metriä pitkä ja 10–20 metriä syvä rotkolaakso tarjoaa ainutlaatuisen luontoelämyksen ja jylhiä kallioseinämiä.",
        area: "Valkola",
        seo_indexed: true,
        seo_slug: "hitonhauta"
    },
    {
        place_id: "kuusankoski",
        name: "Kuusankoski ja Koskikara",
        description: "Kuusankoski on tunnettu perhokalastus- ja koskikohde Laukaassa, jonka rannalla sijaitsee legendaarinen Varjola ja Koskikara.",
        history_text: "Kuusankosken kuohut ovat vetäneet puoleensa kalastajia ja matkailijoita jo yli vuosisadan ajan. Alue muodostaa yhden Keiteleen reitin hienoimmista koskikokonaisuuksista.",
        area: "Kuusa",
        seo_indexed: true,
        seo_slug: "kuusankoski"
    },
    {
        place_id: "lievestuore",
        name: "Lievestuore",
        description: "Lievestuore on Laukaan itäinen taajama, joka tunnetaan Lievestuoreenjärvestä, teollisuushistoriastaan ja kirkkaasta yhdistystoiminnastaan.",
        history_text: "Lievestuore kehittyi radanvarren teollisuuspaikkakunnaksi 1900-luvun alussa. Tänä päivänä se tarjoaa monipuoliset asumismahdollisuudet ja luontoaktiviteetit.",
        area: "Lievestuore",
        seo_indexed: true,
        seo_slug: "lievestuore"
    },
    {
        place_id: "hyyppaanvuori",
        name: "Hyyppäänvuori",
        description: "Laukaan 'Koli' – jylhä kalliomaisema ja näköalapaikka Lievestuoreenjärven rannalla.",
        history_text: "Hyyppäänvuori nousee noin 160 metrin korkeuteen merenpinnasta tarjoten upeat näkymät yli Lievestuoreenjärven. Se on suosittu päiväretkikohde ja luontonähtävyys.",
        area: "Lievestuore",
        seo_indexed: true,
        seo_slug: "hyyppaanvuori"
    },
    {
        place_id: "tarvaala",
        name: "Tarvaalan maaseututaajama",
        description: "Perinteikäs maaseutu- ja kulttuurimaisemakylä Tarvaalanvirran varrella.",
        history_text: "Tarvaalan kylä ja biotalouskampus muodostavat arvokkaan maatalous- ja opetushistoriallisen kokonaisuuden Laukaassa.",
        area: "Tarvaala",
        seo_indexed: true,
        seo_slug: "tarvaala"
    }
];

/**
 * Default pilot themes dataset
 */
const PILOT_THEMES = [
    {
        id: "luonto",
        name: "Luonto ja retkeily",
        description: "Laukaan ainutlaatuiset luontokohteet, kalliomaalaukset, kosket, luontopolut ja vesistöt.",
        seo_indexed: true,
        seo_slug: "luonto"
    },
    {
        id: "historia",
        name: "Historia ja kulttuuriperintö",
        description: "Laukaan rikas historia aina kivikauden kalliomaalauksista teollisuusajan muistoihin ja kulttuurireitteihin.",
        seo_indexed: true,
        seo_slug: "historia"
    },
    {
        id: "teollisuushistoria",
        name: "Teollisuushistoria",
        description: "Vihtavuoren ruutitehdas, Haarlan tehtaat ja Laukaan vaiherikas teollisuusperintö.",
        seo_indexed: true,
        seo_slug: "teollisuushistoria"
    },
    {
        id: "perheille",
        name: "Tekemistä perheille",
        description: "Lapsiperheille sopivat uimarannat, leikkipuistot, retkikohteet ja vapaa-ajan elämykset Laukaassa.",
        seo_indexed: true,
        seo_slug: "perheille"
    },
    {
        id: "vesistot",
        name: "Vesistöt ja veneily",
        description: "Saraavesi, Peurunka, Lievestuoreenjärvi, Kuusankoski ja Keiteleen kanava – Laukaan upeat vesireitit.",
        seo_indexed: true,
        seo_slug: "vesistot"
    }
];

function fetchSupabase(path) {
    return new Promise((resolve) => {
        const options = {
            hostname: new URL(SUPABASE_URL).hostname,
            path: path,
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
                    resolve(Array.isArray(parsed) ? parsed : null);
                } catch (e) {
                    resolve(null);
                }
            });
        });
        req.on('error', () => resolve(null));
        req.setTimeout(5000, () => { req.destroy(); resolve(null); });
        req.end();
    });
}

async function generateSeoPages() {
    console.log('====================================================');
    console.log('🚀 Launching LaukaaInfo SEO & Directory Generator...');
    console.log('====================================================');

    const rootDir = __dirname;
    const kohteetDir = path.join(rootDir, 'kohteet');
    const teematDir = path.join(rootDir, 'teemat');

    // Create directories if not existing
    if (!fs.existsSync(kohteetDir)) fs.mkdirSync(kohteetDir, { recursive: true });
    if (!fs.existsSync(teematDir)) fs.mkdirSync(teematDir, { recursive: true });

    // 1. Fetch Places from Supabase (or fallback to PILOT_PLACES)
    console.log('📡 Fetching place data...');
    let dbPlaces = await fetchSupabase('/rest/v1/places?select=*&seo_indexed=eq.true');
    
    let placesToGenerate = [];
    if (dbPlaces && dbPlaces.length > 0) {
        console.log(`✓ Found ${dbPlaces.length} places marked with seo_indexed=true in Supabase.`);
        placesToGenerate = dbPlaces;
    } else {
        console.log(`ℹ Using pilot places dataset (${PILOT_PLACES.length} places).`);
        placesToGenerate = PILOT_PLACES;
    }

    // 2. Fetch Themes from Supabase (or fallback to PILOT_THEMES)
    console.log('📡 Fetching theme data...');
    let dbThemes = await fetchSupabase('/rest/v1/tags?select=*&seo_indexed=eq.true');
    let themesToGenerate = [];
    if (dbThemes && dbThemes.length > 0) {
        console.log(`✓ Found ${dbThemes.length} themes marked with seo_indexed=true in Supabase.`);
        themesToGenerate = dbThemes;
    } else {
        console.log(`ℹ Using pilot themes dataset (${PILOT_THEMES.length} themes).`);
        themesToGenerate = PILOT_THEMES;
    }

    // 3. Generate Place HTML Pages (/kohteet/*.html)
    console.log('\n📄 Generating place SEO pages (/kohteet/)...');
    let placeCount = 0;
    placesToGenerate.forEach(place => {
        const slug = place.seo_slug || slugify(place.name);
        if (!slug) return;

        // Find matching themes for this place
        const placeArea = place.area || place.municipality || 'Laukaa';
        const relatedThemes = PILOT_THEMES.filter(t => 
            place.description && place.description.toLowerCase().includes(t.name.toLowerCase()) ||
            place.name.toLowerCase().includes('tehdas') && t.id === 'teollisuushistoria' ||
            t.id === 'luonto'
        );

        const html = renderPlaceSeoPage({
            place,
            relatedThemes,
            relatedRoutes: [],
            relatedStories: [],
            placeImages: [],
            areaName: placeArea
        });

        const filePath = path.join(kohteetDir, `${slug}.html`);
        fs.writeFileSync(filePath, html, 'utf8');
        console.log(`   + Created: /kohteet/${slug}.html (${place.name})`);
        placeCount++;
    });

    // 4. Generate Theme HTML Pages (/teemat/*.html)
    console.log('\n📄 Generating theme SEO pages (/teemat/)...');
    let themeCount = 0;
    themesToGenerate.forEach(theme => {
        const slug = theme.seo_slug || slugify(theme.name);
        if (!slug) return;

        // Find matching places for this theme
        const relatedPlaces = placesToGenerate.filter(p => {
            if (theme.id === 'teollisuushistoria' && (p.name.includes('Vihtavuori') || p.name.includes('tehdas') || p.name.includes('Lievestuore'))) return true;
            if (theme.id === 'luonto' && (p.name.includes('Hitonhauta') || p.name.includes('Saraakallio') || p.name.includes('Peurunka') || p.name.includes('Hyyppäänvuori'))) return true;
            if (theme.id === 'vesistot' && (p.name.includes('Satama') || p.name.includes('Kuusankoski') || p.name.includes('Saraakallio'))) return true;
            return true;
        }).slice(0, 6);

        const html = renderThemeSeoPage({
            theme,
            relatedPlaces,
            relatedRoutes: [],
            relatedStories: []
        });

        const filePath = path.join(teematDir, `${slug}.html`);
        fs.writeFileSync(filePath, html, 'utf8');
        console.log(`   + Created: /teemat/${slug}.html (${theme.name})`);
        themeCount++;
    });

    console.log('\n====================================================');
    console.log(`✅ SEO Generation Complete!`);
    console.log(`   - Generated ${placeCount} Place pages in /kohteet/`);
    console.log(`   - Generated ${themeCount} Theme pages in /teemat/`);
    console.log('====================================================\n');
}

if (require.main === module) {
    generateSeoPages().catch(err => {
        console.error('❌ SEO Generation failed:', err);
    });
}

module.exports = { generateSeoPages };
