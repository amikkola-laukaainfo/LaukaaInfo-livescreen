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
            const [companiesRes, profilingRes] = await Promise.all([
                fetch('live_companies.json'),
                fetch('company_profiling_data.json')
            ]);

            const companiesData = await companiesRes.json();
            this.companies = companiesData.results;
            
            const profilingData = await profilingRes.json();
            this.profiling = profilingData.profiles;

            console.log('NetworkBuilder: Data loaded');
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
        
        // Clear other selections in the same step (exclusive choice for now)
        const stepEl = document.querySelector(`#${scenarioId} .chain-step[data-step="${stepIndex}"]`);
        if (isSelected) {
            stepEl.querySelectorAll('.partner-toggle').forEach(cb => {
                if (cb.dataset.companyId !== companyId) cb.checked = false;
            });
            stepEl.querySelectorAll('.partner-link').forEach(link => {
                link.classList.remove('selected');
                if (link.href.includes(companyId)) link.classList.add('selected');
            });
            this.selections[scenarioId][stepIndex] = companyId;
            this.propagateRecommendations(scenarioId, stepIndex);
        } else {
            const link = Array.from(stepEl.querySelectorAll('.partner-link')).find(l => l.href.includes(companyId));
            if (link) link.classList.remove('selected');
            delete this.selections[scenarioId][stepIndex];
            this.clearRecommendations(scenarioId, parseInt(stepIndex) + 1);
        }
        
        this.updateSummary();
    }

    propagateRecommendations(scenarioId, currentStepIndex) {
        const nextStepIndex = parseInt(currentStepIndex) + 1;
        const currentCompanyId = this.selections[scenarioId][currentStepIndex];
        const profile = this.profiling[currentCompanyId];

        this.clearRecommendations(scenarioId, nextStepIndex);
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
    }

    clearRecommendations(scenarioId, stepIndex) {
        const stepEl = document.querySelector(`#${scenarioId} .chain-step[data-step="${stepIndex}"]`);
        if (!stepEl) return;
        stepEl.querySelectorAll('.partner-link').forEach(l => l.classList.remove('recommended'));
    }

    highlightCompatiblePartners(scenarioId, stepIndex, recommendedIds) {
        const nextStepEl = document.querySelector(`#${scenarioId} .chain-step[data-step="${stepIndex}"]`);
        if (!nextStepEl) return;

        console.log(`Highlighting in step ${stepIndex} with IDs:`, recommendedIds);

        const links = nextStepEl.querySelectorAll('.partner-link');
        let foundMatch = false;

        links.forEach(link => {
            const companyId = link.href.split('id=')[1];
            const name = link.querySelector('span').innerText.toLowerCase();
            
            // Match by ID or by Name (since some pairings are names)
            const isMatch = recommendedIds.some(rec => 
                rec === companyId || 
                name.includes(rec.toLowerCase()) || 
                (typeof rec === 'string' && rec.length > 3 && name.includes(rec.toLowerCase()))
            );

            if (isMatch) {
                link.classList.add('recommended');
                foundMatch = true;
            }
        });

        // If matches found, move them to the top of the list
        if (foundMatch) {
            const list = nextStepEl.querySelector('.partner-list');
            const recommended = Array.from(list.querySelectorAll('.partner-link.recommended'));
            recommended.forEach(el => list.prepend(el));
        }
    }

    updateSummary() {
        const summaryDrawer = document.getElementById('network-summary');
        const list = document.getElementById('selected-partners-list');
        list.innerHTML = '';

        let totalSelected = 0;
        Object.keys(this.selections).forEach(scenarioId => {
            Object.values(this.selections[scenarioId]).forEach(companyId => {
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

        if (totalSelected > 0) {
            summaryDrawer.classList.add('active');
        } else {
            summaryDrawer.classList.remove('active');
            list.innerHTML = '<p class="empty-msg" data-i18n="no_selections">Ei valintoja vielä. Aloita valitsemalla yritys ylhäältä.</p>';
            if (window.i18n) window.i18n.translatePage();
        }
    }

    printPlan() {
        window.print();
    }

    renderAll() {
        // Add checkboxes to all existing cards
        document.querySelectorAll('.partner-link').forEach(link => {
            const companyId = link.href.split('id=')[1];
            
            // Avoid adding multiple times
            if (link.querySelector('.partner-toggle')) return;

            const toggleContainer = document.createElement('div');
            toggleContainer.className = 'partner-toggle-container';
            toggleContainer.innerHTML = `<input type="checkbox" class="partner-toggle" data-company-id="${companyId}" onclick="event.stopPropagation()">`;
            
            link.appendChild(toggleContainer);
            
            // Make the whole link clickable for toggle, but prevent default navigation if clicking the checkbox area
            link.addEventListener('click', (e) => {
                if (e.target.classList.contains('partner-toggle')) return;
                e.preventDefault();
                const cb = link.querySelector('.partner-toggle');
                cb.checked = !cb.checked;
                cb.dispatchEvent(new Event('change', { bubbles: true }));
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
