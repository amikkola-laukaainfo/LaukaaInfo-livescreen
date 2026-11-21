# Vaihe 2A: Pisteytysmalli ja matchauksen säännöt
*Kiertotalousresurssien kohtaamisjärjestelmä — LostReFound — 20.11.2026 (Tarkennettu ja validoitu versio)*

---

## 1. Ydinperiaate: Kaksi erillistä ulottuvuutta

Kohtaamisessa ei koskaan sekoiteta tuotteen sopivuutta ja logistiikan helppoutta yhdeksi sumeaksi luvuksi ilman osakomponentteja.

```
                    ┌────────────────────────────────────────┐
                    │          UUSI ILMOITUS JONOSSA         │
                    └───────────────────┬────────────────────┘
                                        │
                                        ▼
                    ┌────────────────────────────────────────┐
                    │      VAIHE 1: EHDOTTOMAT EHDOT         │
                    │           (Hard Gating)                │
                    │  • Eri käyttäjät (firebase_uid)        │
                    │  • OFFER ↔ WANTED                      │
                    │  • Molemmat tilassa 'ACTIVE'           │
                    │  • Ei jyrkkää luokkaristiriitaa        │
                    │  • Alustava etäisyyskarsinta           │
                    └───────────────────┬────────────────────┘
                                        │ Läpäisee
                                        ▼
         ┌──────────────────────────────┴──────────────────────────────┐
         │                                                             │
         ▼                                                             ▼
┌─────────────────────────────────┐           ┌─────────────────────────────────┐
│     MATCH CONFIDENCE (0..1)     │           │     FULFILLMENT SCORE (0..1)    │
│  "Kuinka hyvin resurssit        │           │  "Kuinka todennäköisesti        │
│   vastaavat toisiaan?"          │           │   siirto voidaan toteuttaa?"    │
│  • Otsikko & kuvaus (teksti)    │           │  • Etäisyys (PostGIS km clamp)  │
│  • Mitat ja toleranssi          │           │  • Aikaikkunan interpolaatio    │
│  • Määrä (osittainen match!)    │           │  • Noutotapojen yhteensopivuus  │
│  • Kunto ja laatuvaatimus       │           │  • Todellinen mikrovarastoetäisyys│
└────────────────┬────────────────┘           └────────────────┬────────────────┘
                 │                                             │
                 └──────────────────────┬──────────────────────┘
                                        │
                                        ▼
                    ┌────────────────────────────────────────┐
                    │        KYNNYSARVOT JA PÄÄTÖS           │
                    │  • Match Confidence >= 0.40            │
                    │  • Fulfillment Score >= 0.30           │
                    │  • Total Score >= 0.50                 │
                    │  → Kirjataan circular_matches -tauluun │
                    └────────────────────────────────────────┘
```

---

## 2. Vaihe 1: Ehdottomat ehdot (Hard Gating)

Jos yksikään näistä ehdoista ei täyty, kandidaattiparia **ei pisteytetä lainkaan** ($S = 0$):

1. **Vastakkaiset tyypit:** Toisen on oltava `OFFER` ja toisen `WANTED`.
2. **Eri käyttäjät:** `offer.firebase_uid <> wanted.firebase_uid` (estetään itsensä kanssa matchaus).
3. **Molemmat aktiivisia:** Molempien tila on oltava `ACTIVE`.
4. **Alustava etäisyyskarsinta:** $d \le \max(R_{\text{offer}}, R_{\text{wanted}}) \times 1.5$. Jos etäisyys ylittää kummankin toiveet yli 50 %:lla eikä kumpikaan salli mikrovarastoa, suora kohtaaminen hylätään heti.
5. **Hintaehto:** Tarjoajan hinta ei saa ylittää hakijan mahdollista maksimibudjettia (jos ilmoitettu). Jos tarjoaja jakaa ilmaiseksi (`price_eur = 0`), ehto täyttyy aina.

---

## 3. Match Confidence ($S_{\text{conf}} \in [0.0, 1.0]$)
*"Kuinka hyvin tarjottu resurssi vastaa hakijan tarvetta?"*

