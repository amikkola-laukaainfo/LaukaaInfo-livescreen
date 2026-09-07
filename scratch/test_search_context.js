/**
 * scratch/test_search_context.js
 * 
 * Verification script for PlaceHierarchy, PlaceContext, and executeContextSearch.
 */

const { PlaceHierarchy, PLACE_TYPES } = require('../placeHierarchy.js');
const { PlaceContext } = require('../placeContext.js');
const { executeContextSearch } = require('../searchEngine.js');

console.log('--- Testing PlaceHierarchy & PlaceContext ---');

const hierarchy = new PlaceHierarchy();

// Load sample places
hierarchy.loadPlaces([
    { id: 'lievestuore', name: 'Lievestuore', place_type: 'TAAJAMA', municipality: 'Laukaa' },
    { id: 'haarlan-ranta', name: 'Haarlan ranta', place_type: 'KOHDE', parent_place_id: 'lievestuore', municipality: 'Lievestuore' },
    { id: 'peurunka', name: 'Peurunka', place_type: 'KOHDE', parent_place_id: 'kunta-laukaa', municipality: 'Laukaa' }
]);

const lievestuorePlace = hierarchy.findPlace('Lievestuore');
console.log('Found Lievestuore:', lievestuorePlace ? lievestuorePlace.name : 'null');

const includedIds = hierarchy.getIncludedPlaceIds('lievestuore');
console.log('Included place IDs for Lievestuore:', includedIds);

const ctxLievestuore = PlaceContext.create('lievestuore', hierarchy, 'aamiainen');
console.log('Lievestuore PlaceContext:', ctxLievestuore.toJSON());

// Verify matching
console.log('Matches Haarlan ranta in Lievestuore context:', ctxLievestuore.matchesPlace('haarlan-ranta'));
console.log('Matches Peurunka in Lievestuore context:', ctxLievestuore.matchesPlace('peurunka'));

// Test executeContextSearch
const sampleCompanies = [
    { id: 'c1', name: 'Laukaan Satamakahvila', place_id: 'haarlan-ranta', municipality: 'Lievestuore', category: 'Ravintolat', actor_themes: ['aamiainen', 'kahvila'] },
    { id: 'c2', name: 'Peurunka Kylpylä', place_id: 'peurunka', municipality: 'Laukaa', category: 'Hyvinvointi', actor_themes: ['kylpylä'] }
];

const samplePlaces = [
    { id: 'haarlan-ranta', name: 'Haarlan ranta', municipality: 'Lievestuore' },
    { id: 'peurunka', name: 'Peurunka', municipality: 'Laukaa' }
];

const searchResults = executeContextSearch(ctxLievestuore, sampleCompanies, samplePlaces, []);
console.log('\n--- Search Results for query="aamiainen" placeContext="Lievestuore" ---');
console.log('Companies found:', searchResults.companies.map(c => c.name));
console.log('Places found:', searchResults.places.map(p => p.name));

if (searchResults.companies.length === 1 && searchResults.companies[0].name === 'Laukaan Satamakahvila') {
    console.log('\n✅ VERIFICATION SUCCESS: Decoupled 3D PlaceContext search correctly resolved Haarlan ranta under Lievestuore!');
} else {
    console.error('\n❌ VERIFICATION FAILED: Expected Laukaan Satamakahvila in Lievestuore context');
    process.exit(1);
}
