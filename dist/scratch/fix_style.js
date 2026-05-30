const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'style.css');
const buffer = fs.readFileSync(filePath);

// Filter out all null bytes (0x00)
const cleanBuffer = buffer.filter(b => b !== 0x00);

fs.writeFileSync(filePath, cleanBuffer);
console.log('style.css fixed! Null bytes removed.');
