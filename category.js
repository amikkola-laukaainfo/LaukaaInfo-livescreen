(function () {
    let categoryCompanies = [];
    let map = null;
    let markers = null;

    document.addEventListener('DOMContentLoaded', () => {
        const params = new URLSearchParams(window.location.search);
        const category = params.get('cat');

        if (!category) {
            window.location.href = 'index.html';
            return;
        }

        document.getElementById('category-name').textContent = category;
        document.title = `${category} – LaukaaInfo`;

        // Icon selection
        const categoryIcons = {
            'Kauneus ja terveys': '💄',
            'Matkailu & Elämykset': '🌲',
            'Ravinto & Vapaa-aika': '🍽️',
            'Perinnematkailu & Juhlat': '💒',
            'Muu': '🏢'
        };
        document.getElementById('category-icon').textContent = categoryIcons[category] || '🏢';

        loadData(category);
    });

    async function loadData(category) {
        try {
            const dataSourceUrl = 'https://www.mediazoo.fi/laukaainfo-web/get_companies.php';
            const response = await fetch(dataSourceUrl);
            const allCompanies = await response.json();

            // Normalize URLs (Same logic as in script.js)
            const baseUrl = dataSourceUrl.substring(0, dataSourceUrl.lastIndexOf('/') + 1);
            allCompanies.forEach(company => {
                if (company.media) {
                    company.media.forEach(item => {
                        if (item.url) {
                            if (item.url.includes('drive_cache/')) {
                                const match = item.url.match(/drive_cache\/([a-zA-Z0-9_-]+)/);
                                if (match) {
                                    const fileId = match[1];
                                    item.url = baseUrl + "get_image.php?id=" + fileId;
                                }
                            }
                            if (!item.url.startsWith('http') && !item.url.startsWith('//')) {
                                item.url = baseUrl + item.url;
                            }
                        }
                    });
                }
            });

            categoryCompanies = allCompanies.filter(c => c.kategoria === category);

            // Separate Premium and Free (Business vs. Free)
            let premium = categoryCompanies.filter(c => c.media && c.media.length > 0);
            const free = categoryCompanies.filter(c => !c.media || c.media.length === 0);

            // DEMO-DATA: Jos aineistossa ei ole kuvallisia yrityksiä, näytetään muutama demo
            if (premium.length === 0) {
                console.log('Ei premium-yrityksiä, käytetään demo-aineistoa karuselliin.');
                premium = [
                    {
                        id: 'demo1',
                        nimi: 'Esimerkki Parturi-Kampaamo',
                        mainoslause: 'Modernit hiustenleikkuut ja värjäykset.',
                        osoite: 'Laukaantie 1, Laukaa',
                        media: [{ type: 'image', url: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&q=80&w=600' }]
                    },
                    {
                        id: 'demo2',
                        nimi: 'Laukaan Lounasravintola',
                        mainoslause: 'Maistuvaa kotiruokaa joka arkipäivä.',
                        osoite: 'Lievestuoreentie 5, Lievestuore',
                        media: [{ type: 'image', url: 'https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&q=80&w=600' }]
                    },
                    {
                        id: 'demo3',
                        nimi: 'Kukkakauppa Ruusu',
                        mainoslause: 'Kukkatervehdykset kaikkiin tilaisuuksiin.',
                        osoite: 'Vihtavuori',
                        media: [{ type: 'image', url: 'https://images.unsplash.com/photo-1526047932273-341f2a7631f9?auto=format&fit=crop&q=80&w=600' }]
                    },
                    {
                        id: 'demo4',
                        nimi: 'Liikuntakeskus Syke',
                        mainoslause: 'Kuntosali ja ryhmäliikuntatunnit.',
                        osoite: 'Laukaantie 10, Laukaa',
                        media: [{ type: 'image', url: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&q=80&w=600' }]
                    }
                ];
            }

            renderFeatured(premium);
            renderDirectory(premium.filter(p => !p.id.startsWith('demo')), free);
            initMap(categoryCompanies);

            startAutoSlider();
        } catch (error) {
            console.error('Error loading data:', error);
        }
    }

    function startAutoSlider() {
        const track = document.getElementById('featured-carousel');
        const prevBtn = document.getElementById('carousel-prev');
        const nextBtn = document.getElementById('carousel-next');
        if (!track) return;

        let scrollAmount = 0;
        const step = 2; // Speed
        const interval = 50;
        let isPaused = false;
        let autoScrollInterval = null;

        const startScrolling = () => {
            if (autoScrollInterval) clearInterval(autoScrollInterval);
            autoScrollInterval = setInterval(() => {
                if (isPaused) return;

                scrollAmount += step;
                if (scrollAmount >= track.scrollWidth - track.clientWidth) {
                    scrollAmount = 0;
                }
                track.scrollTo({
                    left: scrollAmount,
                    behavior: 'auto'
                });
            }, interval);
        };

        const stopAutoScroll = () => {
            if (autoScrollInterval) {
                clearInterval(autoScrollInterval);
                autoScrollInterval = null;
            }
            isPaused = true;
        };

        // Navigation button logic
        const scrollStep = 350 + 32; // item width + gap

        if (prevBtn) {
            prevBtn.onclick = () => {
                stopAutoScroll();
                track.scrollBy({ left: -scrollStep, behavior: 'smooth' });
            };
        }

        if (nextBtn) {
            nextBtn.onclick = () => {
                stopAutoScroll();
                track.scrollBy({ left: scrollStep, behavior: 'smooth' });
            };
        }

        // Stop on manual interaction
        track.onmousedown = stopAutoScroll;
        track.ontouchstart = stopAutoScroll;
        track.onwheel = stopAutoScroll;

        // Sync scrollAmount for internal tracking (if needed for other logic)
        track.onscroll = () => {
            scrollAmount = track.scrollLeft;
        };

        startScrolling();
    }

    function renderFeatured(companies) {
        // Let's assume businesses with more than 1 image or a specific "priority" field are featured
        // For now, let's use a dummy priority logic or just take those with media
        const featured = companies.filter(c => c.media && c.media.length > 0)
            .sort((a, b) => (b.priority || 0) - (a.priority || 0))
            .slice(0, 5);

        const section = document.getElementById('featured-section');
        const container = document.getElementById('featured-carousel');

        if (featured.length > 0) {
            section.style.display = 'block';
            container.innerHTML = '';

            featured.forEach(c => {
                const item = document.createElement('div');
                item.className = 'carousel-item';

                let mediaHtml = '';
                if (c.media && c.media[0]) {
                    if (c.media[0].type === 'image') {
                        mediaHtml = `<img src="${c.media[0].url}" style="width:100%; height:150px; object-fit:cover; border-radius:8px; margin-bottom:1rem;">`;
                    }
                }

                item.innerHTML = `
                <a href="yrityskortti.html?id=${c.id}" style="text-decoration: none; color: inherit; display: block;">
                    <span class="premium-badge">SUOSITELTU</span>
                    ${mediaHtml}
                    <h3>${c.nimi}</h3>
                    <p>${c.mainoslause || ''}</p>
                    <div style="margin-top:1rem;">
                        <strong>${c.osoite || ''}</strong>
                    </div>
                </a>
            `;
                container.appendChild(item);
            });
        }
    }

    function renderDirectory(premium, free) {
        const list = document.getElementById('company-list');
        list.innerHTML = '';

        // Premium Section
        if (premium.length > 0) {
            const h2 = document.createElement('h2');
            h2.textContent = '⭐ Suositellut kumppanit';
            h2.style.gridColumn = '1 / -1';
            h2.style.marginTop = '2rem';
            list.appendChild(h2);

            premium.forEach(c => {
                const card = createCompanyCard(c);
                list.appendChild(card);
            });
        }

        // Free Section
        if (free.length > 0) {
            const h2 = document.createElement('h2');
            h2.textContent = 'Palveluhakemisto';
            h2.style.gridColumn = '1 / -1';
            h2.style.marginTop = '4rem';
            list.appendChild(h2);

            free.forEach(c => {
                const card = createCompanyCard(c);
                list.appendChild(card);
            });
        }
    }

    function createCompanyCard(c) {
        const card = document.createElement('div');
        card.className = 'company-card';
        card.innerHTML = `
        <h3>${c.nimi}</h3>
        <p class="address">${c.osoite || 'Laukaa'}</p>
        <p>${c.mainoslause || ''}</p>
        <div style="margin-top:1rem; display:flex; gap:10px;">
            <a href="yrityskortti.html?id=${c.id}" class="btn-primary" style="padding:0.4rem 1rem; font-size:0.8rem;">TIEDOT</a>
            ${c.nettisivu ? `<a href="${c.nettisivu}" target="_blank" class="btn-primary" style="padding:0.4rem 1rem; font-size:0.8rem; background:#666;">WWW</a>` : ''}
        </div>
    `;
        return card;
    }

    function initMap(companies) {
        if (map) return;

        map = L.map('category-map').setView([62.4128, 25.9477], 11);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }).addTo(map);

        markers = L.markerClusterGroup();

        companies.forEach(company => {
            if (company.lat && company.lon) {
                const marker = L.marker([company.lat, company.lon]);
                marker.bindPopup(`
                <strong>${company.nimi}</strong><br>${company.osoite}<br><br>
                <a href="yrityskortti.html?id=${company.id}" style="
                    display: block;
                    background: #0056b3;
                    color: white;
                    text-decoration: none;
                    text-align: center;
                    padding: 5px 10px;
                    border-radius: 4px;
                    font-size: 0.8rem;
                ">Näytä tiedot</a>
            `);
                markers.addLayer(marker);
            }
        });

        map.addLayer(markers);

        // Zoom to fit markers if any
        const group = new L.featureGroup(markers.getLayers());
        if (markers.getLayers().length > 0) {
            map.fitBounds(group.getBounds().pad(0.1));
        }
    }
})();
