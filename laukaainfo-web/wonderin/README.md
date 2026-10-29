# Wonderin Muistokartta-editori

Sijainti palvelimella: **mediazoo.fi/laukaainfo-web/wonderin/**

## Tiedostorakenne

```
wonderin/
├── config.php                     ← Supabase-konfiguraatio & apufunktiot
├── index.php                      ← Kirjautuminen (magic link + katselukoodi)
├── editor.php                     ← Päämuokkausnäkymä (vaatii kirjautumisen)
├── viewer.php                     ← Katselunäkymä (share_token / PIN)
├── redeem.php                     ← Aktivointikoodin lunastus
├── wonderin_memory_migration.sql  ← Supabase SQL-migraatio
├── .htaccess                      ← Apache-suojaussäännöt
├── assets/
│   └── style.css                  ← Kaikki tyylimäärittelyt
└── api/
    ├── auth.php                   ← Session-hallinta (magic link callback, logout)
    ├── maps.php                   ← Muistokarttojen CRUD (+ PIN-hallinta)
    ├── places.php                 ← Paikkojen CRUD (experience_points)
    ├── memories.php               ← Muistojen CRUD
    ├── export.php                 ← CSV-vienti (schema_version 1.0, UTF-8 BOM)
    └── import.php                 ← CSV-tuonti (ID-remapping, new/merge)
```

## Käyttöönotto

### 1. Supabase SQL-migraatio

Aja `wonderin_memory_migration.sql` Supabasen SQL Editor -näkymässä. Migraatio:
- Luo `activation_codes`-taulu (operaattori luo koodit)
- Lisää elinkaarikenttä `routes`-tauluun (`owner_id`, `share_token`, `view_pin_hash`, `edit_expires_at`, `view_expires_at`, `archive_until`)
- Luo `memories`-taulu (paikoille sidotut muistot)
- Asettaa RLS-säännöt

### 2. Tietoturva (Zero Service Key -arkkitehtuuri)

Palvelimelle **EI tarvitse eikä saa asettaa `service_role`-avainta**.
`config.php` käyttää ainoastaan julkista `SUPABASE_ANON_KEY`-avainta.
Kaikki koodien tarkistukset ja lunastukset suoritetaan suoraan Supabasen tietokantafunktion (`SECURITY DEFINER`) kautta, mikä takaa täyden tietoturvan.

### 3. Tiedostojen siirto palvelimelle

Siirrä `wonderin/`-kansio FTP:llä tai SSH:lla palvelimelle:
```
/var/www/mediazoo.fi/laukaainfo-web/wonderin/
```

### 4. Aktivointikoodien luonti (operaattori)

Aja SQL-lauseke Supabasessa:
```sql
INSERT INTO public.activation_codes (code_hash, product_sku, edit_duration_days, view_duration_days, archive_duration_days, notes)
VALUES (
    encode(sha256('DIGI-XXXXXX'), 'hex'),
    'DIGI-3M', 90, 365, 365,
    'Asiakas Virtanen 2026'
);
```

## Käyttäjäpolut

### Omistaja (asiakas)
1. Ostaa Mediazoon digitointipalvelun → saa aktivointikoodin
2. Avaa `mediazoo.fi/laukaainfo-web/wonderin/redeem.php`
3. Syöttää koodin → kirjautuu magic linkillä sähköpostiin
4. Muokkaa muistokarttaa editorissa (3 kk)
5. Vie kartan CSV-tiedostoksi (`Vie muistokartta`)
6. Jakaa 6-merkkisen katselukoodin perheelle

### Katselija (perheenjäsen)
1. Saa omistajalta koodin (esim. `MUMMO7`) tai linkin
2. Avaa `mediazoo.fi/laukaainfo-web/wonderin/` → syöttää koodin
3. Selaa muistokarttaa kartalla ja aikajananäkymässä (12 kk)
4. Ei vaadi rekisteröitymistä

### Palautus (round-trip CSV)
1. Asiakas vie kartan CSV-tiedostoksi
2. Arkistointiajan päätyttyä palvelin poistaa aineiston
3. Asiakas ostaa uuden muokkausjakson
4. Avaa `editor.php` → `Palauta CSV-tiedostosta`
5. Editori luo uudet UUID:t (ID-remapping), sisältö säilyy

## Tilakone

| Tila | Muokkaus | Katselu | Vienti |
|------|----------|---------|--------|
| EDITABLE | ✅ | ✅ | ✅ |
| VIEW_ONLY | ❌ | ✅ | ✅ |
| ARCHIVED | ❌ | ❌ | ✅ |
| PENDING_DELETION | ❌ | ❌ | ✅ |
| PURGED | ❌ | ❌ | ❌ |
