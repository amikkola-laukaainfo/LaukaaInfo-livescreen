const fs = require('fs');
const profiling = JSON.parse(fs.readFileSync('d:/Projekteja/MUUTprojektit/LaukaaInfo-livescreen/LaukaaInfo-livescreen/company_profiling_data.json', 'utf8'));
const varjolaId = 'company-263';
const p = profiling.profiles[varjolaId];
if (p) {
    console.log("Keys:", Object.keys(p));
    if (p.core) {
        console.log("Core keys:", Object.keys(p.core));
        console.log("Fits for:", JSON.stringify(p.core.fits_for));
    } else {
        console.log("NO CORE SECTION FOUND");
    }
} else {
    console.log("NO PROFILE FOUND");
}