Kaava:
$$S_{\text{conf}} = 0.35 \cdot S_{\text{text}} + 0.30 \cdot S_{\text{dim}} + 0.20 \cdot S_{\text{qty}} + 0.15 \cdot S_{\text{cond}}$$

### 3.1. Tekstuaalinen ja käsitteellinen vastaavuus ($S_{\text{text}}$)
- Vertaillaan otsikon ja kuvauksen avainsanoja (leksikaalinen token-overlap, poistettu täytesanat):
  $$S_{\text{text}} = \frac{|\text{Tokens}_{\text{offer}} \cap \text{Tokens}_{\text{wanted}}|}{|\text{Tokens}_{\text{wanted}}|}$$
- Jos käyttäjät ovat valinneet saman taksonomiakäsitteen (esim. `puutavara`), $S_{\text{text}} = 1.0$.
- Jos käyttäjät käyttävät synonyymejä (esim. `kakkosnelonen` $\leftrightarrow$ `48x98`), synonyymisanasto nostaa arvon arvoon $1.0$.

### 3.2. Mitat ja toleranssi ($S_{\text{dim}}$)
Attribuuttien `dimension_mm` tai `length_m` vertailu:
- **Toleranssialue $\pm 10\%$:**
  - Jos tarjolla on $48 \times 98\text{ mm}$ ja etsitään $50 \times 100\text{ mm}$, poikkeama on alle $4\%$ $\implies S_{\text{dim}} = 1.0$ (käytännössä täysin yhteensopiva runkopuuksi!).
  - Jos tarjolla on pituutta $3.0\text{ m}$ ja tarvitaan vähintään $2.5\text{ m}$, tarjottu pituus riittää $\implies S_{\text{dim}} = 1.0$.
  - Jos tarjottu pituus on $1.5\text{ m}$ ja tarve on $3.0\text{ m}$, mittaehto ei täyty $\implies S_{\text{dim}} = 0.1$.
- **Puuttuvat mittatiedot:**
  - Jos kumpikaan osapuoli ei ole määrittänyt mittoja $\implies S_{\text{dim}} = 0.50$ (neutraali oletusarvo).
  - Jos toinen osapuoli on määrittänyt mitat ja toinen ei $\implies S_{\text{dim}} = 0.60$ (mahdollinen osuma, mutta mitat on vahvistettava).

### 3.3. Määrä ja osittainen match ($S_{\text{qty}}$)
Kiertotaloudessa määrän ei tarvitse olla identtinen:
- **Täysi kattavuus:** Tarjolla $Q_{\text{offer}} \ge Q_{\text{wanted}}$ $\implies S_{\text{qty}} = 1.0$.
- **Osittainen match:** Tarjolla $Q_{\text{offer}} < Q_{\text{wanted}}$:
  $$S_{\text{qty}} = \max\left(0.3, \frac{Q_{\text{offer}}}{Q_{\text{wanted}}}\right)$$
  *Esimerkki:* Hakija tarvitsee $150\text{ m}$ ja tarjoajalla on $100\text{ m}$ $\implies S_{\text{qty}} = 100 / 150 = 0.67$. Tämä on erittäin käyttökelpoinen osittainen osuma!
- **Puuttuva määrätieto:** Jos määrää ei ole eritelty kummassakaan tai toisessa $\implies S_{\text{qty}} = 0.80$ (oletetaan vakio kertaerä).

### 3.4. Kunto ($S_{\text{cond}}$)
Kuntoluokituksen hierarkia: `NEW` (4) $>$ `GOOD` (3) $>$ `FAIR` (2) $>$ `FOR_PARTS` (1).
- Jos tarjottu kunto $\ge$ hakijan minimivaatimus $\implies S_{\text{cond}} = 1.0$.
- Jos tarjottu kunto on yhden pykälän hakijan toivetta heikompi (esim. toive `GOOD`, tarjolla `FAIR`) $\implies S_{\text{cond}} = 0.60$.
- Jos tarjolla on `FOR_PARTS` ja hakija vaatii `NEW` $\implies S_{\text{cond}} = 0.10$.
- **Puuttuva kuntotieto:** Jos kuntoa ei ole määritelty $\implies S_{\text{cond}} = 0.70$ (normaali käyttökelpoinen oletuskunto).

