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

function getNeedsConfig() {
    return window.NEEDS_CONFIG || (typeof NEEDS_CONFIG !== 'undefined' ? NEEDS_CONFIG : null);
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
    syncCompactFormFromSelections();
    updateCompactStepVisibility();
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
    readCompactSelectionsFromForm();
    updateCompactStepVisibility();
    updateSelectionSummary();
}

function readCompactSelectionsFromForm() {
    const config = getNeedsConfig();
    const need = config && config[currentNeedId];
    if (!need) return;

    const subContexts = [];

    need.steps.forEach(step => {
        const wrapper = document.getElementById(`wrapper-${step.id}`);
        if (wrapper && wrapper.classList.contains('compact-field--skipped')) {
            delete selections[step.id];
            return;
        }

        if (step.multiple) {
            const checked = wrapper ? wrapper.querySelectorAll(`input[name="compact-${step.id}"]:checked`) : [];
            const selected = [];
            checked.forEach(inp => {
                const opt = step.options[parseInt(inp.value, 10)];
                if (opt) {
                    selected.push(opt);
                    if (opt.sub_context && !subContexts.includes(opt.sub_context)) {
                        subContexts.push(opt.sub_context);
                    }
                }
            });
            if (selected.length) selections[step.id] = selected;
            else delete selections[step.id];
        } else {
            const selEl = document.getElementById(`compact-step-${step.id}`);
            if (selEl && selEl.value !== '') {
                const opt = step.options[parseInt(selEl.value, 10)];
                if (opt) {
                    selections[step.id] = opt;
                    if (opt.sub_context && !subContexts.includes(opt.sub_context)) {
                        subContexts.push(opt.sub_context);
                    }
                }
            } else {
                delete selections[step.id];
            }
        }
    });

    if (subContexts.length) selections._sub_contexts = subContexts;
    else delete selections._sub_contexts;
}

function syncCompactFormFromSelections() {
    const config = getNeedsConfig();
    const need = config && config[currentNeedId];
    if (!need) return;

    need.steps.forEach(step => {
        const wrapper = document.getElementById(`wrapper-${step.id}`);
        if (!wrapper) return;

        if (step.multiple) {
            const arr = selections[step.id];
            wrapper.querySelectorAll('input[type="checkbox"]').forEach(inp => {
                const opt = step.options[parseInt(inp.value, 10)];
                inp.checked = !!(arr && arr.some(s =>
                    (s.id && opt.id && s.id === opt.id) ||
                    i18n.getText(s.label) === i18n.getText(opt.label)
                ));
            });
        } else {
            const sel = selections[step.id];
            const selectEl = document.getElementById(`compact-step-${step.id}`);
            if (!selectEl) return;
            if (!sel) {
                selectEl.value = '';
                return;
            }
            const idx = step.options.findIndex(o =>
                (sel.id && o.id && sel.id === o.id) ||
                i18n.getText(o.label) === i18n.getText(sel.label)
            );
            selectEl.value = idx >= 0 ? String(idx) : '';
        }
    });
}

function updateCompactStepVisibility() {
    const config = getNeedsConfig();
    const need = config && config[currentNeedId];
    if (!need) return;

    need.steps.forEach(step => {
        const wrapper = document.getElementById(`wrapper-${step.id}`);
        if (!wrapper) return;

        if (!step.skipIf) {
            wrapper.classList.remove('compact-field--skipped');
            wrapper.querySelectorAll('input, select').forEach(el => { el.disabled = false; });
            return;
        }

        const skip = evaluateSkipIf(step.skipIf);
        wrapper.classList.toggle('compact-field--skipped', skip);

        if (skip) {
            if (step.multiple) {
                wrapper.querySelectorAll('input[type="checkbox"]').forEach(inp => {
                    inp.checked = false;
                    inp.disabled = true;
                });
            } else {
                const selectEl = wrapper.querySelector('select');
                if (selectEl) {
                    selectEl.value = '';
                    selectEl.disabled = true;
                }
            }
        } else {
            wrapper.querySelectorAll('input, select').forEach(el => { el.disabled = false; });
        }
    });
}

function evaluateSkipIf(skipIfStr) {
    if (!skipIfStr) return false;

    let evalStr = skipIfStr;

    const profilointiRegex = /getSelectedCompanyProfilointi\('([^']+)',\s*'([^']+)',\s*'([^']+)'\)/g;
    evalStr = evalStr.replace(profilointiRegex, (match, stepId, section, field) => {
        return getSelectedCompanyProfilointi(stepId, section, field);
    });

    const selectedRegex = /isSelected\('([^']+)',\s*'([^']+)'\)/g;
    evalStr = evalStr.replace(selectedRegex, (match, stepId, label) => {
        const sel = selections[stepId];
        if (!sel) return false;
        if (Array.isArray(sel)) {
            return sel.some(s => (i18n.getText(s.label) || '').toLowerCase().includes(label.toLowerCase()));
        }
        return (i18n.getText(sel.label) || '').toLowerCase().includes(label.toLowerCase());
    });

    evalStr = evalStr.replace(/selections\.(\w+)/g, (match, stepId) => !!selections[stepId]);

    const nodeLinkRegex = /hasNodeLink\('([^']+)',\s*'([^']+)'\)/g;
    evalStr = evalStr.replace(nodeLinkRegex, (match, stepId, nodeId) => {
        return hasSelectedCompanyNodeLink(stepId, nodeId);
    });

    try {
        const safeEval = new Function('return ' + evalStr);
        return safeEval();
    } catch (e) {
        return false;
    }
}

function getSelectedCompanyProfilointi(stepId, section, field) {
    const sel = selections[stepId];
    if (!sel) return false;
    const opt = Array.isArray(sel) ? sel[0] : sel;
    if (!opt || !opt._companyRef) return false;
    return opt._companyRef?.profiling?.[section]?.[field] === true;
}

function hasSelectedCompanyNodeLink(stepId, nodeId) {
    const sel = selections[stepId];
    if (!sel) return false;
    const opt = Array.isArray(sel) ? sel[0] : sel;
    const company = opt._companyRef;
    if (!company || !company.profiling || !company.profiling.core) return false;
    const links = company.profiling.core.node_links || [];
    return links.includes(nodeId);
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

    readCompactSelectionsFromForm();

    const payload = typeof rehydrateSelectionsFromConfig === 'function'
        ? rehydrateSelectionsFromConfig(currentNeedId, selections)
        : selections;

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
