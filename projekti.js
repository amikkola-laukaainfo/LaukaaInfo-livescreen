// projekti.js
// Hakee projektin tiedot Mixonetin tietokannasta ja näyttää ne LaukaaInfon tyylillä.

const MIXONET_SB_URL = 'https://btwerbixrydfalqrpnmg.supabase.co';
const MIXONET_SB_KEY = 'sb_publishable_8kDfiOTrAwvdb8ziM9XNMQ_CWc-vfat'; // Mixonet public anon key

let mixonetClient = null;

async function init() {
    const params = new URLSearchParams(window.location.search);
    const projectId = params.get('id');
    if (!projectId) {
        showError('Projektia ei löytynyt.');
        return;
    }

    if (typeof supabase !== 'undefined') {
        mixonetClient = supabase.createClient(MIXONET_SB_URL, MIXONET_SB_KEY, {
            auth: {
                persistSession: false,
                storageKey: 'mixonet-public-anon-key'
            }
        });
        await loadProject(projectId);
    } else {
        showError('Virhe ladattaessa tietokantayhteyttä.');
    }
}

function showError(msg) {
    document.getElementById('loading-spinner').style.display = 'none';
    document.getElementById('error-message').style.display = 'flex';
    document.querySelector('#error-message h2').textContent = msg;
}

