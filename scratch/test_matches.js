const { isMatch } = require('../searchEngine.js');
const data = require('../company_profiling_data.json');
const companies = require('../companies_data.json').results;
const taxonomyData = require('../taxonomy.json');

// Mock global taxonomyData if needed
global.taxonomyData = taxonomyData;

companies.forEach(c => c.profiling = data.profiles[c.id] || null);

const cakeOption = { 
    label: 'Kakut / Leivonnaiset', 
    tags: ['leipomo', 'elintarvike'], 
    profilointi_filter: { 
        section: 'events_and_celebrations', 
        field: 'refinement_tags', 
        value: 'juhlakakku' 
    } 
};

const context = 'events_and_celebrations';

const matches = companies.filter(c => isMatch(c, cakeOption, context));

console.log('Matches for Kakut / Leivonnaiset:');
console.log(matches.map(c => c.nimi));

const videographerOption = { 
    label: 'Videokuvaaja', 
    tags: ['videotuotanto', 'videokuvaus', 'videokuvaaja'], 
    intent_codes: ['MEDIA_VIDEO'],
    profilointi_filter: { 
        section: 'events_and_celebrations', 
        field: 'refinement_tags', 
        value: 'häävideo' 
    } 
};

const videoMatches = companies.filter(c => isMatch(c, videographerOption, context));
console.log('\nMatches for Videokuvaaja:');
console.log(videoMatches.map(c => c.nimi));