---

## 4. Fulfillment Score ($S_{\text{fulf}} \in [0.0, 1.0]$)
*"Kuinka todennäköisesti ja helposti siirto voidaan toteuttaa?"*

Kaava:
$$S_{\text{fulf}} = 0.45 \cdot S_{\text{dist}} + 0.35 \cdot S_{\text{time}} + 0.20 \cdot S_{\text{pickup}}$$

### 4.1. Etäisyyspisteet ($S_{\text{dist}}$)
Lasketaan PostGISin todellisella etäisyydellä ($d$ metreinä) ja sidotaan (clamp) tiukasti välille $[0.0, 1.0]$:
$$R_{\text{max}} = \max(R_{\text{offer}}, R_{\text{wanted}})$$
$$S_{\text{dist}} = \max\left(0.0, \min\left(1.0, 1.0 - \frac{d}{R_{\text{max}}}\right)\right)$$
*Esimerkki:* $R_{\text{max}} = 10\text{ km}$, etäisyys $2\text{ km}$ $\implies S_{\text{dist}} = 1.0 - 0.2 = 0.80$.

### 4.2. Aikaikkunan pelivara ($S_{\text{time}}$)
Verrataan tarjoajan eroonpääsyn aikarajaa ($T_{\text{offer}}$) ja hakijan tarveaikaa ($T_{\text{wanted}}$):
- Jos $T_{\text{offer}} < \text{now()}$ tai $T_{\text{wanted}} < \text{now()}$ $\implies S_{\text{time}} = 0.0$.
- **Puuttuvat aikarajat (Avoin aikaraja):**
  - Jos kummallakaan ei ole deadlinea (joustava tarve) $\implies S_{\text{time}} = 1.0$.
  - Jos toisella on deadline ja toisella avoin $\implies S_{\text{time}} = 0.70$.
- **Määritelty aikaikkuna:** $\Delta T = \min(T_{\text{offer}}, T_{\text{wanted}}) - \text{now()}$ tunteina:
  - Jos $\Delta T \ge 72\text{ h}$ (3 vrk) $\implies S_{\text{time}} = 1.0$ (runsaasti aikaa sopia nouto).
  - Jos $24\text{ h} \le \Delta T < 72\text{ h}$ $\implies$ **Lineaarinen interpolaatio:**
    $$S_{\text{time}} = 0.40 + 0.60 \cdot \left(\frac{\Delta T - 24}{48}\right)$$
    *(Esimerkki: $\Delta T = 48\text{ h}$ $\implies S_{\text{time}} = 0.40 + 0.60 \cdot (24/48) = 0.70$ ilman epäjatkuvuushyppyjä).*
  - Jos $\Delta T < 24\text{ h}$ $\implies S_{\text{time}} = 0.40$ (kiire, vaatii välitöntä toimintaa).

### 4.3. Noutotapa ja mikrovarastobonus ($S_{\text{pickup}}$)
- **Suora nouto toimii:** Molemmat `DIRECT_ONLY` tai molemmat `EITHER` $\implies S_{\text{pickup}} = 1.0$.
- **Mikrovarastobonus:** Edellyttää kahta yhtäaikaista ehtoa:
  1. Molemmat osapuolet sallivat varaston: `preferred_pickup IN ('STORAGE_OK', 'EITHER')`.
  2. **Alueella on todellinen todennettu mikrovarasto/noutopiste:**
     Löytyy `storage_locations`/`places`-piste, jonka etäisyys kummastakin osapuolesta on kohtuullinen ($d_{\text{offer}\to\text{hub}} \le 15\text{ km}$ ja $d_{\text{wanted}\to\text{hub}} \le 15\text{ km}$).
     $\implies S_{\text{pickup}} = 1.0$ ja kyseinen `storage_location_id` asetetaan ehdokkaaksi match-riville!
  - *Huom:* Jos molemmat sallivat mikrovaraston, mutta lähistöllä ei fyysisesti sijaitse yhtäkään noutopistettä, bonusta ei myönnetä, vaan laskenta palautuu etäisyyden mukaiseen suoranoutoon.
