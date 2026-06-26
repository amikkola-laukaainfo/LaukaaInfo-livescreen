/**
 * Laukaa some-yhteisöt (Facebook groups, pages, etc.)
 * Hakee dataa ensisijaisesti Supabasesta, ja käyttää mock-dataa varavaihtoehtona.
 */

// Mock data (fallback, jos Supabase-yhteys ei toimi)
const mockCommunities = [
    { name: 'Laukaan kunta', url: 'https://www.facebook.com/Laukaankunta', description: 'Kunnan virallinen tiedotuskanava, tapahtumat ja uutiset.', category: 'kunnan viralliset', icon: 'mdi:town-hall', is_highlighted: true },
    { name: 'Visit Laukaa', url: 'https://www.facebook.com/visitlaukaa', description: 'Matkailutärpit, retkeily ja elämykset Laukaassa.', category: 'kunnan viralliset', icon: 'mdi:map-marker-star', is_highlighted: true },
    { name: 'Laukaan Koiraharrastajat ry', url: 'https://www.facebook.com/laukaankoiraharrastajat', description: 'Ajankohtaiset tapahtumat ja kilpailut koiraharrastajille.', category: 'yhdistykset', icon: 'mdi:dog', is_highlighted: false },
    { name: 'Lievestuoreen Partio', url: 'https://www.facebook.com/lievestuoreenpartio', description: 'Partiotoimintaa ja erätaitoja lapsille ja nuorille.', category: 'harrastukset', icon: 'mdi:campfire', is_highlighted: false },
    { name: 'Laukaan nuorisopalvelut', url: 'https://www.facebook.com/Laukaannuorisopalvelut', description: 'Tietoa nuorisotilojen aukioloista ja toiminnasta.', category: 'harrastukset', icon: 'mdi:gamepad-variant', is_highlighted: true },
    { name: 'Laukaan asukkaat', url: 'https://www.facebook.com/groups/esimerkki1', description: 'Paikallinen keskustelu, vertaistuki ja naapuriapu.', category: 'keskustelut', icon: 'mdi:forum', is_highlighted: true },
    { name: 'Laukaan kirppis', url: 'https://www.facebook.com/groups/esimerkki2', description: 'Osta, myy ja vaihda paikallisesti.', category: 'kirppis', icon: 'mdi:shopping', is_highlighted: false }
];

async function fetchCommunities() {
    try {
        if (window.LaukaaSupabase) {
            const { data, error } = await window.LaukaaSupabase
                .from('social_communities')
                .select('*')
                .order('is_highlighted', { ascending: false })
                .order('name', { ascending: true });

            if (error) {
                console.error('Supabase fetch error:', error);
                return mockCommunities; // Fallback
            }
            if (data && data.length > 0) {
                return data;
            }
        }
    } catch (e) {
        console.warn('Virhe haettaessa Supabasesta, käytetään mock-dataa:', e);
    }
    return mockCommunities;
}

const categoryStyles = {
    'kunnan viralliset': {
        cardBg: 'linear-gradient(135deg, #ffffff 0%, #f0f9ff 100%)',
        iconBg: 'linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%)',
        iconColor: '#0369a1',
        borderColor: '#bae6fd'
    },
    'yhdistykset': {
        cardBg: 'linear-gradient(135deg, #ffffff 0%, #f0fdf4 100%)',
        iconBg: 'linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)',
        iconColor: '#15803d',
        borderColor: '#bbf7d0'
    },
    'harrastukset': {
        cardBg: 'linear-gradient(135deg, #ffffff 0%, #fffbeb 100%)',
        iconBg: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
        iconColor: '#b45309',
        borderColor: '#fde68a'
    },
    'kirppis': {
        cardBg: 'linear-gradient(135deg, #ffffff 0%, #faf5ff 100%)',
        iconBg: 'linear-gradient(135deg, #f3e8ff 0%, #e9d5ff 100%)',
        iconColor: '#7e22ce',
        borderColor: '#e9d5ff'
    },
    'keskustelut': {
        cardBg: 'linear-gradient(135deg, #ffffff 0%, #fff5f5 100%)',
        iconBg: 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)',
        iconColor: '#b91c1c',
        borderColor: '#fecaca'
    },
    'somelinkit': {
        cardBg: 'linear-gradient(135deg, #ffffff 0%, #f5f3ff 100%)',
        iconBg: 'linear-gradient(135deg, #ede9fe 0%, #ddd6fe 100%)',
        iconColor: '#6d28d9',
        borderColor: '#ddd6fe'
    },
    'muut': {
        cardBg: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
        iconBg: '#f1f5f9',
        iconColor: '#475569',
        borderColor: '#e2e8f0'
    }
};

