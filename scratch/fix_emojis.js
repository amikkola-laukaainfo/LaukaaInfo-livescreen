// Fix corrupted emoji content in need-icon divs using positional replacement
// The clean commit has 14 icons, current file has 18 (extra ones from new cards we added)
// Strategy: replace ALL broken need-icon content by rebuilding from the clean version's structure
// then applying the new need-cards that were added later.

const fs = require('fs');
const { execSync } = require('child_process');

// Get the correct structure from the latest commit that still had good emojis (before encoding corruption)
// bf9cd5e = "feat: update service category dropdown menus" - this should have the full set
const cleanHtml = execSync('git show bf9cd5e:index.html').toString('utf8');
const cleanIconMatches = [...cleanHtml.matchAll(/class="need-icon">([^<]+)</g)];
console.log('Clean icons from bf9cd5e:', cleanIconMatches.length, cleanIconMatches.map(m=>m[1]));

// Also check needs_config.js for the icon mapping
const needsConfig = fs.readFileSync('needs_config.js', 'utf8');
const iconMatches = [...needsConfig.matchAll(/icon:\s*['"]([^'"]+)['"]/g)];
console.log('\nIcons from needs_config.js:', iconMatches.map(m=>m[1]));
