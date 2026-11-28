/**
 * Laukaa some-yhteisöt (Facebook groups, pages, etc.)
 * Hakee dataa ensisijaisesti Supabasesta, ja käyttää mock-dataa varavaihtoehtona.
 */

// Mock data (fallback, jos Supabase-yhteys ei toimi)
const mockCommunities = [
    { name: 'Laukaan kunta', url: 'https://www.facebook.com/Laukaankunta', description: 'Kunnan virallinen tiedotuskanava, tapahtumat ja uutiset.', category: 'Viranomaiset ja julkiset palvelut / Laukaan kunta', icon: 'lucide:landmark', is_highlighted: true },
    { name: 'Visit Laukaa', url: 'https://www.facebook.com/visitlaukaa', description: 'Matkailutärpit, retkeily ja elämykset Laukaassa.', category: 'Tapahtumat ja kulttuuri / Visit Laukaa', icon: 'lucide:map-pin', is_highlighted: true },
    { name: 'Laukaan Koiraharrastajat ry', url: 'https://www.facebook.com/laukaankoiraharrastajat', description: 'Ajankohtaiset tapahtumat ja kilpailut koiraharrastajille.', category: 'Eläimet / Koirapuistot', icon: 'lucide:paw-print', is_highlighted: false },
    { name: 'Lievestuoreen Partio', url: 'https://www.facebook.com/lievestuoreenpartio', description: 'Partiotoimintaa ja erätaitoja lapsille ja nuorille.', category: 'Harrastukset ja yhdistykset / Partio', icon: 'lucide:flame', is_highlighted: false },
    { name: 'Laukaan asukkaat', url: 'https://www.facebook.com/groups/esimerkki1', description: 'Paikallinen keskustelu, vertaistuki ja naapuriapu.', category: 'Some ja paikallismedia / Paikalliset Facebook-ryhmät', icon: 'lucide:message-circle', is_highlighted: true }
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
    'viranomaiset ja julkiset palvelut': {
        cardBg: 'linear-gradient(135deg, #ffffff 0%, #f0f9ff 100%)',
        iconBg: 'linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%)',
        iconColor: '#0369a1',
        borderColor: '#bae6fd'
    },
    'tapahtumat ja kulttuuri': {
        cardBg: 'linear-gradient(135deg, #ffffff 0%, #fdf4ff 100%)',
        iconBg: 'linear-gradient(135deg, #fae8ff 0%, #f5d0fe 100%)',
        iconColor: '#a21caf',
        borderColor: '#f5d0fe'
    },
    'harrastukset ja yhdistykset': {
        cardBg: 'linear-gradient(135deg, #ffffff 0%, #f0fdf4 100%)',
        iconBg: 'linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)',
        iconColor: '#15803d',
        borderColor: '#bbf7d0'
    },
    'seurakunnat ja yhteisöt': {
        cardBg: 'linear-gradient(135deg, #ffffff 0%, #eef2ff 100%)',
        iconBg: 'linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%)',
        iconColor: '#4338ca',
        borderColor: '#c7d2fe'
    },
    'yritykset ja yrittäjät': {
        cardBg: 'linear-gradient(135deg, #ffffff 0%, #fffbeb 100%)',
        iconBg: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
        iconColor: '#b45309',
        borderColor: '#fde68a'
    },
    'hyvinvointi': {
        cardBg: 'linear-gradient(135deg, #ffffff 0%, #fff1f2 100%)',
        iconBg: 'linear-gradient(135deg, #ffe4e6 0%, #fecdd3 100%)',
        iconColor: '#be123c',
        borderColor: '#fecdd3'
    },
    'perheet': {
        cardBg: 'linear-gradient(135deg, #ffffff 0%, #f0fdfa 100%)',
        iconBg: 'linear-gradient(135deg, #ccfbf1 0%, #99f6e4 100%)',
        iconColor: '#0f766e',
        borderColor: '#99f6e4'
    },
    'eläimet': {
        cardBg: 'linear-gradient(135deg, #ffffff 0%, #fefce8 100%)',
        iconBg: 'linear-gradient(135deg, #fef9c3 0%, #fef08a 100%)',
        iconColor: '#a16207',
        borderColor: '#fef08a'
    },
    'luonto ja retkeily': {
        cardBg: 'linear-gradient(135deg, #ffffff 0%, #ecfdf5 100%)',
        iconBg: 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)',
        iconColor: '#047857',
        borderColor: '#a7f3d0'
    },
    'liikenne': {
        cardBg: 'linear-gradient(135deg, #ffffff 0%, #ecfeff 100%)',
        iconBg: 'linear-gradient(135deg, #cffafe 0%, #a5f3fc 100%)',
        iconColor: '#0e7490',
        borderColor: '#a5f3fc'
    },
    'some ja paikallismedia': {
        cardBg: 'linear-gradient(135deg, #ffffff 0%, #faf5ff 100%)',
        iconBg: 'linear-gradient(135deg, #f3e8ff 0%, #e9d5ff 100%)',
        iconColor: '#7e22ce',
        borderColor: '#e9d5ff'
    },
    'hyödylliset palvelut': {
        cardBg: 'linear-gradient(135deg, #ffffff 0%, #fef2f2 100%)',
        iconBg: 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)',
        iconColor: '#b91c1c',
        borderColor: '#fecaca'
    },
    'muut': {
        cardBg: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
        iconBg: '#f1f5f9',
        iconColor: '#475569',
        borderColor: '#e2e8f0'
    }
};

