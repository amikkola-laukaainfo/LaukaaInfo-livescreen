const fs = require('fs');
let content = fs.readFileSync('d:/Projekteja/MUUTprojektit/LaukaaInfo-livescreen/LaukaaInfo-livescreen/palvelun-esittely.html', 'utf8');

const start = content.indexOf('<header class="presentation-hero">');
const end = content.indexOf('</main>') + 7;

if(start !== -1 && end > start) {
    const replacement = `    <header class="presentation-hero">
        <h1>LaukaaInfo</h1>
        <h3 style="color: rgba(255,255,255,0.9); font-weight: 400; margin-top: 1rem;">Laukaan paikat, ihmiset, palvelut ja paikallinen tieto – yhdessä verkostossa.</h3>
        <p style="margin-top: 1rem;">Löydä paikka. Löydä palvelu. Löydä mitä alueella tapahtuu. Tai kerro itse, mitä täällä on.</p>
    </header>

    <main class="content-container">
        
        <h2>Mitä LaukaaInfolla voi tehdä?</h2>
        
        <div class="grid-section">
            <div class="grid-card">
                <h3>📍 Paikat</h3>
                <p><strong>Tutustu Laukaan paikkoihin</strong></p>
                <p>Rannat, kylät, ulkoilukohteet, rakennukset, liikuntapaikat, tapahtumapaikat ja muut kiinnostavat kohteet muodostavat LaukaaInfon paikkaverkoston.</p>
                <p><a href="kohdekartta.html" style="color: var(--primary-blue); font-weight: bold; text-decoration: none;">Tutustu paikkoihin &rarr;</a></p>
            </div>
            <div class="grid-card">
                <h3>🏢 Palvelut</h3>
                <p><strong>Löydä paikalliset tekijät</strong></p>
                <p>Yritykset ja palvelut löytyvät toimialan, tarpeen, alueen ja paikkojen yhteydestä – eivät vain osoitteen perusteella.</p>
                <p><a href="asiahaku.html" style="color: var(--primary-blue); font-weight: bold; text-decoration: none;">Etsi palvelu &rarr;</a></p>
            </div>
            <div class="grid-card">
                <h3>👀 Havainnot ja julkaisut</h3>
                <p><strong>Kerro mitä täällä tapahtuu</strong></p>
                <p>Kuka tahansa voi tehdä havaintoja ja julkaisuja. Yritykset voivat julkaista tarjouksia, tapahtumia ja muuta ajankohtaista sisältöä.</p>
                <p><a href="ajankohtaista.html" style="color: var(--primary-blue); font-weight: bold; text-decoration: none;">Katso ajankohtaiset &rarr;</a></p>
            </div>
        </div>

        <div class="info-card">
            <h2>📍 Jokaisella paikalla on oma tietonsa</h2>
            <p>LaukaaInfo rakentaa Laukaasta paikallista paikkaverkostoa. Paikka voi olla kylä, ranta, urheilukenttä, rakennus, luontokohde, tapahtumapaikka tai vaikka tunnettu kokoontumispaikka.</p>
            <p><strong>Jokaisella paikalla on oma tunnisteensa</strong>, jonka ympärille yhdistyy kaikki paikallinen tieto.</p>
            
            <h3 style="margin-top: 1.5rem;">Esimerkki: Haarlan ranta</h3>
            <ul>
                <li>Mitä täällä voi tehdä?</li>
                <li>Tapahtumat ja lähellä olevat palvelut</li>
                <li>Yritykset</li>
                <li>Havainnot ja muistot</li>
                <li>Kuvat ja media</li>
                <li>Liittyvät paikat</li>
            </ul>
            <p>Paikka ei ole vain piste kartalla. Se on solmu, johon paikallinen tieto kiinnittyy.</p>
        </div>

        <h2>Paikka ei tarkoita vain osoitetta</h2>
        <p>LaukaaInfo ei yhdistä yrityksiä vain osoitteisiin. Yritys voi liittyä paikkaan myös <strong>palvelunsa, alueensa tai teemansa kautta</strong>.</p>
        
        <div style="background: #f1f5f9; padding: 1.5rem; border-radius: 8px; margin: 1.5rem 0;">
            <p style="margin-bottom: 0.5rem;"><strong>Esimerkki: Haarlan ranta</strong></p>
            <p style="color: var(--primary-blue); font-weight: 500;">&rarr; liikunta &middot; ulkoilu &middot; perheet &middot; uinti</p>
            <p style="margin-top: 1rem; margin-bottom: 0;">Näiden teemojen kautta käyttäjä voi löytää esimerkiksi paikallisia liikunta-, hyvinvointi- tai vapaa-ajan palveluita – vaikka yrityksen toimipiste olisi muualla.</p>
        </div>
        <p><strong>Paikat yhdistävät paikallisen tiedon toisiinsa.</strong> Et etsi pelkkää yritystä, vaan löydät kokonaisen verkoston.</p>

        <div class="info-card">
            <h2>👤 Jokainen voi osallistua</h2>
            <p>LaukaaInfo ei ole vain yrityksille. Yksityisenä voit esimerkiksi:</p>
            <ul>
                <li>Ilmoittaa havainnon tai lisätä paikallisen vinkin</li>
                <li>Jakaa kuvan, videon tai muiston</li>
                <li>Ilmoittaa tapahtumasta tai tehdä paikallisen julkaisun</li>
            </ul>
            <h3 style="color: var(--primary-blue);">LaukaaInfo ei kerää kommentteja – se kerää paikallista tietoa.</h3>
            <p>Sisältöä voi lisätä myös ilman yritystiliä. Osa sisällöstä tarkistetaan ennen julkaisua, jotta paikallinen tieto pysyy luotettavana.</p>
        </div>

        <h2>🏢 Yritykselle: näkyvyyttä siellä, missä asiakkaat liikkuvat</h2>
        <p>LaukaaInfossa yritys ei näy vain hakemistossa. Se näkyy osana paikallista tietoverkostoa – siellä, missä ihmiset etsivät tietoa, paikkoja ja palveluita.</p>
        
        <div class="grid-section" style="margin-bottom: 2rem;">
            <div class="grid-card">
                <h3>📍 Fyysisesti paikalla</h3>
                <p>Yrityksen toimipaikka liittyy suoraan paikkaan ja sen tietoihin.</p>
            </div>
            <div class="grid-card">
                <h3>🤝 Paikkakumppanina</h3>
                <p>Yritys voi tukea tiettyä paikkaa ja näkyä sen yhteydessä: <em>"Tämän paikan yhteistyökumppani"</em></p>
            </div>
            <div class="grid-card">
                <h3>🗺️ Aluekumppanina</h3>
                <p>Yritys näkyy tietyn alueen – esimerkiksi Lievestuoreen tai Leppäveden – yhteydessä.</p>
            </div>
            <div class="grid-card">
                <h3>🏷️ Teemakumppanina</h3>
                <p>Yritys voi näkyä sille sopivissa teemoissa: <strong>Hyvinvointi &middot; Liikunta &middot; Ulkoilu &middot; Remontit &middot; Häät</strong></p>
            </div>
        </div>

        <p style="font-size: 1.2rem; text-align: center; color: var(--primary-blue); font-weight: 500; margin: 2rem 0;">LaukaaInfo ei ole vain yrityshakemisto. Se yhdistää yritykset, ihmiset ja paikallisen tiedon paikkojen ympärille.</p>

        <h2>📣 Ajankohtainen paikallinen tieto</h2>
        <p>Yritys voi julkaista tarjouksia, tapahtumia, ilmoituksia, uutisia ja videoita. Julkaisut voidaan yhdistää <strong>paikkaan, teemaan tai alueeseen</strong>.</p>
        <p>Yrityksen julkaisu ei jää yhteen feediin – se näkyy <strong>siellä, missä se on käyttäjälle relevantti</strong>.</p>

        <h2>📱 LaukaaInfo kulkee mukana</h2>
        <p><strong>Verkkopalvelussa</strong> löydät ja tutkit. <strong>Sovelluksessa</strong> voit myös osallistua ja tehdä havaintoja.</p>
        <div style="display: flex; gap: 2rem; margin-top: 1rem; flex-wrap: wrap;">
            <div style="flex: 1; min-width: 250px;">
                <h3 style="color: var(--primary-blue); border-bottom: 2px solid #e2e8f0; padding-bottom: 0.5rem;">Löydä</h3>
                <ul style="list-style: none; padding: 0;">
                    <li style="margin-bottom: 0.5rem;">📍 Paikat</li>
                    <li style="margin-bottom: 0.5rem;">🏢 Palvelut</li>
                    <li style="margin-bottom: 0.5rem;">📅 Tapahtumat</li>
                    <li style="margin-bottom: 0.5rem;">🎁 Tarjoukset</li>
                </ul>
            </div>
            <div style="flex: 1; min-width: 250px;">
                <h3 style="color: var(--primary-blue); border-bottom: 2px solid #e2e8f0; padding-bottom: 0.5rem;">Osallistu</h3>
                <ul style="list-style: none; padding: 0;">
                    <li style="margin-bottom: 0.5rem;">👀 Havainnot</li>
                    <li style="margin-bottom: 0.5rem;">💡 Vinkit</li>
                    <li style="margin-bottom: 0.5rem;">📣 Paikalliset julkaisut</li>
                    <li style="margin-bottom: 0.5rem;">💬 Muistot</li>
                </ul>
            </div>
        </div>

        <div class="intl-presentation-section">
            <h2>LaukaaInfo in English &amp; other languages</h2>
            <p style="text-align:center; color:#64748b; margin-bottom:1.5rem;">Short introduction to Laukaa and LaukaaInfo for international visitors.</p>
            <div class="tabs-container">
                <div class="tabs-header">
                    <button class="tab-btn active" data-tab="en">🇬🇧 English</button>
                    <button class="tab-btn" data-tab="sv">🇸🇪 Svenska</button>
                    <button class="tab-btn" data-tab="et">🇪🇪 Eesti</button>
                    <button class="tab-btn" data-tab="de">🇩🇪 Deutsch</button>
                    <button class="tab-btn" data-tab="es">🇪🇸 Español</button>
                </div>
                <div class="tabs-content">

                    <!-- English -->
                    <div class="tab-pane active" id="tab-en">
                        <h3>What can you do with LaukaaInfo?</h3>
                        <p><strong>📍 Explore places:</strong> Beaches, villages, outdoor destinations, sports venues, and other points of interest form the LaukaaInfo place network.</p>
                        <p><strong>🏢 Find local services:</strong> Businesses and services are discoverable by industry, need, area, and the places they're connected to.</p>
                        <p><strong>👀 Share what's happening:</strong> Anyone can submit observations and posts. Businesses can publish offers, events, and other timely content.</p>
                        <h3>We're building a digital place network for Laukaa</h3>
                        <p>Laukaa has thousands of places, businesses, events, memories, observations, and local stories. LaukaaInfo's mission is to connect them all – so that local knowledge is discoverable through place, area, service, and need.</p>
                    </div>

                    <!-- Svenska -->
                    <div class="tab-pane" id="tab-sv">
                        <h3>Vad är LaukaaInfo?</h3>
                        <p>LaukaaInfo är en lokal digital plattform som samlar Laukaas företag, tjänster, evenemang och nyheter på ett ställe. Tjänsten är tillgänglig som webbplats och Android-app och hjälper både invånare och besökare att snabbt hitta lokala tjänster, kontaktuppgifter och aktuell information.</p>
                    </div>

                    <!-- Eesti -->
                    <div class="tab-pane" id="tab-et">
                        <h3>Mis on LaukaaInfo?</h3>
                        <p>LaukaaInfo on kohalik digitaalne platvorm, mis koondab ühte kohta Laukaa ettevõtted, teenused, üritused ja uudised. Teenus on saadaval nii veebisaidina kui ka Android-rakendusena ning aitab nii elanikel kui ka külastajatel kiiresti leida kohalikke teenuseid.</p>
                    </div>

                    <!-- Deutsch -->
                    <div class="tab-pane" id="tab-de">
                        <h3>Was ist LaukaaInfo?</h3>
                        <p>LaukaaInfo ist eine lokale digitale Plattform, die Unternehmen, Dienstleistungen, Veranstaltungen und Nachrichten aus Laukaa an einem Ort bündelt. Der Dienst ist als Website und Android-App verfügbar und hilft sowohl Einwohnern als auch Besuchern, schnell lokale Dienste zu finden.</p>
                    </div>

                    <!-- Español -->
                    <div class="tab-pane" id="tab-es">
                        <h3>¿Qué es LaukaaInfo?</h3>
                        <p>LaukaaInfo es una plataforma digital local que reúne las empresas, servicios, eventos y noticias de Laukaa en un solo lugar. El servicio está disponible como sitio web y aplicación Android, y ayuda tanto a residentes como a visitantes a encontrar rápidamente servicios locales.</p>
                    </div>

                </div>
            </div>
        </div>

        <div class="cta-section">
            <h2>Rakennamme Laukaasta digitaalista paikkaverkostoa</h2>
            <p style="margin-bottom: 2rem;">Laukaassa on tuhansia paikkoja, yrityksiä, tapahtumia, muistoja, havaintoja ja paikallisia tarinoita.<br>LaukaaInfon tavoitteena on yhdistää nämä toisiinsa niin, että paikallinen tieto löytyy paikan, alueen, palvelun ja tarpeen kautta.</p>
            
            <div style="display: flex; flex-wrap: wrap; gap: 1rem; justify-content: center; margin-top: 2rem;">
                <a href="kohdekartta.html" style="background: white; color: var(--primary-blue); padding: 0.8rem 1.5rem; border-radius: 8px; font-weight: bold; text-decoration: none;">📍 Tutustu paikkaverkostoon</a>
                <a href="kauppa.html" style="background: white; color: var(--primary-blue); padding: 0.8rem 1.5rem; border-radius: 8px; font-weight: bold; text-decoration: none;">🏢 Yritykselle näkyvyyttä</a>
                <a href="https://play.google.com/store/apps/details?id=org.example.LaukaaLive&hl=fi" target="_blank" style="background: white; color: var(--primary-blue); padding: 0.8rem 1.5rem; border-radius: 8px; font-weight: bold; text-decoration: none;">📱 Lataa sovellus</a>
                <a href="ilmoittaudu.html" style="background: white; color: var(--primary-blue); padding: 0.8rem 1.5rem; border-radius: 8px; font-weight: bold; text-decoration: none;">👤 Osallistu</a>
            </div>
            
            <div style="margin-top: 3rem; padding-top: 2rem; border-top: 1px solid rgba(255,255,255,0.2);">
                <p><strong>LaukaaInfo / MediaZoo</strong><br>
                Kiinnostuitko näkyvyydestä tai yhteistyöstä? Ota yhteyttä!</p>
            </div>
        </div>

    </main>`;
    const newContent = content.substring(0, start) + replacement + content.substring(end);
    fs.writeFileSync('d:/Projekteja/MUUTprojektit/LaukaaInfo-livescreen/LaukaaInfo-livescreen/palvelun-esittely.html', newContent, 'utf8');
    console.log('Updated palvelun-esittely.html');
} else {
    console.log('Could not find tags');
}
