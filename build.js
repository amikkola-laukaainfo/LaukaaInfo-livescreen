const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('--- LaukaaInfo Build Script ---');

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

function minifyFolder(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            // Älä minifioi kuvakansioita turhaan
            if (entry.name !== 'icons' && entry.name !== 'drive_cache') {
                minifyFolder(fullPath);
            }
        } else {
            if (entry.name.endsWith('.js')) {
                console.log(' -> Minifioidaan JS:  ' + entry.name);
                try {
                    execSync(`npx terser "${fullPath}" -o "${fullPath}" -c -m`, { stdio: 'ignore' });
                } catch (e) {
                    console.error(' Virhe JS-tiedostossa: ' + entry.name);
                }
            } else if (entry.name.endsWith('.css')) {
                console.log(' -> Minifioidaan CSS: ' + entry.name);
                try {
                    execSync(`npx cleancss -o "${fullPath}" "${fullPath}"`, { stdio: 'ignore' });
                } catch (e) {
                    console.error(' Virhe CSS-tiedostossa: ' + entry.name);
                }
            } else if (entry.name.endsWith('.html')) {
                console.log(' -> Minifioidaan HTML: ' + entry.name);
                try {
                    execSync(`npx html-minifier --collapse-whitespace --remove-comments --minify-css true --minify-js true -o "${fullPath}" "${fullPath}"`, { stdio: 'ignore' });
                } catch (e) {
                    console.error(' Virhe HTML-tiedostossa: ' + entry.name);
                }
            }
        }
    }
}

minifyFolder(distDir);

console.log('\n======================================================');
console.log('✓ VALMIS! Tuotantoversio on nyt koottu kansioon: dist/');
console.log('Voit viedä "dist"-kansion sisällön turvallisesti julkiselle palvelimellesi.');
console.log('Koodit on pienennetty ja logiikkaa on vaikeampi lukea.');
console.log('======================================================\n');
