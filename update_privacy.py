import re

def update():
    with open('tietosuoja.html', 'r', encoding='utf-8') as f:
        content = f.read()

    new_html = """<div class="policy-container">
        <h1>Tietosuojaseloste ja käyttöehdot – Laukaainfo.fi</h1>

        <h2>1. Rekisterinpitäjä</h2>
        <p>
            Tmi Mediazoo<br>
            Antti Mikkola<br>
            41400 Lievestuore<br>
            Sähköposti: info@mediazoo.fi<br>
            Puhelin: 0414655290
        </p>

        <h2>2. Keitä olemme</h2>
        <p>Verkkosivustomme osoite on: <a href="https://www.laukaainfo.fi">https://www.laukaainfo.fi</a></p>
        <p>Laukaainfo.fi on paikallinen tietopalvelu, joka kokoaa ja julkaisee tietoa tapahtumista, palveluista ja yrityksistä. Palvelun tavoitteena on tukea alueellista näkyvyyttä, yrittäjyyttä ja elinvoimaa.</p>
        <p>Sivustolla voidaan hyödyntää julkisia ja avoimia tietolähteitä sekä yritysten itse toimittamia tai julkaisemia tietoja.</p>

        <h2>3. Palvelun luonne ja vastuunrajoitus</h2>
        <p>Laukaainfo.fi ja Laukaainfo -mobiilisovellus ovat lisänäkyvyyspalvelu, eivätkä ne takaa liiketoiminnallisia tuloksia, asiakasmääriä tai markkinoinnin vaikutuksia.</p>
        <p>Palvelu tarjotaan “sellaisenaan” (as-is).</p>
        <p>Rekisterinpitäjä tai palvelun ylläpitäjä (Mediazoo) ei vastaa:</p>
        <ul>
            <li>yritysten toiminnasta tai liiketoiminnallisista päätöksistä</li>
            <li>asiakkaiden ja yritysten välisistä sopimuksista</li>
            <li>taloudellisista tai muista vahingoista</li>
            <li>palvelun kautta saatujen tietojen käytöstä</li>
            <li>kolmansien osapuolten toiminnasta</li>
        </ul>

        <h2>4. Yritysten tiedot ja sisällöt</h2>
        <p>Yritys vastaa itse kaikista palveluun toimittamistaan tai hyväksymistään tiedoista, kuten:</p>
        <ul>
            <li>yhteystiedot</li>
            <li>aukioloajat</li>
            <li>kuvaukset ja esittelytekstit</li>
            <li>kuvat ja muu media</li>
        </ul>
        <p>Kuvat voivat olla:</p>
        <ul>
            <li>yrityksen itse toimittamia materiaaleja, tai</li>
            <li>suoria linkkejä yrityksen omille verkkosivuille tai muihin julkisiin lähteisiin</li>
        </ul>
        <p>Yritys vakuuttaa, että sillä on oikeus käyttää ja julkaista toimittamaansa materiaalia.</p>

        <h2>5. Tietojen lähteet</h2>
        <p>Palvelussa esitettävät tiedot voidaan kerätä:</p>
        <ul>
            <li>julkisista rekistereistä</li>
            <li>avoimista tietolähteistä</li>
            <li>yritysten omilta verkkosivuilta</li>
            <li>yritysten itse toimittamista tiedoista</li>
        </ul>
        <p>Tietoja käytetään alueellisen tiedon välittämiseen ja näkyvyyden parantamiseen.</p>

        <h2>6. Tietojen oikeellisuus ja korjaukset</h2>
        <p>Laukaainfo ei vastaa tietojen oikeellisuudesta, ajantasaisuudesta tai täydellisyydestä.</p>
        <p>Yritys tai toimija voi pyytää:</p>
        <ul>
            <li>tietojen korjaamista</li>
            <li>tietojen päivittämistä</li>
            <li>tietojen poistamista</li>
        </ul>
        <p>Ottamalla yhteyttä rekisterinpitäjään.</p>

        <h2>7. Tietojen poistaminen</h2>
        <p>Yritykset ja muut toimijat voivat milloin tahansa pyytää tietojensa poistamista palvelusta.</p>
        <p>📩 Tietojen poistopyynnöt käsitellään ottamalla yhteyttä rekisterinpitäjään (Mediazoo).<br>
        Poisto tehdään kohtuullisessa ajassa pyynnön vastaanottamisesta.</p>

        <h2>8. Tietosuoja ja GDPR</h2>
        
        <h3>8.1 Käsiteltävät tiedot</h3>
        <p>Käsiteltäviä tietoja voivat olla:</p>
        <ul>
            <li>yrityksen nimi</li>
            <li>yhteystiedot</li>
            <li>verkkosivut ja somekanavat</li>
            <li>toimialatiedot</li>
            <li>julkisesti saatavilla olevat yritystiedot</li>
        </ul>
        <p>Arkaluonteisia henkilötietoja ei käsitellä.</p>

        <h3>8.2 Tietojen lähde</h3>
        <p>Tiedot saadaan:</p>
        <ul>
            <li>yritykseltä itseltään</li>
            <li>julkisista lähteistä (esim. verkkosivut ja yritysrekisterit)</li>
        </ul>

        <h3>8.3 Tietojen luovutus</h3>
        <p>Tietoja ei luovuteta kolmansille osapuolille markkinointitarkoituksiin.</p>
        <p>Tietoja käytetään ainoastaan Laukaainfo-palvelun hakemistossa, näkyvyydessä ja palvelun toiminnassa.</p>

        <h3>8.4 Rekisteröidyn oikeudet</h3>
        <p>Yrityksellä ja toimijoilla on oikeus:</p>
        <ul>
            <li>tarkastaa omat tietonsa</li>
            <li>pyytää tietojen korjaamista</li>
            <li>pyytää tietojen poistamista</li>
            <li>rajoittaa tietojen käsittelyä</li>
        </ul>

        <h2>9. Maksut ja maksupalvelut</h2>
        <p>Sivustolla voidaan tarjota maksullisia näkyvyys- ja lisäpalveluita.</p>
        <p>Maksujen käsittelyssä voidaan käyttää maksupalveluntarjoajaa, kuten Stripe.</p>
        <p>Kun maksut suoritetaan, maksutapahtuman käsittelyyn välittyy tarpeellisia tietoja, kuten:</p>
        <ul>
            <li>nimi</li>
            <li>sähköpostiosoite</li>
            <li>maksutiedot</li>
            <li>IP-osoite</li>
            <li>ostotapahtuman tiedot</li>
        </ul>
        <p>Rekisterinpitäjä ei tallenna maksukorttitietoja.</p>
        <p>Lisätietoja: <a href="https://stripe.com/privacy" target="_blank">https://stripe.com/privacy</a></p>

        <h2>10. Kommentit</h2>
        <p>Kun käyttäjät jättävät kommentteja, kerätään:</p>
        <ul>
            <li>kommentin sisältö</li>
            <li>IP-osoite</li>
            <li>selaimen käyttäjätiedot</li>
        </ul>
        <p>Tarkoituksena on roskapostin estäminen.</p>
        <p>Sähköpostista voidaan luoda anonymisoitu tunniste (hash), joka voidaan lähettää Gravatar-palveluun.<br>
        Lisätietoja: <a href="https://automattic.com/privacy/" target="_blank">https://automattic.com/privacy/</a></p>

        <h2>11. Media</h2>
        <p>Jos sivustolle ladataan kuvia, tulee välttää sijaintitietoja (EXIF GPS).<br>
        Kävijät voivat mahdollisesti ladata ja lukea kuvista metatietoja.</p>

        <h2>12. Evästeet</h2>
        <p>Sivusto käyttää evästeitä käyttäjäkokemuksen parantamiseen.</p>
        <p>Evästeitä voidaan käyttää esimerkiksi:</p>
        <ul>
            <li>kirjautumisen muistamiseen</li>
            <li>kommentoinnin helpottamiseen</li>
            <li>sivuston toiminnallisuuksiin</li>
        </ul>
        <p>Evästeet voivat säilyä:</p>
        <ul>
            <li>istunnon ajan</li>
            <li>tai 1–2 viikkoa / 1 vuosi käyttötarkoituksesta riippuen</li>
        </ul>

        <h2>13. Upotettu sisältö muilta sivustoilta</h2>
        <p>Sivuston artikkelit voivat sisältää upotettua sisältöä (esim. videot, kuvat, artikkelit).</p>
        <p>Upotettu sisältö toimii samalla tavalla kuin vierailu alkuperäisellä sivustolla, ja nämä sivustot voivat:</p>
        <ul>
            <li>kerätä tietoja</li>
            <li>käyttää evästeitä</li>
            <li>seurata käyttäjän toimintaa</li>
        </ul>

        <h2>14. Tietojen säilytysaika</h2>
        <ul>
            <li>Kommentit säilytetään toistaiseksi</li>
            <li>Käyttäjätilien tiedot säilytetään niin kauan kuin tili on aktiivinen</li>
            <li>Yritystiedot säilytetään niin kauan kuin ne ovat palvelun kannalta tarpeellisia ja ajantasaisia</li>
        </ul>

        <h2>15. Mitä oikeuksia sinulla on</h2>
        <p>Käyttäjät ja yritykset voivat pyytää:</p>
        <ul>
            <li>omien tietojen tarkastusta</li>
            <li>tietojen korjausta</li>
            <li>tietojen poistamista</li>
            <li>tietojen siirtoa (koostetiedosto)</li>
        </ul>
        <p>Poistopyynnöt eivät koske tietoja, joita on säilytettävä lakisääteisistä, hallinnollisista tai tietoturvasyistä.</p>

        <h2>16. Ehtojen muutokset</h2>
        <p>Ehtoja voidaan päivittää ilman erillistä ilmoitusta. Ajantasainen versio on aina saatavilla Laukaainfo.fi-sivustolla.</p>

        <h2>17. Sovellettava laki</h2>
        <p>Näihin ehtoihin sovelletaan Suomen lakia.</p>
    </div>"""

    # Add h3 to CSS
    if '.policy-container h3' not in content:
        content = content.replace('</style>', '''        .policy-container h3 {
            font-size: 1.2rem;
            margin-top: 1.5rem;
            margin-bottom: 0.5rem;
            color: var(--primary-blue);
        }
    </style>''')

    # Replace the actual content block
    start_idx = content.find('<div class="policy-container">')
    end_idx = content.find('</div>', start_idx) + 6 # Include closing tag

    if start_idx != -1 and end_idx != -1:
        new_file_content = content[:start_idx] + new_html + content[end_idx:]
        with open('tietosuoja.html', 'w', encoding='utf-8') as f:
            f.write(new_file_content)
        print("Successfully updated tietosuoja.html")
    else:
        print("Could not find the target block.")

if __name__ == '__main__':
    update()
