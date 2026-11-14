const { createClient } = require('@supabase/supabase-js');
const sb = createClient('https://btwerbixrydfalqrpnmg.supabase.co', 'sb_publishable_8kDfiOTrAwvdb8ziM9XNMQ_CWc-vfat', { auth: { persistSession: false } });
(async () => {
    try {
        const projectId = '94c00dab-d164-4b9a-a5c2-00459a913125';
        const { data: relations, error: relError } = await sb.from('entity_relations').select('*').eq('target_id', projectId);
        if (relError) throw relError;
        
        const companyIds = relations.filter(r => r.source_type === 'COMPANY').map(r => r.source_id);
        const needIds = relations.filter(r => r.source_type === 'NEED').map(r => r.source_id);
        
        let companiesData = [];
        let needsData = [];
        
        if (companyIds.length > 0) {
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            const validUuids = companyIds.filter(id => uuidRegex.test(id));
            const externalIds = companyIds.filter(id => !uuidRegex.test(id));
            
            const promises = [];
            if (validUuids.length > 0) promises.push(sb.from('companies').select('id, name').in('id', validUuids));
            if (externalIds.length > 0) promises.push(sb.from('companies').select('external_id, name').in('external_id', externalIds));
            
            const results = await Promise.all(promises);
            results.forEach(res => {
                if (res.error) console.error("Companies Error:", res.error);
                if (res.data) {
                    const mapped = res.data.map(c => ({ id: c.id || c.external_id, name: c.name }));
                    companiesData.push(...mapped);
                }
            });
        }
        
        if (needIds.length > 0) {
            const { data, error } = await sb.from('opportunities').select('id, title').in('id', needIds);
            if (error) console.error("Needs Error:", error);
            if (data) needsData = data;
        }
        
        console.log("Companies:", companiesData);
        console.log("Needs:", needsData);
    } catch (e) {
        console.error("Catch:", e);
    }
})();
