const fs = require('fs');
const path = require('path');

const RAW_FILE = 'karttakohteet_raw.json';
const OUTPUT_FILE = 'paikat_insert.sql';
const DEFAULT_MUNICIPALITY = 'Laukaa';

try {
    const rawData = fs.readFileSync(RAW_FILE, 'utf-8');
    const geojson = JSON.parse(rawData);
    
    let sqlOutput = "-- Paikkarekisterin data generoituna karttakohteet_raw.json -tiedostosta\n\n";
    let count = 0;

    geojson.features.forEach(feature => {
        const props = feature.properties;
        const geom = feature.geometry;
        
        // Vain nimetyt kohteet ja pistemäiset sijainnit (tai sellaiset joista saa keskipisteen)
        if (!props.name || !geom || geom.type !== 'Point') {
            return;
        }

        const name = props.name.replace(/'/g, "''"); // escape SQL string
        
        // Yksinkertainen canonical_name (voidaan myöhemmin rikastaa AI:lla)
        let canonicalName = name.replace(/( koulu| kirkko| uimaranta| kylpylä| satama| päiväkoti)/i, "").trim();
        
        let type = "AREA"; // Default
        
        if (props.leisure === 'pitch' || props.sport) type = "SERVICE";
        else if (props.amenity === 'school') type = "BUILDING";
        else if (props.amenity === 'library') type = "SERVICE";
        else if (props.amenity === 'place_of_worship') type = "LANDMARK";
        else if (props.amenity === 'clinic') type = "SERVICE";
        else if (props.tourism === 'attraction') type = "LANDMARK";
        else if (props.leisure === 'park') type = "AREA";
        else if (props.natural === 'beach' || props.sport === 'beachvolleyball') type = "NATURE";
        else if (props.natural || props.leisure === 'nature_reserve') type = "NATURE";

        const lat = geom.coordinates[1];
        const lon = geom.coordinates[0];
        
        const source_id = props['@id'] || props.id || '';
        
        // Kuntatieto
        let municipality = props['addr:city'] || DEFAULT_MUNICIPALITY;
        let municipality_id = municipality.toLowerCase().replace(/ä/g, 'a').replace(/ö/g, 'o').trim();
        
        // Oletetaan että nämä ovat Laukaan kohteita -> importance esim 50, verified = true
        let importance = 50;
        
        // Jos on Peurunka tai Saraakallio, nostetaan importancea demona
        if (name.includes('Peurunka') || name.includes('Saraakallio')) importance = 90;
        
        sqlOutput += `INSERT INTO places (name, canonical_name, type, lat, lon, municipality, municipality_id, importance, verified, created_by, status, source, source_id) `;
        sqlOutput += `VALUES ('${name}', '${canonicalName}', '${type}', ${lat}, ${lon}, '${municipality}', '${municipality_id}', ${importance}, true, 'SYSTEM', 'ACTIVE', 'OSM', '${source_id}');\n`;
        count++;
    });

    fs.writeFileSync(OUTPUT_FILE, sqlOutput);
    console.log(`Generoitiin ${count} paikan SQL INSERT -lauseet tiedostoon ${OUTPUT_FILE}`);
} catch (e) {
    console.error('Virhe:', e);
}
