        function isMatch(c, opt, context, subContextsReq, noCateringSelected) {
            const labelLower = normalizeText(opt.label && opt.label.fi ? opt.label.fi : opt.label).toLowerCase();
            const fitsScore = getFitsForScore(c, context);
            const underscoreKey = context.replace(/-/g, '_');
            const hyphenKey = context.replace(/_/g, '-');
            
            let isProfiledMatch = false;

            const exclusions = (c.profiling && c.profiling.core && c.profiling.core.not_suitable_for) ? c.profiling.core.not_suitable_for : [];
            if (exclusions.some(exc => exc && labelLower.includes(normalizeText(exc).toLowerCase()))) {
                return false;
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

            if (opt.intent_codes && c.profiling && c.profiling.core && c.profiling.core.intent_scores) {
                if (opt.intent_codes.some(code => (c.profiling.core.intent_scores[code] || 0) > 0)) isProfiledMatch = true;
            }

            // TAXONOMY MATCHING
            if (window.taxonomyData && !isProfiledMatch && !opt.profilointi_filter) {
                const targetIntentId = (opt.intent_codes && opt.intent_codes.length > 0) ? opt.intent_codes[0] : context;
                const intent = taxonomyData.intents.find(i => i.id === targetIntentId || i.id === targetIntentId.replace(/_/g, '-'));
                if (intent) {
                    const isTaxonomyTerm = intent.refinements.some(r => labelLower.includes(normalizeText(r).toLowerCase())) ||
                                           intent.subcontexts.some(s => labelLower.includes(normalizeText(s).toLowerCase()));
                    
                    if (isTaxonomyTerm) {
                        const companyContent = (
                            (c.tags || '') + ' ' + 
                            (c.kategoria || '') + ' ' + 
                            (c.nimi || '') + ' ' +
                            (c.profiling?.core?.sub_contexts?.join(' ') || '') + ' ' +
                            (c.profiling?.core?.node_links?.join(' ') || '')
                        ).toLowerCase();
                        
                        const taxonomyMatch = intent.refinements.concat(intent.subcontexts).some(term => {
                            const t = normalizeText(term).toLowerCase();
                            return labelLower.includes(t) && companyContent.includes(t);
                        });
                        if (taxonomyMatch) isProfiledMatch = true;
                    }

                    if (!isProfiledMatch && intent.nodeLinks) {
                        const links = (c.profiling && c.profiling.core) ? c.profiling.core.node_links || [] : [];
                        if (intent.nodeLinks.some(nl => links.includes(nl))) {
                            const isTila = labelLower.includes('tila') && !labelLower.includes('tilaisuus');
                            const isVenueIntent = targetIntentId.startsWith('VENUE_');
                            if (isTila || isVenueIntent || (opt.tags && opt.tags.some(t => {
                                const tl = normalizeText(t).toLowerCase();
                                return tl.includes('tila') && !tl.includes('tilaisuus');
                            }))) {
                                isProfiledMatch = true;
                            }
                        }
                    }
                }
            }

            // MEDIA BROADENING
            if (!isProfiledMatch && opt.tags) {
                const isPhotoSearch = opt.tags.some(t => t.includes('valokuva'));
                const isVideoSearch = opt.tags.some(t => t.includes('video') || t === 'videotuotanto');
                const isFloristSearch = opt.tags.some(t => t.includes('kukka'));
                
                const coreNodeLinks = (c.profiling && c.profiling.core) ? c.profiling.core.node_links || [] : [];
                if ((isPhotoSearch && coreNodeLinks.includes('VALOKUVAUS')) || 
                    (isVideoSearch && coreNodeLinks.includes('VIDEOTUOTANTO')) ||
                    (isFloristSearch && coreNodeLinks.includes('KUKAT'))) {
                    isProfiledMatch = true;
                }
            }

            if (!isProfiledMatch && opt.tags && opt.tags.includes('juhlatila')) {
                const eventsData = getCategoryData(c, 'events_and_celebrations');
                if (eventsData && fitsScore > 0 && (eventsData.capacity_max > 0 || eventsData.seated_capacity > 0)) {
                    isProfiledMatch = true;
                }
            }

            if (!isProfiledMatch && opt.tags) {
                const companyContent = (
                    (c.tags || '') + ' ' + 
                    (c.kategoria || c.category || '') + ' ' + 
                    (c.nimi || c.name || '')
                ).toLowerCase();

                const optTagsLower = opt.tags.map(t => normalizeText(t));
                if (optTagsLower.some(tag => companyContent.includes(tag))) {
                    isProfiledMatch = true;
                }
            }

            if (opt.capacity_req > 0) {
                const cap = getCompanyCapacity(c, context);
                if (cap === 0) return false;
            }

            // SERVICE VS VENUE SEGREGATION
            if (!opt.capacity_req && opt.node_link !== 'JUHLATILA') {
                const companyCap = getCompanyCapacity(c, context);
                if (companyCap > 0) {
                    const intentScores = (c.profiling && c.profiling.core) ? c.profiling.core.intent_scores || {} : {};
                    const hasStrongServiceMatch = (opt.intent_codes || []).some(code => (intentScores[code] || 0) >= 80);
                    
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

            if (!opt.tags || opt.tags.length === 0) {
                if (!opt.node_link && !opt.node_links && !opt.profilointi_filter && !(opt.capacity_req > 0)) {
                    return false;
                }
            }

            return false;
        }
