
const companies = [
    {
        id: "company-2",
        nimi: "Mediazoo",
        tags: "digimedia, IT-palvelut, videokuvaus, valokuvaus, digitointi",
        profiling: {
            core: {
                fits_for: { "funerals-and-memorials": 70 },
                sub_contexts: ["muistovideo", "hautajaiskuvaus", "muistotilaisuuskuvaus"]
            },
            "funerals-and-memorials": {
                refinement_tags: {
                    "Yleinen": ["muistovideo", "kuvakooste", "hautajaiskuvaus", "muistotilaisuuskuvaus"]
                }
            }
        }
    },
    {
        id: "company-133",
        nimi: "Jenora Design",
        tags: "valokuvaus",
        profiling: {
            core: {
                fits_for: { "funerals-and-memorials": 70 },
                sub_contexts: ["valokuvaus", "hautajaiskuvaus"]
            },
            "funerals-and-memorials": {
                refinement_tags: ["hautajaiskuvaus", "muistokuva", "muotokuva"]
            }
        }
    }
];

const selections = {
    paatarve: { label: "Muistotilaisuus", sub_context: "muistotilaisuus" },
    _sub_contexts: ["muistotilaisuus"]
};

const opt = { 
    label: "Valokuvaus tilaisuudessa", 
    tags: ["valokuvaus", "hautajaiskuvaus"], 
    profilointi_filter: { 
        section: "funerals_and_memorials", 
        field: "refinement_tags", 
        value: "hautajaiskuvaus" 
    } 
};

function getCategoryData(c, key) {
    const mappedKey = key;
    const underscoreKey = mappedKey.replace(/-/g, '_');
    const hyphenKey = mappedKey.replace(/_/g, '-');
    return c.profiling[underscoreKey] || c.profiling[hyphenKey] || c.profiling[mappedKey];
}

function checkFuzzyMatch(target, query) {
    if (!target || !query) return false;
    const t = String(target).toLowerCase();
    const q = String(query).toLowerCase();
    return t === q || t.includes(q) || q.includes(t);
}

const currentProfilingKey = "funerals_and_memorials";

companies.forEach(c => {
    console.log(`Checking ${c.nimi}...`);
    
    // Sub-context match logic
    const companySubContexts = c.profiling?.core?.sub_contexts || [];
    let isSubContextMatch = selections._sub_contexts.some(sc => companySubContexts.includes(sc));
    
    if (!isSubContextMatch) {
        const bases = ['hää', 'yrity', 'juhla', 'hautaja', 'kokous', 'syntymä', 'muisto'];
        const hasCommonBase = selections._sub_contexts.some(sc => {
            const scLower = sc.toLowerCase();
            return bases.some(b => scLower.includes(b) && companySubContexts.some(csc => csc.toLowerCase().includes(b)));
        });
        if (hasCommonBase) isSubContextMatch = true;
    }
    console.log(`  isSubContextMatch: ${isSubContextMatch}`);

    // Profiling filter logic
    let isProfiledMatch = false;
    if (opt.profilointi_filter) {
        const pf = opt.profilointi_filter;
        const catData = getCategoryData(c, pf.section);
        let match = false;
        if (catData) {
            const actualVal = catData[pf.field];
            if (Array.isArray(actualVal)) {
                match = actualVal.some(v => checkFuzzyMatch(v, pf.value));
            } else if (typeof actualVal === 'object' && actualVal !== null) {
                match = Object.values(actualVal).flat().some(v => checkFuzzyMatch(v, pf.value));
            }
            if (match) isProfiledMatch = true;
        }
    }
    console.log(`  isProfiledMatch: ${isProfiledMatch}`);
    
    // Final match logic
    const companyContent = (
        (c.tags || '') + ' ' + 
        (c.nimi || '') + ' ' +
        (c.profiling?.core?.sub_contexts?.join(' ') || '')
    ).toLowerCase();
    const tagMatch = opt.tags.some(tag => companyContent.includes(tag.toLowerCase()));
    console.log(`  tagMatch: ${tagMatch}`);
    
    const finalMatch = isProfiledMatch || tagMatch;
    console.log(`  Final Match: ${finalMatch}`);
});
