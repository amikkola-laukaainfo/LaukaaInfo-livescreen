const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'style.css');
const buffer = fs.readFileSync(filePath);
const lastBytes = buffer.slice(buffer.length - 1000);

console.log('Last 1000 bytes in hex:');
console.log(lastBytes.toString('hex').match(/.{1,2}/g).join(' '));

console.log('\nLast 1000 bytes as string:');
console.log(lastBytes.toString('utf8'));
