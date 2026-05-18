/**
 * LaukaaInfo Semantic Network Map
 * Uses Cytoscape.js to visualize the service network
 */

class NetworkMap {
    constructor() {
        this.cy = null;
        this.data = {
            taxonomy: null,
            companies: [],
            profiling: {}
        };
        this.selections = {
            needId: null,
            options: new Set(), // Set of option identifiers (needId-stepId-index)
            subContexts: new Set(),
            companies: new Set()
        };

        // Standard thresholds
        this.THRESHOLD_STRICT = 80;
        this.THRESHOLD_RELEVANT = 50;
        this.THRESHOLD_LOOSE = 10;

        this.init();
    }

    async init() {
        try {
            await this.loadData();
            this.initCytoscape();
            this.setupControls();
            this.renderSidebar();
            
            // Hide loader
            document.getElementById('loader').style.display = 'none';
        } catch (error) {
            console.error("NetworkMap initialization failed:", error);
        }
    }

    async loadData() {
        const [liveRes, tempRes, profRes, taxRes] = await Promise.all([
            fetch('live_companies.json'),
            fetch('temp_companies.json'),
            fetch('company_profiling_data.json'),
            fetch('taxonomy.json').catch(() => null)
        ]);

        const liveData = await liveRes.json();
        const tempData = await tempRes.json();
        const profData = await profRes.json();
        const taxonomyData = taxRes ? await taxRes.json() : null;

        const companyMap = {};
        [...(tempData.results || []), ...(liveData.results || [])].forEach(c => {
            companyMap[c.id] = c;
        });
        this.data.companies = Object.values(companyMap);
        this.data.profiling = profData.profiles;
        this.data.taxonomy = taxonomyData;

        // NEEDS_CONFIG is loaded via <script> tag in HTML
        this.data.needs = window.NEEDS_CONFIG || {};

        console.log("NetworkMap: Data loaded", {
            companies: this.data.companies.length,
            needs: Object.keys(this.data.needs).length
        });
    }

    initCytoscape() {
        this.cy = cytoscape({
            container: document.getElementById('cy'),
            style: [
                {
                    selector: 'node',
                    style: {
                        'label': 'data(label)',
                        'text-valign': 'center',
                        'text-halign': 'center',
                        'color': '#fff',
                        'font-size': '12px',
                        'font-family': 'Inter, sans-serif',
                        'font-weight': '600',
                        'text-wrap': 'wrap',
                        'text-max-width': '80px',
                        'width': 'mapData(weight, 0, 100, 40, 80)',
                        'height': 'mapData(weight, 0, 100, 40, 80)',
                        'background-color': '#475569',
                        'border-width': 2,
                        'border-color': '#1e293b',
                        'transition-property': 'background-color, line-color, target-arrow-color, width, height',
                        'transition-duration': '0.3s'
                    }
                },
                {
                    selector: 'node[type="group"]',
                    style: {
                        'background-color': '#6366f1',
                        'font-size': '14px',
                        'width': 100,
                        'height': 100
                    }
                },
                {
                    selector: 'node[type="intent"]',
                    style: {
                        'background-color': '#3b82f6',
                        'width': 70,
                        'height': 70
                    }
                },
                {
                    selector: 'node[type="company"]',
                    style: {
                        'background-color': '#10b981',
                        'width': 60,
                        'height': 60,
                        'font-size': '10px'
                    }
                },
                {
                    selector: 'node[type="refinement"]',
                    style: {
                        'background-color': '#f59e0b',
                        'width': 40,
                        'height': 40,
                        'font-size': '9px',
                        'color': '#1e293b'
                    }
                },
                {
                    selector: 'edge',
                    style: {
                        'width': 2,
                        'line-color': '#cbd5e1',
                        'curve-style': 'bezier',
                        'opacity': 0.5,
                        'target-arrow-shape': 'triangle',
                        'target-arrow-color': '#cbd5e1'
                    }
                },
                {
                    selector: 'edge[type="semantic"]',
                    style: {
                        'line-style': 'dashed',
                        'line-color': '#fbbf24',
                        'target-arrow-color': '#fbbf24'
                    }
                }
            ],
            layout: {
                name: 'cose',
                animate: true
            }
        });

        this.cy.on('tap', 'node', (evt) => {
            const node = evt.target;
            if (node.data('type') === 'company') {
                const companyId = node.id();
                const company = this.data.companies.find(c => c.id === companyId);
                if (company && window.LkiModal) {
                    window.LkiModal.open(company);
                }
            }
        });
    }

