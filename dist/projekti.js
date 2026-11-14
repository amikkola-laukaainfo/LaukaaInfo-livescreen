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

        // Näytä esikatselubanneri vain jos is_published on nimenomaisesti false.
        // visibility='NETWORK' on normaali arvo LAUKAAINFO-profiloinnissa tallennetuille projekteille.
        const isPublished = projectData.is_published !== false &&
            (settings.is_published !== false);
        if (!isPublished) {
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
            let descContent = '';
            if (projectData.summary && projectData.summary.trim() !== '') {
                descContent += `<p style="font-weight: 600; font-size: 1.15rem; color: #1e293b; margin-bottom: 1.25rem;">${escapeHtml(projectData.summary)}</p>`;
            }
            if (projectData.description && projectData.description.trim() !== '') {
                descContent += formatLongText(projectData.description);
            }
            document.getElementById('project-full-desc').innerHTML = descContent || 'Ei kuvausta saatavilla.';
        } else if (descSection) {
            descSection.style.display = 'none';
        }

        // Haaste & Ongelma
        const challengeSection = document.getElementById('challenge-section');
        if (challengeSection) {
            if (projectData.challenge && projectData.challenge.trim() !== '') {
                document.getElementById('project-challenge-text').innerHTML = formatLongText(projectData.challenge);
                challengeSection.style.display = 'block';
            } else {
                challengeSection.style.display = 'none';
            }
        }

        // Tavoitteet
        const goalsSection = document.getElementById('goals-section');
        if (goalsSection) {
            if (projectData.goal_custom && projectData.goal_custom.trim() !== '') {
                document.getElementById('project-goals-text').innerHTML = formatLongText(projectData.goal_custom);
                goalsSection.style.display = 'block';
            } else {
                goalsSection.style.display = 'none';
            }
        }

        // Kohderyhmä / Hyötyjät
        const benSection = document.getElementById('beneficiary-section');
        if (benSection) {
            if (projectData.beneficiary && projectData.beneficiary.trim() !== '') {
                document.getElementById('project-beneficiary-text').innerHTML = formatLongText(projectData.beneficiary);
                benSection.style.display = 'block';
            } else {
                benSection.style.display = 'none';
            }
        }

        // Taustakuva hero-osioon
        if (projectData.cover_image_url && projectData.cover_image_url.trim() !== '') {
            const heroSection = document.querySelector('.hero-section');
            if (heroSection) {
                heroSection.style.backgroundImage = `url('${escapeHtml(projectData.cover_image_url.trim())}')`;
                heroSection.style.backgroundSize = 'cover';
                heroSection.style.backgroundPosition = 'center';
            }
        }

        // Video-upotus (YouTube, Vimeo, MP4)
        if (projectData.video_url && projectData.video_url.trim() !== '') {
            const descSection = document.getElementById('desc-section');
            if (descSection) {
                const rawVideoUrl = projectData.video_url.trim();
                let embedUrl = rawVideoUrl;
                let isDirectVideo = false;

                const ytMatch = rawVideoUrl.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/i);
                const vimeoMatch = rawVideoUrl.match(/vimeo\.com\/(?:channels\/(?:\w+\/)?|groups\/([^\/]*)\/videos\/|album\/(\d+)\/video\/|video\/|)(\d+)/i);

                if (ytMatch && ytMatch[1]) {
                    embedUrl = `https://www.youtube.com/embed/${ytMatch[1]}?rel=0`;
                } else if (vimeoMatch && (vimeoMatch[3] || vimeoMatch[1])) {
                    const vimeoId = vimeoMatch[3] || vimeoMatch[1];
                    embedUrl = `https://player.vimeo.com/video/${vimeoId}`;
                } else if (/\.(mp4|webm|ogg|mov)($|\?)/i.test(rawVideoUrl)) {
                    isDirectVideo = true;
                }

                const videoSection = document.createElement('div');
                videoSection.style.cssText = 'margin-top: 2rem; margin-bottom: 1.5rem;';
                
                const titleHtml = `
                    <h3 style="font-family: Outfit, sans-serif; font-size: 1.25rem; font-weight: 700; margin-bottom: 0.75rem; display: flex; align-items: center; gap: 0.5rem; color: var(--text-main);">
                        <span class="iconify" data-icon="material-symbols:play-circle-outline" style="color: #ef4444; font-size: 1.5rem;"></span>
                        Esittelyvideo
                    </h3>
                `;

                if (isDirectVideo) {
                    videoSection.innerHTML = titleHtml + `
                        <div style="border-radius: 16px; overflow: hidden; background: #000; box-shadow: 0 10px 30px rgba(0,0,0,0.12);">
                            <video src="${escapeHtml(rawVideoUrl)}" controls style="width: 100%; max-height: 480px; display: block;"></video>
                        </div>
                    `;
                } else {
                    videoSection.innerHTML = titleHtml + `
                        <div style="border-radius: 16px; overflow: hidden; aspect-ratio: 16/9; background: #000; box-shadow: 0 10px 30px rgba(0,0,0,0.12);">
                            <iframe src="${escapeHtml(embedUrl)}" style="width: 100%; height: 100%; border: none;" allowfullscreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"></iframe>
                        </div>
                    `;
                }
                descSection.appendChild(videoSection);
            }
        }

        // Kuvagalleria
        const imagesList = Array.isArray(projectData.image_urls) ? projectData.image_urls : (typeof projectData.image_urls === 'string' ? [projectData.image_urls] : []);
        if (imagesList.length > 0) {
            const descSection = document.getElementById('desc-section');
            if (descSection) {
                const galleryEl = document.createElement('div');
                galleryEl.style.cssText = 'margin-top: 2rem; margin-bottom: 1.5rem;';
                galleryEl.innerHTML = `
                    <h3 style="font-family: Outfit, sans-serif; font-size: 1.25rem; font-weight: 700; margin-bottom: 0.75rem; display: flex; align-items: center; gap: 0.5rem; color: var(--text-main);">
                        <span class="iconify" data-icon="material-symbols:photo-library-outline" style="color: #10b981; font-size: 1.5rem;"></span>
                        Kuvat
                    </h3>
                    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 1rem;">
                        ${imagesList.map(url => `
                            <a href="${escapeHtml(url)}" target="_blank" rel="noopener" style="display: block; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.06);">
                                <img src="${escapeHtml(url)}" alt="Projektin kuva" loading="lazy"
                                    style="width: 100%; height: 140px; object-fit: cover; cursor: zoom-in; transition: transform 0.25s ease;"
                                    onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
                            </a>
                        `).join('')}
                    </div>
                `;
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

        // Hae projektiin liittyvät asiat entity_relations taulusta (sekä source että target)
        const { data: relations, error: relError } = await mixonetClient
            .from('entity_relations')
            .select('*')
            .or(`target_id.eq.${projectId},source_id.eq.${projectId}`);

        // UUSI: Hae project_actors taulusta osallistujat
        let actors = [];
        try {
            const { data: rawActors, error: actorsError } = await mixonetClient
                .from('project_actors')
                .select('*, organization:organizations(*)')
                .eq('project_id', projectId)
                .eq('status', 'ACTIVE'); // Vain aktiiviset osallistujat

            if (!actorsError && rawActors && rawActors.length > 0) {
                actors = rawActors;
                const userIds = actors
                    .filter(a => a.actor_type === 'PERSON' && a.user_id)
                    .map(a => a.user_id);
                if (userIds.length > 0) {
                    try {
                        const { data: profiles } = await mixonetClient
                            .from('user_profiles')
                            .select('*')
                            .in('id', userIds);
                        if (profiles) {
                            actors.forEach(a => {
                                if (a.actor_type === 'PERSON') {
                                    a.user_profile = profiles.find(p => p.id === a.user_id);
                                }
                            });
                        }
                    } catch (pErr) {
                        console.error("Virhe käyttäjäprofiilien haussa", pErr);
                    }
                }
            }
        } catch (aErr) {
            console.error("Virhe project_actors haussa", aErr);
        }

        // Hae suorat tarpeet mixonet_needs ja opportunities -tauluista
        let directProjectNeeds = [];
        if (mixonetClient) {
            try {
                const { data: needsFromTable } = await mixonetClient
                    .from('mixonet_needs')
                    .select('*')
                    .or(`project_id.eq.${projectId},entity_id.eq.${projectId}`);
                if (needsFromTable && needsFromTable.length > 0) {
                    directProjectNeeds.push(...needsFromTable);
                }
            } catch (e1) {
                console.warn('mixonet_needs query error', e1);
            }

            try {
                const { data: oppsFromTable } = await mixonetClient
                    .from('opportunities')
                    .select('*')
                    .eq('project_id', projectId);
                if (oppsFromTable && oppsFromTable.length > 0) {
                    directProjectNeeds.push(...oppsFromTable);
                }
            } catch (e2) {
                console.warn('opportunities query error', e2);
            }
        }

        if (relError) {
            console.error("Virhe relaatioiden haussa", relError);
        }

        // Hae yritysten ja tarpeiden nimet kannasta
        const companyIds = relations ? relations.filter(r => r.source_type === 'COMPANY').map(r => r.source_id) : [];
        const rawNeedIds = relations ? relations.filter(r => r.source_type === 'NEED' || r.relation_type === 'NEEDS' || r.target_type === 'NEED' || r.relation_type === 'HAS_NEED').map(r => r.source_id === projectId ? r.target_id : r.source_id).filter(Boolean) : [];
        const needIds = rawNeedIds.filter(id => id !== projectId);

        // Lisää project_actors company_external_id:t listaan, jos ne on COMPANY
        if (actors) {
            actors.forEach(actor => {
                if (actor.actor_type === 'COMPANY' && actor.company_external_id && !companyIds.includes(actor.company_external_id)) {
                    companyIds.push(actor.company_external_id);
                }
            });
        }

        let companiesData = [];
        let needsData = [...directProjectNeeds];

        if (companyIds.length > 0) {
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            const validUuids = companyIds.filter(id => uuidRegex.test(id));
            const externalIds = companyIds.filter(id => !uuidRegex.test(id));

            const promises = [];
            if (validUuids.length > 0) promises.push(mixonetClient.from('companies').select('id, name').in('id', validUuids));
            if (externalIds.length > 0) promises.push(mixonetClient.from('companies').select('external_id, name').in('external_id', externalIds));

            const results = await Promise.all(promises);
            results.forEach(res => {
                if (res.data) {
                    const mapped = res.data.map(c => ({ id: c.id || c.external_id, name: c.name }));
                    companiesData.push(...mapped);
                }
            });
        }

        if (needIds.length > 0) {
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            const validUuids = needIds.filter(id => uuidRegex.test(id));
            const nonUuidLabels = needIds.filter(id => !uuidRegex.test(id));

            if (validUuids.length > 0) {
                const [oppRes, taxRes, mixRes] = await Promise.all([
                    mixonetClient.from('opportunities').select('id, title, description, compensation_model').in('id', validUuids),
                    mixonetClient.from('taxonomy').select('id, label').in('id', validUuids),
                    mixonetClient.from('mixonet_needs').select('id, title, description, category, status').in('id', validUuids)
                ]);
                if (oppRes && oppRes.data) needsData.push(...oppRes.data);
                if (taxRes && taxRes.data) {
                    taxRes.data.forEach(t => needsData.push({ id: t.id, title: t.label }));
                }
                if (mixRes && mixRes.data) needsData.push(...mixRes.data);
            }

            nonUuidLabels.forEach(lbl => {
                if (!needsData.some(n => n.id === lbl || n.title === lbl)) {
                    needsData.push({ id: lbl, title: lbl });
                }
            });
        }

        renderRelations(relations || [], actors || [], companiesData, needsData, settings);

        // Hae teemat monesta lähteestä (theme_custom, theme_taxonomy_id, entity_relations -> THEME / TAXONOMY)
        try {
            const themesSection = document.getElementById('themes-section');
            const heroThemesContainer = document.getElementById('hero-themes-container');

            if (settings.show_themes === false) {
                if (themesSection) themesSection.style.display = 'none';
                if (heroThemesContainer) heroThemesContainer.style.display = 'none';
            } else {
                const collectedThemes = []; // Array of { id, label }

                // 1. Mukautetut teemat (theme_custom, esim "Dokumentit, Paikallishistoria, Digitointi, Mediatuotanto, Tekoäly")
                if (projectData.theme_custom && projectData.theme_custom.trim() !== '') {
                    const customList = projectData.theme_custom.split(',').map(s => s.trim()).filter(s => s.length > 0);
                    customList.forEach(tName => {
                        if (!collectedThemes.some(t => t.label.toLowerCase() === tName.toLowerCase())) {
                            collectedThemes.push({ id: tName, label: tName });
                        }
                    });
                }

                // 2. Teema-relaatiot (entity_relations)
                try {
                    const { data: themeRels } = await mixonetClient
                        .from('entity_relations')
                        .select('target_id, target_type, relation_type, metadata')
                        .eq('source_id', projectId);

                    if (themeRels && themeRels.length > 0) {
                        const targetIds = themeRels
                            .filter(r => r.target_type === 'THEME' || r.relation_type === 'THEME' || r.relation_type === 'HAS_THEME' || r.target_type === 'TAXONOMY')
                            .map(r => r.target_id);

                        if (targetIds.length > 0) {
                            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                            const validUuids = targetIds.filter(id => uuidRegex.test(id));
                            const nonUuids = targetIds.filter(id => !uuidRegex.test(id));

                            nonUuids.forEach(lbl => {
                                if (!collectedThemes.some(t => t.label.toLowerCase() === lbl.toLowerCase())) {
                                    collectedThemes.push({ id: lbl, label: lbl });
                                }
                            });

                            if (validUuids.length > 0) {
                                const [taxRes, oppRes] = await Promise.all([
                                    mixonetClient.from('taxonomy').select('id, label, slug').in('id', validUuids),
                                    mixonetClient.from('opportunities').select('id, title, slug').in('id', validUuids)
                                ]);
                                if (taxRes.data) {
                                    taxRes.data.forEach(t => {
                                        const name = t.label || t.slug || t.id;
                                        if (!collectedThemes.some(x => x.id === t.id)) {
                                            collectedThemes.push({ id: t.id, label: name });
                                        }
                                    });
                                }
                                if (oppRes.data) {
                                    oppRes.data.forEach(t => {
                                        const name = t.title || t.slug || t.id;
                                        if (!collectedThemes.some(x => x.id === t.id)) {
                                            collectedThemes.push({ id: t.id, label: name });
                                        }
                                    });
                                }
                            }
                        }
                    }
                } catch (rErr) {
                    console.warn('Virhe teemarelaatioiden haussa:', rErr);
                }

                // 3. Pääteema (theme_taxonomy_id)
                if (projectData.theme_taxonomy_id) {
                    try {
                        const { data: mainTax } = await mixonetClient
                            .from('taxonomy')
                            .select('id, label, slug')
                            .eq('id', projectData.theme_taxonomy_id)
                            .single();
                        if (mainTax && !collectedThemes.some(x => x.id === mainTax.id)) {
                            collectedThemes.unshift({ id: mainTax.id, label: mainTax.label || mainTax.slug });
                        }
                    } catch (_) {}
                }

                // Renderöidään teemat oikeaan sivupalkkiin (Liittyvät teemat)
                if (collectedThemes.length > 0) {
                    const sidebarHtml = collectedThemes.map(t => {
                        const href = `teema.html?tag=${encodeURIComponent(t.id)}`;
                        return `<a href="${href}" class="tag-pill" style="background:#ede9fe; color:#5b21b6; text-decoration:none; font-size:0.95rem; font-weight:600; padding:0.4rem 1rem; border-radius:8px;">${escapeHtml(t.label)}</a>`;
                    }).join('');

                    const themesList = document.getElementById('themes-list');
                    if (themesList) themesList.innerHTML = sidebarHtml;
                    if (themesSection) themesSection.style.display = 'block';
                } else {
                    if (themesSection) themesSection.style.display = 'none';
                }
            }
        } catch(e) {
            console.warn('Teemojen haku epäonnistui', e);
            const themesSection = document.getElementById('themes-section');
            if (themesSection) themesSection.style.display = 'none';
        }

        // Hae projektin paikka (place_id, place_custom, LOCATED_IN / OPERATES_IN -> PLACE)
        try {
            const placeSection = document.getElementById('project-place-section');
            const placeList = document.getElementById('project-place-list');
            
            if (placeSection && placeList) {
                // 1. Hae entity_relations (LOCATED_IN, OPERATES_IN, LOCATED_AT, RELATES_TO, PRIMARY_PLACE)
                const { data: placeRelations } = await mixonetClient
                    .from('entity_relations')
                    .select('target_id, relation_type, metadata')
                    .eq('source_id', projectId)
                    .eq('source_type', 'PROJECT')
                    .eq('target_type', 'PLACE')
                    .in('relation_type', ['LOCATED_IN', 'OPERATES_IN', 'LOCATED_AT', 'RELATES_TO', 'PRIMARY_PLACE']);

                const targetPlaceIds = new Set();
                if (projectData.place_id) targetPlaceIds.add(projectData.place_id);

                if (placeRelations && placeRelations.length > 0) {
                    placeRelations.forEach(r => {
                        if (r.target_id) targetPlaceIds.add(r.target_id);
                    });
                }

                // 2. Haetaan paikkojen nimet Supabasen places-taulusta (kyselöidään SEKÄ id ETTÄ place_id rinnakkain)
                let fetchedPlaces = [];
                if (targetPlaceIds.size > 0) {
                    const placeIdsArray = Array.from(targetPlaceIds);
                    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                    const validUuids = placeIdsArray.filter(id => uuidRegex.test(id));

                    if (validUuids.length > 0) {
                        const [resByPlaceId, resById] = await Promise.all([
                            mixonetClient.from('places').select('id, place_id, name, canonical_name, type, municipality').in('place_id', validUuids),
                            mixonetClient.from('places').select('id, place_id, name, canonical_name, type, municipality').in('id', validUuids)
                        ]);

                        const pMap = new Map();
                        if (resByPlaceId.data) resByPlaceId.data.forEach(p => { if (p) pMap.set(p.place_id || p.id, p); });
                        if (resById.data) resById.data.forEach(p => { if (p) pMap.set(p.id || p.place_id, p); });

                        fetchedPlaces = Array.from(pMap.values());
                    }
                }

                let placesHtml = '';

                // Apufunktio siistiin paikannimen ratkaisuun ilman raaka-UUIDeja
                const resolvePlaceName = (pId, fallbackLabel = 'Sijainti') => {
                    const pObj = fetchedPlaces.find(p => p.place_id === pId || p.id === pId);
                    if (pObj && (pObj.name || pObj.canonical_name)) {
                        return pObj.name || pObj.canonical_name;
                    }
                    // Jos pId on UUID eikä nimeä löydy kannasta, ei näytetä 36-merkkistä UUID-koodia
                    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pId);
                    return isUuid ? fallbackLabel : pId;
                };

                // Renderöidään ensisijainen paikka
                if (projectData.place_id) {
                    const pName = resolvePlaceName(projectData.place_id, 'Ensisijainen paikka');
                    placesHtml += `
                        <a href="tietoa-paikasta.html?id=${encodeURIComponent(projectData.place_id)}" class="list-item-card" style="text-decoration: none; display: flex; align-items: center; gap: 0.75rem; border-left: 4px solid #0284c7; background: #f0f9ff; margin-bottom: 0.5rem;">
                            <div style="width: 42px; height: 42px; border-radius: 10px; background: #e0f2fe; color: #0284c7; display: flex; align-items: center; justify-content: center; font-size: 1.3rem; flex-shrink: 0;">
                                <span class="iconify" data-icon="material-symbols:location-on"></span>
                            </div>
                            <div style="flex: 1;">
                                <div style="font-size: 0.72rem; text-transform: uppercase; color: #0369a1; font-weight: 700;">📍 Ensisijainen paikka</div>
                                <h3 style="margin: 0; font-size: 1.05rem; font-weight: 700; color: var(--text-main);">${escapeHtml(pName)}</h3>
                            </div>
                            <span class="iconify" style="color: #0284c7; font-size: 1.2rem;" data-icon="material-symbols:arrow-forward"></span>
                        </a>
                    `;
                }

                // Renderöidään muut paikat ja toiminta-alueet (OPERATES_IN, LOCATED_IN jne)
                const renderedIds = new Set();
                if (projectData.place_id) renderedIds.add(projectData.place_id);

                if (placeRelations && placeRelations.length > 0) {
                    placeRelations.forEach(rel => {
                        const placeId = rel.target_id;
                        if (!placeId || renderedIds.has(placeId)) return; // Älä duplikoi ensisijaista paikkaa tai jo renderöityä
                        renderedIds.add(placeId);

                        const isOperates = rel.relation_type === 'OPERATES_IN';
                        const placeName = resolvePlaceName(placeId, rel.metadata?.place_name || (isOperates ? 'Toiminta-alue' : 'Sijaintikohde'));

                        const badgeText = isOperates ? '🗺️ Toiminta-alue' : '📍 Lisätty sijainti';
                        const borderColor = isOperates ? '#8b5cf6' : '#0284c7';
                        const iconBg = isOperates ? '#f3e8ff' : '#e0f2fe';
                        const iconColor = isOperates ? '#7c3aed' : '#0284c7';

                        placesHtml += `
                            <a href="tietoa-paikasta.html?id=${encodeURIComponent(placeId)}" class="list-item-card" style="text-decoration: none; display: flex; align-items: center; gap: 0.75rem; border-left: 4px solid ${borderColor}; margin-bottom: 0.5rem;">
                                <div style="width: 40px; height: 40px; border-radius: 10px; background: ${iconBg}; color: ${iconColor}; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; flex-shrink: 0;">
                                    <span class="iconify" data-icon="material-symbols:map"></span>
                                </div>
                                <div style="flex: 1;">
                                    <div style="font-size: 0.72rem; text-transform: uppercase; color: ${iconColor}; font-weight: 700;">${badgeText}</div>
                                    <h3 style="margin: 0; font-size: 1rem; font-weight: 700; color: var(--text-main);">${escapeHtml(placeName)}</h3>
                                </div>
                                <span class="iconify" style="color: ${iconColor}; font-size: 1.2rem;" data-icon="material-symbols:arrow-forward"></span>
                            </a>
                        `;
                    });
                }

                // Renderöidään vapaamuotoinen paikkakuvaus (place_custom) jos määritelty
                if (projectData.place_custom && projectData.place_custom.trim() !== '') {
                    placesHtml += `
                        <div style="padding: 0.85rem 1rem; background: #f8fafc; border-radius: 12px; border: 1px dashed #cbd5e1; font-size: 0.9rem; color: var(--text-main); margin-top: 0.5rem;">
                            <strong style="color: #475569; display: flex; align-items: center; gap: 0.3rem; margin-bottom: 0.2rem;">
                                <span class="iconify" data-icon="material-symbols:info-outline"></span> Aluekuvaus:
                            </strong>
                            <span style="color: #334155; font-weight: 500;">${escapeHtml(projectData.place_custom)}</span>
                        </div>
                    `;
                }

                if (placesHtml.trim() !== '') {
                    placeList.innerHTML = placesHtml;
                    placeSection.style.display = 'block';
                } else {
                    placeSection.style.display = 'none';
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
    
    const renderedCompanyIds = new Set();
    const activeActorCards = [];

    // --- 1. Käsittele uudet project_actors (etusijalla) ---
    actors.forEach(actor => {
        if (actor.actor_type === 'COMPANY') {
            const externalId = actor.company_external_id;
            if (externalId) {
                renderedCompanyIds.add(externalId);
                const compObj = companiesData.find(c => c.id === externalId);
                const companyName = compObj?.name || 'Yritys';
                const roleHtml = actor.project_role ? `<div style="font-size:0.85rem; color:var(--text-muted); font-weight:500;">${escapeHtml(actor.project_role)}</div>` : '';
                activeActorCards.push(`
                    <a href="yrityskortti.html?id=${externalId}" class="list-item-card" style="border-left: 4px solid #10b981;">
                        <div class="card-header-grid">
                            <div>
                                <div style="font-size:0.75rem; text-transform:uppercase; color:#10b981; font-weight:700; margin-bottom:0.2rem;">🏢 Mukana oleva yritys</div>
                                <h3 style="margin:0; font-size:1.05rem; font-weight:700;">${escapeHtml(companyName)}</h3>
                                ${roleHtml}
                            </div>
                            <span class="iconify" style="color:#10b981; font-size:1.2rem;" data-icon="material-symbols:open-in-new"></span>
                        </div>
                    </a>
                `);
            }
        } else if (actor.actor_type === 'ORG') {
            const org = actor.organization;
            if (org) {
                const icon = org.org_type === 'MUNICIPALITY' ? '🏛️' : (org.org_type === 'ASSOCIATION' ? '🤝' : '🏢');
                const typeText = org.org_type === 'MUNICIPALITY' ? 'Kunta' : (org.org_type === 'ASSOCIATION' ? 'Yhdistys' : 'Organisaatio');
                const roleHtml = actor.project_role ? `<div style="font-size:0.85rem; color:var(--text-muted); font-weight:500;">${escapeHtml(actor.project_role)}</div>` : '';
                activeActorCards.push(`
                    <div class="list-item-card" style="border-left: 4px solid #8b5cf6;">
                        <div style="font-size:0.75rem; text-transform:uppercase; color:#8b5cf6; font-weight:700; margin-bottom:0.2rem;">${icon} ${typeText}</div>
                        <h3 style="margin:0; font-size:1.05rem; font-weight:700;">${escapeHtml(org.name)}</h3>
                        ${roleHtml}
                    </div>
                `);
            }
        } else if (actor.actor_type === 'PERSON') {
            const user = actor.user_profile;
            if (user && (actor.show_in_project || actor.status === 'ACTIVE')) {
                const nameStr = user.full_name || user.name || user.username || "Osallistuja";
                const parts = nameStr.trim().split(" ");
                const shortName = parts.length >= 2 ? parts[0] + " " + parts[parts.length-1].charAt(0) + "." : nameStr;
                const roleHtml = actor.project_role ? `<div style="font-size:0.85rem; color:#3b82f6; font-weight:600;">${escapeHtml(actor.project_role)}</div>` : '';
                const skillsHtml = user.skills && user.skills.length > 0 
                    ? `<div style="margin-top:0.35rem; font-size:0.82rem; color:var(--text-muted);">${escapeHtml(user.skills.slice(0,3).join(' · '))}</div>` : '';
                const locationHtml = user.location ? `<div style="margin-top:0.25rem; font-size:0.8rem; color:var(--text-muted);">📍 ${escapeHtml(user.location)}</div>` : '';
                
                activeActorCards.push(`
                    <div class="list-item-card" style="border-left: 4px solid #3b82f6;">
                        <div style="font-size:0.75rem; text-transform:uppercase; color:#3b82f6; font-weight:700; margin-bottom:0.2rem;">👤 Osallistuja</div>
                        <h3 style="margin:0; font-size:1.05rem; font-weight:700;">${escapeHtml(shortName)}</h3>
                        ${roleHtml}
                        ${skillsHtml}
                        ${locationHtml}
                    </div>
                `);
            }
        }
    });

    // --- 2. Käsittele vanhat entity_relations (PARTICIPATES_IN, SUGGESTED_FOR, NEEDS, IDEA) ---
    relations.forEach(rel => {
        if (rel.source_type === 'COMPANY') {
            const compObj = companiesData.find(c => c.id === rel.source_id);
            const companyName = compObj?.name || rel.metadata?.name || 'Yritys';
            const isParticipating = rel.relation_type === 'PARTICIPATES_IN';
            
            if (isParticipating && renderedCompanyIds.has(rel.source_id)) {
                return;
            }
            
            const card = `
                <a href="yrityskortti.html?id=${rel.source_id}" class="list-item-card" style="border-left: 4px solid #10b981;">
                    <div class="card-header-grid">
                        <div>
                            <div style="font-size:0.75rem; text-transform:uppercase; color:#10b981; font-weight:700; margin-bottom:0.2rem;">🏢 Yritys</div>
                            <h3 style="margin:0; font-size:1.05rem">${escapeHtml(companyName)}</h3>
                        </div>
                        <span class="iconify" style="color:#10b981; font-size:1.2rem;" data-icon="material-symbols:open-in-new"></span>
                    </div>
                </a>
            `;
            if (isParticipating) {
                activeActorCards.push(card);
                renderedCompanyIds.add(rel.source_id);
            } else if (rel.relation_type === 'SUGGESTED_FOR') {
                suggestedHtml += card;
            }
        } else if (rel.source_type === 'IDEA') {
            const ideaTitle = rel.metadata?.title || 'Idea';
            ideasHtml += `
                <div class="list-item-card" style="border-left: 4px solid #3b82f6;">
                    <div style="font-size:0.75rem; text-transform:uppercase; color:#2563eb; font-weight:700; margin-bottom:0.2rem;">💡 Idea</div>
                    <h3 style="margin:0; font-size:1.05rem; font-weight:700; color:#0f172a;">${escapeHtml(ideaTitle)}</h3>
                </div>
            `;
        }
    });

    // --- 3. Käsittele kaikkien eri lähteiden tarpeet (needsData) ---
    const renderedNeedTitles = new Set();

    needsData.forEach(need => {
        const needTitle = need.title || need.label || 'Tarve';
        if (!needTitle || needTitle.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
            return;
        }
        const key = needTitle.toLowerCase().trim();
        if (renderedNeedTitles.has(key)) return;
        renderedNeedTitles.add(key);

        const compModel = need.compensation_model || need.budget_type || need.urgency;
        let compBadge = '';
        if (compModel === 'PAID' || compModel === 'PAID_SERVICE') compBadge = '<span style="font-size:0.75rem; font-weight:700; color:#047857; background:#dcfce7; padding:0.2rem 0.6rem; border-radius:50px;">💰 Maksettu</span>';
        else if (compModel === 'VOLUNTEER' || compModel === 'VOLUNTARY') compBadge = '<span style="font-size:0.75rem; font-weight:700; color:#1e40af; background:#dbeafe; padding:0.2rem 0.6rem; border-radius:50px;">🤝 Vapaaehtoinen</span>';
        else if (compModel === 'TALENT' || compModel === 'SKILL') compBadge = '<span style="font-size:0.75rem; font-weight:700; color:#6b21a8; background:#f3e8ff; padding:0.2rem 0.6rem; border-radius:50px;">🎓 Osaaminen</span>';

        let needIcon = '📣';
        const lowerTitle = key;
        if (lowerTitle.includes('video') || lowerTitle.includes('kuva')) needIcon = '🎥';
        else if (lowerTitle.includes('ääni') || lowerTitle.includes('podcast') || lowerTitle.includes('musiikki')) needIcon = '🎙️';
        else if (lowerTitle.includes('digit') || lowerTitle.includes('arkisto')) needIcon = '📼';
        else if (lowerTitle.includes('edit') || lowerTitle.includes('koodi') || lowerTitle.includes('web')) needIcon = '🧑‍💻';
        else if (lowerTitle.includes('idea')) needIcon = '💡';

        const descHtml = need.description && need.description.trim() !== '' ? `<p style="margin:0.25rem 0 0; font-size:0.88rem; color:var(--text-muted); line-height:1.4;">${escapeHtml(need.description)}</p>` : '';

        needsHtml += `
            <div class="list-item-card" style="border-left: 4px solid #ef4444; display: flex; flex-direction: column; justify-content: space-between; gap: 0.75rem;">
                <div>
                    <div style="display:flex; align-items:center; justify-content:space-between; gap:0.5rem; margin-bottom:0.4rem;">
                        <span style="font-size:0.75rem; text-transform:uppercase; color:#dc2626; font-weight:700;">${needIcon} Tarve</span>
                        ${compBadge}
                    </div>
                    <h3 style="margin:0; font-size:1.05rem; font-weight:700; color:#0f172a;">${escapeHtml(needTitle)}</h3>
                    ${descHtml}
                </div>
                <div style="margin-top:0.25rem;">
                    <a href="https://play.google.com/store/apps/details?id=com.mediazoo.mixonet&hl=fi" target="_blank" rel="noopener" style="font-size:0.82rem; font-weight:700; color:#ef4444; text-decoration:none; display:inline-flex; align-items:center; gap:0.3rem;">
                        Voin auttaa tässä / Osallistu Mixonetissa →
                    </a>
                </div>
            </div>
        `;
    });

    if (settings.show_participating === false) activeActorCards.length = 0;
    if (settings.show_suggested === false) suggestedHtml = '';
    if (settings.show_needs === false) needsHtml = '';

    // Renderöi "Projektissa mukana"
    const activeCount = activeActorCards.length;
    const interestedCount = actors.filter(a => a.status === 'PENDING').length;

    if (activeCount > 0 || interestedCount > 0) {
        const maxDisplay = 5;
        const displayedCards = activeActorCards.slice(0, maxDisplay).join('');
        const extraCount = activeCount > maxDisplay ? activeCount - maxDisplay : 0;

        const extraHtml = extraCount > 0 ? `
            <div style="padding: 0.75rem 1rem; background: #f8fafc; border-radius: 12px; border: 1px dashed #cbd5e1; text-align: center; font-size: 0.85rem; font-weight: 700; color: #64748b;">
                + ${extraCount} muuta osallistujaa
            </div>
        ` : '';

        const badgeText = `${activeCount} osallistujaa${interestedCount > 0 ? ` · ${interestedCount} kiinnostunutta` : ''}`;

        const headerBlock = `
            <div style="margin-bottom: 1rem;">
                <h2 style="display: flex; align-items: center; gap: 0.5rem; margin-top: 0; margin-bottom: 0.4rem; font-family: Outfit, sans-serif;">
                    <span class="iconify" style="color: #10b981;" data-icon="material-symbols:group-outline"></span>
                    Projektissa mukana
                </h2>
                <div style="display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; margin-bottom: 0.4rem;">
                    <span style="font-size: 0.82rem; font-weight: 700; color: #047857; background: #ecfdf5; padding: 0.25rem 0.75rem; border-radius: 50px; border: 1px solid #a7f3d0;">
                        ${badgeText}
                    </span>
                </div>
                <p style="font-size: 0.8rem; color: var(--text-muted); margin: 0; font-weight: 500; line-height: 1.4;">
                    🌱 Verkosto rakentuu parhaillaan. Osallistumisen hallinta tapahtuu Mixonet-sovelluksessa.
                </p>
            </div>
        `;

        const footerCta = `
            <div style="margin-top: 1rem; padding-top: 0.75rem; border-top: 1px solid #f1f5f9; text-align: right;">
                <a href="https://play.google.com/store/apps/details?id=com.mediazoo.mixonet&hl=fi" target="_blank" rel="noopener" style="font-size: 0.85rem; font-weight: 700; color: #10b981; text-decoration: none; display: inline-flex; align-items: center; gap: 0.3rem;">
                    Tutustu ja osallistu Mixonetissa →
                </a>
            </div>
        `;

        if (companiesSection) {
            companiesSection.innerHTML = headerBlock + (displayedCards ? `<div class="list-grid">${displayedCards}${extraHtml}</div>` : '') + footerCta;
            companiesSection.style.display = 'block';
        }
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

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/**
 * Muotoilee pitkän tekstikentän (description, challenge, goals, beneficiary)
 * kappaleiksi (<p>), listoiksi (<ul>/<ol>) ja rivivaihdoiksi (<br>) turvallisesti.
 */
function formatLongText(text) {
    if (!text || typeof text !== 'string') return '';
    const cleanText = text.trim();
    if (!cleanText) return '';

    // Jaa teksti osioihin kahden tai useamman peräkkäisen rivivaihdon perusteella (tyhjä rivi kappaleiden välissä)
    const blocks = cleanText.split(/\n\s*\n/);

    const formattedBlocks = blocks.map(block => {
        const trimmedBlock = block.trim();
        if (!trimmedBlock) return '';

        const lines = trimmedBlock.split('\n');

        // Tarkista onko kpl kokonaan ranskalaisten viivojen tai numerolistan muotoinen
        const isBulletList = lines.length > 0 && lines.every(l => /^\s*[\-\*\•]\s+/.test(l));
        const isNumberedList = lines.length > 0 && lines.every(l => /^\s*\d+[\.\)]\s+/.test(l));

        if (isBulletList) {
            const items = lines.map(l => `<li>${escapeHtml(l.replace(/^\s*[\-\*\•]\s+/, ''))}</li>`).join('');
            return `<ul class="formatted-list">${items}</ul>`;
        } else if (isNumberedList) {
            const items = lines.map(l => `<li>${escapeHtml(l.replace(/^\s*\d+[\.\)]\s+/, ''))}</li>`).join('');
            return `<ol class="formatted-list">${items}</ol>`;
        }

        // Tavanomainen tekstikappale: yksittäiset rivivaihdot korvataan <br>-tagilla
        const formattedParagraph = lines.map(l => escapeHtml(l.trim())).join('<br>');
        return `<p>${formattedParagraph}</p>`;
    });

    return `<div class="formatted-text-content">${formattedBlocks.join('')}</div>`;
}

