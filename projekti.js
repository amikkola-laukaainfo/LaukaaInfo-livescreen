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
        
        // Deep link painike
        const btnMixonet = document.getElementById('btn-mixonet');
        if (btnMixonet) {
            btnMixonet.href = `https://mixonet.fi/project/${projectId}`;
        }

        // Hae projektiin liittyvät asiat entity_relations taulusta
        const { data: relations, error: relError } = await mixonetClient
            .from('entity_relations')
            .select('*')
            .eq('target_id', projectId);

        if (relError) {
            console.error("Virhe relaatioiden haussa", relError);
        } else if (relations) {
            renderRelations(relations);
        }

    } catch (e) {
        console.error(e);
        showError('Odottamaton virhe ladattaessa projektia.');
    }
}

function renderRelations(relations) {
    const companiesList = document.getElementById('companies-list');
    const needsList = document.getElementById('needs-list');
    // const ideasList = document.getElementById('ideas-list');

    let companiesHtml = '';
    let needsHtml = '';

    relations.forEach(rel => {
        if (rel.source_type === 'COMPANY' && (rel.relation_type === 'PARTICIPATES_IN' || rel.relation_type === 'SUGGESTED_FOR')) {
            // Normaalisti tässä haettaisiin yrityksen nimi esim laukaainfon APIsta tai välimuistista.
            // MVP:ssä näytetään vain linkki tai ID, jos nimeä ei ole metadata.
            const companyName = rel.metadata?.name || 'Yritys (Ladataan...)';
            const badge = rel.relation_type === 'PARTICIPATES_IN' ? '<span class="tag-pill">Mukana</span>' : '<span class="tag-pill" style="background:#fef3c7; color:#b45309">Ehdotettu</span>';
            companiesHtml += `
                <a href="yrityskortti.html?id=${rel.source_id}" class="list-item-card">
                    <div class="card-header-grid">
                        <h3 style="margin:0; font-size:1.1rem">${companyName}</h3>
                        ${badge}
                    </div>
                </a>
            `;
        }
        
        if (rel.source_type === 'NEED') {
            // Tarve
            const needTitle = rel.metadata?.title || 'Tarve ' + rel.source_id;
            needsHtml += `
                <div class="list-item-card">
                    <h3 style="margin:0; font-size:1.1rem; color:#ef4444">${needTitle}</h3>
                </div>
            `;
        }
    });

    if (companiesHtml) {
        companiesList.innerHTML = companiesHtml;
    } else {
        companiesList.innerHTML = '<p style="color:var(--text-muted)">Ei vielä yrityksiä.</p>';
    }

    if (needsHtml) {
        needsList.innerHTML = needsHtml;
    } else {
        needsList.innerHTML = '<p style="color:var(--text-muted)">Ei avoimia tarpeita tällä hetkellä.</p>';
    }
}

document.addEventListener('DOMContentLoaded', init);
