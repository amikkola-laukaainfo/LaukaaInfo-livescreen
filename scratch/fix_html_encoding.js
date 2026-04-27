#!/usr/bin/env node
// Fixes double-encoded UTF-8 (Mojibake) in index.html.
// Pattern: bytes c3 83 c2 a4 should be c3 a4 (ä), etc.
// Fix: read as utf8 string, re-interpret that string's codepoints as raw bytes, decode as utf8.

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'index.html');

const buf = fs.readFileSync(filePath);
const asUtf8 = buf.toString('utf8');

// Re-interpret the utf8-decoded string's codepoints as raw bytes, then decode as utf8
const fixedBuf = Buffer.from(asUtf8, 'latin1');
const fixed = fixedBuf.toString('utf8');

// Sanity check
if (fixed.includes('yhdessä paikassa') && fixed.includes('Löydä')) {
    fs.writeFileSync(filePath, fixedBuf);
    console.log('✅ Encoding fixed and file written successfully!');
    // Show a few fixed spots
    const spots = ['yhdessä', 'Löydä', 'Tiedä', 'Päätösten', 'Elämykset'];
    spots.forEach(s => console.log('  ✓', fixed.includes(s) ? s + ' OK' : s + ' NOT FOUND'));
} else {
    console.log('⚠️ Sanity check failed. Sample:', JSON.stringify(fixed.slice(fixed.indexOf('yhdess'), fixed.indexOf('yhdess') + 30)));
}
