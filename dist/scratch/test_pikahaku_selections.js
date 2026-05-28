/**
 * Varmistaa hautajaiset-pikahaun valintapolun tuottaa saman flatSelections-joukon.
 * Aja: node scratch/test_pikahaku_selections.js
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const needsSrc = fs.readFileSync(path.join(root, 'needs_config.js'), 'utf8')
    .replace(/^const NEEDS_CONFIG\s*=/m, 'global.NEEDS_CONFIG =');
eval(needsSrc);
const NEEDS_CONFIG = global.NEEDS_CONFIG;
const selSrc = fs.readFileSync(path.join(root, 'palvelu-selections.js'), 'utf8')
    .replace(/\}\)\(typeof window !== 'undefined' \? window : global\);?\s*$/, '})(global);');
eval(selSrc);

const need = NEEDS_CONFIG.hautajaiset;
const memorial = need.steps[0].options.find(o => o.id === 'OPT_FUNERAL_MEMORIAL');
const cap20 = need.steps[2].options.find(o => o.id === 'OPT_FUNERAL_CAP_20');
const catering = need.steps[3].options.find(o => o.id === 'OPT_FUNERAL_CATERING');
const photo = need.steps[5].options.find(o => o.id === 'OPT_FUNERAL_MEM_PHOTO');

const selections = {
    paatarve: [memorial],
    kapasiteetti: cap20,
    muistotilaisuus_lisapalvelut: [catering],
    muistot_ja_tallennus: [photo]
};

const searchable = PalveluSelections.filterSelectionsForSearch('hautajaiset', selections);
const flat = PalveluSelections.flattenSelections(searchable);
const ids = flat.map(o => o.id).sort();

const expected = [
    'OPT_FUNERAL_CAP_20',
    'OPT_FUNERAL_CATERING',
    'OPT_FUNERAL_MEMORIAL',
    'OPT_FUNERAL_MEM_PHOTO'
].sort();

const memorialMatch = PalveluSelections.matchIsSelected('paatarve', 'Muistotilaisuus', selections, 'hautajaiset');
const skipKapasiteetti = PalveluSelections.evaluateSkipIf(
    need.steps[2].skipIf,
    selections,
    'hautajaiset'
);

console.log('matchIsSelected Muistotilaisuus:', memorialMatch);
console.log('skip kapasiteetti (should be false):', skipKapasiteetti);
console.log('flat ids:', ids);
console.log('expected:', expected);

const ok = JSON.stringify(ids) === JSON.stringify(expected);
if (!ok) {
    console.error('FAIL: flat selection ids mismatch');
    process.exit(1);
}
console.log('OK: hautajaiset flat selections match guided flow');
