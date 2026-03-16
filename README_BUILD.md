# Yrityksen lisääminen ja build-prosessi

Tämä dokumentti kuvaa vaiheet uuden yrityksen lisäämisen jälkeen, erityisesti kun kyseessä on maksu-tyyppinen (Premium) yritys.

## Vaiheet

1. **Datan päivitys**: Varmista, että yritys on lisätty `companies_data.json` -tiedostoon.
   - Yrityksen `tyyppi`-kentän arvon on oltava `maksu` (tai `paid`).
   - Varmista, että yrityksellä on tarvittavat tiedot (nimi, osoite, logo jne.).

2. **Rakennusprosessi (Build)**: Suorita komento:
   ```powershell
   node build.js
   ```
   Tämä tekee nyt seuraavaa automaattisesti:
   - **Hakee tuoreimman datan** palvelimelta (`companies_data.json`).
   - Tyhjentää ja luo `dist/`-kansio.
   - Kopioi ja minifioi kaikki tiedostot.
   - Kutsuu `generate_premium.js`-tiedostoa, joka luo yritykselle oman staattisen sivun kansioon `dist/yritys/[slug].html`.
   - Päivittää versioinnit ja viittaukset.

3. **Julkaisu**: Kopioi `dist/`-kansion sisältö palvelimelle.

## Huomioitavaa
- Jos haluat vain generoida premium-sivut nopeasti ilman koko projektin minifiointia, voit ajaa:
  ```powershell
  node generate_premium.js
  ```
  Mutta tämä edellyttää, että `dist/`-kansio on jo olemassa ja siellä on tarvittavat resurssit. `node build.js` on suositeltu tapa varmistaa, että kaikki on ajan tasalla.
