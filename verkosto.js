document.addEventListener('DOMContentLoaded', () => {
    const verkostoContainer = document.getElementById('palveluverkosto-suositukset');
    if (!verkostoContainer) return;

    // Ladataan oletuksena arvottu tagi
    const defaultTags = ['tietokoneet', 'rakentaminen', 'musiikki'];
    const randomTag = defaultTags[Math.floor(Math.random() * defaultTags.length)];
    renderVerkostoData(randomTag);
});

function renderVerkosto(data, tagi, container) {
    // API palauttaa tagin datan "verkosto"-avaimen alla ja kaikki tagit "kaikki_tagit" alla.
    const verkosto = data.verkosto[tagi];
    if (!verkosto) return;

    const entities = data.entities;

    let html = `
        <div class="verkosto-header" style="text-align: center; margin-bottom: 2rem;">
            <h2 style="color: #0a2540; margin-bottom: 0.5rem;">🧠 Palveluverkoston suositukset: ${verkosto.otsikko}</h2>
            <p style="color: #4a5568;">Saattaisit olla kiinnostunut myös näistä paikallisista toimijoista ja mahdollisuuksista.</p>
        </div>
        <div class="verkosto-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1.5rem;">
    `;

    // Yritykset
    if (verkosto.yritykset && verkosto.yritykset.length > 0) {
        html += `<div class="verkosto-kategoria" style="background: white; padding: 1.5rem; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
            <h3 style="color: #0056b3; margin-bottom: 1rem; font-size: 1.2rem;">🏢 Yritykset</h3>
            <ul style="list-style: none; padding: 0; margin: 0;">`;
        verkosto.yritykset.forEach(id => {
            const ent = entities[id];
            if (ent) html += `<li style="margin-bottom: 0.5rem; border-bottom: 1px solid #eee; padding-bottom: 0.5rem;"><strong>${ent.nimi}</strong><br><small style="color: #666;">${ent.kuvaus}</small></li>`;
        });
        html += `</ul></div>`;
    }

    // Tarjoaa apua
    if (verkosto.tarjoan_apua && verkosto.tarjoan_apua.length > 0) {
        html += `<div class="verkosto-kategoria" style="background: white; padding: 1.5rem; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
            <h3 style="color: #28a745; margin-bottom: 1rem; font-size: 1.2rem;">🤝 Tarjoaa apua</h3>
            <ul style="list-style: none; padding: 0; margin: 0;">`;
        verkosto.tarjoan_apua.forEach(id => {
            const ent = entities[id];
            if (ent) html += `<li style="margin-bottom: 0.5rem; border-bottom: 1px solid #eee; padding-bottom: 0.5rem;"><strong>${ent.otsikko}</strong></li>`;
        });
        html += `</ul></div>`;
    }

    // Harrastukset ja ryhmät
    if (verkosto.harrastukset && verkosto.harrastukset.length > 0) {
        html += `<div class="verkosto-kategoria" style="background: white; padding: 1.5rem; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
            <h3 style="color: #ffc107; margin-bottom: 1rem; font-size: 1.2rem;">👥 Harrastusryhmät</h3>
            <ul style="list-style: none; padding: 0; margin: 0;">`;
        verkosto.harrastukset.forEach(id => {
            const ent = entities[id];
            if (ent) html += `<li style="margin-bottom: 0.5rem; border-bottom: 1px solid #eee; padding-bottom: 0.5rem;"><strong>${ent.otsikko}</strong><br><small style="color: #666;">Kiinnostuneita: ${ent.kiinnostuneet || 0}</small></li>`;
        });
        html += `</ul></div>`;
    }

    // Projektit
    if (verkosto.projektit && verkosto.projektit.length > 0) {
        html += `<div class="verkosto-kategoria" style="background: white; padding: 1.5rem; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
            <h3 style="color: #dc3545; margin-bottom: 1rem; font-size: 1.2rem;">🚀 Projektit</h3>
            <ul style="list-style: none; padding: 0; margin: 0;">`;
        verkosto.projektit.forEach(id => {
            const ent = entities[id];
            if (ent) html += `<li style="margin-bottom: 0.5rem; border-bottom: 1px solid #eee; padding-bottom: 0.5rem;"><strong>${ent.otsikko}</strong></li>`;
        });
        html += `</ul></div>`;
    }

    html += `</div>`;

    // Tagin valinta -painikkeet
    html += `<div style="text-align: center; margin-top: 2rem;">
        <p style="color: #666; font-size: 0.9rem; margin-bottom: 0.5rem;">Kokeile muita suositusteemoja:</p>
        <div style="display: flex; justify-content: center; gap: 0.5rem; flex-wrap: wrap;">`;

    if (data.kaikki_tagit) {
        Object.keys(data.kaikki_tagit).forEach(t => {
            html += `<button onclick="renderVerkostoData('${t}')" style="background: ${t === tagi ? '#0056b3' : '#e2e8f0'}; color: ${t === tagi ? 'white' : '#333'}; border: none; padding: 0.5rem 1rem; border-radius: 20px; cursor: pointer; font-family: inherit;">${data.kaikki_tagit[t].otsikko}</button>`;
        });
    }

    html += `</div></div>`;

    container.innerHTML = html;
}

