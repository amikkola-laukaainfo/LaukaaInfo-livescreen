document.addEventListener('DOMContentLoaded', async () => {
    // 1. Hae ID URL:sta
    const urlParams = new URLSearchParams(window.location.search);
    let placeId = urlParams.get('id');
    const placeNameParam = urlParams.get('name');

    if (!placeId && !placeNameParam) {
        showError();
        return;
    }

    try {
        const AI_SUPABASE_URL = 'https://duxluwyqxvbmkkjzuzkz.supabase.co';
        const AI_SUPABASE_KEY = 'sb_publishable_HgfWyipuSO7gvsVUR1smNQ_aXox2OPu';
        window.aiSb = window.supabase.createClient(AI_SUPABASE_URL, AI_SUPABASE_KEY);
        const aiSb = window.aiSb;

        // 2. Hae paikan tiedot Supabasesta
        let placeQuery = aiSb.from('places').select('*');
        
        if (placeId) {
            placeQuery = placeQuery.eq('place_id', placeId);
        } else if (placeNameParam) {
            const decodedName = decodeURIComponent(placeNameParam).replace(/_/g, ' ');
            const safeNameValue = decodedName.replace(/"/g, '');
            placeQuery = placeQuery.or(`name.ilike."${safeNameValue}",canonical_name.ilike."${safeNameValue}"`);
        }
        
        const { data: placesData, error: placeError } = await placeQuery.limit(1);

        if (placeError || !placesData || placesData.length === 0) {
            console.error('Virhe haettaessa paikkaa:', placeError);
            showError();
            return;
        }
        
        const placeData = placesData[0];
        
        // Ensure placeId is set for the rest of the logic if we searched by name
        if (!placeId) {
            placeId = placeData.place_id;
        }

        // 2.5. Hae AI-profilointidata (summary, themes, activities, faq)
        let aiProfileData = null;
        try {
            const { data: aiContentData, error: aiError } = await aiSb
                .from('organization_ai_content')
                .select('content')
                .eq('organization_id', placeId)
                .eq('content_type', 'place_profile')
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            if (!aiError && aiContentData && aiContentData.content) {
                try {
                    aiProfileData = JSON.parse(aiContentData.content);
                } catch (e) {
                    console.error('Virhe AI-datan jäsentelyssä:', e);
                }
            }
        } catch (err) {
            console.warn('AI-dataa ei löytynyt tai tapahtui virhe:', err);
        }

        // 3. Hae kohteet, tarjoukset ja yritykset JSON-tiedostoista
        const cacheBuster = new Date().getTime();
        let kohteet = [];
        let tarjoukset = [];
        let yritykset = [];
        try {
            const [kohteetRes, tarjouksetRes, yrityksetRes, tempRes] = await Promise.all([
                fetch('kohdekortit/kohteet.json?v=' + cacheBuster),
                fetch('kohdekortit/tarjoukset.json?v=' + cacheBuster),
                fetch('live_companies.json?v=' + cacheBuster),
                fetch('temp_companies.json?v=' + cacheBuster)
            ]);
            
            if (kohteetRes.ok) kohteet = await kohteetRes.json();
            if (tarjouksetRes.ok) tarjoukset = await tarjouksetRes.json();
            
            if (yrityksetRes.ok) {
                const yData = await yrityksetRes.json();
                if (yData.results) yritykset = yritykset.concat(yData.results);
            }
            if (tempRes.ok) {
                const tData = await tempRes.json();
                if (tData.results) yritykset = yritykset.concat(tData.results);
            }
        } catch (e) {
            console.error('Virhe JSONien latauksessa:', e);
        }
        
        // 4. Hae relaatiot Supabasesta (suorat relaatiot + tag-pohjaiset)
        // entity_tags käyttää paikan nimen slugia (esim. 'laukaa-kk'),
        // mutta placeId on Supabasen UUID/id. Lasketaan slug paikan nimen perusteella.
        const toSlug = (text) => text.toString().toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/å/g, 'a')
            .replace(/[^\w\-]+/g, '')
            .replace(/--+/g, '-')
            .replace(/^-+|-+$/g, '');
        
        // Muodosta slug ensin paikan nimestä (Laukaa kk → laukaa-kk)
        // Fallback: käytä placeId:tä jos slug-haku ei tuota tuloksia
        const placeName = placeData.name || placeData.canonical_name || '';
        const placeSlug = toSlug(placeName);

        const [relationsResult, tagMatchResult, visibilityResult] = await Promise.all([
            aiSb
                .from('place_relations')
                .select('entity_id, entity_type, entity_name, relation_type, relation_context, strength')
                .eq('place_id', placeId),
            // Tag-pohjainen haku: kokeillaan ensin slugilla, sitten placeId:llä
            aiSb.rpc('find_place_companies', { place_id: placeSlug, max_count: 20 })
                .then(async r => {
                    if (!r.data || r.data.length === 0) {
                        return aiSb.rpc('find_place_companies', { place_id: placeId, max_count: 20 });
                    }
                    return r;
                })
                .catch(() => ({ data: null, error: 'rpc not available' })),
            // Ostettu näkyvyys: haetaan yritykset joilla on aktiivinen company_visibility tähän paikkaan
            aiSb
                .from('company_visibility')
                .select('company_id, visibility_type, priority, target_id, visibility_targets(target_type, target_id)')
                .eq('status', 'ACTIVE')
                .or(`ends_at.is.null,ends_at.gt.${new Date().toISOString()}`)
                .then(res => res)
                .catch(() => ({ data: null })) // Ei kaadu vaikka taulu puuttuisi
        ]);
        const { data: relationsData, error: relationsError } = relationsResult;
        const { data: tagMatches } = tagMatchResult;
        // Suodata näkyvyysdata tähän paikkaan liittyviin merkintöihin
        const allVisibility = visibilityResult?.data || [];
        const visibilityData = allVisibility.filter(v => {
            const vt = v.visibility_targets;
            if (!vt) return false;
            return (vt.target_type === 'PLACE' && vt.target_id === String(placeId)) ||
                   (vt.target_type === 'AREA');
        });

        // Pisteytä yritykset uuden 4-tason mallin mukaisesti
        const scoredCompanies = scoreCompanies(yritykset, placeData, relationsData || [], tagMatches || [], visibilityData);

        // 5. Yhdistä tiedot poistaen duplikaatit
        const allItemsMap = new Map();
        
        [...kohteet, ...tarjoukset].forEach(item => {
            if (item.place_id === placeId) {
                allItemsMap.set(String(item.id), item);
            }
        });
        
        // Lisää kohteet ja tarjoukset ja ei-yritys relaatiot allItemsMapiin,
        // jotta ne näkyvät edelleen (esim. havainnot, tapahtumat)
        if (!relationsError && relationsData) {
            relationsData.forEach(r => {
                const eId = String(r.entity_id);
                let mappedType = (r.entity_type || 'other').toLowerCase();
                if (mappedType === 'company') mappedType = 'business';
                
                if (mappedType !== 'business' && !allItemsMap.has(eId)) {
                    allItemsMap.set(eId, {
                        id: eId,
                        type: mappedType,
                        name: r.entity_name || (mappedType === 'observation' ? 'Havainto' : eId),
                        shortDescription: r.relation_context || r.relation_type,
                        logo: null,
                        images: null
                    });
                }
            });
        }
        
        const otherRelatedItems = Array.from(allItemsMap.values());

        const placeIdStr = String(placeId);
        let allSources = [];
        let allContents = [];
        try {
            const [srcRes, cntRes] = await Promise.all([
                aiSb.from('place_sources').select('*').eq('place_id', placeIdStr),
                aiSb.from('place_content').select('*').eq('place_id', placeIdStr)
            ]);
            if (srcRes.data) allSources = srcRes.data;
            if (cntRes.data) allContents = cntRes.data;
        } catch (e) { console.warn(e); }

        // 6. Päivitä DOM
        await renderPlace(placeData, otherRelatedItems, aiProfileData, allSources, allContents, scoredCompanies);

        await loadMemoriesForPlace(placeData);
        await loadMediaForPlace(placeData);
        await loadEncountersForPlace(placeData);
        await loadLostItemsForPlace(placeData);

    } catch (err) {
        console.error('Yllättävä virhe:', err);
        showError();
    }
});


function showError() {
    document.getElementById('loading-spinner').style.display = 'none';
    document.getElementById('error-message').style.display = 'block';
}