const catIcons = {
    'viranomaiset ja julkiset palvelut': 'lucide:landmark',
    'tapahtumat ja kulttuuri': 'lucide:calendar-days',
    'harrastukset ja yhdistykset': 'lucide:users',
    'seurakunnat ja yhteisöt': 'lucide:heart-handshake',
    'yritykset ja yrittäjät': 'lucide:briefcase',
    'hyvinvointi': 'lucide:heart',
    'perheet': 'lucide:smile',
    'eläimet': 'lucide:dog',
    'luonto ja retkeily': 'lucide:tree-pine',
    'liikenne': 'lucide:bus',
    'some ja paikallismedia': 'lucide:smartphone',
    'hyödylliset palvelut': 'lucide:life-buoy',
    'muut': 'lucide:link'
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
    const styleObj = categoryStyles[catLower] || categoryStyles['muut'];
    
    // Asetetaan CSS-muuttujat korttiin
    card.style.setProperty('--card-bg', styleObj.cardBg);
    card.style.setProperty('--icon-bg', styleObj.iconBg);
    card.style.setProperty('--icon-color', styleObj.iconColor);
    card.style.setProperty('--border-color', styleObj.borderColor);

    const displayCategory = subCat ? `${parentCat} / ${subCat}` : parentCat;

    card.innerHTML = `
        <div class="some-yhteiso-card__icon-wrapper">
            <span class="iconify" data-icon="${normalizeIcon(community.icon || 'lucide:link')}"></span>
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
 * Jos ikonissa ei ole prefiksiä, oletetaan se lucideksi.
 */
function normalizeIcon(icon) {
    if (!icon) return 'lucide:link';
    if (icon.includes(':')) return icon;
    
    // Yhteensopivuus vanhan järjestelmän kanssa
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

    container.innerHTML = '<p>Ladataan hakemistoa...</p>';
    const communities = await fetchCommunities();
    
    container.innerHTML = '';

    // 1. Suosituimmat -osio (is_highlighted === true)
    let highlighted = communities.filter(c => c.is_highlighted);
    
    // Shuffle array (Fisher-Yates) and take max 5
    for (let i = highlighted.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [highlighted[i], highlighted[j]] = [highlighted[j], highlighted[i]];
    }
    highlighted = highlighted.slice(0, 5);

    if (highlighted.length > 0) {
        const featSection = document.createElement('div');
        featSection.className = 'link-dir-featured';
        
        const featTitle = document.createElement('h2');
        featTitle.innerHTML = '<span class="iconify" data-icon="lucide:star" style="background:#fef3c7; padding:0.4rem; border-radius:10px;"></span> Suosituimmat';
        featSection.appendChild(featTitle);

        const featGrid = document.createElement('div');
        featGrid.className = 'some-yhteisot-grid';
        highlighted.forEach(comm => featGrid.appendChild(createCommunityCard(comm)));
        featSection.appendChild(featGrid);

        container.appendChild(featSection);
    }
    
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

    const categoryOrder = [
        'viranomaiset ja julkiset palvelut',
        'tapahtumat ja kulttuuri',
        'harrastukset ja yhdistykset',
        'seurakunnat ja yhteisöt',
        'yritykset ja yrittäjät',
        'hyvinvointi',
        'perheet',
        'eläimet',
        'luonto ja retkeily',
        'liikenne',
        'some ja paikallismedia',
        'hyödylliset palvelut',
        'muut'
    ];

    // Sort parents
    const sortedParents = Object.keys(grouped).sort((a, b) => {
        let idxA = categoryOrder.indexOf(a.toLowerCase());
        let idxB = categoryOrder.indexOf(b.toLowerCase());
        if (idxA === -1) idxA = 999;
        if (idxB === -1) idxB = 999;
        return idxA - idxB;
    });

    // Generate Accordion categories
    sortedParents.forEach((parent, pIndex) => {
        const catLower = parent.toLowerCase();
        const style = categoryStyles[catLower] || categoryStyles['muut'];
        const catIcon = catIcons[catLower] || 'lucide:link';

        const wrapper = document.createElement('div');
        wrapper.className = 'link-dir-category';
        // Avaa ensimmäinen kategoria automaattisesti, jos ei olla mobiilissa
        if (pIndex === 0 && window.innerWidth > 768) {
            wrapper.classList.add('active');
        }
        
        const header = document.createElement('div');
        header.className = 'link-dir-header';
        header.style.borderColor = style.borderColor;
        
        header.innerHTML = `
            <div class="link-dir-header-inner">
                <span class="iconify accordion-icon" data-icon="${catIcon}" style="color:${style.iconColor}; background:${style.iconBg}"></span>
                <span>${parent}</span>
            </div>
            <span class="iconify link-dir-arrow" data-icon="lucide:chevron-down"></span>
        `;
        
        const content = document.createElement('div');
        content.className = 'link-dir-content';

        const subCategories = grouped[parent];
        const sortedSubs = Object.keys(subCategories).sort((a, b) => {
            if (a === '_yleiset') return -1;
            if (b === '_yleiset') return 1;
            return a.localeCompare(b);
        });

        sortedSubs.forEach(sub => {
            if (sub !== '_yleiset') {
                const subTitle = document.createElement('h3');
                subTitle.className = 'link-dir-sub';
                subTitle.textContent = sub;
                subTitle.style.borderBottom = '2px solid ' + style.borderColor;
                content.appendChild(subTitle);
            }

            const grid = document.createElement('div');
            grid.className = 'some-yhteisot-grid';
            
            subCategories[sub].forEach(comm => {
                grid.appendChild(createCommunityCard(comm));
            });

            content.appendChild(grid);
        });

        // Add toggle functionality
        header.addEventListener('click', () => {
            wrapper.classList.toggle('active');
        });

        wrapper.appendChild(header);
        wrapper.appendChild(content);
        container.appendChild(wrapper);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    renderHomepageCommunities();
    renderAllCommunitiesPage();
});
