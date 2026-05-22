/**
 * Pikahaku – erillinen lomakesivu (pikahaku.html).
 * Tulokset näytetään palvelu.html-sivulla sessionStoragen kautta.
 */

const PIKAHAUKU_NEED_ORDER = [
    'haat', 'yritysjuhlat', 'yritystilaisuudet', 'syntymapaivat', 'muutto', 'remontti',
    'mokkipalvelut', 'hautajaiset', 'yrityksen-perustaminen', 'yrityksen-kehittaminen',
    'vakituinen-palvelukumppani', 'kiinteistopalvelut', 'paivystavat-palvelut',
    'terveys-ja-hyvinvointi', 'liikunta-ja-vapaaaika', 'elaimet', 'lapset-ja-perhe', 'autohuollot'
];

let currentNeedId = new URLSearchParams(window.location.search).get('id') || '';
let selections = {};

const PS = () => window.PalveluSelections;

function getNeedsConfig() {
    return PS() ? PS().getNeedsConfig() : (window.NEEDS_CONFIG || NEEDS_CONFIG);
}

function initPikahaku() {
    const config = getNeedsConfig();
    if (!config) return;

    populateNeedSelect(config);

    const needSelect = document.getElementById('pikahaku-need-select');
    if (!needSelect) return;

    if (currentNeedId && config[currentNeedId]) {
        needSelect.value = currentNeedId;
        onNeedSelected(false);
    }

    needSelect.addEventListener('change', () => onNeedSelected(true));
}

function populateNeedSelect(config) {
    const select = document.getElementById('pikahaku-need-select');
    if (!select) return;

    const placeholder = i18n.t('compact_select_placeholder');
    const ids = PIKAHAUKU_NEED_ORDER.filter(id => config[id]);
    Object.keys(config).forEach(id => {
        if (!ids.includes(id)) ids.push(id);
    });

    select.innerHTML = `<option value="">${placeholder}</option>` +
        ids.map(id => {
            const need = config[id];
            const icon = need.icon ? `${need.icon} ` : '';
            return `<option value="${id}">${icon}${i18n.getText(need.title)}</option>`;
        }).join('');
}

function onNeedSelected(clearSelections) {
    const needSelect = document.getElementById('pikahaku-need-select');
    const newId = needSelect ? needSelect.value : '';
    const config = getNeedsConfig();
    const wrap = document.getElementById('pikahaku-fields-wrap');
    const emptyHint = document.getElementById('pikahaku-empty-hint');
    const guidedLink = document.getElementById('pikahaku-guided-link');
    const memorialHint = document.getElementById('pikahaku-memorial-hint');

    if (newId !== currentNeedId && clearSelections) {
        selections = {};
    }
    currentNeedId = newId;

    const url = new URL(window.location.href);
    if (currentNeedId) url.searchParams.set('id', currentNeedId);
    else url.searchParams.delete('id');
    history.replaceState(null, '', url);

    if (!currentNeedId || !config[currentNeedId]) {
        if (wrap) wrap.style.display = 'none';
        if (emptyHint) emptyHint.style.display = 'block';
        if (guidedLink) guidedLink.style.display = 'none';
        if (memorialHint) memorialHint.style.display = 'none';
        updateNeedHero(null);
        updateSelectionSummary();
        return;
    }

    const need = config[currentNeedId];
    if (wrap) wrap.style.display = 'block';
    if (emptyHint) emptyHint.style.display = 'none';
    if (guidedLink) {
        guidedLink.href = `palvelu.html?id=${encodeURIComponent(currentNeedId)}`;
        guidedLink.style.display = 'block';
    }

    updateNeedHero(need);
    renderCompactFields();
    PS().syncCompactFormFromSelections(currentNeedId, selections, document);
    PS().updateCompactStepVisibility(currentNeedId, selections, document);
    updateMemorialHint();
    updateSelectionSummary();
}