async function loadMediaForPlace(place) {
    const mediaSection = document.getElementById('media-section');
    const mediaList = document.getElementById('media-list');
    const mediaBadge = document.getElementById('media-count-badge');
    if (!mediaSection || !mediaList) return;

    try {
        const { data: sources, error } = await aiSb
            .from('place_sources')
            .select('*')
            .eq('place_id', place.place_id)
            .in('source_type', ['IMAGE', 'PHOTO', 'YOUTUBE', 'YOUTUBE_VIDEO', 'VIDEO']);

        if (error || !sources || sources.length === 0) return;

        mediaSection.style.display = 'block';
        if (mediaBadge) mediaBadge.textContent = sources.length;

        mediaList.innerHTML = sources.map(s => {
            if (s.source_type === 'YOUTUBE' || s.source_type === 'YOUTUBE_VIDEO') {
                let yid = '';
                if (s.url && s.url.includes('v=')) yid = s.url.split('v=')[1].split('&')[0];
                else if (s.url && s.url.includes('youtu.be/')) yid = s.url.split('youtu.be/')[1].split('?')[0];
                if (yid) {
                    return `<div style="flex: 0 0 280px; scroll-snap-align: start; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; background: #000;">
                        <iframe style="width: 100%; aspect-ratio: 16/9; display: block;" src="https://www.youtube.com/embed/${yid}" frameborder="0" allowfullscreen></iframe>
                        ${s.title ? `<div style="padding: 0.5rem; font-size: 0.85rem; color: #475569; background: white;">${s.title}</div>` : ''}
                    </div>`;
                }
            }
            if (s.url) {
                return `<div style="flex: 0 0 200px; scroll-snap-align: start; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0;">
                    <img src="${s.url}" alt="${s.title || 'Kuva'}" style="width: 100%; height: 140px; object-fit: cover; display: block;">
                    ${s.title ? `<div style="padding: 0.5rem; font-size: 0.85rem; color: #475569;">${s.title}</div>` : ''}
                </div>`;
            }
            return '';
        }).join('');
    } catch (err) {
        console.error('Virhe median haussa:', err);
    }
}

async function loadMemoriesForPlace(place) {
    const memoriesSection = document.getElementById('memories-section');
    const memoriesList = document.getElementById('memories-teaser-list');
    if (!memoriesSection || !memoriesList) return;

    try {
        // Hae muistot ensin (ilman nested select - entity_id on polymorfinen)
        const { data: memoriesData, error: memoriesError } = await aiSb
            .from('memories')
            .select('*')
            .eq('place_id', place.place_id)
            .order('year', { ascending: true });

        if (memoriesError || !memoriesData || memoriesData.length === 0) {
            memoriesList.innerHTML = `
                <div style="background: #f8fafc; border: 1px dashed #cbd5e1; padding: 1.5rem; border-radius: 12px; text-align: center; color: #64748b;">
                    <span class="iconify" data-icon="material-symbols:history-edu-outline" style="font-size: 2rem; margin-bottom: 0.5rem; color: #94a3b8;"></span>
                    <p style="margin: 0; font-weight: 500;">Tälle paikalle ei ole vielä lisätty muistoja tai historiallista aineistoa.</p>
                </div>
            `;
            return;
        }

        // Hae lähteet erikseen
        const memoryIds = memoriesData.map(m => m.id);
        const { data: sourcesData } = await aiSb
            .from('entity_sources')
            .select('*')
            .eq('entity_type', 'MEMORY')
            .in('entity_id', memoryIds);

        // Yhdistä lähteet muistoihin
        const memories = memoriesData.map(m => ({
            ...m,
            entity_sources: (sourcesData || []).filter(s => s.entity_id === m.id)
        }));

        memoriesList.innerHTML = memories.map(mem => {
            let icon = 'material-symbols:history-edu';
            if (mem.entity_sources && mem.entity_sources.length > 0) {
                const firstSource = mem.entity_sources[0];
                if (firstSource.media_type === 'VIDEO') icon = 'material-symbols:videocam';
                else if (firstSource.media_type === 'IMAGE') icon = 'material-symbols:image';
                else if (firstSource.source === 'OSM') icon = 'material-symbols:map';
            }

            const yearText = mem.year ? mem.year : 'Historia';
            const firstSourceUrl = mem.entity_sources.length > 0 ? mem.entity_sources[0].url : null;
            const clickHandler = firstSourceUrl ? `onclick="window.open('${firstSourceUrl}', '_blank')"` : '';
            const hoverStyles = firstSourceUrl ? `onmouseover="this.style.transform='scale(1.02)'; this.style.boxShadow='0 4px 16px rgba(225,29,72,0.1)';" onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='none';"` : '';
            
            return `
            <div class="memory-card" ${clickHandler} ${hoverStyles} style="background: #fff0f2; border: 1px solid #ffe4e6; padding: 1rem; border-radius: 12px; display: flex; gap: 1rem; ${firstSourceUrl ? 'cursor: pointer;' : ''} transition: transform 0.2s;">
                <div style="font-weight: 800; font-size: 1.2rem; color: #e11d48; white-space: nowrap;">${yearText}</div>
                <div style="flex: 1;">
                    <div style="font-weight: 600; color: #1e293b; margin-bottom: 0.25rem;">${mem.title}</div>
                    ${mem.description ? `<div style="font-size: 0.85rem; color: #475569; margin-bottom: 0.5rem;">${mem.description}</div>` : ''}
                    <div style="font-size: 0.85rem; color: #64748b; display: flex; align-items: center; gap: 0.25rem;">
                        <span class="iconify" data-icon="${icon}"></span> 
                        ${mem.entity_sources.length} lähdettä
                        ${firstSourceUrl ? '<span style="color: #e11d48; margin-left: 4px;">&#8594; avaa</span>' : ''}
                    </div>
                </div>
            </div>
            `;
        }).join('');

    } catch (err) {
        console.error("Virhe muistojen haussa:", err);
    }
}

// ── APUFUNKTIOT ─────────────────────────────────────────────────────────────
function haversineKm(lat1, lon1, lat2, lon2) {
    if (!lat1 || !lon1 || !lat2 || !lon2) return null;
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

const toSlugGlobal = (text) => text.toString().toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/å/g, 'a')
    .replace(/[^\w\-]+/g, '')
    .replace(/--+/g, '-')
    .replace(/^-+|-+$/g, '');

function scoreCompanies(allCompanies, place, relations, tagMatches, visibilityData = []) {
    const results = [];
    const seenIds = new Set();

    // Koostetaan näkyvyys-Set nopeaa hakua varten
    const visibilitySet = new Set((visibilityData || []).map(v => String(v.company_id)));
    const visibilityPriorityMap = {};
    (visibilityData || []).forEach(v => {
        const id = String(v.company_id);
        if (!visibilityPriorityMap[id] || v.priority > visibilityPriorityMap[id].priority) {
            visibilityPriorityMap[id] = v;
        }
    });

    // Pisteytystaulukko: uudet relation_type-arvot (007) + vanhat arvot yhteensopivuuden vuoksi
    const RELATION_SCORES = {
        // Uudet (007_add_relation_type.sql)
        LOCATED_AT:      60,
        OPERATES_AT:     55,
        SERVICE_AT:      50,
        SERVES_VISITORS: 30,
        RECOMMENDED:     20,
        NEARBY_SERVICE:  15,
        GENERAL:         10,
        // Vanhat (place_relations -taulusta)
        HEAD_OFFICE:    100,
        INSIDE_PLACE:    90,
        EVENT_LOCATION:  50,
        PHOTO_LOCATION:  40,
        SERVICE_POINT:   40,
        PARTNER:         35,
        SPONSOR:         30
    };
    const RELATION_LABELS = {
        LOCATED_AT: 'Toimii paikassa', OPERATES_AT: 'Toimii paikassa',
        SERVICE_AT: 'Palvelee paikassa', SERVES_VISITORS: 'Palvelee kävijöitä',
        NEARBY_SERVICE: 'Lähipalvelu', RECOMMENDED: 'Suositeltu',
        HEAD_OFFICE: 'Toimipaikka', INSIDE_PLACE: 'Paikassa', 
        EVENT_LOCATION: 'Tapahtumapaikka', PHOTO_LOCATION: 'Kuvauspaikka',
        SERVICE_POINT: 'Palvelupiste', PARTNER: 'Kumppani', SPONSOR: 'Sponsori'
    };
    
    // Taso 1-2: Fyysinen sijainti + Relaatiot
    for (const company of allCompanies) {
        const compId = String(company.id);
        if (seenIds.has(compId)) continue;

        let score = 0, tier = 99;
        const reasons = [];
        
        // Fyysinen: alue_slug
        const cSlug = toSlugGlobal(company.alue_slug || '');
        const pSlug = toSlugGlobal(place.name || place.canonical_name || '');
        if (cSlug && pSlug && cSlug === pSlug) {
            score += 80; tier = 1;
            reasons.push({ type: 'AREA', label: 'Toimipaikka' });
        }
        
        // Fyysinen: etäisyys
        if (company.lat && company.lon && place.lat && place.lon) {
            const dist = haversineKm(company.lat, company.lon, place.lat, place.lon);
            if (dist < 2.0) {
                const distScore = Math.max(10, Math.round(70 - (dist / 2) * 60));
                score += distScore;
                tier = Math.min(tier, 1);
                let distLabel = dist < 1 ? `${Math.round(dist*1000)} m` : `${dist.toFixed(1).replace('.', ',')} km`;
                reasons.push({ type: 'NEAR', label: distLabel });
            }
        }
        
        // Relaatiot (place_company_relations + place_relations)
        const rel = relations.find(r => String(r.entity_id) === compId || String(r.entity_id) === `company-${compId}`);
        if (rel) {
            const pts = RELATION_SCORES[rel.relation_type] || 25;
            score += pts;
            tier = (rel.relation_type === 'HEAD_OFFICE' || rel.relation_type === 'LOCATED_AT') ? 1 : Math.min(tier, 2);
            reasons.push({ type: rel.relation_type, label: RELATION_LABELS[rel.relation_type] || rel.relation_context || rel.relation_type });
        }
        
        // Taso 2: Ostettu näkyvyys (company_visibility)
        if (visibilitySet.has(compId)) {
            const visEntry = visibilityPriorityMap[compId];
            score += 40;
            tier = Math.min(tier, 2);
            const visLabel = visEntry?.visibility_type === 'PLACE_PARTNER' ? 'Paikkakumppani' :
                             visEntry?.visibility_type === 'AREA_PARTNER'  ? 'Aluekumppani'  :
                             visEntry?.visibility_type === 'THEME_PARTNER' ? 'Teemakumppani' : 'Kumppani';
            reasons.push({ type: 'VISIBILITY', label: visLabel });
        }
        
        if (tier <= 99 && score > 0) {
            seenIds.add(compId);
            results.push({ ...company, score, tier, reasons });
        }
    }
    
    // Taso 3: Semanttinen Tag Match
    if (tagMatches && Array.isArray(tagMatches)) {
        for (const match of tagMatches) {
            const numId = String(match.company_id).replace('company-', '');
            if (seenIds.has(numId) || seenIds.has(match.company_id)) continue;
            
            const company = allCompanies.find(c => String(c.id) === numId || String(c.id) === match.company_id);
            if (!company) continue;
            
            const tagScore = Math.min(100, Math.round((match.matched_tags.length / 5) * 100));
            results.push({ 
                ...company, 
                score: tagScore, 
                tier: 3, 
                tagScore,
                matchedTags: match.matched_tags, 
                reasons: [] 
            });
            seenIds.add(numId);
        }
    }
    
    return results;
}

