// Yrityskaruselli etusivulle – sivun reunan välilehti
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(async () => {
        try {
            // Varmistetaan että yritysdata on ladattu
            if (typeof loadCompanyData === 'function' && (!window.allCompanies || window.allCompanies.length === 0)) {
                await loadCompanyData();
            }

            const companies = window.allCompanies || [];
            console.log('Carousel: Yrityksiä ladattu:', companies.length);

            // Käytetään kaikkia yrityksiä – priorisoidaan ne joilla on logo tai paketti
            const candidates = companies.length > 0 ? companies : [];

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
                        <div class="drawer-body" id="carousel-drawer-body">
                            <div class="popup-icon" id="carousel-icon">🏢</div>
                            <div class="popup-info">
                                <div class="popup-category" id="carousel-category">Palvelu</div>
                                <div class="popup-name" id="carousel-name">Ladataan...</div>
                                <div class="popup-link-text">Tutustu yritykseen &raquo;</div>
                            </div>
                        </div>
                    </div>
                `;
                document.body.appendChild(widget);

                // Toggle-napin kuuntelija
                document.getElementById('carousel-toggle-btn').addEventListener('click', () => {
                    widget.classList.toggle('open');
                });

                // Sulkemisnapin kuuntelija
                document.getElementById('carousel-close-btn').addEventListener('click', (e) => {
                    e.stopPropagation();
                    widget.classList.remove('open');
                });
            }

            const categoryEl = document.getElementById('carousel-category');
            const nameEl = document.getElementById('carousel-name');
            const iconEl = document.getElementById('carousel-icon');
            const drawerBody = document.getElementById('carousel-drawer-body');
            let currentCompany = null;

            // Kategoria-emojit
            const categoryEmojis = {
                'ravintola': '🍽️', 'ruoka': '🍽️', 'cafe': '☕',
                'rakennus': '🏗️', 'remontti': '🔨', 'lvi': '🔧',
                'terveys': '💊', 'hyvinvointi': '💆', 'hieronta': '💆',
                'kauneus': '💄', 'parturi': '✂️',
                'auto': '🚗', 'huolto': '🔧',
                'koira': '🐕', 'elain': '🐾', 'lemmi': '🐾',
                'myymälä': '🛍️', 'kauppa': '🛒',
                'kuljetus': '🚚', 'muutto': '📦',
                'kiinteist': '🏠', 'isännöi': '🏠',
                'media': '📸', 'mainos': '📢',
                'koulutus': '📚', 'opetus': '📚',
                'juhla': '🎉', 'tapahtuma': '🎊',
            };

            function getEmoji(company) {
                const haystack = ((company.kategoria || '') + ' ' + (company.tags || '') + ' ' + (company.tyyppi || '')).toLowerCase();
                for (const [key, emoji] of Object.entries(categoryEmojis)) {
                    if (haystack.includes(key)) return emoji;
                }
                return '🏢';
            }

            function updateCarousel() {
                if (candidates.length === 0) return;

                widget.classList.add('fade-out');

                setTimeout(() => {
                    currentCompany = candidates[Math.floor(Math.random() * candidates.length)];

                    nameEl.textContent = currentCompany.nimi || 'Yritys';

                    // Kategoria
                    let cat = currentCompany.kategoria || currentCompany.tyyppi || 'Palvelu';
                    cat = cat.replace(/_/g, ' ');
                    cat = cat.charAt(0).toUpperCase() + cat.slice(1);
                    // Lyhennä jos liian pitkä
                    if (cat.length > 30) cat = cat.substring(0, 28) + '…';
                    categoryEl.textContent = cat;

                    // Emoji
                    iconEl.textContent = getEmoji(currentCompany);

                    widget.classList.remove('fade-out');
                }, 400);
            }

            // Klikkaus vie yrityssivulle LaukaaInfossa
            if (drawerBody) {
                drawerBody.addEventListener('click', () => {
                    if (!currentCompany) return;

                    // Kokeillaan ensin ulkoista nettisivua
                    const externalUrl = currentCompany.nettisivu || currentCompany.linkki || currentCompany.verkkosivu || currentCompany.website;
                    if (externalUrl) {
                        const url = externalUrl.startsWith('http') ? externalUrl : 'https://' + externalUrl;
                        window.open(url, '_blank');
                        return;
                    }

                    // Muuten avataan haku yrityksen nimellä
                    const name = encodeURIComponent(currentCompany.nimi || '');
                    window.location.href = `koko-laukaa.html?q=${name}`;
                });
            }

            // Käynnistys
            if (candidates.length > 0) {
                updateCarousel();
                setInterval(updateCarousel, 5000);
            }

        } catch (e) {
            console.warn('Carousel error:', e);
        }
    }, 2500); // Odotetaan 2.5s jotta allCompanies ehtii latautua
});

// Etusivun hero-kuvan slideshow
document.addEventListener('DOMContentLoaded', () => {
    const heroSlideshow = document.getElementById('hero-slideshow');
    if (!heroSlideshow) return;

    const images = [
        'otsikkokuvat/hero-kuva.jpg',
        'otsikkokuvat/kuva-2478.jpg',
        'otsikkokuvat/kuva-2527 (1).jpg',
        'otsikkokuvat/kuva-2589 (1).jpg'
    ];

    let currentIndex = 0;

    function nextImage() {
        currentIndex = (currentIndex + 1) % images.length;
        const nextSrc = images[currentIndex];

        const currentImg = heroSlideshow.querySelector('.hero-nature-img.active');
        
        const newImg = document.createElement('img');
        newImg.src = nextSrc;
        newImg.alt = "Laukaa maisema";
        newImg.className = "hero-nature-img";
        
        heroSlideshow.appendChild(newImg);
        
        setTimeout(() => {
            if (currentImg) {
                currentImg.classList.remove('active');
                currentImg.classList.add('prev');
            }
            newImg.classList.add('active');
            
            setTimeout(() => {
                if (currentImg) {
                    const parent = currentImg.parentNode;
                    if (parent && parent.tagName.toLowerCase() === 'picture') {
                        parent.parentNode.removeChild(parent);
                    } else if (parent) {
                        parent.removeChild(currentImg);
                    }
                }
            }, 1500);
        }, 50);
    }

    // Vaihdetaan kuva 6 sekunnin välein
    setInterval(nextImage, 6000);
});
