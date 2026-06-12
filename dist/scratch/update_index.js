const fs = require('fs');
let c = fs.readFileSync('index.html', 'utf8');

// 1. Hero text update
c = c.replace(
    /<h2 class="hero-subheading".*?<\/div>/s,
    `<h2 class="hero-subheading" data-i18n="hero_subheading">Yhteydet palveluihin, osaajiin ja mahdollisuuksiin.</h2>
                        <div class="hero-actions" style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-top: 1rem;">
                            <a href="#search-section" class="btn-primary" style="padding: 0.8rem; font-size: 0.9rem;">📍 Löydä palvelu</a>
                            <a href="#service-needs" class="btn-primary" style="padding: 0.8rem; font-size: 0.9rem;">🤝 Löydä apua</a>
                            <a href="#palveluverkosto-section" class="btn-primary" style="padding: 0.8rem; font-size: 0.9rem;">👥 Löydä ihmisiä</a>
                            <a href="#feed-section" class="btn-primary" style="padding: 0.8rem; font-size: 0.9rem;">🚀 Luo jotain yhdessä</a>
                        </div>`
);

// 2. Add Palveluverkosto block before need-based-section
c = c.replace(
    /<section class="need-based-section bg-full-white">/s,
    `<section id="palveluverkosto-section" class="bg-full-gray" style="padding: 3rem 0; margin-bottom: 2rem;">
            <div class="section-container" id="palveluverkosto-suositukset">
                <!-- verkosto.js lataa suositukset tähän -->
            </div>
        </section>

<section class="need-based-section bg-full-white">`
);

// 3. Remove Experiences section
c = c.replace(
    /<!-- Elämykset & Kulttuuri -->[\s\S]*?<section id="feed-section"/s,
    `<section id="feed-section"`
);

// 4. Add script
c = c.replace(
    /<script src="carousel\.js"><\/script>/s,
    `<script src="carousel.js"></script>
    <script src="verkosto.js"></script>`
);

fs.writeFileSync('index.html', c);
console.log('index.html updated successfully.');
