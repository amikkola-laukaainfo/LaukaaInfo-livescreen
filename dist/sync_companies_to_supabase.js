#!/usr/bin/env node
/**
 * sync_companies_to_supabase.js
 * 
 * Synkronoi live_companies.json → Supabase companies-taulu
 * 
 * Käyttö projektin juur kansiossa:
 *   node sync_companies_to_supabase.js --dry-run
 *   node sync_companies_to_supabase.js
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ─── Konfiguraatio ────────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://duxluwyqxvbmkkjzuzkz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_HgfWyipuSO7gvsVUR1smNQ_aXox2OPu';
const DRY_RUN = process.argv.includes('--dry-run');

const JSON_FILES = [
    path.join(__dirname, 'live_companies.json'),
    path.join(__dirname, 'temp_companies.json'),
];

// ─── Apufunktiot ──────────────────────────────────────────────────────────────

function loadJson(filePath) {
    if (!fs.existsSync(filePath)) return { results: [] };
    try {
        const raw = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw);
    } catch (e) {
        console.warn(`⚠️  Virhe ladattaessa ${path.basename(filePath)}:`, e.message);
        return { results: [] };
    }
}

function hashCompany(c) {
    const relevant = {
        id: c.id,
        nimi: c.nimi || c.name,
        osoite: c.osoite,
        puhelin: c.puhelin,
        email: c.email,
        nettisivu: c.nettisivu,
        lat: c.lat,
        lon: c.lon || c.lng,
        kategoria: c.kategoria,
        alue_slug: c.alue_slug,
    };
    return crypto.createHash('sha256').update(JSON.stringify(relevant)).digest('hex').slice(0, 16);
}

function mapToRow(c) {
    return {
        id: String(c.id),
        name: c.name || c.nimi,
        nimi: c.nimi || c.name,
        status: 'active',
        osoite: c.osoite || null,
        puhelin: c.puhelin || null,
        email: c.email || null,
        nettisivu: c.nettisivu || null,
        lat: c.lat ? parseFloat(c.lat) : null,
        lon: (c.lon || c.lng) ? parseFloat(c.lon || c.lng) : null,
        kategoria: c.kategoria || null,
        alue_slug: c.alue_slug || null,
        source_id: String(c.id),
        source_hash: hashCompany(c),
        source_updated_at: new Date().toISOString(),
        last_synced_at: new Date().toISOString(),
    };
}

async function fetchExistingHashes() {
    const url = `${SUPABASE_URL}/rest/v1/companies?select=id,source_hash&limit=10000`;
    const res = await fetch(url, {
        headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
        }
    });
    if (!res.ok) throw new Error(`Haku epäonnistui: ${res.status} ${await res.text()}`);
    const data = await res.json();
    const map = {};
    data.forEach(row => { map[row.id] = row.source_hash; });
    return map;
}

async function upsertBatch(rows) {
    if (DRY_RUN) {
        console.log(`  [dry-run] Lähettäisi ${rows.length} riviä`);
        return;
    }
    const url = `${SUPABASE_URL}/rest/v1/companies`;
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify(rows),
    });
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`UPSERT epäonnistui (${res.status}): ${errText}`);
    }
}

// ─── Päälogiikka ──────────────────────────────────────────────────────────────

async function main() {
    console.log(`\n🔄 LaukaaInfo Companies Sync ${DRY_RUN ? '(DRY RUN)' : ''}`);
    console.log('─'.repeat(50));

    const seen = new Set();
    const allCompanies = [];
    for (const file of JSON_FILES) {
        const data = loadJson(file);
        (data.results || []).forEach(c => {
            if (c.id && !seen.has(String(c.id))) {
                seen.add(String(c.id));
                allCompanies.push(c);
            }
        });
    }
    console.log(`📂 Ladattu yhteensä ${allCompanies.length} yritystä JSON-tiedostoista`);

    let existingHashes = {};
    try {
        existingHashes = await fetchExistingHashes();
        console.log(`🗄️  Kannassa jo ${Object.keys(existingHashes).length} yritystä`);
    } catch (e) {
        console.log(`ℹ️  Kanta tyhjä tai taulu ei vielä olemassa: ${e.message}`);
    }

    const toUpsert = [];
    let unchanged = 0;

    for (const c of allCompanies) {
        const row = mapToRow(c);
        const existingHash = existingHashes[row.id];
        if (existingHash === row.source_hash) {
            unchanged++;
        } else {
            toUpsert.push(row);
        }
    }

    const isNew = toUpsert.filter(r => !existingHashes[r.id]).length;
    const isUpdated = toUpsert.length - isNew;

    console.log(`\n📊 Yhteenveto:`);
    console.log(`   ✅ Muuttumattomia: ${unchanged}`);
    console.log(`   🆕 Uusia:          ${isNew}`);
    console.log(`   ✏️  Päivitettyjä:   ${isUpdated}`);
    console.log(`   📤 Yhteensä lähetettäviä: ${toUpsert.length}`);

    if (toUpsert.length === 0) {
        console.log('\n✨ Kaikki ajan tasalla – ei muutoksia.\n');
        return;
    }

    const BATCH_SIZE = 200;
    for (let i = 0; i < toUpsert.length; i += BATCH_SIZE) {
        const batch = toUpsert.slice(i, i + BATCH_SIZE);
        process.stdout.write(`  Lähetetään erä ${Math.floor(i/BATCH_SIZE)+1}/${Math.ceil(toUpsert.length/BATCH_SIZE)}...`);
        await upsertBatch(batch);
        console.log(' ✓');
    }

    console.log(`\n✅ Synkronointi valmis! ${toUpsert.length} yritystä päivitetty.\n`);
}

main().catch(e => {
    console.error('\n❌ Synkronointi epäonnistui:', e.message);
    process.exit(1);
});
