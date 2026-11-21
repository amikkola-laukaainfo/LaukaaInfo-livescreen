# LostReFound Kiertotalous: Lomakkeet, Luovutusehdot ja Tunnistepohjainen Matchaus

## 1. Strateginen perusajatus: Resurssien kierto vs. Perinteinen myyntipalsta

> **"Kaikkea ei tarvitse myydä. Kaikelle voi löytyä uusi käyttötarkoitus."**

LostReFound ei ole toinen Tori.fi tai huutokauppapaikka, vaan **paikallinen resurssi- ja kiertotalousverkosto**. Palvelun ydin on saattaa yhteen:
1. Resurssin tarjoaja (jolle esine tai materiaali on tarpeeton tai tilaa vievä).
2. Resurssin tarvitsija (joka voi hyödyntää sen sellaisenaan tai kunnostettuna).
3. Fyysiset solmukohdat (Laukaan mikrovarastot, kierrätyspisteet ja kunnan toimipaikat).
4. Luotettava toimijaverkosto (LaukaaInfo-tunnisteet `LI-XXXX-XXXX`).
5. **Älykäs, asteittain kehittyvä taksonomia (lauta $\leftrightarrow$ puutavara).**

---

## 2. Lomakkeiden luovutusehtojen rakenne

### A. Tarjotaan (OFFER) – Luovutusehto (`exchange_type`)
Lomakkeella ensimmäisenä ja oletuksena on aina maksuton kierto:

| Luovutusehto | Tunnus | Kuvaus käyttäjälle | Kentät lomakkeella |
| :--- | :--- | :--- | :--- |
| **Maksuton – annetaan hyötykäyttöön** *(Oletus)* | `FREE` | *"Annetaan maksutta sitä tarvitsevalle"* | Ei hintakenttää |
| **Korvauksesta voidaan sopia** | `NEGOTIABLE` | *"Avoin ehdotuksille / nimellinen korvaus"* | Mahdollinen suuntaa-antava toive (€) |
| **Kiinteä hinta** | `FIXED_PRICE` | *"Esineellä on kiinteä hinta"* | Hintakenttä (€, pakollinen jos valittu) |
| **Vaihdetaan johonkin muuhun** | `EXCHANGE` | *"Vaihto toiseen tavaraan, materiaaliin tai pieneen apuun"* | Kuvauskenttä: *"Mitä toivot vaihdossa?"* |

---

### B. Etsitään (WANTED) – Maksuhalukkuus (`exchange_type`)
Etsijä ilmaisee selkeästi odotuksensa resurssin hankinnasta:

| Maksuhalukkuus | Tunnus | Kuvaus käyttäjälle | Kentät lomakkeella |
| :--- | :--- | :--- | :--- |
| **Etsin maksutonta** *(Oletus)* | `WANT_FREE` | *"Etsitään lahjoitettavaa / poistomateriaalia"* | Ei budjettikenttää |
| **Voin maksaa kohtuullisen korvauksen** | `CAN_PAY_REASONABLE` | *"Olen valmis pieneen vaivanpalkkaan tai korvaukseen"* | Vapaa huomio |
| **Minulla on enimmäisbudjetti** | `MAX_BUDGET` | *"Minulla on tietty kipuraja"* | Enimmäisbudjetti (€) |
| **Voin tarjota vaihtotavaraa tai apua** | `CAN_EXCHANGE` | *"Tarjotaan jotain vaihdossa"* | Kuvauskenttä: *"Mitä voit tarjota vaihdossa?"* |

---

## 3. Tunnistepohjainen ja kehittyvä taksonomiamatchaus

### A. Käsitehierarkia: "Tarjoan lautaa" $\leftrightarrow$ "Etsin puutavaraa"
Käyttäjien ei tarvitse käyttää samoja sanoja osuakseen toisiinsa. Matchausmoottori ymmärtää käsitteiden väliset suhteet:

