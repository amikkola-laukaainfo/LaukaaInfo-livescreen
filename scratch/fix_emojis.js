// Fix corrupted emoji content in need-icon divs
// The emojis were corrupted by the encoding process; restore from known good values.
const fs = require('fs');
const { execSync } = require('child_process');

// Get the correct emojis from the clean commit
const cleanHtml = execSync('git show 099d9bb:index.html').toString('utf8');
const cleanIcons = [...cleanHtml.matchAll(/class="need-icon">([^<]+)</g)].map(m => m[1]);

// Get the current broken content
let html = fs.readFileSync('index.html', 'utf8');
const brokenIcons = [...html.matchAll(/class="need-icon">([^<]+)</g)].map(m => m[1]);

console.log('Clean icons:', cleanIcons);
console.log('Broken icons:', brokenIcons.map(s => JSON.stringify(s)));
console.log('Count match:', cleanIcons.length === brokenIcons.length ? '✅' : '❌ MISMATCH');

if (cleanIcons.length === brokenIcons.length) {
    brokenIcons.forEach((broken, i) => {
        // Escape special regex chars in broken string
        const escaped = broken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        html = html.replace(`class="need-icon">${broken}<`, `class="need-icon">${cleanIcons[i]}<`);
    });
    fs.writeFileSync('index.html', html, 'utf8');
    console.log('✅ Emojis fixed and written!');
    
    // Verify
    const verify = [...fs.readFileSync('index.html','utf8').matchAll(/class="need-icon">([^<]+)</g)].map(m=>m[1]);
    verify.forEach((v,i) => console.log(`  ${i+1}. ${v}`));
} else {
    console.log('⚠️ Cannot auto-fix: icon counts differ');
    console.log('Broken:', brokenIcons);
}
