// Fix script: replace renderRelatedPlacesForYritys with two-step fetch
const fs = require('fs');
const path = 'yrityskortti.js';
let content = fs.readFileSync(path, 'utf8');

const OLD = `    async function renderRelatedPlacesForYritys(companyId) {
        try {
            const rawId = String(companyId).replace('company-', '');

            // Paikkaverkko-data on eri Supabase-projektissa (profilointi)
            const PAIKKA_URL = 'https://duxluwyqxvbmkkjzuzkz.supabase.co';
            const PAIKKA_KEY = 'sb_publishable_HgfWyipuSO7gvsVUR1smNQ_aXox2OPu';

            const res = await fetch(
                \`\${PAIKKA_URL}/rest/v1/place_company_relations?select=place_id,context,places(name,canonical_name,type,municipality)&company_id=eq.\${rawId}\`,
                {
                    headers: {
                        'apikey': PAIKKA_KEY,
                        'Authorization': \`Bearer \${PAIKKA_KEY}\`,
                        'Accept': 'application/json'
                    }
                }
            );

            if (!res.ok) {
                console.warn('Related places fetch failed:', res.status);
                return;
            }

            const data = await res.json();
            const section = document.getElementById('bc-related-places-section');
            const list = document.getElementById('bc-related-places-list');
            
            if (data && data.length > 0 && section && list) {
                list.innerHTML = '';
                
                const linkBase = window.location.pathname.includes('/yritys/') ? '../' : '';
                
                data.forEach(rel => {
                    const place = rel.places;
                    if (!place) return;
                    
                    const placeName = place.canonical_name || place.name || 'Tuntematon paikka';
                    const contextInfo = rel.context ? \`<div style="font-size: 0.85rem; color: #4b5563; margin-top: 4px;">\${rel.context}</div>\` : '';
                    
                    list.innerHTML += \`
                        <a href="\${linkBase}tietoa-paikasta.html?id=\${rel.place_id}" style="display:block; text-decoration:none; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:12px; padding:12px; color:inherit; transition:background 0.2s;">
                            <div style="font-weight: 700; color: #065f46; font-size: 1.05rem;">\${placeName}</div>
                            <div style="font-size: 0.75rem; text-transform: uppercase; color: #059669; font-weight: 800; margin-top: 2px;">
                                \${place.type || 'Paikka'} \u2022 \${place.municipality || 'Laukaa'}
                            </div>
                            \${contextInfo}
                        </a>
                    \`;
                });
                
                if (list.innerHTML.trim() !== '') {
                    section.style.display = 'block';
                }
            }
        } catch(e) {
            console.error('Related places error:', e);
        }
    }`;

const NEW = `    async function renderRelatedPlacesForYritys(companyId) {
        try {
            const rawId = String(companyId).replace('company-', '');
            const PAIKKA_URL = 'https://duxluwyqxvbmkkjzuzkz.supabase.co';
            const PAIKKA_KEY = 'sb_publishable_HgfWyipuSO7gvsVUR1smNQ_aXox2OPu';
            const HEADERS = { 'apikey': PAIKKA_KEY, 'Authorization': 'Bearer ' + PAIKKA_KEY, 'Accept': 'application/json' };

            // Vaihe 1: hae relaatiot (ilman joinia - FK puuttuu)
            const relRes = await fetch(
                PAIKKA_URL + '/rest/v1/place_company_relations?select=place_id,context&company_id=eq.' + rawId,
                { headers: HEADERS }
            );
            if (!relRes.ok) { console.warn('Related places rel fetch failed:', relRes.status); return; }
            const relations = await relRes.json();
            if (!relations || relations.length === 0) return;

            // Vaihe 2: hae paikkojen tiedot place_id:llä
            const placeIds = relations.map(function(r) { return r.place_id; }).join(',');
            const placeRes = await fetch(
                PAIKKA_URL + '/rest/v1/places?select=place_id,name,canonical_name,type,municipality&place_id=in.(' + placeIds + ')',
                { headers: HEADERS }
            );
            if (!placeRes.ok) { console.warn('Related places place fetch failed:', placeRes.status); return; }
            const places = await placeRes.json();

            const placeMap = {};
            (places || []).forEach(function(p) { placeMap[p.place_id] = p; });

            const section = document.getElementById('bc-related-places-section');
            const list = document.getElementById('bc-related-places-list');
            if (!section || !list) return;

            list.innerHTML = '';
            const linkBase = window.location.pathname.includes('/yritys/') ? '../' : '';

            relations.forEach(function(rel) {
                const place = placeMap[rel.place_id];
                if (!place) return;
                const placeName = place.canonical_name || place.name || 'Tuntematon paikka';
                const contextInfo = rel.context ? '<div style="font-size: 0.85rem; color: #4b5563; margin-top: 4px;">' + rel.context + '</div>' : '';
                list.innerHTML += '<a href="' + linkBase + 'tietoa-paikasta.html?id=' + rel.place_id + '" style="display:block; text-decoration:none; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:12px; padding:12px; color:inherit; transition:background 0.2s;">'
                    + '<div style="font-weight: 700; color: #065f46; font-size: 1.05rem;">' + placeName + '</div>'
                    + '<div style="font-size: 0.75rem; text-transform: uppercase; color: #059669; font-weight: 800; margin-top: 2px;">' + (place.type || 'Paikka') + ' \u2022 ' + (place.municipality || 'Laukaa') + '</div>'
                    + contextInfo + '</a>';
            });

            if (list.innerHTML.trim() !== '') section.style.display = 'block';
        } catch(e) {
            console.error('Related places error:', e);
        }
    }`;

if (content.includes(OLD)) {
    content = content.replace(OLD, NEW);
    fs.writeFileSync(path, content, 'utf8');
    console.log('OK: function replaced');
} else {
    console.log('NOT FOUND - trying line-based approach');
    const lines = content.split('\n');
    const startMarker = '    async function renderRelatedPlacesForYritys(companyId) {';
    let startIdx = -1;
    let endIdx = -1;
    let depth = 0;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].trimEnd() === startMarker) {
            startIdx = i;
        }
        if (startIdx >= 0) {
            for (const ch of lines[i]) {
                if (ch === '{') depth++;
                if (ch === '}') depth--;
            }
            if (depth === 0 && startIdx >= 0) {
                endIdx = i;
                break;
            }
        }
    }
    if (startIdx >= 0 && endIdx >= 0) {
        lines.splice(startIdx, endIdx - startIdx + 1, ...NEW.split('\n'));
        fs.writeFileSync(path, lines.join('\n'), 'utf8');
        console.log('OK: replaced lines', startIdx, 'to', endIdx);
    } else {
        console.log('Could not find function, startIdx:', startIdx, 'endIdx:', endIdx);
    }
}
