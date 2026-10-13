/**
 * LaukaaInfo Graph Query API
 * Provides lightweight helper methods for traversing the tietämysgraafi (Knowledge Graph).
 * Works in both Node.js and browser environments.
 */
class GraphQuery {
    constructor(nodes = {}, edges = []) {
        this.nodes = nodes;
        this.edges = edges;
        
        // Luodaan indeksit nopeita kyselyitä varten
        this.outAdjacency = {};
        this.inAdjacency = {};
        
        this.edges.forEach(edge => {
            // Lähtevät suhteet
            if (!this.outAdjacency[edge.from]) {
                this.outAdjacency[edge.from] = [];
            }
            this.outAdjacency[edge.from].push(edge);
            
            // Saapuvat suhteet
            if (!this.inAdjacency[edge.to]) {
                this.inAdjacency[edge.to] = [];
            }
            this.inAdjacency[edge.to].push(edge);
        });
    }

    /**
     * Hakee yksittäisen solmun tiedot.
     */
    getNode(id) {
        return this.nodes[id] || null;
    }

    /**
     * Hakee kaikki solmun naapurit (kohdesolmut) suodatettuna suhteen tyypillä.
     */
    getNeighbors(nodeId, relation = null) {
        const edges = this.outAdjacency[nodeId] || [];
        const filtered = relation ? edges.filter(e => e.relation === relation) : edges;
        return filtered.map(e => ({
            id: e.to,
            node: this.nodes[e.to] || null,
            relation: e.relation,
            weight: e.weight || null,
            context: e.context || null
        }));
    }

    /**
     * Hakee solmuun osoittavat suhteet (tuloliitokset) esim. "ketkä tarjoavat tätä palvelua?".
     */
    getIncoming(nodeId, relation = null) {
        const edges = this.inAdjacency[nodeId] || [];
        const filtered = relation ? edges.filter(e => e.relation === relation) : edges;
        return filtered.map(e => ({
            id: e.from,
            node: this.nodes[e.from] || null,
            relation: e.relation,
            weight: e.weight || null,
            context: e.context || null
        }));
    }

    /**
     * Etsii kaikki yritykset, jotka tarjoavat tiettyä palvelua (intent-koodi).
     */
    getCompaniesForIntent(intentCode) {
        const intentId = intentCode.startsWith('intent-') ? intentCode : `intent-${intentCode}`;
        return this.getIncoming(intentId, 'offers');
    }

    /**
     * Etsii yrityksen yhteistyökumppanit.
     */
    getCollaborators(companyId) {
        return this.getNeighbors(companyId, 'collaborated_with');
    }

    /**
     * Etsii yrityksen suositukset (paired_with_by_context).
     */
    getRecommendations(companyId) {
        return this.getNeighbors(companyId, 'recommends_with');
    }

    /**
     * Etsii yrityksen sijaintialueet.
     */
    getAreas(companyId) {
        return this.getNeighbors(companyId, 'located_in');
    }

    /**
     * Monivaiheinen haku (multi-hop traversal):
     * Esim. "Etsi yrityksen A yhteistyökumppanit, jotka tarjoavat palvelua X"
     */
    getCollaboratorsOffering(companyId, intentCode) {
        const collaborators = this.getCollaborators(companyId).map(c => c.id);
        const providers = this.getCompaniesForIntent(intentCode).map(p => p.id);
        
        // Etsitään leikkaus (intersection)
        return collaborators.filter(id => providers.includes(id)).map(id => ({
            id: id,
            node: this.nodes[id] || null
        }));
    }
}

// Tukee Node.js:ää ja selainympäristöä
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GraphQuery;
} else {
    window.GraphQuery = GraphQuery;
}
