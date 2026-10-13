let wizardTaxonomy = null;
let currentSelection = {
    intent: null,
    category: null,
    subCategory: null,
    action: null
};

document.addEventListener('DOMContentLoaded', async () => {
    const container = document.getElementById('wizard-container');
    if (!container) return; // Varmistetaan että ollaan oikealla sivulla

    try {
        const res = await fetch('taxonomy.json');
        const data = await res.json();
        if (data && data.wizard) {
            wizardTaxonomy = data.wizard;
            renderStep1();
        } else {
            container.innerHTML = '<p style="color:red;">Virhe: Taksonomiaa ei löytynyt.</p>';
        }
    } catch (e) {
        console.error("Virhe ladattaessa taxonomy.json:", e);
        container.innerHTML = '<p style="color:red;">Virhe ladattaessa lomaketta. Yritä päivittää sivu.</p>';
    }
});

function renderStep1() {
    const container = document.getElementById('wizard-container');
    
    let html = `
        <div class="wizard-step fade-in">
            <h3 class="wizard-title">Vaihe 1: Mitä haluat tehdä?</h3>
            <div class="wizard-grid">
    `;

    for (const key in wizardTaxonomy.intents) {
        const intent = wizardTaxonomy.intents[key];
        html += `<button class="wizard-card-btn" onclick="selectIntent('${key}')">
            ${intent.title}
        </button>`;
    }

    html += `</div></div>`;
    container.innerHTML = html;
}

window.selectIntent = function(intentKey) {
    currentSelection.intent = intentKey;
    renderStep2();
};

function renderStep2() {
    const container = document.getElementById('wizard-container');
    
    let html = `
        <div class="wizard-step slide-left">
            <button class="wizard-back-btn" onclick="renderStep1()">← Takaisin</button>
            <h3 class="wizard-title">Vaihe 2: Mihin aihealueeseen liittyy?</h3>
            <div class="wizard-grid">
    `;

    for (const key in wizardTaxonomy.categories) {
        const cat = wizardTaxonomy.categories[key];
        html += `<button class="wizard-card-btn" onclick="selectCategory('${key}')">
            ${cat.title}
        </button>`;
    }

    html += `</div></div>`;
    container.innerHTML = html;
}

window.selectCategory = function(catKey) {
    currentSelection.category = catKey;
    // Tarkistetaan onko tällä kategorialla tarkentavia vaihtoehtoja
    renderStep3();
};

function renderStep3() {
    const container = document.getElementById('wizard-container');
    const cat = wizardTaxonomy.categories[currentSelection.category];
    
    let html = `
        <div class="wizard-step slide-left">
            <button class="wizard-back-btn" onclick="renderStep2()">← Takaisin</button>
            <h3 class="wizard-title">Vaihe 3: Tarkentava valinta (${cat.title})</h3>
            <p style="margin-bottom: 1rem; color: var(--muted);">Valitse tarkempi aihe:</p>
            <div class="wizard-list">
    `;

    cat.options.forEach(opt => {
        html += `<label class="wizard-radio">
            <input type="radio" name="wiz_sub" value="${opt}" onchange="selectSubCategory('${opt}')">
            <span>${opt}</span>
        </label>`;
    });

    html += `</div></div>`;
    container.innerHTML = html;
}

window.selectSubCategory = function(subKey) {
    currentSelection.subCategory = subKey;
    // Jos on subActions
    if (wizardTaxonomy.subActions && wizardTaxonomy.subActions[subKey]) {
        renderStep3b(subKey);
    } else {
        renderStep4();
    }
};

function renderStep3b(subKey) {
    const container = document.getElementById('wizard-container');
    const actions = wizardTaxonomy.subActions[subKey];
    
    let html = `
        <div class="wizard-step slide-left">
            <button class="wizard-back-btn" onclick="renderStep3()">← Takaisin</button>
            <h3 class="wizard-title">Mitä tarkemmin ottaen? (${subKey})</h3>
            <div class="wizard-list">
    `;

    actions.forEach(act => {
        html += `<label class="wizard-radio">
            <input type="radio" name="wiz_act" value="${act}" onchange="selectAction('${act}')">
            <span>${act}</span>
        </label>`;
    });

    html += `</div></div>`;
    container.innerHTML = html;
}

window.selectAction = function(act) {
    currentSelection.action = act;
    renderStep4();
};

