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

            if (withWebsite.length === 0) return;

            // Etsi tai luo widget
            let widget = document.getElementById('company-carousel-widget');
            if (!widget) {
                widget = document.createElement('div');
                widget.id = 'company-carousel-widget';
                widget.className = 'company-popup-widget';
                widget.innerHTML = `
                    <div class="popup-icon">🏢</div>
                    <div class="popup-info">
                        <div class="popup-category" id="carousel-category">Palvelu</div>
                        <div class="popup-name" id="carousel-name">Ladataan...</div>
                        <div class="popup-link-text">Vieraile sivustolla &raquo;</div>
                    </div>
                `;
                document.body.appendChild(widget);
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

            // Avaa uuteen välilehteen klikattaessa
            widget.addEventListener('click', () => {
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

            // Ensimmäinen päivitys
            updateCarousel();
            // Päivitä 5 sekunnin välein
            setInterval(updateCarousel, 5000);

        } catch (e) {
            console.warn("Company carousel error:", e);
        }
    }, 2000); // 2 sekunnin viive alun latauksen keventämiseksi
});
