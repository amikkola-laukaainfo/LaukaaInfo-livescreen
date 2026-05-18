// Yrityskaruselli etusivulle
document.addEventListener('DOMContentLoaded', () => {
    // Odota hieman, jotta muu sivusto ehtii latautua ja mahdolliset script.js-haut valmistuvat
    setTimeout(async () => {
        try {
            if (typeof loadCompanyData === "function" && (!window.allCompanies || window.allCompanies.length === 0)) {
                await loadCompanyData();
            }

            const companies = window.allCompanies || [];
            const withWebsite = companies.filter(c => c.nettisivu || c.linkki || c.verkkosivu || c.website);
            
            console.log('Carousel: Yrityksiä yhteensä:', companies.length);
            console.log('Carousel: Yrityksiä joilla nettisivu:', withWebsite.length);
            
            // Luodaan kieleke joka tapauksessa, jotta nähdään toimiiko se

            // Etsi tai luo widget
            let widget = document.getElementById('company-carousel-widget');
            if (!widget) {
                widget = document.createElement('div');
                widget.id = 'company-carousel-widget';
                widget.className = 'company-popup-widget';
                widget.innerHTML = `
                    <div class="carousel-tab" id="carousel-toggle-btn">
                        <span>🏢 Yritykset</span>
                    </div>
                    <div class="carousel-drawer" id="carousel-drawer-content">
                        <div class="drawer-header">
                            <h3>Suositellut yritykset</h3>
                            <button class="drawer-close-btn" id="carousel-close-btn">&times;</button>
                        </div>
                        <div class="drawer-body">
                            <div class="popup-icon">🏢</div>
                            <div class="popup-info">
                                <div class="popup-category" id="carousel-category">Palvelu</div>
                                <div class="popup-name" id="carousel-name">Ladataan...</div>
                                <div class="popup-link-text">Vieraile sivustolla &raquo;</div>
                            </div>
                        </div>
                    </div>
                `;
                document.body.appendChild(widget);

                // Lisätään kuuntelijat avaamiselle ja sulkemiselle
                const toggleBtn = document.getElementById('carousel-toggle-btn');
                const closeBtn = document.getElementById('carousel-close-btn');

                toggleBtn.addEventListener('click', () => {
                    widget.classList.toggle('open');
                });

                closeBtn.addEventListener('click', (e) => {
                    e.stopPropagation(); // Estä klikkauksen kupliminen widgetille
                    widget.classList.remove('open');
                });
            }

            const categoryEl = document.getElementById('carousel-category');
            const nameEl = document.getElementById('carousel-name');
            let currentCompany = null;

            function updateCarousel() {
                // Piilotetaan hetkeksi animaatiota varten
                widget.classList.add('fade-out');
                
                setTimeout(() => {
                    // Valitse satunnainen yritys
                    currentCompany = withWebsite[Math.floor(Math.random() * withWebsite.length)];
                    
                    nameEl.textContent = currentCompany.nimi || currentCompany.name || "Yritys";
                    
                    // Kategoria
                    let cat = "Palvelu";
                    if (currentCompany.tags && currentCompany.tags.length > 0) {
                        cat = currentCompany.tags[0];
                    } else if (currentCompany.tyyppi) {
                        cat = currentCompany.tyyppi;
                    }
                    // Siisti kategoria (esim. poista alaviivat, vaihda alkamaan isolla)
                    cat = cat.replace(/_/g, ' ');
                    cat = cat.charAt(0).toUpperCase() + cat.slice(1);
                    categoryEl.textContent = cat;

                    // Näytä taas
                    widget.classList.remove('fade-out');
                }, 500); // 500ms fade-outin pituus
            }

            // Avaa uuteen välilehteen klikattaessa (vain jos ei klikata nappeja)
            widget.addEventListener('click', (e) => {
                if (e.target.closest('#carousel-toggle-btn') || e.target.closest('#carousel-close-btn')) {
                    return; // Ohitetaan jos klikataan nappia
                }
                if (currentCompany) {
                    let url = currentCompany.nettisivu || currentCompany.linkki || currentCompany.verkkosivu || currentCompany.website;
                    if (url && !url.startsWith('http')) {
                        url = 'https://' + url;
                    }
                    if (url) {
                        window.open(url, '_blank');
                    }
                }
            });

            // Ensimmäinen päivitys ja ajastin vain jos löytyy yrityksiä
            if (withWebsite.length > 0) {
                updateCarousel();
                setInterval(updateCarousel, 5000);
            } else {
                // Näytetään geneerinen teksti jos ei nettisivullisia yrityksiä
                if (nameEl) nameEl.textContent = 'Laukaan yritykset';
                if (categoryEl) categoryEl.textContent = 'Palvelut';
            }

        } catch (e) {
            console.warn("Company carousel error:", e);
        }
    }, 2000); // 2 sekunnin viive alun latauksen keventämiseksi
});
