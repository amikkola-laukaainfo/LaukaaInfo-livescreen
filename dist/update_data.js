const fs = require('fs');
const https = require('https');
const path = require('path');

const dataSourceUrl = 'https://www.mediazoo.fi/laukaainfo-web/get_companies.php';
const targetFile = path.join(__dirname, 'companies_data.json');
const backupFile = path.join(__dirname, 'companies_data.json.bak');
const liveFile = path.join(__dirname, 'live_companies.json');
const liveBackupFile = path.join(__dirname, 'live_companies.json.bak');

console.log('--- LaukaaInfo Data Update Tool ---');
console.log(`Ladataan dataa osoitteesta: ${dataSourceUrl}`);

https.get(dataSourceUrl, (res) => {
    if (res.statusCode !== 200) {
        console.error(`Virhe: Palvelin palautti koodin ${res.statusCode}`);
        return;
    }

    res.setEncoding('utf8');
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        try {
            // Varmistetaan, että JSON on validia ennen tallennusta
            JSON.parse(data);

            // --- companies_data.json ---
            if (fs.existsSync(targetFile)) {
                fs.copyFileSync(targetFile, backupFile);
                console.log('Varmuuskopio luotu: companies_data.json.bak');
            }
            fs.writeFileSync(targetFile, data);
            console.log('✓ companies_data.json päivitetty.');

            // --- live_companies.json ---
            if (fs.existsSync(liveFile)) {
                fs.copyFileSync(liveFile, liveBackupFile);
                console.log('Varmuuskopio luotu: live_companies.json.bak');
            }
            fs.writeFileSync(liveFile, data);
            console.log('✓ live_companies.json päivitetty.');

            console.log('\nPäivitys valmis! Voit nyt ajaa "node build.js" luodaksesi premium-sivut.');
        } catch (e) {
            console.error('Virhe saaduissa tiedoissa: Data ei ole validia JSONia.');
            console.error(e.message);
        }
    });
}).on('error', (err) => {
    console.error('Virhe latauksessa:', err.message);
});
