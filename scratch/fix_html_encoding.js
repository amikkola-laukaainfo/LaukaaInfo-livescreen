#!/usr/bin/env node
// Diagnoses and fixes the encoding issue in index.html.

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'index.html');

// Read raw bytes
const buf = fs.readFileSync(filePath);

// Diagnose: what do the first bytes around "yhdess" look like?
const asUtf8 = buf.toString('utf8');
const idx = asUtf8.indexOf('yhdess');
console.log('As UTF-8 around "yhdess":', JSON.stringify(asUtf8.slice(idx, idx + 20)));

// Show bytes around that position
const byteIdx = buf.indexOf(Buffer.from('yhdess', 'utf8'));
console.log('Bytes around that position:', buf.slice(byteIdx, byteIdx + 20));

// Try decode: file was written as UTF-8 after being read as Windows-1252
// Attempt 1: read as latin1 → get raw codepoints → encode back to latin1 → decode as utf8
const step1 = buf.toString('latin1');
const step2 = Buffer.from(step1, 'latin1').toString('utf8');
const idx2 = step2.indexOf('yhdess');
console.log('After latin1→buffer→utf8:', JSON.stringify(step2.slice(idx2, idx2 + 20)));

// Attempt 2: file might be triple encoded - decode as utf8 then re-encode latin1 bytes as utf8
const step3 = Buffer.from(asUtf8, 'latin1').toString('utf8');
const idx3 = step3.indexOf('yhdess');
console.log('After utf8-as-latin1→utf8:', JSON.stringify(step3.slice(idx3, idx3 + 20)));