```
                  [ MAT.WOOD (Puutavara & Puutuotteet) ]  ← YLÄKÄSITE
                                     │
           ┌─────────────────────────┴────────────────────────┐
           ▼                                                  ▼
[ MAT.WOOD.LUMBER (Sahatavara) ]                  [ MAT.WOOD.PLYWOOD (Vanerit & levyt) ]
  • Lauta, lankku, kakkosnelonen                    • Vaneri, filmivaneri, OSB-levy
  • Rimat, terassilauta, soiro
```

* **Ylhäältä alas (Hypernym $\rightarrow$ Hyponym):**
  * Etsitään: *"puutavaraa"* $\rightarrow$ Matchaus löytää kaikki ilmoitukset, joissa tarjotaan *"lautaa"*, *"lankkua"* tai *"kakkosnelosta"*.
* **Alhaalta ylös (Hyponym $\rightarrow$ Hypernym):**
  * Tarjotaan: *"lautaa"* $\rightarrow$ Matchaus osuu käyttäjään, joka etsii *"puutavaraa"*, *"rakennusmateriaalia"* tai nimenomaan *"lautaa"*.
* **Synonyymit ja ammattisanasto:**
  * `kakkosnelonen` = `2x4` = `50x100` = `soiro`
  * `kuormalava` = `eurolava` = `EUR-lava` = `teholava`

---

### B. Asteittain kehittyvä taksonomia uusien hakusanojen myötä
Taksonomia ei ole lukittu kiinteäksi luetteloksi, vaan se **oppii ja rikastuu käytön myötä**:

1. **Vapaa ilmoittaminen:** Käyttäjän ei tarvitse selata kankeita valikoita; hän kirjoittaa otsikon ja kuvauksen vapaasti.
2. **Käsitteiden automaattinen poiminta (Concept Extraction):**
   * Järjestelmä vertaa sanoja tunnettuihin käsitteisiin (`taxonomy_concepts`) ja synonyymeihin (`taxonomy_synonyms`).
3. **Uusien termien keräysjono (`taxonomy_unmapped_terms`):**
   * Jos ilmoituksessa esiintyy sana, jota ei vielä tunneta (esim. *"lämpöpuu"*, *"harkko"* tai *"akkurälläkkä"*), se rekisteröidään taustalle.
4. **Semanttinen kytkentä ja laajennus:**
   * Uusi sana yhdistetään automaattisesti lähimpään käsitteeseen semanttisen samankaltaisuuden (vektoriavaruus / upotukset) avulla.
   * Ylläpitäjä voi myös LaukaaInfon hallintapaneelista (`TaxonomyAdminTab`) vahvistaa sanan viralliseksi synonyymiksi tai uudeksi alakäsitteeksi yhdellä klikkauksella.

---

### C. Toimijatunnisteet (`LI-XXXX-XXXX`) luottamuksen ja solmukohtien takaajana

Kiertotalouden matchauksessa on kaksi toisiaan täydentävää tunnistetta:
1. **Resurssitunniste (Taksonomiakäsite, esim. `MAT.WOOD.LUMBER`):**
   * Vastaa kysymykseen: *Mitä tavaraa tai materiaalia tämä on?*
2. **Toimijatunniste (`circular_actors`, esim. `LI-8K4P-72MX`):**
   * Vastaa kysymykseen: *Kuka on luovuttaja/vastaanottaja ja mikä on hänen toimintatasonsa?*
   * **Anonyymi & turvallinen:** Yhteydenpito ja matchit hoidetaan tunnisteiden avulla ilman puhelinnumeroiden tai sähköpostien levittämistä.
   * **Toimijatasot:**
     * *Taso 1 (Yksityishenkilö):* Normaali ilmoittaja ja noutaja.
     * *Taso 2 (Vahvistettu toimija):* Luotettava aktiivikierrättäjä (+15 % painoarvo sujuvuudessa).
     * *Taso 3 (Organisaatio / Yritys / Kunta):* Pystyy luovuttamaan suuria eriä ja käyttämään virallisia mikrovarastoja.
   * **Mikrovarastosolmut:** Jos molemmilla osapuolilla on hyväksytty varastointi (`STORAGE_OK`), järjestelmä kytkee heidät automaattisesti lähimpään fyysiseen mikrovarastoon (esim. *"Laukaan pääkirjasto"*).