function renderStep4() {
    const container = document.getElementById('wizard-container');
    
    // Rakennetaan automaattinen otsikko
    const intentTitle = wizardTaxonomy.intents[currentSelection.intent].title.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]\s*/g, ''); // Poista emojit
    const catTitle = wizardTaxonomy.categories[currentSelection.category].title.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]\s*/g, '');
    let autoTitle = `${intentTitle}: ${catTitle}`;
    if (currentSelection.subCategory) autoTitle += ` - ${currentSelection.subCategory}`;
    if (currentSelection.action) autoTitle += ` (${currentSelection.action})`;

    let html = `
        <div class="wizard-step slide-left">
            <button class="wizard-back-btn" onclick="renderStep3()">← Takaisin</button>
            <h3 class="wizard-title">Vaihe 4: Suositukset & Lisätiedot</h3>
            
            <div class="wizard-summary-box">
                <strong>Alustava otsikko:</strong><br>
                <span style="color: var(--primary); font-size: 1.1rem; font-weight: bold;">${autoTitle}</span>
            </div>

            <div id="wizard-recommendations" class="wizard-recom-box" style="display:none;">
                <h4>💡 Saatat löytää ratkaisun myös näistä:</h4>
                <div id="recom-content">Haetaan...</div>
                <button class="wizard-btn-outline" style="margin-top:1rem;" onclick="location.href='index.html'">✓ Löysin jo tarvitsemani, peruuta ilmoitus</button>
            </div>

            <hr style="margin: 2rem 0; border: none; border-top: 1px solid var(--border);">

            <h4>Tai julkaise ilmoitus syötteeseen:</h4>
            <div class="ilm-form-card" style="box-shadow: none; border: 1px solid var(--border); padding: 1.5rem; margin-top:1rem;">
                <label>Tarkempi kuvaus (valinnainen)</label>
                <textarea id="wiz-message" placeholder="Kerro hieman tarkemmin... (Max 300 merkkiä)" maxlength="300"></textarea>
                
                <label>Nimi tai Nimimerkki *</label>
                <input type="text" id="wiz-name" placeholder="Etunimi tai yhdistyksen nimi" required>
                
                <label>Yhteystieto (Sähköposti tai puhelin)</label>
                <input type="text" id="wiz-contact" placeholder="Miten sinuun saa yhteyden?">
                
                <button class="ilm-submit-btn" onclick="submitWizardForm('${autoTitle}')">
                    Julkaise ilmoitus 📢
                </button>
            </div>
            <div id="wiz-error" style="color:red; margin-top:1rem;"></div>
        </div>
    `;

    container.innerHTML = html;
    
    // Haetaan suositukset
    fetchRecommendations();
}

async function fetchRecommendations() {
    // Yksinkertainen haku suosittelijasta tagin/kategorian nimellä
    const tag = currentSelection.subCategory || wizardTaxonomy.categories[currentSelection.category].title.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]\s*/g, '');
    
    try {
        const res = await fetch('https://mediazoo.fi/laukaainfo-web/suosittelija.php?tag=' + encodeURIComponent(tag));
        const data = await res.json();
        
        if (data.status === 'success' && data.verkosto) {
            const keys = Object.keys(data.verkosto);
            if (keys.length > 0 && data.verkosto[keys[0]]) {
                const verkosto = data.verkosto[keys[0]];
                const entities = data.entities;
                
                let recomHtml = '<ul style="list-style: none; padding: 0;">';
                let hasItems = false;

                if (verkosto.yritykset && verkosto.yritykset.length > 0) {
                    hasItems = true;
                    verkosto.yritykset.slice(0,3).forEach(id => {
                        recomHtml += `<li style="padding: 0.5rem 0; border-bottom: 1px solid #eee;">🏢 <strong>${entities[id].nimi}</strong><br><small>${entities[id].kuvaus}</small></li>`;
                    });
                }
                if (verkosto.harrastukset && verkosto.harrastukset.length > 0) {
                    hasItems = true;
                    verkosto.harrastukset.slice(0,3).forEach(id => {
                        recomHtml += `<li style="padding: 0.5rem 0; border-bottom: 1px solid #eee;">👥 <strong>${entities[id].otsikko}</strong></li>`;
                    });
                }

                recomHtml += '</ul>';

                if (hasItems) {
                    document.getElementById('wizard-recommendations').style.display = 'block';
                    document.getElementById('recom-content').innerHTML = recomHtml;
                }
            }
        }
    } catch(e) {
        console.error("Suositusten haku epäonnistui", e);
    }
}

window.submitWizardForm = async function(autoTitle) {
    const name = document.getElementById('wiz-name').value.trim();
    if (!name) {
        document.getElementById('wiz-error').innerText = "Nimi on pakollinen!";
        return;
    }

    const payload = {
        tyyppi: currentSelection.intent.includes('tarjoan') ? 'tarjoan' : 'tarvitsen',
        intent: currentSelection.intent,
        category: currentSelection.category,
        subCategory: currentSelection.subCategory || '',
        action: currentSelection.action || '',
        tagit: [currentSelection.category, currentSelection.subCategory].filter(Boolean),
        otsikko: autoTitle,
        kuvaus: document.getElementById('wiz-message').value.trim(),
        nimi: name,
        yhteys: document.getElementById('wiz-contact').value.trim()
    };

    try {
        const response = await fetch("https://mediazoo.fi/laukaainfo-web/ilmoitukset-api.php", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        
        const container = document.getElementById('wizard-container');
        if (result.status === "success") {
            container.innerHTML = `
                <div class="ilm-success visible">
                    <h3>✅ Ilmoitus julkaistu!</h3>
                    <p>Ilmoituksesi otsikolla "<strong>${autoTitle}</strong>" on tallennettu.</p>
                    <div style="background: #fff; border: 1px solid #ddd; padding: 1rem; border-radius: 8px; margin: 1rem 0; text-align: left;">
                        <strong style="color: #dc3545; font-size: 0.9rem;">TÄRKEÄÄ: Ota talteen poistolinkki!</strong>
                        <p style="font-size: 0.85rem; color: #666; margin: 0.5rem 0;">Sitä ei näytetä julkisesti.</p>
                        <input type="text" value="${result.delete_url}" readonly style="width: 100%; padding: 0.5rem; font-size: 0.8rem; background: #f8f9fa; border: 1px solid #ccc; border-radius: 4px;" onclick="this.select(); document.execCommand('copy'); alert('Kopioitu!');">
                    </div>
                    <button class="ilm-submit-btn" onclick="location.href='index.html'">Palaa etusivulle</button>
                </div>
            `;
        } else {
            document.getElementById('wiz-error').innerText = "Virhe: " + result.message;
        }
    } catch (err) {
        console.error(err);
        document.getElementById('wiz-error').innerText = "Yhteysvirhe julkaisussa. Yritä uudelleen.";
    }
};
