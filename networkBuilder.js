/**
 * LaukaaInfo Network Builder
 * Handles dynamic service chains and partner recommendations
 */

class NetworkBuilder {
    constructor() {
        this.companies = [];
        this.profiling = {};
        this.selections = {}; // scenarioId -> { stepIndex -> companyId }
        this.init();
    }

    async init() {
        try {
            // Fetch both company data sources to ensure we have all IDs (e.g. company-282)
            const [liveRes, tempRes, profilingRes] = await Promise.all([
                fetch('live_companies.json'),
                fetch('temp_companies.json'),
                fetch('company_profiling_data.json')
            ]);

            const liveData = await liveRes.json();
            const tempData = await tempRes.json();
            
            // Merge companies, avoiding duplicates
            const companyMap = {};
            [...(tempData.results || []), ...(liveData.results || [])].forEach(c => {
                companyMap[c.id] = c;
            });
            this.companies = Object.values(companyMap);
            
            const profilingData = await profilingRes.json();
            this.profiling = profilingData.profiles;

            console.log('NetworkBuilder: Data loaded', this.companies.length, 'companies');
            this.setupListeners();
            this.renderAll();
        } catch (error) {
            console.error('NetworkBuilder initialization failed:', error);
        }
    }

    setupListeners() {
        // Listen for checkbox changes (rasti ruutuun)
        document.addEventListener('change', (e) => {
            if (e.target.classList.contains('partner-toggle')) {
                const companyId = e.target.dataset.companyId;
                const scenarioId = e.target.closest('.chain-section').id;
                const stepIndex = e.target.closest('.chain-step').dataset.step;
                
                this.handleSelection(scenarioId, stepIndex, companyId, e.target.checked);
            }
        });

        // Listen for provider switches (alasvetovalikko)
        document.addEventListener('change', (e) => {
            if (e.target.classList.contains('step-select')) {
                const companyId = e.target.value;
                const scenarioId = e.target.closest('.chain-section').id;
                const stepIndex = e.target.closest('.chain-step').dataset.step;
                
                this.updateStepProvider(scenarioId, stepIndex, companyId);
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
            this.clearRecommendations(scenarioId, parseInt(stepIndex) + 1);
        }
        
        this.updateSummary();
    }

    propagateRecommendations(scenarioId, currentStepIndex) {
        const nextStepIndex = parseInt(currentStepIndex) + 1;
        const selectedIds = this.selections[scenarioId][currentStepIndex] || [];
        
        this.clearRecommendations(scenarioId, nextStepIndex);
        
        selectedIds.forEach(companyId => {
            const profile = this.profiling[companyId];
            if (!profile) return;

            // Find paired partners
            const paired = profile.core?.paired_with_by_context || {};
            const collaborated = profile.categories?.events_and_celebrations?.collaborated_with || [];

            // Collect all recommended IDs or Tags
            const recommendedIds = [...collaborated];
            Object.values(paired).forEach(list => {
                if (Array.isArray(list)) recommendedIds.push(...list);
            });

            this.highlightCompatiblePartners(scenarioId, nextStepIndex, recommendedIds);
        });
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
            const name = link.querySelector('.partner-name').innerText.toLowerCase();
            
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

    updateSuggestions(scenarioId, currentStepIndex) {
        const scenarioEl = document.getElementById(scenarioId);
        const suggestionSlot = scenarioEl.querySelector('.suggestion-slot');
        const suggestionStep = scenarioEl.querySelector('.dynamic-suggestions');
        
        if (!suggestionSlot || !suggestionStep) return;

        const selectedIds = this.selections[scenarioId][currentStepIndex] || [];
        if (selectedIds.length === 0) {
            suggestionStep.style.display = 'none';
            return;
        }

        const currentCompanyId = selectedIds[0]; // Use first selection for suggestions
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
                    <div class="partner-info">
                        <span class="partner-name">${comp.nimi}</span>
                        <small>${comp.kategoria}</small>
                    </div>
                `;
                card.querySelector('.partner-name').onclick = () => window.LkiModal.open(comp);
                suggestionSlot.appendChild(card);
            });
            suggestionStep.style.display = 'flex';
        } else {
            suggestionStep.style.display = 'none';
        }
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

    updateStepProvider(scenarioId, stepIndex, companyId) {
        if (!this.selections[scenarioId]) this.selections[scenarioId] = {};
        this.selections[scenarioId][stepIndex] = [companyId];
        this.updateSummary();
        this.propagateRecommendations(scenarioId, stepIndex);
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
            html += '<p style="text-align: center; font-style: italic;">Ei valittuja yrityksiä.</p>';
        }

        reportContent.innerHTML = html;
        reportModal.classList.add('active');
    }

    renderAll() {
        // Wrap existing content and add checkboxes
        document.querySelectorAll('.partner-link').forEach(link => {
            const companyId = link.href.split('id=')[1];
            link.dataset.companyId = companyId;
            link.removeAttribute('href'); // Prevent default navigation
            
            if (link.querySelector('.partner-toggle')) return;

            const originalContent = link.innerHTML;
            link.innerHTML = '';

            // Info area (clickable for modal)
            const infoArea = document.createElement('div');
            infoArea.className = 'partner-card-info';
            infoArea.style.width = '100%';
            infoArea.style.cursor = 'pointer';
            infoArea.innerHTML = originalContent;
            
            // Add partner-name class to the span
            const nameSpan = infoArea.querySelector('span');
            if (nameSpan) nameSpan.className = 'partner-name';

            // Toggle area (checkbox)
            const toggleContainer = document.createElement('div');
            toggleContainer.className = 'partner-toggle-container';
            toggleContainer.innerHTML = `<input type="checkbox" class="partner-toggle" data-company-id="${companyId}">`;
            
            link.appendChild(infoArea);
            link.appendChild(toggleContainer);
            
            // Interaction
            infoArea.addEventListener('click', (e) => {
                const company = this.companies.find(c => c.id === companyId);
                if (company && window.LkiModal) {
                    window.LkiModal.open(company);
                } else {
                    // Fallback to old URL if modal fails
                    window.location.href = `yrityskortti.html?id=${companyId}`;
                }
            });
        });

        // Add step data attributes to HTML
        document.querySelectorAll('.chain-section').forEach(section => {
            section.querySelectorAll('.chain-step').forEach((step, index) => {
                step.setAttribute('data-step', index + 1);
            });
        });
    }
}

// Initialize when ready
window.networkBuilder = new NetworkBuilder();