async function renderPlace(place, relatedItems, aiProfileData, allSources = [], allContents = [], scoredCompanies = []) {
    document.getElementById('loading-spinner').style.display = 'none';
    document.getElementById('place-content').style.display = 'block';

    // Perustiedot
    document.getElementById('place-name').textContent = place.name || place.canonical_name || 'Nimetön paikka';
    document.getElementById('place-type').textContent = getTypeLabel(place.type);
    document.getElementById('place-municipality').textContent = place.municipality || 'Laukaa';
    
    // Kuvaus (V2 + AI)
    let descHtml = '';
    
    if (aiProfileData && aiProfileData.summary) {
        // Jos AI-profilointidata löytyi
        descHtml = `<p class="ai-summary" style="font-size: 1.15rem; color: var(--text-main); line-height: 1.7; margin-bottom: 1rem;">
            ${aiProfileData.summary}
        </p>`;
    } else if (place.description) {
        descHtml = `<p>${place.description}</p>`;
    } else {
        descHtml = `Tämä on <strong>${place.name || place.canonical_name}</strong>, joka on tyypiltään ${getTypeLabel(place.type).toLowerCase()}. ` +
            `Sijaintina on ${place.municipality}. <br><br>` + 
            `<em>Tekoälyn generoima kuvaus tälle paikalle lisätään myöhemmässä vaiheessa.</em>`;
    }
    
    // Ylimääräinen "place_content" -kenttä
    if (place.place_content) {
        descHtml += `<div style="margin-top: 1.5rem;" class="place-content-extra">${place.place_content}</div>`;
    }

    document.getElementById('display-description').innerHTML = descHtml;

    // Tilastot
    const companies = relatedItems.filter(i => i.type === 'business' || i.type === 'association' || i.type === 'service');
    const others = relatedItems.filter(i => i.type !== 'business' && i.type !== 'association' && i.type !== 'service');
    
    const statCompanies = document.getElementById('stat-companies');
    if (statCompanies) statCompanies.textContent = companies.length;
    
    const statObservations = document.getElementById('stat-observations');
    if (statObservations) statObservations.textContent = others.length;

    // Teemat / Liittyy teemoihin
    const themesSection = document.getElementById('themes-section');
    const themesList = document.getElementById('network-tags-list');
    if (themesSection && themesList) {
        const uniqueThemes = new Set();
        
        // Lisää AI-teemat jos olemassa
        if (aiProfileData && aiProfileData.themes && Array.isArray(aiProfileData.themes)) {
            aiProfileData.themes.forEach(t => uniqueThemes.add(t));
        }

        // Lisää tyyppi
        if (place.type) uniqueThemes.add(getTypeLabel(place.type));
        
        // Lisää relaatioista löytyvät
        relatedItems.forEach(i => {
            if (i.type && i.type !== 'observation' && i.type !== 'other') {
                uniqueThemes.add(getTypeLabel(i.type));
            }
        });

        // Lisää entity_tags-taulusta hyväksytyt tagit
        try {
            const { data: entityTagData } = await aiSb
                .from('entity_tags')
                .select('tag_id, tags(name)')
                .eq('entity_type', 'place')
                .eq('entity_id', place.place_id);
            
            if (entityTagData && entityTagData.length > 0) {
                entityTagData.forEach(et => {
                    const tagName = et.tags?.name || et.tag_id;
                    if (tagName) uniqueThemes.add(tagName);
                });
            }
        } catch(e) {
            console.warn('entity_tags haku epäonnistui:', e);
        }
        
        const themesArray = Array.from(uniqueThemes);
        if (themesArray.length > 0) {
            themesSection.style.display = 'block';
            // Tagit toimivat linkkeinä teema-sivulle – place_id välittyy mukana kontekstuaalista hakua varten
            themesList.innerHTML = themesArray.map(t => {
                const tagSlug = encodeURIComponent(t.toLowerCase());
                // Välitetään place.place_id, jolloin teema.html tietää mistä paikasta tultiin
                const placeIdForTag = place.place_id ? `&place_id=${encodeURIComponent(place.place_id)}` : '';
                return `<a href="teema.html?tag=${tagSlug}${placeIdForTag}" class="network-tag" style="cursor:pointer; text-decoration:none;" title="${t} – ${place.name || place.canonical_name || 'tämä paikka'} lähialueella">
                    <span class="iconify" data-icon="material-symbols:tag"></span> ${t}
                </a>`;
            }).join('');
        } else {
            themesSection.style.display = 'none';
        }
    }


    // Aktiviteetit ("Mitä täällä voi tehdä?")
    const activitiesSection = document.getElementById('activities-section');
    const activitiesList = document.getElementById('activities-list');
    if (activitiesSection && activitiesList && aiProfileData && aiProfileData.activities && Array.isArray(aiProfileData.activities) && aiProfileData.activities.length > 0) {
        activitiesSection.style.display = 'block';
        
        // Yritä päätellä ikoni aktiviteetin nimestä (yksinkertainen mappaus tai geneerinen)
        activitiesList.innerHTML = aiProfileData.activities.map(act => {
            let icon = 'material-symbols:local-activity-outline';
            const nameLower = act.toLowerCase();
            if (nameLower.includes('uinti')) icon = 'material-symbols:pool-outline';
            if (nameLower.includes('hiihto')) icon = 'material-symbols:downhill-skiing-outline';
            if (nameLower.includes('ulkoilu') || nameLower.includes('kävely')) icon = 'material-symbols:directions-walk-outline';
            if (nameLower.includes('pyöräily')) icon = 'material-symbols:directions-bike-outline';
            if (nameLower.includes('pallopeli') || nameLower.includes('jalkapallo')) icon = 'material-symbols:sports-soccer-outline';
            if (nameLower.includes('kuntoilu')) icon = 'material-symbols:fitness-center-outline';
            if (nameLower.includes('kalastus')) icon = 'material-symbols:phishing-outline'; // Close enough
            if (nameLower.includes('luistelu')) icon = 'material-symbols:ice-skating-outline';

            return `
            <div class="activity-pill" onclick="openTagModal('${act}', '${icon}')" style="display: flex; align-items: center; gap: 0.5rem; background: #f1f5f9; padding: 0.6rem 1.2rem; border-radius: 50px; font-weight: 600; cursor: pointer; transition: all 0.2s; border: 1px solid transparent;" onmouseover="this.style.background='#e2e8f0'; this.style.borderColor='#cbd5e1'" onmouseout="this.style.background='#f1f5f9'; this.style.borderColor='transparent'">
                <span class="iconify" data-icon="${icon}" style="font-size: 1.2rem; color: var(--accent);"></span>
                ${act}
            </div>
            `;
        }).join('');
    }

    // UKK (FAQ)
    const faqSection = document.getElementById('faq-section');
    const faqList = document.getElementById('faq-list');
    if (faqSection && faqList && aiProfileData && aiProfileData.faq && Array.isArray(aiProfileData.faq) && aiProfileData.faq.length > 0) {
        faqSection.style.display = 'block';
        
        faqList.innerHTML = aiProfileData.faq.map(faqItem => {
            // Tukee sekä uutta (q, a) että vanhaa (question, answer) muotoa
            const qText = faqItem.q || faqItem.question || '';
            const aText = faqItem.a || faqItem.answer || '';
            
            if (!qText && !aText) return '';
            
            return `
            <details class="service-accordion">
                <summary>
                    <span style="display: flex; align-items: center; gap: 0.5rem;">
                        <span class="iconify" data-icon="material-symbols:info-outline" style="color: var(--accent);"></span>
                        ${qText}
                    </span>
                    <span class="iconify accordion-icon" data-icon="material-symbols:expand-more"></span>
                </summary>
                <div class="service-content">
                    ${aText}
                </div>
            </details>
            `;
        }).join('');
    }

    // Aikajana (Havainnot)
    const timelineSection = document.getElementById('timeline-section');
    const timelineList = document.getElementById('timeline-list');
    if (timelineSection && timelineList) {
        const observations = others.filter(i => i.type === 'observation' || i.type === 'other' || !i.type);
        if (observations.length > 0) {
            timelineSection.style.display = 'block';
            timelineList.innerHTML = observations.map((obs) => {
                const label = obs.name || 'Havainto';
                const desc = obs.shortDescription || '';
                return `<div class="timeline-item">
                            <div class="time-label">${label}</div>
                            <div class="time-event">
                                <span class="iconify" data-icon="material-symbols:info" style="color: #3b82f6; font-size: 1.5rem;"></span> 
                                ${desc}
                            </div>
                        </div>`;
            }).join('');
        } else {
            timelineSection.style.display = 'none';
        }
    }

    // Verkostoyhteydet ja Yritykset (4-tasomalli)
    renderCompanies(scoredCompanies, allSources, allContents);
    renderRelations(relatedItems, allSources, allContents); // Vanha renderointi jäljelle jääville (muut kuin yritykset)

    // Paikan omat lisäsisällöt (place_content ilman entity_id:tä)
    const servicesContainer = document.getElementById('place-sources-list');
    if (servicesContainer && allContents) {
        const placeContents = allContents.filter(c => !c.entity_id || String(c.entity_id) === String(place.place_id));
        if (placeContents.length > 0) {
            servicesContainer.innerHTML = placeContents.map(c => {
                let mediaHtml = '';
                if (c.media_url) {
                    if (c.content_type === 'VIDEO' || c.storage_provider === 'YOUTUBE') {
                        let yid = '';
                        if (c.media_url.includes('v=')) yid = c.media_url.split('v=')[1].split('&')[0];
                        else if (c.media_url.includes('youtu.be/')) yid = c.media_url.split('youtu.be/')[1].split('?')[0];
                        mediaHtml = yid ? `<div style="margin-top:10px;"><iframe style="width:100%; aspect-ratio: 16/9; border-radius:8px;" src="https://www.youtube.com/embed/${yid}" frameborder="0" allowfullscreen></iframe></div>` : '';
                    } else if (c.content_type === 'PHOTO') {
                        mediaHtml = `<div style="margin-top:8px;"><img src="${c.media_url}" alt="${c.title}" style="max-width:100%; border-radius:8px;"></div>`;
                    }
                }
                return `<div style="padding: 1rem; background: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0;">
                    <div style="font-weight: 700; color: #1e293b; margin-bottom: 0.25rem;">${c.title || ''}</div>
                    ${c.description ? `<div style="font-size: 0.85rem; color: #64748b;">${c.description}</div>` : ''}
                    ${mediaHtml}
                </div>`;
            }).join('');
        } else {
            servicesContainer.innerHTML = '';
        }
    }

    // Kartta ja sijaintinapit
    if (place.lat && place.lon) {
        document.getElementById('map-section').style.display = 'block';
        initPlaceMap(place.lat, place.lon, place.name || place.canonical_name);
        
        const routeBtn = document.getElementById('btn-route');
        if (routeBtn) {
            routeBtn.setAttribute('onclick', `window.open('https://maps.google.com/?q=${place.lat},${place.lon}', '_blank')`);
        }
        
        const svBtn = document.getElementById('btn-streetview');
        if (svBtn) {
            svBtn.style.display = 'inline-flex';
            svBtn.setAttribute('onclick', `window.open('https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${place.lat},${place.lon}', '_blank')`);
        }
    }
    
    // Jakolinkki-toiminnallisuus
    const shareBtn = document.getElementById('share-place-btn');
    if (shareBtn) {
        shareBtn.addEventListener('click', (e) => {
            e.preventDefault();
            // Luo nimestä tehty jakolinkki (käytetään ensisijaisesti kanonista nimeä uniikkiuden vuoksi)
            const rawName = place.canonical_name || place.name || place.place_id;
            const safeName = encodeURIComponent(rawName.replace(/\s+/g, '_'));
            
            const baseUrl = window.location.origin + window.location.pathname;
            const shareUrl = `${baseUrl}?name=${safeName}`;
            
            navigator.clipboard.writeText(shareUrl).then(() => {
                const originalHtml = shareBtn.innerHTML;
                shareBtn.innerHTML = '<span class="iconify" data-icon="material-symbols:check" style="font-size: 1rem;"></span> Linkki kopioitu!';
                shareBtn.style.color = '#059669';
                shareBtn.style.borderColor = '#059669';
                
                setTimeout(() => {
                    shareBtn.innerHTML = originalHtml;
                    shareBtn.style.color = '';
                    shareBtn.style.borderColor = '';
                }, 3000);
            }).catch(err => {
                console.error('Kopiointi epäonnistui:', err);
                alert('Jakolinkki: ' + shareUrl);
            });
        });
    }

    // Ladataan lähipaikat tag-pilvenä
    renderNearbyPlaces(place);
}

