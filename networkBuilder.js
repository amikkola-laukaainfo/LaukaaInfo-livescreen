/**
 * LaukaaInfo Network Builder
 * Handles dynamic service chains, partner recommendations, and geolocation
 */

class NetworkBuilder {
    constructor() {
        this.companies = [];
        this.profiling = {};
        this.selections = {}; // scenarioId -> { stepIndex -> companyId }
        this.userCoords = null;
        this.init();
    }

    /**
     * Fetch a JSON file safely, stripping any UTF-8 BOM (\uFEFF / ï»¿)
     * that Windows editors (Notepad, Excel) may prepend.
     */
    async fetchJson(url) {
        const res = await fetch(url);
        let text = await res.text();
        // Strip UTF-8 BOM if present
        if (text.charCodeAt(0) === 0xFEFF) {
            text = text.slice(1);
        }
        return JSON.parse(text);
    }

    async init() {
        try {
            // Load saved coordinates if any
            const savedCoords = localStorage.getItem('userCoords');
            if (savedCoords) {
                try {
                    this.userCoords = JSON.parse(savedCoords);
                } catch(e) {}
            }

            // Fetch company data and profiling (BOM-safe)
            const [liveData, tempData, profilingData] = await Promise.all([
                this.fetchJson('live_companies.json'),
                this.fetchJson('temp_companies.json'),
                this.fetchJson('company_profiling_data.json')
            ]);

            const companyMap = {};
            [...(tempData.results || []), ...(liveData.results || [])].forEach(c => {
                companyMap[c.id] = c;
            });
            this.companies = Object.values(companyMap);
            
            this.profiling = profilingData.profiles;

            console.log('NetworkBuilder: Data loaded', this.companies.length, 'companies');
            
            this.setupLocationSupport();
            this.setupListeners();
            this.renderDynamicSteps();
        } catch (error) {
            console.error('NetworkBuilder initialization failed:', error);
        }
    }

