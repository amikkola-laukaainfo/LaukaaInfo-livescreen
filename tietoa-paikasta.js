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

        // 2.6. Hae hierarkia: pääkohde (jos tämä on alakohde) + alakohteet (jos tämä on pääkohde)
        let parentPlace = null;
        let subPlaces = [];
        try {
            const hierarchyPromises = [];

            // Hae yläpaikka jos parent_place_id on asetettu
            if (placeData.parent_place_id) {
                hierarchyPromises.push(
                    aiSb.from('places')
                        .select('place_id, name, canonical_name, type, place_level, municipality, description')
                        .eq('place_id', placeData.parent_place_id)
                        .single()
                        .then(r => { if (!r.error && r.data) parentPlace = r.data; })
                );
            } else {
                hierarchyPromises.push(Promise.resolve());
            }

            // Hae alakohteet (paikat joiden parent_place_id on tämä paikka)
            hierarchyPromises.push(
                aiSb.from('places')
                    .select('place_id, name, canonical_name, type, place_level, description, lat, lon, importance')
                    .eq('parent_place_id', placeId)
                    .eq('status', 'ACTIVE')
                    .order('importance', { ascending: false })
                    .then(r => { if (!r.error && r.data) subPlaces = r.data; })
            );

            await Promise.all(hierarchyPromises);
        } catch (hierarchyErr) {
            console.warn('Hierarkiahaku epäonnistui:', hierarchyErr);
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
        
        // Hae myös Supabasen offers-taulusta tarjoukset (LaukaaLive-projekti: usswojtlvrnqtzwnffpg)
        try {
            const { data: supabaseOffers } = await window.LaukaaSupabase
                .from('offers')
                .select('*')
                .eq('place_id', String(placeId));
                
            if (supabaseOffers) {
                supabaseOffers.forEach(o => {
                    if (!allItemsMap.has(String(o.id))) {
                        allItemsMap.set(String(o.id), {
                            id: String(o.id),
                            type: (o.taxonomy && o.taxonomy.includes('Tapahtuma')) ? 'event' : 'offer',
                            name: o.name,
                            shortDescription: o.short_description || o.description,
                            image: o.image_url,
                            offer: {
                                validFrom: o.valid_from,
                                validUntil: o.valid_until
                            }
                        });
                    }
                });
            }
        } catch (e) {
            console.warn('Supabase offers haku epäonnistui:', e);
        }
        
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
        await renderPlace(placeData, otherRelatedItems, aiProfileData, allSources, allContents, scoredCompanies, parentPlace, subPlaces);

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
    const heroContainer = document.getElementById('place-gallery-hero');
    const thumbsContainer = document.getElementById('place-gallery-thumbnails');
    const badge = document.getElementById('media-count-badge');
    const viewAllBtn = document.getElementById('btn-view-all-images');
    const totalCountSpan = document.getElementById('gallery-total-count');

    if (!mediaSection || !heroContainer || !thumbsContainer) return;

    try {
        let { data: images, error } = await aiSb
            .from('place_images')
            .select('*')
            .eq('place_id', place.place_id)
            .order('sort_order', { ascending: true })
            .order('created_at', { ascending: false });

        if (place.place_id === '6df61792-3c94-412c-bbb7-0068c9c1a861') {
            images = [
                { image_url: 'https://images.unsplash.com/photo-1518605368461-1ee7c68856da?auto=format&fit=crop&w=1200&q=80', caption: 'Haarlan urheilukenttä', width: 1200, height: 800 },
                { image_url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80', caption: 'Rantamaisema', width: 1200, height: 800 },
                { image_url: 'https://images.unsplash.com/photo-1574629810360-7efbb98f45a5?auto=format&fit=crop&w=1200&q=80', caption: 'Urheilukentän juoksurata', width: 1200, height: 800 }
            ];
            error = null;
        }

        if (error || !images || images.length === 0) return;

        mediaSection.style.display = 'block';
        if (badge) badge.textContent = images.length;

        const storageBaseUrl = 'https://duxluwyqxvbmkkjzuzkz.supabase.co/storage/v1/object/public/';

        const getImgUrl = (img) => {
            if (img.image_url) return img.image_url;
            if (!img.storage_path) return '';
            return img.storage_path.startsWith('http') ? img.storage_path : (storageBaseUrl + img.storage_path);
        };

        const galleryItems = images.map(img => {
            const url = getImgUrl(img);
            return {
                src: url,
                msrc: url,
                w: img.width || 1600,
                h: img.height || 1600,
                alt: img.alt_text || img.caption || 'Kuva paikasta',
                caption: img.caption || ''
            };
        });
        
        // Render hero (ensimmäinen kuva)
        const heroImg = images[0];
        const heroUrl = getImgUrl(heroImg);
        heroContainer.innerHTML = `<img src="${heroUrl}" alt="${heroImg.alt_text || heroImg.caption || ''}" style="width: 100%; height: 100%; object-fit: cover;" data-pswp-idx="0">`;
        
        // Render thumbnails (seuraavat 4)
        const thumbImages = images.slice(1, 5);
        thumbsContainer.innerHTML = thumbImages.map((img, idx) => {
            const url = getImgUrl(img);
            return `<div style="aspect-ratio: 1; border-radius: 8px; overflow: hidden; cursor: pointer; background: #f1f5f9;">
                <img src="${url}" alt="${img.alt_text || img.caption || ''}" style="width: 100%; height: 100%; object-fit: cover;" data-pswp-idx="${idx + 1}">
            </div>`;
        }).join('');

        if (images.length > 5) {
            viewAllBtn.style.display = 'flex';
            if (totalCountSpan) totalCountSpan.textContent = images.length;
        }

        if (window.PhotoSwipeLightbox) {
            // Rakennetaan dataSource PhotoSwipelle
            const pswpDataSource = galleryItems.map(item => ({
                src: item.src,
                width: item.w,
                height: item.h,
                alt: item.alt,
                caption: item.caption
            }));

            let lightbox = new window.PhotoSwipeLightbox({
                pswpModule: window.PhotoSwipe,
                dataSource: pswpDataSource,
                padding: { top: 20, bottom: 20, left: 20, right: 20 },
                bgOpacity: 0.9
            });

            lightbox.init();

            // Avataan oikea kuva klikattaessa
            const onClick = (e) => {
                const imgEl = e.target.tagName === 'IMG' ? e.target : e.target.querySelector('img');
                if (imgEl && imgEl.hasAttribute('data-pswp-idx')) {
                    e.preventDefault();
                    lightbox.loadAndOpen(parseInt(imgEl.getAttribute('data-pswp-idx'), 10));
                }
            };
            
            heroContainer.addEventListener('click', onClick);
            thumbsContainer.addEventListener('click', onClick);
            
            viewAllBtn.addEventListener('click', () => {
                lightbox.loadAndOpen(0);
            });
        }

    } catch (err) {
        console.error('Virhe kuvien haussa:', err);
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
        
        // Fyysiset osumat sallitaan vain jos paikka on kaupallisesti kiinnostava
        if (place.commercial_visibility !== false) {
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
    if (tagMatches && Array.isArray(tagMatches) && place.commercial_visibility !== false) {
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

async function renderPlace(place, relatedItems, aiProfileData, allSources = [], allContents = [], scoredCompanies = [], parentPlace = null, subPlaces = []) {
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
    const statCompaniesLabel = document.getElementById('stat-companies-label');
    if (statCompanies) {
        statCompanies.textContent = companies.length;
        if (statCompaniesLabel) {
            statCompaniesLabel.textContent = companies.length === 1 ? 'yritys' : 'yritystä';
        }
    }
    
    const statObservations = document.getElementById('stat-observations');
    const statObservationsLabel = document.getElementById('stat-observations-label');
    if (statObservations) {
        statObservations.textContent = others.length;
        if (statObservationsLabel) {
            statObservationsLabel.textContent = others.length === 1 ? 'ilmoitus' : 'ilmoitusta';
        }
    }

    // Teemat / Liittyy teemoihin
    const themesSection = document.getElementById('themes-section');
    const themesList = document.getElementById('network-tags-list');
    if (themesSection && themesList) {
        const uniqueThemes = new Set();
        
        const normalizeTheme = (t) => {
            if (!t) return t;
            let normalized = t.trim().charAt(0).toUpperCase() + t.trim().slice(1).toLowerCase();
            // Fix known typos
            if (normalized === 'Hyvinvoinri') return 'Hyvinvointi';
            return normalized;
        };

        // Lisää AI-teemat jos olemassa
        if (aiProfileData && aiProfileData.themes && Array.isArray(aiProfileData.themes)) {
            aiProfileData.themes.forEach(t => uniqueThemes.add(normalizeTheme(t)));
        }

        // Lisää tyyppi
        if (place.type) uniqueThemes.add(normalizeTheme(getTypeLabel(place.type)));
        
        // Lisää relaatioista löytyvät
        relatedItems.forEach(i => {
            if (i.type && i.type !== 'observation' && i.type !== 'other') {
                uniqueThemes.add(normalizeTheme(getTypeLabel(i.type)));
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
                    if (tagName) uniqueThemes.add(normalizeTheme(tagName));
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
    renderCompanies(scoredCompanies, allSources, allContents, place);
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

    // Hierarkia: murupolku (jos alakohde) ja alakohteet (jos pääkohde)
    renderHierarchyNav(place, parentPlace);
    renderSubplaces(subPlaces, place);

    // Ladataan lähipaikat tag-pilvenä
    renderNearbyPlaces(place);
}

// ── HIERARKIA: MURUPOLKU (ALAKOHDE → YLÄPAIKKA) ────────────────────────────
function renderHierarchyNav(place, parentPlace) {
    const nav = document.getElementById('parent-navigation');
    if (!nav) return;

    if (parentPlace) {
        // Ollaan alakohteessa – näytetään linkki yläpaikkaan
        const parentName = parentPlace.name || parentPlace.canonical_name || 'Yläpaikka';
        const parentUrl = `tietoa-paikasta.html?id=${encodeURIComponent(parentPlace.place_id)}`;
        nav.style.display = 'flex';
        nav.innerHTML = `
            <a href="${parentUrl}" class="parent-nav-link">
                <span class="iconify" data-icon="material-symbols:arrow-back-rounded"></span>
                <span class="parent-nav-label">Osa aluetta:</span>
                <span class="parent-nav-name">${parentName}</span>
            </a>
        `;
    } else {
        nav.style.display = 'none';
    }
}

// ── HIERARKIA: ALAKOHTEET (PÄÄKOHDE → ALAKOHTEET) ──────────────────────────
function renderSubplaces(subPlaces, parentPlace) {
    const section = document.getElementById('subplaces-section');
    const list = document.getElementById('subplaces-list');
    if (!section || !list) return;

    if (!subPlaces || subPlaces.length === 0) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';
    
    const compactSubplaces = subPlaces.filter(sp => sp.importance === 1);
    const mainSubplaces = subPlaces.filter(sp => sp.importance !== 1);

    let html = '';
    
    if (compactSubplaces.length > 0) {
        html += `<div style="display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1.5rem; background: #f8fafc; padding: 1rem; border-radius: 12px; border: 1px solid #e2e8f0;">
            <h4 style="margin: 0 0 0.5rem 0; font-size: 0.95rem; color: #475569; font-weight: 600;">Palvelut ja kohteet</h4>
            <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                ${compactSubplaces.map(sp => {
                    const spName = sp.name || sp.canonical_name || 'Kohde';
                    const icon = getPlaceLevelEmoji(sp.type);
                    return `<div style="display: flex; align-items: center; gap: 0.75rem; font-size: 0.95rem; color: #1e293b;">
                        <span style="font-size: 1.25rem;">${icon}</span>
                        <span>${spName}</span>
                    </div>`;
                }).join('')}
            </div>
        </div>`;
    }

    if (mainSubplaces.length > 0) {
        html += mainSubplaces.map(sp => {
            const spName = sp.name || sp.canonical_name || 'Kohde';
            const typeLabel = getPlaceLevelLabel(sp.place_level, sp.type);
            const icon = getPlaceLevelIcon(sp.place_level, sp.type);
            return `
                <div class="subplace-card" onclick="openSubplaceModal('${sp.place_id}', '${escapeForAttr(spName)}', '${escapeForAttr(sp.description || '')}', '${sp.lat || ''}', '${sp.lon || ''}', '${typeLabel}', '${icon}')">
                    <span class="subplace-icon iconify" data-icon="${icon}"></span>
                    <div class="subplace-info">
                        <div class="subplace-name">${spName}</div>
                        ${sp.description ? `<div class="subplace-desc">${sp.description.substring(0, 80)}${sp.description.length > 80 ? '...' : ''}</div>` : ''}
                    </div>
                    <span class="subplace-arrow iconify" data-icon="material-symbols:chevron-right"></span>
                </div>
            `;
        }).join('');
    }
    
    list.innerHTML = html;
}

function getPlaceLevelEmoji(type) {
    const emojis = {
        'BEACH': '🏊',
        'NATURE': '🌲',
        'SERVICE': 'ℹ️',
        'ROUTE': '🚶',
        'EVENT_LOCATION': '🏟️',
        'BUILDING': '🏠'
    };
    return emojis[type] || '📍';
}

function getPlaceLevelLabel(level, type) {
    const levelMap = { 'AREA': 'Alue', 'LANDMARK': 'Nähtävyys', 'SUBPLACE': 'Kohde', 'POI': 'Piste' };
    const typeMap = { 'NATURE': 'Luontokohde', 'SERVICE': 'Palvelu', 'BEACH': 'Uimaranta', 'ROUTE': 'Reitti' };
    return levelMap[level] || typeMap[type] || 'Kohde';
}

function getPlaceLevelIcon(level, type) {
    if (level === 'AREA') return 'material-symbols:map-outline';
    if (level === 'LANDMARK') return 'material-symbols:landscape-outline';
    const typeIconMap = {
        'NATURE': 'material-symbols:park-outline',
        'SERVICE': 'material-symbols:storefront-outline',
        'BEACH': 'material-symbols:beach-access-outline',
        'ROUTE': 'material-symbols:route-outline',
        'BUILDING': 'material-symbols:home-outline',
        'EVENT_LOCATION': 'material-symbols:event-outline',
    };
    return typeIconMap[type] || 'material-symbols:place-outline';
}

function escapeForAttr(str) {
    return String(str).replace(/'/g, '&#39;').replace(/"/g, '&quot;').replace(/\n/g, ' ');
}

// ── ALAKOHDE MODAL ──────────────────────────────────────────────────────────
function openSubplaceModal(placeId, name, description, lat, lon, typeLabel, icon) {
    const modal = document.getElementById('subplace-modal');
    if (!modal) return;

    document.getElementById('subplace-modal-title').textContent = name;
    document.getElementById('subplace-modal-type').textContent = typeLabel;
    document.getElementById('subplace-modal-desc').textContent = description || 'Tarkempi kuvaus ladataan...';

    const fullPageBtn = document.getElementById('subplace-modal-fullpage');
    if (fullPageBtn) {
        fullPageBtn.style.display = 'inline-flex';
        fullPageBtn.href = `tietoa-paikasta.html?id=${encodeURIComponent(placeId)}`;
    }

    const mapBtn = document.getElementById('subplace-modal-map');
    if (lat && lon) {
        mapBtn.style.display = 'inline-flex';
        mapBtn.setAttribute('onclick', `window.open('https://maps.google.com/?q=${lat},${lon}', '_blank')`);
    } else {
        mapBtn.style.display = 'none';
    }

    // Jos kuvaus on lyhyt, haetaan tarkempi kuvaus Supabasesta
    if (!description && window.aiSb) {
        aiSb.from('places').select('description').eq('place_id', placeId).single()
            .then(r => {
                if (r.data && r.data.description) {
                    document.getElementById('subplace-modal-desc').textContent = r.data.description;
                }
            });
    }

    modal.style.display = 'flex';
    requestAnimationFrame(() => {
        modal.querySelector('.subplace-modal-content').style.transform = 'translateY(0)';
    });
}

function closeSubplaceModal() {
    const modal = document.getElementById('subplace-modal');
    if (!modal) return;
    const content = modal.querySelector('.subplace-modal-content');
    content.style.transform = 'translateY(100%)';
    setTimeout(() => { modal.style.display = 'none'; }, 300);
}

// Suljetaan modal taustaa klikkaamalla
document.addEventListener('click', (e) => {
    const modal = document.getElementById('subplace-modal');
    if (modal && e.target === modal) closeSubplaceModal();
});

// ── HAVAINTO MODAL ──────────────────────────────────────────────────────────
async function getFirebaseDbForObs() {
    if (!window.firebase) {
        try {
            await Promise.all([
                loadScript('https://www.gstatic.com/firebasejs/9.22.2/firebase-app-compat.js'),
                loadScript('https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore-compat.js')
            ]);
        } catch (e) {
            console.warn('Firebase lataus epäonnistui:', e);
        }
    }
    if (window.firebase && !window._lfApp) {
        window._lfApp = firebase.initializeApp({
            apiKey: 'AIzaSyA6l0FosuiXh9KxFfD5Q92BCP1EWbH8LN4',
            authDomain: 'lostnfound-f0d25.firebaseapp.com',
            projectId: 'lostnfound-f0d25',
        }, 'lostnfound');
    }
    return window.firebase ? firebase.firestore(window._lfApp) : null;
}

async function openObservationModal(id, name, description) {
    const modal = document.getElementById('subplace-modal');
    if (!modal) return;

    const decodedName = name ? decodeURIComponent(name) : 'Havainto';
    const decodedDesc = description ? decodeURIComponent(description) : '';

    document.getElementById('subplace-modal-title').textContent = decodedName;
    document.getElementById('subplace-modal-type').textContent = 'HAVAINTO';
    document.getElementById('subplace-modal-desc').textContent = decodedDesc || 'Haetaan havainnon tietoja...';

    const fullPageBtn = document.getElementById('subplace-modal-fullpage');
    if (fullPageBtn) fullPageBtn.style.display = 'none';

    const mapBtn = document.getElementById('subplace-modal-map');
    if (mapBtn) mapBtn.style.display = 'none';

    modal.style.display = 'flex';
    requestAnimationFrame(() => {
        modal.querySelector('.subplace-modal-content').style.transform = 'translateY(0)';
    });

    if (!id) return;

    try {
        const db = await getFirebaseDbForObs();
        let foundData = null;

        if (db) {
            // 1. Kokeillaan Firebase observations -kokoelmasta
            try {
                const obsDoc = await db.collection('observations').doc(id).get();
                if (obsDoc && obsDoc.exists) {
                    foundData = obsDoc.data();
                }
            } catch(e) {}

            if (!foundData) {
                // 2. Kokeillaan Firebase lostItems -kokoelmasta
                try {
                    const lostDoc = await db.collection('lostItems').doc(id).get();
                    if (lostDoc && lostDoc.exists) {
                        foundData = lostDoc.data();
                    }
                } catch(e) {}
            }
        }

        if (foundData) {
            const title = foundData.title || foundData.name || decodedName;
            const categoryStr = foundData.category ? `[${foundData.category}] ` : '';
            const desc = foundData.description || foundData.area || foundData.address || '';
            const dateStr = foundData.createdAt?.toDate ? foundData.createdAt.toDate().toLocaleDateString('fi-FI') : (foundData.timestamp?.toDate ? foundData.timestamp.toDate().toLocaleDateString('fi-FI') : '');

            document.getElementById('subplace-modal-title').textContent = title;
            
            let contentHtml = '';
            if (categoryStr || dateStr) {
                contentHtml += `<div style="font-size:0.85rem; font-weight:600; color:#059669; margin-bottom:0.5rem;">${categoryStr}${dateStr ? ' • ' + dateStr : ''}</div>`;
            }
            contentHtml += `<div style="color:var(--text-main); line-height:1.5;">${desc || 'Ei tarkempaa kuvausta.'}</div>`;
            
            const imgs = foundData.imageUrls || (foundData.imageUrl1 ? [foundData.imageUrl1, foundData.imageUrl2].filter(Boolean) : []);
            if (imgs && imgs.length > 0) {
                contentHtml += `<div style="display:flex; gap:0.5rem; margin-top:0.75rem; overflow-x:auto;">${imgs.map(u => `<img src="${u}" style="max-height:160px; border-radius:8px; object-fit:cover;" />`).join('')}</div>`;
            }

            document.getElementById('subplace-modal-desc').innerHTML = contentHtml;
            return;
        }

        if (window.aiSb) {
            const { data: postData } = await aiSb.from('posts').select('*').eq('id', id).maybeSingle();
            if (postData) {
                document.getElementById('subplace-modal-title').textContent = postData.title || decodedName;
                document.getElementById('subplace-modal-desc').textContent = postData.description || postData.content || decodedDesc || 'Ei tarkempaa kuvausta.';
                return;
            }
            const { data: encData } = await aiSb.from('encounters').select('*').eq('id', id).maybeSingle();
            if (encData) {
                document.getElementById('subplace-modal-title').textContent = encData.title || decodedName;
                document.getElementById('subplace-modal-desc').textContent = encData.description || decodedDesc || 'Ei tarkempaa kuvausta.';
                return;
            }
        }
    } catch (err) {
        console.warn('Virhe havainnon hakemisessa:', err);
    }
}

const TYPE_LABELS = {
    'business': 'Yritys',
    'service': 'Palvelu',
    'association': 'Yhdistys',
    'event': 'Tapahtuma',
    'offer': 'Tarjous',
    'product': 'Tuote'
};

function renderCompanies(scoredCompanies, allSources = [], allContents = [], currentPlace = null) {
    const listTier12 = document.getElementById('companies-list');
    const containerTier3 = document.getElementById('semantic-matches-container');
    const listTier3 = document.getElementById('semantic-matches-list');
    const containerTier4 = document.getElementById('premium-partners-container');
    const listTier4 = document.getElementById('premium-partners-list');
    
    const tier1and2 = scoredCompanies.filter(c => c.tier <= 2).sort((a,b) => {
        // Ensisijainen lajittelu: Osuman tarkkuus (tier 1 eli suora relaatio ennen tier 2)
        if (a.tier !== b.tier) return a.tier - b.tier;

        // Toissijainen lajittelu: Onko kumppani tai maksava profiili (subscription_tier 2)
        const aIsPartner = a.reasons && a.reasons.some(r => r.type === 'VISIBILITY');
        const bIsPartner = b.reasons && b.reasons.some(r => r.type === 'VISIBILITY');
        if (aIsPartner && !bIsPartner) return -1;
        if (!aIsPartner && bIsPartner) return 1;

        const aTier = a.subscription_tier || 1;
        const bTier = b.subscription_tier || 1;
        if (aTier !== bTier) return bTier - aTier;

        // Kolmas: Onko lisäsisältöä
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
        const isPartner = item.reasons && item.reasons.some(r => r.type === 'VISIBILITY');
        const subTier = item.subscription_tier || 1;
        
        let linkUrl = '?id=' + item.id;
        if (String(item.id).startsWith('yritys_') || item.type === 'business' || item.nimi) {
            linkUrl = 'yrityskortti.html?id=' + item.id;
        }
        
        const displayName = item.nimi || item.name || item.id;
        const displayIcon = isPartner ? '⭐' : (subTier === 2 ? '💎' : '');
        const displayTitle = `${displayName} ${displayIcon}`;
        
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
                    <div style="font-size: 0.85rem; color: #64748b; display: flex; flex-wrap: wrap; gap: 4px;">
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
                            <span style="font-weight: 700; font-size: 1.05rem; color: var(--dark-text);">${displayTitle}</span>
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
                        ${c.description ? `<p style="margin: 0 0 10px 0; font-size: 0.9rem; color: #64748b; line-height: 1.4;">${c.description}</p>` : ''}
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
    const nonCommercialNotice = document.getElementById('non-commercial-notice');
    if (listTier12) {
        if (tier1and2.length > 0) {
            if (nonCommercialNotice) nonCommercialNotice.style.display = 'none';
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
            const upsellHtml = `
            <div style="background: #f8fafc; border: 1px dashed #cbd5e1; padding: 1.25rem; border-radius: 12px; margin-top: 1rem; text-align: center;">
                <h4 style="margin: 0 0 0.5rem 0; color: #475569; font-size: 0.95rem;">Onko yrityksesi tällä listalla vain perustiedoilla?</h4>
                <p style="margin: 0 0 1rem 0; font-size: 0.85rem; color: #64748b;">Päivitä yritysprofiiliin (149 €/vuosi) ja nouse listan kärkeen logolla ja kuvauksella varustettuna.</p>
                <a href="kauppa.html" style="display: inline-block; padding: 0.4rem 1rem; background: #fff; border: 1px solid #cbd5e1; color: #0f172a; text-decoration: none; border-radius: 50px; font-size: 0.85rem; font-weight: 600;">Lue lisää profiileista</a>
            </div>`;
            
            listTier12.innerHTML = html + upsellHtml;
        } else {
            if (currentPlace && currentPlace.commercial_visibility === false) {
                if (nonCommercialNotice) nonCommercialNotice.style.display = 'block';
                listTier12.innerHTML = '';
            } else {
                if (nonCommercialNotice) nonCommercialNotice.style.display = 'none';
                listTier12.innerHTML = `<div style="text-align:center; color: #64748b; padding: 2rem; background: #f9fafb; border-radius: 12px; font-size: 0.9rem;">Ei paikallisia yrityksiä tai palvelupisteitä rekisteröitynä tähän kohteeseen.</div>`;
            }
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
            linkUrl = '/?item=' + item.id + '&feed=open';
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
                        ${item.shortDescription ? `<div style="font-size: 0.95rem; color: #64748b; margin-top: 0.5rem; line-height: 1.5;">${item.shortDescription}</div>` : ''}
                    </div>
                </div>
                ${thumbWrapHtml}
            </div>
        `;

        const highlightStyle = ' background: #f0f9ff; border-color: #bae6fd;';

        if (!hasExtraContent) {
            if (item.type === 'observation') {
                return `<div onclick="openObservationModal('${item.id}', '${encodeURIComponent(displayName)}', '${encodeURIComponent(item.shortDescription || '')}')" class="list-item-card" style="cursor:pointer; display: block;${highlightStyle}">${headerHtml}</div>`;
            }
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

        if (item.type === 'observation') {
            extraHtml += `<div style="margin-top: 15px;"><button onclick="openObservationModal('${item.id}', '${encodeURIComponent(displayName)}', '${encodeURIComponent(item.shortDescription || '')}')" style="display:inline-block; padding:8px 16px; background:var(--accent); color:white; border-radius:50px; border:none; cursor:pointer; font-weight:bold; font-size:0.9rem;">Näytä tiedot &rarr;</button></div>`;
        } else {
            const btnText = (item.id.startsWith('yritys_') || item.type === 'business') ? 'Siirry yrityskortille' : 'Siirry kohdekortille';
            extraHtml += `<div style="margin-top: 15px;"><a href="${linkUrl}" style="display:inline-block; padding:8px 16px; background:var(--accent); color:white; border-radius:50px; text-decoration:none; font-weight:bold; font-size:0.9rem;">${btnText} &rarr;</a></div>`;
        }

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
        const liveSb = window.LaukaaSupabase; // usswojtlvrnqtzwnffpg – Android-datan projekti
        if (window.aiSb && place.place_id) {
            try {
                // Contents-taulu (JSONB location->>place_id) – AI-projekti
                const { data: contentsData } = await window.aiSb
                    .from('contents')
                    .select('*')
                    .eq('location->>place_id', place.place_id);
                
                // Feed-julkaisut (posts-taulu) – LaukaaLive-projekti
                // Haetaan vain APPROVED-tilaiset tai ilman statusta (vanhat) – PENDING suodatetaan pois
                const postsResult = liveSb
                    ? await liveSb.from('posts').select('*')
                        .eq('place_id', place.place_id)
                        .or('status.eq.APPROVED,status.is.null')
                        .or(`valid_until.is.null,valid_until.gte.${new Date().toISOString()}`)
                    : { data: null };
                const postsData = postsResult.data;
                    
                // Tarjoukset/Tapahtumat – LaukaaLive-projekti
                const offersResult = liveSb
                    ? await liveSb.from('offers').select('*').eq('place_id', place.place_id)
                    : { data: null };
                const offersData = offersResult.data;
                    
                // Yhteisöjulkaisutyypit – käsitellään erikseen omaksi lohkokseen
                const COMMUNITY_TYPES = ['MEMORY', 'TIP', 'PHOTO', 'OBSERVATION', 'QUESTION'];
                    
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
                        // Tarkistetaan onko kyseessä yhteisöjulkaisu vai yrityksen julkaisu
                        const postTypeUpper = (item.type || '').toUpperCase();
                        const isCommunityPost = COMMUNITY_TYPES.includes(postTypeUpper);
                        
                        allItems.push({
                            id: item.id,
                            // Yhteisöjulkaisut saavat oman tyyppinsä, yritysposts pysyvät 'feed_post':na
                            type: isCommunityPost ? postTypeUpper : (item.type === 'event' ? 'event' : 'feed_post'),
                            title: item.title,
                            description: item.description,
                            image_url: item.image_url,
                            website_url: item.website_url,
                            facebook_url: item.facebook_url,
                            instagram_url: item.instagram_url,
                            youtube_url: item.youtube_url,
                            video_id: item.video_id,
                            is_shorts: item.is_shorts,
                            is_promoted: item.is_promoted,
                            publisher_name: item.publisher_name,
                            contact_email: item.contact_email,
                            contact_phone: item.contact_phone,
                            show_contact: item.show_contact,
                            tags: item.tags || [],
                            price_info: '',
                            // posts-taulun julkaisut (myös yhteisöjulkaisut kuten OBSERVATION, MEMORY jne.)
                            // ohjataan feed-näkymään – ilmoituskortti.html on vain encounters-taulun ilmoituksille
                            url: '/?item=' + item.id + '&feed=open',
                            created_at: item.publish_at || item.created_at
                        });
                    });
                }
                
                if (offersData) {
                    offersData.forEach(item => {
                        allItems.push({
                            id: item.id,
                            type: (item.taxonomy && item.taxonomy.includes('Tapahtuma')) ? 'event' : 'offer',
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
    const statEncountersLabel = document.getElementById('stat-encounters-label');
    if (statEncounters) {
        statEncounters.textContent = activeAlerts.length;
        if (statEncountersLabel) {
            statEncountersLabel.textContent = activeAlerts.length === 1 ? 'aktiivinen ilmoitus' : 'aktiivista ilmoitusta';
        }
    }
    
    const statOffers = document.getElementById('stat-offers');
    const statOffersLabel = document.getElementById('stat-offers-label');
    if (statOffers) {
        statOffers.textContent = offers.length;
        if (statOffersLabel) {
            statOffersLabel.textContent = offers.length === 1 ? 'tarjous' : 'tarjousta';
        }
    }
    
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
    
    // Yhteisöjulkaisutyyppit – renderöidään erillisessä lohkossa
    const COMMUNITY_POST_TYPES = ['MEMORY', 'TIP', 'PHOTO', 'OBSERVATION', 'QUESTION'];
    
    // Yhteisöjulkaisut erotellaan muista ennen renderöintiä
    const communityPosts = validEncounters.filter(e => COMMUNITY_POST_TYPES.includes(e.type));
    const regularEncounters = validEncounters.filter(e => !COMMUNITY_POST_TYPES.includes(e.type));
    
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
        'other': 'Muut ilmoitukset',
        // Yhteisöjulkaisut
        'MEMORY': 'Muistot',
        'TIP': 'Vinkit',
        'PHOTO': 'Kuvat',
        'OBSERVATION': 'Havainnot',
        'QUESTION': 'Kysymykset'
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
        'content_other': '📄',
        // Yhteisöjulkaisut
        'MEMORY': '📖',
        'TIP': '💡',
        'PHOTO': '📷',
        'OBSERVATION': '📍',
        'QUESTION': '❓'
    };
    
    // ── Säännölliset encounters: renderöidään ensin ───────────────────────────
    let html = '';
    
    // Accordion-ID counter (uniikki per sivu)
    let _accId = 0;
    
    for (const [type, items] of Object.entries(grouped).filter(([t]) => !COMMUNITY_POST_TYPES.includes(t))) {
        const label = typeLabels[type] || type;
        const icon = typeIcons[type] || '🔔';
        
        // feed_post ja event saavat oman accordion-renderöinnin
        const isFeedType = (type === 'feed_post' || type === 'event');
        
        html += `<div style="margin-bottom: 1.5rem; border: 1px solid #f3f4f6; border-radius: var(--inner-radius); overflow: hidden; background: var(--card-bg);">
            <div style="padding: 1.25rem; background: #f9fafb; font-weight: 700; color: var(--dark-text); border-bottom: 1px solid #f3f4f6; display: flex; justify-content: space-between; align-items: center;">
                <span style="display: flex; align-items: center; gap: 0.5rem;">${icon} ${label}</span>
                <span style="background: var(--bg-color); color: #64748b; padding: 4px 10px; border-radius: 50px; font-size: 0.85rem;">${items.length} kpl</span>
            </div>
            <div style="padding: 0;">`;
            
        items.forEach((item, index) => {
            const isLast = index === items.length - 1;
            const borderBottom = isLast ? '' : 'border-bottom: 1px solid #f3f4f6;';
            const priceHtml = item.price_info ? `<span style="font-weight: 700; color: var(--primary-hover); font-size: 0.95rem; background: #f0fdf4; padding: 0.4rem 0.8rem; border-radius: 50px;">${item.price_info}</span>` : '';
            const linkUrl = item.url || `ilmoituskortti.html?id=${item.id}`;
            
            if (isFeedType) {
                // ── ACCORDION-KORTTI feed_post / event ──────────────────
                const accId = `feed-acc-${_accId++}`;
                const hasImage = !!item.image_url;
                const hasVideo = !!item.video_id;
                const hasLinks = !!(item.facebook_url || item.instagram_url || item.website_url || item.youtube_url);
                const hasMedia = hasImage || hasVideo || hasLinks;
                
                const dateStr = item.created_at
                    ? new Date(item.created_at).toLocaleDateString('fi-FI', { day: 'numeric', month: 'short', year: 'numeric' })
                    : '';
                const authorHtml = item.publisher_name
                    ? `<span style="font-size:0.8rem;color:#64748b;font-weight:600;">${item.publisher_name}</span>`
                    : '';
                
                // Pikkukuva otsikkopalkkiin
                const thumbHtml = hasImage
                    ? `<img src="${item.image_url}" alt="" style="width:48px;height:48px;object-fit:cover;border-radius:8px;flex-shrink:0;">`
                    : (hasVideo ? `<div style="width:48px;height:48px;background:#fee2e2;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:1.4rem;">▶</div>` : '');
                
                // YouTube iframe tai kuva accordion-sisällössä
                let mediaContent = '';
                if (hasVideo) {
                    const ytBase = item.is_shorts ? 'https://www.youtube.com/shorts/' : 'https://www.youtube.com/embed/';
                    const aspectStyle = item.is_shorts
                        ? 'padding-top: 177%'   // 9:16 Shorts
                        : 'padding-top: 56.25%'; // 16:9 normaali
                    mediaContent += `
                        <div style="position:relative;${aspectStyle};border-radius:10px;overflow:hidden;margin-bottom:0.75rem;">
                            <iframe src="${ytBase}${item.video_id}?rel=0" 
                                style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;"
                                allowfullscreen loading="lazy" title="${item.title || 'Video'}">
                            </iframe>
                        </div>`;
                } else if (hasImage) {
                    mediaContent += `<img src="${item.image_url}" alt="${item.title || 'Kuva'}" 
                        style="width:100%;max-height:320px;object-fit:cover;border-radius:10px;margin-bottom:0.75rem;">`;
                }
                
                // Linkki-ikonirivistö
                if (hasLinks) {
                    mediaContent += `<div style="display:flex;gap:0.6rem;flex-wrap:wrap;margin-top:0.5rem;">`;
                    if (item.facebook_url)  mediaContent += `<a href="${item.facebook_url}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:0.3rem;font-size:0.82rem;background:#eff6ff;color:#1d4ed8;padding:0.35rem 0.8rem;border-radius:50px;text-decoration:none;font-weight:600;">📘 Facebook</a>`;
                    if (item.instagram_url) mediaContent += `<a href="${item.instagram_url}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:0.3rem;font-size:0.82rem;background:#fdf4ff;color:#9333ea;padding:0.35rem 0.8rem;border-radius:50px;text-decoration:none;font-weight:600;">📸 Instagram</a>`;
                    if (item.website_url)   mediaContent += `<a href="${item.website_url}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:0.3rem;font-size:0.82rem;background:#f0fdf4;color:#16a34a;padding:0.35rem 0.8rem;border-radius:50px;text-decoration:none;font-weight:600;">🌐 Verkkosivu</a>`;
                    if (item.youtube_url && !hasVideo) mediaContent += `<a href="${item.youtube_url}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:0.3rem;font-size:0.82rem;background:#fef2f2;color:#dc2626;padding:0.35rem 0.8rem;border-radius:50px;text-decoration:none;font-weight:600;">▶ YouTube</a>`;
                    mediaContent += `</div>`;
                }
                
                html += `
                <div style="${borderBottom}">
                    <!-- accordion otsikko -->
                    <div onclick="(function(el){var c=document.getElementById('${accId}');var open=c.style.maxHeight&&c.style.maxHeight!=='0px';c.style.maxHeight=open?'0px':c.scrollHeight+'px';c.style.opacity=open?'0':'1';el.querySelector('.acc-arrow').style.transform=open?'rotate(0deg)':'rotate(180deg)';})(this)"
                        style="display:flex;align-items:flex-start;gap:0.85rem;padding:1.1rem 1.25rem;cursor:pointer;transition:background 0.2s;"
                        onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background='transparent'">
                        ${thumbHtml}
                        <div style="flex:1;min-width:0;">
                            <div style="font-weight:700;color:var(--dark-text);font-size:1rem;margin-bottom:0.2rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${item.title}</div>
                            <div style="font-size:0.88rem;color:#64748b;line-height:1.45;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${item.description || ''}</div>
                            <div style="margin-top:0.4rem;display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;">
                                ${authorHtml}
                                ${dateStr ? `<span style="font-size:0.75rem;color:#94a3b8;">${dateStr}</span>` : ''}
                                ${item.is_promoted ? `<span style="font-size:0.72rem;background:#fef9c3;color:#92400e;padding:2px 7px;border-radius:50px;font-weight:700;">⭐ Nostettu</span>` : ''}
                            </div>
                        </div>
                        ${hasMedia ? `<span class="acc-arrow" style="flex-shrink:0;font-size:1rem;color:#94a3b8;transition:transform 0.25s;transform:rotate(0deg);">▼</span>` : `<a href="${linkUrl}" onclick="event.stopPropagation()" style="flex-shrink:0;font-size:0.82rem;color:var(--primary);text-decoration:none;font-weight:600;white-space:nowrap;">Avaa →</a>`}
                    </div>
                    <!-- accordion sisältö -->
                    ${hasMedia ? `
                    <div id="${accId}" style="max-height:0;opacity:0;overflow:hidden;transition:max-height 0.35s ease,opacity 0.25s ease;">
                        <div style="padding:0 1.25rem 1.25rem;">
                            ${mediaContent}
                            <a href="${linkUrl}" style="display:inline-flex;align-items:center;gap:0.4rem;margin-top:0.75rem;font-size:0.85rem;color:var(--primary);text-decoration:none;font-weight:700;">
                                Avaa koko julkaisu →
                            </a>
                        </div>
                    </div>` : ''}
                </div>`;
                
            } else {
                // ── NORMAALI RIVI muille tyypeille ──────────────────────
                html += `<a href="${linkUrl}" style="display: block; padding: 1.25rem; text-decoration: none; color: inherit; ${borderBottom} transition: background 0.2s;" onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background='transparent'">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem;">
                    <div>
                        <div style="font-weight: 700; color: var(--dark-text); font-size: 1.05rem; margin-bottom: 0.4rem;">${item.title}</div>
                        <div style="font-size: 0.95rem; color: #64748b; line-height: 1.5;">${(item.description || '').substring(0, 150)}${(item.description && item.description.length > 150) ? '...' : ''}</div>
                    </div>
                    ${priceHtml}
                </div>
            </a>`;
            }
        });
        
        html += `</div></div>`;
    }
    
    container.innerHTML = html;
    
    // ── Yhteisöjulkaisut: lisätään säännöllisten encounters PÄÄLLE (alkuun) ──
    if (communityPosts.length > 0) {
        const communityGrouped = {};
        communityPosts.forEach(p => {
            if (!communityGrouped[p.type]) communityGrouped[p.type] = [];
            communityGrouped[p.type].push(p);
        });
        
        let communityHtml = '';
        for (const [type, items] of Object.entries(communityGrouped)) {
            const label = typeLabels[type] || type;
            const icon = typeIcons[type] || '✏️';
            
            // Tyyppikohtaiset visuaaliset tyylit
            const styleMap = {
                'MEMORY':      { border: '#a78bfa', bg: '#f5f3ff', headerBg: '#ede9fe', headerColor: '#5b21b6' },
                'TIP':         { border: '#34d399', bg: '#f0fdf9', headerBg: '#d1fae5', headerColor: '#065f46' },
                'PHOTO':       { border: '#60a5fa', bg: '#eff6ff', headerBg: '#dbeafe', headerColor: '#1e40af' },
                'OBSERVATION': { border: '#fb923c', bg: '#fff7ed', headerBg: '#fed7aa', headerColor: '#9a3412' },
                'QUESTION':    { border: '#f472b6', bg: '#fdf2f8', headerBg: '#fce7f3', headerColor: '#9d174d' }
            };
            const s = styleMap[type] || { border: '#94a3b8', bg: '#f8fafc', headerBg: '#f1f5f9', headerColor: '#334155' };
            
            communityHtml += `<div style="margin-bottom: 1.5rem; border: 1px solid ${s.border}; border-radius: var(--inner-radius); overflow: hidden; background: ${s.bg};">
                <div style="padding: 1.25rem; background: ${s.headerBg}; font-weight: 700; color: ${s.headerColor}; border-bottom: 1px solid ${s.border}; display: flex; justify-content: space-between; align-items: center;">
                    <span style="display: flex; align-items: center; gap: 0.5rem;">${icon} ${label}</span>
                    <span style="background: white; color: ${s.headerColor}; padding: 4px 10px; border-radius: 50px; font-size: 0.85rem;">${items.length} kpl</span>
                </div>
                <div>`;
            
            items.forEach((item, idx) => {
                const isLast = idx === items.length - 1;
                const border = isLast ? '' : `border-bottom: 1px solid ${s.border};`;
                const dateStr = item.created_at ? new Date(item.created_at).toLocaleDateString('fi-FI', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
                const authorHtml = item.publisher_name ? `<span style="font-size: 0.8rem; color: ${s.headerColor}; font-weight: 600;">— ${item.publisher_name}</span>` : '';
                const imgHtml = item.image_url ? `<img src="${item.image_url}" alt="" style="width: 100%; max-height: 200px; object-fit: cover; border-radius: 8px; margin-top: 0.75rem;">` : '';
                
                communityHtml += `<a href="${item.url}" style="display: block; padding: 1.25rem; text-decoration: none; color: inherit; ${border} transition: background 0.2s;" onmouseover="this.style.background='rgba(0,0,0,0.02)'" onmouseout="this.style.background='transparent'">
                    <div style="font-weight: 700; color: ${s.headerColor}; font-size: 1rem; margin-bottom: 0.4rem; font-style: ${type === 'MEMORY' ? 'italic' : 'normal'};">${item.title}</div>
                    <div style="font-size: 0.95rem; color: #374151; line-height: 1.6; margin-bottom: 0.5rem;">${(item.description || '').substring(0, 200)}${(item.description || '').length > 200 ? '...' : ''}</div>
                    ${imgHtml}
                    <div style="margin-top: 0.5rem; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.25rem;">
                        ${authorHtml}
                        ${dateStr ? `<span style="font-size: 0.8rem; color: #94a3b8;">${dateStr}</span>` : ''}
                    </div>
                </a>`;
            });
            
            communityHtml += '</div></div>';
        }
        
        container.insertAdjacentHTML('afterbegin', communityHtml);
    }
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
        
        // ── Hero-kuvakortti: poimitaan viimeisin kuva Lostnfound-havainnoista ──
        // Järjestetään timestamp mukaan (uusin ensin) ja otetaan ensimmäinen jolla on imageUrl1
        const sortedByDate = [...activeDocs].sort((a, b) => {
            const tA = a.data().timestamp?.toMillis?.() || 0;
            const tB = b.data().timestamp?.toMillis?.() || 0;
            return tB - tA;
        });
        const docWithImage = sortedByDate.find(doc => !!doc.data().imageUrl1);
        if (docWithImage) {
            const imgData = docWithImage.data();
            const photoCard = document.getElementById('place-photo-card');
            const photoImg  = document.getElementById('place-photo-img');
            const photoLabel = document.getElementById('place-photo-label');
            if (photoCard && photoImg) {
                photoImg.src = imgData.imageUrl1;
                photoImg.alt = imgData.title || 'Paikan kuva';
                // Näytetään ilmoituksen nimi kortissa
                if (photoLabel) {
                    const category = imgData.category === 'LOST' || imgData.category === 'lost' ? 'Kadonnut' : 'Löytynyt';
                    photoLabel.textContent = `${category}: ${(imgData.title || 'Havainto').substring(0, 28)}`;
                }
                // Klikkaaminen avaa Lostnfound-ilmoituksen
                photoCard.style.cursor = 'pointer';
                photoCard.onclick = () => window.open(`https://lostnfound-f0d25.web.app/item/${docWithImage.id}`, '_blank');
                photoCard.style.display = 'block';
                console.log('Hero-kuvakortti asetettu:', imgData.imageUrl1);
            }
        }
        
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
    // Välitetään place_id mukana kontekstuaalista teemahakua varten (sama kuin network-tag-linkeissä)
    const currentUrlParams = new URLSearchParams(window.location.search);
    const currentPlaceId = currentUrlParams.get('id');
    const placeContext = currentPlaceId ? `&place_id=${encodeURIComponent(currentPlaceId)}` : '';
    window.location.href = `${distPrefix}teema.html?tag=${encodeURIComponent(searchTag)}${placeContext}`;
}

function closeTagModal() {
    // Deprecated
}

function actionFilterLocal() {}
function actionSearchGlobal() {}
function actionReportEncounter() {}

