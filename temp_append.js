
/**
 * Hakee yrityksen kytketyt paikat Supabasesta (place_company_relations -> places)
 * ja renderöi ne "Paikat"-välilehdelle.
 * @param {string} companyId - Yrityksen ID esim. "company-2"
 */
window.loadRelatedPlaces = async function(companyId) {
    const loadingEl = document.getElementById('places-loading');
    const listEl = document.getElementById('places-list');
    const emptyEl = document.getElementById('places-empty');

    if (!loadingEl || !listEl || !emptyEl) return;

    const sb = window.LaukaaSupabase;
    if (!sb) {
        if (loadingEl) loadingEl.innerHTML = '<p style="color:#ef4444;">Supabase ei ole alustettu.</p>';
        return;
    }

    try {
        const { data: relations, error } = await sb
            .from('place_company_relations')
            .select('place_id, context')
            .eq('company_id', companyId);

        if (error) throw error;

        if (!relations || relations.length === 0) {
            loadingEl.style.display = 'none';
            emptyEl.style.display = 'block';
            return;
        }

        const placeIds = relations.map(r => r.place_id);
        const { data: places, error: placesError } = await sb
            .from('places')
            .select('place_id, canonical_name, name, type, municipality, lat, lon')
            .in('place_id', placeIds);

        if (placesError) throw placesError;

        const contextMap = {};
        relations.forEach(r => { contextMap[r.place_id] = r.context; });

        const typeLabels = {
            'NATURE': 'Luontokohde',
            'LANDMARK': 'Nähtävyys',
            'SERVICE': 'Palvelukeskittymä',
            'BUILDING': 'Rakennus',
            'AREA': 'Alue',
            'ROUTE': 'Reitti'
        };

        const isDist = window.location.pathname.includes('/yritys/');
        const prefix = isDist ? '../' : './';

        let html = `
            <h2 style="font-family:'Outfit',sans-serif;font-size:1.8rem;font-weight:700;color:#003366;margin-bottom:1.5rem;display:flex;align-items:center;gap:0.75rem;">
                <span class="iconify" data-icon="material-symbols-light:location-on-outline" style="font-size:1.2em;color:#0056b3;"></span>
                Kytketyt paikat (${places ? places.length : 0})
            </h2>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1.5rem;">
        `;

        (places || []).forEach(place => {
            const label = typeLabels[place.type] || place.type || 'Paikka';
            const context = contextMap[place.place_id] || '';
            const name = place.canonical_name || place.name || 'Nimetön paikka';
            const muni = place.municipality || 'Laukaa';
            const placeUrl = `${prefix}tietoa-paikasta.html?id=${encodeURIComponent(place.place_id)}`;

            html += `
                <a href="${placeUrl}" style="text-decoration:none;display:block;background:white;border-radius:20px;box-shadow:0 6px 30px rgba(0,0,0,0.06);overflow:hidden;transition:transform 0.2s,box-shadow 0.2s;border:1px solid #e2e8f0;"
                   onmouseover="this.style.transform='translateY(-4px)';this.style.boxShadow='0 12px 40px rgba(0,0,0,0.12)';"
                   onmouseout="this.style.transform='';this.style.boxShadow='0 6px 30px rgba(0,0,0,0.06)';">
                    <div style="background:linear-gradient(135deg,#10b981,#059669);height:6px;"></div>
                    <div style="padding:1.5rem;">
                        <span style="display:inline-block;background:#ecfdf5;color:#059669;padding:0.3rem 0.9rem;border-radius:50px;font-size:0.8rem;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:0.75rem;">${label}</span>
                        <h3 style="font-family:'Outfit',sans-serif;font-size:1.25rem;font-weight:700;color:#003366;margin:0 0 0.5rem;">${name}</h3>
                        <div style="font-size:0.9rem;color:#64748b;display:flex;align-items:center;gap:0.4rem;margin-bottom:${context ? '0.75rem' : '0'};">
                            <span class="iconify" data-icon="material-symbols-light:location-on-outline" style="font-size:1.1em;"></span>
                            ${muni}
                        </div>
                        ${context ? `<p style="font-size:0.9rem;color:#4a5568;line-height:1.5;margin:0;padding-top:0.75rem;border-top:1px solid #f1f5f9;">${context}</p>` : ''}
                    </div>
                </a>
            `;
        });

        html += '</div>';

        loadingEl.style.display = 'none';
        listEl.innerHTML = html;
        listEl.style.display = 'block';

        if (window.Iconify) window.Iconify.scan(listEl);

    } catch (err) {
        console.error('Virhe paikkojen latauksessa:', err);
        if (loadingEl) loadingEl.innerHTML = '<p style="color:#ef4444;">Virhe paikkojen latauksessa.</p>';
    }
};

// Varmistetaan että funktio näkyy globaalisti vaikka koodi olisi kääritty
window.loadRelatedPlaces = loadRelatedPlaces;
