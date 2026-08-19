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

        document.getElementById('loading-spinner').style.display = 'none';
        document.getElementById('project-content').style.display = 'block';

        // Päivitä otsikot
        document.title = `${projectData.title} – LaukaaInfo`;
        document.getElementById('project-name').textContent = projectData.title;
        document.getElementById('project-full-desc').textContent = projectData.description || 'Ei kuvausta saatavilla.';

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
        
        // Deep link painike
        const btnMixonet = document.getElementById('btn-mixonet');
        if (btnMixonet) {
            btnMixonet.href = `https://mixonet.fi/project/${projectId}`;
        }

        // Rahoitus-osio
        const fundingSection = document.getElementById('funding-section');
        if (fundingSection && projectData.funding_status && projectData.funding_status !== 'NONE') {
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

        // Hae projektiin liittyvät asiat entity_relations taulusta
        const { data: relations, error: relError } = await mixonetClient
            .from('entity_relations')
            .select('*')
            .eq('target_id', projectId);

        if (relError) {
            console.error("Virhe relaatioiden haussa", relError);
        } else if (relations && relations.length > 0) {
            // Hae yritysten ja tarpeiden nimet kannasta, jotta ei näytetä pelkkiä UUID:itä
            const companyIds = relations.filter(r => r.source_type === 'COMPANY').map(r => r.source_id);
            const needIds = relations.filter(r => r.source_type === 'NEED').map(r => r.source_id);

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

            renderRelations(relations, companiesData, needsData);
        } else {
            renderRelations([], [], []);
        }

        // Hae liittyvät teemat (PROJECT on source, THEME on target)
        try {
            const { data: themeRelations } = await mixonetClient
                .from('entity_relations')
                .select('target_id')
                .eq('source_id', projectId)
                .eq('target_type', 'THEME');

            const themesSection = document.getElementById('themes-section');
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
        } catch(e) {
            console.warn('Teemojen haku epäonnistui', e);
            const themesSection = document.getElementById('themes-section');
            if (themesSection) themesSection.style.display = 'none';
        }

    } catch (e) {
        console.error(e);
        showError('Odottamaton virhe ladattaessa projektia.');
    }
}

async function renderRelations(relations, companiesData = [], needsData = []) {
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

    relations.forEach(rel => {
        if (rel.source_type === 'COMPANY') {
            const compObj = companiesData.find(c => c.id === rel.source_id);
            const companyName = compObj?.name || rel.metadata?.name || 'Yritys';
            const card = `
                <a href="yrityskortti.html?id=${rel.source_id}" class="list-item-card">
                    <div class="card-header-grid">
                        <h3 style="margin:0; font-size:1.05rem">${companyName}</h3>
                        <span class="iconify" style="color:#10b981; font-size:1.2rem;" data-icon="material-symbols:check-circle-outline"></span>
                    </div>
                    <div style="margin-top:0.75rem;">
                        <span style="display:inline-block;padding:0.3rem 0.8rem;background:#10b981;color:white;border-radius:50px;font-size:0.8rem;font-weight:700;">Tutustu →</span>
                    </div>
                </a>
            `;
            if (rel.relation_type === 'PARTICIPATES_IN') {
                companiesHtml += card;
            } else if (rel.relation_type === 'SUGGESTED_FOR') {
                suggestedHtml += card;
            }
        }
        
        if (rel.source_type === 'NEED') {
            const needObj = needsData.find(n => n.id === rel.source_id);
            const needTitle = needObj?.title || rel.metadata?.title || 'Tarve';
            needsHtml += `
                <div class="list-item-card" style="border-left: 3px solid #ef4444;">
                    <h3 style="margin:0; font-size:1.05rem; color:#ef4444">${needTitle}</h3>
                </div>
            `;
        }
    });

    // Mukana olevat yritykset
    if (companiesHtml && companiesList && companiesSection) {
        companiesList.innerHTML = companiesHtml;
        companiesSection.style.display = 'block';
    }

    // Sopivat yritykset
    if (suggestedHtml && suggestedList && suggestedSection) {
        suggestedList.innerHTML = suggestedHtml;
        suggestedSection.style.display = 'block';
    }

    // Tarpeet
    if (needsHtml && needsList && needsSection) {
        needsList.innerHTML = needsHtml;
        needsSection.style.display = 'block';
    }

    // Ideat — haetaan ideas-taulusta
    const ideaIds = relations.filter(r => r.source_type === 'IDEA').map(r => r.source_id);
    if (ideaIds.length > 0 && mixonetClient) {
        const { data: ideas } = await mixonetClient.from('ideas').select('id, title, description').in('id', ideaIds);
        if (ideas && ideas.length > 0 && ideasList && ideasSection) {
            ideasList.innerHTML = ideas.map(idea => {
                const desc = (idea.description || '').substring(0, 100);
                return `
                    <div class="list-item-card" style="border-left: 3px solid #f59e0b;">
                        <h3 style="margin:0 0 0.4rem; font-size:1.05rem; color:#b45309">${idea.title}</h3>
                        ${desc ? `<p style="margin:0; font-size:0.9rem; color:var(--text-muted);">${desc}${desc.length >= 100 ? '...' : ''}</p>` : ''}
                    </div>
                `;
            }).join('');
            ideasSection.style.display = 'block';
        }
    }
}

document.addEventListener('DOMContentLoaded', init);