function updateNeedHero(need) {
    const titleEl = document.getElementById('hero-title');
    const descEl = document.getElementById('hero-desc');
    const iconEl = document.getElementById('hero-icon');

    if (!need) {
        if (titleEl) titleEl.textContent = i18n.t('pikahaku_page_title');
        if (descEl) descEl.textContent = i18n.t('pikahaku_page_desc');
        if (iconEl) iconEl.textContent = '⚡';
        document.title = `${i18n.t('pikahaku_page_title')} | LaukaaInfo`;
        return;
    }

    const title = i18n.getText(need.title);
    if (titleEl) titleEl.textContent = title;
    if (descEl) descEl.textContent = i18n.getText(need.description);
    if (iconEl) iconEl.textContent = need.icon || '⚡';
    document.title = `${title} – ${i18n.t('pikahaku_page_title')} | LaukaaInfo`;
}

function renderCompactFields() {
    const config = getNeedsConfig();
    const need = config && config[currentNeedId];
    const container = document.getElementById('compact-fields');
    if (!container || !need || !need.steps) return;

    const placeholder = i18n.t('compact_select_placeholder');
    const skipHint = i18n.t('compact_skip_hint');
    const multiHint = i18n.t('search_multiple_desc');

    container.innerHTML = need.steps.map(step => {
        const fieldId = `compact-step-${step.id}`;
        if (step.multiple) {
            return `
                <div class="compact-field" data-step-id="${step.id}" id="wrapper-${step.id}">
                    <p class="compact-skip-note">${skipHint}</p>
                    <span class="compact-label">${i18n.getText(step.question)}</span>
                    <p class="compact-hint">${multiHint}</p>
                    <div class="compact-checkboxes">
                        ${step.options.map((opt, i) => `
                            <label class="compact-check">
                                <input type="checkbox" name="compact-${step.id}" value="${i}" data-step-id="${step.id}">
                                <span>${i18n.getText(opt.label)}</span>
                            </label>
                        `).join('')}
                    </div>
                </div>`;
        }
        return `
            <div class="compact-field" data-step-id="${step.id}" id="wrapper-${step.id}">
                <p class="compact-skip-note">${skipHint}</p>
                <label class="compact-label" for="${fieldId}">${i18n.getText(step.question)}</label>
                <select id="${fieldId}" class="compact-select" data-step-id="${step.id}">
                    <option value="">${placeholder}</option>
                    ${step.options.map((opt, i) => `<option value="${i}">${i18n.getText(opt.label)}</option>`).join('')}
                </select>
            </div>`;
    }).join('');

    container.querySelectorAll('select, input[type="checkbox"]').forEach(el => {
        el.addEventListener('change', onCompactFieldChange);
    });
}

function onCompactFieldChange() {
    PS().readCompactSelectionsFromForm(currentNeedId, selections, document);
    PS().updateCompactStepVisibility(currentNeedId, selections, document);
    updateMemorialHint();
    updateSelectionSummary();
}

function updateMemorialHint() {
    const el = document.getElementById('pikahaku-memorial-hint');
    if (!el || currentNeedId !== 'hautajaiset') {
        if (el) el.style.display = 'none';
        return;
    }
    const show = !PS().hasMemorialServiceSelected(currentNeedId, selections);
    el.style.display = show ? 'block' : 'none';
}

function updateSelectionSummary() {
    const summaryEl = document.getElementById('selection-summary');
    if (!summaryEl) return;
    const summaryTags = [];

    for (const stepId in selections) {
        if (stepId.startsWith('_')) continue;
        const val = selections[stepId];
        if (Array.isArray(val)) val.forEach(v => summaryTags.push(v.label));
        else if (val && val.label) summaryTags.push(val.label);
    }

    if (summaryTags.length > 0) {
        summaryEl.innerHTML = summaryTags.map(tag => `<span class="summary-tag">${i18n.getText(tag)}</span>`).join('');
        summaryEl.style.display = 'flex';
    } else {
        summaryEl.style.display = 'none';
    }
}

