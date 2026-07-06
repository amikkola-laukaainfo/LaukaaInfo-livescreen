const fs = require('fs');
const files = ['d:/Projekteja/MUUTprojektit/LaukaaInfo-livescreen/LaukaaInfo-livescreen/live_companies.json', 'd:/Projekteja/MUUTprojektit/LaukaaInfo-livescreen/LaukaaInfo-livescreen/temp_companies.json'];

const keywords = [
    "Tuulenv", "Helmi", "Pakari", "Nuorva", "Studio", "Valoisat", "Lapin", 
    "Tourunen", "Sarahovi", "Humina", "Notariaatti", "Onnellinen", "Varjola", "Syd", "Tupaswilla"
];

keywords.forEach(k => {
    files.forEach(f => {
        if (!fs.existsSync(f)) return;
        const data = JSON.parse(fs.readFileSync(f, 'utf8'));
        const items = data.results || data; // handle different formats
        items.forEach(c => {
            if (c.nimi && c.nimi.toLowerCase().includes(k.toLowerCase())) {
                console.log(`${k} -> ID: ${c.id}, Name: ${c.nimi} (Source: ${f})`);
            }
        });
    });
});
