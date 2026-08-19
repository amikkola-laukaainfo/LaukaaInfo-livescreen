// teema.js
// Kokoaa yhteen paikat, yritykset ja tapahtumat tietyn tägin (teeman) perusteella
// Käyttää theme_taxonomy.json-hierarkiaa synonyymien laajentamiseen

// ── AI Supabase (entity_tags-hakuja varten) ──────────────────────────────────
const AI_SB_URL = 'https://duxluwyqxvbmkkjzuzkz.supabase.co';
const AI_SB_KEY = 'sb_publishable_HgfWyipuSO7gvsVUR1smNQ_aXox2OPu';
let aiSbClient = null;
if (typeof supabase !== 'undefined') {
    window.aiSb = window.aiSb || supabase.createClient(AI_SB_URL, AI_SB_KEY);
    aiSbClient = window.aiSb;
}

// ── Mixonet Supabase (projektien hakua varten) ────────────────────────────────
const MIXONET_SB_URL = 'https://btwerbixrydfalqrpnmg.supabase.co';
const MIXONET_SB_KEY = 'sb_publishable_8kDfiOTrAwvdb8ziM9XNMQ_CWc-vfat';
let mixonetClient = null;
if (typeof supabase !== 'undefined') {
    window.mixonetSb = window.mixonetSb || supabase.createClient(MIXONET_SB_URL, MIXONET_SB_KEY, {
        auth: {
            persistSession: false,
            storageKey: 'mixonet-public-anon-key'
        }
    });
    mixonetClient = window.mixonetSb;
}

