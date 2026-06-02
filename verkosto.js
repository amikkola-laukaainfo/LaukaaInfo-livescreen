document.addEventListener('DOMContentLoaded', () => {
    const verkostoContainer = document.getElementById('palveluverkosto-suositukset');
    if (!verkostoContainer) return;

    fetch('verkosto.json')
        .then(response => response.json())
        .then(data => {
            // Demo-vaiheessa näytetään ensimmäinen tagi tai arvottu
            const tagit = Object.keys(data.verkosto);
            const valittuTagi = tagit[Math.floor(Math.random() * tagit.length)]; // Arvotaan joku demo-tageista
            renderVerkosto(data, valittuTagi, verkostoContainer);
        })
        .catch(err => console.error('Virhe ladattaessa verkosto.json:', err));
});

function renderVerkosto(data, tagi, container) {
    const verkosto = data.verkosto[tagi];
    if (!verkosto) return;

    const entities = data.entities;

    let html = `
        <div class="verkosto-header" style="text-align: center; margin-bottom: 2rem;">
            <h2 style="color: #0a2540; margin-bottom: 0.5rem;">🧠 Palveluverkoston suositukset: ${verkosto.otsikko}</h2>
            <p style="color: #4a5568;">Saattaisit olla kiinnostunut myös näistä paikallisista toimijoista ja mahdollisuuksista.</p>
        </div>
        <div class="verkosto-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1.5rem;">
    `;

    // Yritykset
    if (verkosto.yritykset.length > 0) {
        html += `<div class="verkosto-kategoria" style="background: white; padding: 1.5rem; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
            <h3 style="color: #0056b3; margin-bottom: 1rem; font-size: 1.2rem;">🏢 Yritykset</h3>
            <ul style="list-style: none; padding: 0; margin: 0;">`;
        verkosto.yritykset.forEach(id => {
            const ent = entities[id];
            if (ent) html += `<li style="margin-bottom: 0.5rem; border-bottom: 1px solid #eee; padding-bottom: 0.5rem;"><strong>${ent.nimi}</strong><br><small style="color: #666;">${ent.kuvaus}</small></li>`;
        });
        html += `</ul></div>`;
    }

    // Tarjoaa apua
    if (verkosto.tarjoan_apua.length > 0) {
        html += `<div class="verkosto-kategoria" style="background: white; padding: 1.5rem; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
            <h3 style="color: #28a745; margin-bottom: 1rem; font-size: 1.2rem;">🤝 Tarjoaa apua</h3>
            <ul style="list-style: none; padding: 0; margin: 0;">`;
        verkosto.tarjoan_apua.forEach(id => {
            const ent = entities[id];
            if (ent) html += `<li style="margin-bottom: 0.5rem; border-bottom: 1px solid #eee; padding-bottom: 0.5rem;"><strong>${ent.otsikko}</strong></li>`;
        });
        html += `</ul></div>`;
    }

    // Harrastukset ja ryhmät
    if (verkosto.harrastukset.length > 0) {
        html += `<div class="verkosto-kategoria" style="background: white; padding: 1.5rem; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
            <h3 style="color: #ffc107; margin-bottom: 1rem; font-size: 1.2rem;">👥 Harrastusryhmät</h3>
            <ul style="list-style: none; padding: 0; margin: 0;">`;
        verkosto.harrastukset.forEach(id => {
            const ent = entities[id];
            if (ent) html += `<li style="margin-bottom: 0.5rem; border-bottom: 1px solid #eee; padding-bottom: 0.5rem;"><strong>${ent.otsikko}</strong><br><small style="color: #666;">Kiinnostuneita: ${ent.kiinnostuneet}</small></li>`;
        });
        html += `</ul></div>`;
    }

    // Projektit
    if (verkosto.projektit.length > 0) {
        html += `<div class="verkosto-kategoria" style="background: white; padding: 1.5rem; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
            <h3 style="color: #dc3545; margin-bottom: 1rem; font-size: 1.2rem;">🚀 Projektit</h3>
            <ul style="list-style: none; padding: 0; margin: 0;">`;
        verkosto.projektit.forEach(id => {
            const ent = entities[id];
            if (ent) html += `<li style="margin-bottom: 0.5rem; border-bottom: 1px solid #eee; padding-bottom: 0.5rem;"><strong>${ent.otsikko}</strong></li>`;
        });
        html += `</ul></div>`;
    }

    html += `</div>`;
    
    // Tagin valinta -painikkeet demodemonstrointia varten
    html += `<div style="text-align: center; margin-top: 2rem;">
        <p style="color: #666; font-size: 0.9rem; margin-bottom: 0.5rem;">Kokeile muita suositusteemoja:</p>
        <div style="display: flex; justify-content: center; gap: 0.5rem; flex-wrap: wrap;">`;
    
    Object.keys(data.verkosto).forEach(t => {
        html += `<button onclick="renderVerkostoData('${t}')" style="background: ${t === tagi ? '#0056b3' : '#e2e8f0'}; color: ${t === tagi ? 'white' : '#333'}; border: none; padding: 0.5rem 1rem; border-radius: 20px; cursor: pointer; font-family: inherit;">${data.verkosto[t].otsikko}</button>`;
    });

    html += `</div></div>`;

    container.innerHTML = html;
}

// Globaali apufunktio nappeja varten
window.renderVerkostoData = function(tagi) {
    fetch('verkosto.json')
        .then(response => response.json())
        .then(data => {
            const verkostoContainer = document.getElementById('palveluverkosto-suositukset');
            renderVerkosto(data, tagi, verkostoContainer);
        });
};
