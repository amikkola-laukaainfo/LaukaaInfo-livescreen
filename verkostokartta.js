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
            groups: new Set(),
            intents: new Set(),
            companies: new Set()
        };
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
        const [taxRes, liveRes, tempRes, profRes] = await Promise.all([
            fetch('taxonomy.json'),
            fetch('live_companies.json'),
            fetch('temp_companies.json'),
            fetch('company_profiling_data.json')
        ]);

        this.data.taxonomy = await taxRes.json();
        
        const liveData = await liveRes.json();
        const tempData = await tempRes.json();
        const profData = await profRes.json();

        const companyMap = {};
        [...(tempData.results || []), ...(liveData.results || [])].forEach(c => {
            companyMap[c.id] = c;
        });
        this.data.companies = Object.values(companyMap);
        this.data.profiling = profData.profiles;

        console.log("NetworkMap: Data loaded", {
            companies: this.data.companies.length,
            groups: this.data.taxonomy.groups.length
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

        // Category Section
        const catSection = document.createElement('div');
        catSection.className = 'sidebar-section';
        catSection.innerHTML = `<h3 data-i18n="header_categories">Kategoriat</h3><div id="category-list" class="selection-list"></div>`;
        const categoryList = catSection.querySelector('#category-list');

        if (this.selections.groups.size === 0) {
            // Show all groups
            this.data.taxonomy.groups.forEach(group => {
                const count = this.data.companies.filter(c => {
                    const profile = this.data.profiling[c.id];
                    return profile?.core?.fits_for?.[group.id] > 20;
                }).length;
                
                const groupName = window.i18n ? i18n.t(`group_${group.id.replace(/-/g, '_')}`) : group.name;
                const item = this.createItemElement(group.id, groupName, count, () => this.toggleGroup(group.id));
                categoryList.appendChild(item);
            });
            sidebarContent.appendChild(catSection);
        } else {
            // Show only selected group with a "clear" button or active state
            const groupId = Array.from(this.selections.groups)[0];
            const group = this.data.taxonomy.groups.find(g => g.id === groupId);
            const groupName = window.i18n ? i18n.t(`group_${group.id.replace(/-/g, '_')}`) : group.name;
            
            const item = this.createItemElement(groupId, groupName, null, () => this.toggleGroup(groupId), true);
            categoryList.appendChild(item);
            sidebarContent.appendChild(catSection);

            // Intent Section
            const intentSection = document.createElement('div');
            intentSection.className = 'sidebar-section';
            intentSection.innerHTML = `<h3 data-i18n="header_tags">Tunnisteet</h3><div id="intent-list" class="selection-list"></div>`;
            const intentList = intentSection.querySelector('#intent-list');

            group.codes.forEach(code => {
                const intent = this.data.taxonomy.intents[code];
                if (!intent) return;

                const count = this.data.companies.filter(c => this.checkCompanyMatch(c, code)).length;
                const label = window.i18n ? i18n.getText(intent) : intent.fi;
                const isActive = this.selections.intents.has(code);
                
                const item = this.createItemElement(code, label, count, () => this.toggleIntent(code), isActive);
                intentList.appendChild(item);

                // Hierarchical companies/refinements if intent is active
                if (isActive) {
                    const subList = document.createElement('div');
                    subList.className = 'sub-selection-list';
                    
                    // Companies for this intent
                    const matches = this.data.companies.filter(c => this.checkCompanyMatch(c, code));
                    matches.sort((a, b) => {
                        const aPkg = (a.package || '').toLowerCase();
                        const bPkg = (b.package || '').toLowerCase();
                        if (aPkg.includes('premium') && !bPkg.includes('premium')) return -1;
                        return 0;
                    });

                    matches.slice(0, 10).forEach(comp => {
                        const compActive = this.selections.companies.has(comp.id);
                        const compItem = this.createItemElement(comp.id, comp.nimi, null, () => this.toggleCompany(comp.id, code), compActive, 'company-item');
                        subList.appendChild(compItem);
                    });
                    
                    intentList.appendChild(subList);
                }
            });
            sidebarContent.appendChild(intentSection);
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

    toggleGroup(groupId) {
        if (this.selections.groups.has(groupId)) {
            // Clear all when toggling off the only group
            this.resetMap();
            return;
        }

        // Exclusive selection: Clear existing groups
        this.selections.groups.forEach(gid => this.removeNode(gid));
        this.selections.groups.clear();
        
        this.selections.groups.add(groupId);
        const group = this.data.taxonomy.groups.find(g => g.id === groupId);
        const groupName = window.i18n ? i18n.t(`group_${groupId.replace(/-/g, '_')}`) : group.name;
        
        this.addNode({
            id: groupId,
            label: groupName,
            type: 'group',
            weight: 100
        });

        this.renderSidebar();
        this.runLayout();
    }

    toggleIntent(code) {
        if (this.selections.intents.has(code)) {
            this.selections.intents.delete(code);
            this.removeNode(code);
            
            // Also remove child nodes that might be dangling
            const tagIdPrefix = `ref-`;
            this.cy.nodes(`[id ^= "${tagIdPrefix}"]`).forEach(node => {
                const connectedIntents = node.connectedEdges().sources().filter(n => n.id() !== code);
                if (connectedIntents.length === 0) this.cy.remove(node);
            });
        } else {
            this.selections.intents.add(code);
            const intent = this.data.taxonomy.intents[code];
            const label = window.i18n ? i18n.getText(intent) : intent.fi;
            this.addNode({
                id: code,
                label: label,
                type: 'intent',
                weight: 80
            });

            // Connect to parent groups already in graph
            this.selections.groups.forEach(gid => {
                const group = this.data.taxonomy.groups.find(g => g.id === gid);
                if (group.codes.includes(code)) {
                    this.addEdge(gid, code);
                }
            });

            // Add refinement tags
            const matchingCompanies = this.data.companies.filter(c => this.checkCompanyMatch(c, code));
            const refinementTags = new Set();
            matchingCompanies.forEach(c => {
                const profile = this.data.profiling[c.id];
                const tags = profile?.core?.refinement_tags || [];
                tags.forEach(t => refinementTags.add(t));
            });

            Array.from(refinementTags).slice(0, 5).forEach(tag => {
                const tagId = `ref-${tag.replace(/\s+/g, '_')}`;
                this.addNode({
                    id: tagId,
                    label: tag,
                    type: 'refinement',
                    weight: 40
                });
                this.addEdge(code, tagId, 'semantic');
            });
        }

        this.renderSidebar();
        this.runLayout();
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

            // Connect to matching intents
            this.selections.intents.forEach(code => {
                if (this.checkCompanyMatch(company, code)) {
                    this.addEdge(code, companyId);
                    
                    // Connect to matching refinement tags
                    const profile = this.data.profiling[companyId];
                    const tags = profile?.core?.refinement_tags || [];
                    tags.forEach(tag => {
                        const tagId = `ref-${tag.replace(/\s+/g, '_')}`;
                        if (this.cy.getElementById(tagId).length > 0) {
                            this.addEdge(tagId, companyId);
                        }
                    });
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
        this.runLayout();
    }

    resetMap() {
        this.selections.groups.clear();
        this.selections.intents.clear();
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
            this.cy.add({
                group: 'nodes',
                data: data
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
        const layout = this.cy.layout({
            name: 'cose',
            animate: true,
            randomize: false,
            componentSpacing: 100,
            nodeRepulsion: 4000,
            edgeElasticity: 100,
            nestingFactor: 5
        });
        layout.run();
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