async function loadProject(projectId) {
    try {
        // Hae projekti
        // Hae projekti oikeasta taulusta (projects)
        const { data: projectData, error: projError } = await mixonetClient
            .from('projects')
            .select('*')
            .eq('id', projectId)
            .single();

        if (projError || !projectData) {
            console.error(projError);
            showError('Projektia ei löytynyt.');
            return;
        }

        // Tarkista julkisuusasetukset
        const settings = projectData.public_settings || {
            is_published: true, // Oletus true vanhoille jos ei asetettu? Tai ehkä false? Käytetään fallbackeja
            show_description: true,
            show_funding: true,
            show_needs: true,
            show_ideas: true,
            show_participating: true,
            show_suggested: true,
            show_themes: true
        };

        if (projectData.is_published === false || projectData.visibility !== 'PUBLIC') {
            // Salli esikatselu, mutta näytä banneri
            const banner = document.createElement('div');
            banner.style.cssText = 'background: #fef08a; color: #854d0e; padding: 10px; text-align: center; font-weight: bold; position: sticky; top: 0; z-index: 100;';
            banner.innerHTML = '⚠️ Tämä on esikatselu. Projekti ei ole vielä julkinen.';
            document.body.prepend(banner);
        }

        document.getElementById('loading-spinner').style.display = 'none';
        document.getElementById('project-content').style.display = 'block';

        // Päivitä otsikot
        document.title = `${projectData.title} – LaukaaInfo`;
        document.getElementById('project-name').textContent = projectData.title;
        
        const descSection = document.getElementById('desc-section');
        if (settings.show_description !== false) {
            document.getElementById('project-full-desc').textContent = projectData.description || 'Ei kuvausta saatavilla.';
        } else if (descSection) {
            descSection.style.display = 'none';
        }

        // Taustakuva hero-osioon
        if (projectData.cover_image_url) {
            const heroSection = document.querySelector('.hero-section');
            if (heroSection) {
                heroSection.style.backgroundImage = `url('${projectData.cover_image_url}')`;
                heroSection.style.backgroundSize = 'cover';
                heroSection.style.backgroundPosition = 'center';
            }
        }

        // Video-upotus
        if (projectData.video_url) {
            const descSection = document.getElementById('desc-section');
            if (descSection) {
                let embedUrl = projectData.video_url;
                // Muunna YouTube-linkki upotettavaan muotoon
                const ytMatch = projectData.video_url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/);
                const vimeoMatch = projectData.video_url.match(/vimeo\.com\/(\d+)/);
                if (ytMatch) embedUrl = `https://www.youtube.com/embed/${ytMatch[1]}`;
                if (vimeoMatch) embedUrl = `https://player.vimeo.com/video/${vimeoMatch[1]}`;

                const videoEl = document.createElement('div');
                videoEl.style.cssText = 'margin-top:1.5rem; border-radius:12px; overflow:hidden; aspect-ratio:16/9;';
                videoEl.innerHTML = `<iframe src="${embedUrl}" style="width:100%;height:100%;border:none;" allowfullscreen allow="autoplay; encrypted-media"></iframe>`;
                descSection.appendChild(videoEl);
            }
        }

        // Kuvagalleria
        if (projectData.image_urls && projectData.image_urls.length > 0) {
            const descSection = document.getElementById('desc-section');
            if (descSection) {
                const galleryEl = document.createElement('div');
                galleryEl.style.cssText = 'margin-top:1.5rem; display:grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap:0.75rem;';
                galleryEl.innerHTML = projectData.image_urls.map(url => `
                    <a href="${url}" target="_blank" rel="noopener">
                        <img src="${url}" alt="Projektin kuva" loading="lazy"
                            style="width:100%; height:130px; object-fit:cover; border-radius:8px; cursor:zoom-in; transition:transform 0.2s;"
                            onmouseover="this.style.transform='scale(1.03)'" onmouseout="this.style.transform='scale(1)'">
                    </a>
                `).join('');
                descSection.appendChild(galleryEl);
            }
        }
        
        // Deep link painike – avaa Mixonet-sovelluksen tai Google Playn
        const btnMixonet = document.getElementById('btn-mixonet');
        if (btnMixonet) {
            const playStoreUrl = `https://play.google.com/store/apps/details?id=com.mediazoo.mixonet&hl=fi`;
            const deepLinkUrl = `mixonet://project/${projectId}`;
            // Yritetään avata sovellus intent-URLilla (Android), fallback Google Playhin
            btnMixonet.href = playStoreUrl;
            btnMixonet.removeAttribute('target');
            btnMixonet.onclick = function(e) {
                e.preventDefault();
                // Yritetään avata sovellus deeplinkin kautta
                const intentUrl = `intent://project/${projectId}#Intent;scheme=mixonet;package=com.mediazoo.mixonet;S.browser_fallback_url=${encodeURIComponent(playStoreUrl)};end`;
                const isAndroid = /android/i.test(navigator.userAgent);
                if (isAndroid) {
                    window.location.href = intentUrl;
                } else {
                    // iOS / desktop – avataan Google Play uudessa välilehdessä
                    window.open(playStoreUrl, '_blank', 'noopener');
                }
            };
        }


        // Rahoitus-osio
        const fundingSection = document.getElementById('funding-section');
        if (settings.show_funding === false) {
            if (fundingSection) fundingSection.style.display = 'none';
        } else if (fundingSection && projectData.funding_status && projectData.funding_status !== 'NONE') {
            fundingSection.style.display = 'block';
            
            const badgeEl = document.getElementById('funding-status-badge');
            const detailsEl = document.getElementById('funding-details');
            
            // Status-pilleri
            if (projectData.funding_status === 'FUNDED') {
                badgeEl.style.background = '#dcfce7';
                badgeEl.style.color = '#166534';
                badgeEl.innerHTML = '<span class="iconify" data-icon="material-symbols:check-circle"></span> Rahoitus varmistunut';
            } else {
                badgeEl.style.background = '#fef3c7';
                badgeEl.style.color = '#b45309';
                badgeEl.innerHTML = '<span class="iconify" data-icon="material-symbols:hourglass-empty"></span> Rahoitus käynnissä';
            }

            let detailsHtml = '';

            // 1. Rahoittajat / Kumppanit
            if (projectData.funders && projectData.funders.trim() !== '') {
                detailsHtml += `
                    <div>
                        <strong>Rahoitus:</strong><br>
                        <span style="color: var(--text-muted);">${projectData.funders}</span>
                    </div>
                `;
            }

            // 2. Budjetti
            if (projectData.is_budget_public && projectData.budget) {
                detailsHtml += `
                    <div>
                        <strong>Budjetti:</strong><br>
                        <span style="color: var(--text-muted);">${Number(projectData.budget).toLocaleString('fi-FI')} €</span>
                    </div>
                `;
            }

            // 3. Tavoite, Koossa, Puuttuu
            if (projectData.is_funding_goal_public && projectData.funding_goal) {
                const goal = Number(projectData.funding_goal) || 0;
                const secured = Number(projectData.funding_secured) || 0;
                const missing = Math.max(0, goal - secured);

                detailsHtml += `
                    <div style="margin-top: 0.5rem; background: #fff; padding: 1.5rem; border-radius: var(--radius-sm); border: 1px solid #e2e8f0;">
                        <div style="margin-bottom: 0.8rem; font-style: italic; color: var(--text-muted);">
                            Projektille etsitään yhteistyökumppaneita ja muuta rahoitusta.
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem; text-align: center;">
                            <div>
                                <div style="font-size: 0.85rem; text-transform: uppercase; color: var(--text-muted); font-weight: 700;">Tavoite</div>
                                <div style="font-size: 1.2rem; font-weight: 700; color: #1e293b;">${goal.toLocaleString('fi-FI')} €</div>
                            </div>
                            <div>
                                <div style="font-size: 0.85rem; text-transform: uppercase; color: var(--text-muted); font-weight: 700;">Koossa</div>
                                <div style="font-size: 1.2rem; font-weight: 700; color: #10b981;">${secured.toLocaleString('fi-FI')} €</div>
                            </div>
                            <div>
                                <div style="font-size: 0.85rem; text-transform: uppercase; color: var(--text-muted); font-weight: 700;">Puuttuu</div>
                                <div style="font-size: 1.2rem; font-weight: 700; color: #ef4444;">${missing.toLocaleString('fi-FI')} €</div>
                            </div>
                        </div>
                    </div>
                `;
            }

            detailsEl.innerHTML = detailsHtml;
        }

        // Hae projektiin liittyvät asiat entity_relations taulusta (vanha PARTICIPATES_IN, yms)
        const { data: relations, error: relError } = await mixonetClient
            .from('entity_relations')
            .select('*')
            .eq('target_id', projectId);

        // UUSI: Hae project_actors taulusta osallistujat
        const { data: actors } = await mixonetClient
            .from('project_actors')
            .select('*, organization:organizations(*), user_profile:user_profiles(*)')
            .eq('project_id', projectId)
            .eq('status', 'ACTIVE'); // Vain aktiiviset osallistujat

        if (relError) {
            console.error("Virhe relaatioiden haussa", relError);
        } else if ((relations && relations.length > 0) || (actors && actors.length > 0)) {
            // Hae yritysten ja tarpeiden nimet kannasta, jotta ei näytetä pelkkiä UUID:itä
            const companyIds = relations ? relations.filter(r => r.source_type === 'COMPANY').map(r => r.source_id) : [];
            const needIds = relations ? relations.filter(r => r.source_type === 'NEED').map(r => r.source_id) : [];
            
            // Lisää project_actors company_external_id:t listaan, jos ne on COMPANY
            if (actors) {
                actors.forEach(actor => {
                    if (actor.actor_type === 'COMPANY' && actor.company_external_id && !companyIds.includes(actor.company_external_id)) {
                        companyIds.push(actor.company_external_id);
                    }
                });
            }

            let companiesData = [];
            let needsData = [];

            if (companyIds.length > 0) {
                // Erottele oikeat UUID:t ja ulkoiset ID:t (esim. 'company-2'), koska Supabase kaatuu jos UUID-kenttään syöttää tekstiä
                const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                const validUuids = companyIds.filter(id => uuidRegex.test(id));
                const externalIds = companyIds.filter(id => !uuidRegex.test(id));

                const promises = [];
                if (validUuids.length > 0) promises.push(mixonetClient.from('companies').select('id, name').in('id', validUuids));
                if (externalIds.length > 0) promises.push(mixonetClient.from('companies').select('external_id, name').in('external_id', externalIds));

                const results = await Promise.all(promises);
                results.forEach(res => {
                    if (res.data) {
                        // Mappaa external_id takaisin id-kenttään jotta renderöinti löytää sen
                        const mapped = res.data.map(c => ({ id: c.id || c.external_id, name: c.name }));
                        companiesData.push(...mapped);
                    }
                });
            }
            if (needIds.length > 0) {
                const { data } = await mixonetClient.from('opportunities').select('id, title').in('id', needIds);
                if (data) needsData = data;
            }

            renderRelations(relations || [], actors || [], companiesData, needsData, settings);
        } else {
            renderRelations([], [], [], [], settings);
        }

        // Hae liittyvät teemat (PROJECT on source, THEME on target)
        try {
            const themesSection = document.getElementById('themes-section');
            if (settings.show_themes === false) {
                if (themesSection) themesSection.style.display = 'none';
            } else {
                const { data: themeRelations } = await mixonetClient
                    .from('entity_relations')
                    .select('target_id')
                    .eq('source_id', projectId)
                    .eq('target_type', 'THEME');

                const themesList = document.getElementById('themes-list');

            if (themeRelations && themeRelations.length > 0) {
                const themeIds = themeRelations.map(r => r.target_id);
                const { data: themes } = await mixonetClient
                    .from('opportunities')
                    .select('id, title, slug')
                    .in('id', themeIds)
                    .eq('type', 'THEME');

                if (themes && themes.length > 0) {
                    themesList.innerHTML = themes.map(t => {
                        const href = `teema.html?tag=${encodeURIComponent(t.id)}`;
                        return `<a href="${href}" class="tag-pill" style="background:#ede9fe; color:#5b21b6; text-decoration:none; font-size:0.95rem; padding:0.4rem 1rem;">${t.title || t.slug || t.id}</a>`;
                    }).join('');
                } else {
                    if (themesSection) themesSection.style.display = 'none';
                }
            } else {
                if (themesSection) themesSection.style.display = 'none';
            }
            }
        } catch(e) {
            console.warn('Teemojen haku epäonnistui', e);
            const themesSection = document.getElementById('themes-section');
            if (themesSection) themesSection.style.display = 'none';
        }

        // Hae projektin paikka (LOCATED_AT -> PLACE)
        try {
            const placeSection = document.getElementById('project-place-section');
            const placeList = document.getElementById('project-place-list');
            
            if (placeSection && placeList) {
                const { data: placeRelations } = await mixonetClient
                    .from('entity_relations')
                    .select('target_id, metadata')
                    .eq('source_id', projectId)
                    .eq('source_type', 'PROJECT')
                    .eq('target_type', 'PLACE')
                    .in('relation_type', ['LOCATED_AT', 'OPERATES_IN', 'RELATES_TO']);

                if (placeRelations && placeRelations.length > 0) {
                    // Haetaan paikan tiedot AI Supabasesta (jos mahdollista)
                    // Tai käytetään metadata.place_name fallbackina
                    let placesHtml = '';
                    
                    for (const rel of placeRelations) {
                        const placeId = rel.target_id;
                        let placeName = rel.metadata?.place_name || 'Tuntematon paikka';
                        
                        // Yritetään hakea tarkka nimi window.aiSb:ltä, jos se on olemassa (ei välttämättä ole projekti.js:ssä vielä)
                        // Koska projekti.js käyttää vain Mixonet-clienttiä tällä hetkellä, luotetaan metadataan 
                        // TAI lisätään aiSb haku jos se tuodaan tänne.
                        // Yksinkertaisin tapa nyt: käytetään metadataa.
                        // Myöhemmin voidaan hakea paikan tiedot jos tarvitaan.
                        
                        placesHtml += `
                            <a href="tietoa-paikasta.html?id=${encodeURIComponent(placeId)}" class="list-item-card" style="text-decoration: none; display: flex; align-items: center; gap: 0.5rem; border-left: 4px solid #0284c7;">
                                <div style="width: 40px; height: 40px; border-radius: 8px; background: #e0f2fe; color: #0284c7; display: flex; align-items: center; justify-content: center; font-size: 1.2rem;">
                                    <span class="iconify" data-icon="material-symbols:location-on"></span>
                                </div>
                                <div>
                                    <h3 style="margin: 0; font-size: 1rem; color: var(--text-main);">${placeName}</h3>
                                    <div style="font-size: 0.8rem; color: #0284c7;">Siirry paikan sivulle &rarr;</div>
                                </div>
                            </a>
                        `;
                    }
                    
                    placeList.innerHTML = placesHtml;
                    placeSection.style.display = 'block';
                }
            }
        } catch (e) {
            console.warn('Paikan haku epäonnistui', e);
        }

    } catch (e) {
        console.error(e);
        showError('Odottamaton virhe ladattaessa projektia.');
    }
}

