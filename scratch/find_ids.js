const fs = require('fs');
const data = JSON.parse(fs.readFileSync('d:/Projekteja/MUUTprojektit/LaukaaInfo-livescreen/LaukaaInfo-livescreen/live_companies.json', 'utf8'));

const targets = [
    "Tuulenväre", "Vuonteen Helmi", "Lempileivos", "Jyväs Pakari", "Merjan Risu", 
    "Ania", "Jenora", "Nuorva", "PS Studio", "AtSound", "Jäntti", "Sydän-Suomen", 
    "Väentupa", "Valoisat", "Väyrynen", "Arkiapupalvelut", "Majakka", "Aave", 
    "Renki", "Häkkinen", "Lapin Mies", "Tourunen", "Vehviläinen", "Sarahovi", 
    "Humina", "Notariaatti", "Mediazoo", "Onnellinen Studio", "Photo Malmström", 
    "Sujuvaa", "Varjola", "Sessio", "Tupaswilla", "Raitio", "OneFit"
];

const results = {};

data.results.forEach(c => {
    targets.forEach(t => {
        if (c.nimi.toLowerCase().includes(t.toLowerCase())) {
            results[t] = results[t] || [];
            results[t].push({ id: c.id, nimi: c.nimi });
        }
    });
});

console.log(JSON.stringify(results, null, 2));