// ── Lataa Mixonet-teeman konteksti ja nostot ───────────────────────────────
async function loadMixonetThemeContext(searchTag) {
    if (!mixonetClient) return;
    try {
        const tagLower = searchTag.toLowerCase();
        
        // 1. Hae teema Mixonetista (slug tai title täsmää)
        const { data: themes, error: themeErr } = await mixonetClient
            .from('opportunities')
            .select('*')
            .eq('type', 'THEME')
            .eq('status', 'published');

        if (!themeErr && themes && themes.length > 0) {
            // Etsi sopiva teema
            const theme = themes.find(t => 
                t.id === searchTag ||
                (t.slug && t.slug.toLowerCase() === tagLower) || 
                (t.title && t.title.toLowerCase() === tagLower) ||
                (t.tags && t.tags.toLowerCase().includes(tagLower))
            );

            if (theme) {
                // Päivitä sivun pääotsikko teeman nimellä (korvaa UUID:n)
                const titleEl = document.getElementById('theme-name');
                if (titleEl && theme.title) {
                    titleEl.textContent = theme.title;
                }

                // Päivitä teeman ingressi jos se on määritelty
                if (theme.description) {
                    const descEl = document.getElementById('theme-description');
                    if (descEl) {
                        descEl.textContent = theme.description;
                        descEl.style.display = 'block';
                    } else {
                        // Luo ingressi-elementti otsikon alle
                        const hero = document.querySelector('.hero-content');
                        if (hero) {
                            const p = document.createElement('p');
                            p.id = 'theme-description';
                            p.style.fontSize = '1.1rem';
                            p.style.color = 'var(--text-muted)';
                            p.style.marginTop = '1rem';
                            p.style.maxWidth = '600px';
                            p.textContent = theme.description;
                            hero.appendChild(p);
                        }
                    }
                }

                // Hae teeman relaatiot
                const { data: relations } = await mixonetClient
                    .from('entity_relations')
                    .select('*')
                    .eq('target_type', 'THEME')
                    .eq('target_id', theme.id);

                if (relations && relations.length > 0) {
                    const oppIds = relations
                        .filter(r => r.source_type === 'OPPORTUNITY' || r.source_type === 'PROJECT' || r.source_type === 'IDEA' || r.source_type === 'NEED')
                        .map(r => r.source_id);

                    if (oppIds.length > 0) {
                        // Hae eri tyyppiset asiat erikseen
                        const [projRes, ideaRes, oppRes] = await Promise.all([
                            mixonetClient.from('projects').select('id, title, description, public_settings').in('id', oppIds),
                            mixonetClient.from('ideas').select('id, title, description').in('id', oppIds),
                            mixonetClient.from('opportunities').select('id, title, description, type').in('id', oppIds)
                        ]);
                        
                        let opps = [];
                        let featuredNeedsIds = [];
                        let featuredIdeasIds = [];
                        let featuredCompanyIds = [];

                        if (projRes.data) {
                            projRes.data.forEach(p => {
                                const settings = p.public_settings || {};
                                if (settings.is_published !== false) {
                                    opps.push({ ...p, type: 'PROJECT', is_project_featured: true });
                                    if (settings.featured_need_id) featuredNeedsIds.push(settings.featured_need_id);
                                    if (settings.featured_idea_id) featuredIdeasIds.push(settings.featured_idea_id);
                                    if (settings.featured_company_id) featuredCompanyIds.push(settings.featured_company_id);
                                }
                            });
                        }

                        if (ideaRes.data) opps.push(...ideaRes.data.map(i => ({ ...i, type: 'IDEA' })));
                        if (oppRes.data) opps.push(...oppRes.data.map(o => ({ ...o, type: o.type })));

                        // Hae lisäksi projektin nostamat asiat, jos ne eivät jo ole listalla
                        const missingNeeds = featuredNeedsIds.filter(id => !opps.some(o => o.id === id));
                        const missingIdeas = featuredIdeasIds.filter(id => !opps.some(o => o.id === id));
                        const missingCompanies = featuredCompanyIds.filter(id => !opps.some(o => o.id === id));

                        if (missingNeeds.length > 0) {
                            const { data } = await mixonetClient.from('opportunities').select('id, title, description, type').in('id', missingNeeds);
                            if (data) opps.push(...data.map(o => ({ ...o, type: o.type })));
                        }
                        if (missingIdeas.length > 0) {
                            const { data } = await mixonetClient.from('ideas').select('id, title, description').in('id', missingIdeas);
                            if (data) opps.push(...data.map(i => ({ ...i, type: 'IDEA' })));
                        }
                        if (missingCompanies.length > 0) {
                            // Hae oikeat yritysnimet
                            const { data } = await mixonetClient.from('companies').select('id, external_id, name').or(`id.in.(${missingCompanies.join(',')}),external_id.in.(${missingCompanies.map(c => `"${c}"`).join(',')})`);
                            if (data) {
                                data.forEach(c => {
                                    opps.push({ id: c.id || c.external_id, title: c.name, type: 'COMPANY' });
                                });
                            }
                        }

                        if (opps.length > 0) {
                            const section = document.getElementById('mixonet-projects-section');
                            const list = document.getElementById('mixonet-projects-list');
                            if (section && list) {
                                // Järjestä siten, että nostetut (is_featured) ovat ensimmäisenä
                                const enrichedOpps = opps.map(opp => {
                                    const rel = relations.find(r => r.source_id === opp.id);
                                    let isFeatured = rel?.metadata?.is_featured || opp.is_project_featured || false;
                                    
                                    if (featuredNeedsIds.includes(opp.id) || featuredIdeasIds.includes(opp.id) || featuredCompanyIds.includes(opp.id)) {
                                        isFeatured = true;
                                    }

                                    // Varmista ettei samaa oppia näytetä useasti
                                    return { ...opp, is_featured: isFeatured };
                                }).filter((value, index, self) => index === self.findIndex((t) => t.id === value.id))
                                .sort((a, b) => (b.is_featured ? 1 : 0) - (a.is_featured ? 1 : 0));

                                section.style.display = 'block';
                                
                                // Päivitä otsikko näyttämään "Teeman verkosto"
                                const titleEl = section.querySelector('h2');
                                if (titleEl) {
                                    titleEl.innerHTML = `<span class="iconify" style="color: #6366f1;" data-icon="material-symbols:rocket-launch-outline"></span> Teeman verkosto`;
                                }
                                
                                const descSection = section.querySelector('p');
                                if (descSection) descSection.textContent = 'Mixonet-verkostossa tähän teemaan liittyviä hankkeita, ideoita ja tarpeita.';

                                list.innerHTML = enrichedOpps.map(p => {
                                    const desc = (p.description || '').substring(0, 120);
                                    let icon = '🚀';
                                    let typeLabel = 'Projekti';
                                    let color = '#6366f1';
                                    
                                    if (p.type === 'IDEA') { icon = '💡'; typeLabel = 'Idea'; color = '#f59e0b'; }
                                    if (p.type === 'NEED') { icon = '📣'; typeLabel = 'Tarve'; color = '#ef4444'; }
                                    if (p.type === 'COMPANY') { icon = '🏢'; typeLabel = 'Yritys'; color = '#10b981'; }

                                    const url = p.type === 'PROJECT' ? 'projekti.html' : p.type === 'COMPANY' ? 'yrityskortti.html' : 'mixonet.html';

                                    return `
                                        <a href="${url}?id=${encodeURIComponent(p.id)}" class="list-item-card" style="border-left: 4px solid ${color}; ${p.is_featured ? 'background: #f8fafc; border-color: #f59e0b;' : ''}">
                                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.35rem;">
                                                <div style="font-size:0.8rem;font-weight:700;color:${color};text-transform:uppercase;letter-spacing:0.5px;">
                                                    ${icon} ${typeLabel}
                                                </div>
                                                ${p.is_featured ? `<span style="font-size:0.7rem; background:#fef3c7; color:#d97706; padding:0.15rem 0.5rem; border-radius:1rem; font-weight:bold;">⭐ Nosto</span>` : ''}
                                            </div>
                                            <h3 style="margin:0 0 0.4rem 0;font-family:Outfit,sans-serif;font-size:1.1rem;color:var(--text-main);">${p.title}</h3>
                                            ${desc ? `<p style="margin:0;font-size:0.9rem;color:var(--text-muted);">${desc}${desc.length >= 120 ? '...' : ''}</p>` : ''}
                                            <div style="margin-top:0.75rem;">
                                                <span style="display:inline-block;padding:0.3rem 0.8rem;background:${color};color:white;border-radius:50px;font-size:0.8rem;font-weight:700;">Tutustu →</span>
                                            </div>
                                        </a>
                                    `;
                                }).join('');
                            }
                        }
                    }
                }
                return; // Jos teema löytyi, emme tee fallback-hakua
            }
        }
    } catch (e) {
        console.warn('Mixonet-teeman haku epäonnistui:', e);
    }
    
    // Fallback: vanha logiikka, jos teemaa ei löytynyt
    try {
        // Haetaan projektit projects-taulusta
        const { data: projects, error } = await mixonetClient
            .from('projects')
            .select('id, title, description, status, created_at');

        if (error || !projects || projects.length === 0) return;

        const tagLower = searchTag.toLowerCase();
        const matched = projects.filter(p => {
            const desc = (p.description || '').toLowerCase();
            const title = (p.title || '').toLowerCase();
            return desc.includes(tagLower) || title.includes(tagLower);
        });

        if (matched.length === 0) return;

        const section = document.getElementById('mixonet-projects-section');
        const list = document.getElementById('mixonet-projects-list');
        if (!section || !list) return;

        section.style.display = 'block';
        list.innerHTML = matched.map(p => {
            const desc = (p.description || '').substring(0, 120);
            return `
                <a href="projekti.html?id=${encodeURIComponent(p.id)}" class="list-item-card" style="border-left: 3px solid #6366f1;">
                    <div style="font-size:0.8rem;font-weight:700;color:#6366f1;text-transform:uppercase;margin-bottom:0.35rem;letter-spacing:0.5px;">
                        🚀 Mixonet-projekti
                    </div>
                    <h3 style="margin:0 0 0.4rem 0;font-family:Outfit,sans-serif;font-size:1.1rem;color:var(--text-main);">${p.title}</h3>
                    ${desc ? `<p style="margin:0;font-size:0.9rem;color:var(--text-muted);">${desc}${desc.length >= 120 ? '...' : ''}</p>` : ''}
                    <div style="margin-top:0.75rem;">
                        <span style="display:inline-block;padding:0.3rem 0.8rem;background:#6366f1;color:white;border-radius:50px;font-size:0.8rem;font-weight:700;">Tutustu →</span>
                    </div>
                </a>
            `;
        }).join('');
    } catch (e) {
        console.warn('Mixonet-projektien fallback-haku epäonnistui:', e);
    }
}