function submitPikahaku(e) {
    e.preventDefault();
    if (!currentNeedId) return;

    PS().readCompactSelectionsFromForm(currentNeedId, selections, document);

    let payload = selections;
    if (typeof rehydrateSelectionsFromConfig === 'function') {
        payload = rehydrateSelectionsFromConfig(currentNeedId, selections);
    }

    sessionStorage.setItem('pikahaku_pending', JSON.stringify({
        id: currentNeedId,
        selections: payload
    }));

    window.location.href = `palvelu.html?id=${encodeURIComponent(currentNeedId)}&mode=compact&autosearch=1`;
}

function initUserLocation() {
    const locationInput = document.getElementById('user-location-input');
    const locateMeBtn = document.getElementById('locate-me-btn');
    const statusEl = document.getElementById('location-status');
    if (!locationInput) return;

    const savedName = localStorage.getItem('userLocationName');
    const savedCoordsRaw = localStorage.getItem('userCoords');
    if (savedName) locationInput.value = savedName;

    const urlParams = new URLSearchParams(window.location.search);
    const urlLat = urlParams.get('lat');
    const urlLon = urlParams.get('lon');
    const urlLoc = urlParams.get('loc');

    if (urlLat && urlLon) {
        const coords = { lat: parseFloat(urlLat), lng: parseFloat(urlLon) };
        localStorage.setItem('userCoords', JSON.stringify(coords));
        if (urlLoc) {
            localStorage.setItem('userLocationName', urlLoc);
            locationInput.value = urlLoc;
        }
        window.userCoords = coords;
    } else if (savedCoordsRaw) {
        try { window.userCoords = JSON.parse(savedCoordsRaw); } catch (e) {}
    }

    locationInput.addEventListener('keypress', (ev) => {
        if (ev.key === 'Enter') {
            ev.preventDefault();
            locationInput.blur();
        }
    });

    locationInput.addEventListener('change', async () => {
        const val = locationInput.value.trim();
        if (!val) {
            localStorage.removeItem('userCoords');
            localStorage.removeItem('userLocationName');
            window.userCoords = null;
            return;
        }
        localStorage.setItem('userLocationName', val);
        if (statusEl) statusEl.textContent = 'Haetaan koordinaatteja...';
        try {
            const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(val + ', Laukaa')}&limit=1`);
            const data = await response.json();
            if (data && data.length > 0) {
                const coords = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
                localStorage.setItem('userCoords', JSON.stringify(coords));
                window.userCoords = coords;
                if (statusEl) statusEl.textContent = i18n.t('status_location_updated');
            } else if (statusEl) {
                statusEl.textContent = i18n.t('status_address_not_found_precise');
            }
        } catch (err) {
            if (statusEl) statusEl.textContent = i18n.t('status_search_error');
        }
    });

    if (locateMeBtn) {
        locateMeBtn.addEventListener('click', () => {
            if (!navigator.geolocation) {
                if (statusEl) statusEl.textContent = 'Selaimesi ei tue sijaintia.';
                return;
            }
            if (statusEl) statusEl.textContent = i18n.t('status_locating');
            navigator.geolocation.getCurrentPosition(async (pos) => {
                const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                window.userCoords = coords;
                localStorage.setItem('userCoords', JSON.stringify(coords));
                try {
                    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${coords.lat}&lon=${coords.lng}`);
                    const data = await res.json();
                    const name = data.display_name.split(',')[0] || 'Oma sijainti';
                    locationInput.value = name;
                    localStorage.setItem('userLocationName', name);
                    if (statusEl) statusEl.textContent = i18n.t('status_location_updated');
                } catch (err) {
                    locationInput.value = i18n.t('label_my_location');
                    if (statusEl) statusEl.textContent = i18n.t('status_location_updated');
                }
            }, () => {
                if (statusEl) statusEl.textContent = i18n.t('status_geo_failed');
            });
        });
    }
}
