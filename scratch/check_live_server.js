const https = require('https');

function get(urlStr) {
    return new Promise((resolve, reject) => {
        https.get(urlStr, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ status: res.statusCode, body: data }));
        }).on('error', reject);
    });
}

async function run() {
    const htmlRes = await get('https://laukaainfo.fi/tietoa-paikasta.html?id=54bf89b2-9e5d-46e0-9a9d-395f768c4195');
    const matches = htmlRes.body.match(/tietoa-paikasta\.[a-f0-9]+\.js/g);
    console.log('Script tag in live HTML:', matches);

    if (matches && matches.length > 0) {
        const jsRes = await get(`https://laukaainfo.fi/${matches[0]}`);
        console.log('Live JS status:', jsRes.status);
        console.log('Includes loadMixonetContentForPlace:', jsRes.body.includes('loadMixonetContentForPlace'));
        console.log('Includes mixonet-projects-container:', jsRes.body.includes('mixonet-projects-container'));
        console.log('Includes fixed cleanNameValue:', jsRes.body.includes('cleanNameValue'));
    }
}
run();
