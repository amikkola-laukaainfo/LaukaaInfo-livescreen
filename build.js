const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');

console.log('--- LaukaaInfo Build Script ---');

async function runBuild() {
    // Generate a build version (hash of current time)
    const buildVersion = crypto.createHash('md5').update(Date.now().toString()).digest('hex').substring(0, 8);
    console.log(`Build Version: ${buildVersion}`);

    // 1. Asennetaan paketit devDependencies-osioon (jos ei jo asennettu)
console.log('1. Tarkistetaan ja asennetaan minifiintipaketit... (Tämä voi kestää hetken)');
try {
    execSync('npm install --no-save terser clean-css-cli html-minifier', { stdio: 'ignore' });
} catch (e) {
    console.log('Pakettien asennuksessa tapahtui virhe, mutta yritetään jatkaa.');
}

// 2. Luodaan tai tyhjennetään dist-kansio
const distDir = path.join(__dirname, 'dist');
if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true, force: true });
}
fs.mkdirSync(distDir);

// 3. Kopioidaan tiedostot
console.log('2. Kopioidaan tiedostot dist-kansioon...');
function copyRecursive(src, dest) {
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
        // Ohitetaan nämä tiedostot ja kansiot
        if (['node_modules', '.git', 'dist', 'build.js', 'package.json', 'package-lock.json'].includes(entry.name)) continue;
        if (entry.name.endsWith('.md')) continue;

        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            fs.mkdirSync(destPath, { recursive: true });
            copyRecursive(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}
copyRecursive(__dirname, distDir);

// 4. Minifioidaan kaikki JS, CSS ja HTML -tiedostot dist-kansiossa
console.log('3. Aloitetaan obfuskointi/minifiointi (JS, CSS, HTML)...');

const assetMap = {};

function minifyAndVersionFolder(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            // Älä minifioi kuvakansioita turhaan
            if (entry.name !== 'icons' && entry.name !== 'drive_cache') {
                minifyAndVersionFolder(fullPath);
            }
        } else {
            if (entry.name.endsWith('.js') && entry.name !== 'sw.js') {
                console.log(' -> Minifioidaan ja versioidaan JS:  ' + entry.name);
                try {
                    execSync(`npx terser "${fullPath}" -o "${fullPath}" -c -m`);
                    const newName = entry.name.replace('.js', `.${buildVersion}.js`);
                    const newPath = path.join(dir, newName);
                    fs.renameSync(fullPath, newPath);
                    assetMap[entry.name] = newName;
                } catch (e) {
                    console.error(' Virhe JS-tiedostossa: ' + entry.name, e.message);
                }
            } else if (entry.name.endsWith('.css')) {
                console.log(' -> Minifioidaan ja versioidaan CSS: ' + entry.name);
                try {
                    execSync(`npx cleancss -o "${fullPath}" "${fullPath}"`);
                    const newName = entry.name.replace('.css', `.${buildVersion}.css`);
                    const newPath = path.join(dir, newName);
                    fs.renameSync(fullPath, newPath);
                    assetMap[entry.name] = newName;
                } catch (e) {
                    console.error(' Virhe CSS-tiedostossa: ' + entry.name, e.message);
                }
            } else if (entry.name.endsWith('.html')) {
                console.log(' -> Minifioidaan HTML: ' + entry.name);
                try {
                    execSync(`npx html-minifier --collapse-whitespace --remove-comments --minify-css true --minify-js true -o "${fullPath}" "${fullPath}"`);
                } catch (e) {
                    console.error(' Virhe HTML-tiedostossa: ' + entry.name, e.message);
                }
            }
        }
    }
}

minifyAndVersionFolder(distDir);

// 4.5 Generoidaan premium-yritysten staattiset sivut
try {
    const { generatePremiumPages } = require('./generate_premium.js');
    generatePremiumPages();
} catch (e) {
    console.error('Virhe premium-sivujen generoinnissa:', e.message);
}

// 5. Päivitetään HTML-tiedostojen viittaukset ja luodaan version.json
console.log('4. Päivitetään viittaukset HTML-tiedostoihin...');

function updateReferences(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            updateReferences(fullPath);
        } else if (entry.name.endsWith('.html')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            
            // 4.6 Pakotetaan HTML-tiedostoihin erittäin tiukat selaimen välimuistin ohitukset
            const noCacheMeta = '<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate"><meta http-equiv="Pragma" content="no-cache"><meta http-equiv="Expires" content="0">';
            if (!content.includes('must-revalidate')) {
                // Toimii sekä tavallisen että minifioidun HTML:n kanssa
                content = content.replace(/<head>/i, '<head>' + noCacheMeta);
            }
            
            for (const [oldName, newName] of Object.entries(assetMap)) {
                // Etsitään viittauksia tiedostoon (esim. src="script.js" tai href="style.css" tai "../style.css")
                // Käytetään parannettua regexiä joka tukee myös ../ polkuja
                const regex = new RegExp(`(["'\\/]|\\.\\.\\/)${oldName}(["'\\?])`, 'g');
                content = content.replace(regex, `$1${newName}$2`);
            }
            fs.writeFileSync(fullPath, content);
        } else if (entry.name === 'sw.js') {
            let content = fs.readFileSync(fullPath, 'utf8');
            for (const [oldName, newName] of Object.entries(assetMap)) {
                const regex = new RegExp(`(["'\\/]|\\.\\.\\/)${oldName}(["'\\?])`, 'g');
                content = content.replace(regex, `$1${newName}$2`);
            }
            fs.writeFileSync(fullPath, content);
        }
    }
}

updateReferences(distDir);

// Luodaan version.json sw.js:lle ja frontendille
fs.writeFileSync(path.join(distDir, 'version.json'), JSON.stringify({ version: buildVersion, date: new Date().toISOString() }, null, 2));

// Päivitetään sw.js tiedoston sisäinen versio, jotta laitteet osaavat ladata uuden välimuistin!
let swPath = path.join(distDir, 'sw.js');
if (fs.existsSync(swPath)) {
    let swContent = fs.readFileSync(swPath, 'utf8');
    swContent = swContent.replace(/const VERSION = ['"].*?['"];/, `const VERSION = '${buildVersion}';`);
    fs.writeFileSync(swPath, swContent);
}

console.log('\n======================================================');
console.log('✓ VALMIS! Tuotantoversio on nyt koottu kansioon: dist/');
console.log('Versio: ' + buildVersion);
console.log('Voit viedä "dist"-kansion sisällön turvallisesti julkiselle palvelimellesi.');
console.log('======================================================\n');
}

runBuild();
