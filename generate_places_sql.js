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
        let type = "Muu kohde";
        
        if (props.leisure === 'pitch') type = "Urheilukenttä";
        else if (props.amenity === 'school') type = "Koulu";
        else if (props.amenity === 'library') type = "Kirjasto";
        else if (props.amenity === 'place_of_worship') type = "Kirkko/Kappeli";
        else if (props.amenity === 'clinic') type = "Terveyskeskus";
        else if (props.tourism === 'attraction') type = "Nähtävyys";
        else if (props.leisure === 'park') type = "Puisto";
        else if (props.natural === 'beach' || props.sport === 'beachvolleyball') type = "Uimaranta";

        const lat = geom.coordinates[1];
        const lon = geom.coordinates[0];
        
        const source_id = props['@id'] || props.id || '';
        
        // Kuntatieto
        let municipality = props['addr:city'] || DEFAULT_MUNICIPALITY;
        
        // Joillain kohteilla on kylä addr:city kentässä (esim. Lievestuore),
        // mutta haluamme ehkä pitää 'Laukaa' ja tarkentaa kylää erikseen,
        // mutta jätetään nyt niin kuin se datassa on, Laukaa-kontekstissa.
        
        sqlOutput += `INSERT INTO places (name, type, lat, lon, municipality, source, source_id) `;
        sqlOutput += `VALUES ('${name}', '${type}', ${lat}, ${lon}, '${municipality}', 'OSM_raw', '${source_id}');\n`;
        count++;
    });

    fs.writeFileSync(OUTPUT_FILE, sqlOutput);
    console.log(`Generoitiin ${count} paikan SQL INSERT -lauseet tiedostoon ${OUTPUT_FILE}`);
} catch (e) {
    console.error('Virhe:', e);
}