    renderSidebar() {
        const sidebarContent = document.querySelector('.sidebar-content');
        sidebarContent.innerHTML = '';

        if (!this.selections.needId) {
            // Show all Needs
            const catSection = document.createElement('div');
            catSection.className = 'sidebar-section';
            catSection.innerHTML = `<h3 data-i18n="need_section_title">Mitä olet järjestämässä?</h3><div id="need-list" class="selection-list"></div>`;
            const needList = catSection.querySelector('#need-list');

            Object.entries(this.data.needs).forEach(([id, need]) => {
                const label = i18n.getText(need.title);
                const item = this.createItemElement(id, `${need.icon} ${label}`, null, () => this.toggleNeed(id));
                needList.appendChild(item);
            });
            sidebarContent.appendChild(catSection);
        } else {
            // Show selected Need with change button
            const needId = this.selections.needId;
            const need = this.data.needs[needId];
            const label = i18n.getText(need.title);

            const catSection = document.createElement('div');
            catSection.className = 'sidebar-section';
            catSection.innerHTML = `<div id="need-list" class="selection-list"></div>`;
            const needList = catSection.querySelector('#need-list');

            const backBtn = document.createElement('div');
            backBtn.className = 'back-to-categories';
            backBtn.innerHTML = `&larr; <span data-i18n="btn_change_category">Vaihda aihetta</span>`;
            backBtn.onclick = () => this.resetMap();
            needList.appendChild(backBtn);

            const needItem = this.createItemElement(needId, `${need.icon} ${label}`, null, () => {}, true);
            needList.appendChild(needItem);
            sidebarContent.appendChild(catSection);

            // Steps and Options
            need.steps.forEach((step, stepIdx) => {
                const stepSection = document.createElement('div');
                stepSection.className = 'sidebar-section';
                stepSection.innerHTML = `<h3>${i18n.getText(step.question)}</h3><div class="selection-list"></div>`;
                const optionList = stepSection.querySelector('.selection-list');

                step.options.forEach((opt, optIdx) => {
                    if (opt.hide_results && !opt.sub_context) return;
                    
                    const optId = `${needId}-${step.id}-${optIdx}`;
                    const optLabel = i18n.getText(opt.label);
                    const isActive = this.selections.options.has(optId);
                    
                    // Count matching companies for this option
                    const count = this.data.companies.filter(c => this.checkCompanyMatch(c, opt, need)).length;
                    
                    const item = this.createItemElement(optId, optLabel, count, () => this.toggleOption(opt, step, optIdx), isActive);
                    optionList.appendChild(item);

                    if (isActive) {
                        const subList = document.createElement('div');
                        subList.className = 'sub-selection-list';
                        
                        const matches = this.data.companies.filter(c => this.checkCompanyMatch(c, opt, need));
                        matches.sort((a, b) => {
                            const aPkg = (a.package || '').toLowerCase();
                            const bPkg = (b.package || '').toLowerCase();
                            if (aPkg.includes('premium') && !bPkg.includes('premium')) return -1;
                            return 0;
                        });

                        matches.slice(0, 15).forEach(comp => {
                            const compActive = this.selections.companies.has(comp.id);
                            const compItem = this.createItemElement(comp.id, comp.nimi, null, () => this.toggleCompany(comp.id, optId), compActive, 'company-item');
                            subList.appendChild(compItem);
                        });
                        optionList.appendChild(subList);
                    }
                });
                sidebarContent.appendChild(stepSection);
            });

            // Hae ja näytä suositukset (Next steps) valintojen perusteella
            if (this.selections.options.size > 0 && window.getRecommendations) {
                const selectionsArr = [];
                this.selections.options.forEach(optId => {
                    const [nId, stepId, idx] = optId.split('-');
                    const s = need.steps.find(st => st.id === stepId);
                    if (s) {
                        selectionsArr.push(s.options[parseInt(idx)]);
                    }
                });

                const needToProfilingMap = {
                    'haat': 'events_and_celebrations',
                    'yritysjuhlat': 'events_and_celebrations',
                    'yritystilaisuudet': 'business_events',
                    'syntymapaivat': 'events_and_celebrations',
                    'muutto': 'moving_and_housing',
                    'remontti': 'construction_and_maintenance',
                    'mokkipalvelut': 'cottage_services',
                    'taloyhtion-huolto': 'housing_company_and_contracts',
                    'hautajaiset': 'funerals_and_memorials',
                    'yrityksen-perustaminen': 'startup_services',
                    'yrityksen-kehittaminen': 'business_growth',
                    'terveys-ja-hyvinvointi': 'wellbeing_and_beauty',
                    'liikunta-ja-vapaaaika': 'wellbeing_and_beauty'
                };
                const profilingKey = needToProfilingMap[needId] || need.profilointi_context || 'vapaa-aika';
                
                const recommendations = window.getRecommendations(
                    needId, 
                    profilingKey, 
                    selectionsArr, 
                    this.data.companies, 
                    this.data.taxonomy, 
                    this.data.needs, 
                    window.i18n
                );

                if (recommendations && recommendations.length > 0) {
                    const recSection = document.createElement('div');
                    recSection.className = 'sidebar-section';
                    recSection.innerHTML = `<h3 data-i18n="palvelu_next_steps">Seuraavaksi saatat tarvita myös näitä:</h3><div class="selection-list" style="display: flex; flex-wrap: wrap; gap: 6px; flex-direction: row;"></div>`;
                    const recList = recSection.querySelector('.selection-list');
                    
                    recommendations.forEach(rec => {
                        const badge = document.createElement('span');
                        badge.style.display = 'inline-block';
                        badge.style.padding = '4px 10px';
                        badge.style.background = '#e0f2fe';
                        badge.style.border = '1px solid #7dd3fc';
                        badge.style.borderRadius = '20px';
                        badge.style.fontSize = '0.8rem';
                        badge.style.fontWeight = '600';
                        badge.style.color = '#0369a1';
                        badge.style.cursor = 'pointer';
                        badge.textContent = rec;
                        badge.onclick = () => {
                            const lowerQuery = rec.toLowerCase();
                            let foundNeedId = null;
                            if (typeof window.NEEDS_CONFIG !== 'undefined') {
                                for (const [id, config] of Object.entries(window.NEEDS_CONFIG)) {
                                    if (id.toLowerCase() === lowerQuery || (config.title && (config.title.fi || config.title).toLowerCase() === lowerQuery)) {
                                        foundNeedId = id;
                                        break;
                                    }
                                }
                            }
                            if (foundNeedId) {
                                window.location.href = `palvelu.html?id=${foundNeedId}`;
                            } else {
                                window.location.href = `koko-laukaa.html?q=${encodeURIComponent(rec)}`;
                            }
                        };
                        recList.appendChild(badge);
                    });
                    
                    sidebarContent.appendChild(recSection);
                }
            }
        }

        if (window.i18n) i18n.translatePage();
    }