const TYPE_LABELS = {
    'business': 'Yritys',
    'service': 'Palvelu',
    'association': 'Yhdistys',
    'event': 'Tapahtuma',
    'offer': 'Tarjous',
    'product': 'Tuote'
};

function renderCompanies(scoredCompanies, allSources = [], allContents = []) {
    const listTier12 = document.getElementById('companies-list');
    const containerTier3 = document.getElementById('semantic-matches-container');
    const listTier3 = document.getElementById('semantic-matches-list');
    const containerTier4 = document.getElementById('premium-partners-container');
    const listTier4 = document.getElementById('premium-partners-list');
    
    const tier1and2 = scoredCompanies.filter(c => c.tier <= 2).sort((a,b) => {
        const aHasExtra = allSources.some(s => String(s.entity_id) === String(a.id)) || 
                          allContents.some(c => String(c.entity_id) === String(a.id));
        const bHasExtra = allSources.some(s => String(s.entity_id) === String(b.id)) || 
                          allContents.some(c => String(c.entity_id) === String(b.id));
                          
        if (aHasExtra && !bHasExtra) return -1;
        if (!aHasExtra && bHasExtra) return 1;
        
        return b.score - a.score;
    });
    const tier3 = scoredCompanies.filter(c => c.tier === 3).sort((a,b) => b.tagScore - a.tagScore).slice(0, 6); // Näytetään max 6
    const tier4 = scoredCompanies.filter(c => c.tier === 4).sort((a,b) => b.score - a.score);
    
    // Yleinen HTML generaattori korteille
    const generateCardHtml = (item, isSemantic = false) => {
        let linkUrl = '?id=' + item.id;
        if (String(item.id).startsWith('yritys_') || item.type === 'business' || item.nimi) {
            linkUrl = 'yrityskortti.html?id=' + item.id;
        }
        
        const displayName = item.nimi || item.name || item.id;
        let thumbUrl = item.logo || (item.images && item.images[0]) || item.image || null;
        
        const itemSources = allSources.filter(s => String(s.entity_id) === String(item.id));
        const itemContents = allContents.filter(c => String(c.entity_id) === String(item.id));
        const hasExtraContent = itemSources.length > 0 || itemContents.length > 0;
        
        if (!thumbUrl) {
            const imgSource = itemSources.find(s => s.source_type === 'PHOTO' || s.source_type === 'IMAGE');
            if (imgSource) thumbUrl = imgSource.url;
            else {
                const imgContent = itemContents.find(c => c.content_type === 'PHOTO' && c.media_url);
                if (imgContent) thumbUrl = imgContent.media_url;
            }
        }
        
        const thumbWrapHtml = thumbUrl
            ? `<div class="card-thumb-wrap card-thumb-logo"><img src="${thumbUrl}" alt="Logo" loading="lazy" /></div>`
            : '';
            
        let subtitleHtml = '';
        if (isSemantic && item.matchedTags) {
            const barWidth = Math.min(100, item.tagScore || 0);
            subtitleHtml = `
                <div style="margin-top: 0.5rem;">
                    <div style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; color: #15803d; font-weight: 600; margin-bottom: 0.25rem;">
                        <span class="iconify" data-icon="material-symbols:match-case"></span> ${item.tagScore}% Osuma
                    </div>
                    <div style="height: 4px; background: #dcfce7; border-radius: 4px; overflow: hidden; width: 100%; max-width: 150px; margin-bottom: 0.5rem;">
                        <div style="height: 100%; background: #22c55e; width: ${barWidth}%;"></div>
                    </div>
                    <div style="font-size: 0.85rem; color: var(--light-text); display: flex; flex-wrap: wrap; gap: 4px;">
                        ${item.matchedTags.slice(0, 4).map(t => `<span style="background:#f1f5f9; padding:2px 6px; border-radius:4px;">${t}</span>`).join('')}
                    </div>
                </div>
            `;
        } else if (item.reasons && item.reasons.length > 0) {
            subtitleHtml = `
                <div style="margin-top: 0.5rem; display: flex; flex-wrap: wrap; gap: 0.5rem;">
                    ${item.reasons.map(r => `<span style="font-size: 0.75rem; font-weight: 600; padding: 0.2rem 0.6rem; border-radius: 50px; background: #e0f2fe; color: #0369a1; display:flex; align-items:center; gap:0.25rem;"><span class="iconify" data-icon="${r.type === 'AREA' ? 'material-symbols:location-on' : 'material-symbols:storefront'}"></span> ${r.label}</span>`).join('')}
                </div>
            `;
        }

        const headerHtml = `
            <div class="card-header-grid">
                <div class="card-icon-text">
                    <div class="list-icon-wrapper" style="margin:0; flex-shrink: 0; margin-top: 2px;">
                        <span class="iconify list-icon" data-icon="${isSemantic ? 'material-symbols:auto-awesome' : 'material-symbols:storefront-outline'}"></span>
                    </div>
                    <div style="flex: 1; min-width: 0;">
                        <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                            <span style="font-weight: 700; font-size: 1.05rem; color: var(--dark-text);">${displayName}</span>
                        </div>
                        ${subtitleHtml}
                    </div>
                </div>
                ${thumbWrapHtml}
            </div>
        `;

        const isPlaceRelation = item.reasons && item.reasons.some(r => r.type !== 'NEAR' && r.type !== 'AREA');
        const isHighlight = hasExtraContent || isPlaceRelation;
        const highlightStyle = isHighlight ? ' background: #f0f9ff; border-color: #bae6fd;' : '';

        if (!hasExtraContent) {
            return `<a href="${linkUrl}" class="list-item-card" style="text-decoration:none; display: block;${highlightStyle}">${headerHtml}</a>`;
        }
        
        let extraHtml = '';
        if (itemSources.length > 0) {
            extraHtml += itemSources.map(s => {
                if (s.source_type === 'YOUTUBE' || s.source_type === 'YOUTUBE_VIDEO') {
                    let yid = '';
                    if (s.url && s.url.includes('v=')) yid = s.url.split('v=')[1].split('&')[0];
                    else if (s.url && s.url.includes('youtu.be/')) yid = s.url.split('youtu.be/')[1].split('?')[0];
                    return yid ? `<div style="margin-top:10px;"><iframe style="width:100%; aspect-ratio: 16/9; border-radius:8px;" src="https://www.youtube.com/embed/${yid}" frameborder="0" allowfullscreen></iframe></div>` : `<div style="margin-top:8px;"><a href="${s.url}" target="_blank" style="color:var(--accent); font-weight:bold; text-decoration:none;">${s.title} &rarr;</a></div>`;
                } else {
                    return `<div style="margin-top:8px;"><a href="${s.url}" target="_blank" style="color:var(--accent); font-weight:bold; text-decoration:none;">${s.title} &rarr;</a></div>`;
                }
            }).join('');
        }

        if (itemContents.length > 0) {
            extraHtml += itemContents.map(c => {
                let mediaHtml = '';
                if (c.media_url) {
                    if (c.content_type === 'VIDEO' || c.storage_provider === 'YOUTUBE') {
                        let yid = '';
                        if (c.media_url.includes('v=')) yid = c.media_url.split('v=')[1].split('&')[0];
                        else if (c.media_url.includes('youtu.be/')) yid = c.media_url.split('youtu.be/')[1].split('?')[0];
                        if (yid) {
                            mediaHtml = `<div style="margin-top:10px;"><iframe style="width:100%; aspect-ratio: 16/9; border-radius:8px;" src="https://www.youtube.com/embed/${yid}" frameborder="0" allowfullscreen></iframe></div>`;
                        } else {
                            mediaHtml = `<div style="margin-top:8px;"><video src="${c.media_url}" controls style="width:100%; border-radius:8px;"></video></div>`;
                        }
                    } else if (c.content_type === 'PHOTO') {
                        mediaHtml = `<div style="margin-top:8px;"><img src="${c.media_url}" alt="${c.title}" style="max-width:100%; border-radius:8px;"></div>`;
                    } else {
                        mediaHtml = `<div style="margin-top:8px;"><a href="${c.media_url}" target="_blank" style="color:var(--accent); font-weight:bold; text-decoration:none;">Katso media &rarr;</a></div>`;
                    }
                }
                return `
                    <div style="margin-top: 15px; padding-top: 15px; border-top: 1px dashed #e2e8f0;">
                        <h4 style="margin: 0 0 5px 0; color: var(--text-main);">${c.title}</h4>
                        ${c.description ? `<p style="margin: 0 0 10px 0; font-size: 0.9rem; color: var(--text-muted); line-height: 1.4;">${c.description}</p>` : ''}
                        ${mediaHtml}
                    </div>
                `;
            }).join('');
        }
        
        extraHtml += `<div style="margin-top: 15px;"><a href="${linkUrl}" style="display:inline-block; padding:8px 16px; background:var(--accent); color:white; border-radius:50px; text-decoration:none; font-weight:bold; font-size:0.9rem;">Siirry yrityskortille &rarr;</a></div>`;

        return `
        <details class="service-accordion list-item-card" style="padding:0; cursor:pointer; display:block; margin-bottom: 0;${highlightStyle}">
            <summary style="padding: 1.25rem; display: block; list-style: none;">
                ${headerHtml}
                <span class="iconify accordion-icon" data-icon="material-symbols:expand-more" style="font-size:1.5rem; color:var(--text-muted); margin-top: 0.5rem; display: block; text-align: right;"></span>
            </summary>
            <div class="service-content" style="padding: 0 1.25rem 1.25rem 1.25rem; border-top: 1px solid #f1f5f9; cursor:default;">
                ${extraHtml}
            </div>
        </details>`;
    };

    // Render Tier 1 & 2
    if (listTier12) {
        if (tier1and2.length > 0) {
            const visibleTier12 = tier1and2.slice(0, 5);
            let html = visibleTier12.map(c => generateCardHtml(c, false)).join('');
            
            if (tier1and2.length > 5) {
                const moreCount = tier1and2.length - 5;
                html += `
                    <div style="text-align: center; margin-top: 1rem; margin-bottom: 1rem;">
                        <button onclick="document.getElementById('more-tier12').style.display='flex'; this.style.display='none';" style="background: transparent; border: 1px solid #cbd5e1; color: #475569; padding: 0.6rem 1.2rem; border-radius: 50px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 0.5rem; transition: all 0.2s;">
                            Näytä ${moreCount} muuta lähellä
                            <span class="iconify" data-icon="material-symbols:expand-more"></span>
                        </button>
                    </div>
                    <div id="more-tier12" style="display: none; flex-direction: column; gap: 0;">
                        ${tier1and2.slice(5).map(c => generateCardHtml(c, false)).join('')}
                    </div>
                `;
            }
            listTier12.innerHTML = html;
        } else {
            listTier12.innerHTML = `<div style="text-align:center; color: var(--light-text); padding: 2rem; background: #f9fafb; border-radius: 12px; font-size: 0.9rem;">Ei paikallisia yrityksiä tai palvelupisteitä rekisteröitynä tähän kohteeseen.</div>`;
        }
    }
    
    // Render Tier 3
    if (containerTier3 && listTier3) {
        if (tier3.length > 0) {
            containerTier3.style.display = 'block';
            listTier3.innerHTML = tier3.map(c => generateCardHtml(c, true)).join('');
        } else {
            containerTier3.style.display = 'none';
        }
    }
    
    // Render Tier 4
    if (containerTier4 && listTier4) {
        if (tier4.length > 0) {
            containerTier4.style.display = 'block';
            listTier4.innerHTML = tier4.map(c => generateCardHtml(c, false)).join('');
        } else {
            containerTier4.style.display = 'none';
        }
    }
}