// Globaali apufunktio nappeja varten
window.renderVerkostoData = function(tagi) {
    const url = 'https://mediazoo.fi/laukaainfo-web/suosittelija.php?tag=' + encodeURIComponent(tagi);

    fetch(url)
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                const verkostoContainer = document.getElementById('palveluverkosto-suositukset');
                renderVerkosto(data, tagi, verkostoContainer);
            } else {
                console.error('API palautti virheen:', data.message);
            }
        })
        .catch(err => console.error('Virhe ladattaessa palveluverkoston dataa:', err));
};

// --- SANAPILVI LOGIIKKA (Ilmoitukset API) ---
function renderSanapilvi() {
    const container = document.getElementById('sanapilvi-tags');
    const wrapper = document.getElementById('sanapilvi-container');
    if (!container || !wrapper) return;

    fetch('https://mediazoo.fi/laukaainfo-web/ilmoitukset-api.php?action=list')
        .then(res => res.json())
        .then(data => {
            if (data.status === 'success' && data.sanapilvi) {
                const tags = data.sanapilvi;
                const tagNames = Object.keys(tags);

                if (tagNames.length > 0) {
                    wrapper.style.display = 'block';
                    let html = '';

                    const emojis = {
                        // Vanhat tagit (taaksepäin yhteensopivuus)
                        'tietokoneet': '💻',
                        'piha': '🌳',
                        'rakentaminen': '🔨',
                        'kuljetus': '🚗',
                        'seniorit': '👵',
                        'tapahtumat': '🎉',
                        'musiikki': '🎵',
                        'muu': '📌',
                        // Uudet wizard-taksonomiakategoriat
                        'digitaaliset': '💻',
                        'kodinhoito': '🏠',
                        'piha_puutarha': '🌳',
                        'rakentaminen_remontointi': '🛠',
                        'liikenne': '🚗',
                        'seniorit': '👵',
                        'lapset': '👶',
                        'oppiminen': '📚',
                        'musiikki_wizard': '🎵',
                        'valokuvaus': '📷',
                        'liikunta': '🏃',
                        'luonto': '🌱',
                        'yhdistys': '🤝',
                        'yrittajyys': '💼',
                    };

                    // Luettava nimi tagista (poista alaviivat, iso alkukirjain)
                    function tagLabel(tag) {
                        return tag.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                    }

                    tagNames.forEach(tag => {
                        const count = tags[tag];
                        const emoji = emojis[tag] || '📌';
                        const fontSize = Math.min(1.5, 0.9 + (count * 0.1));

                        html += `<button onclick="renderVerkostoData('${tag}')"
                            style="background: #e2e8f0; border: none; padding: 0.4rem 0.8rem; border-radius: 20px;
                            cursor: pointer; font-size: ${fontSize}rem; transition: background 0.2s; font-family: inherit;">
                            ${emoji} ${tagLabel(tag)} <span style="opacity: 0.6; font-size: 0.8em;">(${count})</span>
                        </button>`;
                    });

                    container.innerHTML = html;
                }
            }
        })
        .catch(err => console.error('Virhe sanapilven latauksessa:', err));
}

// Käynnistetään sanapilvi heti sivun ladattua
document.addEventListener('DOMContentLoaded', renderSanapilvi);