    createItemElement(id, name, count, onClick, isActive = false, extraClass = '') {
        const div = document.createElement('div');
        div.className = `selection-item ${isActive ? 'active' : ''} ${extraClass}`;
        div.dataset.id = id;
        
        let countHtml = count !== null ? `<span class="item-count">${count}</span>` : '';
        div.innerHTML = `
            <span class="item-name">${name}</span>
            ${countHtml}
        `;
        
        div.onclick = (e) => {
            e.stopPropagation();
            onClick();
        };
        return div;
    }

    toggleNeed(needId) {
        if (this.selections.needId === needId) {
            this.resetMap();
            return;
        }

        this.cy.elements().remove();
        this.selections.needId = needId;
        this.selections.options.clear();
        this.selections.subContexts.clear();
        this.selections.companies.clear();
        
        const need = this.data.needs[needId];
        const label = i18n.getText(need.title);
        
        this.addNode({
            id: needId,
            label: `${need.icon}\n${label}`,
            type: 'group',
            weight: 100
        });

        this.cy.layout({ name: 'preset' }).run();
        this.cy.center();
        this.cy.fit(undefined, 100);

        this.renderSidebar();
    }

    toggleOption(opt, step, optIdx) {
        const optId = `${this.selections.needId}-${step.id}-${optIdx}`;
        const label = i18n.getText(opt.label);

        if (this.selections.options.has(optId)) {
            this.selections.options.delete(optId);
            if (opt.sub_context) this.selections.subContexts.delete(opt.sub_context);
            this.removeNode(optId);
        } else {
            this.selections.options.add(optId);
            if (opt.sub_context) this.selections.subContexts.add(opt.sub_context);
            
            this.addNode({
                id: optId,
                label: label,
                type: 'intent',
                weight: 80
            });

            this.addEdge(this.selections.needId, optId);

            // Add matching companies (optional: only add if explicitly selected? 
            // Or maybe add some top ones automatically? For now, we only add companies when selected in sidebar)
        }

        this.renderSidebar();
        this.runLayoutAndFit();
    }