function renderRelations(items, allSources = [], allContents = []) {
    const container = document.getElementById('other-relations-list');
    if (!container) return;
    
    // Jos items ovat vain ei-yrityksiä, näytetään ne eri tavalla
    if (items.length === 0) {
        return;
    }

    container.innerHTML = items.map(item => {
        const typeLabel = TYPE_LABELS[item.type] || item.type;
        
        let iconName = 'material-symbols:storefront-outline';
        if (item.type === 'event') iconName = 'material-symbols:event-outline';
        else if (item.type === 'offer') iconName = 'material-symbols:local-offer-outline';
        else if (item.type === 'association') iconName = 'material-symbols:groups-outline';
        
        const displayName = item.name || item.id;
        let linkUrl = '?id=' + item.id;
        if (item.id.startsWith('yritys_') || item.type === 'business') {
            linkUrl = 'yrityskortti.html?id=' + item.id;
        } else if (item.type === 'observation') {
            linkUrl = 'ilmoituskortti.html?id=' + item.id;
        } else {
            linkUrl = 'kohdekortti.html?id=' + item.id;
        }
        
        const itemSources = allSources.filter(s => String(s.entity_id) === String(item.id));
        const itemContents = allContents.filter(c => String(c.entity_id) === String(item.id));
        const hasExtraContent = itemSources.length > 0 || itemContents.length > 0;

        let thumbUrl = null;
        const imgSource = itemSources.find(s => s.source_type === 'PHOTO' || s.source_type === 'IMAGE');
        if (imgSource) thumbUrl = imgSource.url;
        else {
            const imgContent = itemContents.find(c => c.content_type === 'PHOTO' && c.media_url);
            if (imgContent) thumbUrl = imgContent.media_url;
        }
        
        if (!thumbUrl) {
            if (item.logo) thumbUrl = item.logo;
            else if (item.images && item.images.length > 0) thumbUrl = item.images[0];
            else if (item.image) thumbUrl = item.image;
        }
        
        const isLogo = item.id.startsWith('yritys_') || item.type === 'business';
        const thumbWrapHtml = thumbUrl
            ? `<div class="card-thumb-wrap${isLogo ? ' card-thumb-logo' : ''}"><img src="${thumbUrl}" alt="${isLogo ? 'Logo' : 'Kuva'}" loading="lazy" /></div>`
            : '';

        const formatDateFi = (dStr) => {
            if (!dStr) return '';
            try { return new Date(dStr).toLocaleDateString('fi-FI'); } catch(e) { return dStr; }
        };
        let dateInfoHtml = '';
        if (item.event && (item.event.startDate || item.event.endDate)) {
            const sDate = formatDateFi(item.event.startDate);
            const eDate = formatDateFi(item.event.endDate);
            if (sDate && eDate && sDate !== eDate) dateInfoHtml = `<div style="font-size: 0.85rem; color: #0369a1; margin-top: 0.3rem; display: flex; align-items: center; gap: 0.3rem;"><span class="iconify" data-icon="material-symbols:calendar-month"></span> ${sDate} - ${eDate}</div>`;
            else if (sDate) dateInfoHtml = `<div style="font-size: 0.85rem; color: #0369a1; margin-top: 0.3rem; display: flex; align-items: center; gap: 0.3rem;"><span class="iconify" data-icon="material-symbols:calendar-month"></span> ${sDate}</div>`;
        } else if (item.offer && (item.offer.validFrom || item.offer.validUntil)) {
            const fDate = formatDateFi(item.offer.validFrom);
            const uDate = formatDateFi(item.offer.validUntil);
            if (fDate && uDate) dateInfoHtml = `<div style="font-size: 0.85rem; color: #b45309; margin-top: 0.3rem; display: flex; align-items: center; gap: 0.3rem;"><span class="iconify" data-icon="material-symbols:schedule"></span> Voimassa: ${fDate} - ${uDate}</div>`;
            else if (uDate) dateInfoHtml = `<div style="font-size: 0.85rem; color: #b45309; margin-top: 0.3rem; display: flex; align-items: center; gap: 0.3rem;"><span class="iconify" data-icon="material-symbols:schedule"></span> Päättyy: ${uDate}</div>`;
            else if (fDate) dateInfoHtml = `<div style="font-size: 0.85rem; color: #b45309; margin-top: 0.3rem; display: flex; align-items: center; gap: 0.3rem;"><span class="iconify" data-icon="material-symbols:schedule"></span> Alkaa: ${fDate}</div>`;
        }

        const headerHtml = `
            <div class="card-header-grid">
                <div class="card-icon-text">
                    <div class="list-icon-wrapper" style="margin:0; flex-shrink: 0; margin-top: 2px;">
                        <span class="iconify list-icon" data-icon="${iconName}"></span>
                    </div>
                    <div style="flex: 1; min-width: 0;">
                        <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                            <span style="font-weight: 700; font-size: 1.05rem; color: var(--dark-text);">${displayName}</span>
                            <span style="font-size: 0.75rem; font-weight: 700; padding: 0.2rem 0.8rem; border-radius: 50px; background: #dcfce7; color: #166534; text-transform: uppercase; letter-spacing: 0.5px;">${typeLabel}</span>
                        </div>
                        ${dateInfoHtml}
                        ${item.shortDescription ? `<div style="font-size: 0.95rem; color: var(--light-text); margin-top: 0.5rem; line-height: 1.5;">${item.shortDescription}</div>` : ''}
                    </div>
                </div>
                ${thumbWrapHtml}
            </div>
        `;

        const highlightStyle = ' background: #f0f9ff; border-color: #bae6fd;';

        if (!hasExtraContent) {
            return `<a href="${linkUrl}" class="list-item-card" style="text-decoration:none; display: block;${highlightStyle}">${headerHtml}</a>`;
        }

        let extraHtml = '';
        if (itemSources.length > 0) {
            extraHtml += itemSources.map(s => {
                if (s.source_type === 'YOUTUBE' || s.source_type === 'YOUTUBE_VIDEO') {
                    let yid = '';
                    if (s.url && s.url.includes('v=')) yid = s.url.split('v=')[1].split('&')[0];
                    else if (s.url && s.url.includes('youtu.be/')) yid = s.url.split('youtu.be/')[1].split('?')[0];
                    return yid ? `<div style="margin-top:10px;"><iframe style="width:100%; aspect-ratio: 16/9; border-radius:8px;" src="https://www.youtube.com/embed/${yid}" frameborder="0" allowfullscreen></iframe></div>` : `<div style="margin-top:8px;"><a href="${s.url}" target="_blank" style="color:var(--accent); font-weight:bold; text-decoration:none;">${s.title} &rarr;</a></div>`;
                } else {
                    return `<div style="margin-top:8px;"><a href="${s.url}" target="_blank" style="color:var(--accent); font-weight:bold; text-decoration:none;">${s.title} &rarr;</a></div>`;
                }
            }).join('');
        }

        if (itemContents.length > 0) {
            extraHtml += itemContents.map(c => {
                let mediaHtml = '';
                if (c.media_url) {
                    if (c.content_type === 'VIDEO' || c.storage_provider === 'YOUTUBE') {
                        let yid = '';
                        if (c.media_url.includes('v=')) yid = c.media_url.split('v=')[1].split('&')[0];
                        else if (c.media_url.includes('youtu.be/')) yid = c.media_url.split('youtu.be/')[1].split('?')[0];
                        if (yid) {
                            mediaHtml = `<div style="margin-top:10px;"><iframe style="width:100%; aspect-ratio: 16/9; border-radius:8px;" src="https://www.youtube.com/embed/${yid}" frameborder="0" allowfullscreen></iframe></div>`;
                        } else {
                            mediaHtml = `<div style="margin-top:8px;"><video src="${c.media_url}" controls style="width:100%; border-radius:8px;"></video></div>`;
                        }
                    } else if (c.content_type === 'PHOTO') {
                        mediaHtml = `<div style="margin-top:8px;"><img src="${c.media_url}" alt="${c.title}" style="max-width:100%; border-radius:8px;"></div>`;
                    } else {
                        mediaHtml = `<div style="margin-top:8px;"><a href="${c.media_url}" target="_blank" style="color:var(--accent); font-weight:bold; text-decoration:none;">Katso media &rarr;</a></div>`;
                    }
                }
                return `
                    <div style="margin-top: 15px; padding-top: 15px; border-top: 1px dashed #e2e8f0;">
                        <h4 style="margin: 0 0 5px 0; color: var(--text-main);">${c.title}</h4>
                        ${c.description ? `<p style="margin: 0 0 10px 0; font-size: 0.9rem; color: var(--text-muted); line-height: 1.4;">${c.description}</p>` : ''}
                        ${mediaHtml}
                    </div>
                `;
            }).join('');
        }

        extraHtml += `<div style="margin-top: 15px;"><a href="${linkUrl}" style="display:inline-block; padding:8px 16px; background:var(--accent); color:white; border-radius:50px; text-decoration:none; font-weight:bold; font-size:0.9rem;">Siirry yrityskortille &rarr;</a></div>`;

        return `
        <details class="service-accordion list-item-card" style="padding:0; cursor:pointer; display:block; margin-bottom: 0;${highlightStyle}">
            <summary style="padding: 1.25rem; display: block; list-style: none;">
                ${headerHtml}
                <span class="iconify accordion-icon" data-icon="material-symbols:expand-more" style="font-size:1.5rem; color:var(--text-muted); margin-top: 0.5rem; display: block; text-align: right;"></span>
            </summary>
            <div class="service-content" style="padding: 0 1.25rem 1.25rem 1.25rem; border-top: 1px solid #f1f5f9; cursor:default;">
                ${extraHtml}
            </div>
        </details>`;
    }).join('');
}

