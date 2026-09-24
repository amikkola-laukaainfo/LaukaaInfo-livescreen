/**
 * placeContext.js
 * 
 * Encapsulates the active search context for LaukaaInfo Web.
 * Mirrors Android's PlaceContext concept.
 */

class PlaceContext {
    constructor({ targetPlace = null, includedPlaceIds = [], themeId = null, query = '' } = {}) {
        this.targetPlace = targetPlace;
        this.includedPlaceIds = includedPlaceIds;
        this.themeId = themeId;
        this.query = query;
    }

    /**
     * Create a PlaceContext from a target place (object or ID) using the PlaceHierarchy.
     */
    static create(placeOrId, hierarchy = window.defaultPlaceHierarchy, query = '', themeId = null) {
        if (!placeOrId) {
            return new PlaceContext({ query, themeId });
        }

        const place = typeof placeOrId === 'string' 
            ? (hierarchy ? hierarchy.findPlace(placeOrId) : { id: placeOrId, name: placeOrId, place_type: 'KOHDE' })
            : placeOrId;

        if (!place) {
            return new PlaceContext({ query, themeId });
        }

        const includedPlaceIds = hierarchy ? hierarchy.getIncludedPlaceIds(place.id) : [place.id];

        return new PlaceContext({
            targetPlace: place,
            includedPlaceIds,
            themeId,
            query
        });
    }

    /**
     * Check if a given place ID matches this PlaceContext.
     * Returns true if no targetPlace is selected, or if placeId is in includedPlaceIds.
     */
    matchesPlace(placeId, placeName = null) {
        if (!this.targetPlace || !this.includedPlaceIds || this.includedPlaceIds.length === 0) {
            return true;
        }

        if (placeId && this.includedPlaceIds.includes(placeId)) {
            return true;
        }

        // Fallback check by place name / municipality matching
        if (placeName && this.targetPlace) {
            const targetName = (this.targetPlace.name || '').toLowerCase();
            const candidateName = String(placeName).toLowerCase();
            if (candidateName.includes(targetName) || targetName.includes(candidateName)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Fetch unified Place Identity Layer context from Supabase get_place_context RPC.
     */
    static async fetchContext(placeId, supabaseClient = window.aiSb) {
        if (!placeId || !supabaseClient) return null;
        try {
            const { data, error } = await supabaseClient.rpc('get_place_context', { p_place_id: placeId });
            if (error) {
                console.warn('PlaceContext.fetchContext error:', error);
                return null;
            }
            return data;
        } catch (err) {
            console.error('PlaceContext.fetchContext failed:', err);
            return null;
        }
    }

    /**
     * getPlaceSearchContext(placeIdOrQuery, supabaseClient)
     * 
     * Resolves the full spatial search context for a given place ID, UUID, slug, or name.
     * Returns:
     * {
     *   selectedPlace: Object | null,
     *   descendantPlaceIds: string[],   // UUIDs of child places (subtree)
     *   ancestorPlaceIds: string[],     // UUIDs of parent places (up to root)
     *   relatedCompanyRelations: Object, // Map of company_id -> Array of PCR objects { context, place_id, confidence, verified }
     *   allPlaceIds: string[]           // Combined array of selected, descendants, ancestors
     * }
     */
    static async getPlaceSearchContext(placeIdOrQuery, supabaseClient = window.aiSb || window.LaukaaSupabase) {
        if (!placeIdOrQuery || !supabaseClient) {
            return {
                selectedPlace: null,
                descendantPlaceIds: [],
                ancestorPlaceIds: [],
                relatedCompanyRelations: {},
                allPlaceIds: []
            };
        }

        try {
            // 1. Fetch active places for hierarchy tree traversal
            const { data: allPlaces, error } = await supabaseClient
                .from('places')
                .select('id, place_id, name, canonical_name, type, place_type, municipality, parent_place_id, lat, lon, tier, status')
                .neq('status', 'DELETED');

            if (error || !allPlaces || allPlaces.length === 0) {
                console.warn('getPlaceSearchContext: failed to load places', error);
                return { selectedPlace: null, descendantPlaceIds: [], ancestorPlaceIds: [], relatedCompanyRelations: {}, allPlaceIds: [] };
            }

            const targetQuery = String(placeIdOrQuery).trim().toLowerCase();

            // Find matching place by: UUID -> place_id -> canonical_name -> name
            let selected = allPlaces.find(p => p.id === placeIdOrQuery || (p.place_id && p.place_id.toLowerCase() === targetQuery));
            if (!selected) {
                selected = allPlaces.find(p => (p.canonical_name && p.canonical_name.toLowerCase() === targetQuery) || (p.name && p.name.toLowerCase() === targetQuery));
            }
            if (!selected) {
                selected = allPlaces.find(p => p.name && p.name.toLowerCase().includes(targetQuery));
            }

            if (!selected) {
                return { selectedPlace: null, descendantPlaceIds: [], ancestorPlaceIds: [], relatedCompanyRelations: {}, allPlaceIds: [] };
            }

            const targetUuid = selected.id;

            // 2. Find descendants (subtree) recursively using parent_place_id
            const descendantPlaceIds = [];
            const collectDescendants = (parentId) => {
                const children = allPlaces.filter(p => p.parent_place_id === parentId);
                children.forEach(child => {
                    if (!descendantPlaceIds.includes(child.id)) {
                        descendantPlaceIds.push(child.id);
                        collectDescendants(child.id);
                    }
                });
            };
            collectDescendants(targetUuid);

            // 3. Find ancestors (parent chain up to root)
            const ancestorPlaceIds = [];
            let current = selected;
            const visited = new Set([targetUuid]);
            while (current && current.parent_place_id && !visited.has(current.parent_place_id)) {
                visited.add(current.parent_place_id);
                const parent = allPlaces.find(p => p.id === current.parent_place_id);
                if (parent) {
                    ancestorPlaceIds.push(parent.id);
                    current = parent;
                } else {
                    break;
                }
            }

            // 4. Combined place IDs
            const allPlaceIds = Array.from(new Set([targetUuid, ...descendantPlaceIds, ...ancestorPlaceIds]));

            // 5. Fetch place_company_relations for all relevant place IDs
            let relatedCompanyRelations = {};
            try {
                const { data: pcrData, error: pcrErr } = await supabaseClient
                    .from('place_company_relations')
                    .select('company_id, place_id, context, confidence, verified, company_name')
                    .in('place_id', allPlaceIds);

                if (!pcrErr && pcrData) {
                    pcrData.forEach(rel => {
                        if (!relatedCompanyRelations[rel.company_id]) {
                            relatedCompanyRelations[rel.company_id] = [];
                        }
                        relatedCompanyRelations[rel.company_id].push(rel);
                    });
                }
            } catch (pcrError) {
                console.warn('getPlaceSearchContext: error fetching place_company_relations', pcrError);
            }

            return {
                selectedPlace: selected,
                descendantPlaceIds,
                ancestorPlaceIds,
                relatedCompanyRelations,
                allPlaceIds
            };
        } catch (err) {
            console.error('getPlaceSearchContext failed:', err);
            return { selectedPlace: null, descendantPlaceIds: [], ancestorPlaceIds: [], relatedCompanyRelations: {}, allPlaceIds: [] };
        }
    }

    toJSON() {
        return {
            targetPlace: this.targetPlace,
            includedPlaceIds: this.includedPlaceIds,
            themeId: this.themeId,
            query: this.query
        };
    }
}

if (typeof window !== 'undefined') {
    window.PlaceContext = PlaceContext;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PlaceContext };
}
