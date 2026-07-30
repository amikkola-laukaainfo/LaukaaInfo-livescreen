const fs = require('fs');
const https = require('https');

// Asetukset
const MUNICIPALITY = "Laukaa";
const OUTPUT_FILE = "paikat_laukaa.json";

// Overpass API haku
// Etsii Laukaan alueelta nähtävyydet, luontokohteet, uimarannat, laavut, jne.
const query = `
[out:json][timeout:25];
area["name"="${MUNICIPALITY}"]["admin_level"="8"]->.searchArea;
(
  node["tourism"="attraction"](area.searchArea);
  way["tourism"="attraction"](area.searchArea);
  
  node["leisure"="nature_reserve"](area.searchArea);
  way["leisure"="nature_reserve"](area.searchArea);
  
  node["leisure"="park"](area.searchArea);
  way["leisure"="park"](area.searchArea);
  
  node["historic"](area.searchArea);
  way["historic"](area.searchArea);
  
  node["natural"="beach"](area.searchArea);
  way["natural"="beach"](area.searchArea);
  
  node["amenity"="shelter"](area.searchArea);
  
  node["tourism"="viewpoint"](area.searchArea);
);
out center;
`;

const encodedQuery = encodeURIComponent(query);
const url = `https://overpass-api.de/api/interpreter?data=${encodedQuery}`;

console.log(`Haetaan paikkoja kunnasta: ${MUNICIPALITY}...`);
console.log("Tämä voi kestää hetken.");

fetch(url, {
    method: 'GET',
    headers: {
        'User-Agent': 'LaukaaInfo/1.0 (test)'
    }
})
.then(response => {
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
})
.then(json => {
    console.log(`Löydettiin ${json.elements.length} kohdetta.`);
    
    const places = json.elements.map(el => {
        // Poimitaan koordinaatit
        const lat = el.lat || (el.center && el.center.lat);
        const lon = el.lon || (el.center && el.center.lon);
        
        // Määritellään tyyppi
        let type = "kohde";
        if (el.tags.tourism === 'attraction') type = 'nähtävyys';
        if (el.tags.leisure === 'nature_reserve') type = 'luontokohde';
        if (el.tags.leisure === 'park') type = 'puisto';
        if (el.tags.historic) type = 'historiallinen paikka';
        if (el.tags.natural === 'beach') type = 'uimaranta';
        if (el.tags.amenity === 'shelter') type = 'laavu';
        if (el.tags.tourism === 'viewpoint') type = 'näköalapaikka';

        // Nimi
        const name = el.tags.name || el.tags.description || `${type} (nimetön)`;

        return {
            source: "OSM",
            source_id: `${el.type}/${el.id}`,
            name: name,
            type: type,
            lat: lat,
            lon: lon,
            municipality: MUNICIPALITY,
            tags: el.tags // säästetään alkuperäiset tägit myöhempää käyttöä varten
        };
    });

    // Tallennetaan vain nimetyt tai relevantit kohteet
    const filteredPlaces = places.filter(p => !p.name.includes("nimetön") || p.type !== "kohde");
    
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(filteredPlaces, null, 2));
    console.log(`Tallannettiin ${filteredPlaces.length} nimettyä/luokiteltua kohdetta tiedostoon: ${OUTPUT_FILE}`);
})
.catch(error => {
    console.error("Virhe haettaessa tietoja:", error);
});