function initPlaceMap(lat, lon, name) {
    // Odotetaan hieman jotta display: block ehtii vaikuttaa map-containeriin
    setTimeout(() => {
        if (window.placeMap) { window.placeMap.remove(); }
        window.placeMap = L.map('map').setView([lat, lon], 14);
        const map = window.placeMap;
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(map);

        L.marker([lat, lon]).addTo(map).bindPopup(`<b>${name}</b>`).openPopup();
    }, 100);
}

function getTypeLabel(type) {
    const types = {
        'NATURE': 'Luontokohde',
        'LANDMARK': 'Nähtävyys',
        'SERVICE': 'Palvelukeskittymä',
        'BUILDING': 'Rakennus',
        'AREA': 'Alue',
        'ROUTE': 'Reitti'
    };
    return types[type] || type || 'Paikka';
}

// ==========================================================
// PAIKAN ILMOITUKSET (ENCOUNTERS)
// ==========================================================
async function loadEncountersForPlace(place) {
    if (!window.LaukaaSupabase) {
        console.warn('LaukaaSupabase (kohtaamiset) ei saatavilla. Varmista että supabase-config.js on ladattu.');
        return;
    }
    
    try {
        // Hakee ilmoitukset jotka on linkitetty location_id:llä tai joilla on sama nimi (fallback)
        const placeName = place.name || place.canonical_name || '';
        
        let query = window.LaukaaSupabase
            .from('encounters')
            .select('*')
            .eq('status', 'active');
            
        // Jos haluamme kohdentaa tiukasti place_id:hen:
        // mutta otetaan fallback string matchillä myös
        if (place.place_id && placeName) {
            query = query.or(`location_id.eq.${place.place_id},location.ilike."*${placeName}*"`);
        } else if (place.place_id) {
            query = query.eq('location_id', place.place_id);
        } else if (placeName) {
            query = query.ilike('location', `%${placeName}%`);
        }
            
        const { data, error } = await query;
        
        if (error) {
            console.error('Virhe encounters haussa:', error);
        }
        
        let allItems = data || [];
        
        // Hae myös tapahtumat, yritysjulkaisut ja tarjoukset
        if (window.aiSb && place.place_id) {
            try {
                // Contents-taulu (JSONB location->>place_id)
                const { data: contentsData } = await window.aiSb
                    .from('contents')
                    .select('*')
                    .eq('location->>place_id', place.place_id);
                
                // Yrityspostaukset
                const { data: postsData } = await window.aiSb
                    .from('company_posts')
                    .select('*')
                    .eq('place_id', place.place_id);
                    
                // Tarjoukset
                const { data: offersData } = await window.aiSb
                    .from('offers')
                    .select('*')
                    .eq('place_id', place.place_id);
                    
                if (contentsData) {
                    contentsData.forEach(item => {
                        allItems.push({
                            id: item.id,
                            type: item.type === 'EVENT' ? 'event' : item.type === 'OFFER' ? 'offer' : 'content_other',
                            title: item.name,
                            description: item.description,
                            price_info: '',
                            expires_at: item.metadata?.endDate || null,
                            url: 'tapahtumakortti.html?id=' + item.id,
                            created_at: item.created_at
                        });
                    });
                }
                
                if (postsData) {
                    postsData.forEach(item => {
                        allItems.push({
                            id: item.id,
                            type: item.type === 'event' ? 'event' : 'feed_post',
                            title: item.title,
                            description: item.description,
                            price_info: '',
                            url: 'yrityskortti.html?id=' + item.business_id,
                            created_at: item.created_at
                        });
                    });
                }
                
                if (offersData) {
                    offersData.forEach(item => {
                        allItems.push({
                            id: item.id,
                            type: 'offer',
                            title: item.name,
                            description: item.description,
                            price_info: item.discount_value ? '-' + item.discount_value + '%' : '',
                            expires_at: item.valid_until || null,
                            url: 'tarjouskortti.html?id=' + item.id,
                            created_at: item.created_at
                        });
                    });
                }
            } catch (aiErr) {
                console.error("Virhe lisäsisällön haussa", aiErr);
            }
        }
        
        renderEncounters(allItems);
    } catch (e) {
        console.error('Yllättävä virhe encounters haussa:', e);
    }
}

