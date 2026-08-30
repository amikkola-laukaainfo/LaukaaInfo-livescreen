// generate_company_place_links.js
// Matches companies from live_companies.json and temp_companies.json to places in Supabase.
// Outputs: company_place_links.json and company_place_match_report.json

const fs = require('fs');
const https = require('https');
const path = require('path');

// 1. Supabase details
const SUPABASE_URL = 'https://duxluwyqxvbmkkjzuzkz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_HgfWyipuSO7gvsVUR1smNQ_aXox2OPu';

// 2. Haversine formula for distance
function getDistance(lat1, lon1, lat2, lon2) {
    if (!lat1 || !lon1 || !lat2 || !lon2) return Infinity;
    const R = 6371e3; // metres
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; // meters
}

function normalizeName(name) {
    if (!name) return '';
    return name.toLowerCase()
        .replace(/oy|ab|tmi|ky/g, '')
        .replace(/[^a-zåäö0-9]/g, '')
        .trim();
}

function normalizeAddress(addr) {
    if (!addr) return '';
    return addr.toLowerCase()
        .replace(/,.*$/, '') // take only street part if comma separated
        .replace(/[^a-zåäö0-9]/g, '')
        .trim();
}

async function fetchPlaces() {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'duxluwyqxvbmkkjzuzkz.supabase.co',
            path: '/rest/v1/places?select=place_id,name,lat,lon',
            method: 'GET',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            }
        };

        const req = https.request(options, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(JSON.parse(data));
                } else {
                    reject(new Error(`Failed to fetch places: ${res.statusCode} ${data}`));
                }
            });
        });

        req.on('error', e => reject(e));
        req.end();
    });
}

function loadJSON(filePath) {
    if (fs.existsSync(filePath)) {
        try {
            const data = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(data);
        } catch(e) {
            console.error(`Error parsing ${filePath}`, e);
            return null;
        }
    }
    return null;
}

async function run() {
    console.log('Fetching places from Supabase...');
    let places = [];
    try {
        places = await fetchPlaces();
        console.log(`Loaded ${places.length} places.`);
    } catch(e) {
        console.error('Failed to load places', e);
        return;
    }

    console.log('Loading company files...');
    const liveData = loadJSON(path.join(__dirname, 'live_companies.json'));
    const tempData = loadJSON(path.join(__dirname, 'temp_companies.json'));
    
    let companies = [];
    if (liveData && liveData.results) companies = companies.concat(liveData.results);
    if (tempData && tempData.results) companies = companies.concat(tempData.results);
    
    // Remove duplicates based on ID
    const seen = new Set();
    companies = companies.filter(c => {
        if (seen.has(c.id)) return false;
        seen.add(c.id);
        return true;
    });

    console.log(`Loaded ${companies.length} unique companies.`);

    const links = [];
    let stats = {
        total: companies.length,
        varma: 0,
        todennakoinen: 0,
        tarkista: 0,
        no_match: 0
    };

    companies.forEach(company => {
        const cName = normalizeName(company.nimi);
        const cAddr = normalizeAddress(company.osoite);
        const cLat = parseFloat(company.lat);
        const cLon = parseFloat(company.lon);
        
        let bestMatch = null;
        
        places.forEach(place => {
            const pName = normalizeName(place.name);
            const pAddr = normalizeAddress(place.address);
            const pLat = parseFloat(place.lat);
            const pLon = parseFloat(place.lon);
            
            const dist = getDistance(cLat, cLon, pLat, pLon);
            const isNameExact = (cName && pName && cName === pName);
            const isNameSimilar = (cName && pName && (cName.includes(pName) || pName.includes(cName)));
            const isAddrExact = (cAddr && pAddr && cAddr === pAddr);
            
            let confidence = 0;
            let matchType = '';
            let reason = '';
            
            // VARMA
            if (isNameExact && isAddrExact) {
                confidence = 1.0;
                matchType = 'automatic';
                reason = 'exact_name_and_address';
            } else if (isNameExact) {
                confidence = 0.95;
                matchType = 'automatic';
                reason = 'exact_name';
            } else if (isNameSimilar && dist < 20) {
                confidence = 0.95;
                matchType = 'automatic';
                reason = 'similar_name_close_dist';
            } 
            // TODENNÄKÖINEN
            else if (isNameSimilar && dist < 100) {
                confidence = 0.8;
                matchType = 'automatic';
                reason = 'similar_name_dist_100';
            } 
            // TARKISTA
            else if (isNameSimilar && dist < 500) {
                confidence = 0.6;
                matchType = 'automatic';
                reason = 'similar_name_dist_500';
            }
            
            if (confidence > 0) {
                if (!bestMatch || confidence > bestMatch.confidence || (confidence === bestMatch.confidence && dist < bestMatch.distance_meters)) {
                    bestMatch = {
                        company_id: company.id,
                        place_id: place.place_id,
                        match_type: matchType,
                        confidence: confidence,
                        match_reason: reason,
                        distance_meters: Math.round(dist * 10) / 10
                    };
                }
            }
        });
        
        if (bestMatch) {
            links.push(bestMatch);
            if (bestMatch.confidence >= 0.95) stats.varma++;
            else if (bestMatch.confidence >= 0.8) stats.todennakoinen++;
            else if (bestMatch.confidence >= 0.6) stats.tarkista++;
        } else {
            stats.no_match++;
            if (stats.no_match < 10) {
                console.log(`NO MATCH for: ${company.nimi} (${cName}) at ${cLat},${cLon}`);
            }
        }
    });

    const linksPath = path.join(__dirname, 'company_place_links.json');
    fs.writeFileSync(linksPath, JSON.stringify(links, null, 2));
    
    const reportPath = path.join(__dirname, 'company_place_match_report.json');
    fs.writeFileSync(reportPath, JSON.stringify(stats, null, 2));
    
    console.log(`\nMATCHAUS RAPORTTI`);
    console.log(`-----------------`);
    console.log(`Yrityksiä:      ${stats.total}`);
    console.log(`VARMA:          ${stats.varma}`);
    console.log(`TODENNÄKÖINEN:  ${stats.todennakoinen}`);
    console.log(`TARKISTA:       ${stats.tarkista}`);
    console.log(`EI MATCHIA:     ${stats.no_match}`);
    console.log(`\nResults saved to ${linksPath} and ${reportPath}`);
}

run();
