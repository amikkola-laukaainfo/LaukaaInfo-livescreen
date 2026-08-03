// teema.js
// Kokoaa yhteen paikat, yritykset ja tapahtumat tietyn tägin (teeman) perusteella
// Käyttää theme_taxonomy.json-hierarkiaa synonyymien laajentamiseen

// ── AI Supabase (entity_tags-hakuja varten) ──────────────────────────────────
const AI_SB_URL = 'https://duxluwyqxvbmkkjzuzkz.supabase.co';
const AI_SB_KEY = 'sb_publishable_HgfWyipuSO7gvsVUR1smNQ_aXox2OPu';
let aiSbClient = null;
if (typeof supabase !== 'undefined') {
    aiSbClient = supabase.createClient(AI_SB_URL, AI_SB_KEY);
}

// ── Apufunktio: Kerää kaikki teemaan liittyvät hakutermit taksonomiasta ──────
function buildSearchTerms(taxonomy, tagParam) {
    const terms = new Set([tagParam.toLowerCase()]);

    const searchInGroups = (groups) => {
        if (!groups) return;
        for (const group of groups) {
            // Tarkista matchaako ryhmä tai sen alla oleva tagi
            const groupMatch = group.id === tagParam || group.label?.toLowerCase() === tagParam;
            
            if (group.tags) {
                for (const tag of group.tags) {
                    const tagMatch = tag.id === tagParam || tag.label?.toLowerCase() === tagParam;
                    if (tagMatch || groupMatch) {
                        terms.add(tag.id.toLowerCase());
                        terms.add(tag.label.toLowerCase());
                        (tag.synonyms || []).forEach(s => terms.add(s.toLowerCase()));
                    }
                }
            }
            if (group.groups) searchInGroups(group.groups);
        }
    };

    if (!taxonomy?.main_groups) return terms;

    for (const main of taxonomy.main_groups) {
        const mainMatch = main.id === tagParam || main.label?.toLowerCase() === tagParam;
        if (mainMatch) {
            // Pääteema osui: lisätään kaikki sen alla olevat tagit
            terms.add(main.label.toLowerCase());
            if (main.groups) {
                for (const group of main.groups) {
                    if (group.tags) {
                        for (const tag of group.tags) {
                            terms.add(tag.id.toLowerCase());
                            terms.add(tag.label.toLowerCase());
                            (tag.synonyms || []).forEach(s => terms.add(s.toLowerCase()));
                        }
                    }
                }
            }
        } else if (main.groups) {
            searchInGroups(main.groups);
        }
    }

    // Tarkista myös target_groups, seasons, features
    for (const item of [...(taxonomy.target_groups || []), ...(taxonomy.seasons || []), ...(taxonomy.features || [])]) {
        if (item.id === tagParam || item.label?.toLowerCase() === tagParam) {
            terms.add(item.id.toLowerCase());
            terms.add(item.label.toLowerCase());
            (item.synonyms || []).forEach(s => terms.add(s.toLowerCase()));
        }
    }

    return terms;
}

// ── Apufunktiot: Haku ja suodatus ─────────────────
function matchesTags(tagString, terms) {
    if (!tagString) return false;
    const tags = Array.isArray(tagString) ? tagString : tagString.split(',');
    for (const tag of tags) {
        const t = tag.trim().toLowerCase();
        if (terms.has(t)) return true;
    }
    return false;
}

function matchesTerms(text, terms) {
    if (!text) return false;
    const lower = text.toLowerCase();
    for (const term of terms) {
        if (term.length <= 3) {
            // Lyhyet termit (esim "ft", "spa"): vaadi sanarajat
            const regex = new RegExp(`\\b${term}\\b`, 'i');
            if (regex.test(text)) return true;
        } else {
            // Pidemmät termit: jos täsmää suoraan
            if (lower.includes(term)) return true;
        }
    }
    return false;
}