function renderEncounters(encounters) {
    const section = document.getElementById('encounters-section');
    const container = document.getElementById('encounters-list');
    if (!section || !container) return;
    
    // Suodata pois vanhentuneet jos sellaista logiikkaa on
    const now = new Date();
    const validEncounters = encounters.filter(e => {
        if (e.expires_at) {
            return new Date(e.expires_at) > now;
        }
        return true;
    });
    
    const offers = validEncounters.filter(e => e.type === 'offer');
    const activeAlerts = validEncounters.filter(e => e.type !== 'offer');
    
    const statEncounters = document.getElementById('stat-encounters');
    if (statEncounters) statEncounters.textContent = activeAlerts.length;
    
    const statOffers = document.getElementById('stat-offers');
    if (statOffers) statOffers.textContent = offers.length;
    
    // Tarkistetaan aktiivisuus viikon sisällä
    const statusEl = document.getElementById('place-activity-status');
    const dotEl = document.getElementById('activity-dot');
    const textEl = document.getElementById('place-activity-text');
    
    if (statusEl && textEl && validEncounters.length > 0) {
        const latestDate = validEncounters.reduce((max, e) => {
            if (!e.created_at) return max;
            const d = new Date(e.created_at);
            return d > max ? d : max;
        }, new Date(0));
        
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        
        if (latestDate > sevenDaysAgo) {
            statusEl.style.display = 'flex';
            if (dotEl) dotEl.style.display = 'inline';
            textEl.textContent = 'Päivitetty hiljattain';
        }
    }
    
    if (validEncounters.length === 0) {
        // Piilotetaan osio jos ei ilmoituksia
        section.style.display = 'none';
        return;
    }
    
    section.style.display = 'block';
    
    const scrollBtn = document.getElementById('btn-scroll-encounters');
    if (scrollBtn) scrollBtn.style.display = 'inline-flex';
    
    // Ryhmittele tyypeittäin
    const grouped = {};
    validEncounters.forEach(e => {
        const t = e.type || 'other';
        if (!grouped[t]) grouped[t] = [];
        grouped[t].push(e);
    });
    
    // Mappaus nimille
    const typeLabels = {
        'service_request': 'Palvelutarpeet',
        'need_help': 'Tarvitsen palvelun',
        'sell': 'Myydään',
        'give': 'Annetaan',
        'search': 'Etsitään',
        'local_notice': 'Paikalliset ilmoitukset',
        'offer_service': 'Tarjoan palvelua',
        'work_and_gigs': 'Työ ja toimeksiannot',
        'community': 'Yhteisö',
        'space_rental': 'Tilat ja kalusto',
        'b2b_collab': 'Yhteistyöhaku',
        'event_staff': 'Tapahtumahaku',
        'high_value': 'Arvotavarat ja erikoiskohteet',
        'lost_and_found': 'Kadonnut tai löytynyt',
        'event': 'Tapahtumat',
        'offer': 'Tarjoukset',
        'feed_post': 'Yritysten ilmoitukset',
        'content_other': 'Muu sisältö',
        'other': 'Muut ilmoitukset'
    };
    
    const typeIcons = {
        'service_request': '🛠️',
        'sell': '💰',
        'give': '🎁',
        'search': '🔍',
        'local_notice': '📢',
        'event': '📅',
        'offer': '🏷️',
        'feed_post': '📰',
        'content_other': '📄'
    };
    
    let html = '';
    
    for (const [type, items] of Object.entries(grouped)) {
        const label = typeLabels[type] || type;
        const icon = typeIcons[type] || '�Y"O';
        
        html += `<div style="margin-bottom: 1.5rem; border: 1px solid #f3f4f6; border-radius: var(--inner-radius); overflow: hidden; background: var(--card-bg);">
            <div style="padding: 1.25rem; background: #f9fafb; font-weight: 700; color: var(--dark-text); border-bottom: 1px solid #f3f4f6; display: flex; justify-content: space-between; align-items: center;">
                <span style="display: flex; align-items: center; gap: 0.5rem;">${icon} ${label}</span>
                <span style="background: var(--bg-color); color: var(--light-text); padding: 4px 10px; border-radius: 50px; font-size: 0.85rem;">${items.length} kpl</span>
            </div>
            <div style="padding: 0;">`;
            
        items.forEach((item, index) => {
            const isLast = index === items.length - 1;
            const borderBottom = isLast ? '' : 'border-bottom: 1px solid #f3f4f6;';
            const priceHtml = item.price_info ? `<span style="font-weight: 700; color: var(--primary-hover); font-size: 0.95rem; background: #f0fdf4; padding: 0.4rem 0.8rem; border-radius: 50px;">${item.price_info}</span>` : '';
            const linkUrl = item.url || `ilmoituskortti.html?id=${item.id}`;
            
            html += `<a href="${linkUrl}" style="display: block; padding: 1.25rem; text-decoration: none; color: inherit; ${borderBottom} transition: background 0.2s;" onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background='transparent'">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem;">
                    <div>
                        <div style="font-weight: 700; color: var(--dark-text); font-size: 1.05rem; margin-bottom: 0.4rem;">${item.title}</div>
                        <div style="font-size: 0.95rem; color: var(--light-text); line-height: 1.5;">${(item.description || '').substring(0, 100)}${(item.description && item.description.length > 100) ? '...' : ''}</div>
                    </div>
                    ${priceHtml}
                </div>
            </a>`;
        });
        
        html += `</div></div>`;
    }
    
    container.innerHTML = html;
}