    setupLocationSupport() {
        const locationInput = document.getElementById('user-location-input');
        const locateMeBtn = document.getElementById('locate-me-btn');
        const statusEl = document.getElementById('location-status');

        if (!locationInput) return;

        // Sync with global userCoords if script.js already loaded it
        if (window.userCoords) this.userCoords = window.userCoords;

        const updateLocationAndRender = (coords, name) => {
            this.userCoords = coords;
            if (statusEl) statusEl.textContent = `Sijainti asetettu: ${name}`;
            this.renderDynamicSteps();
        };

        // Handle text input
        locationInput.addEventListener('change', async () => {
            const query = locationInput.value.trim();
            if (!query) {
                this.userCoords = null;
                this.renderDynamicSteps();
                return;
            }

            if (statusEl) statusEl.textContent = 'Haetaan koordinaatteja...';

            try {
                const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + ', Laukaa')}`);
                const data = await res.json();
                if (data && data.length > 0) {
                    const coords = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
                    updateLocationAndRender(coords, query);
                } else {
                    if (statusEl) statusEl.textContent = 'Sijaintia ei l\u00f6ytynyt.';
                }
            } catch (e) {
                if (statusEl) statusEl.textContent = 'Virhe haussa.';
            }
        });

        // Handle "Locate Me"
        if (locateMeBtn) {
            locateMeBtn.addEventListener('click', () => {
                if (statusEl) statusEl.textContent = 'Paikannetaan...';
                navigator.geolocation.getCurrentPosition(
                    (pos) => {
                        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                        updateLocationAndRender(coords, 'Nykyinen sijainti');
                    },
                    () => {
                        if (statusEl) statusEl.textContent = 'Paikannus epäonnistui.';
                    }
                );
            });
        }
    }

    setupListeners() {
        document.addEventListener('change', (e) => {
            if (e.target.classList.contains('partner-toggle')) {
                const companyId = e.target.dataset.companyId;
                const scenarioId = e.target.closest('.chain-section').id;
                const stepIndex = e.target.closest('.chain-step').dataset.step;
                this.handleSelection(scenarioId, stepIndex, companyId, e.target.checked);
            }
        });
    }

    handleSelection(scenarioId, stepIndex, companyId, isSelected) {
        if (!this.selections[scenarioId]) this.selections[scenarioId] = {};
        
        const stepEl = document.querySelector(`#${scenarioId} .chain-step[data-step="${stepIndex}"]`);
        if (isSelected) {
            const link = Array.from(stepEl.querySelectorAll('.partner-link')).find(l => l.dataset.companyId === companyId);
            if (link) link.classList.add('selected');
            
            if (!this.selections[scenarioId][stepIndex]) this.selections[scenarioId][stepIndex] = [];
            if (!this.selections[scenarioId][stepIndex].includes(companyId)) {
                this.selections[scenarioId][stepIndex].push(companyId);
            }
            
            this.propagateRecommendations(scenarioId, stepIndex);
            this.updateSuggestions(scenarioId, stepIndex);
        } else {
            const link = Array.from(stepEl.querySelectorAll('.partner-link')).find(l => l.dataset.companyId === companyId);
            if (link) link.classList.remove('selected');
            
            if (this.selections[scenarioId][stepIndex]) {
                this.selections[scenarioId][stepIndex] = this.selections[scenarioId][stepIndex].filter(id => id !== companyId);
                if (this.selections[scenarioId][stepIndex].length === 0) {
                    delete this.selections[scenarioId][stepIndex];
                }
            }
            this.propagateRecommendations(scenarioId, stepIndex);
        }
        this.updateSummary();
    }

    getRecommendationsForStep(scenarioId, fromStepIndex) {
        const selectedIds = this.selections[scenarioId]?.[fromStepIndex] || [];
        const recommendedIds = [];
        
        selectedIds.forEach(companyId => {
            const profile = this.profiling[companyId];
            if (!profile) return;
            const paired = profile.core?.paired_with_by_context || {};
            const collaborated = profile.categories?.events_and_celebrations?.collaborated_with || [];
            recommendedIds.push(...collaborated);
            Object.values(paired).forEach(list => {
                if (Array.isArray(list)) recommendedIds.push(...list);
            });
        });
        
        return [...new Set(recommendedIds)];
    }

    propagateRecommendations(scenarioId, currentStepIndex) {
        // Just trigger a re-render of the next step(s)
        // This will naturally use getRecommendationsForStep during the render process
        this.renderDynamicSteps();
    }

    clearRecommendations(scenarioId, stepIndex) {
        const stepEl = document.querySelector(`#${scenarioId} .chain-step[data-step="${stepIndex}"]`);
        if (!stepEl) return;
        stepEl.querySelectorAll('.partner-link').forEach(l => l.classList.remove('recommended'));
    }

    highlightCompatiblePartners(scenarioId, stepIndex, recommendedIds) {
        const nextStepEl = document.querySelector(`#${scenarioId} .chain-step[data-step="${stepIndex}"]`);
        if (!nextStepEl) return;

        const links = nextStepEl.querySelectorAll('.partner-link');
        let foundMatch = false;

        links.forEach(link => {
            const companyId = link.dataset.companyId;
            const name = link.querySelector('.partner-name')?.innerText.toLowerCase() || "";
            
            const isMatch = recommendedIds.some(rec => 
                rec === companyId || 
                name.includes(String(rec).toLowerCase())
            );

            if (isMatch) {
                link.classList.add('recommended');
                foundMatch = true;
            }
        });

        if (foundMatch) {
            const list = nextStepEl.querySelector('.partner-list');
            const recommended = Array.from(list.querySelectorAll('.partner-link.recommended'));
            recommended.forEach(el => list.prepend(el));
        }
    }

    renderDynamicSteps() {
        document.querySelectorAll('.chain-step[data-tags]').forEach((stepEl, index) => {
            const stepIdx = index + 1;
            stepEl.setAttribute('data-step', stepIdx);
            
            const tags = stepEl.dataset.tags.split(',').map(t => t.trim().toLowerCase());
            const partnerList = stepEl.querySelector('.partner-list');
            const scenarioId = stepEl.closest('.chain-section').id;
            if (!partnerList) return;

            // Get recommendations from previous step(s)
            // We look at the immediately preceding step
            const recommendations = this.getRecommendationsForStep(scenarioId, stepIdx - 1);

            // Find matching companies
            let matches = this.companies.filter(c => {
                const companyTags = (c.tags || '').toLowerCase();
                const category = (c.kategoria || '').toLowerCase();
                return tags.some(t => companyTags.includes(t) || category.includes(t));
            });

            // Sort matches
            matches.sort((a, b) => {
                // 1. Recommendations from previous steps first!
                const aIsRec = recommendations.includes(a.id);
                const bIsRec = recommendations.includes(b.id);
                if (aIsRec && !bIsRec) return -1;
                if (!aIsRec && bIsRec) return 1;

                // 2. Pro/Premium next
                const aPkg = (a.package || '').toLowerCase();
                const bPkg = (b.package || '').toLowerCase();
                const aIsPremium = aPkg.includes('pro') || aPkg.includes('premium');
                const bIsPremium = bPkg.includes('pro') || bPkg.includes('premium');
                if (aIsPremium && !bIsPremium) return -1;
                if (!aIsPremium && bIsPremium) return 1;

                // 3. Then by distance
                if (this.userCoords && a.lat && a.lon && b.lat && b.lon) {
                    const distA = this.getDist(this.userCoords, a);
                    const distB = this.getDist(this.userCoords, b);
                    return distA - distB;
                }
                return 0;
            });

            // Limit to top 15 matches for performance/UI
            matches = matches.slice(0, 15);

            partnerList.innerHTML = '';
            matches.forEach(comp => {
                const isSelected = this.selections[scenarioId]?.[stepIdx]?.includes(comp.id);
                const isRecommended = recommendations.includes(comp.id);

                const card = document.createElement('div');
                card.className = `partner-link ${isSelected ? 'selected' : ''} ${isRecommended ? 'recommended' : ''}`;
                card.dataset.companyId = comp.id;

                let distText = '';
                if (this.userCoords && comp.lat && comp.lon) {
                    const d = this.getDist(this.userCoords, comp);
                    distText = `<small style="color: #666; margin-left: 10px;">${d.toFixed(1)} km</small>`;
                }

                card.innerHTML = `
                    <div class="partner-card-info" style="width: 100%; cursor: pointer;">
                        <div class="partner-info">
                            <span class="partner-name">${comp.nimi}</span>
                            ${distText}
                            <small>${comp.kategoria}</small>
                        </div>
                    </div>
                    <div class="partner-toggle-container">
                        <input type="checkbox" class="partner-toggle" data-company-id="${comp.id}" ${isSelected ? 'checked' : ''}>
                    </div>
                `;

                card.querySelector('.partner-card-info').onclick = () => {
                    if (window.LkiModal) window.LkiModal.open(comp);
                };
                partnerList.appendChild(card);
            });
        });
    }

    getDist(c1, c2) {
        // Use global getHaversineDistance if available, else simple fallback
        if (window.getHaversineDistance) {
            return window.getHaversineDistance(c1.lat, c1.lng || c1.lon, parseFloat(c2.lat), parseFloat(c2.lon));
        }
        // Fallback (very rough)
        const dx = c1.lat - parseFloat(c2.lat);
        const dy = (c1.lng || c1.lon) - parseFloat(c2.lon);
        return Math.sqrt(dx*dx + dy*dy) * 111;
    }

    updateSummary() {
        const summaryDrawer = document.getElementById('network-summary');
        const list = document.getElementById('selected-partners-list');
        list.innerHTML = '';

        let totalSelected = 0;
        Object.keys(this.selections).forEach(scenarioId => {
            Object.values(this.selections[scenarioId]).forEach(ids => {
                ids.forEach(companyId => {
                    const company = this.companies.find(c => c.id === companyId);
                    if (company) {
                        const item = document.createElement('div');
                        item.className = 'selected-item';
                        item.innerText = company.nimi;
                        list.appendChild(item);
                        totalSelected++;
                    }
                });
            });
        });

        if (totalSelected > 0) {
            summaryDrawer.classList.add('active');
        } else {
            summaryDrawer.classList.remove('active');
            list.innerHTML = '<p class="empty-msg" data-i18n="no_selections">Ei valintoja vielä. Aloita valitsemalla yritys ylhäältä.</p>';
            if (window.i18n) window.i18n.translatePage();
        }
    }

    printPlan() {
        const reportModal = document.getElementById('report-modal');
        const reportContent = document.getElementById('report-content');
        
        let html = `
            <div class="report-header" style="text-align: center; margin-bottom: 3rem; border-bottom: 2px solid var(--primary-blue); padding-bottom: 1rem;">
                <h1 style="color: var(--primary-blue); font-size: 2rem;">Palvelusuunnitelma - LaukaaInfo</h1>
                <p>${new Date().toLocaleDateString('fi-FI')}</p>
            </div>
        `;

        let hasSelections = false;
        Object.keys(this.selections).forEach(scenarioId => {
            const scenarioName = document.querySelector(`#${scenarioId} h2`)?.innerText || scenarioId;
            let scenarioHtml = `<div class="report-section" style="margin-bottom: 2.5rem;">
                <h2 style="color: var(--secondary-blue); border-left: 5px solid var(--primary-blue); padding-left: 15px; margin-bottom: 1.5rem;">${scenarioName}</h2>
                <div style="display: grid; gap: 1.5rem;">
            `;
            
            let scenarioHasItems = false;
            Object.keys(this.selections[scenarioId]).sort().forEach(stepIdx => {
                const stepLabel = document.querySelector(`#${scenarioId} .chain-step[data-step="${stepIdx}"] .step-label`)?.innerText || `Vaihe ${stepIdx}`;
                const stepTitle = document.querySelector(`#${scenarioId} .chain-step[data-step="${stepIdx}"] h4`)?.innerText || "";
                
                this.selections[scenarioId][stepIdx].forEach(companyId => {
                    const comp = this.companies.find(c => c.id === companyId);
                    if (comp) {
                        scenarioHasItems = true;
                        hasSelections = true;
                        scenarioHtml += `
                            <div class="report-item" style="padding: 1rem; border: 1px solid #eee; border-radius: 12px; background: #fafafa;">
                                <div style="font-size: 0.8rem; text-transform: uppercase; font-weight: 700; color: #666; margin-bottom: 5px;">${stepLabel}: ${stepTitle}</div>
                                <div style="font-size: 1.2rem; font-weight: 800; color: var(--primary-blue);">${comp.nimi}</div>
                                <div style="margin-top: 8px; font-size: 0.95rem; display: flex; flex-wrap: wrap; gap: 15px;">
                                    ${comp.osoite ? `<span>📍 ${comp.osoite}</span>` : ''}
                                    ${comp.puhelin ? `<span>📞 ${comp.puhelin}</span>` : ''}
                                    ${comp.nettisivu ? `<span>🌐 ${comp.nettisivu}</span>` : ''}
                                </div>
                            </div>
                        `;
                    }
                });
            });

            scenarioHtml += `</div></div>`;
            if (scenarioHasItems) html += scenarioHtml;
        });

        if (!hasSelections) {
            html += '<p style="text-align: center; font-style: italic;">Ei valittuja yrityksi\u00e4.</p>';
        }

        reportContent.innerHTML = html;
        reportModal.classList.add('active');
    }

    updateSuggestions(scenarioId, currentStepIndex) {
        // Suggestions logic can remain or be updated to be more dynamic
        const scenarioEl = document.getElementById(scenarioId);
        const suggestionSlot = scenarioEl.querySelector('.suggestion-slot');
        const suggestionStep = scenarioEl.querySelector('.dynamic-suggestions');
        
        if (!suggestionSlot || !suggestionStep) return;

        const selectedIds = this.selections[scenarioId][currentStepIndex] || [];
        if (selectedIds.length === 0) {
            suggestionStep.style.display = 'none';
            return;
        }

        const currentCompanyId = selectedIds[0];
        const profile = this.profiling[currentCompanyId];
        
        if (!profile || !profile.core?.paired_with_by_context?.general) {
            suggestionStep.style.display = 'none';
            return;
        }

        const relatedTags = profile.core.paired_with_by_context.general;
        const suggestedCompanies = this.companies.filter(c => 
            relatedTags.some(tag => c.tags?.toLowerCase().includes(tag.toLowerCase())) &&
            c.id !== currentCompanyId
        ).slice(0, 3);

        if (suggestedCompanies.length > 0) {
            suggestionSlot.innerHTML = '';
            suggestedCompanies.forEach(comp => {
                const card = document.createElement('div');
                card.className = 'partner-link suggestion-card';
                card.dataset.companyId = comp.id;
                card.innerHTML = `
                    <div class="partner-card-info" style="width: 100%; cursor: pointer;">
                        <div class="partner-info">
                            <span class="partner-name">${comp.nimi}</span>
                            <small>${comp.kategoria}</small>
                        </div>
                    </div>
                `;
                card.querySelector('.partner-card-info').onclick = () => {
                    if (window.LkiModal) window.LkiModal.open(comp);
                };
                suggestionSlot.appendChild(card);
            });
            suggestionStep.style.display = 'flex';
        } else {
            suggestionStep.style.display = 'none';
        }
    }
}

// Initialize when ready
window.networkBuilder = new NetworkBuilder();
