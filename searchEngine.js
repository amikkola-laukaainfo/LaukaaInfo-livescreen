/**
 * Shared Search Logic for LaukaaInfo
 * This file contains the extracted logic from palvelu.html for reuse in 
 * the Node validator and the React profiling app.
 */

function getCategoryData(c, profilingKey) {
    if (!c.profiling) return null;
    const hyphenKey = profilingKey.replace(/_/g, '-');
    if (c.profiling.categories) {
        return c.profiling.categories[profilingKey] || c.profiling.categories[hyphenKey] || c.profiling[profilingKey] || c.profiling[hyphenKey] || null;
    }
    return c.profiling[profilingKey] || c.profiling[hyphenKey] || null;
}

function getFitsForScore(c, profilingKey) {
    if (!c.profiling?.core?.fits_for) return 0;
    const fits = c.profiling.core.fits_for;
    const hyphenKey = profilingKey.replace(/_/g, '-');
    return fits[profilingKey] || fits[hyphenKey] || 0;
}

function getCompanyCapacity(c, profilingKey) {
    const data = getCategoryData(c, profilingKey);
    if (!data) return 0;
    return data.capacity_max || 
           data.meeting_capacity || 
           data.seminar_capacity || 
           data.seated_capacity || 
           data.memorial_service_capacity || 
           data.outdoor_capacity || 
           data.catering_max_capacity || 0;
}