async function renderRelations(relations, actors, companiesData = [], needsData = [], settings = {}) {
    const companiesList = document.getElementById('companies-list');
    const companiesSection = document.getElementById('companies-section');
    const suggestedList = document.getElementById('suggested-list');
    const suggestedSection = document.getElementById('suggested-section');
    const needsList = document.getElementById('needs-list');
    const needsSection = document.getElementById('needs-section');
    const ideasList = document.getElementById('ideas-list');
    const ideasSection = document.getElementById('ideas-section');

    let companiesHtml = '';
    let suggestedHtml = '';
    let needsHtml = '';
    
    // Yhdistetään old-school PARTICIPATES_IN (entity_relations) ja uudet project_actors
    // Varmistetaan ettei tule duplikaatteja
    const renderedCompanyIds = new Set();
    
    // --- 1. Käsittele uudet project_actors (etusijalla) ---
    actors.forEach(actor => {
        if (actor.actor_type === 'COMPANY') {
            const externalId = actor.company_external_id;
            if (externalId) {
                renderedCompanyIds.add(externalId);
                const compObj = companiesData.find(c => c.id === externalId);
                const companyName = compObj?.name || 'Yritys';
                const roleHtml = actor.project_role ? `<div style="font-size:0.85rem; color:var(--text-muted);">${actor.project_role}</div>` : '';
                companiesHtml += `
                    <a href="yrityskortti.html?id=${externalId}" class="list-item-card">
                        <div class="card-header-grid">
                            <div>
                                <div style="font-size:0.8rem; text-transform:uppercase; color:#10b981; font-weight:700; margin-bottom:0.2rem;">🏢 Yritys</div>
                                <h3 style="margin:0; font-size:1.05rem">${companyName}</h3>
                                ${roleHtml}
                            </div>
                            <span class="iconify" style="color:#10b981; font-size:1.2rem;" data-icon="material-symbols:open-in-new"></span>
                        </div>
                    </a>
                `;
            }
        } else if (actor.actor_type === 'ORG') {
            const org = actor.organization;
            if (org) {
                const icon = org.org_type === 'MUNICIPALITY' ? '🏛️' : (org.org_type === 'ASSOCIATION' ? '🤝' : '🏢');
                const typeText = org.org_type === 'MUNICIPALITY' ? 'Kunta' : (org.org_type === 'ASSOCIATION' ? 'Yhdistys' : 'Organisaatio');
                const roleHtml = actor.project_role ? `<div style="font-size:0.85rem; color:var(--text-muted);">${actor.project_role}</div>` : '';
                companiesHtml += `
                    <div class="list-item-card">
                        <div style="font-size:0.8rem; text-transform:uppercase; color:#8b5cf6; font-weight:700; margin-bottom:0.2rem;">${icon} ${typeText}</div>
                        <h3 style="margin:0; font-size:1.05rem">${org.name}</h3>
                        ${roleHtml}
                    </div>
                `;
            }
        } else if (actor.actor_type === 'PERSON') {
            const user = actor.user_profile;
            // project_actors RLS pitäisi taata että saamme vain sallitut (show_in_project=true)
            if (user && actor.show_in_project) {
                const parts = (user.name || '').trim().split(" ");
                const shortName = parts.length >= 2 ? parts[0] + " " + parts[parts.length-1].charAt(0) + "." : (user.name || "Käyttäjä");
                const roleHtml = actor.project_role ? `<div style="font-size:0.85rem; color:var(--text-muted);">${actor.project_role}</div>` : '';
                const skillsHtml = user.skills && user.skills.length > 0 
                    ? `<div style="margin-top:0.5rem; font-size:0.85rem; color:var(--text-muted);">${user.skills.slice(0,3).join(' · ')}</div>` : '';
                const locationHtml = user.location ? `<div style="margin-top:0.3rem; font-size:0.8rem; color:var(--text-muted);">📍 ${user.location}</div>` : '';
                
                companiesHtml += `
                    <div class="list-item-card">
                        <div style="font-size:0.8rem; text-transform:uppercase; color:#3b82f6; font-weight:700; margin-bottom:0.2rem;">👤 Yksityinen osallistuja</div>
                        <h3 style="margin:0; font-size:1.05rem">${shortName}</h3>
                        ${roleHtml}
                        ${skillsHtml}
                        ${locationHtml}
                    </div>
                `;
            }
        }
    });

    // --- 2. Käsittele vanhat entity_relations ---
    relations.forEach(rel => {
        if (rel.source_type === 'COMPANY') {
            const compObj = companiesData.find(c => c.id === rel.source_id);
            const companyName = compObj?.name || rel.metadata?.name || 'Yritys';
            const isParticipating = rel.relation_type === 'PARTICIPATES_IN';
            
            if (isParticipating && renderedCompanyIds.has(rel.source_id)) {
                return; // Jo renderöity project_actors kautta
            }
            
            const card = `
                <a href="yrityskortti.html?id=${rel.source_id}" class="list-item-card">
                    <div class="card-header-grid">
                        <h3 style="margin:0; font-size:1.05rem">${companyName}</h3>
                        <span class="iconify" style="color:#10b981; font-size:1.2rem;" data-icon="material-symbols:open-in-new"></span>
                    </div>
                    <div style="margin-top:0.75rem;">
                        <span style="display:inline-block;padding:0.3rem 0.8rem;background:#10b981;color:white;border-radius:50px;font-size:0.8rem;font-weight:700;">Tutustu →</span>
                    </div>
                </a>
            `;
            if (isParticipating) {
                companiesHtml += card;
                renderedCompanyIds.add(rel.source_id);
            } else if (rel.relation_type === 'SUGGESTED_FOR') {
                suggestedHtml += card;
            }
        } else if (rel.source_type === 'NEED') {
            const needObj = needsData.find(n => n.id === rel.source_id);
            const needTitle = needObj?.title || rel.metadata?.title || 'Tarve';
            needsHtml += `
                <div class="list-item-card" style="border-left: 4px solid #f59e0b;">
                    <div style="font-size:0.8rem; text-transform:uppercase; color:#d97706; font-weight:700; margin-bottom:0.2rem;">Etsitään</div>
                    <h3 style="margin:0; font-size:1.1rem; color:#1e293b;">${needTitle}</h3>
                </div>
            `;
        } else if (rel.source_type === 'IDEA') {
            const ideaTitle = rel.metadata?.title || 'Idea';
            ideasHtml += `
                <div class="list-item-card" style="border-left: 4px solid #3b82f6;">
                    <div style="font-size:0.8rem; text-transform:uppercase; color:#2563eb; font-weight:700; margin-bottom:0.2rem;">Idea</div>
                    <h3 style="margin:0; font-size:1.1rem; color:#1e293b;">${ideaTitle}</h3>
                </div>
            `;
        }
    });

    if (settings.show_participating === false) companiesHtml = '';
    if (settings.show_suggested === false) suggestedHtml = '';
    if (settings.show_needs === false) needsHtml = '';

    // Yritykset
    if (companiesHtml) {
        if (companiesList) companiesList.innerHTML = companiesHtml;
        if (companiesSection) companiesSection.style.display = 'block';
    } else {
        if (companiesSection) companiesSection.style.display = 'none';
    }

    // Ehdotetut yritykset
    if (suggestedHtml) {
        if (suggestedList) suggestedList.innerHTML = suggestedHtml;
        if (suggestedSection) suggestedSection.style.display = 'block';
    } else {
        if (suggestedSection) suggestedSection.style.display = 'none';
    }

    // Tarpeet
    if (needsHtml) {
        if (needsList) needsList.innerHTML = needsHtml;
        if (needsSection) needsSection.style.display = 'block';
    } else {
        if (needsSection) needsSection.style.display = 'none';
    }

    // Ideat — haetaan ideas-taulusta, JOS asetus sallii
    const ideaIds = relations.filter(r => r.source_type === 'IDEA').map(r => r.source_id);
    if (settings.show_ideas === false) {
        if (ideasSection) ideasSection.style.display = 'none';
    } else if (ideaIds.length > 0 && mixonetClient) {
        const { data: ideas } = await mixonetClient.from('ideas').select('id, title, description').in('id', ideaIds);
        if (ideas && ideas.length > 0 && ideasList && ideasSection) {
            ideasList.innerHTML = ideas.map(idea => {
                const desc = (idea.description || '').substring(0, 100);
                return `
                    <div class="list-item-card" style="border-left: 4px solid #3b82f6;">
                        <div style="font-size:0.8rem; text-transform:uppercase; color:#2563eb; font-weight:700; margin-bottom:0.2rem;">Idea</div>
                        <h3 style="margin:0 0 0.4rem; font-size:1.1rem; color:#1e293b;">${idea.title}</h3>
                        ${desc ? `<p style="margin:0; font-size:0.9rem; color:var(--text-muted);">${desc}${desc.length >= 100 ? '...' : ''}</p>` : ''}
                    </div>
                `;
            }).join('');
            ideasSection.style.display = 'block';
        } else {
            if (ideasSection) ideasSection.style.display = 'none';
        }
    } else {
        if (ideasSection) ideasSection.style.display = 'none';
    }
}

document.addEventListener('DOMContentLoaded', init);