// ==========================================================
// LOSTNFOUND: FIREBASE FIRESTORE -HAU (kadonneet/löydetyt)
// ==========================================================
async function loadLostItemsForPlace(place) {
    if (!place.place_id) return;
    
    try {
        // Firebase SDK ladataan dynaamisesti jos ei vielä ladattu
        if (!window.firebase) {
            await Promise.all([
                loadScript('https://www.gstatic.com/firebasejs/9.22.2/firebase-app-compat.js'),
                loadScript('https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore-compat.js')
            ]);
        }
        
        // Alusta Firebase jos ei vielä alustettu
        if (!window._lfApp) {
            window._lfApp = firebase.initializeApp({
                apiKey: 'AIzaSyA6l0FosuiXh9KxFfD5Q92BCP1EWbH8LN4',
                authDomain: 'lostnfound-f0d25.firebaseapp.com',
                projectId: 'lostnfound-f0d25',
            }, 'lostnfound');
        }
        
        const db = firebase.firestore(window._lfApp);
        
        // Hae kyseisen paikan ilmoitukset placeId-kentällä (ilman status-kyselyä indeksien välttämiseksi)
        console.log('Haetaan lostItems paikalle:', place.place_id);
        const snapshot = await db.collection('lostItems')
            .where('placeId', '==', place.place_id)
            .limit(50)
            .get();
        
        console.log('LostItems snapshot:', snapshot.empty ? 'Tyhjä' : snapshot.docs.length + ' dokumenttia löydetty');
        if (snapshot.empty) return;
        
        // Suodata aktiiviset paikallisesti (Android tallentaa tilaksi APPROVED)
        const activeDocs = snapshot.docs.filter(doc => {
            const status = doc.data().status;
            return status === 'ACTIVE' || status === 'active' || status === 'APPROVED' || status === 'approved';
        });
        
        console.log('Aktiiviset lostItems:', activeDocs.length);
        if (activeDocs.length === 0) return;
        
        const lostItems = activeDocs.map(doc => {
            const d = doc.data();
            const isLost = d.category === 'LOST' || d.category === 'lost';
            return {
                id: doc.id,
                type: 'lost_and_found',
                title: (isLost ? '�Y"� Kadonnut: ' : '�Y"� Löytynyt: ') + (d.title || 'Ilmoitus'),
                description: d.description || '',
                created_at: d.timestamp?.toDate?.()?.toISOString() || null,
                url: `https://lostnfound-f0d25.web.app/item/${doc.id}`
            };
        });
        
        // Lisätään löydetyt/kadonneet olemassa olevaan encounters-listaan
        const container = document.getElementById('encounters-list');
        const section = document.getElementById('encounters-section');
        if (!container || lostItems.length === 0) return;
        
        section.style.display = 'block';
        
        const icon = '�Y"�';
        const label = 'Kadonnut & Löydetty (Lostnfound)';
        
        let html = `<div style="margin-bottom: 1.5rem; border: 1px solid #fde68a; border-radius: var(--inner-radius); overflow: hidden; background: #fffbeb;">
            <div style="padding: 1.25rem; background: #fef9c3; font-weight: 700; color: #92400e; border-bottom: 1px solid #fde68a; display: flex; justify-content: space-between; align-items: center;">
                <span style="display: flex; align-items: center; gap: 0.5rem;">${icon} ${label}</span>
                <span style="background: #fef3c7; color: #92400e; padding: 4px 10px; border-radius: 50px; font-size: 0.85rem;">${lostItems.length} kpl</span>
            </div>
            <div>`;
        
        lostItems.forEach((item, index) => {
            const isLast = index === lostItems.length - 1;
            const border = isLast ? '' : 'border-bottom: 1px solid #fde68a;';
            html += `<a href="${item.url}" target="_blank" rel="noopener noreferrer" 
                style="display: block; padding: 1.25rem; text-decoration: none; color: inherit; ${border} transition: background 0.2s;" 
                onmouseover="this.style.background='#fef9c3'" onmouseout="this.style.background='transparent'">
                <div style="font-weight: 700; color: #1e293b; font-size: 1rem; margin-bottom: 0.3rem;">${item.title}</div>
                <div style="font-size: 0.9rem; color: #64748b; line-height: 1.5;">${(item.description || '').substring(0, 120)}${item.description && item.description.length > 120 ? '...' : ''}</div>
            </a>`;
        });
        
        html += `</div></div>`;
        container.insertAdjacentHTML('beforeend', html);
        
        // Päivitetään myös tilastolaskuri
        const statEncounters = document.getElementById('stat-encounters');
        if (statEncounters) {
            const current = parseInt(statEncounters.textContent) || 0;
            statEncounters.textContent = current + lostItems.length;
        }
        
    } catch (err) {
        console.warn('Lostnfound-haku epäonnistui:', err);
    }
}

function loadScript(src) {
    return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
        const s = document.createElement('script');
        s.src = src;
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
    });
}

// �"?�"? L�"HIPAIKKOJEN LOGIIKKA (TAG CLOUD) �"?�"?
function haversineMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function renderNearbyPlaces(currentPlace) {
    if (!currentPlace.lat || !currentPlace.lon) return;
    const container = document.getElementById('nearby-places-section');
    const list = document.getElementById('nearby-places-list');
    if (!container || !list) return;

    const sb = window.aiSb;
    if (!sb) return;

    try {
        const { data: places, error } = await sb
            .from('places')
            .select('place_id, name, canonical_name, type, lat, lon')
            .not('lat', 'is', null)
            .not('lon', 'is', null);

        if (error || !places) return;

        let nearby = places.map(p => {
            if (p.place_id === currentPlace.place_id) return null;
            const dist = haversineMeters(currentPlace.lat, currentPlace.lon, p.lat, p.lon);
            return { ...p, dist };
        }).filter(p => p !== null && p.dist <= 5000);

        nearby.sort((a, b) => a.dist - b.dist);
        nearby = nearby.slice(0, 5);

        if (nearby.length > 0) {
            container.style.display = 'block';
            list.innerHTML = nearby.map(p => {
                const distText = p.dist < 1000
                    ? Math.round(p.dist) + ' m'
                    : (p.dist / 1000).toFixed(1).replace('.', ',') + ' km';

                let tagClass = 'tag-medium';
                if (p.dist < 300) tagClass = 'tag-large';
                else if (p.dist > 1000) tagClass = 'tag-small';

                // Näytetään oikea nimi (p.name) hashtagina, mutta haetaan kohde canonical-nimellä
                const displayName = p.name || p.canonical_name;
                const hashName = displayName.replace(/\s+/g, '');
                const searchName = (p.canonical_name || p.name).replace(/\s+/g, '_');

                return `<a href="tietoa-paikasta.html?name=${encodeURIComponent(searchName)}" class="nearby-tag ${tagClass}">#${hashName} <span class="dist">\u00b7 ${distText}</span></a>`;
            }).join('');
        }
    } catch (e) {
        console.warn('Nearby places error:', e);
    }
}

// ==========================================
// TAG ACTION MODAL (AI Activities & Themes)
// ==========================================

let currentActiveTag = '';

function openTagModal(tagName, iconName) {
    currentActiveTag = tagName;
    console.log("Ohjataan teemasivulle:", tagName);
    const searchTag = (tagName || '').toLowerCase().trim();
    const isInDist = window.location.pathname.includes('/dist/') || window.location.hostname === 'laukaainfo.fi';
    const distPrefix = isInDist ? '../' : './';
    window.location.href = `${distPrefix}teema.html?tag=${encodeURIComponent(searchTag)}`;
}

function closeTagModal() {
    // Deprecated
}

function actionFilterLocal() {}
function actionSearchGlobal() {}
function actionReportEncounter() {}