function getHaversineDistance(lat1, lon1, lat2, lon2) {
    if (!lat1 || !lon1 || !lat2 || !lon2) return Infinity;
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

const THRESHOLD_STRICT = 80;

/** Pisteytyspainot kun capability-kerros on käytössä (v6). */
const SCORE_WEIGHTS = {
    context: 0.6,
    capability: 0.3,
    proximity: 0.1
};

function normalizeCapabilityCode(code) {
    if (!code) return '';
    return String(code).replace(/^capability-/i, '').toUpperCase();
}

function getCompanyCapabilities(c) {
    return (c.profiling && c.profiling.capabilities) ? c.profiling.capabilities : {};
}

function getCapabilityEntry(c, code) {
    const caps = getCompanyCapabilities(c);
    const norm = normalizeCapabilityCode(code);
    const raw = caps[norm] || caps[code] || null;
    if (!raw) return null;
    return normalizeCapabilityEntry(raw);
}

function normalizeInventoryItem(raw) {
    if (!raw) return null;
    if (typeof raw === 'string') {
        const s = raw.trim();
        return s ? { type: s } : null;
    }
    if (typeof raw === 'object' && !Array.isArray(raw)) {
        const type = String(raw.type || raw.label || '').trim();
        if (!type) return null;
        const item = { type };
        if (raw.label != null) item.label = String(raw.label);
        if (raw.count != null && !isNaN(Number(raw.count))) item.count = Number(raw.count);
        return item;
    }
    return null;
}

function normalizeCapabilityEntry(entry) {
    const next = Object.assign({}, entry);
    const specs = Object.assign({}, next.specs || {});

    if (!next.inventory && Array.isArray(specs.inventory)) {
        next.inventory = specs.inventory.map(normalizeInventoryItem).filter(Boolean);
        delete specs.inventory;
    }
    if (!next.additional_inventory && Array.isArray(specs.additional_inventory)) {
        next.additional_inventory = specs.additional_inventory.slice();
        delete specs.additional_inventory;
    }
    if (!next.categories && Array.isArray(specs.categories)) {
        next.categories = specs.categories.slice();
        delete specs.categories;
    }
    next.specs = specs;
    return next;
}

function getCapabilitySearchText(entry) {
    if (!entry) return '';
    const parts = [];
    (entry.categories || []).forEach(function (c) { parts.push(c); });
    (entry.inventory || []).forEach(function (item) {
        parts.push(item.type);
        if (item.label) parts.push(item.label);
    });
    (entry.additional_inventory || []).forEach(function (t) { parts.push(t); });
    return parts.join(' ').toLowerCase();
}

function capabilityMatchesInventoryTerm(entry, term) {
    if (!term) return true;
    const hay = getCapabilitySearchText(entry);
    const needle = String(term).toLowerCase().trim();
    if (!needle) return true;
    
    // Tarkista inventoryn tyypit
    const inventoryTypes = (entry.inventory || []).map(i => i.type.toLowerCase());
    if (inventoryTypes.some(t => t.includes(needle) || needle.includes(t))) return true;
    
    // Sallitaan osuvuus kategorioihin
    if (hay.indexOf(needle) !== -1) return true;
    
    // Salli yksittäiset sanat
    return needle.split(/\s+/).some(w => 
        w.length > 2 && (hay.indexOf(w) !== -1 || inventoryTypes.some(t => t.includes(w)))
    );
}
function specsMeet(requiredSpecs, specs) {
    if (!requiredSpecs || typeof requiredSpecs !== 'object') return true;
    const actual = specs || {};
    for (const key of Object.keys(requiredSpecs)) {
        if (actual[key] !== requiredSpecs[key]) return false;
    }
    return true;
}

/**
 * Yhden capability-vaatimuksen pisteytys 0–100.
 * @param {object} entry - profiling.capabilities[CODE]
 * @param {object|string} req - { code, min_priority?, required_specs? } tai pelkkä koodi
 */
function getSingleCapabilityScore(entry, req) {
    const requirement = typeof req === 'string' ? { code: req } : (req || {});
    if (!entry || entry.available === false) return 0;

    const minPriority = requirement.min_priority != null ? requirement.min_priority : 0;
    const priority = entry.priority_score != null ? entry.priority_score : 1;
    if (priority < minPriority) return 0;

    const specs = entry.specs != null ? entry.specs : {};
    if (!specsMeet(requirement.required_specs, specs)) return 0;

    if (requirement.inventory_match && !capabilityMatchesInventoryTerm(entry, requirement.inventory_match)) {
        return 0;
    }

    return Math.min(100, Math.round(priority * 100));
}

/**
 * Usean capability-vaatimuksen yhteispisteet.
 * Oletus: kaikki vaaditut (mode !== 'any').
 */
function getCapabilityFit(c, requirements) {
    if (!requirements || requirements.length === 0) return 100;

    const list = requirements.map(r =>
        typeof r === 'string' ? { code: r } : r
    );
    const mode = list[0] && list[0]._mode ? list[0]._mode : 'all';

    const scores = list.map(req =>
        getSingleCapabilityScore(getCapabilityEntry(c, req.code || req), req)
    );

    if (mode === 'any') return Math.max(0, ...scores);
    return scores.length ? Math.min(...scores) : 0;
}

function meetsCapabilityRequirements(c, opt) {
    const reqs = opt.capability_requirements;
    if (!reqs || reqs.length === 0) return true;
    return getCapabilityFit(c, reqs) > 0;
}

function getContextFit(c, context, opt) {
    let score = getFitsForScore(c, context);
    if (opt && opt.intent_codes && c.profiling?.core?.intent_scores) {
        const intentScores = opt.intent_codes
            .map(code => c.profiling.core.intent_scores[code] || 0);
        if (intentScores.length) {
            score = Math.max(score, ...intentScores);
        }
    }
    return Math.min(100, score);
}

function getProximityFit(c, userLocation) {
    if (!userLocation || userLocation.lat == null || userLocation.lng == null) return 50;
    const lat = parseFloat(c.lat);
    const lon = parseFloat(c.lon || c.lng);
    if (isNaN(lat) || isNaN(lon)) return 30;
    const dist = getHaversineDistance(userLocation.lat, userLocation.lng, lat, lon);
    if (!isFinite(dist)) return 30;
    if (dist <= 5) return 100;
    if (dist <= 15) return 80;
    if (dist <= 30) return 60;
    if (dist <= 60) return 40;
    return 20;
}

/**
 * Yhdistetty pisteytys (v6). Käytetään järjestykseen kun opt/requirements käyttää capabilityä.
 */
function scoreCompany(c, opt, context, userLocation, taxonomyData) {
    const contextFit = getContextFit(c, context, opt);
    let capabilityReqs = opt.capability_requirements || [];

    if (!capabilityReqs.length && taxonomyData?.intents && opt.intent_codes?.length) {
        const boosts = new Set();
        opt.intent_codes.forEach(code => {
            const intent = taxonomyData.intents[code];
            (intent?.capability_boosts || []).forEach(b => boosts.add(b));
        });
        if (boosts.size) capabilityReqs = [...boosts];
    }

    // Handle direct capability_boost on option (v6.1)
    if (!capabilityReqs.length && opt.capability_boost && Array.isArray(opt.capability_boost)) {
        capabilityReqs = opt.capability_boost.map(code => ({ code }));
    }

    const capabilityFit = getCapabilityFit(c, capabilityReqs);
    const proximityFit = getProximityFit(c, userLocation);

    return (
        contextFit * SCORE_WEIGHTS.context +
        capabilityFit * SCORE_WEIGHTS.capability +
        proximityFit * SCORE_WEIGHTS.proximity
    );
}

function normalizeText(txt) {
    if (!txt) return "";
    return String(txt).toLowerCase()
        .replace(/Ã£Â¤/g, 'ä').replace(/Ã£Â¶/g, 'ö')
        .replace(/Ã£â€ž/g, 'ä').replace(/Ã£â€“/g, 'ö')
        .replace(/Ã¤/g, 'ä').replace(/Ã¶/g, 'ö')
        .replace(/Ã„/g, 'ä').replace(/Ã–/g, 'ö')
        .replace(/Ã¥/g, 'å').replace(/Ã…/g, 'å')
        .trim();
}

function getCompanyCollaborators(c) {
    if (!c || !c.profiling) return [];
    let collaborators = [];
    for (let k in c.profiling) {
        if (c.profiling[k] && Array.isArray(c.profiling[k].collaborated_with)) {
            collaborators = collaborators.concat(c.profiling[k].collaborated_with);
        }
    }
    return collaborators;
}

function isMatch(c, opt, context, subContextsReq, noCateringSelected, taxonomyData) {
    if (c.is_expired) return false;
    
    const labelLower = normalizeText(opt.label && opt.label.fi ? opt.label.fi : opt.label).toLowerCase();
    const fitsScore = getFitsForScore(c, context);
    const underscoreKey = context.replace(/-/g, '_');
    const hyphenKey = context.replace(/_/g, '-');
    
    let isProfiledMatch = false;

    const exclusions = (c.profiling && c.profiling.core && c.profiling.core.not_suitable_for) ? c.profiling.core.not_suitable_for : [];
    if (exclusions.some(exc => exc && labelLower.includes(normalizeText(exc).toLowerCase()))) {
        return false;
    }

    if (opt.exclude_if_capacity && getCompanyCapacity(c, context) > 0) {
        return false;
    }
    
    // INTENT-CODE TÄSMÄYS
    if (opt.intent_codes && c.profiling && c.profiling.core && c.profiling.core.intent_codes) {
        if (opt.intent_codes.some(code => c.profiling.core.intent_codes.includes(code))) isProfiledMatch = true;
    }

    if (opt.require_fits_for) {
        const rfKey = opt.require_fits_for.key;
        const rfMin = opt.require_fits_for.min || 20;
        const rfScore = getFitsForScore(c, rfKey);
        if (rfScore < rfMin) return false;
    }

    if (noCateringSelected) {
        const companyName = normalizeText(c.nimi || c.name).toLowerCase();
        const companyTags = normalizeText(c.tags).toLowerCase();
        const companyCat = normalizeText(c.kategoria || c.category).toLowerCase();
        
        const isCateringOption = labelLower.includes('pitopalvelu') || (opt.intent_codes || []).includes('BIZ_CATERING');
        
        if (!isCateringOption && (companyName.includes('pitopalvelu') || companyTags.includes('pitopalvelu') || companyCat.includes('pitopalvelu'))) {
            return false;
        }
    }

    const isVenueType = (opt.tags && opt.tags.includes('juhlatila')) || 
                        opt.node_link === 'JUHLATILA' || 
                        (labelLower.includes('tila') && !labelLower.includes('tilaisuus'));

    const isVenueSearch = (opt.capacity_req > 0 || 
                          isVenueType ||
                          labelLower.includes('muistotilaisuus') ||
                          labelLower.includes('kokous') ||
                          labelLower.includes('sauna') ||
                          labelLower.includes('juhla') ||
                          labelLower.includes('häät') ||
                          labelLower.includes('pikkujoulut')) && !opt.is_service;

    if (subContextsReq && subContextsReq.length > 0) {
        const companySubContexts = (c.profiling && c.profiling.core) ? c.profiling.core.sub_contexts : [];
        let isSubContextMatch = false;

        if (Array.isArray(companySubContexts)) {
            if (companySubContexts.length === 0) isSubContextMatch = true;
            else isSubContextMatch = subContextsReq.some(sc => companySubContexts.includes(sc));
        } else if (companySubContexts && typeof companySubContexts === 'object') {
            const relevantSubContexts = companySubContexts[underscoreKey] || companySubContexts[hyphenKey];
            if (relevantSubContexts) isSubContextMatch = subContextsReq.some(sc => relevantSubContexts.includes(sc));
            else isSubContextMatch = true; 
        } else {
            isSubContextMatch = true;
        }

        if (!isSubContextMatch) {
            const hasAnySubContexts = Array.isArray(companySubContexts) ? companySubContexts.length > 0 : !!companySubContexts;
            const isConstruction = context.includes('construction') || context.includes('housing') || context.includes('remontti');
            const isCatering = labelLower.includes('pitopalvelu') || labelLower.includes('leipomo') || (opt.intent_codes || []).includes('BIZ_CATERING');
            
            if (opt.sub_context && hasAnySubContexts && !isConstruction && !isCatering) return false; 
            if (isVenueSearch && hasAnySubContexts && fitsScore < THRESHOLD_STRICT && !isCatering) return false; 
        }
    }

    if (opt.node_link || opt.node_links) {
        const cLinks = (c.profiling && c.profiling.core) ? c.profiling.core.node_links || [] : [];
        const oLinks = opt.node_links || [opt.node_link];
        if (oLinks.some(l => l && cLinks.includes(l))) isProfiledMatch = true;
    }

    if (opt.profilointi_filter) {
        const pf = opt.profilointi_filter;
        const sectionData = getCategoryData(c, pf.section);
        let match = false;

        if (sectionData) {
            const actualVal = sectionData[pf.field];
            const checkFuzzyMatch = (a, b) => {
                if (a === b) return true;
                if (typeof a === 'string' && typeof b === 'string') {
                    const na = normalizeText(a);
                    const nb = normalizeText(b);
                    return na === nb || na === nb + 't' || nb === na + 't' || na.includes(nb) || nb.includes(na);
                }
                return false;
            };

            if (Array.isArray(actualVal)) match = actualVal.some(v => checkFuzzyMatch(v, pf.value));
            else if (typeof actualVal === 'object' && actualVal !== null) match = Object.values(actualVal).flat().some(v => checkFuzzyMatch(v, pf.value));
            else match = checkFuzzyMatch(actualVal, pf.value);

            if (!match && Array.isArray(sectionData.refinement_tags)) {
                match = sectionData.refinement_tags.some(v => checkFuzzyMatch(v, pf.value));
            }
        }
        
        if (opt.node_link || opt.node_links) isProfiledMatch = isProfiledMatch && match;
        else isProfiledMatch = match;
    }

    // TAKSONOMIA-TÄSMÄYS
    if (taxonomyData && !isProfiledMatch && !opt.profilointi_filter) {
        const targetIntentId = (opt.intent_codes && opt.intent_codes.length > 0) ? opt.intent_codes[0] : context;
        
        let intent;
        if (Array.isArray(taxonomyData.intents)) {
            intent = taxonomyData.intents.find(i => i.id === targetIntentId || i.id === targetIntentId.replace(/_/g, '-'));
        } else if (taxonomyData.intents && typeof taxonomyData.intents === 'object') {
            intent = taxonomyData.intents[targetIntentId] || taxonomyData.intents[targetIntentId.replace(/_/g, '-')];
        }

        if (intent) {
            const refinements = intent.refinements || intent.tags || [];
            const subcontexts = intent.subcontexts || [];
            const nodeLinks = intent.nodeLinks || intent.node_links || [];
            
            const isTaxonomyTerm = refinements.some(r => labelLower.includes(r.toLowerCase())) ||
                                   subcontexts.some(s => labelLower.includes(s.toLowerCase()));
            
            if (isTaxonomyTerm) {
                const companyContent = (
                    (c.tags || '') + ' ' + 
                    (c.kategoria || '') + ' ' + 
                    (c.nimi || '') + ' ' +
                    (c.profiling?.core?.sub_contexts?.join(' ') || '') + ' ' +
                    (c.profiling?.core?.node_links?.join(' ') || '')
                ).toLowerCase();
                
                const taxonomyMatch = refinements.concat(subcontexts).some(term => {
                    const t = term.toLowerCase();
                    return labelLower.includes(t) && companyContent.includes(t);
                });
                if (taxonomyMatch) isProfiledMatch = true;
            }

            if (!isProfiledMatch && nodeLinks.length > 0) {
                const links = c.profiling?.core?.node_links || [];
                if (nodeLinks.some(nl => links.includes(nl))) {
                    const isTila = labelLower.includes('tila') && !labelLower.includes('tilaisuus');
                    const isVenueIntent = targetIntentId.startsWith('VENUE_');
                    if (isTila || isVenueIntent || (opt.tags && opt.tags.some(t => {
                        const tl = t.toLowerCase();
                        return tl.includes('tila') && !tl.includes('tilaisuus');
                    }))) {
                        isProfiledMatch = true;
                    }
                }
            }
        }
    }

    if (!isProfiledMatch && opt.tags) {
        const companyContent = (
            (c.tags || '') + ' ' + 
            (c.kategoria || c.category || '') + ' ' + 
            (c.nimi || c.name || '')
        ).toLowerCase();

        const optTagsLower = opt.tags.map(t => normalizeText(t));
        if (optTagsLower.some(tag => {
            const nt = normalizeText(tag);
            // Tarkistetaan molemmat suunnat
            return companyContent.includes(nt) || nt.split(' ').some(word => word.length > 3 && companyContent.includes(word));
        })) {
            isProfiledMatch = true;
        }
    }

    if (opt.capacity_req > 0) {
        const cap = getCompanyCapacity(c, context);
        if (cap === 0) return false;
    }

    if (!opt.capacity_req && opt.node_link !== 'JUHLATILA') {
        const companyCap = getCompanyCapacity(c, context);
        if (companyCap > 0) {
            const intentScores = (c.profiling && c.profiling.core) ? c.profiling.core.intent_scores || {} : {};
            const hasStrongServiceMatch = (opt.intent_codes || []).some(code => (intentScores[code] || 0) >= THRESHOLD_STRICT);
            
            if (!hasStrongServiceMatch && fitsScore < THRESHOLD_STRICT) {
                return false;
            }
        }
    }

    if (isProfiledMatch) {
        if (opt.capability_requirements && opt.capability_requirements.length > 0) {
            if (!meetsCapabilityRequirements(c, opt)) return false;
        }
        if (isVenueSearch) {
            const cap = getCompanyCapacity(c, context);
            if (cap === 0) return false;
        }
        return true;
    }

    if (fitsScore === 0 && (c.profiling && c.profiling.core && c.profiling.core.fits_for)) {
        const hasProfiling = (context in c.profiling.core.fits_for) || (context.replace(/_/g, '-') in c.profiling.core.fits_for);
        if (hasProfiling) return false;
    }

    return false;
}

/**
 * Main processing function for search results.
 * Identical logic for both palvelu.html and React simulator.
 */
function processSearchResults(allCompanies, selections, currentNeedId, needToProfilingMap, taxonomyData, userLocation = null, activeCollaborators = []) {
    const profilingKey = needToProfilingMap[currentNeedId] || currentNeedId;
    const requestedCapacity = selections.find(s => s.capacity_req)?.capacity_req || 0;
    const requestedFeatures = {
        sauna: selections.some(s => s.tags?.includes('sauna') || s.node_link === 'SAUNA'),
        accessible: selections.some(s => s.tags?.includes('esteetön') || s.node_link === 'ACCESSIBLE'),
        home_service: selections.some(s => s.tags?.includes('kotikäynti') || s.node_link === 'HOME_SERVICE')
    };

    const subContextsReq = selections.filter(s => s.sub_context).map(s => s.sub_context);
    const noCateringSelected = selections.some(s => s.id === 'OPT_NO_CATERING');
    const collaboratorsSet = new Set(activeCollaborators);

    // 1. Group companies by their matching options
    let matchingGroups = [];
    const companiesToProcess = [...allCompanies];

    // Special logic for Funerals (Hautajaiset):
    // If the user selects "Muistotilaisuus" (OPT_FUNERAL_MEMORIAL) and also selects a specific venue/capacity option (OPT_FUNERAL_CAP_*),
    // do not show the general "Muistotilaisuus" group separately, but show the "juhlatila" (capacity) options directly.
    const hasFuneralMemorial = selections.some(s => s.id === 'OPT_FUNERAL_MEMORIAL');
    const hasFuneralVenue = selections.some(s => s.id && s.id.startsWith('OPT_FUNERAL_CAP_'));

    selections.forEach(opt => {
        if (opt.is_step || opt.id === 'OPT_NO_CATERING' || opt.is_info || opt.hide_results) return;

        // Skip general Memorial Service group if a specific venue/capacity option is chosen
        if (opt.id === 'OPT_FUNERAL_MEMORIAL' && hasFuneralMemorial && hasFuneralVenue) return;

        const groupCompanies = companiesToProcess.filter(c => 
            isMatch(c, opt, profilingKey, subContextsReq, noCateringSelected, taxonomyData)
        );

        if (groupCompanies.length > 0) {
            matchingGroups.push({
                opt: opt,
                companies: groupCompanies
            });
        }
    });

    // 2. Special Logic: Combined Corporate Group
    const isCorporateSearch = profilingKey === 'events_and_celebrations' && selections.some(s => s.id === 'OPT_CORP_EVENT');
    if (isCorporateSearch) {
        const venueGroup = matchingGroups.find(g => g.opt.node_link === 'JUHLATILA');
        const stayGroup = matchingGroups.find(g => g.opt.intent_codes?.includes('STAY_HOTEL'));
        
        if (venueGroup && stayGroup) {
            const bothMatchIds = new Set(venueGroup.companies.filter(vc => stayGroup.companies.some(sc => sc.id === vc.id)).map(c => c.id));
            
            // Mark companies that match both
            matchingGroups.forEach(g => {
                g.companies = g.companies.map(c => ({
                    ...c,
                    _isBothMatch: bothMatchIds.has(c.id)
                }));
            });
        }
    }

    // 3. Deduplicate groups
    let finalGroups = [];
    const seenIdsSets = [];

    matchingGroups.forEach(group => {
        const groupIds = new Set(group.companies.map(c => c.id));
        const isDuplicate = seenIdsSets.some(set => {
            if (set.size !== groupIds.size) return false;
            for (let id of set) if (!groupIds.has(id)) return false;
            return true;
        });

        if (!isDuplicate) {
            finalGroups.push(group);
            seenIdsSets.push(groupIds);
        }
    });

    // 4. Sort companies within each group
    finalGroups.forEach(group => {
        group.companies.sort((a, b) => {
            let scoreA = getFitsForScore(a, profilingKey);
            let scoreB = getFitsForScore(b, profilingKey);

            if (collaboratorsSet.has(a.id) || collaboratorsSet.has(a.nimi)) scoreA += 45;
            if (collaboratorsSet.has(b.id) || collaboratorsSet.has(b.nimi)) scoreB += 45;

            if (a._isBothMatch) scoreA += 5000;
            if (b._isBothMatch) scoreB += 5000;

            if (requestedCapacity > 0) {
                const capA = getCompanyCapacity(a, profilingKey);
                const capB = getCompanyCapacity(b, profilingKey);
                
                if (capA >= requestedCapacity) {
                    scoreA += 60;
                    if (capA <= requestedCapacity * 2.5) scoreA += 40;
                } else if (capA > 0) scoreA -= 50;

                if (capB >= requestedCapacity) {
                    scoreB += 60;
                    if (capB <= requestedCapacity * 2.5) scoreB += 40;
                } else if (capB > 0) scoreB -= 50;
            }

            const dataA = getCategoryData(a, profilingKey);
            const dataB = getCategoryData(b, profilingKey);
            if (requestedFeatures.sauna) {
                if (dataA?.has_sauna) scoreA += 50;
                if (dataB?.has_sauna) scoreB += 50;
            }
            if (requestedFeatures.accessible) {
                if (dataA?.is_accessible) scoreA += 50;
                if (dataB?.is_accessible) scoreB += 50;
            }

            // Location sorting
            if (userLocation) {
                const distA = getHaversineDistance(userLocation.lat, userLocation.lng, parseFloat(a.lat), parseFloat(a.lon || a.lng));
                const distB = getHaversineDistance(userLocation.lat, userLocation.lng, parseFloat(b.lat), parseFloat(b.lon || b.lng));

                if (!isNaN(distA) && !isNaN(distB)) {
                    if (Math.abs(distA - distB) > 0.5) return distA - distB;
                    if (distA < distB) scoreA += 10;
                    else if (distB < distA) scoreB += 10;
                } else {
                    if (!isNaN(distA)) return -1;
                    if (!isNaN(distB)) return 1;
                }
            }

            if (scoreA !== scoreB) return scoreB - scoreA;
            
            const aIsPremium = (a.paketti || a.tyyppi || '').toLowerCase().match(/premium|pro/);
            const bIsPremium = (b.paketti || b.tyyppi || '').toLowerCase().match(/premium|pro/);
            if (aIsPremium && !bIsPremium) return -1;
            if (!aIsPremium && bIsPremium) return 1;

            const prioA = a.profiling?.core?.priority_score || 0;
            const prioB = b.profiling?.core?.priority_score || 0;
            if (prioB !== prioA) return prioB - prioA;

            const hasCapabilitySignals = group.opt.capability_requirements?.length ||
                (taxonomyData?.intents && group.opt.intent_codes?.some(code =>
                    taxonomyData.intents[code]?.capability_boosts?.length
                ));
            if (hasCapabilitySignals) {
                const v6A = scoreCompany(a, group.opt, profilingKey, userLocation, taxonomyData);
                const v6B = scoreCompany(b, group.opt, profilingKey, userLocation, taxonomyData);
                if (v6B !== v6A) return v6B - v6A;
            }

            return 0;
        });
    });

    return {
        groups: finalGroups,
        fingerprint: generateSearchFingerprint(currentNeedId, selections, finalGroups)
    };
}

function generateSearchFingerprint(needId, selections, finalGroups) {
    return {
        needId: needId,
        optionIds: selections.map(s => s.id || s.label?.fi || s.label).sort(),
        resultSummary: finalGroups.map(g => ({
            groupTitle: g.opt.label?.fi || g.opt.label,
            companyIds: g.companies.map(c => c.id).slice(0, 5)
        }))
    };
}
/**
 * Shared Recommendation Logic
 * Generates "Next Steps" suggestions based on:
 * 1. NEEDS_CONFIG (Core path options)
 * 2. Taxonomy (Related intents)
 * 3. Profiling (Paired services)
 */
function getRecommendations(needId, context, selectionsArr, allCompanies, taxonomyData, needsConfig, i18nHelper) {
    const recommendations = [];
    const seenNormalized = new Set();
    const contextHyphenated = context.replace(/_/g, '-');

    function addRec(rec) {
        if (!rec) return;
        const text = (typeof rec === 'string') ? rec : (i18nHelper ? i18nHelper.getText(rec) : (rec.fi || rec.en || ""));
        if (!text || text.length < 2) return;
        
        const normalized = text.trim().toLowerCase();
        if (!seenNormalized.has(normalized)) {
            seenNormalized.add(normalized);
            const display = text.trim().charAt(0).toUpperCase() + text.trim().slice(1);
            recommendations.push(display);
        }
    }

    // A. PRIORITY 1: Guided Search Path Options (from NEEDS_CONFIG)
    // These are the most "intentional" suggestions.
    const need = needsConfig ? needsConfig[needId] : null;
    if (need) {
        const selectedIds = new Set((selectionsArr || []).map(s => s.id));
        const stepsWithSelection = new Set();
        
        (need.steps || []).forEach(step => {
            const hasSel = (step.options || []).some(opt => selectedIds.has(opt.id));
            if (hasSel && !step.multiple) {
                stepsWithSelection.add(step.id);
            }
        });

        (need.steps || []).forEach(step => {
            // Skip recommending options from a single-select step that already has a selection
            if (stepsWithSelection.has(step.id)) return;

            (step.options || []).forEach(opt => {
                if (selectedIds.has(opt.id)) return;
                addRec(opt.label);
            });
        });
    }

    // B. PRIORITY 2: Taxonomy Relations
    if (taxonomyData && taxonomyData.intents) {
        // Find intent (direct or via group)
        let intentIds = [context, contextHyphenated];
        
        // If taxonomy includes groups, find which group this context belongs to
        const group = (taxonomyData.groups || []).find(g => g.id === context || g.id === contextHyphenated);
        if (group && group.codes) {
            intentIds = [...intentIds, ...group.codes];
        }

        const matchingIntents = taxonomyData.intents.filter(i => intentIds.includes(i.id));
        
        matchingIntents.forEach(intent => {
            // 1. Subcontexts and Refinements
            const taxonomyTags = [...(intent.subcontexts || []), ...(intent.refinements || [])];
            const selectedSubContexts = selectionsArr.filter(s => s.sub_context).map(s => s.sub_context.toLowerCase());
            
            taxonomyTags.forEach(tag => {
                if (!selectedSubContexts.includes(tag.toLowerCase())) {
                    addRec(tag);
                }
            });

            // 2. Relations
            if (taxonomyData.relations) {
                const relations = taxonomyData.relations.filter(r => r.from === intent.id);
                relations.forEach(r => {
                    const target = taxonomyData.intents.find(i => i.id === r.to);
                    if (target) addRec(target.label);
                    else addRec(r.to);
                });
            }
        });

        // 3. Relations from selected options
        selectionsArr.forEach(opt => {
            if (opt.intent_codes) {
                opt.intent_codes.forEach(code => {
                    const rels = (taxonomyData.relations || []).filter(r => r.from === code);
                    rels.forEach(r => {
                        const target = taxonomyData.intents.find(i => i.id === r.to);
                        if (target) addRec(target.label);
                        else addRec(r.to);
                    });
                });
            }
        });
    }

    // C. PRIORITY 3: Profiling Data (Paired services)
    const topCompanies = (allCompanies || []).filter(c => {
        const score = getFitsForScore(c, context);
        return score >= 70;
    });

    topCompanies.forEach(c => {
        const pairedObj = c.profiling?.core?.paired_with_by_context || {};
        let paired = pairedObj[context] || pairedObj[contextHyphenated] || [];
        
        // Filter out venues if the company itself is a service provider without capacity
        const companyCap = getCompanyCapacity(c, context);
        if (companyCap === 0) {
            paired = paired.filter(p => {
                const pText = (typeof p === 'string' ? p : (i18nHelper ? i18nHelper.getText(p) : (p.fi || ""))).toLowerCase();
                const isVenueTerm = pText.includes('juhlatila') || pText.includes('kokoustila') || pText.includes('majoitus');
                return !isVenueTerm;
            });
        }

        paired.forEach(p => addRec(p));
    });

    return recommendations.slice(0, 12);
}


/**
 * Palauttaa valinnat NEEDS_CONFIG-viitteistä (sessionStorage / pikahaku).
 * Varmistaa että jokaisella valinnalla on tagit, intent_codes jne.
 */
function rehydrateSelectionsFromConfig(needId, rawSelections) {
    const config = (typeof NEEDS_CONFIG !== 'undefined' ? NEEDS_CONFIG : null)
        || (typeof window !== 'undefined' && window.NEEDS_CONFIG ? window.NEEDS_CONFIG : null);
    if (!config || !needId || !config[needId] || !rawSelections) return rawSelections || {};

    const need = config[needId];
    const out = {};

    if (rawSelections._sub_contexts) {
        out._sub_contexts = Array.isArray(rawSelections._sub_contexts)
            ? [...rawSelections._sub_contexts]
            : rawSelections._sub_contexts;
    }

    const resolveOption = (step, stored) => {
        if (!stored) return null;
        if (stored.id) {
            const byId = step.options.find(o => o.id === stored.id);
            if (byId) return byId;
        }
        const storedLabel = normalizeText(
            stored.label && stored.label.fi ? stored.label.fi : stored.label
        ).toLowerCase();
        if (storedLabel) {
            const byLabel = step.options.find(o => {
                const optLabel = normalizeText(o.label && o.label.fi ? o.label.fi : o.label).toLowerCase();
                return optLabel === storedLabel;
            });
            if (byLabel) return byLabel;
        }
        return stored;
    };

    need.steps.forEach(step => {
        const val = rawSelections[step.id];
        if (!val) return;
        if (step.multiple) {
            const arr = (Array.isArray(val) ? val : [val])
                .map(v => resolveOption(step, v))
                .filter(Boolean);
            if (arr.length) out[step.id] = arr;
        } else {
            const resolved = resolveOption(step, val);
            if (resolved) out[step.id] = resolved;
        }
    });

    const subContexts = [];
    for (const key in out) {
        if (key.startsWith('_')) continue;
        const val = out[key];
        const items = Array.isArray(val) ? val : [val];
        items.forEach(opt => {
            if (opt.sub_context && !subContexts.includes(opt.sub_context)) {
                subContexts.push(opt.sub_context);
            }
        });
    }
    if (subContexts.length) out._sub_contexts = subContexts;

    return out;
}

if (typeof module !== 'undefined') {
    module.exports = { 
        getCategoryData, 
        getFitsForScore, 
        getCompanyCapacity, 
        getHaversineDistance,
        normalizeCapabilityCode,
        getCompanyCapabilities,
        getCapabilityEntry,
        normalizeCapabilityEntry,
        getCapabilitySearchText,
        capabilityMatchesInventoryTerm,
        getCapabilityFit,
        meetsCapabilityRequirements,
        getContextFit,
        getProximityFit,
        scoreCompany,
        SCORE_WEIGHTS,
        isMatch, 
        processSearchResults,
        generateSearchFingerprint,
        getRecommendations,
        rehydrateSelectionsFromConfig
    };
}