    toggleCompany(companyId, parentIntentCode) {
        if (this.selections.companies.has(companyId)) {
            this.selections.companies.delete(companyId);
            this.removeNode(companyId);
        } else {
            this.selections.companies.add(companyId);
            const company = this.data.companies.find(c => c.id === companyId);
            
            this.addNode({
                id: companyId,
                label: company.nimi,
                type: 'company',
                weight: 60
            });

            // Connect to matching options
            this.selections.options.forEach(optId => {
                const [needId, stepId, idx] = optId.split('-');
                const need = this.data.needs[needId];
                const step = need.steps.find(s => s.id === stepId);
                const opt = step.options[parseInt(idx)];
                
                if (this.checkCompanyMatch(company, opt, need)) {
                    this.addEdge(optId, companyId);
                }
            });

            // Semantic links
            this.selections.companies.forEach(otherId => {
                if (otherId === companyId) return;
                const profile = this.data.profiling[companyId];
                if (profile?.categories?.events_and_celebrations?.collaborated_with?.includes(otherId) ||
                    profile?.core?.paired_with_by_context?.general?.includes(otherId)) {
                    this.addEdge(companyId, otherId, 'semantic');
                }
            });
        }
        this.renderSidebar();
        this.runLayoutAndFit();
    }

    resetMap() {
        this.selections.needId = null;
        this.selections.options.clear();
        this.selections.subContexts.clear();
        this.selections.companies.clear();
        if (this.cy) this.cy.elements().remove();
        this.renderSidebar();
    }

    printMap() {
        // Simple print for now, could be improved with high-res export
        window.print();
    }

    // Graph Helpers
    addNode(data) {
        if (this.cy.getElementById(data.id).length === 0) {
            // Laajempi satunnainen sijainti, jotta fysiikka ehtii reagoida (elävämpi efekti)
            const position = {
                x: Math.random() * 400 - 200,
                y: Math.random() * 400 - 200
            };
            this.cy.add({
                group: 'nodes',
                data: data,
                position: position
            });
        }
    }

    removeNode(id) {
        this.cy.remove(this.cy.getElementById(id));
    }

    addEdge(source, target, type = 'normal') {
        const id = `e-${source}-${target}`;
        if (this.cy.getElementById(id).length === 0) {
            this.cy.add({
                group: 'edges',
                data: { id, source, target, type }
            });
        }
    }

    runLayout() {
        if (this.cy.nodes().length === 0) return;
        const layout = this.cy.layout({
            name: 'cose',
            animate: true,
            randomize: false,
            componentSpacing: 100,
            nodeRepulsion: 400000,
            nodeOverlap: 40,
            idealEdgeLength: 120,
            edgeElasticity: 100,
            nestingFactor: 5
        });
        layout.run();
    }

    runLayoutAndFit() {
        if (this.cy.nodes().length === 0) return;
        if (this.cy.nodes().length === 1) {
            // Single node: just center it, no layout needed
            this.cy.center();
            this.cy.fit(undefined, 150);
            return;
        }
        const layout = this.cy.layout({
            name: 'cose',
            animate: true,
            randomize: false,
            componentSpacing: 100,
            nodeRepulsion: 400000,
            nodeOverlap: 40,
            idealEdgeLength: 120,
            edgeElasticity: 100,
            nestingFactor: 5,
            stop: () => {
                this.cy.fit(undefined, 60);
            }
        });
        layout.run();
    }

    checkCompanyMatch(c, opt, need) {
        if (!c || !opt) return false;
        
        if (window.isMatch) {
            const profilingKey = need.profilointi_context || 'vapaa-aika';
            const subContextsReq = Array.from(this.selections.subContexts);
            // verkostokartta uses the same shared searchEngine logic
            return window.isMatch(c, opt, profilingKey, subContextsReq, false, this.data.taxonomy);
        }
        
        return false; // Fallback should not be needed when searchEngine.js is loaded
    }

    setupControls() {
        document.getElementById('zoom-in').onclick = () => this.cy.zoom(this.cy.zoom() * 1.2);
        document.getElementById('zoom-out').onclick = () => this.cy.zoom(this.cy.zoom() * 0.8);
        document.getElementById('fit-view').onclick = () => this.cy.fit();
        document.getElementById('refresh-layout').onclick = () => this.runLayout();
        document.getElementById('reset-map').onclick = () => this.resetMap();
        document.getElementById('print-map').onclick = () => this.printMap();
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.networkMap = new NetworkMap();
    if (window.i18n) window.i18n.translatePage();
});
