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

const mapping = {};
targets.forEach(t => {
    const found = data.results.find(c => c.nimi.toLowerCase().includes(t.toLowerCase()));
    if (found) {
        mapping[t] = found.id;
    } else {
        mapping[t] = "MISSING";
    }
});

console.log(JSON.stringify(mapping, null, 2));
