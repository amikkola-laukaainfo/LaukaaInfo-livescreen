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
