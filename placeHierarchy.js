/**
 * placeHierarchy.js
 * 
 * Manages the hierarchical place structure (PlaceHierarchy) for LaukaaInfo Web.
 * Mirrors the Android PlaceHierarchyManager logic.
 * 
 * Hierarchy levels:
 * - KUNTA (e.g., Laukaa)
 * - TAAJAMA (e.g., Lievestuore, Vihtavuori, Leppävesi, Vehniä, Laukaan kirkonkylä)
 * - KOHDE (e.g., Haarlan ranta, Peurunka, Saraakallio, Sataman uimaranta)
 */

const PLACE_TYPES = {
    KUNTA: 'KUNTA',
    TAAJAMA: 'TAAJAMA',
    KOHDE: 'KOHDE'
};

const PLACE_TYPE_LABELS = {
    KUNTA: 'Kunta',
    TAAJAMA: 'Taajama',
    KOHDE: 'Kohde'
};

// Standard predefined Taajamat in Laukaa for fallback mapping
const STANDARD_TAAJAMAT = [
    { id: 'taajama-lievestuore', name: 'Lievestuore', type: 'TAAJAMA', parent: 'kunta-laukaa' },
    { id: 'taajama-vihtavuori', name: 'Vihtavuori', type: 'TAAJAMA', parent: 'kunta-laukaa' },
    { id: 'taajama-leppavesi', name: 'Leppävesi', type: 'TAAJAMA', parent: 'kunta-laukaa' },
    { id: 'taajama-vehnia', name: 'Vehniä', type: 'TAAJAMA', parent: 'kunta-laukaa' },
    { id: 'taajama-kirkonkyla', name: 'Laukaan kirkonkylä', type: 'TAAJAMA', parent: 'kunta-laukaa' },
    { id: 'taajama-aijala', name: 'Äijälä', type: 'TAAJAMA', parent: 'kunta-laukaa' }
];

class PlaceHierarchy {
    constructor() {
        this.places = new Map();
        this.root = { id: 'kunta-laukaa', name: 'Laukaa', place_type: 'KUNTA', parent_place_id: null };
        this.places.set(this.root.id, this.root);

        // Load standard taajamat
        STANDARD_TAAJAMAT.forEach(t => {
            this.places.set(t.id, {
                id: t.id,
                name: t.name,
                canonical_name: t.name,
                place_type: 'TAAJAMA',
                parent_place_id: t.parent
            });
        });
    }

    /**
     * Load raw places array (from API or JSON) into hierarchy.
     */
    loadPlaces(placesArray = []) {
        placesArray.forEach(p => {
            const placeId = p.id || p.place_id || p.source_id;
            if (!placeId) return;

            let placeType = p.place_type || p.type;
            if (!placeType || ['SERVICE', 'BUILDING', 'LANDMARK', 'AREA', 'NATURE', 'ATTRACTION'].includes(placeType.toUpperCase())) {
                placeType = 'KOHDE';
            }

            // Determine parent place ID if not set
            let parentId = p.parent_place_id || null;
            if (!parentId && p.municipality) {
                const matchedTaajama = STANDARD_TAAJAMAT.find(t => 
                    t.name.toLowerCase() === p.municipality.toLowerCase() ||
                    p.municipality.toLowerCase().includes(t.name.toLowerCase())
                );
                parentId = matchedTaajama ? matchedTaajama.id : this.root.id;
            }

            this.places.set(placeId, {
                id: placeId,
                name: p.name,
                canonical_name: p.canonical_name || p.name,
                place_type: placeType,
                parent_place_id: parentId,
                lat: p.lat,
                lon: p.lon,
                municipality: p.municipality || 'Laukaa',
                description: p.description || ''
            });
        });
    }

    /**
     * Find place by ID or Exact/Partial Name
     */
    findPlace(idOrName) {
        if (!idOrName) return null;
        if (this.places.has(idOrName)) return this.places.get(idOrName);

        const query = String(idOrName).toLowerCase().trim();
        for (const place of this.places.values()) {
            if (place.name.toLowerCase() === query || (place.canonical_name && place.canonical_name.toLowerCase() === query)) {
                return place;
            }
        }
        return null;
    }

    /**
     * Get all child place IDs recursively for a target place.
     * If place is KUNTA or TAAJAMA, includes itself + all child places.
     * If place is KOHDE, returns only itself.
     */
    getIncludedPlaceIds(placeId) {
        const place = this.findPlace(placeId);
        if (!place) return [placeId];

        const results = new Set([place.id]);

        // Find direct and indirect children
        const addChildrenRecursive = (parentId) => {
            for (const p of this.places.values()) {
                if (p.parent_place_id === parentId && !results.has(p.id)) {
                    results.add(p.id);
                    addChildrenRecursive(p.id);
                }
            }
        };

        addChildrenRecursive(place.id);

        // Also include name matching if parentId wasn't explicit
        if (place.place_type === 'TAAJAMA') {
            for (const p of this.places.values()) {
                if (p.municipality && p.municipality.toLowerCase() === place.name.toLowerCase()) {
                    results.add(p.id);
                }
            }
        }

        return Array.from(results);
    }

    /**
     * Search places for autocomplete / dropdown
     */
    searchPlaces(query, limit = 10) {
        if (!query) return Array.from(this.places.values()).slice(0, limit);

        const q = query.toLowerCase().trim();
        const matches = [];

        for (const place of this.places.values()) {
            if (place.name.toLowerCase().includes(q)) {
                matches.push(place);
            }
            if (matches.length >= limit) break;
        }

        return matches;
    }
}

const defaultPlaceHierarchy = new PlaceHierarchy();

if (typeof window !== 'undefined') {
    window.PlaceHierarchy = PlaceHierarchy;
    window.defaultPlaceHierarchy = defaultPlaceHierarchy;
    window.PLACE_TYPES = PLACE_TYPES;
    window.PLACE_TYPE_LABELS = PLACE_TYPE_LABELS;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PlaceHierarchy, defaultPlaceHierarchy, PLACE_TYPES, PLACE_TYPE_LABELS };
}