- **Ristiriitainen noutotapa:** Toinen `DIRECT_ONLY` ja toinen `STORAGE_OK`:
  - Lyhyellä etäisyydellä ($< 5\text{ km}$) suoranouto on silti todennäköinen $\implies S_{\text{pickup}} = 0.70$.
  - Pitkällä etäisyydellä $\implies S_{\text{pickup}} = 0.30$.

---

## 5. Kokonaispiste ($S_{\text{total}}$) ja Kynnysarvot

$$S_{\text{total}} = 0.60 \cdot S_{\text{conf}} + 0.40 \cdot S_{\text{fulf}}$$

### Toimintarajat (Thresholds):

| Pistemäärä | Tila / Toimenpide |
|---|---|
| $S_{\text{conf}} < 0.40$ tai $S_{\text{fulf}} < 0.30$ | **Ei matchia:** Hylätään hiljaisesti, ei kuormiteta käyttäjiä huonoilla ehdotuksilla. |
| $S_{\text{total}} \ge 0.50$ | **`POTENTIAL`:** Tallennetaan `circular_matches`-tauluun. Näkyy sovelluksen "Mahdolliset osumat" -listalla. |
| $S_{\text{total}} \ge 0.75$ | **`NOTIFIED`:** Erittäin vahva osuma $\implies$ Luodaan välitön rivi `circular_notifications_queue`-tauluun ja lähetetään FCM Push -ilmoitus molemmille osapuolille! |

---

## 6. Esimerkkitapaukset (Test Scenario Check)

### Tapaus A: Puutavaran osittainen match
- **Tarjoaja:** 200 metriä $48 \times 98\text{ mm}$ lankkua, kunto hyvä, deadline 7 pv, Lievestuore.
- **Hakija:** 150 metriä runkopuuta ($50 \times 100\text{ mm}$), kunto tyydyttävä+, Laukaa kirkonkylä (etäisyys 18 km, molempien säde 25 km).
- **Laskenta:**
  - $S_{\text{text}} = 0.90$ (puutavara / runkopuu tunnistettu samaksi luokaksi)
  - $S_{\text{dim}} = 1.0$ ($48\times98$ vs $50\times100$ toleranssin sisällä)
  - $S_{\text{qty}} = 1.0$ ($200\text{ m} \ge 150\text{ m}$)
  - $S_{\text{cond}} = 1.0$ (`GOOD` $\ge$ `FAIR`)
  - $\implies S_{\text{conf}} = 0.35(0.90) + 0.30(1.0) + 0.20(1.0) + 0.15(1.0) = \mathbf{0.965}$
  - $S_{\text{dist}} = \max(0.0, \min(1.0, 1.0 - (18 / 25))) = 0.28$
  - $S_{\text{time}} = 1.0$ (7 vrk $> 72\text{ h}$)
  - $S_{\text{pickup}} = 1.0$ (molemmat sallivat suoran noudon)
  - $\implies S_{\text{fulf}} = 0.45(0.28) + 0.35(1.0) + 0.20(1.0) = \mathbf{0.676}$
  - **Tulos:** $S_{\text{total}} = 0.60(0.965) + 0.40(0.676) = \mathbf{0.85}$ $\implies$ **Vahva Match $\rightarrow$ NOTIFIED!**

### Tapaus B: Täydellinen tuote, mutta toisella puolella Suomea
- **Tarjoaja:** 50 kpl EUR-lavoja, ilmainen, Oulu.
- **Hakija:** 20 kpl EUR-lavoja, Laukaa (etäisyys 320 km, säde 30 km).
- **Laskenta:**
  - $S_{\text{conf}} = 1.0$ (täydellinen tuoteosuma)
  - Gating: Etäisyys $320\text{ km} > 30\text{ km} \times 1.5$ ilman valtakunnallista rahtia $\implies$ **Hard Gating hylkää.**
  - **Tulos:** Ei matchia. Käyttäjää ei häiritä toteutuskelvottomalla osumalla.
