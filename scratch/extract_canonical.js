const fs = require('fs');

const content = fs.readFileSync('needs_config.js', 'utf8');

const tags = new Set();
const subContexts = new Set();
const refinementTags = new Set();
const nodeLinks = new Set();

const tagsMatches = content.matchAll(/"tags"\s*:\s*\[([^\]]+)\]/g);
for (const match of tagsMatches) {
    const list = match[1].replace(/"/g, '').split(',').map(s => s.trim()).filter(s => s);
    list.forEach(t => tags.add(t));
}

const subContextMatches = content.matchAll(/"sub_context"\s*:\s*"([^"]+)"/g);
for (const match of subContextMatches) {
    subContexts.add(match[1]);
}

const filterMatches = content.matchAll(/"profilointi_filter"\s*:\s*\{[^}]*"value"\s*:\s*(?:true|false|"([^"]+)")/g);
for (const match of filterMatches) {
    if (match[1]) refinementTags.add(match[1]);
}

const nodeLinkMatches = content.matchAll(/"node_link"\s*:\s*"([^"]+)"/g);
for (const match of nodeLinkMatches) {
    nodeLinks.add(match[1]);
}

console.log('--- Canonical Tags ---');
console.log(Array.from(tags).sort().join(', '));
console.log('\n--- Canonical SubContexts ---');
console.log(Array.from(subContexts).sort().join(', '));
console.log('\n--- Canonical Refinement Tags ---');
console.log(Array.from(refinementTags).sort().join(', '));
console.log('\n--- Canonical Node Links ---');
console.log(Array.from(nodeLinks).sort().join(', '));
