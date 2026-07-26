const fs = require('fs');
const data = JSON.parse(fs.readFileSync('company_profiling_data.json', 'utf8'));
const profiles = data.profiles;

const results = { electrical: [], furniture: [], missingConstruction: [] };

for (const [id, p] of Object.entries(profiles)) {
  const fits = p.core?.fits_for || {};
  const subCtx = (p.core?.sub_contexts || []).join(' ').toLowerCase();
  const constFits = fits['construction-and-maintenance'] ?? -1;
  const cAndM = p.construction_and_maintenance || {};
  const rtags = (cAndM.refinement_tags || []).join(' ').toLowerCase();

  // 1. Sähkötyöt: korkea construction-and-maintenance pisteet TAI sub_contexts sisältää sähkö
  const hasSahko = subCtx.includes('sähk') || rtags.includes('sähk') ||
                   subCtx.includes('electric') || subCtx.includes('sahk');
  if (constFits >= 20 || hasSahko) {
    results.electrical.push({
      id, name: p.name,
      fits: constFits,
      priority: p.core?.priority_score,
      emergency: cAndM.emergency_service,
      subCtx: p.core?.sub_contexts || [],
      rtags: cAndM.refinement_tags || [],
      housing_specialized: cAndM.housing_company_specialized,
      electrician: p.moving_and_housing?.electrician_available
    });
  }

  // 2. Kalustekorjaus: sub_contexts tai rtags sisältää kaluste, huonekalu, puutyö, sisustus, verhoilu, keittiö, pintaremontti
  const furnitureKeywords = ['kaluste', 'huonekalu', 'puutyö', 'verhoilu', 'sisustus', 'keittiöremontti', 'pintaremontti', 'kalustekorjaus', 'puualan', 'puutuote'];
  const isFurniture = furnitureKeywords.some(k => subCtx.includes(k) || rtags.includes(k));
  if (isFurniture) {
    results.furniture.push({
      id, name: p.name,
      fits: constFits,
      subCtx: p.core?.sub_contexts || [],
      rtags: cAndM.refinement_tags || []
    });
  }

  // 3. Yrityksillä joilla ei ole construction-and-maintenance kontekstia lainkaan, mutta sub_contexts viittaa rakentamiseen
  const buildingWords = ['rakentaminen', 'remontti', 'sähkö', 'lvi', 'putkimies', 'maalari', 'lattia'];
  const looksLikeConstruction = buildingWords.some(k => subCtx.includes(k));
  if (looksLikeConstruction && constFits < 20) {
    results.missingConstruction.push({
      id, name: p.name,
      fits: constFits,
      subCtx: p.core?.sub_contexts || []
    });
  }
}

console.log('\n====== SÄHKÖTYÖT / REMONTTI (construction-and-maintenance >= 20 tai sähkö sub_ctx) ======');
if (results.electrical.length === 0) {
  console.log('  ⚠️  EI YHTÄÄN YRITYSTÄ - vakava puute!');
} else {
  results.electrical.forEach(e => {
    console.log(`\n  [${e.id}] ${e.name}`);
    console.log(`    fits_for[construction-and-maintenance]: ${e.fits}`);
    console.log(`    priority_score: ${e.priority}`);
    console.log(`    emergency_service: ${e.emergency}`);
    console.log(`    electrician_available(moving ctx): ${e.electrician}`);
    console.log(`    sub_contexts: ${e.subCtx.join(', ')}`);
    console.log(`    construction refinement_tags: ${e.rtags.join(', ')}`);
  });
}

console.log('\n====== KALUSTEKORJAUS ======');
if (results.furniture.length === 0) {
  console.log('  ⚠️  EI YHTÄÄN YRITYSTÄ - kategoria puuttuu kokonaan!');
} else {
  results.furniture.forEach(e => {
    console.log(`\n  [${e.id}] ${e.name}`);
    console.log(`    fits_for[construction-and-maintenance]: ${e.fits}`);
    console.log(`    sub_contexts: ${e.subCtx.join(', ')}`);
    console.log(`    construction refinement_tags: ${e.rtags.join(', ')}`);
  });
}

console.log('\n====== PUUTTUVAT: Rakentamiseen viittaavat, mutta matala construction-fits ======');
if (results.missingConstruction.length === 0) {
  console.log('  OK - ei löytynyt puutteellisia profiileja');
} else {
  results.missingConstruction.forEach(e => {
    console.log(`\n  [${e.id}] ${e.name} (fits=${e.fits})`);
    console.log(`    sub_contexts: ${e.subCtx.join(', ')}`);
  });
}

console.log('\n====== YHTEENVETO ======');
console.log(`Sähkötyöt/remontti: ${results.electrical.length} yritystä`);
console.log(`Kalustekorjaus: ${results.furniture.length} yritystä`);
console.log(`Puutteellisia rakennusprofiileja: ${results.missingConstruction.length} yritystä`);
