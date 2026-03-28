JavaScript lukee nyt URL-osoitteesta mahdollisen yrityksen ja muokkaa toimintaansa seuraavasti:

1. Lukee parametrin `?yritys=nimi`
2. Lisää sen suoraan fetch-kyselyyn urliin muodossa: `&yritys=nimi` (samalla `encodeURIComponent` varmistaa, että urli ei mene rikki jos nimessä on välilyöntejä yms. erikoismerkkejä).
3. Jos parametri tunnistetaan, se nappaa sivun pääotsikon (`<h1>`) ja vaihtaa sen "Viikon nostot: [Nimi]". Lisäsin siihen vielä automaattisen ison alkukirjaimen muotoilun, jolloin esim. `?yritys=tokmanni` muuttuu visuaalisesti hienommin muotoon "Viikon nostot: Tokmanni". Samalla päivittyy selaimen yläpalkissa näkyvä ikkunanotsikko (document.title).

Voidaan laittaa jakoon ja kokeilla sitä livenä heti, kun haluat testata!

1

viikko.html



Kun viet `feed/viikko.html` -sivun takaisin palvelimelle, itse verkkosivun osoite muotoillaan laittamalla urliin perään `?yritys=yrityksennimi`.

Eli lyhyesti:

**1. Sivu, joka näyttää kaikkien viikon nostot:** `https://laukaainfo.fi/feed/viikko.html` *(Tämä lähettää taustalla API-haun osoitteeseen: `.../api.php?limit=50`)*

**2. Sivu, joka näyttää vain jokusen tietyn yrityksen nostot:** `https://laukaainfo.fi/feed/viikko.html?yritys=tokmanni` *(Tämä lähettää taustalla API-haun muokattuun osoitteeseen: `.../api.php?limit=50&yritys=tokmanni`)*

Näin voit rakentaa esimerkiksi yksittäisille yrityksille omia suoralinkkejä suoraan heidän ilmoituksiinsa – molemmat käyttävät kuitenkin tuota yhtä ja samaa viikko.html leiskaa!
