const fs = require('fs');
const profiling = JSON.parse(fs.readFileSync('d:/Projekteja/MUUTprojektit/LaukaaInfo-livescreen/LaukaaInfo-livescreen/company_profiling_data.json', 'utf8'));
const varjolaId = 'company-263';
const p = profiling.profiles[varjolaId];
if (p && p.core && p.core.paired_with_by_context) {
    console.log("Paired with by context:", JSON.stringify(p.core.paired_with_by_context, null, 2));
} else {
    console.log("NO PAIRED_WITH_BY_CONTEXT FOUND");
}
