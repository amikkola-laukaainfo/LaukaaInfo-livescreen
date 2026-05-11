const fs = require('fs');

// Load data
const companiesData = JSON.parse(fs.readFileSync('companies_data.json', 'utf8'));
const profilingData = JSON.parse(fs.readFileSync('company_profiling_data.json', 'utf8'));

// Extract NEEDS_CONFIG from JS file (simplified regex approach or just read as text)
const needsConfigContent = fs.readFileSync('needs_config.js', 'utf8');
const needsConfigMatch = needsConfigContent.match(/const NEEDS_CONFIG = ({[\s\S]*?});/);
if (!needsConfigMatch) {
    console.error("Could not find NEEDS_CONFIG in needs_config.js");
    process.exit(1);
}

// Evaluate the config (be careful with eval, but here it's our own code)
let NEEDS_CONFIG;
try {
    // Basic cleanup to make it JSON-ish if needed, or just eval it
    const configStr = needsConfigMatch[1];
    NEEDS_CONFIG = eval('(' + configStr + ')');
} catch (e) {
    console.error("Error parsing NEEDS_CONFIG:", e);
    process.exit(1);
}

const allCompanies = Array.isArray(companiesData) ? companiesData : (companiesData.results || []);

// Add profiling to companies for matching
allCompanies.forEach(c => {
    c.profiling = profilingData.profiles[`company-${c.id}`] || profilingData.profiles[c.id];
});

console.log(`Checking ${allCompanies.length} companies against NEEDS_CONFIG...\n`);

const emptyOptions = [];

for (const [needId, need] of Object.entries(NEEDS_CONFIG)) {
    console.log(`Checking Need: ${need.title} (${needId})`);
    const context = need.profilointi_context;

    need.steps.forEach(step => {
        step.options.forEach(opt => {
            const matches = allCompanies.filter(c => {
                // Simplified matching logic from palvelu.html
                
                // 1. Profilointi Match (fits_for)
                if (opt.require_fits_for) {
                    const score = c.profiling?.core?.fits_for?.[opt.require_fits_for.key] || 0;
                    if (score < opt.require_fits_for.min) return false;
                }

                // 2. Node Link Match
                if (opt.node_link) {
                    const links = c.profiling?.core?.node_links || [];
                    if (!links.includes(opt.node_link)) return false;
                }

                // 3. Profilointi Filter Match
                if (opt.profilointi_filter) {
                    const filter = opt.profilointi_filter;
                    const section = c.profiling?.[filter.section] || {};
                    if (section[filter.field] !== filter.value) {
                        // Special check for arrays
                        if (Array.isArray(section[filter.field])) {
                            if (!section[filter.field].includes(filter.value)) return false;
                        } else {
                            return false;
                        }
                    }
                }

                // 4. Tag Match
                if (opt.tags && opt.tags.length > 0) {
                    const companyContent = (
                        (c.tags || '') + ' ' + 
                        (c.kategoria || '') + ' ' + 
                        (c.nimi || '') + ' ' +
                        (c.profiling?.core?.sub_contexts?.join(' ') || '') + ' ' +
                        (c.profiling?.core?.node_links?.join(' ') || '')
                    ).toLowerCase();
                    
                    const tagMatch = opt.tags.some(tag => companyContent.includes(tag.toLowerCase()));
                    if (!tagMatch) return false;
                }

                return true;
            });

            if (matches.length === 0) {
                emptyOptions.push({
                    need: need.title,
                    step: step.question,
                    option: opt.label,
                    tags: opt.tags,
                    filter: opt.profilointi_filter
                });
            }
        });
    });
}

console.log("\n--- EMPTY OPTIONS (0 MATCHES) ---\n");
if (emptyOptions.length === 0) {
    console.log("None! All options have at least one match.");
} else {
    emptyOptions.forEach(eo => {
        console.log(`[${eo.need}] Step: "${eo.step}" -> Option: "${eo.option}"`);
        if (eo.tags) console.log(`   Missing Tags: ${eo.tags.join(', ')}`);
        if (eo.filter) console.log(`   Missing Filter: ${eo.filter.section}.${eo.filter.field} == ${eo.filter.value}`);
    });
}