// ── Apufunktio: Kerää kaikki teemaan liittyvät hakutermit taksonomiasta ──────
async function fetchRepresentativeImages(places, aiSbClient) {
    if (!places || places.length === 0 || !aiSbClient) return {};
    const placeIds = places.map(p => p.id || p.place_id).filter(id => id);
    if (placeIds.length === 0) return {};
    try {
        const { data: imagesData } = await aiSbClient
            .from('place_images')
            .select('place_id, storage_path, alt_text, caption')
            .in('place_id', placeIds)
            .order('sort_order', { ascending: true })
            .order('created_at', { ascending: false });
        
        const map = {};
        if (imagesData) {
            imagesData.forEach(img => {
                if (!map[img.place_id]) {
                    map[img.place_id] = img;
                }
            });
        }
        return map;
    } catch(e) {
        console.warn('Virhe kuvien haussa:', e);
        return {};
    }
}

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

    // PhotoSwipe init
    let themeLightbox = null;
    if (window.PhotoSwipeLightbox) {
        themeLightbox = new window.PhotoSwipeLightbox({
            pswpModule: window.PhotoSwipe,
            padding: { top: 20, bottom: 20, left: 20, right: 20 }
        });
        themeLightbox.on('contentLoad', (e) => {
            const { content } = e;
            if (content.type === 'image') {
                content.image.onload = () => {
                    content.width = content.image.naturalWidth;
                    content.height = content.image.naturalHeight;
                    content.updatePosition();
                };
            }
        });
        themeLightbox.init();
    }
    
    // Yhteinen click handler (Event Delegation) kuvagallerialle
    document.addEventListener('click', (e) => {
        const target = e.target.closest('.pswp-trigger');
        if (target && themeLightbox) {
            e.preventDefault();
            e.stopPropagation(); // estä linkin avautuminen
            const src = target.getAttribute('data-src');
            const caption = target.getAttribute('data-caption') || '';
            const items = [{
                src: src,
                w: 1600,
                h: 1600,
                alt: caption
            }];
            themeLightbox.loadAndOpen(0, items);
        }
    });

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
        let sbPlaces = []; // Alustetaan ennen käyttöä, korjaa ReferenceError entity_tags-haussa
        
        if (placesRes.ok) {
            const pData = await placesRes.json();
            allPlaces = Array.isArray(pData) ? pData : (pData.results || []);
        }
        if (companiesRes.ok) {
            const cData = await companiesRes.json();
            allCompanies = Array.isArray(cData) ? cData : (cData.results || []);
        }
        
        // JOS place_id ON ANNETTU, KÄYTETÄÄN KONTEKSTUAALISTA HAKUA
        const placeIdParam = urlParams.get('place_id');
        if (placeIdParam && aiSbClient) {
            console.log("Kontekstuaalinen teemahaku: place_id=", placeIdParam);
            try {
                // 1. Hae paikan tiedot (nimeä ja tageja varten)
                const { data: placeData } = await aiSbClient
                    .from('places')
                    .select('name, canonical_name, description')
                    .eq('place_id', placeIdParam)
                    .single();
                    
                let placeName = '';
                if (placeData) {
                    placeName = placeData.name || placeData.canonical_name || '';
                    document.getElementById('theme-name').textContent = `${tagParam.charAt(0).toUpperCase() + tagParam.slice(1)} – ${placeName} lähialueella`;
                    
                    // Päivitä hero-subtitle paikan kuvauksella jos saatavilla
                    const subtitleEl = document.getElementById('theme-subtitle');
                    if (subtitleEl && placeData.description) {
                        subtitleEl.textContent = placeData.description.substring(0, 160) + (placeData.description.length > 160 ? '...' : '');
                        subtitleEl.style.display = 'block';
                    }
                }

                // 2. Hae paikan omat tagit aktiviteettilistaa varten
                const { data: placeTagData } = await aiSbClient
                    .from('entity_tags')
                    .select('tag_id')
                    .eq('entity_id', placeIdParam)
                    .eq('entity_type', 'place');

                if (placeTagData && placeTagData.length > 0) {
                    const activitiesSection = document.getElementById('place-activities-section');
                    const activitiesList = document.getElementById('place-activities-list');
                    const activitiesTitle = document.getElementById('place-activities-title');
                    
                    if (activitiesSection && activitiesList) {
                        // Sesonki: kesä (5-8) tai talvi (11-3)
                        const month = new Date().getMonth(); // 0-indexed
                        const isSummer = month >= 4 && month <= 7;
                        const isWinter = month >= 10 || month <= 2;
                        const seasonLabel = isSummer ? '☀️ Kesällä täällä voit:' : (isWinter ? '❄️ Talvella täällä voit:' : '🍂 Täällä voit:');
                        if (activitiesTitle) activitiesTitle.textContent = seasonLabel;
                        
                        // Muunna tag_id:t luettaviksi teksteiksi taksonomian avulla
                        const tagLabels = {};
                        if (taxonomy && taxonomy.main_groups) {
                            const scanForLabels = (items) => {
                                if (!items) return;
                                for (const item of items) {
                                    if (item.id) tagLabels[item.id.toLowerCase()] = item.label || item.id;
                                    if (item.tags) scanForLabels(item.tags);
                                    if (item.groups) scanForLabels(item.groups);
                                }
                            };
                            taxonomy.main_groups.forEach(m => {
                                if (m.id) tagLabels[m.id.toLowerCase()] = m.label || m.id;
                                scanForLabels(m.groups);
                            });
                            [...(taxonomy.features || []), ...(taxonomy.seasons || [])].forEach(f => {
                                if (f.id) tagLabels[f.id.toLowerCase()] = f.label || f.id;
                            });
                        }
                        
                        const pillColors = ['#0ea5e9','#22c55e','#f59e0b','#8b5cf6','#ef4444','#06b6d4','#ec4899'];
                        activitiesList.innerHTML = placeTagData.map((t, i) => {
                            const label = tagLabels[t.tag_id.toLowerCase()] || t.tag_id;
                            const color = pillColors[i % pillColors.length];
                            const tagUrl = `teema.html?tag=${encodeURIComponent(t.tag_id)}&place_id=${encodeURIComponent(placeIdParam)}`;
                            return `<a href="${tagUrl}" style="display:inline-flex;align-items:center;gap:0.4rem;padding:0.5rem 1rem;background:${color}18;color:${color};border:1.5px solid ${color}40;border-radius:50px;font-size:0.9rem;font-weight:600;text-decoration:none;transition:all 0.2s;" onmouseover="this.style.background='${color}30'" onmouseout="this.style.background='${color}18'">${label}</a>`;
                        }).join('');
                        
                        activitiesSection.style.display = 'block';
                    }
                }

                // 3. Etsitään oikea tag_id
                const tagLower = searchTag.toLowerCase();
                const { data: matchingTags } = await aiSbClient.from('tags').select('tag_id').or(`tag_id.eq.${tagLower},name.ilike.${tagLower}`).limit(1);
                let actualTagId = tagLower;
                if (matchingTags && matchingTags.length > 0) {
                    actualTagId = matchingTags[0].tag_id;
                }

                // 4. Kutsu RPC lähipaikkojen ja -yritysten hakuun
                const { data: contextResults, error: rpcError } = await aiSbClient.rpc('get_contextual_theme_results', {
                    p_place_id: placeIdParam,
                    p_tag_id: actualTagId,
                    p_radius_km: 10
                });

                if (rpcError) throw rpcError;

                let matchedPlaceNodes = [];
                let matchedCompanies = [];

                if (contextResults) {
                    contextResults.forEach(res => {
                        if (res.entity_type === 'PLACE') {
                            const pDataJson = allPlaces.find(p => p.id === res.entity_id || p.place_id === res.entity_id);
                            if (pDataJson) {
                                pDataJson.match_reason = res.match_reason;
                                matchedPlaceNodes.push(pDataJson);
                            } else {
                                matchedPlaceNodes.push({
                                    id: res.entity_id,
                                    name: res.entity_name,
                                    type: 'PLACE',
                                    description: '',
                                    match_reason: res.match_reason
                                });
                            }
                        } else if (res.entity_type === 'COMPANY') {
                            const cDataJson = allCompanies.find(c => String(c.id) === String(res.entity_id) || `company-${c.id}` === String(res.entity_id));
                            if (cDataJson) {
                                cDataJson.match_reason = res.match_reason;
                                matchedCompanies.push(cDataJson);
                            } else {
                                matchedCompanies.push({
                                    id: res.entity_id,
                                    nimi: res.entity_name,
                                    match_reason: res.match_reason
                                });
                            }
                        }
                    });
                }

                // 5. Renderöi Paikat
                const placesContainer = document.getElementById('places-list');
                const placesSection = document.getElementById('places-section');
                if (matchedPlaceNodes.length === 0) {
                    if (placesSection) placesSection.style.display = 'none';
                } else {
                    const imgMap = await fetchRepresentativeImages(matchedPlaceNodes, aiSbClient);
                    const storageBaseUrl = 'https://duxluwyqxvbmkkjzuzkz.supabase.co/storage/v1/object/public/';

                    placesContainer.innerHTML = matchedPlaceNodes.map(p => {
                        const url = `tietoa-paikasta.html?id=${encodeURIComponent(p.id)}`;
                        const typeTranslations = { 'LANDMARK': 'Nähtävyys', 'NATURE': 'Luontokohde', 'SERVICE': 'Palvelu', 'BUILDING': 'Rakennus', 'AREA': 'Alue', 'ROUTE': 'Reitti' };
                        const typeName = typeTranslations[p.type] || p.type || 'Paikka';
                        const desc = p.description ? p.description.substring(0, 100) + '...' : '';
                        const reasonBadge = p.match_reason ? `<span style="font-size: 0.75rem; background: #e0f2fe; color: #0369a1; padding: 2px 6px; border-radius: 4px; margin-left: 8px;">${p.match_reason}</span>` : '';
                        
                        let imgHtml = '';
                        const imgObj = imgMap[p.id || p.place_id];
                        if (imgObj) {
                            const imgUrl = imgObj.storage_path.startsWith('http') ? imgObj.storage_path : (storageBaseUrl + imgObj.storage_path);
                            const caption = imgObj.alt_text || p.name;
                            imgHtml = `
                                <div class="pswp-trigger" data-src="${imgUrl}" data-caption="${caption}" style="aspect-ratio: 16/9; margin-bottom: 1rem; border-radius: 8px; overflow: hidden; position: relative; cursor: pointer;">
                                    <img src="${imgUrl}" alt="${caption}" style="width: 100%; height: 100%; object-fit: cover;">
                                    <div style="position: absolute; bottom: 8px; right: 8px; background: rgba(0,0,0,0.6); color: white; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; display: flex; align-items: center; gap: 4px;">
                                        <span class="iconify" data-icon="material-symbols:zoom-in"></span> Suurenna
                                    </div>
                                </div>
                            `;
                        }

                        return `
                            <a href="${url}" class="list-item-card">
                                ${imgHtml}
                                <div style="font-size: 0.8rem; font-weight: 700; color: var(--accent); text-transform: uppercase; margin-bottom: 0.5rem; display: flex; align-items: center;">📍 ${typeName} ${reasonBadge}</div>
                                <h3 style="margin: 0 0 0.5rem 0; font-family: Outfit, sans-serif; font-size: 1.25rem; color: var(--text-main);">${p.name}</h3>
                                <p style="margin: 0; font-size: 0.95rem; color: var(--text-muted);">${desc}</p>
                            </a>
                        `;
                    }).join('');
                }

                // 6. Renderöi Yritykset
                const companiesContainer = document.getElementById('companies-list');
                if (matchedCompanies.length === 0) {
                    companiesContainer.innerHTML = '<p style="color: var(--text-muted);">Ei yrityksiä tällä teemalla lähialueella.</p>';
                } else {
                    matchedCompanies.sort((a,b) => (b.subscription_tier || 1) - (a.subscription_tier || 1));
                    companiesContainer.innerHTML = matchedCompanies.map(c => {
                        const url = `yrityskortti.html?id=${encodeURIComponent(c.id)}`;
                        const reasonBadge = c.match_reason ? `<span style="font-size: 0.75rem; background: #e0f2fe; color: #0369a1; padding: 2px 6px; border-radius: 4px; display: inline-block; margin-top: 4px;">${c.match_reason}</span>` : '';
                        const tier = c.subscription_tier || 1;
                        const displayIcon = tier >= 3 ? '⭐' : (tier === 2 ? '💎' : '');
                        return `
                            <a href="${url}" class="list-item-card">
                                <div class="card-header-grid">
                                    <div>
                                        <h3 style="margin: 0 0 0.25rem 0; font-size: 1.1rem; color: var(--text-main);">${c.nimi} ${displayIcon}</h3>
                                        <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.25rem;">${c.kategoria || ''}</div>
                                        ${reasonBadge}
                                    </div>
                                </div>
                            </a>
                        `;
                    }).join('');
                }

                // 7. Hae feed-julkaisut ja kohtaamiset place_id:n perusteella
                const laukaaDb = window.LaukaaSupabase || supabaseClient;
                if (laukaaDb) {
                    const localFeedItems = [];
                    
                    try {
                        // Tarjoukset place_id:n mukaan
                        const { data: placeOffers } = await laukaaDb
                            .from('offers')
                            .select('id, title, description, photo_url, created_at, place_id')
                            .eq('place_id', placeIdParam)
                            .order('created_at', { ascending: false })
                            .limit(5);
                        
                        if (placeOffers) {
                            placeOffers.forEach(offer => {
                                localFeedItems.push({
                                    id: offer.id,
                                    type: 'offer',
                                    label: '🏷️ Tarjous',
                                    color: '#f59e0b',
                                    title: offer.title || offer.description || '',
                                    description: offer.description || '',
                                    photo_url: offer.photo_url,
                                    created_at: offer.created_at,
                                    linkUrl: `kohdekortti.html?offer=${offer.id}`
                                });
                            });
                        }
                    } catch(e) { console.warn('Tarjoushaku epäonnistui:', e); }

                    try {
                        // Kohtaamiset place_id:n mukaan
                        const { data: placeEncounters } = await laukaaDb
                            .from('encounters')
                            .select('id, description, category, type, photo_url, created_at, location_name')
                            .eq('place_id', placeIdParam)
                            .order('created_at', { ascending: false })
                            .limit(5);
                        
                        if (placeEncounters) {
                            const communityStyles = {
                                'MEMORY': { color: '#7c3aed', label: '📖 Muisto' },
                                'TIP': { color: '#059669', label: '💡 Vinkki' },
                                'PHOTO': { color: '#2563eb', label: '📷 Kuva' },
                                'OBSERVATION': { color: '#ea580c', label: '📍 Havainto' },
                                'QUESTION': { color: '#db2777', label: '❓ Kysymys' }
                            };
                            placeEncounters.forEach(enc => {
                                const style = communityStyles[(enc.type || '').toUpperCase()] || { color: '#10b981', label: '💬 ' + (enc.category || 'Kohtaaminen') };
                                localFeedItems.push({
                                    id: enc.id,
                                    type: 'encounter',
                                    label: style.label,
                                    color: style.color,
                                    title: enc.description || '',
                                    description: enc.location_name || '',
                                    photo_url: enc.photo_url,
                                    created_at: enc.created_at,
                                    linkUrl: `ilmoituskortti.html?id=${enc.id}`
                                });
                            });
                        }
                    } catch(e) { console.warn('Kohtaamiset place_id-haku epäonnistui:', e); }

                    // Renderöi paikallinen feed
                    const localFeedSection = document.getElementById('local-feed-section');
                    const localFeedList = document.getElementById('local-feed-list');
                    if (localFeedItems.length > 0 && localFeedSection && localFeedList) {
                        localFeedItems.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
                        const localFeedTitle = document.getElementById('local-feed-title');
                        if (localFeedTitle && placeName) localFeedTitle.textContent = `Vinkit ja julkaisut – ${placeName}`;
                        
                        localFeedList.innerHTML = localFeedItems.map(item => {
                            const dateStr = item.created_at ? new Date(item.created_at).toLocaleDateString('fi-FI', { day:'numeric', month:'short' }) : '';
                            const desc = item.title ? item.title.substring(0, 100) + (item.title.length > 100 ? '...' : '') : '';
                            return `
                                <a href="${item.linkUrl}" class="card event-card" style="border-left: 4px solid ${item.color}; text-decoration: none; display: block;">
                                    <div class="card-content">
                                        <span class="badge" style="background: ${item.color};">${item.label}</span>
                                        <h3 class="card-title" style="margin: 0.5rem 0 0.25rem;">${desc}</h3>
                                        ${item.description ? `<div class="card-meta" style="font-size:0.8rem;color:var(--text-muted);">📍 ${item.description}</div>` : ''}
                                        ${dateStr ? `<div class="card-meta" style="font-size:0.75rem;color:var(--text-muted);margin-top:0.25rem;">${dateStr}</div>` : ''}
                                    </div>
                                </a>
                            `;
                        }).join('');
                        localFeedSection.style.display = 'block';
                    }
                }

                // 8. Tapahtumat – suodatetaan paikan ympäristöstä (ei piiloteta enää)
                // Tapahtumat renderöidään normaalin hakulogiikan kautta alla
                // Piilota vanha tagipohjainen encounters-section (se on place-feed:ssä nyt)
                const encountersSection = document.getElementById('encounters-section');
                if (encountersSection) encountersSection.style.display = 'none';

                document.getElementById('loading-spinner').style.display = 'none';
                document.getElementById('theme-content').style.display = 'block';

                // Ei palata – jatketaan tapahtumien renderöintiin alla
            } catch (err) {
                console.error("Virhe kontekstuaalisessa haussa, jatketaan normaalilla:", err);
            }
        }


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

                            // sbPlaces on alustettu rivillä 142 – ei ReferenceError
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
                        
                        if (encounterIds.length > 0 && (window.LaukaaSupabase || supabaseClient)) {
                            const laukaaDb = window.LaukaaSupabase || supabaseClient;
                            try {
                                const { data: encounterData, error } = await laukaaDb
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
                                const laukaaDb2 = window.LaukaaSupabase || supabaseClient;
                                const { data: feedData, error: feedError } = await laukaaDb2
                                    .from('posts')
                                    .select('*')
                                    .in('id', feedPostIds)
                                    .or('status.eq.APPROVED,status.is.null')
                                    .or(`valid_until.is.null,valid_until.gte.${new Date().toISOString()}`)
                                    .order('created_at', { ascending: false });
                                if (!feedError && feedData) {
                                    feedData.forEach(post => {
                                        // Määritetään tyyppi: yhteisöjulkaisut vs. yrityksen feedjulkaisut
                                        const COMMUNITY_TYPES = ['MEMORY', 'TIP', 'PHOTO', 'OBSERVATION', 'QUESTION'];
                                        const postTypeUpper = (post.type || '').toUpperCase();
                                        const isCommunity = COMMUNITY_TYPES.includes(postTypeUpper);
                                        sbAjankohtainen.push({
                                            id: post.id,
                                            type: isCommunity ? postTypeUpper : 'feed_post',
                                            category: isCommunity ? (post.type || 'Julkaisu') : 'Feed-julkaisu',
                                            description: post.description || post.title || '',
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
                                const laukaaDb3 = window.LaukaaSupabase || supabaseClient;
                                const { data: offersData, error: offersError } = await laukaaDb3
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
            const imgMap = await fetchRepresentativeImages(matchedPlaceNodes, aiSbClient);
            const storageBaseUrl = 'https://duxluwyqxvbmkkjzuzkz.supabase.co/storage/v1/object/public/';

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
                
                let imgHtml = '';
                const imgObj = imgMap[p.id || p.place_id];
                if (imgObj) {
                    const imgUrl = imgObj.storage_path.startsWith('http') ? imgObj.storage_path : (storageBaseUrl + imgObj.storage_path);
                    const caption = imgObj.alt_text || p.name;
                    imgHtml = `
                        <div class="pswp-trigger" data-src="${imgUrl}" data-caption="${caption}" style="aspect-ratio: 16/9; margin-bottom: 1rem; border-radius: 8px; overflow: hidden; position: relative; cursor: pointer;">
                            <img src="${imgUrl}" alt="${caption}" style="width: 100%; height: 100%; object-fit: cover;">
                            <div style="position: absolute; bottom: 8px; right: 8px; background: rgba(0,0,0,0.6); color: white; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; display: flex; align-items: center; gap: 4px;">
                                <span class="iconify" data-icon="material-symbols:zoom-in"></span> Suurenna
                            </div>
                        </div>
                    `;
                }

                return `
                    <a href="${url}" class="list-item-card">
                        ${imgHtml}
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
            matchedCompanies.sort((a,b) => {
                const aTier = a.subscription_tier || 1;
                const bTier = b.subscription_tier || 1;
                return bTier - aTier;
            });

            const generateCompanyHtml = (c) => {
                const url = `yrityskortti.html?id=${encodeURIComponent(c.id)}`;
                const rawTags = (c.tags || '').split(',').map(t => t.trim()).filter(t => t.length > 0 && t !== '-');
                const tagHtml = rawTags.slice(0, 3).map(t => `<span class="tag-pill">${t}</span>`).join('');
                
                const tier = c.subscription_tier || 1;
                const displayIcon = tier >= 3 ? '⭐' : (tier === 2 ? '💎' : '');
                
                return `
                    <a href="${url}" class="list-item-card">
                        <div class="card-header-grid">
                            <div>
                                <h3 style="margin: 0 0 0.25rem 0; font-size: 1.1rem; color: var(--text-main);">${c.nimi} ${displayIcon}</h3>
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
            
            html += `
                <div style="background: #f8fafc; border: 1px dashed #cbd5e1; padding: 1.5rem; border-radius: 12px; margin-top: 1rem; text-align: center;">
                    <h4 style="margin: 0 0 0.5rem 0; color: #475569; font-size: 1.05rem;">Haluatko yrityksesi nousevan paremmin esiin?</h4>
                    <p style="margin: 0 0 1rem 0; font-size: 0.9rem; color: #64748b;">Päivitä yritysprofiiliin ja nouse listan kärkeen logolla ja kuvauksella varustettuna.</p>
                    <a href="kauppa.html" style="display: inline-block; padding: 0.5rem 1.25rem; background: #fff; border: 1px solid #cbd5e1; color: #0f172a; text-decoration: none; border-radius: 50px; font-size: 0.9rem; font-weight: 600;">Lue lisää profiileista</a>
                </div>
            `;
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
                    
                    // Valitaan linkki tyypin mukaan
                    let linkUrl = null;
                    let badgeColor = '#10b981';
                    let badgeLabel = enc.category || 'Julkaisu';
                    // Yhteisöjulkaisutyypit – visuaaliset tyylit
                    const communityStyles = {
                        'MEMORY':      { color: '#7c3aed', label: '📖 Muisto' },
                        'TIP':         { color: '#059669', label: '💡 Vinkki' },
                        'PHOTO':       { color: '#2563eb', label: '📷 Kuva' },
                        'OBSERVATION': { color: '#ea580c', label: '📍 Havainto' },
                        'QUESTION':    { color: '#db2777', label: '❓ Kysymys' }
                    };
                    if (communityStyles[enc.type]) {
                        badgeColor = communityStyles[enc.type].color;
                        badgeLabel = communityStyles[enc.type].label;
                    } else if (enc.type === 'feed_post') {
                        linkUrl = `index.html?item=${enc.id}&feed=open`;
                        badgeColor = '#3b82f6';
                        badgeLabel = 'Feed-julkaisu';
                    } else if (enc.type === 'offer') {
                        linkUrl = `kohdekortti.html?offer=${enc.id}`;
                        badgeColor = '#f59e0b';
                        badgeLabel = 'Tarjous';
                    } else if (enc.type === 'encounter') {
                        linkUrl = `ilmoituskortti.html?id=${enc.id}`;
                    }
                    
                    const cardInner = `
                        <div class="card-content">
                            <span class="badge" style="background: ${badgeColor};">${badgeLabel}</span>
                            <h3 class="card-title">${enc.description ? enc.description.substring(0, 80) + (enc.description.length > 80 ? '...' : '') : ''}</h3>
                            <div class="card-meta">
                                ${enc.location_name ? `<span class="meta-item"><span class="iconify" data-icon="material-symbols:location-on-outline"></span> ${enc.location_name}</span>` : ''}
                                ${dateStr ? `<span class="meta-item"><span class="iconify" data-icon="material-symbols:calendar-month-outline"></span> ${dateStr}</span>` : ''}
                            </div>
                        </div>
                    `;
                    
                    if (linkUrl) {
                        return `<a href="${linkUrl}" class="card event-card" style="border-left: 4px solid ${badgeColor}; text-decoration: none; display: block; transition: box-shadow 0.2s;" onmouseover="this.style.boxShadow='0 4px 16px rgba(0,0,0,0.12)'" onmouseout="this.style.boxShadow=''">${cardInner}</a>`;
                    } else {
                        return `<div class="card event-card" style="border-left: 4px solid ${badgeColor};">${cardInner}</div>`;
                    }
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

        // Lataa Mixonet-teeman tiedot ja verkosto rinnakkain (ei estä muuta renderöintiä)
        loadMixonetThemeContext(searchTag);

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
