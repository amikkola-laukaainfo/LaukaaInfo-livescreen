#!/usr/bin/env node
// Reads current index.html, fixes the Mojibake UTF-8 double-encoding, and writes it back.
// Run: node fix_html_encoding.js

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'index.html');

// Read raw bytes
const buf = fs.readFileSync(filePath);

// The file bytes are valid UTF-8 (Finnish chars like ä = 0xC3 0xA4),
// but at some point the content was read as Latin-1 and written as UTF-8 again,
// so each multi-byte UTF-8 sequence got double-encoded as UTF-8.
// "ä" (U+00E4) in UTF-8 = 0xC3 0xA4
// When wrongly read as Latin-1: "Ã" (0xC3) + "¤" (0xA4)
// Then saved as UTF-8: 0xC3 0x83 + 0xC2 0xA4 → "Ã¤"
// Fix: decode as Latin-1, then encode result as Latin-1 bytes, then interpret those bytes as UTF-8.

// Strategy: decode the file as Latin-1 to get the raw Unicode codepoints,
// then re-encode with the correct interpretation.

const latin1 = buf.toString('latin1');

// Now latin1 contains strings like "Ã¤" (two codepoints: 0xC3 and 0xA4).
// Create a buffer from those codepoints (treating them as raw bytes).
const fixedBuf = Buffer.from(latin1, 'latin1');

// Now fixedBuf should be the original correct UTF-8 bytes.
const fixed = fixedBuf.toString('utf8');

// Quick sanity check
if (fixed.includes('Kaikki Laukaasta yhdessä paikassa') || fixed.includes('Löydä')) {
    console.log('✅ Encoding looks correct - writing file.');
    fs.writeFileSync(filePath, fixedBuf);
    console.log('Done!');
} else {
    // Check what we actually got
    const idx = fixed.indexOf('Kaikki Laukaasta');
    console.log('Context around "Kaikki Laukaasta":', fixed.slice(idx, idx + 50));
    console.log('⚠️ Sanity check failed - file NOT written. Check the output above.');
}
