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
    }
};

function createCommunityCard(community) {
    const card = document.createElement('a');
    card.href = community.url;
    card.target = '_blank';
    card.rel = 'noopener noreferrer';
    card.className = 'some-yhteiso-card';
    
    // Hae teemavärit, tai käytä defaultteja
    const catLower = (community.category || '').toLowerCase();
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

    card.innerHTML = `
        <div class="some-yhteiso-card__icon-wrapper">
            <span class="iconify" data-icon="${community.icon || 'mdi:facebook'}"></span>
        </div>
        <div class="some-yhteiso-card__content">
            <span class="some-yhteiso-card__category">${escapeHtml(community.category)}</span>
            <h3 class="some-yhteiso-card__title">${escapeHtml(community.name)}</h3>
            <p class="some-yhteiso-card__desc">${escapeHtml(community.description || '')}</p>
        </div>
        <div class="some-yhteiso-card__arrow">
            <span class="iconify" data-icon="material-symbols-light:arrow-outward-rounded"></span>
        </div>
    `;
    return card;
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
    
    // Group by category
    const grouped = communities.reduce((acc, curr) => {
        const cat = curr.category || 'Muut';
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(curr);
        return acc;
    }, {});

    container.innerHTML = '';

    const categoryOrder = ['kunnan viralliset', 'yhdistykset', 'harrastukset', 'kirppis', 'keskustelut'];

    // Järjestä kategoriat, tutut ensin ja sitten muut
    const sortedCategories = Object.keys(grouped).sort((a, b) => {
        let idxA = categoryOrder.indexOf(a.toLowerCase());
        let idxB = categoryOrder.indexOf(b.toLowerCase());
        if (idxA === -1) idxA = 999;
        if (idxB === -1) idxB = 999;
        return idxA - idxB;
    });

    sortedCategories.forEach(cat => {
        const catLower = cat.toLowerCase();
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
            'keskustelut': 'mdi:forum'
        };
        const catIcon = catIcons[catLower] || 'mdi:tag';

        const section = document.createElement('div');
        section.className = 'some-yhteiso-category-section';
        section.style.background = style.cardBg;
        section.style.borderColor = style.borderColor;
        
        const heading = document.createElement('h2');
        heading.className = 'some-yhteiso-category-title';
        heading.style.color = style.iconColor;
        heading.innerHTML = `<span class="iconify" data-icon="${catIcon}" style="font-size:1.5rem; background:${style.iconBg}; padding:0.4rem; border-radius:10px;"></span> ${cat.charAt(0).toUpperCase() + cat.slice(1)}`;
        section.appendChild(heading);

        const grid = document.createElement('div');
        grid.className = 'some-yhteisot-grid';
        
        grouped[cat].forEach(comm => {
            grid.appendChild(createCommunityCard(comm));
        });

        section.appendChild(grid);
        container.appendChild(section);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    renderHomepageCommunities();
    renderAllCommunitiesPage();
});
