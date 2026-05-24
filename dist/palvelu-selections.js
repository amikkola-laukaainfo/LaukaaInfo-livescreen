/**
 * Yhteinen valintalogiikka: pikahaku.html, palvelu.html (compact + showResults)
 */
(function (global) {
    'use strict';

    function getNeedsConfig() {
        return global.NEEDS_CONFIG || (typeof NEEDS_CONFIG !== 'undefined' ? NEEDS_CONFIG : null);
    }

    function normalizeLabelText(label) {
        if (!label) return '';
        if (typeof label === 'string') return label.toLowerCase().trim();
        const fi = (label.fi || '').toLowerCase().trim();
        const en = (label.en || '').toLowerCase().trim();
        return fi || en;
    }

    function labelMatchesToken(label, token) {
        const t = token.toLowerCase().trim();
        if (!t) return false;
        if (typeof label === 'string') {
            const l = label.toLowerCase().trim();
            return l === t || l.includes(t) || t.includes(l);
        }
        const fi = (label.fi || '').toLowerCase().trim();
        const en = (label.en || '').toLowerCase().trim();
        return fi === t || fi.includes(t) || t.includes(fi) ||
            en === t || en.includes(t) || t.includes(en);
    }

    /**
     * Tunnistaa onko stepId:ssä valittu option joka vastaa tokenia (id tai label.fi/en).
     */
    function matchIsSelected(stepId, token, selections, needId) {
        const config = getNeedsConfig();
        const need = config && config[needId];
        const sel = selections[stepId];
        if (!sel) return false;

        const tokenLower = token.toLowerCase().trim();
        const matchingIds = new Set();

        if (tokenLower) matchingIds.add(token);

        const step = need && need.steps ? need.steps.find(s => s.id === stepId) : null;
        if (step && step.options) {
            step.options.forEach(opt => {
                if (opt.id === token) matchingIds.add(opt.id);
                if (labelMatchesToken(opt.label, token)) matchingIds.add(opt.id);
            });
        }

        const items = Array.isArray(sel) ? sel : [sel];
        return items.some(s => {
            if (!s) return false;
            if (s.id && matchingIds.has(s.id)) return true;
            if (s.id === token) return true;
            return labelMatchesToken(s.label, token);
        });
    }

    function getSelectedCompanyProfilointi(stepId, section, field, selections) {
        const sel = selections[stepId];
        if (!sel) return false;
        const opt = Array.isArray(sel) ? sel[0] : sel;
        if (!opt || !opt._companyRef) return false;
        return opt._companyRef.profiling?.[section]?.[field] === true;
    }

    function hasSelectedCompanyNodeLink(stepId, nodeId, selections) {
        const sel = selections[stepId];
        if (!sel) return false;
        const opt = Array.isArray(sel) ? sel[0] : sel;
        const company = opt._companyRef;
        if (!company || !company.profiling || !company.profiling.core) return false;
        const links = company.profiling.core.node_links || [];
        return links.includes(nodeId);
    }

    function evaluateSkipIf(skipIfStr, selections, needId) {
        if (!skipIfStr) return false;

        let evalStr = skipIfStr;

        const profilointiRegex = /getSelectedCompanyProfilointi\('([^']+)',\s*'([^']+)',\s*'([^']+)'\)/g;
        evalStr = evalStr.replace(profilointiRegex, (match, stepId, section, field) => {
            return getSelectedCompanyProfilointi(stepId, section, field, selections);
        });

        const selectedRegex = /isSelected\('([^']+)',\s*'([^']+)'\)/g;
        evalStr = evalStr.replace(selectedRegex, (match, stepId, label) => {
            return matchIsSelected(stepId, label, selections, needId);
        });

        evalStr = evalStr.replace(/selections\.(\w+)/g, (match, stepId) => !!selections[stepId]);

        const nodeLinkRegex = /hasNodeLink\('([^']+)',\s*'([^']+)'\)/g;
        evalStr = evalStr.replace(nodeLinkRegex, (match, stepId, nodeId) => {
            return hasSelectedCompanyNodeLink(stepId, nodeId, selections);
        });

        try {
            const safeEval = new Function('return ' + evalStr);
            return !!safeEval();
        } catch (e) {
            return false;
        }
    }

    function collectSubContexts(selections, needId) {
        const config = getNeedsConfig();
        const need = config && config[needId];
        if (!need) return [];
        const subContexts = [];
        need.steps.forEach(step => {
            const val = selections[step.id];
            if (!val) return;
            const items = Array.isArray(val) ? val : [val];
            items.forEach(opt => {
                if (opt.sub_context && !subContexts.includes(opt.sub_context)) {
                    subContexts.push(opt.sub_context);
                }
            });
        });
        return subContexts;
    }

    /**
     * Lukee compact-lomakkeen. Ei poista valintoja skipped-luokan perusteella — vain disabled-kentät jätetään.
     */
    function readCompactSelectionsFromForm(needId, selections, formRoot) {
        const root = formRoot || global.document;
        const config = getNeedsConfig();
        const need = config && config[needId];
        if (!need || !selections) return;

        need.steps.forEach(step => delete selections[step.id]);
        delete selections._sub_contexts;

        const subContexts = [];

        need.steps.forEach(step => {
            const wrapper = root.getElementById(`wrapper-${step.id}`);

            if (step.multiple) {
                const checked = wrapper
                    ? wrapper.querySelectorAll(`input[name="compact-${step.id}"]:checked:not(:disabled)`)
                    : [];
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
            } else {
                const selEl = root.getElementById(`compact-step-${step.id}`);
                if (selEl && !selEl.disabled && selEl.value !== '') {
                    const opt = step.options[parseInt(selEl.value, 10)];
                    if (opt) {
                        selections[step.id] = opt;
                        if (opt.sub_context && !subContexts.includes(opt.sub_context)) {
                            subContexts.push(opt.sub_context);
                        }
                    }
                }
            }
        });

        if (subContexts.length) selections._sub_contexts = subContexts;
    }

    function syncCompactFormFromSelections(needId, selections, formRoot) {
        const root = formRoot || global.document;
        const config = getNeedsConfig();
        const need = config && config[needId];
        if (!need) return;

        const i18n = global.i18n;
        const getText = i18n && i18n.getText ? (t) => i18n.getText(t) : (t) => (t && t.fi) || t || '';

        need.steps.forEach(step => {
            const wrapper = root.getElementById(`wrapper-${step.id}`);
            if (!wrapper) return;

            if (step.multiple) {
                const arr = selections[step.id];
                wrapper.querySelectorAll('input[type="checkbox"]').forEach(inp => {
                    const opt = step.options[parseInt(inp.value, 10)];
                    inp.checked = !!(arr && arr.some(s =>
                        (s.id && opt.id && s.id === opt.id) ||
                        getText(s.label) === getText(opt.label)
                    ));
                });
            } else {
                const sel = selections[step.id];
                const selectEl = root.getElementById(`compact-step-${step.id}`);
                if (!selectEl) return;
                if (!sel) {
                    selectEl.value = '';
                    return;
                }
                const idx = step.options.findIndex(o =>
                    (sel.id && o.id && sel.id === o.id) ||
                    getText(o.label) === getText(sel.label)
                );
                selectEl.value = idx >= 0 ? String(idx) : '';
            }
        });
    }

    function updateCompactStepVisibility(needId, selections, formRoot) {
        const root = formRoot || global.document;
        const config = getNeedsConfig();
        const need = config && config[needId];
        if (!need) return;

        need.steps.forEach(step => {
            const wrapper = root.getElementById(`wrapper-${step.id}`);
            if (!wrapper) return;

            if (!step.skipIf) {
                wrapper.classList.remove('compact-field--skipped');
                wrapper.querySelectorAll('input, select').forEach(el => { el.disabled = false; });
                return;
            }

            const skip = evaluateSkipIf(step.skipIf, selections, needId);
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

    /**
     * Palauttaa valinnat joita käytetään haussa (ohjatun haun tapaan: skipatut askeleet pois).
     */
    function filterSelectionsForSearch(needId, selections) {
        const config = getNeedsConfig();
        const need = config && config[needId];
        if (!need || !selections) return selections || {};

        const out = {};

        need.steps.forEach(step => {
            if (step.skipIf && evaluateSkipIf(step.skipIf, selections, needId)) {
                return;
            }
            if (selections[step.id] !== undefined) {
                out[step.id] = selections[step.id];
            }
        });

        const subContexts = collectSubContexts(out, needId);
        if (subContexts.length) out._sub_contexts = subContexts;

        return out;
    }

    function flattenSelections(selections) {
        let flat = [];
        if (!selections) return flat;
        for (const stepId in selections) {
            if (stepId.startsWith('_')) continue;
            const val = selections[stepId];
            if (Array.isArray(val)) flat = flat.concat(val);
            else if (val && typeof val === 'object') flat.push(val);
        }
        return flat;
    }

    /** Hautajaiset: onko Muistotilaisuus valittu paatarve-askeleessa */
    function hasMemorialServiceSelected(needId, selections) {
        if (needId !== 'hautajaiset') return true;
        return matchIsSelected('paatarve', 'Muistotilaisuus', selections, needId) ||
            matchIsSelected('paatarve', 'OPT_FUNERAL_MEMORIAL', selections, needId);
    }

    global.PalveluSelections = {
        getNeedsConfig,
        matchIsSelected,
        evaluateSkipIf,
        readCompactSelectionsFromForm,
        syncCompactFormFromSelections,
        updateCompactStepVisibility,
        filterSelectionsForSearch,
        flattenSelections,
        hasMemorialServiceSelected,
        collectSubContexts
    };

    if (typeof module !== 'undefined') {
        module.exports = global.PalveluSelections;
    }
})(typeof window !== 'undefined' ? window : global);