---

## 4. Matchausmoottorin pisteytysalgoritmi (Scoring V2)

Matchauksen kokonaispisteet muodostuvat seuraavasti:

$$\text{Pisteet} = S_{\text{taksonomia}} \times 0.40 + S_{\text{sijainti}} \times 0.25 + S_{\text{luovutustapa}} \times 0.15 + S_{\text{talous}} \times 0.10 + S_{\text{luotettavuus}} \times 0.10$$

1. **Taksonomiapisteet ($S_{\text{taksonomia}}$):**
   * Täysi osuma (sama alakäsite tai synonyymi, esim. lauta $\leftrightarrow$ lauta): **100 %**
   * Hierarkiaosuma (alakäsite $\leftrightarrow$ yläkäsite, esim. lauta $\leftrightarrow$ puutavara): **85–90 %**
   * Semanttinen lähikäsitematch (esim. kakkosnelonen $\leftrightarrow$ rakennuspuu): **75–80 %**
2. **Taloudellinen yhteensopivuus ($S_{\text{talous}}$):**
   * `FREE` $\leftrightarrow$ `WANT_FREE`: **100 %** (Maksuton kiertotalous)
   * `FREE` $\leftrightarrow$ `CAN_PAY_REASONABLE` tai `MAX_BUDGET`: **100 %**
   * `NEGOTIABLE` $\leftrightarrow$ `CAN_PAY_REASONABLE`: **95 %**
   * `EXCHANGE` $\leftrightarrow$ `CAN_EXCHANGE`: **100 %**
   * Hinta ei koskaan estä matchia kokonaan, vaan pieni hintaero antaa edelleen ~60 % pisteytyksen ja huomautuksen.
3. **Toimijaluotettavuus ($S_{\text{luotettavuus}}$):**
   * Molemmilla vahvistettu `LI-XXXX-XXXX` -tunniste: **100 %**
   * Toisella tai ei kummallakaan: **70 %**

---

## 5. Tietokantataulut kehittyvälle taksonomialle

```sql
-- 1. Taksonomiakäsitteet ja niiden hierarkia
CREATE TABLE IF NOT EXISTS circular_taxonomy_concepts (
    id TEXT PRIMARY KEY,               -- esim. 'MAT.WOOD', 'MAT.WOOD.LUMBER'
    parent_id TEXT REFERENCES circular_taxonomy_concepts(id),
    name_fi TEXT NOT NULL,             -- esim. 'Sahatavara'
    level INT NOT NULL DEFAULT 1,       -- 1=pääluokka, 2=alalaji, 3=tarkka
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Synonyymit, ammattisanat ja kansankieliset termit
CREATE TABLE IF NOT EXISTS circular_taxonomy_synonyms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    concept_id TEXT REFERENCES circular_taxonomy_concepts(id) ON DELETE CASCADE,
    term TEXT NOT NULL,                -- esim. 'lauta', 'kakkosnelonen', '2x4'
    is_primary BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Asteittain kehittyvä sanasto: Tuntemattomat hakusanat
CREATE TABLE IF NOT EXISTS circular_taxonomy_unmapped_terms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    term TEXT UNIQUE NOT NULL,
    frequency INT DEFAULT 1,
    suggested_concept_id TEXT REFERENCES circular_taxonomy_concepts(id),
    status TEXT DEFAULT 'PENDING',     -- 'PENDING', 'APPROVED', 'IGNORED'
    last_seen_at TIMESTAMPTZ DEFAULT NOW()
);
```
