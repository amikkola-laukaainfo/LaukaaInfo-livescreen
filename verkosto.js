document.addEventListener('DOMContentLoaded', () => {
    const verkostoContainer = document.getElementById('palveluverkosto-suositukset');
    if (!verkostoContainer) return;

    // Ladataan oletuksena arvottu tagi (käytetään oikeita tageja joilla on osumia)
    const defaultTags = ['ravintola', 'hieronta', 'autokorjaamot'];
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
            <h2 style="color: #0a2540; margin-bottom: 0.5rem;"><span class="iconify" data-icon="material-symbols-light:handshake-outline"></span> Palveluverkoston suositukset: ${verkosto.otsikko}</h2>
            <p style="color: #4a5568;">Saattaisit olla kiinnostunut myös näistä paikallisista toimijoista ja mahdollisuuksista.</p>
        </div>
        <div class="verkosto-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1.5rem;">
    `;

    // Yritykset
    if (verkosto.yritykset && verkosto.yritykset.length > 0) {
        const searchUrl = `koko-laukaa.html?tag=${encodeURIComponent(tagi)}`;
        html += `<div class="verkosto-kategoria" style="background: white; padding: 1.5rem; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
            <h3 style="color: #0056b3; margin-bottom: 1rem; font-size: 1.2rem;"><span class="iconify" data-icon="material-symbols-light:domain"></span> Yritykset</h3>
            <ul style="list-style: none; padding: 0; margin: 0;">`;
        verkosto.yritykset.forEach(id => {
            const ent = entities[id];
            if (!ent) return;
            const slug = ent.id ? ent.id.replace('yritys_', '') : '';
            const cardUrl = ent.slug ? `yrityskortti.html?id=${ent.slug}` : `koko-laukaa.html?tag=${encodeURIComponent(tagi)}`;
            html += `<li style="margin-bottom: 0.5rem; border-bottom: 1px solid #eee; padding-bottom: 0.5rem;">
                <a href="${cardUrl}" style="font-weight:bold; color:#0056b3; text-decoration:none;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">${ent.nimi}</a>
                <br><small style="color: #666;">${ent.kuvaus || ''}</small>
            </li>`;
        });
        html += `</ul>
            <a href="${searchUrl}" style="display:inline-block; margin-top:1rem; background:#0056b3; color:white; padding:0.5rem 1rem; border-radius:8px; text-decoration:none; font-size:0.85rem; font-weight:600; transition:opacity 0.2s;" onmouseover="this.style.opacity='0.85'" onmouseout="this.style.opacity='1'">
                <span class="iconify" data-icon="material-symbols-light:search"></span> Katso kaikki aiheesta "${verkosto.otsikko}" →
            </a>
        </div>`;
    }

    // Tarjoaa apua
    if (verkosto.tarjoan_apua && verkosto.tarjoan_apua.length > 0) {
        html += `<div class="verkosto-kategoria" style="background: white; padding: 1.5rem; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
            <h3 style="color: #28a745; margin-bottom: 1rem; font-size: 1.2rem;"><span class="iconify" data-icon="material-symbols-light:handshake-outline"></span> Tarjoaa apua</h3>
            <ul style="list-style: none; padding: 0; margin: 0;">`;
        verkosto.tarjoan_apua.forEach(id => {
            const ent = entities[id];
            if (ent) html += `<li style="margin-bottom: 0.5rem; border-bottom: 1px solid #eee; padding-bottom: 0.5rem;"><a href="ilmoitukset.html?search=${encodeURIComponent(ent.otsikko)}" style="text-decoration:none; color:inherit; display:block; transition:color 0.2s;" onmouseover="this.style.color='#0056b3';" onmouseout="this.style.color='inherit';"><strong>${ent.otsikko}</strong></a></li>`;
        });
        html += `</ul></div>`;
    }

    // Harrastukset ja ryhmät
    if (verkosto.harrastukset && verkosto.harrastukset.length > 0) {
        html += `<div class="verkosto-kategoria" style="background: white; padding: 1.5rem; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
            <h3 style="color: #ffc107; margin-bottom: 1rem; font-size: 1.2rem;"><span class="iconify" data-icon="material-symbols-light:groups-outline"></span> Harrastusryhmät</h3>
            <ul style="list-style: none; padding: 0; margin: 0;">`;
        verkosto.harrastukset.forEach(id => {
            const ent = entities[id];
            if (ent) html += `<li style="margin-bottom: 0.5rem; border-bottom: 1px solid #eee; padding-bottom: 0.5rem;"><a href="ilmoitukset.html?search=${encodeURIComponent(ent.otsikko)}" style="text-decoration:none; color:inherit; display:block; transition:color 0.2s;" onmouseover="this.style.color='#0056b3';" onmouseout="this.style.color='inherit';"><strong>${ent.otsikko}</strong><br><small style="color: #666;">Kiinnostuneita: ${ent.kiinnostuneet || 0}</small></a></li>`;
        });
        html += `</ul></div>`;
    }

    // Projektit
    if (verkosto.projektit && verkosto.projektit.length > 0) {
        html += `<div class="verkosto-kategoria" style="background: white; padding: 1.5rem; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
            <h3 style="color: #dc3545; margin-bottom: 1rem; font-size: 1.2rem;"><span class="iconify" data-icon="material-symbols-light:rocket-launch-outline"></span> Projektit</h3>
            <ul style="list-style: none; padding: 0; margin: 0;">`;
        verkosto.projektit.forEach(id => {
            const ent = entities[id];
            if (ent) html += `<li style="margin-bottom: 0.5rem; border-bottom: 1px solid #eee; padding-bottom: 0.5rem;"><a href="ilmoitukset.html?search=${encodeURIComponent(ent.otsikko)}" style="text-decoration:none; color:inherit; display:block; transition:color 0.2s;" onmouseover="this.style.color='#0056b3';" onmouseout="this.style.color='inherit';"><strong>${ent.otsikko}</strong></a></li>`;
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

    // Haetaan samalla pikakatsaus ilmoituksista tälle tagille
    renderPikakatsaus(tagi);
};

// --- PIKAKATSAUS: Näytetään 3 uusinta ilmoitusta ko. tagista ---
function renderPikakatsaus(tagi) {
    const box = document.getElementById('ilm-pikakatsaus');
    if (!box) return;

    box.style.display = 'block';
    box.innerHTML = '<p style="color:#64748b; font-size:0.9rem;">⏳ Haetaan ilmoituksia...</p>';

    fetch('https://mediazoo.fi/laukaainfo-web/ilmoitukset-api.php?action=list')
        .then(r => r.json())
        .then(data => {
            if (data.status !== 'success') { box.style.display = 'none'; return; }

            const kaikki = data.ilmoitukset || [];
            // Suodatetaan tagin mukaan
            const filtered = kaikki.filter(ilm =>
                (ilm.tagit || []).includes(tagi) ||
                (ilm.category || '') === tagi ||
                (ilm.subCategory || '') === tagi
            ).slice(0, 3); // Max 3

            if (filtered.length === 0) {
                box.style.display = 'none';
                return;
            }

            const INTENT_EMOJI = {
                tarvitsen_apua: '<span class="iconify" data-icon="material-symbols-light:handshake-outline"></span>', tarjoan_apua: '<span class="iconify" data-icon="material-symbols-light:build-outline"></span>', etsin_seuraa: '<span class="iconify" data-icon="material-symbols-light:groups-outline"></span>',
                perustetaan_projekti: '<span class="iconify" data-icon="material-symbols-light:rocket-launch-outline"></span>', tarjoan: '<span class="iconify" data-icon="material-symbols-light:build-outline"></span>', tarvitsen: '<span class="iconify" data-icon="material-symbols-light:handshake-outline"></span>'
            };

            let html = `
                <div style="background: white; border: 1.5px solid #bae6fd; border-radius: 16px; padding: 1.5rem; box-shadow: 0 4px 15px rgba(0,86,179,0.06);">
                    <h4 style="color:#0369a1; margin: 0 0 1rem; font-size: 1rem;">
                        📋 Viimeisimmät ilmoitukset aiheesta "<strong>${escHtml(tagLabel(tagi))}</strong>"
                    </h4>
                    <div style="display: flex; flex-direction: column; gap: 0.75rem;">`;

            filtered.forEach(ilm => {
                const emoji = INTENT_EMOJI[ilm.intent || ilm.tyyppi] || '<span class="iconify" data-icon="material-symbols-light:push-pin-outline"></span>';
                const date = ilm.paivays ? ilm.paivays.substring(0, 10) : '';
                const searchParam = encodeURIComponent(ilm.otsikko || '');
                html += `
                    <a href="ilmoitukset.html?tag=${encodeURIComponent(tagi)}&search=${searchParam}" style="text-decoration:none; color:inherit; display:block; transition: transform 0.2s, box-shadow 0.2s;" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(0,86,179,0.1)';" onmouseout="this.style.transform='none'; this.style.boxShadow='none';">
                        <div style="display: flex; gap: 0.75rem; padding: 0.75rem; background: #f8faff; border-radius: 10px; border: 1px solid #e2e8f0; cursor: pointer;">
                            <span style="font-size:1.4rem; flex-shrink:0;">${emoji}</span>
                            <div>
                                <div style="font-weight:600; color:#1a1a2e; font-size:0.95rem;">${escHtml(ilm.otsikko || 'Ilmoitus')}</div>
                                <div style="color:#64748b; font-size:0.8rem; margin-top:0.2rem;">${escHtml(ilm.nimi || '')}${date ? ' · ' + date : ''}</div>
                            </div>
                        </div>
                    </a>`;
            });

            html += `</div>
                    <div style="text-align:right; margin-top:1rem;">
                        <a href="ilmoitukset.html?tag=${encodeURIComponent(tagi)}"
                           style="color:#0056b3; font-weight:600; font-size:0.9rem; text-decoration:none;">
                           Näytä kaikki ${tagi}-ilmoitukset →
                        </a>
                    </div>
                </div>`;

            box.innerHTML = html;
        })
        .catch(() => { box.style.display = 'none'; });
}

function escHtml(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function tagLabel(tag) {
    return (tag || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

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
                        'tietokoneet': '<span class="iconify" data-icon="material-symbols-light:computer-outline"></span>',
                        'piha': '<span class="iconify" data-icon="material-symbols-light:yard-outline"></span>',
                        'rakentaminen': '<span class="iconify" data-icon="material-symbols-light:architecture"></span>',
                        'kuljetus': '<span class="iconify" data-icon="material-symbols-light:directions-car-outline"></span>',
                        'seniorit': '<span class="iconify" data-icon="material-symbols-light:elderly"></span>',
                        'tapahtumat': '<span class="iconify" data-icon="material-symbols-light:celebration"></span>',
                        'musiikki': '<span class="iconify" data-icon="material-symbols-light:music-note"></span>',
                        'muu': '<span class="iconify" data-icon="material-symbols-light:push-pin-outline"></span>',
                        // Uudet wizard-taksonomiakategoriat
                        'digitaaliset': '<span class="iconify" data-icon="material-symbols-light:computer-outline"></span>',
                        'kodinhoito': '<span class="iconify" data-icon="material-symbols-light:home-outline"></span>',
                        'piha_puutarha': '<span class="iconify" data-icon="material-symbols-light:yard-outline"></span>',
                        'rakentaminen_remontointi': '<span class="iconify" data-icon="material-symbols-light:architecture"></span>',
                        'liikenne': '<span class="iconify" data-icon="material-symbols-light:directions-car-outline"></span>',
                        'seniorit': '<span class="iconify" data-icon="material-symbols-light:elderly"></span>',
                        'lapset': '<span class="iconify" data-icon="material-symbols-light:child-care"></span>',
                        'oppiminen': '<span class="iconify" data-icon="material-symbols-light:menu-book-outline"></span>',
                        'musiikki_wizard': '<span class="iconify" data-icon="material-symbols-light:music-note"></span>',
                        'valokuvaus': '<span class="iconify" data-icon="material-symbols-light:photo-camera-outline"></span>',
                        'liikunta': '<span class="iconify" data-icon="material-symbols-light:exercise"></span>',
                        'luonto': '<span class="iconify" data-icon="material-symbols-light:eco-outline"></span>',
                        'yhdistys': '<span class="iconify" data-icon="material-symbols-light:handshake-outline"></span>',
                        'yrittajyys': '<span class="iconify" data-icon="material-symbols-light:business-center-outline"></span>',
                    };

                    // Luettava nimi tagista (poista alaviivat, iso alkukirjain)
                    function tagLabel(tag) {
                        return tag.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                    }

                    tagNames.forEach(tag => {
                        const count = tags[tag];
                        const emoji = emojis[tag] || '<span class="iconify" data-icon="material-symbols-light:push-pin-outline"></span>';
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