document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const tagParam = urlParams.get('tag');

    if (!tagParam) {
        document.getElementById('loading-spinner').style.display = 'none';
        document.getElementById('error-message').style.display = 'flex';
        return;
    }

    const searchTag = tagParam.toLowerCase().trim();
    
    // Aseta hero-otsikko
    document.getElementById('theme-name').textContent = tagParam.charAt(0).toUpperCase() + tagParam.slice(1);
    
    // Aseta karttalinkki
    const mapBtn = document.getElementById('btn-map');
    if (mapBtn) {
        mapBtn.href = `karttakohteet.html?cat=${encodeURIComponent(tagParam)}`;
    }

    try {
        const cacheBuster = new Date().getTime();
        
        // Hae data JSON-tiedostoista ja taksonomia rinnakkain
        const [placesRes, companiesRes, taxonomyRes] = await Promise.all([
            fetch('kohdekortit/kohteet.json?v=' + cacheBuster),
            fetch('live_companies.json?v=' + cacheBuster),
            fetch('theme_taxonomy.json?v=' + cacheBuster)
        ]);

        // Lataa taksonomia synonyymejä varten
        let taxonomy = null;
        if (taxonomyRes.ok) {
            try { taxonomy = await taxonomyRes.json(); } catch(e) {}
        }

        // Rakenna laajennetttu hakutermilista
        const searchTerms = buildSearchTerms(taxonomy, searchTag);
        console.log(`Teema "${tagParam}" – hakutermit:`, [...searchTerms]);


        let allPlaces = [];
        let allCompanies = [];
        
        if (placesRes.ok) {
            const pData = await placesRes.json();
            allPlaces = Array.isArray(pData) ? pData : (pData.results || []);
        }
        if (companiesRes.ok) {
            const cData = await companiesRes.json();
            allCompanies = Array.isArray(cData) ? cData : (cData.results || []);
        }
        
        // Etsi AI Supabasesta paikat joilla on tämä tag entity_tags-taulussa
        let sbPlaces = [];
        let sbAjankohtainen = []; // Tuleva: ilmoitukset, tarjoukset jne.

        if (aiSbClient) {
            try {
                // 1. Hae käypää tag_id:tä vastaava tietue tags-taulusta
                const tagLower = searchTag.toLowerCase();
                const { data: matchingTags } = await aiSbClient
                    .from('tags')
                    .select('tag_id, name')
                    .or(`tag_id.eq.${tagLower},name.ilike.${tagLower}`);

                const resolvedTagIds = (matchingTags || []).map(t => t.tag_id);

                // Laajenna hakutermien perusteella: osa termeistä voi täsmätä tag_id:hen
                for (const term of searchTerms) {
                    resolvedTagIds.push(term);
                }
                const uniqueTagIds = [...new Set(resolvedTagIds)];

                if (uniqueTagIds.length > 0) {
                    // 2. Hae kaikki entity_tags-merkinnät
                    const { data: taggedEntities } = await aiSbClient
                        .from('entity_tags')
                        .select('entity_type, entity_id, tag_id')
                        .in('tag_id', uniqueTagIds);

                    if (taggedEntities && taggedEntities.length > 0) {
                        // Places: hae place_id:t
                        const taggedPlaceIds = taggedEntities
                            .filter(e => e.entity_type === 'place')
                            .map(e => e.entity_id);

                        if (taggedPlaceIds.length > 0) {
                            const { data: sbPlaceData } = await aiSbClient
                                .from('places')
                                .select('place_id, name, canonical_name, type, description, municipality')
                                .in('place_id', taggedPlaceIds)
                                .or('status.eq.active,status.eq.ACTIVE,status.is.null');

                            sbPlaces = (sbPlaceData || []).map(p => ({
                                id: p.place_id,
                                name: p.name || p.canonical_name,
                                type: p.type,
                                description: p.description,
                                municipality: p.municipality,
                                isSupabase: true,
                                source: 'entity_tags'
                            }));
                        }

                        // Hae kohtaamiset (encounters) LaukaaLive-Supabasesta
                        const encounterIds = taggedEntities
                            .filter(e => e.entity_type === 'encounter')
                            .map(e => e.entity_id);
                        
                        if (encounterIds.length > 0 && window.LaukaaSupabase) {
                            try {
                                const { data: encounterData, error } = await window.LaukaaSupabase
                                    .from('encounters')
                                    .select('*')
                                    .in('id', encounterIds)
                                    .order('created_at', { ascending: false });

                                if (!error && encounterData) {
                                    encounterData.forEach(enc => {
                                        sbAjankohtainen.push({
                                            id: enc.id,
                                            type: 'encounter',
                                            category: enc.category,
                                            description: enc.description,
                                            location_name: enc.location_name,
                                            photo_url: enc.photo_url,
                                            created_at: enc.created_at,
                                            isSupabase: true
                                        });
                                    });
                                }
                            } catch(err) {
                                console.warn('Virhe haettaessa kohtaamisia LaukaaLive Supabasesta:', err);
                            }
                        }

                        // Hae feed_post -julkaisut (posts-taulu)
                        const feedPostEntities = taggedEntities.filter(e => e.entity_type === 'feed_post');
                        if (feedPostEntities.length > 0) {
                            try {
                                const feedPostIds = feedPostEntities.map(e => e.entity_id);
                                const { data: feedData, error: feedError } = await window.LaukaaSupabase
                                    .from('posts')
                                    .select('*')
                                    .in('id', feedPostIds)
                                    .order('created_at', { ascending: false });
                                if (!feedError && feedData) {
                                    feedData.forEach(post => {
                                        sbAjankohtainen.push({
                                            id: post.id,
                                            type: 'feed_post',
                                            category: 'Julkaisu',
                                            description: post.content || post.title || '',
                                            location_name: post.location_name || '',
                                            photo_url: post.image_url || null,
                                            created_at: post.created_at,
                                            isSupabase: true
                                        });
                                    });
                                }
                            } catch(err) {
                                console.warn('Virhe haettaessa feed-julkaisuja LaukaaLive Supabasesta:', err);
                            }
                        }

                        // Hae offer -tarjoukset (offers-taulu)
                        const offerEntities = taggedEntities.filter(e => e.entity_type === 'offer');
                        if (offerEntities.length > 0) {
                            try {
                                const offerIds = offerEntities.map(e => e.entity_id);
                                const { data: offersData, error: offersError } = await window.LaukaaSupabase
                                    .from('offers')
                                    .select('*')
                                    .in('id', offerIds)
                                    .order('created_at', { ascending: false });
                                if (!offersError && offersData) {
                                    offersData.forEach(offer => {
                                        sbAjankohtainen.push({
                                            id: offer.id,
                                            type: 'offer',
                                            category: 'Tarjous',
                                            description: offer.description || offer.name || '',
                                            location_name: '',
                                            photo_url: offer.photo_url || null,
                                            created_at: offer.created_at,
                                            isSupabase: true
                                        });
                                    });
                                }
                            } catch(err) {
                                console.warn('Virhe haettaessa tarjouksia LaukaaLive Supabasesta:', err);
                            }
                        }
                    }
                }
            } catch(e) {
                console.warn('AI Supabase entity_tags -haku epäonnistui:', e);
            }
        }
        
        // 1. Suodata paikat käyttäen laajennettua hakutermilista
        const matchedPlaces = allPlaces.filter(p => {
            if (matchesTags(p.tags, searchTerms)) return true;
            return matchesTerms(p.type, searchTerms) || matchesTerms(p.description, searchTerms) || matchesTerms(p.name, searchTerms);
        });

        // Tapahtumat erikseen (type === 'event')
        const matchedEvents = matchedPlaces.filter(p => (p.type || '').toLowerCase() === 'event');
        const matchedPlaceNodes = matchedPlaces.filter(p => (p.type || '').toLowerCase() !== 'event');
        
        // Lisää entity_tags-pohjaiset Supabase-paikat (ei duplikaatteja)
        sbPlaces.forEach(p => {
            if (!matchedPlaceNodes.find(existing => existing.id === p.id || existing.id === p.place_id)) {
                matchedPlaceNodes.push(p);
            }
        });
        
        // 2. Suodata yritykset käyttäen laajennettua hakutermilista
        const matchedCompanies = allCompanies.filter(c => {
            // Täsmätään ensisijaisesti tagit tarkasti
            if (matchesTags(c.tags, searchTerms)) return true;
            // Muut kentät sallitaan, mutta ne ovat alttiita väärille osumille jos ei varovainen
            return matchesTerms(c.palvelutapa, searchTerms) ||
                   matchesTerms(c.kategoria, searchTerms);
        });
        
        // Renderöi Paikat
        const placesContainer = document.getElementById('places-list');
        if (matchedPlaceNodes.length === 0) {
            placesContainer.innerHTML = '<p style="color: var(--text-muted);">Ei paikkoja tällä teemalla.</p>';
        } else {
            placesContainer.innerHTML = matchedPlaceNodes.map(p => {
                const url = `tietoa-paikasta.html?id=${encodeURIComponent(p.id)}`;
                const typeTranslations = {
                    'LANDMARK': 'Nähtävyys',
                    'NATURE': 'Luontokohde',
                    'SERVICE': 'Palvelu',
                    'BUILDING': 'Rakennus',
                    'AREA': 'Alue',
                    'ROUTE': 'Reitti'
                };
                const typeName = typeTranslations[p.type] || p.type || 'Paikka';
                const desc = p.description ? p.description.substring(0, 100) + '...' : '';
                
                return `
                    <a href="${url}" class="list-item-card">
                        <div style="font-size: 0.8rem; font-weight: 700; color: var(--accent); text-transform: uppercase; margin-bottom: 0.5rem;">📍 ${typeName}</div>
                        <h3 style="margin: 0 0 0.5rem 0; font-family: Outfit, sans-serif; font-size: 1.25rem; color: var(--text-main);">${p.name}</h3>
                        <p style="margin: 0; font-size: 0.95rem; color: var(--text-muted);">${desc}</p>
                    </a>
                `;
            }).join('');
        }
        
        // Renderöi Yritykset
        const companiesContainer = document.getElementById('companies-list');
        if (matchedCompanies.length === 0) {
            companiesContainer.innerHTML = '<p style="color: var(--text-muted);">Ei palveluita tällä teemalla.</p>';
        } else {
            const generateCompanyHtml = (c) => {
                const url = `yrityskortti.html?id=${encodeURIComponent(c.id)}`;
                const rawTags = (c.tags || '').split(',').map(t => t.trim()).filter(t => t.length > 0 && t !== '-');
                const tagHtml = rawTags.slice(0, 3).map(t => `<span class="tag-pill">${t}</span>`).join('');
                
                return `
                    <a href="${url}" class="list-item-card">
                        <div class="card-header-grid">
                            <div>
                                <h3 style="margin: 0 0 0.25rem 0; font-size: 1.1rem; color: var(--text-main);">${c.nimi}</h3>
                                <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.75rem;">${c.kategoria || ''}</div>
                                <div>${tagHtml}</div>
                            </div>
                        </div>
                    </a>
                `;
            };

            const visibleCompanies = matchedCompanies.slice(0, 5);
            let html = visibleCompanies.map(generateCompanyHtml).join('');
            
            if (matchedCompanies.length > 5) {
                const moreCount = matchedCompanies.length - 5;
                html += `
                    <div style="text-align: center; margin-top: 1rem; margin-bottom: 1rem;">
                        <button onclick="document.getElementById('more-companies').style.display='flex'; this.style.display='none';" style="background: transparent; border: 1px solid #cbd5e1; color: #475569; padding: 0.6rem 1.2rem; border-radius: 50px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 0.5rem; transition: all 0.2s;">
                            Näytä ${moreCount} muuta palvelua
                            <span class="iconify" data-icon="material-symbols:expand-more"></span>
                        </button>
                    </div>
                    <div id="more-companies" style="display: none; flex-direction: column; gap: 0;">
                        ${matchedCompanies.slice(5).map(generateCompanyHtml).join('')}
                    </div>
                `;
            }
            companiesContainer.innerHTML = html;
        }
        
        // Renderöi Kohtaamiset (Encounters)
        const encountersSection = document.getElementById('encounters-section');
        const encountersContainer = document.getElementById('encounters-list');
        
        if (sbAjankohtainen.length === 0) {
            if (encountersSection) encountersSection.style.display = 'none';
        } else {
            if (encountersSection) encountersSection.style.display = 'block';
            if (encountersContainer) {
                encountersContainer.innerHTML = sbAjankohtainen.map(enc => {
                    const dateStr = enc.created_at ? new Date(enc.created_at).toLocaleDateString('fi-FI', { day:'numeric', month:'long', year:'numeric' }) : '';
                    return `
                        <div class="card event-card" style="border-left: 4px solid #10b981;">
                            <div class="card-content">
                                <span class="badge" style="background: #10b981;">Kohtaaminen</span>
                                <h3 class="card-title">${enc.category || 'Julkaisu'}</h3>
                                <p class="card-description" style="margin-top: 0.5rem;">${enc.description || ''}</p>
                                <div class="card-meta">
                                    <span class="meta-item">
                                        <span class="iconify" data-icon="material-symbols:location-on-outline"></span> ${enc.location_name || 'Laukaa'}
                                    </span>
                                    ${dateStr ? `<span class="meta-item"><span class="iconify" data-icon="material-symbols:calendar-month-outline"></span> ${dateStr}</span>` : ''}
                                </div>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        }
        // Renderöi Tapahtumat – suodatettu kohteet.json:n event-tyypeistä
        const eventsContainer = document.getElementById('events-list');
        if (matchedEvents.length === 0) {
            eventsContainer.innerHTML = '<p style="color: var(--text-muted);">Ei tapahtumia tällä teemalla.</p>';
        } else {
            eventsContainer.innerHTML = matchedEvents.map(e => {
                const eventData = e.event || {};
                const dateStr = eventData.startDate ? new Date(eventData.startDate).toLocaleDateString('fi-FI', { day:'numeric', month:'long', year:'numeric' }) : '';
                const venue = eventData.venue || (e.location && e.location.municipality) || '';
                const ticketUrl = eventData.ticketUrl || '';
                const img = (e.images && e.images[0]) || '';
                const desc = (e.shortDescription || e.description || '').substring(0, 110);
                
                return `
                    <a href="tietoa-paikasta.html?id=${encodeURIComponent(e.id)}" class="list-item-card">
                        ${img ? `<img src="${img}" alt="${e.name}" style="width:100%;height:120px;object-fit:cover;border-radius:10px;margin-bottom:0.75rem;">` : ''}
                        <div style="font-size:0.8rem;font-weight:700;color:#7c3aed;text-transform:uppercase;margin-bottom:0.35rem;">🎉 Tapahtuma${dateStr ? ' · ' + dateStr : ''}</div>
                        <h3 style="margin:0 0 0.4rem 0;font-family:Outfit,sans-serif;font-size:1.1rem;color:var(--text-main);">${e.name}</h3>
                        ${venue ? `<div style="font-size:0.85rem;color:var(--text-muted);margin-bottom:0.4rem;">📍 ${venue}</div>` : ''}
                        <p style="margin:0;font-size:0.9rem;color:var(--text-muted);">${desc}${desc.length >= 110 ? '...' : ''}</p>
                        ${ticketUrl ? `<div style="margin-top:0.75rem;"><span style="display:inline-block;padding:0.3rem 0.8rem;background:#7c3aed;color:white;border-radius:50px;font-size:0.8rem;font-weight:700;">Liput &rarr;</span></div>` : ''}
                    </a>
                `;
            }).join('');
        }
        
        // Näytä sisältö
        document.getElementById('loading-spinner').style.display = 'none';
        document.getElementById('theme-content').style.display = 'block';

        // Piilota paikat/tapahtumat-osio jos tyhjä
        const placesSection = document.getElementById('places-section');
        if (placesSection && matchedPlaceNodes.length === 0) {
            placesSection.style.display = 'none';
        }
        const eventsSection = document.getElementById('events-section');
        if (eventsSection && matchedEvents.length === 0) {
            eventsSection.style.display = 'none';
        }
        
    } catch (e) {
        console.error("Virhe ladattaessa teemadataa:", e);
        document.getElementById('loading-spinner').style.display = 'none';
        document.getElementById('error-message').style.display = 'flex';
    }
});