function parseCategory(categoryString) {
    if (!categoryString) return { parent: 'Muut', sub: null };
    const parts = categoryString.split(' / ');
    return {
        parent: parts[0].trim(),
        sub: parts.length > 1 ? parts.slice(1).join(' / ').trim() : null
    };
}

function createCommunityCard(community) {
    const card = document.createElement('a');
    card.href = community.url;
    card.target = '_blank';
    card.rel = 'noopener noreferrer';
    card.className = 'some-yhteiso-card';
    
    // Parse category
    const catParsed = parseCategory(community.category);
    const parentCat = catParsed.parent;
    const subCat = catParsed.sub;

    // Hae teemavärit, tai käytä defaultteja
    const catLower = parentCat.toLowerCase();
    const styleObj = categoryStyles[catLower] || {
        cardBg: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
        iconBg: '#f1f5f9',
        iconColor: '#475569',
        borderColor: '#e2e8f0'
    };
    
    // Asetetaan CSS-muuttujat korttiin
    card.style.setProperty('--card-bg', styleObj.cardBg);
    card.style.setProperty('--icon-bg', styleObj.iconBg);
    card.style.setProperty('--icon-color', styleObj.iconColor);
    card.style.setProperty('--border-color', styleObj.borderColor);

    const displayCategory = subCat ? `${parentCat} / ${subCat}` : parentCat;

    card.innerHTML = `
        <div class="some-yhteiso-card__icon-wrapper">
            <span class="iconify" data-icon="${normalizeIcon(community.icon || 'mdi:facebook')}"></span>
        </div>
        <div class="some-yhteiso-card__content">
            <span class="some-yhteiso-card__category">${escapeHtml(displayCategory)}</span>
            <h3 class="some-yhteiso-card__title">${escapeHtml(community.name)}</h3>
            <p class="some-yhteiso-card__desc">${escapeHtml(community.description || '')}</p>
        </div>
        <div class="some-yhteiso-card__arrow">
            <span class="iconify" data-icon="material-symbols-light:arrow-outward-rounded"></span>
        </div>
    `;
    return card;
}

/**
 * Normalisoi ikoninimi Iconify-yhteensopivaan muotoon.
 * Jos ikonissa ei ole prefiksiä (esim. "users"), lisätään "lucide:".
 * Jos prefiksi on jo olemassa (esim. "mdi:town-hall"), ei muuteta.
 */
function normalizeIcon(icon) {
    if (!icon) return 'lucide:link';
    // Jos sisältää jo kaksoispiste-erottimen (esim. "mdi:foo"), käytetään sellaisenaan
    if (icon.includes(':')) return icon;
    // Muunnostaulukko: tallennettu nimi → oikea Lucide-nimi
    const aliases = {
        'map-marker': 'map-pin',
        'map-marker-star': 'map-pin',
        'location': 'map-pin',
        'town-hall': 'landmark',
        'gamepad-variant': 'gamepad-2',
        'account-group': 'users',
        'shopping': 'shopping-bag',
        'campfire': 'flame',
        'dog': 'paw-print',
        'forum': 'message-circle',
        'trophy': 'trophy',
    };
    const resolved = aliases[icon] || icon;
    return `lucide:${resolved}`;
}


function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

async function renderHomepageCommunities() {
    const container = document.getElementById('some-yhteisot-grid');
    if (!container) return;

    const communities = await fetchCommunities();
    // Etusivulle vain 'highlighted' tai max 4 kpl
    const highlighted = communities.filter(c => c.is_highlighted).slice(0, 6);
    const displayList = highlighted.length > 0 ? highlighted : communities.slice(0, 4);

    container.innerHTML = '';
    displayList.forEach(comm => {
        container.appendChild(createCommunityCard(comm));
    });
}

