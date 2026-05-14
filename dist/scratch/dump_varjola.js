const fs = require('fs');
const profiling = JSON.parse(fs.readFileSync('d:/Projekteja/MUUTprojektit/LaukaaInfo-livescreen/LaukaaInfo-livescreen/company_profiling_data.json', 'utf8'));
const varjolaId = 'company-263';
console.log(JSON.stringify(profiling.profiles[varjolaId], null, 2));
