const fs = require('fs');
const data = JSON.parse(fs.readFileSync('d:/Projekteja/MUUTprojektit/LaukaaInfo-livescreen/LaukaaInfo-livescreen/live_companies.json', 'utf8'));

const keywords = [
    "Tuulenv", "Vuonteen", "Pakari", "Nuorva", "Studio", "Valoisat", "Lapin", 
    "Tourunen", "Sarahovi", "Humina", "Notariaatti", "Onnellinen", "Varjola"
];

const found = [];
data.results.forEach(c => {
    keywords.forEach(k => {
        if (c.nimi.toLowerCase().includes(k.toLowerCase())) {
            found.push({ id: c.id, nimi: c.nimi });
        }
    });
});

console.log(JSON.stringify(found, null, 2));
