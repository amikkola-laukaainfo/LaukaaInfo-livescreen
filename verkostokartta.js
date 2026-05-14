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
            this.renderSidebar();
            this.setupControls();
            
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
        const groupList = document.getElementById('category-list');
        groupList.innerHTML = '';

        this.data.taxonomy.groups.forEach(group => {
            const item = document.createElement('div');
            item.className = 'selection-item';
            item.dataset.id = group.id;
            
            // Count how many companies might fit here
            const count = this.data.companies.filter(c => {
                const profile = this.data.profiling[c.id];
                return profile?.core?.fits_for?.[group.id] > 20;
            }).length;

            item.innerHTML = `
                <span class="item-name">${group.name}</span>
                <span class="item-count">${count}</span>
            `;

            item.onclick = () => this.toggleGroup(group.id);
            groupList.appendChild(item);
        });
    }

    toggleGroup(groupId) {
        const item = document.querySelector(`#category-list .selection-item[data-id="${groupId}"]`);
        
        if (this.selections.groups.has(groupId)) {
            this.selections.groups.delete(groupId);
            item.classList.remove('active');
            this.removeNode(groupId);
        } else {
            this.selections.groups.add(groupId);
            item.classList.add('active');
            const group = this.data.taxonomy.groups.find(g => g.id === groupId);
            this.addNode({
                id: groupId,
                label: group.name,
                type: 'group',
                weight: 100
            });
        }

        this.updateIntentList();
        this.runLayout();
    }

    updateIntentList() {
        const section = document.getElementById('intent-section');
        const list = document.getElementById('intent-list');
        list.innerHTML = '';

        if (this.selections.groups.size === 0) {
            section.style.display = 'none';
            return;
        }

        section.style.display = 'block';
        
        // Collect all intent codes from active groups
        const codes = new Set();
        this.selections.groups.forEach(gid => {
            const group = this.data.taxonomy.groups.find(g => g.id === gid);
            group.codes.forEach(code => codes.add(code));
        });

        codes.forEach(code => {
            const intent = this.data.taxonomy.intents[code];
            if (!intent) return;

            const item = document.createElement('div');
            item.className = 'selection-item' + (this.selections.intents.has(code) ? ' active' : '');
            item.dataset.id = code;

            const count = this.data.companies.filter(c => {
                const tags = (c.tags || '').toLowerCase();
                const intentNameFi = intent.fi.toLowerCase();
                return tags.includes(intentNameFi) || (c.intent_codes && c.intent_codes.includes(code));
            }).length;

            item.innerHTML = `
                <span class="item-name">${intent.fi}</span>
                <span class="item-count">${count}</span>
            `;

            item.onclick = () => this.toggleIntent(code);
            list.appendChild(item);
        });
    }

    toggleIntent(code) {
        const item = document.querySelector(`#intent-list .selection-item[data-id="${code}"]`);
        
        if (this.selections.intents.has(code)) {
            this.selections.intents.delete(code);
            item.classList.remove('active');
            this.removeNode(code);
        } else {
            this.selections.intents.add(code);
            item.classList.add('active');
            const intent = this.data.taxonomy.intents[code];
            this.addNode({
                id: code,
                label: intent.fi,
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
        }

        this.updateCompanyList();
        this.runLayout();
    }

    updateCompanyList() {
        const section = document.getElementById('company-section');
        const list = document.getElementById('company-list');
        list.innerHTML = '';

        if (this.selections.intents.size === 0) {
            section.style.display = 'none';
            return;
        }

        section.style.display = 'block';

        // Find companies matching selected intents
        let matches = this.data.companies.filter(c => {
            return Array.from(this.selections.intents).some(code => {
                const intent = this.data.taxonomy.intents[code];
                const tags = (c.tags || '').toLowerCase();
                const intentNameFi = intent.fi.toLowerCase();
                return tags.includes(intentNameFi) || (c.intent_codes && c.intent_codes.includes(code));
            });
        });

        // Sort by priority/package
        matches.sort((a, b) => {
            const aPkg = (a.package || '').toLowerCase();
            const bPkg = (b.package || '').toLowerCase();
            if (aPkg.includes('premium') && !bPkg.includes('premium')) return -1;
            if (!aPkg.includes('premium') && bPkg.includes('premium')) return 1;
            return 0;
        });

        // Limit to top 20 for sidebar performance
        matches.slice(0, 20).forEach(comp => {
            const item = document.createElement('div');
            item.className = 'selection-item' + (this.selections.companies.has(comp.id) ? ' active' : '');
            item.dataset.id = comp.id;

            item.innerHTML = `
                <span class="item-name">${comp.nimi}</span>
            `;

            item.onclick = () => this.toggleCompany(comp.id);
            list.appendChild(item);
        });
    }

    toggleCompany(companyId) {
        const item = document.querySelector(`#company-list .selection-item[data-id="${companyId}"]`);
        
        if (this.selections.companies.has(companyId)) {
            this.selections.companies.delete(companyId);
            if (item) item.classList.remove('active');
            this.removeNode(companyId);
        } else {
            this.selections.companies.add(companyId);
            if (item) item.classList.add('active');
            const company = this.data.companies.find(c => c.id === companyId);
            
            this.addNode({
                id: companyId,
                label: company.nimi,
                type: 'company',
                weight: 60
            });

            // Connect to matching intents
            this.selections.intents.forEach(code => {
                const intent = this.data.taxonomy.intents[code];
                const tags = (company.tags || '').toLowerCase();
                const intentNameFi = intent.fi.toLowerCase();
                if (tags.includes(intentNameFi) || (company.intent_codes && company.intent_codes.includes(code))) {
                    this.addEdge(code, companyId);
                }
            });

            // Semantic links to other active companies
            this.selections.companies.forEach(otherId => {
                if (otherId === companyId) return;
                const profile = this.data.profiling[companyId];
                if (profile?.categories?.events_and_celebrations?.collaborated_with?.includes(otherId) ||
                    profile?.core?.paired_with_by_context?.general?.includes(otherId)) {
                    this.addEdge(companyId, otherId, 'semantic');
                }
            });
        }
        this.runLayout();
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
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.networkMap = new NetworkMap();
    if (window.i18n) window.i18n.translatePage();
});
