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
    const labelLower = normalizeText(opt.label && opt.label.fi ? opt.label.fi : opt.label).toLowerCase();
    const fitsScore = getFitsForScore(c, context);
    const underscoreKey = context.replace(/-/g, '_');
    const hyphenKey = context.replace(/_/g, '-');
    
    let isProfiledMatch = false;

    const exclusions = (c.profiling && c.profiling.core && c.profiling.core.not_suitable_for) ? c.profiling.core.not_suitable_for : [];
    if (exclusions.some(exc => exc && labelLower.includes(normalizeText(exc).toLowerCase()))) {
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
        const intent = taxonomyData.intents.find(i => i.id === targetIntentId || i.id === targetIntentId.replace(/_/g, '-'));
        if (intent) {
            const isTaxonomyTerm = intent.refinements.some(r => labelLower.includes(r.toLowerCase())) ||
                                   intent.subcontexts.some(s => labelLower.includes(s.toLowerCase()));
            
            if (isTaxonomyTerm) {
                const companyContent = (
                    (c.tags || '') + ' ' + 
                    (c.kategoria || '') + ' ' + 
                    (c.nimi || '') + ' ' +
                    (c.profiling?.core?.sub_contexts?.join(' ') || '') + ' ' +
                    (c.profiling?.core?.node_links?.join(' ') || '')
                ).toLowerCase();
                
                const taxonomyMatch = intent.refinements.concat(intent.subcontexts).some(term => {
                    const t = term.toLowerCase();
                    return labelLower.includes(t) && companyContent.includes(t);
                });
                if (taxonomyMatch) isProfiledMatch = true;
            }

            if (!isProfiledMatch && intent.nodeLinks) {
                const links = c.profiling?.core?.node_links || [];
                if (intent.nodeLinks.some(nl => links.includes(nl))) {
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

    selections.forEach(opt => {
        if (opt.is_step || opt.id === 'OPT_NO_CATERING' || opt.is_info) return;

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
        (need.steps || []).forEach(step => {
            (step.options || []).forEach(opt => {
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


if (typeof module !== 'undefined') {
    module.exports = { 
        getCategoryData, 
        getFitsForScore, 
        getCompanyCapacity, 
        getHaversineDistance,
        isMatch, 
        processSearchResults,
        generateSearchFingerprint,
        getRecommendations
    };
}
