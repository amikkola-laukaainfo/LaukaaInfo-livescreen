const fs = require('fs');

let html = fs.readFileSync('index.html', 'utf8');

const mapping = {
    'haat': `
        <select class="premium-select" style="width: 100%; margin-bottom: 0.5rem; font-size: 0.85rem; padding: 0.4rem; border-color: rgba(0,0,0,0.1);" onchange="updateNeedLink(this, 'haat')">
            <option value="">Tarkenna tarvetta...</option>
            <option value="is_lakeside">Juhlatila järven rannalla</option>
            <option value="video_production">Häävideokuvaus & Digitointi</option>
            <option value="alcohol_license">Anniskeluoikeudet</option>
        </select>`,
    'yritysjuhlat': `
        <select class="premium-select" style="width: 100%; margin-bottom: 0.5rem; font-size: 0.85rem; padding: 0.4rem; border-color: rgba(0,0,0,0.1);" onchange="updateNeedLink(this, 'yritysjuhlat')">
            <option value="">Tarkenna tarvetta...</option>
            <option value="corporate_wellbeing_services">TYKY- ja hyvinvointipalvelut</option>
            <option value="has_sauna">Saunatilat saatavilla</option>
        </select>`,
    'yritystilaisuudet': `
        <select class="premium-select" style="width: 100%; margin-bottom: 0.5rem; font-size: 0.85rem; padding: 0.4rem; border-color: rgba(0,0,0,0.1);" onchange="updateNeedLink(this, 'yritystilaisuudet')">
            <option value="">Tarkenna tarvetta...</option>
            <option value="has_streaming">Striimaus & Hybridituki</option>
            <option value="is_accessible">Esteetön pääsy</option>
        </select>`,
    'muutto': `
        <select class="premium-select" style="width: 100%; margin-bottom: 0.5rem; font-size: 0.85rem; padding: 0.4rem; border-color: rgba(0,0,0,0.1);" onchange="updateNeedLink(this, 'muutto')">
            <option value="">Tarkenna tarvetta...</option>
            <option value="weekend_moves">Viikonloppumuutot</option>
            <option value="digitization_features">Arkiston digitointi</option>
            <option value="packing_service">Pakkauspalvelu</option>
        </select>`,
    'remontti': `
        <select class="premium-select" style="width: 100%; margin-bottom: 0.5rem; font-size: 0.85rem; padding: 0.4rem; border-color: rgba(0,0,0,0.1);" onchange="updateNeedLink(this, 'remontti')">
            <option value="">Tarkenna tarvetta...</option>
            <option value="emergency_service">Päivystys / Hätäpalvelu</option>
            <option value="wet_room_certification">Kosteiden tilojen sertifikaatti</option>
        </select>`,
    'mokkipalvelut': `
        <select class="premium-select" style="width: 100%; margin-bottom: 0.5rem; font-size: 0.85rem; padding: 0.4rem; border-color: rgba(0,0,0,0.1);" onchange="updateNeedLink(this, 'mokkipalvelut')">
            <option value="">Tarkenna tarvetta...</option>
            <option value="key_holding">Avainpalvelu / Valvonta</option>
            <option value="sauna_services">Saunapalvelut & Wellness</option>
        </select>`,
    'taloyhtion-huolto': `
        <select class="premium-select" style="width: 100%; margin-bottom: 0.5rem; font-size: 0.85rem; padding: 0.4rem; border-color: rgba(0,0,0,0.1);" onchange="updateNeedLink(this, 'taloyhtion-huolto')">
            <option value="">Tarkenna tarvetta...</option>
            <option value="maintenance_contracts">Jatkuvat huoltosopimukset</option>
            <option value="emergency_response">24/7 Päivystys</option>
        </select>`,
    'paivystavat-palvelut': `
        <select class="premium-select" style="width: 100%; margin-bottom: 0.5rem; font-size: 0.85rem; padding: 0.4rem; border-color: rgba(0,0,0,0.1);" onchange="updateNeedLink(this, 'paivystavat-palvelut')">
            <option value="">Tarkenna tarvetta...</option>
            <option value="emergency_available">Hinaus ja tiepalvelu</option>
            <option value="emergency_service">LVI- ja sähköpäivystys</option>
        </select>`,
    'terveys-ja-hyvinvointi': `
        <select class="premium-select" style="width: 100%; margin-bottom: 0.5rem; font-size: 0.85rem; padding: 0.4rem; border-color: rgba(0,0,0,0.1);" onchange="updateNeedLink(this, 'terveys-ja-hyvinvointi')">
            <option value="">Tarkenna tarvetta...</option>
            <option value="home_visits">Kotikäynnit ja hoiva</option>
            <option value="online_booking">Sähköinen ajanvaraus</option>
        </select>`
};

const defaultMapping = (id) => `
        <select class="premium-select" style="width: 100%; margin-bottom: 0.5rem; font-size: 0.85rem; padding: 0.4rem; border-color: rgba(0,0,0,0.1);" onchange="updateNeedLink(this, '${id}')">
            <option value="">Tarkenna tarvetta...</option>
            <option value="home_service">Kotiinkuljetus / Kotikäynti</option>
            <option value="weekend_service">Palvelua viikonloppuisin</option>
        </select>`;

let updatedHtml = html.replace(/<a href="palvelu\.html\?id=([\w-]+)" class="need-card">([\s\S]*?)<div class="arrow">(.*?)<\/div>\s*<\/a>/g, (match, id, content, arrowText) => {
    
    let selectHtml = mapping[id] || defaultMapping(id);

    return `<div class="need-card" style="position: relative;">${content}
    <div class="need-refinement" style="margin-top: auto; padding-top: 1rem; width: 100%;">
${selectHtml}
    </div>
    <a href="palvelu.html?id=${id}" id="link-${id}" class="arrow" style="display: block; text-align: center; text-decoration: none; padding: 0.6rem; border-radius: 8px; margin-top: 0.5rem; background: var(--primary-blue); color: white; font-weight: 600; opacity: 1; transform: none; box-shadow: 0 4px 10px rgba(0,86,179,0.2);">${arrowText}</a>
</div>`;
});

// Add the script
if (!updatedHtml.includes('function updateNeedLink')) {
    updatedHtml = updatedHtml.replace('</body>', `
    <script>
        function updateNeedLink(selectEl, id) {
            const link = document.getElementById('link-' + id);
            const val = selectEl.value;
            if (val) {
                link.href = 'palvelu.html?id=' + id + '&filter_profiling=' + val;
            } else {
                link.href = 'palvelu.html?id=' + id;
            }
        }
    </script>
</body>`);
}

fs.writeFileSync('index.html', updatedHtml);
console.log('Done replacing!');