async function renderAllCommunitiesPage() {
    const container = document.getElementById('all-communities-container');
    if (!container) return;

    container.innerHTML = '<p>Ladataan yhteisöjä...</p>';
    const communities = await fetchCommunities();
    
    // Group by parent and subcategory
    const grouped = {};
    communities.forEach(curr => {
        const parsed = parseCategory(curr.category);
        const parent = parsed.parent || 'Muut';
        const sub = parsed.sub || '_yleiset';
        
        if (!grouped[parent]) grouped[parent] = {};
        if (!grouped[parent][sub]) grouped[parent][sub] = [];
        grouped[parent][sub].push(curr);
    });

    container.innerHTML = '';

    const categoryOrder = ['kunnan viralliset', 'yhdistykset', 'harrastukset', 'kirppis', 'keskustelut'];

    // Sort parents
    const sortedParents = Object.keys(grouped).sort((a, b) => {
        let idxA = categoryOrder.indexOf(a.toLowerCase());
        let idxB = categoryOrder.indexOf(b.toLowerCase());
        if (idxA === -1) idxA = 999;
        if (idxB === -1) idxB = 999;
        return idxA - idxB;
    });

    // Create Filters UI
    const filtersWrapper = document.createElement('div');
    filtersWrapper.style.cssText = 'display: flex; flex-direction: column; gap: 1rem; margin-bottom: 2rem; align-items: center;';

    const filterContainer = document.createElement('div');
    filterContainer.className = 'some-yhteiso-filters';
    filterContainer.style.cssText = 'display: flex; gap: 0.5rem; flex-wrap: wrap; justify-content: center;';
    
    const subFilterContainer = document.createElement('div');
    subFilterContainer.className = 'some-yhteiso-subfilters';
    subFilterContainer.style.cssText = 'display: none; gap: 0.5rem; flex-wrap: wrap; justify-content: center; padding: 0.75rem 1rem; background: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; width: fit-content;';

    const allBtn = document.createElement('button');
    allBtn.textContent = 'Kaikki';
    allBtn.className = 'filter-btn active';
    allBtn.style.cssText = 'padding: 0.6rem 1.2rem; border-radius: 20px; border: none; background: var(--primary-blue, #0056b3); color: white; cursor: pointer; font-weight: bold; transition: all 0.2s; box-shadow: 0 2px 4px rgba(0,0,0,0.1);';
    allBtn.onclick = () => filterSections('Kaikki', allBtn);
    filterContainer.appendChild(allBtn);

    sortedParents.forEach(parent => {
        const btn = document.createElement('button');
        btn.textContent = parent;
        btn.className = 'filter-btn';
        btn.style.cssText = 'padding: 0.6rem 1.2rem; border-radius: 20px; border: 1px solid #cbd5e1; background: white; color: #475569; cursor: pointer; font-weight: 500; transition: all 0.2s;';
        btn.onclick = () => filterSections(parent, btn);
        filterContainer.appendChild(btn);
    });
    
    filtersWrapper.appendChild(filterContainer);
    filtersWrapper.appendChild(subFilterContainer);
    container.appendChild(filtersWrapper);

    const sectionsWrapper = document.createElement('div');
    sectionsWrapper.id = 'sections-wrapper';
    container.appendChild(sectionsWrapper);

    function filterSections(activeParent, activeBtn) {
        // Update button active states visually
        const btns = filterContainer.querySelectorAll('button');
        btns.forEach(b => {
            b.style.background = 'white';
            b.style.color = '#475569';
            b.style.border = '1px solid #cbd5e1';
            b.style.fontWeight = '500';
            b.style.boxShadow = 'none';
            b.classList.remove('active');
        });
        activeBtn.style.background = 'var(--primary-blue, #0056b3)';
        activeBtn.style.color = 'white';
        activeBtn.style.border = 'none';
        activeBtn.style.fontWeight = 'bold';
        activeBtn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
        activeBtn.classList.add('active');

        // Toggle visibility
        const sections = sectionsWrapper.querySelectorAll('.some-yhteiso-category-section');
        sections.forEach(sec => {
            if (activeParent === 'Kaikki' || sec.dataset.parent === activeParent) {
                sec.style.display = 'block';
                // Add a small fade-in animation
                sec.style.animation = 'fadeIn 0.3s ease-in-out';
                // Palauta kaikki alikategoriat näkyviin
                const subSecs = sec.querySelectorAll('.some-yhteiso-sub-section');
                subSecs.forEach(sub => sub.style.display = 'block');
            } else {
                sec.style.display = 'none';
            }
        });

        // Hallinnoi alikategoria-suodattimia
        if (activeParent === 'Kaikki') {
            subFilterContainer.style.display = 'none';
            subFilterContainer.innerHTML = '';
        } else {
            const subs = Object.keys(grouped[activeParent]).sort((a, b) => {
                if (a === '_yleiset') return -1;
                if (b === '_yleiset') return 1;
                return a.localeCompare(b);
            });

            if (subs.length > 1 || (subs.length === 1 && subs[0] !== '_yleiset')) {
                subFilterContainer.style.display = 'flex';
                subFilterContainer.innerHTML = '';

                const allSubBtn = document.createElement('button');
                allSubBtn.textContent = 'Kaikki';
                allSubBtn.className = 'filter-btn active';
                allSubBtn.style.cssText = 'padding: 0.4rem 1rem; font-size: 0.85rem; border-radius: 20px; border: none; background: #64748b; color: white; cursor: pointer; font-weight: bold; transition: all 0.2s;';
                allSubBtn.onclick = () => filterSubSections(activeParent, 'Kaikki', allSubBtn);
                subFilterContainer.appendChild(allSubBtn);

                subs.forEach(sub => {
                    const subName = sub === '_yleiset' ? 'Yleiset' : sub;
                    const subBtn = document.createElement('button');
                    subBtn.textContent = subName;
                    subBtn.className = 'filter-btn';
                    subBtn.style.cssText = 'padding: 0.4rem 1rem; font-size: 0.85rem; border-radius: 20px; border: 1px solid #cbd5e1; background: white; color: #475569; cursor: pointer; font-weight: 500; transition: all 0.2s;';
                    subBtn.onclick = () => filterSubSections(activeParent, sub, subBtn);
                    subFilterContainer.appendChild(subBtn);
                });
            } else {
                subFilterContainer.style.display = 'none';
                subFilterContainer.innerHTML = '';
            }
        }
    }

    function filterSubSections(parentName, activeSub, activeSubBtn) {
        // Update sub button styles
        const btns = subFilterContainer.querySelectorAll('button');
        btns.forEach(b => {
            b.style.background = 'white';
            b.style.color = '#475569';
            b.style.border = '1px solid #cbd5e1';
            b.style.fontWeight = '500';
            b.classList.remove('active');
        });
        activeSubBtn.style.background = '#64748b';
        activeSubBtn.style.color = 'white';
        activeSubBtn.style.border = 'none';
        activeSubBtn.style.fontWeight = 'bold';
        activeSubBtn.classList.add('active');

        // Filter sub-sections
        const section = sectionsWrapper.querySelector(`.some-yhteiso-category-section[data-parent="${parentName}"]`);
        if (section) {
            const subSecs = section.querySelectorAll('.some-yhteiso-sub-section');
            subSecs.forEach(subSec => {
                if (activeSub === 'Kaikki' || subSec.dataset.sub === activeSub) {
                    subSec.style.display = 'block';
                    subSec.style.animation = 'fadeIn 0.3s ease-in-out';
                } else {
                    subSec.style.display = 'none';
                }
            });
        }
    }

    // Generate content sections
    sortedParents.forEach(parent => {
        const catLower = parent.toLowerCase();
        const style = categoryStyles[catLower] || {
            cardBg: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
            iconBg: '#f1f5f9',
            iconColor: '#475569',
            borderColor: '#e2e8f0'
        };
        const catIcons = {
            'kunnan viralliset': 'mdi:town-hall',
            'yhdistykset': 'mdi:account-group',
            'harrastukset': 'mdi:trophy',
            'kirppis': 'mdi:shopping',
            'keskustelut': 'mdi:forum',
            'somelinkit': 'mdi:share-variant'
        };
        const catIcon = catIcons[catLower] || 'mdi:tag';

        const section = document.createElement('div');
        section.className = 'some-yhteiso-category-section';
        section.dataset.parent = parent;
        section.style.background = style.cardBg;
        section.style.borderColor = style.borderColor;
        section.style.marginBottom = '2rem';
        
        const heading = document.createElement('h2');
        heading.className = 'some-yhteiso-category-title';
        heading.style.color = style.iconColor;
        heading.innerHTML = `<span class="iconify" data-icon="${catIcon}" style="font-size:1.5rem; background:${style.iconBg}; padding:0.4rem; border-radius:10px;"></span> ${parent.charAt(0).toUpperCase() + parent.slice(1)}`;
        section.appendChild(heading);

        const subCategories = grouped[parent];
        const sortedSubs = Object.keys(subCategories).sort((a, b) => {
            if (a === '_yleiset') return -1;
            if (b === '_yleiset') return 1;
            return a.localeCompare(b);
        });

        sortedSubs.forEach(sub => {
            const subWrapper = document.createElement('div');
            subWrapper.className = 'some-yhteiso-sub-section';
            subWrapper.dataset.sub = sub;
            subWrapper.style.marginBottom = '1.5rem';

            if (sub !== '_yleiset') {
                const subTitle = document.createElement('h3');
                subTitle.textContent = sub;
                subTitle.style.fontSize = '1.2rem';
                subTitle.style.color = '#334155';
                subTitle.style.marginBottom = '1rem';
                subTitle.style.paddingBottom = '0.5rem';
                subTitle.style.borderBottom = '2px solid ' + style.borderColor;
                subTitle.style.display = 'inline-block';
                subWrapper.appendChild(subTitle);
            }

            const grid = document.createElement('div');
            grid.className = 'some-yhteisot-grid';
            
            subCategories[sub].forEach(comm => {
                grid.appendChild(createCommunityCard(comm));
            });

            subWrapper.appendChild(grid);
            section.appendChild(subWrapper);
        });

        sectionsWrapper.appendChild(section);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    renderHomepageCommunities();
    renderAllCommunitiesPage();
});
