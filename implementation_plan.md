# Laukaan linkkihakemiston uudistaminen

Tässä suunnitelmassa uudistetaan `yhteisot-ja-linkit.html` sivu selkeäksi "Laukaan linkkihakemistoksi". Hakemisto hyödyntää kaksiportaista kategorisointia, korostaa suosituimmat linkit ylimpänä ja parantaa mobiilikäytettävyyttä haitarimaisella (accordion) rakenteella. Lisäksi päivitetään linkkien hallintasovellus (`laukaainfo-somelinkit`) tukemaan uutta rakennetta ja ohjataan AI-avustin käyttämään uusia kategorioita.

## User Review Required

> [!IMPORTANT]
> **Kategorioiden päivitys hallintapaneelissa:** Hallintapaneelin koodiin päivitetään uudet oletuskategoriat. Jotta nämä tulevat selaimeesi aktiiviseksi, sinun tulee joko painaa hallintapaneelin "Kategoriat"-välilehdeltä **"Palauta oletuskategoriat"** tai tyhjentää selaimen LocalStorage. Tämä korvaa aiemmat kategoriat uusilla.

> [!NOTE]
> **Olemassa olevien linkkien siirto:** Kun kategoriajärjestelmä muuttuu, tietokannassa olevat vanhat linkit (esim. kategorialla "yhdistykset") asettuvat automaattisesti oikean uuden pääkategorian alle (jos nimi täsmää), tai ne näkyvät "Muut"-kategoriassa. Voit käyttää hallintapaneelin AI-avustimen "Muokkaa koko linkistöä" -toimintoa ajaaksesi olemassa olevat linkit läpi tekoälyllä, joka lajittelee ne automaattisesti uusiin alakategorioihin!

## Ehdotetut muutokset

### 1. Linkkien hallintasovellus (`laukaainfo-somelinkit`)

#### [MODIFY] `src/components/CategoriesManager.tsx`
- Päivitetään `DEFAULT_CATEGORIES` -vakio sisältämään ehdotetut uudet pääkategoriat ja niiden alakategoriat:
  - Viranomaiset ja julkiset palvelut (Laukaan kunta, Kirjasto, Kela...)
  - Tapahtumat ja kulttuuri (Visit Laukaa, Museot...)
  - Harrastukset ja yhdistykset (Urheiluseurat, Kyläyhdistykset...)
  - Seurakunnat ja yhteisöt
  - Yritykset ja yrittäjät
  - Hyvinvointi
  - Perheet
  - Eläimet
  - Luonto ja retkeily
  - Liikenne
  - Some ja paikallismedia
  - Hyödylliset palvelut
- Koska hallintapaneelin arkkitehtuuri (ja AI-avustin) tukee jo kaksiportaista `Pääkategoria / Alikategoria` -muotoa, tämä yksi muutos riittää päivittämään koko AI-promptin luonnin ja lomakkeiden valikot automaattisesti.

### 2. LaukaaInfo-livescreen (Käyttöliittymä)

#### [MODIFY] `yhteisot-ja-linkit.html`
- Muutetaan sivun otsikointi ja esittelyteksti vastaamaan "Laukaan linkkihakemistoa" ja "Paikalliset yhteisöt ja hyödylliset palvelut" -teemaa.
- Lisätään uusi säiliö "Suosituimmat" -linkeille heti sivun yläosaan.

#### [MODIFY] `yhteisot.js`
- **Suosituimmat-osio:** Lisätään logiikka, joka renderöi kaikki linkit, joilla on `is_highlighted === true`, näyttävään ruudukkoon hakemiston alkuun.
- **Accordion-UI (Haitarit):** Muutetaan nykyinen painikkeisiin perustuva suodatus mobiiliystävälliseksi haitarirakenteeksi. Pääkategoriat renderöidään leveinä palkkeina (kuten 🏛️ Viranomaiset), joita klikkaamalla aukeaa sen alle kuuluvat alakategoriat ja linkkikortit.
- **Teemat ja ikonit:** Päivitetään `categoryStyles` ja `catIcons` vastaamaan uusia pääkategorioita (esim. `viranomaiset`, `tapahtumat`, `harrastukset`, `luonto`), jotta jokaisella kategorialla on oma tunnistettava värimaailma ja ikoni.
- **Järjestys:** Päivitetään `categoryOrder` noudattamaan uutta haluttua esitysjärjestystä.

#### [MODIFY] `style.css` / `verkostokartta.css` (tai uusi tyylitiedosto)
- Lisätään tarvittavat CSS-tyylit uutta haitarirakennetta varten (animaatiot avaukselle, nuoli-ikonien kääntyminen, siisti asettelu).

## Verification Plan

### Automatisoidut testit / Koodin tarkistus
- Varmistetaan, että `npm run build` menee läpi ilman virheitä hallintapaneelissa.
- Varmistetaan, että `yhteisot.js` latautuu selaimessa oikein ja parseroi uudet kategoriat ongelmitta.

### Manuaalinen vahvistus
- Avataan `yhteisot-ja-linkit.html` ja tarkistetaan, että "Suosituimmat" -osio näkyy oikein.
- Klikataan eri kategorioita ja varmistetaan, että haitarit aukeavat sujuvasti ja alakategoriat asettuvat niiden sisään loogisesti.
- Avataan hallintapaneeli paikallisesti ja tarkistetaan, että uudet kategoriat ovat ilmestyneet ja AI-avustimen promptissa näkyy oikea uusi kategorialistaus.
