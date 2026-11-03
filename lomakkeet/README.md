# LaukaaInfo – Lomakemoottori

Yksi deployment palvelee kaikkia lomakkeita URL-parametrin avulla.

## Käynnistys
```bash
npm install
cp .env.example .env
# Lisää .env-tiedostoon Mixonet Supabase anon-avain
npm run dev
```

## Lomakkeiden valinta URL-parametrilla
- **Lievestuoreen yrittäjät ry:n pikkujoulut**: http://localhost:3000/?form=form_lievestuore_palaute

## Uuden lomakkeen lisääminen
1. Luo lomake Form Builder Studiossa
2. Vie **Multi-form ZIP** (lisää nykyisen päälle) tai kopioi uusi `<slug>.json` tiedosto kansioon `src/schemas/`
3. Päivitä `src/schemas/index.json` rekisteri
4. Ei tarvitse muuttaa muuta koodia!

## Tuotantoympäristö
```bash
npm run build
# dist/ kansio on valmis upload/hosting -palveluun (Netlify, Vercel, jne.)
```
