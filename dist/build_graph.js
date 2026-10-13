const fs = require('fs');
const path = require('path');

const profilingFile = path.join(__dirname, 'company_profiling_data.json');
const companiesFile = path.join(__dirname, 'companies_data.json');
const taxonomyFile = path.join(__dirname, 'taxonomy.json');

function readJsonFile(filePath) {
    if (!fs.existsSync(filePath)) {
        console.error(`Tiedostoa ei löydy: ${filePath}`);
        return null;
    }
    let content = fs.readFileSync(filePath, 'utf8');
    // Poistetaan mahdolliset UTF-8 BOM -merkit
    if (content.charCodeAt(0) === 0xFEFF) {
        content = content.slice(1);
    }
    return JSON.parse(content);
}

function run() {
    console.log('--- Aloitetaan tietämysgraafin rakentaminen ---');

    const profilingData = readJsonFile(profilingFile);
    const companiesData = readJsonFile(companiesFile);
    const taxonomyData = readJsonFile(taxonomyFile);

    if (!profilingData || !companiesData || !taxonomyData) {
        console.error('Virhe tiedostojen lukemisessa. Graafin rakentaminen peruttu.');
        return;
    }

    const companiesList = Array.isArray(companiesData) ? companiesData : (companiesData.results || []);
    
    // Luodaan hakumappi yrityksille nopeaa lukua varten
    const companiesMap = {};
    companiesList.forEach(c => {
        if (c.id) companiesMap[c.id] = c;
    });

    const nodes = {};
    const edges = [];

    // 1. Lisätään taksonomiaryhmät (groups)
    if (Array.isArray(taxonomyData.groups)) {
        taxonomyData.groups.forEach(g => {
            nodes[`group-${g.id}`] = {
                type: 'group',
                name: g.name
            };
        });
    }

    // 2. Lisätään taksonomiaintentit (intents)
    if (taxonomyData.intents) {
        Object.entries(taxonomyData.intents).forEach(([code, intent]) => {
            const intentId = `intent-${code}`;
            nodes[intentId] = {
                type: 'intent',
                name: intent.fi || code
            };

            // Lisätään taksonomian mukaiset implisiittiset node_links suhteet
            if (Array.isArray(intent.node_links)) {
                intent.node_links.forEach(link => {
                    const linkId = `nodelink-${link}`;
                    if (!nodes[linkId]) {
                        nodes[linkId] = {
                            type: 'nodelink',
                            name: link
                        };
                    }
                    edges.push({
                        from: intentId,
                        to: linkId,
                        relation: 'implies'
                    });
                });
            }
        });
    }

    // 3. Lisätään yritykset ja suhteet profiileista
    const profiles = profilingData.profiles || {};
    
    Object.entries(profiles).forEach(([companyId, profile]) => {
        const compDetails = companiesMap[companyId] || {};
        
        // Luodaan yrityssolmu
        nodes[companyId] = {
            type: 'company',
            name: compDetails.nimi || profile.name || companyId,
            category: compDetails.kategoria || '',
            package: compDetails.package || compDetails.paketti || '',
            lat: compDetails.lat ? parseFloat(compDetails.lat) : null,
            lon: compDetails.lon ? parseFloat(compDetails.lon) : null,
            address: compDetails.osoite || ''
        };

        const core = profile.core || {};

        // 3.1 Yritys ──[offers]──> Palvelu (Intent)
        if (core.intent_scores) {
            Object.entries(core.intent_scores).forEach(([code, score]) => {
                if (score > 0) {
                    const intentId = `intent-${code}`;
                    // Varmistetaan että solmu on olemassa
                    if (!nodes[intentId]) {
                        const taxIntent = taxonomyData.intents ? taxonomyData.intents[code] : null;
                        nodes[intentId] = {
                            type: 'intent',
                            name: taxIntent ? (taxIntent.fi || code) : code
                        };
                    }
                    edges.push({
                        from: companyId,
                        to: intentId,
                        relation: 'offers',
                        weight: score
                    });
                }
            });
        }

        // 3.2 Yritys ──[fits_for]──> Ryhmä/Konteksti (Group)
        if (core.fits_for) {
            Object.entries(core.fits_for).forEach(([groupKey, score]) => {
                if (score > 0) {
                    const groupId = `group-${groupKey}`;
                    if (!nodes[groupId]) {
                        const taxGroup = Array.isArray(taxonomyData.groups) ? taxonomyData.groups.find(g => g.id === groupKey) : null;
                        nodes[groupId] = {
                            type: 'group',
                            name: taxGroup ? taxGroup.name : groupKey
                        };
                    }
                    edges.push({
                        from: companyId,
                        to: groupId,
                        relation: 'fits_for',
                        weight: score
                    });
                }
            });
        }

        // 3.3 Yritys ──[located_in]──> Alue (Area)
        if (core.service_area && Array.isArray(core.service_area.regions)) {
            core.service_area.regions.forEach(region => {
                if (region && region !== '-' && region.trim() !== '') {
                    const regionId = `region-${region.toLowerCase().trim().replace(/\s+/g, '-')}`;
                    if (!nodes[regionId]) {
                        nodes[regionId] = {
                            type: 'area',
                            name: region
                        };
                    }
                    edges.push({
                        from: companyId,
                        to: regionId,
                        relation: 'located_in'
                    });
                }
            });
        } else if (compDetails.alue_slug) {
            const region = compDetails.alue_slug;
            const regionId = `region-${region.toLowerCase().trim().replace(/\s+/g, '-')}`;
            if (!nodes[regionId]) {
                nodes[regionId] = {
                    type: 'area',
                    name: region
                };
            }
            edges.push({
                from: companyId,
                to: regionId,
                relation: 'located_in'
            });
        }

        // 3.4 Yritys ──[links_to]──> Nodelink
        if (Array.isArray(core.node_links)) {
            core.node_links.forEach(link => {
                if (link && link.trim() !== '') {
                    const linkId = `nodelink-${link}`;
                    if (!nodes[linkId]) {
                        nodes[linkId] = {
                            type: 'nodelink',
                            name: link
                        };
                    }
                    edges.push({
                        from: companyId,
                        to: linkId,
                        relation: 'links_to'
                    });
                }
            });
        }

        // 3.5 Yritys ──[collaborated_with]──> Toinen Yritys (Yhteistyö)
        if (profile.categories) {
            Object.entries(profile.categories).forEach(([catKey, catData]) => {
                if (catData && Array.isArray(catData.collaborated_with)) {
                    catData.collaborated_with.forEach(partnerId => {
                        if (partnerId && partnerId !== companyId) {
                            edges.push({
                                from: companyId,
                                to: partnerId,
                                relation: 'collaborated_with',
                                category: catKey
                            });
                        }
                    });
                }
            });
        }

        // 3.6 Yritys ──[recommends_with]──> Toinen Yritys (Yhdessä suositellut)
        if (core.paired_with_by_context) {
            Object.entries(core.paired_with_by_context).forEach(([contextKey, partners]) => {
                if (Array.isArray(partners)) {
                    partners.forEach(partnerId => {
                        if (partnerId && partnerId !== companyId) {
                            edges.push({
                                from: companyId,
                                to: partnerId,
                                relation: 'recommends_with',
                                context: contextKey
                            });
                        }
                    });
                } else if (partners && typeof partners === 'object') {
                    Object.entries(partners).forEach(([subKey, subPartners]) => {
                        if (Array.isArray(subPartners)) {
                            subPartners.forEach(partnerId => {
                                if (partnerId && partnerId !== companyId) {
                                    edges.push({
                                        from: companyId,
                                        to: partnerId,
                                        relation: 'recommends_with',
                                        context: `${contextKey}.${subKey}`
                                    });
                                }
                            });
                        }
                    });
                }
            });
        }
    });

    // Tallennetaan takaisin company_profiling_data.json -tiedostoon
    profilingData.nodes = nodes;
    profilingData.edges = edges;

    fs.writeFileSync(profilingFile, JSON.stringify(profilingData, null, 4), 'utf8');
    console.log(`✓ Tietämysgraafi päivitetty tiedostoon ${path.basename(profilingFile)}.`);
    console.log(`  - Solmuja (Nodes): ${Object.keys(nodes).length}`);
    console.log(`  - Kaaria (Edges): ${edges.length}`);
}

run();
