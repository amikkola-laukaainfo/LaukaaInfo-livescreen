// Fix corrupted emoji content in need-icon divs
// Uses the clean icons from commit bf9cd5e (18 icons matching current file)

const fs = require('fs');
const { execSync } = require('child_process');

const cleanHtml = execSync('git show bf9cd5e:index.html').toString('utf8');
const cleanIcons = [...cleanHtml.matchAll(/class="need-icon">([^<]+)</g)].map(m => m[1]);

let html = fs.readFileSync('index.html', 'utf8');

// Replace each broken need-icon content positionally
let count = 0;
html = html.replace(/(?<=class="need-icon">)[^<]+(?=<)/g, () => {
    const replacement = cleanIcons[count] || '';
    count++;
    return replacement;
});

fs.writeFileSync('index.html', html, 'utf8');
console.log(`✅ Replaced ${count} need-icon emojis`);

// Verify
const verify = [...fs.readFileSync('index.html', 'utf8').matchAll(/class="need-icon">([^<]+)</g)].map(m => m[1]);
verify.forEach((v, i) => console.log(`  ${i + 1}. ${v}`));
