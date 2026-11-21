import React, { useState, useEffect } from 'react';
import {
  MapPin, Search, Copy, CheckCircle, Sparkles, Loader2,
  X, Plus, ChevronRight, ChevronLeft, Zap, Map, Tag, Route,
  Save, RefreshCw, ToggleLeft, ToggleRight, Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';

// ─── Tyypit ──────────────────────────────────────────────────────────────────

type BulkModel = 'landmark' | 'area' | 'theme' | 'route';

interface Place {
  id: string;
  place_id: string;
  name: string;
  canonical_name: string;
  type: string;
  municipality: string;
  lat?: number;
  lon?: number;
  description?: string;
}

interface BulkPlace {
  place_id: string;
  name: string;
  type: string;
  included: boolean;
  lat?: number;
  lon?: number;
  description?: string;
}

interface ParsedBulkPlace {
  place_id: string;
  name: string;
  description?: string;
  activities?: string[];
  themes?: string[];
  history_note?: string;
  faq?: { q: string; a: string }[];
  tags?: string[];
  lat?: number;
  lon?: number;
  type?: string;
  lenses?: {
    past?: string;
    present?: string;
    future?: string;
  };
  lens_themes?: {
    past?: string[];
    present?: string[];
    future?: string[];
  };
  accepted: boolean;
}

interface ParsedConnection {
  from_place_id: string;
  to_place_id: string;
  reason: string;
  type: string;
  accepted: boolean;
}

interface ParsedResult {
  places: ParsedBulkPlace[];
  connections: ParsedConnection[];
}

// ─── Apufunktio: canonical name ──────────────────────────────────────────────

function toCanonicalName(name: string, municipality: string): string {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[äå]/g, 'a')
      .replace(/[ö]/g, 'o')
      .replace(/[üú]/g, 'u')
      .replace(/[éè]/g, 'e')
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '_');
  return `${normalize(name)}_${normalize(municipality)}`;
}

interface ThemeOption {
  value: string;
  label: string;
  keywords: string[];
}

const THEME_OPTIONS: ThemeOption[] = [
  { value: 'uimarannat', label: '🏊 Uimarannat & uimapaikat', keywords: ['uimaranta', 'ranta', 'uimapaikka', 'poukama'] },
  { value: 'laavut', label: '🔥 Laavut ja tulipaikat', keywords: ['laavu', 'tulipaikka', 'kota', 'nuotio'] },
  { value: 'luontopolut', label: '🌿 Luontopolut & retkeilyreitit', keywords: ['luontopolku', 'retkeily', 'patikointi', 'reitti', 'polku'] },
  { value: 'rakennukset', label: '🏛️ Tunnetut rakennukset & arkkitehtuuri', keywords: ['rakennus', 'kartano', 'asema', 'linna', 'hovi', 'talo', 'arkkitehtuuri'] },
  { value: 'markkinapaikat', label: '🎪 Markkinapaikat, torit & kauppapaikat', keywords: ['markkina', 'tori', 'kauppatori', 'kesätori', 'satamatori', 'kauppapaikka'] },
  { value: 'kylatalot', label: '🏡 Kylätalot & seurantalot', keywords: ['kylätalo', 'seurantalo', 'nuorisoseura', 'työväentalo', 'pirtti', 'kylätupa'] },
  { value: 'koulut', label: '🏫 Koulut, opistot & kyläkoulut', keywords: ['koulu', 'kyläkoulu', 'opisto', 'lukio', 'kampus', 'toimipiste'] },
  { value: 'museot', label: '📜 Museot & kotiseutukohteet', keywords: ['museo', 'kotiseutu', 'historia', 'näyttely', 'perinnetalo'] },
  { value: 'kirkot', label: '⛪ Kirkot, kappelit & hautausmaat', keywords: ['kirkko', 'kappeli', 'hautausmaa', 'kirkonmäki'] },
  { value: 'kulttuuriperinto', label: '🗿 Kulttuuriperintö & muinaisjäännökset', keywords: ['kalliomaalaus', 'saraakallio', 'muinaisjäännös', 'kalmisto', 'linnavuori', 'perintö'] },
  { value: 'nakopaikan', label: '🔭 Näköalapaikat & luonnonnähtävyydet', keywords: ['näköala', 'näkötorni', 'vuori', 'harju', 'kallio', 'koski'] },
  { value: 'veneily', label: '⛵ Veneily, satamat & kanavat', keywords: ['satama', 'venesatama', 'kanava', 'sulku', 'melonta', 'laituri', 'vene'] },
  { value: 'urheilukentat', label: '⚽ Urheilu- ja liikuntapuistot', keywords: ['urheilukenttä', 'kenttä', 'frisbeegolf', 'kuntorata', 'liikuntapuisto', 'areena'] },
  { value: 'leikkipuistot', label: '🛝 Leikkipuistot & perhekohteet', keywords: ['leikkipuisto', 'puisto', 'perhepuisto', 'toimintapuisto'] },
  { value: 'lahiruoka_kasityo', label: '🥖 Lähiruoka, tilamyymälät & pajat', keywords: ['tilamyymälä', 'lähiruoka', 'tila', 'leipomo', 'käsityö', 'paja', 'puoti'] },
  { value: 'saunat_hyvinvointi', label: '🧖 Saunat, kylpylät & hyvinvointi', keywords: ['sauna', 'kylpylä', 'peurunka', 'avantouinti', 'hyvinvointi'] },
  { value: 'teollisuushistoria', label: '⚙️ Teollisuushistoria & ruukkialueet', keywords: ['ruukki', 'tehdas', 'saha', 'voimala', 'meijeri', 'mylly', 'teollisuus'] },
  { value: 'majoitus_leirinta', label: '🏕️ Majoitus, leirintä & majatalot', keywords: ['leirintä', 'hotelli', 'mökki', 'majatalo', 'leirikeskus', 'lomakylä'] },
  { value: 'palvelut', label: '🏪 Palvelukeskittymät & kyläkeskukset', keywords: ['palvelut', 'keskus', 'kyläkeskus', 'liikekeskus'] },
  { value: 'tapahtumapaikat', label: '🎭 Tapahtuma-areenat & lavat', keywords: ['tapahtumapaikka', 'tanssilava', 'kesäteatteri', 'lava', 'areena'] },
];

const MODEL_OPTIONS: { id: BulkModel; label: string; icon: React.ReactNode; desc: string }[] = [
  {
    id: 'landmark',
    label: 'Kiintopiste + säde',
    icon: <MapPin className="w-5 h-5" />,
    desc: 'Hae paikat tietyn pisteen ympäriltä tietyllä säteellä',
  },
  {
    id: 'area',
    label: 'Alue kerralla',
    icon: <Map className="w-5 h-5" />,
    desc: 'Rikasta kaikki tietyn alueen paikat yhdellä kertaa',
  },
  {
    id: 'theme',
    label: 'Teema',
    icon: <Tag className="w-5 h-5" />,
    desc: 'Kerää tietyn teeman paikat (esim. kaikki uimarannat)',
  },
  {
    id: 'route',
    label: 'Reitti',
    icon: <Route className="w-5 h-5" />,
    desc: 'Valitse reittipisteet järjestyksessä',
  },
];

const RADIUS_OPTIONS = [1000, 2000, 5000, 10000];

// ─── Haversine-etäisyys ──────────────────────────────────────────────────────

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const AREA_PRESETS = [
  'Laukaa (koko kunta)',
  'Laukaan kirkonkylä',
  'Lievestuore',
  'Vihtavuori',
  'Leppävesi',
  'Äijälä & Lankamaa',
  'Vehniä',
  'Kuusa & Valkola',
  'Savio & Vuontee',
  'Haapavala & Tarvaala',
  'Hankasalmi',
  'Konnevesi',
  'Uurainen',
  'Äänekoski',
  'Jyväskylän seutu',
  'Muu oma aluerajaus...'
];

export const PRESET_LANDMARKS: Place[] = [
  { id: 'peurunka', place_id: 'peurunka', name: 'Peurunka', canonical_name: 'peurunka_laukaa', type: 'LANDMARK', municipality: 'Laukaa', lat: 62.4385, lon: 25.8978, description: 'Kylpylä- ja luontokohde Peurunkajärven rannalla.' },
  { id: 'laukaan_kirkonkyla', place_id: 'laukaan_kirkonkyla', name: 'Laukaan kirkonkylä', canonical_name: 'laukaan_kirkonkyla_laukaa', type: 'DISTRICT', municipality: 'Laukaa', lat: 62.4137, lon: 25.9525, description: 'Laukaan hallinnollinen ja kaupallinen keskus.' },
  { id: 'lievestuore', place_id: 'lievestuore', name: 'Lievestuore', canonical_name: 'lievestuore_laukaa', type: 'DISTRICT', municipality: 'Laukaa', lat: 62.2612, lon: 26.2038, description: 'Lievestuoreen taajama ja teollisuusperinne.' },
  { id: 'vihtavuori', place_id: 'vihtavuori', name: 'Vihtavuori', canonical_name: 'vihtavuori_laukaa', type: 'DISTRICT', municipality: 'Laukaa', lat: 62.3789, lon: 25.9012, description: 'Vihtavuoren kyläyhteisö ja ruutitehtaan seutu.' },
  { id: 'kuusa', place_id: 'kuusa', name: 'Kuusa & Kuusankoski', canonical_name: 'kuusa_laukaa', type: 'DISTRICT', municipality: 'Laukaa', lat: 62.4690, lon: 25.9860, description: 'Kuusan kanava, koski ja kylämiljöö.' },
  { id: 'leppavesi', place_id: 'leppavesi', name: 'Leppävesi', canonical_name: 'leppavesi_laukaa', type: 'DISTRICT', municipality: 'Laukaa', lat: 62.3168, lon: 25.8856, description: 'Leppäveden taajama ja Tiituspohja.' }
];

// ─── Pääkomponentti ──────────────────────────────────────────────────────────

export const PlaceBulkTab: React.FC = () => {
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [model, setModel] = useState<BulkModel>('landmark');
  const [actionType, setActionType] = useState<'enrich' | 'find_new' | 'retheme'>('enrich');

  // Parametrit
  const [targetArea, setTargetArea] = useState('Laukaa (koko kunta)');
  const [customArea, setCustomArea] = useState('');
  const [centerSearch, setCenterSearch] = useState('Peurunka');
  const [centerResults, setCenterResults] = useState<Place[]>([]);
  const [centerPlace, setCenterPlace] = useState<Place | null>(PRESET_LANDMARKS[0]);
  const [radius, setRadius] = useState(5000);
  const [maxPlaces, setMaxPlaces] = useState(15);
  const [areaSearch, setAreaSearch] = useState('');
  const [areaResults, setAreaResults] = useState<Place[]>([]);
  const [areaPlace, setAreaPlace] = useState<Place | null>(null);
  const [selectedTheme, setSelectedTheme] = useState(THEME_OPTIONS[0].value);
  const [routePlaces, setRoutePlaces] = useState<Place[]>([]);
  const [routeSearch, setRouteSearch] = useState('');
  const [routeResults, setRouteResults] = useState<Place[]>([]);

  // Paikkalista
  const [bulkPlaces, setBulkPlaces] = useState<BulkPlace[]>([]);
  const [loadingPlaces, setLoadingPlaces] = useState(false);

  // Prompti
  const [promptText, setPromptText] = useState('');
  const [copied, setCopied] = useState(false);

  // Vastaus ja tallennus
  const [jsonResponse, setJsonResponse] = useState('');
  const [parsedResult, setParsedResult] = useState<ParsedResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState<number | null>(null);

  // Hakuhälytykset
  const [searchLoading, setSearchLoading] = useState(false);

  // ── Paikka-haut ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (centerSearch.length < 2) { setCenterResults([]); return; }
    const t = setTimeout(async () => {
      setSearchLoading(true);
      const { data } = await supabase
        .from('places')
        .select('place_id, name, canonical_name, type, municipality, lat, lon, description')
        .ilike('name', `%${centerSearch}%`)
        .limit(8);
      setCenterResults(data || []);
      setSearchLoading(false);
    }, 300);
    return () => clearTimeout(t);
  }, [centerSearch]);

  useEffect(() => {
    if (areaSearch.length < 2) { setAreaResults([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('places')
        .select('place_id, name, canonical_name, type, municipality, lat, lon')
        .in('type', ['AREA', 'DISTRICT', 'MUNICIPALITY'])
        .ilike('name', `%${areaSearch}%`)
        .limit(8);
      setAreaResults(data || []);
    }, 300);
    return () => clearTimeout(t);
  }, [areaSearch]);

  useEffect(() => {
    if (routeSearch.length < 2) { setRouteResults([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('places')
        .select('place_id, name, canonical_name, type, municipality, lat, lon')
        .ilike('name', `%${routeSearch}%`)
        .limit(8);
      setRouteResults(data || []);
    }, 300);
    return () => clearTimeout(t);
  }, [routeSearch]);

  // ── Paikkojen haku parametrien perusteella ─────────────────────────────────

  const fetchBulkPlaces = async () => {
    setLoadingPlaces(true);
    setBulkPlaces([]);

    try {
      if (model === 'landmark') {
        const center = centerPlace || PRESET_LANDMARKS.find(p => p.name.toLowerCase().includes(centerSearch.toLowerCase())) || PRESET_LANDMARKS[0];
        
        if (!center?.lat || !center?.lon) {
          alert('Valitulla kiintopisteellä ei ole koordinaatteja. Valitse toinen paikka tai käytä pikanappeja.');
          setLoadingPlaces(false);
          return;
        }
        
        // Hae paikat joilla on koordinaatit
        const { data, error } = await supabase
          .from('places')
          .select('place_id, name, type, municipality, lat, lon, description')
          .not('lat', 'is', null)
          .not('lon', 'is', null)
          .neq('status', 'deleted')
          .limit(300);

        if (error) {
          console.warn('Virhe koordinaattipohjaisessa haussa:', error);
        }
        
        const placesList = data || [];
        const radiusKm = radius / 1000;
        const filtered = placesList
          .filter(p => {
            if (!p.lat || !p.lon) return false;
            if (p.place_id === center.place_id) return false;
            return haversineKm(center.lat!, center.lon!, p.lat, p.lon) <= radiusKm;
          })
          .slice(0, maxPlaces)
          .map(p => ({ ...p, included: true }));

        // Lisää kiintopiste listaan ensimmäisenä jos se on oikea kohde
        setBulkPlaces([
          { ...center, included: true },
          ...filtered,
        ]);

      } else if (model === 'area') {
        const activeArea = targetArea === 'Muu oma aluerajaus...' ? (customArea || 'Laukaa') : targetArea;
        const cleanAreaKeyword = activeArea.split(' ')[0].replace(/[^a-z0-9äöå]/gi, '');

        let query = supabase
          .from('places')
          .select('place_id, name, type, municipality, lat, lon, description')
          .neq('status', 'deleted');

        if (areaPlace?.municipality) {
          query = query.eq('municipality', areaPlace.municipality);
        } else if (activeArea !== 'Laukaa (koko kunta)' && cleanAreaKeyword.length >= 3) {
          query = query.or(`name.ilike.%${cleanAreaKeyword}%,description.ilike.%${cleanAreaKeyword}%,municipality.ilike.%${cleanAreaKeyword}%`);
        } else {
          query = query.eq('municipality', 'Laukaa');
        }

        const { data, error } = await query.limit(maxPlaces);

        if (error || !data || data.length === 0) {
          // Fallback: haetaan Laukaan paikkoja
          const { data: fallbackData } = await supabase
            .from('places')
            .select('place_id, name, type, municipality, lat, lon, description')
            .neq('status', 'deleted')
            .limit(maxPlaces);
          setBulkPlaces((fallbackData || []).map(p => ({ ...p, included: true })));
        } else {
          setBulkPlaces(data.map(p => ({ ...p, included: true })));
        }

      } else if (model === 'theme') {
        const themeObj = THEME_OPTIONS.find(t => t.value === selectedTheme);
        const keywords = themeObj?.keywords || [selectedTheme];
        const activeArea = targetArea === 'Muu oma aluerajaus...' ? (customArea || 'Laukaa') : targetArea;
        const cleanAreaKeyword = activeArea.split(' ')[0].replace(/[^a-z0-9äöå]/gi, '');

        // Haetaan ensin theme_places -taulusta
        const themeTagId = selectedTheme.toLowerCase().replace(/[^a-z0-9äöå]/g, '');
        const { data: tpData } = await supabase
          .from('theme_places')
          .select('place_id')
          .ilike('tag_id', `%${themeTagId}%`)
          .limit(maxPlaces * 2);

        const matchedPlaceIds = Array.from(new Set((tpData || []).map(r => r.place_id))).filter(Boolean);

        let query = supabase
          .from('places')
          .select('place_id, name, type, municipality, lat, lon, description')
          .neq('status', 'deleted');

        if (matchedPlaceIds.length > 0) {
          query = query.in('place_id', matchedPlaceIds.slice(0, 50));
        } else {
          // Avainsanahaku nimestä ja kuvauksesta
          const kw = keywords[0] || 'luonto';
          query = query.or(`name.ilike.%${kw}%,description.ilike.%${kw}%`);
        }

        const { data, error } = await query.limit(maxPlaces);

        if (error || !data || data.length === 0) {
          const { data: fallbackData } = await supabase
            .from('places')
            .select('place_id, name, type, municipality, lat, lon, description')
            .neq('status', 'deleted')
            .limit(maxPlaces);
          setBulkPlaces((fallbackData || []).map(p => ({ ...p, included: true })));
        } else {
          setBulkPlaces(data.map(p => ({ ...p, included: true })));
        }

      } else if (model === 'route') {
        if (routePlaces.length > 0) {
          setBulkPlaces(routePlaces.map(p => ({ ...p, included: true })));
        } else {
          // Jos reittipisteitä ei ollut lisätty, otetaan suositut reittipisteet
          setBulkPlaces(PRESET_LANDMARKS.slice(0, 3).map(p => ({ ...p, included: true })));
        }
      }
    } catch (err: any) {
      console.error('Virhe paikkojen haussa:', err);
      // Ei estä etenemistä tyhjällä listalla
      setBulkPlaces([]);
    }

    setLoadingPlaces(false);
    setStep(3);
  };

  // ── Promptin generointi ───────────────────────────────────────────────────

  const generatePrompt = () => {
    const included = bulkPlaces.filter(p => p.included);
    const placesJson = JSON.stringify(
      included.map(p => ({
        place_id: p.place_id,
        name: p.name,
        type: p.type,
        municipality: p.municipality || undefined,
        description: p.description || undefined
      })),
      null,
      2
    );

    const activeArea = targetArea === 'Muu oma aluerajaus...' ? (customArea || 'Laukaan seutu') : targetArea;
    const themeLabel = THEME_OPTIONS.find(t => t.value === selectedTheme)?.label || selectedTheme;

    let context = '';
    if (model === 'landmark' && centerPlace) {
      context = `Keskipiste: ${centerPlace.name} (${radius / 1000} km säde), Kohdealue: ${activeArea}`;
    } else if (model === 'area' && areaPlace) {
      context = `Alue: ${areaPlace.name} (${activeArea})`;
    } else if (model === 'theme') {
      context = `Teema: ${themeLabel}, Kohdealue: ${activeArea}`;
    } else if (model === 'route') {
      context = `Reitti: ${routePlaces.map(p => p.name).join(' → ')}, Kohdealue: ${activeArea}`;
    }

    let prompt = '';

    if (actionType === 'retheme') {
      prompt = `Olet LaukaaInfon ja Keski-Suomen paikkaverkoston ontologia- ja teema-asiantuntija.
Konteksti: ${context}
Paikkaverkosto sijaitsee Laukaan kunnassa ja lähialueilla Keski-Suomessa.

==================================================
ONTOLOGINEN PERIAATE JA TEHTÄVÄ
==================================================

1. PAIKKA on kiinteä ontologinen ankkuri (MISSÄ). Paikka vastaa kysymykseen: missä ja minkä yhteydessä?
2. TEEMA on tulkinnallinen linssi (MISTÄ NÄKÖKULMASTA). Paikka ei "ole" yhtä kuin teema, vaan sitä katsotaan tietyn näkökulman läpi.
3. Jokaisella paikalla tulisi olla tulkintalinssit kolmessa aikahorisontissa:
   - MENNEISYYS & MUISTI: Geologia, asutus, kulttuuriperintö, kaskitalous, teollistuminen, tarinat ja myytit.
   - NYKYISYYS & KOKEMUS: Aistillisuus (hiljaisuus, valo, tuoksut), aktiviteetit, palvelut, luontokokemus, perheet.
   - TULEVAISUUS & POTENTIAALI: Kiertotalous, kestävä matkailu, yhteisön visiot, kehityssuunnat ja mahdollisuudet.

Tehtäväsi on kootusti muokata, karsia ja standardoida näiden paikkojen teemat uuden linssimallin mukaiseksi.
Karsi epäolennaiset, päällekkäiset tai liian kapeat irralliset leimat ja korvaa ne yhtenäisillä vakioteemoilla.
Käytä ensisijaisesti järjestelmän vakioteemoja:
LUONTO, RETKEILY, HISTORIA, KULTTUURI, HYVINVOINTI, LIIKUNTA, MATKAILU, VESISTÖT, TAPAHTUMAT, KIERTOTALOUS, PERHEET, PALVELUT.

Paikat (${included.length} kpl):
${placesJson}

Palauta VAIN yksi validi JSON-objekti seuraavassa muodossa (ei muuta tekstiä):

{
  "places": [
    {
      "place_id": "<sama kuin yllä>",
      "description": "<2-4 lausetta paikan olemuksesta ja merkityksestä. Laita loppuun (AI)>",
      "themes": ["LUONTO", "HISTORIA", "KIERTOTALOUS"],
      "lenses": {
        "past": "Menneisyys: 1-2 lausetta historiasta, synnystä tai geologiasta.",
        "present": "Nykyisyys: 1-2 lausetta aistillisesta kokemuksesta ja toiminnoista tänään.",
        "future": "Tulevaisuus: 1-2 lausetta kiertotaloudesta, kestävyydestä tai tulevaisuuden potentiaalista."
      },
      "lens_themes": {
        "past": ["HISTORIA"],
        "present": ["LUONTO", "RETKEILY"],
        "future": ["KIERTOTALOUS"]
      },
      "activities": ["<max 5 konkreettista aktiviteettia>"],
      "tags": ["<max 6 pientä asiasanaa>"]
    }
  ],
  "connections": [
    {
      "from_place_id": "<place_id>",
      "to_place_id": "<place_id>",
      "reason": "<miksi nämä paikat liittyvät toisiinsa yhteisen linssin kautta>",
      "type": "THEME | EXPERIENCE | ROUTE | NEAR"
    }
  ]
}

Ohjeet:
- Tuota jokaiselle paikalle 3 jäsenneltyä aikahorisonttia (past, present, future).
- Liitä kunkin linssin alle osuvat standardoidut teemat lens_themes-objektiin.
- Käytä VAIN annettuja place_id-arvoja, älä keksi uusia.`;
    } else if (actionType === 'enrich') {
      prompt = `Olet LaukaaInfon paikkaverkostoa rakentava tekoälyassistentti.
Konteksti: ${context}
Paikkaverkosto sijaitsee Laukaan kunnassa ja lähialueilla Keski-Suomessa.

Rikasta annetut paikat kuvauksin, tulkintalinssein (Menneisyys, Nykyisyys, Tulevaisuus) ja metatiedoin, ja tunnista paikkojen väliset yhteydet.

Paikat (${included.length} kpl):
${placesJson}

Palauta VAIN yksi JSON-objekti seuraavassa muodossa (ei muuta tekstiä):

{
  "places": [
    {
      "place_id": "<sama kuin yllä>",
      "description": "<2-4 lausetta paikan olemuksesta ja merkityksestä>",
      "lenses": {
        "past": "Menneisyys: 1-2 lausetta historiasta, geologiasta tai synnystä.",
        "present": "Nykyisyys: 1-2 lausetta aistillisesta luonnosta, tunnelmasta ja toiminnoista.",
        "future": "Tulevaisuus: 1-2 lausetta kiertotaloudesta tai tulevaisuuden mahdollisuuksista."
      },
      "lens_themes": {
        "past": ["HISTORIA"],
        "present": ["LUONTO", "RETKEILY"],
        "future": ["KIERTOTALOUS"]
      },
      "activities": ["<aktiviteetti 1>", "<aktiviteetti 2>"],
      "themes": ["LUONTO", "HISTORIA", "RETKEILY"],
      "history_note": "<1-2 lausetta historiasta tai null>",
      "faq": [
        { "q": "<kysymys>", "a": "<vastaus>" }
      ],
      "tags": ["<hakusana1>", "<hakusana2>"]
    }
  ],
  "connections": [
    {
      "from_place_id": "<place_id>",
      "to_place_id": "<place_id>",
      "reason": "<miksi nämä paikat liittyvät toisiinsa>",
      "type": "NEAR | ROUTE | THEME | EXPERIENCE"
    }
  ]
}

Ohjeet:
- description: 2-4 lausetta suomeksi, elävää ja informatiivista tekstiä. Laita selitteen perään välilyönti ja (AI) - esim. "...täällä on mukava ulkoilla. (AI)"
- lenses: kolme tulkintalinssiä (past = muisti/geologia, present = aistit/toiminta, future = mahdollisuudet/kiertotalous)
- activities: max 6 konkreettista aktiviteettia
- themes: max 5 vakioteemaa (LUONTO, RETKEILY, HISTORIA, KULTTUURI, RAKENNUKSET, MARKKINAT, KYLÄYHTEISÖT, HYVINVOINTI, LIIKUNTA, VESISTÖT, TAPAHTUMAT, KIERTOTALOUS, PERHEET, PALVELUT)
- history_note: lyhyt historiatieto tai null jos ei relevanttia
- faq: max 3 kysymys-vastaus-paria (yleisimmät kysymykset paikasta)
- tags: max 8 yksisanaista hakusanaa pienellä kirjoitettuna.
- connections: tunnista kaikki merkittävät yhteydet paikkojen välillä
- Käytä VAIN annettuja place_id-arvoja, älä keksi uusia`;
    } else {
      prompt = `Olet LaukaaInfon ja Keski-Suomen paikkaverkoston paikallistuntija ja tekoälyassistentti.

==================================================
KOHDEALUE JA KONTEKSTI
==================================================
Kohdealue: ${activeArea}
Teema / näkökulma: ${themeLabel}
Yleisalue: Laukaan kunta ja Keski-Suomen sydänseutu.

==================================================
TEHTÄVÄ
==================================================
Tehtävänäsi on etsiä ja ehdottaa n. 5-15 TÄYSIN UUTTA, olemassa olevaa aitoa fyysistä paikkaa, nähtävyyttä, kulttuurikohdetta, rakennusta tai yritystä NIMENOMAAN TÄLTÄ ALUEELTA: "${activeArea}".
Kohteiden tulee edustaa teemaa: "${themeLabel}".

Alla on lista paikoista, jotka ovat JO TIETOKANNASSA tältä seudulta. ÄLÄ EHDOTA NÄITÄ PAIKKOJA UUDELLEEN!

Jo olemassa olevat paikat:
${placesJson}

Palauta VAIN yksi validi JSON-objekti, joka sisältää uudet paikat tulkintalinsseineen. ÄLÄ sisällytä place_id-kenttää!
{
  "places": [
    {
      "name": "<Uuden paikan virallinen tai vakiintunut nimi>",
      "type": "<esim. BUILDING, NATURE, ATTRACTION, BUSINESS, LANDMARK, SERVICE>",
      "municipality": "<kunta, esim. Laukaa, Hankasalmi, Konnevesi, Jyväskylä>",
      "description": "<2-4 lausetta paikan olemuksesta, sijainnista kylässä ja merkityksestä. Laita loppuun (AI)>",
      "lat": <numero, esim 62.4150, tai null jos et tiedä tarkasti>,
      "lon": <numero, esim 25.9520, tai null jos et tiedä tarkasti>,
      "lenses": {
        "past": "Menneisyys: 1-2 lausetta historiasta, rakentamisesta tai kulttuuriperinnöstä.",
        "present": "Nykyisyys: 1-2 lausetta nykytilasta, toiminnoista ja aistillisesta kokemuksesta.",
        "future": "Tulevaisuus: 1-2 lausetta kiertotaloudesta, tulevaisuuden roolista tai kehityspotentiaalista."
      },
      "activities": ["<aktiviteetti 1>", "<aktiviteetti 2>"],
      "themes": ["${themeLabel.split(' ').slice(1).join(' ').toUpperCase()}", "<muu vakioteema>"],
      "tags": ["<hakusana1>", "<hakusana2>"]
    }
  ]
}

Ohjeet:
- KESKITY TARKASTI ANNETTUUN ALUEESEEN: "${activeArea}". Älä ehdota paikkoja muualta Suomesta.
- Ehdota vain TODELLISIA, olemassa olevia paikkoja tai rakennuksia (ei keksittyjä nimiä eikä pelkkiä liikkuvia palveluita).
- type: BUILDING, NATURE, ATTRACTION, BUSINESS, LANDMARK, SERVICE
- lat ja lon: anna WGS84-koordinaatit jos tiedät kohteen sijainnin (esim. Laukaa lat ~62.3-62.5, lon ~25.8-26.2).
- activities: max 6 konkreettista aktiviteettia
- themes: max 5 vakioteemaa (LUONTO, RETKEILY, HISTORIA, KULTTUURI, RAKENNUKSET, MARKKINAT, KYLÄYHTEISÖT, HYVINVOINTI, LIIKUNTA, VESISTÖT, TAPAHTUMAT, KIERTOTALOUS, PERHEET, PALVELUT)
- tags: max 8 yksisanaista hakusanaa pienellä kirjoitettuna.
- Palauta VAIN puhdas JSON-objekti ilman ylimääräisiä saatesanoja.`;
    }

    setPromptText(prompt);
    setStep(4);
  };

  // ── Kopioi prompti ────────────────────────────────────────────────────────

  const handleCopy = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(promptText);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = promptText;
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Kopiointi epäonnistui', err);
      alert('Kopiointi epäonnistui. Voit kopioida tekstin manuaalisesti.');
    }
  };

  // ── Vastauksen jäsennys ───────────────────────────────────────────────────

  const handleParse = () => {
    setParseError(null);
    setParsedResult(null);
    try {
      let json = jsonResponse.trim();
      
      // 1. Etsi Markdown-koodilohko ```json ... ``` tai ``` ... ```
      const codeBlockMatch = json.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
      if (codeBlockMatch) {
        json = codeBlockMatch[1].trim();
      } else {
        // 2. Yritä poimia ensimmäisen { ja viimeisen } väli
        const firstBrace = json.indexOf('{');
        const lastBrace = json.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          json = json.substring(firstBrace, lastBrace + 1);
        }
      }

      const parsed = JSON.parse(json);
      const rawPlaces = parsed.places || (Array.isArray(parsed) ? parsed : null);

      if (!rawPlaces || !Array.isArray(rawPlaces)) {
        throw new Error('Vastaus ei sisällä "places"-taulukkoa');
      }

      setParsedResult({
        places: rawPlaces.map((p: any) => ({ 
          ...p, 
          place_id: p.place_id || crypto.randomUUID(), 
          accepted: true 
        })),
        connections: (parsed.connections || []).map((c: any) => ({ ...c, accepted: true })),
      });
      setStep(5);
    } catch (e: any) {
      setParseError(`Jäsennysvirhe: ${e.message}`);
    }
  };

  // ── Tallennus ─────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!parsedResult) return;
    setSaving(true);
    setSavedCount(null);

    const acceptedPlaces = parsedResult.places.filter(p => p.accepted);
    const acceptedConns = parsedResult.connections.filter(c => c.accepted);

    let saved = 0;
    const errors: string[] = [];

    // Tallennetaan paikkojen tiedot
    for (const p of acceptedPlaces) {
      try {
        if (actionType === 'enrich' || actionType === 'retheme') {
          const updateData: any = {};
          if (p.description) updateData.description = p.description;
          const hist = p.history_note || p.lenses?.past;
          if (hist) updateData.history_text = hist;

          if (Object.keys(updateData).length > 0) {
            const { error } = await supabase
              .from('places')
              .update(updateData)
              .eq('place_id', p.place_id);
            if (error) throw error;
          }

          // Tallennetaan tulkintalinssit place_sources-tauluun
          if (p.lenses?.past) {
            await supabase.from('place_sources').upsert({
              place_id: p.place_id,
              source_type: 'LENS_PAST',
              title: 'Menneisyys & Muisti',
              content: p.lenses.past,
              source: 'AI_BULK',
              priority: 20
            });
          }
          if (p.lenses?.present) {
            await supabase.from('place_sources').upsert({
              place_id: p.place_id,
              source_type: 'LENS_PRESENT',
              title: 'Nykyisyys & Kokemus',
              content: p.lenses.present,
              source: 'AI_BULK',
              priority: 20
            });
          }
          if (p.lenses?.future) {
            await supabase.from('place_sources').upsert({
              place_id: p.place_id,
              source_type: 'LENS_FUTURE',
              title: 'Tulevaisuus & Mahdollisuudet',
              content: p.lenses.future,
              source: 'AI_BULK',
              priority: 20
            });
          }

          // Tallennetaan metatiedot place_sources-tauluun
          if (p.faq?.length) {
            for (const faqItem of p.faq) {
              await supabase.from('place_sources').upsert({
                place_id: p.place_id,
                source_type: 'FAQ',
                title: faqItem.q,
                content: faqItem.a,
                source: 'AI_BULK',
              });
            }
          }
          if (p.activities?.length) {
             for (const act of p.activities) {
                await supabase.from('place_sources').upsert({
                  place_id: p.place_id,
                  source_type: 'ACTIVITY',
                  title: act,
                  content: act,
                  source: 'AI_BULK',
                });
             }
          }
          // Yhdistetään ja tallennetaan teemat (place_tags, theme_places, tags ja place_sources)
          const allThemes = [
            ...(p.themes || []),
            ...(p.lens_themes?.past || []),
            ...(p.lens_themes?.present || []),
            ...(p.lens_themes?.future || [])
          ];
          const uniqueThemes = Array.from(new Set(allThemes.filter(Boolean)));
          if (uniqueThemes.length) {
             for (const theme of uniqueThemes) {
                await supabase.from('place_sources').upsert({
                  place_id: p.place_id,
                  source_type: 'THEME',
                  title: theme,
                  content: theme,
                  source: 'AI_BULK',
                });
                const tagId = theme.trim().toLowerCase()
                  .replace(/[äå]/g, 'a').replace(/ö/g, 'o')
                  .replace(/\s+/g, '-').replace(/[^\w-]/g, '');
                if (tagId) {
                  await supabase.from('tags').upsert(
                    { tag_id: tagId, name: theme.trim().toUpperCase(), category: 'THEME' },
                    { onConflict: 'tag_id' }
                  );
                  try {
                    await supabase.from('place_tags').upsert(
                      { place_id: p.place_id, tag_id: tagId, source: 'AI_BULK' }
                    );
                  } catch {}
                  try {
                    await supabase.from('theme_places').upsert(
                      { place_id: p.place_id, tag_id: tagId, scope: 'EXACT' },
                      { onConflict: 'tag_id,place_id' }
                    );
                  } catch {}
                }
             }
          }
          // Tallennetaan tagit entity_tags-tauluun
          if (p.tags?.length) {
            for (const rawTag of p.tags) {
              const tagId = rawTag.trim().toLowerCase()
                .replace(/[äå]/g, 'a').replace(/ö/g, 'o')
                .replace(/\s+/g, '-').replace(/[^\w-]/g, '');
              if (!tagId) continue;
              await supabase.from('tags').upsert(
                { tag_id: tagId, name: rawTag.trim().toLowerCase(), category: 'AI' },
                { onConflict: 'tag_id' }
              );
              await supabase.from('entity_tags').upsert(
                { entity_type: 'place', entity_id: p.place_id, tag_id: tagId, source: 'AI_BULK', weight: 80 },
                { onConflict: 'entity_type,entity_id,tag_id,source' }
              );
            }
          }
        } else {
          // Uusien paikkojen etsintä (actionType === 'find_new')
          const municipality = centerPlace?.municipality || areaPlace?.municipality || 'Laukaa';
          const placeName = p.name || 'Nimetön paikka (AI)';
          const insertData: any = {
            id: crypto.randomUUID(),
            name: placeName,
            canonical_name: toCanonicalName(placeName, municipality),
            type: p.type || 'LANDMARK',
            description: p.description || null,
            lat: p.lat && typeof p.lat === 'number' ? p.lat : null,
            lon: p.lon && typeof p.lon === 'number' ? p.lon : null,
            status: 'ACTIVE',
            verified: false,
            municipality,
            importance: 10
          };

          const { data: newPlace, error } = await supabase
            .from('places')
            .insert(insertData)
            .select('place_id')
            .single();

          if (error) throw error;

          if (newPlace?.place_id) {
            // Tallennetaan tulkintalinssit
            if (p.lenses?.past) {
              await supabase.from('place_sources').upsert({
                place_id: newPlace.place_id,
                source_type: 'LENS_PAST',
                title: 'Menneisyys & Muisti',
                content: p.lenses.past,
                source: 'AI_BULK',
                priority: 20
              });
            }
            if (p.lenses?.present) {
              await supabase.from('place_sources').upsert({
                place_id: newPlace.place_id,
                source_type: 'LENS_PRESENT',
                title: 'Nykyisyys & Kokemus',
                content: p.lenses.present,
                source: 'AI_BULK',
                priority: 20
              });
            }
            if (p.lenses?.future) {
              await supabase.from('place_sources').upsert({
                place_id: newPlace.place_id,
                source_type: 'LENS_FUTURE',
                title: 'Tulevaisuus & Mahdollisuudet',
                content: p.lenses.future,
                source: 'AI_BULK',
                priority: 20
              });
            }

            if (p.activities?.length) {
               for (const act of p.activities) {
                  await supabase.from('place_sources').upsert({
                    place_id: newPlace.place_id,
                    source_type: 'ACTIVITY',
                    title: act,
                    content: act,
                    source: 'AI_BULK',
                  });
               }
            }
            const allThemes = [
              ...(p.themes || []),
              ...(p.lens_themes?.past || []),
              ...(p.lens_themes?.present || []),
              ...(p.lens_themes?.future || [])
            ];
            const uniqueThemes = Array.from(new Set(allThemes.filter(Boolean)));
            if (uniqueThemes.length) {
               for (const theme of uniqueThemes) {
                  await supabase.from('place_sources').upsert({
                    place_id: newPlace.place_id,
                    source_type: 'THEME',
                    title: theme,
                    content: theme,
                    source: 'AI_BULK',
                  });
                  const tagId = theme.trim().toLowerCase()
                    .replace(/[äå]/g, 'a').replace(/ö/g, 'o')
                    .replace(/\s+/g, '-').replace(/[^\w-]/g, '');
                  if (tagId) {
                    await supabase.from('tags').upsert(
                      { tag_id: tagId, name: theme.trim().toUpperCase(), category: 'THEME' },
                      { onConflict: 'tag_id' }
                    );
                    try {
                      await supabase.from('place_tags').upsert(
                        { place_id: newPlace.place_id, tag_id: tagId, source: 'AI_BULK' }
                      );
                    } catch {}
                    try {
                      await supabase.from('theme_places').upsert(
                        { place_id: newPlace.place_id, tag_id: tagId, scope: 'EXACT' },
                        { onConflict: 'tag_id,place_id' }
                      );
                    } catch {}
                  }
               }
            }
            // Tallennetaan tagit entity_tags-tauluun
            if (p.tags?.length) {
              for (const rawTag of p.tags) {
                const tagId = rawTag.trim().toLowerCase()
                  .replace(/[äå]/g, 'a').replace(/ö/g, 'o')
                  .replace(/\s+/g, '-').replace(/[^\w-]/g, '');
                if (!tagId) continue;
                await supabase.from('tags').upsert(
                  { tag_id: tagId, name: rawTag.trim().toLowerCase(), category: 'AI' },
                  { onConflict: 'tag_id' }
                );
                await supabase.from('entity_tags').upsert(
                  { entity_type: 'place', entity_id: newPlace.place_id, tag_id: tagId, source: 'AI_BULK', weight: 80 },
                  { onConflict: 'entity_type,entity_id,tag_id,source' }
                );
              }
            }
          }
        }

        saved++;
      } catch (err: any) {
        errors.push(`${p.name || p.place_id}: ${err.message}`);
      }
    }

    // Tallennetaan yhteydet
    for (const conn of acceptedConns) {
      try {
        await supabase.from('place_connections').upsert({
          from_place_id: conn.from_place_id,
          to_place_id: conn.to_place_id,
          connection_type: conn.type,
          reason: conn.reason,
          source: 'AI_BULK',
        });
      } catch {
        // place_connections-taulu saattaa puuttua, ei kriittinen
      }
    }

    setSaving(false);
    setSavedCount(saved);
    if (errors.length > 0) {
      alert(`Tallennettiin ${saved} paikkaa. Virheitä:\n${errors.join('\n')}`);
    }
  };

  // ── Apufunktiot ───────────────────────────────────────────────────────────

  const togglePlaceInclusion = (place_id: string) => {
    setBulkPlaces(prev =>
      prev.map(p => p.place_id === place_id ? { ...p, included: !p.included } : p)
    );
  };

  const toggleParsedPlace = (place_id: string) => {
    setParsedResult(prev =>
      prev ? {
        ...prev,
        places: prev.places.map(p => p.place_id === place_id ? { ...p, accepted: !p.accepted } : p),
      } : prev
    );
  };

  const toggleConnection = (idx: number) => {
    setParsedResult(prev =>
      prev ? {
        ...prev,
        connections: prev.connections.map((c, i) => i === idx ? { ...c, accepted: !c.accepted } : c),
      } : prev
    );
  };

  const canGoToStep2 = () => {
    if (model === 'landmark') return centerPlace !== null || targetArea.trim().length > 0;
    if (model === 'area') return targetArea.trim().length > 0 || areaPlace !== null;
    if (model === 'theme') return selectedTheme !== '';
    if (model === 'route') return routePlaces.length >= 1;
    return true;
  };

  const includedCount = bulkPlaces.filter(p => p.included).length;
  const getPlaceName = (place_id: string) =>
    bulkPlaces.find(p => p.place_id === place_id)?.name || place_id;

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* ── Otsikko + stepper ───────────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-violet-50 to-indigo-50 rounded-2xl p-6 border border-violet-100">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 bg-violet-600 rounded-xl text-white">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">Bulk-paikkakeräys</h2>
            <p className="text-sm text-slate-500">Rikasta kokonainen alue yhdellä AI-kyselyllä</p>
          </div>
        </div>

        {/* Stepper */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {[
            { n: 1, label: 'Malli' },
            { n: 2, label: 'Parametrit' },
            { n: 3, label: 'Paikat' },
            { n: 4, label: 'Prompti' },
            { n: 5, label: 'Tallennus' },
          ].map(({ n, label }) => (
            <React.Fragment key={n}>
              <button
                type="button"
                onClick={() => {
                  if (n === 4 && !promptText) {
                    generatePrompt();
                  } else {
                    setStep(n as 1 | 2 | 3 | 4 | 5);
                  }
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                  step === n ? 'bg-violet-600 text-white shadow-md ring-2 ring-violet-300' :
                  step > n ? 'bg-violet-100 text-violet-700 hover:bg-violet-200' :
                  'bg-white/80 text-slate-500 hover:bg-white hover:text-slate-800'
                }`}
              >
                {step > n ? <CheckCircle className="w-3.5 h-3.5" /> : <span className="font-bold">{n}</span>}
                {label}
              </button>
              {n < 5 && <ChevronRight className="w-3 h-3 text-slate-300 flex-shrink-0" />}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          VAIHE 1 – Mallin valinta
      ═══════════════════════════════════════════════════════════════════ */}
      {step === 1 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <h3 className="text-base font-semibold text-slate-700">Valitse keruumalli</h3>
          <div className="grid grid-cols-2 gap-3">
            {MODEL_OPTIONS.map(opt => (
              <button
                key={opt.id}
                onClick={() => setModel(opt.id)}
                className={`p-4 rounded-xl border-2 text-left transition-all hover:shadow-md ${
                  model === opt.id
                    ? 'border-violet-500 bg-violet-50 shadow-sm'
                    : 'border-slate-200 bg-white hover:border-violet-300'
                }`}
              >
                <div className={`flex items-center gap-2 mb-2 font-semibold text-sm ${
                  model === opt.id ? 'text-violet-700' : 'text-slate-700'
                }`}>
                  <span className={model === opt.id ? 'text-violet-600' : 'text-slate-400'}>
                    {opt.icon}
                  </span>
                  {opt.label}
                </div>
                <p className="text-xs text-slate-500 leading-snug">{opt.desc}</p>
              </button>
            ))}
          </div>
          <div className="flex justify-end">
            <button
              onClick={() => setStep(2)}
              className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 text-white rounded-xl font-semibold hover:bg-violet-700 transition-colors shadow-sm"
            >
              Seuraava <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          VAIHE 2 – Parametrit
      ═══════════════════════════════════════════════════════════════════ */}
      {step === 2 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
          <div className="flex items-center gap-2">
            <button onClick={() => setStep(1)} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
              <ChevronLeft className="w-4 h-4 text-slate-500" />
            </button>
            <h3 className="text-base font-semibold text-slate-700">
              {MODEL_OPTIONS.find(m => m.id === model)?.label} – Parametrit
            </h3>
          </div>

          {/* ── Toiminnon valinta ── */}
          <div className="bg-slate-50 p-1.5 rounded-xl flex gap-1 border border-slate-200">
            <button
              onClick={() => setActionType('enrich')}
              className={`flex-1 py-2 text-xs md:text-sm font-semibold rounded-lg transition-all ${actionType === 'enrich' ? 'bg-white text-violet-700 shadow-sm border border-slate-200/60' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Rikasta kuvaukset ja linssit
            </button>
            <button
              onClick={() => setActionType('retheme')}
              className={`flex-1 py-2 text-xs md:text-sm font-semibold rounded-lg transition-all ${actionType === 'retheme' ? 'bg-white text-violet-700 shadow-sm border border-slate-200/60' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Teemojen linssirevisio (Bulk)
            </button>
            <button
              onClick={() => setActionType('find_new')}
              className={`flex-1 py-2 text-xs md:text-sm font-semibold rounded-lg transition-all ${actionType === 'find_new' ? 'bg-white text-violet-700 shadow-sm border border-slate-200/60' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Etsi uusia paikkoja
            </button>
          </div>

          {/* ── Kohdealueen tarkennus ── */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-violet-600" />
                Kohdealue / Kylä / Kunta (AI-aluerajaus)
              </label>
              <span className="text-[11px] text-slate-500 font-medium">Valittu: <strong className="text-violet-700">{targetArea === 'Muu oma aluerajaus...' ? (customArea || 'Oma rajaus') : targetArea}</strong></span>
            </div>
            
            <div className="flex flex-wrap gap-1.5">
              {AREA_PRESETS.map(area => (
                <button
                  key={area}
                  type="button"
                  onClick={() => setTargetArea(area)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                    targetArea === area
                      ? 'bg-violet-600 text-white shadow-sm ring-2 ring-violet-400/40'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {area}
                </button>
              ))}
            </div>

            {targetArea === 'Muu oma aluerajaus...' && (
              <div className="pt-1.5">
                <input
                  type="text"
                  placeholder="Kirjoita tarkka alue tai seutu (esim. Äijälän kylä ja Lievestuoreen pohjoispuoli)..."
                  value={customArea}
                  onChange={e => setCustomArea(e.target.value)}
                  className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-300 rounded-lg outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 bg-slate-50/50"
                />
              </div>
            )}
          </div>

          {/* ── Kiintopiste ── */}
          {model === 'landmark' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1.5">Kiintopiste (keskus)</label>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Hae paikkaa (esim. Peurunka)..."
                    value={centerSearch}
                    onChange={e => { setCenterSearch(e.target.value); setCenterPlace(null); }}
                    className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-400 focus:bg-white text-sm"
                  />
                  {searchLoading && <Loader2 className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 animate-spin" />}
                </div>
                {/* Pikanapit yleisimmille keskuksille */}
                <div className="mt-2 flex flex-wrap gap-1.5 items-center">
                  <span className="text-xs text-slate-500 font-medium mr-1">Suositut keskukset:</span>
                  {PRESET_LANDMARKS.map(pl => (
                    <button
                      key={pl.place_id}
                      type="button"
                      onClick={() => {
                        setCenterPlace(pl);
                        setCenterSearch(pl.name);
                        setCenterResults([]);
                      }}
                      className={`px-2 py-1 rounded-md text-xs font-semibold transition-all ${
                        centerPlace?.place_id === pl.place_id
                          ? 'bg-violet-600 text-white shadow-sm ring-1 ring-violet-400'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {pl.name}
                    </button>
                  ))}
                </div>

                {centerResults.length > 0 && !centerPlace && (
                  <div className="mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-10">
                    {centerResults.map(p => (
                      <button
                        key={p.place_id}
                        onClick={() => { setCenterPlace(p); setCenterSearch(p.name); setCenterResults([]); }}
                        className="w-full px-3 py-2.5 text-left hover:bg-violet-50 flex items-center gap-2 text-sm border-b border-slate-100 last:border-0"
                      >
                        <MapPin className="w-3.5 h-3.5 text-violet-500 flex-shrink-0" />
                        <span className="font-medium">{p.name}</span>
                        <span className="text-slate-400 text-xs ml-auto">{p.type}</span>
                      </button>
                    ))}
                  </div>
                )}
                {centerPlace && (
                  <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-violet-50 border border-violet-200 rounded-lg text-sm">
                    <CheckCircle className="w-4 h-4 text-violet-600" />
                    <span className="font-medium text-violet-800">{centerPlace.name}</span>
                    {centerPlace.lat ? (
                      <span className="text-violet-500 text-xs ml-auto">{centerPlace.lat.toFixed(4)}, {centerPlace.lon?.toFixed(4)}</span>
                    ) : (
                      <span className="text-amber-500 text-xs ml-auto flex items-center gap-1">
                        <Info className="w-3 h-3" /> Ei koordinaatteja
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1.5">Säde</label>
                <div className="flex gap-2">
                  {RADIUS_OPTIONS.map(r => (
                    <button
                      key={r}
                      onClick={() => setRadius(r)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                        radius === r ? 'bg-violet-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {r / 1000} km
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1.5">
                  Maksimi paikkojen määrä: <span className="text-violet-600 font-bold">{maxPlaces}</span>
                </label>
                <input
                  type="range" min={5} max={30} step={5}
                  value={maxPlaces}
                  onChange={e => setMaxPlaces(Number(e.target.value))}
                  className="w-full accent-violet-600"
                />
                <div className="flex justify-between text-xs text-slate-400 mt-1">
                  <span>5</span><span>10</span><span>15</span><span>20</span><span>25</span><span>30</span>
                </div>
              </div>
            </div>
          )}

          {/* ── Alue ── */}
          {model === 'area' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1.5">Alue</label>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Hae aluetta (esim. Lievestuore, Leppävesi)..."
                    value={areaSearch}
                    onChange={e => { setAreaSearch(e.target.value); setAreaPlace(null); }}
                    className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-400 text-sm"
                  />
                </div>
                {areaResults.length > 0 && !areaPlace && (
                  <div className="mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                    {areaResults.map(p => (
                      <button
                        key={p.place_id}
                        onClick={() => { setAreaPlace(p); setAreaSearch(p.name); setAreaResults([]); }}
                        className="w-full px-3 py-2.5 text-left hover:bg-violet-50 flex items-center gap-2 text-sm border-b border-slate-100 last:border-0"
                      >
                        <Map className="w-3.5 h-3.5 text-violet-500" />
                        <span className="font-medium">{p.name}</span>
                        <span className="text-slate-400 text-xs ml-auto">{p.municipality}</span>
                      </button>
                    ))}
                  </div>
                )}
                {areaPlace && (
                  <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-violet-50 border border-violet-200 rounded-lg text-sm">
                    <CheckCircle className="w-4 h-4 text-violet-600" />
                    <span className="font-medium text-violet-800">{areaPlace.name}</span>
                    <span className="text-violet-500 text-xs ml-auto">{areaPlace.municipality}</span>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1.5">
                  Maksimi paikkojen määrä: <span className="text-violet-600 font-bold">{maxPlaces}</span>
                </label>
                <input type="range" min={5} max={30} step={5} value={maxPlaces}
                  onChange={e => setMaxPlaces(Number(e.target.value))} className="w-full accent-violet-600" />
              </div>
            </div>
          )}

          {/* ── Teema ── */}
          {model === 'theme' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-2">Valitse teema</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {THEME_OPTIONS.map(t => (
                    <button
                      key={t.value}
                      onClick={() => setSelectedTheme(t.value)}
                      className={`px-3 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-left transition-all flex items-center justify-between border ${
                        selectedTheme === t.value
                          ? 'bg-violet-600 text-white shadow-sm border-violet-700 ring-2 ring-violet-400/40'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:border-violet-300'
                      }`}
                    >
                      <span className="truncate">{t.label}</span>
                      {selectedTheme === t.value && <span className="ml-1 text-xs">✓</span>}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1.5">
                  Maksimi: <span className="text-violet-600 font-bold">{maxPlaces}</span>
                </label>
                <input type="range" min={5} max={30} step={5} value={maxPlaces}
                  onChange={e => setMaxPlaces(Number(e.target.value))} className="w-full accent-violet-600" />
              </div>
            </div>
          )}

          {/* ── Reitti ── */}
          {model === 'route' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1.5">
                  Reittipisteet ({routePlaces.length} valittu, min 2)
                </label>
                {routePlaces.map((p, i) => (
                  <div key={p.place_id} className="flex items-center gap-2 mb-2">
                    <span className="w-6 h-6 rounded-full bg-violet-100 text-violet-700 text-xs font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                    <span className="flex-1 text-sm font-medium text-slate-700">{p.name}</span>
                    <span className="text-xs text-slate-400">{p.type}</span>
                    <button onClick={() => setRoutePlaces(prev => prev.filter(r => r.place_id !== p.place_id))}
                      className="p-1 hover:bg-red-50 rounded text-slate-400 hover:text-red-500 transition-colors">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                <div className="relative mt-2">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Lisää reittipiste..."
                    value={routeSearch}
                    onChange={e => setRouteSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-400 text-sm"
                  />
                </div>
                {routeResults.length > 0 && (
                  <div className="mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                    {routeResults.filter(r => !routePlaces.some(rp => rp.place_id === r.place_id)).map(p => (
                      <button
                        key={p.place_id}
                        onClick={() => { setRoutePlaces(prev => [...prev, p]); setRouteSearch(''); setRouteResults([]); }}
                        className="w-full px-3 py-2.5 text-left hover:bg-violet-50 flex items-center gap-2 text-sm border-b border-slate-100 last:border-0"
                      >
                        <Plus className="w-3.5 h-3.5 text-violet-500" />
                        <span className="font-medium">{p.name}</span>
                        <span className="text-slate-400 text-xs ml-auto">{p.type}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-between pt-2">
            <button onClick={() => setStep(1)} className="flex items-center gap-1.5 px-4 py-2.5 text-slate-600 hover:bg-slate-100 rounded-xl transition-colors text-sm font-medium">
              <ChevronLeft className="w-4 h-4" /> Takaisin
            </button>
            <button
              onClick={fetchBulkPlaces}
              disabled={!canGoToStep2() || loadingPlaces}
              className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 text-white rounded-xl font-semibold hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              {loadingPlaces ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Hae paikat
            </button>
          </div>
        </motion.div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          VAIHE 3 – Paikkalista
      ═══════════════════════════════════════════════════════════════════ */}
      {step === 3 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button onClick={() => setStep(2)} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
                <ChevronLeft className="w-4 h-4 text-slate-500" />
              </button>
              <h3 className="text-base font-semibold text-slate-700">
                Löydettiin {bulkPlaces.length} paikkaa — {includedCount} valittu
              </h3>
            </div>
            <button
              onClick={() => setBulkPlaces(prev => prev.map(p => ({ ...p, included: true })))}
              className="text-xs text-violet-600 hover:underline font-medium"
            >
              Valitse kaikki
            </button>
          </div>

          {bulkPlaces.length === 0 ? (
            <div className="text-center py-12 text-slate-500 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200 p-6 space-y-3">
              <MapPin className="w-10 h-10 mx-auto text-slate-400 opacity-60" />
              <div>
                <p className="font-semibold text-slate-700">Tietokannasta ei löytynyt valmiita paikkoja annetuilla rajauksilla.</p>
                <p className="text-xs text-slate-500 mt-1">Voit etsiä ja luoda kokonaan uusia paikkoja suoraan AI-promptilla kohdealueelle "{targetArea}".</p>
              </div>
              <div className="flex justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  Muuta parametreja
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActionType('find_new');
                    generatePrompt();
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 text-white rounded-xl text-xs font-semibold hover:bg-violet-700 transition-colors shadow-sm"
                >
                  <Sparkles className="w-3.5 h-3.5" /> Etsi uusia paikkoja AI:lla
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {bulkPlaces.map((p, i) => (
                <div
                  key={p.place_id}
                  onClick={() => togglePlaceInclusion(p.place_id)}
                  className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    p.included
                      ? 'border-violet-200 bg-violet-50 hover:bg-violet-100'
                      : 'border-slate-100 bg-slate-50 opacity-50 hover:opacity-70'
                  }`}
                >
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                    p.included ? 'bg-violet-600 text-white' : 'bg-slate-200 text-slate-400'
                  }`}>
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-slate-800 truncate">{p.name}</div>
                    <div className="text-xs text-slate-400">{p.type}</div>
                  </div>
                  {p.included ? (
                    <CheckCircle className="w-4 h-4 text-violet-500 flex-shrink-0" />
                  ) : (
                    <X className="w-4 h-4 text-slate-300 flex-shrink-0" />
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-between pt-2">
            <button onClick={() => setStep(2)} className="flex items-center gap-1.5 px-4 py-2.5 text-slate-600 hover:bg-slate-100 rounded-xl transition-colors text-sm font-medium">
              <ChevronLeft className="w-4 h-4" /> Takaisin
            </button>
            <button
              onClick={() => {
                if (includedCount === 0 && actionType === 'enrich') {
                  setActionType('find_new');
                }
                generatePrompt();
              }}
              className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 text-white rounded-xl font-semibold hover:bg-violet-700 transition-colors shadow-sm"
            >
              <Sparkles className="w-4 h-4" /> 
              {includedCount > 0 
                ? (actionType === 'enrich' 
                    ? `Luo AI-prompti (${includedCount} paikkaa)` 
                    : `Luo AI-prompti uusille paikoille (suodattaen ${includedCount})`)
                : `Luo AI-prompti alueelle (${targetArea === 'Muu oma aluerajaus...' ? (customArea || 'Alue') : targetArea})`}
            </button>
          </div>
        </motion.div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          VAIHE 4 – Prompti + Vastaus
      ═══════════════════════════════════════════════════════════════════ */}
      {step === 4 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
          <div className="flex items-center gap-2">
            <button onClick={() => setStep(3)} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
              <ChevronLeft className="w-4 h-4 text-slate-500" />
            </button>
            <h3 className="text-base font-semibold text-slate-700">AI-prompti</h3>
          </div>

          {/* Prompti */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-slate-600">Kopioi tämä prompti AI:lle</label>
              <button
                onClick={handleCopy}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  copied ? 'bg-green-100 text-green-700' : 'bg-violet-100 text-violet-700 hover:bg-violet-200'
                }`}
              >
                {copied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Kopioitu!' : 'Kopioi'}
              </button>
            </div>
            <textarea
              readOnly
              value={promptText}
              className="w-full h-48 p-3 bg-slate-900 text-slate-100 text-xs font-mono rounded-xl border border-slate-700 resize-none focus:outline-none"
            />
          </div>

          {/* Vastaus */}
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-2">
              Liitä AI:n JSON-vastaus tähän
            </label>
            <textarea
              value={jsonResponse}
              onChange={e => { setJsonResponse(e.target.value); setParseError(null); }}
              placeholder='{ "places": [...], "connections": [...] }'
              className="w-full h-48 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono resize-none focus:outline-none focus:ring-2 focus:ring-violet-400 focus:bg-white"
            />
            {parseError && (
              <div className="mt-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                {parseError}
              </div>
            )}
          </div>

          <div className="flex justify-between">
            <button onClick={() => setStep(3)} className="flex items-center gap-1.5 px-4 py-2.5 text-slate-600 hover:bg-slate-100 rounded-xl transition-colors text-sm font-medium">
              <ChevronLeft className="w-4 h-4" /> Takaisin
            </button>
            <button
              onClick={handleParse}
              disabled={jsonResponse.trim().length < 10}
              className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 text-white rounded-xl font-semibold hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              <RefreshCw className="w-4 h-4" /> Jäsennä vastaus
            </button>
          </div>
        </motion.div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          VAIHE 5 – Katsaus + Tallennus
      ═══════════════════════════════════════════════════════════════════ */}
      {step === 5 && parsedResult && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          <div className="flex items-center gap-2">
            <button onClick={() => setStep(4)} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
              <ChevronLeft className="w-4 h-4 text-slate-500" />
            </button>
            <div>
              <h3 className="text-base font-semibold text-slate-700">Tarkista ja tallenna</h3>
              <p className="text-xs text-slate-400">
                {parsedResult.places.filter(p => p.accepted).length}/{parsedResult.places.length} paikkaa •{' '}
                {parsedResult.connections.filter(c => c.accepted).length}/{parsedResult.connections.length} yhteyttä hyväksytty
              </p>
            </div>
          </div>

          {/* Paikkakorttien katsaus */}
          <div>
            <h4 className="text-sm font-semibold text-slate-600 mb-3 flex items-center gap-2">
              <MapPin className="w-4 h-4" /> Paikat
            </h4>
            <div className="space-y-3">
              {parsedResult.places.map(p => (
                <div
                  key={p.place_id}
                  className={`border rounded-xl overflow-hidden transition-all ${
                    p.accepted ? 'border-violet-200' : 'border-slate-100 opacity-50'
                  }`}
                >
                  <div
                    className={`flex items-center gap-3 px-4 py-3 cursor-pointer ${
                      p.accepted ? 'bg-violet-50' : 'bg-slate-50'
                    }`}
                    onClick={() => toggleParsedPlace(p.place_id)}
                  >
                    <button className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 border-2 transition-all ${
                      p.accepted ? 'bg-violet-600 border-violet-600' : 'border-slate-300'
                    }`}>
                      {p.accepted && <CheckCircle className="w-3.5 h-3.5 text-white" />}
                    </button>
                    <span className="font-semibold text-sm text-slate-800 flex-1">{p.name || getPlaceName(p.place_id)}</span>
                    {p.tags && <span className="text-xs text-slate-400">{p.tags.length} tagi</span>}
                  </div>
                  {p.accepted && (
                    <div className="px-4 py-3 bg-white text-sm space-y-2">
                      {p.description && (
                        <p className="text-slate-600 text-xs leading-relaxed">{p.description}</p>
                      )}
                      {p.lenses && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-2 border-t border-slate-100 text-xs">
                          {p.lenses.past && (
                            <div className="p-2 rounded-lg bg-amber-50/80 border border-amber-200">
                              <span className="font-bold text-amber-900 block mb-0.5 text-[11px]">🏛️ Mennyt</span>
                              <span className="text-amber-800 text-[11px] leading-tight block">{p.lenses.past}</span>
                            </div>
                          )}
                          {p.lenses.present && (
                            <div className="p-2 rounded-lg bg-emerald-50/80 border border-emerald-200">
                              <span className="font-bold text-emerald-900 block mb-0.5 text-[11px]">🌿 Nykyinen</span>
                              <span className="text-emerald-800 text-[11px] leading-tight block">{p.lenses.present}</span>
                            </div>
                          )}
                          {p.lenses.future && (
                            <div className="p-2 rounded-lg bg-sky-50/80 border border-sky-200">
                              <span className="font-bold text-sky-900 block mb-0.5 text-[11px]">🚀 Tuleva</span>
                              <span className="text-sky-800 text-[11px] leading-tight block">{p.lenses.future}</span>
                            </div>
                          )}
                        </div>
                      )}
                      {p.activities && p.activities.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {p.activities.map((a, i) => (
                            <span key={i} className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs">{a}</span>
                          ))}
                        </div>
                      )}
                      {p.themes && p.themes.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {p.themes.map((t, i) => (
                            <span key={i} className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full text-xs">{t}</span>
                          ))}
                        </div>
                      )}
                      {p.faq && p.faq.length > 0 && (
                        <details className="text-xs">
                          <summary className="cursor-pointer text-slate-500 hover:text-slate-700">
                            {p.faq.length} FAQ-kysymystä
                          </summary>
                          <div className="mt-1 space-y-1">
                            {p.faq.map((f, i) => (
                              <div key={i} className="pl-2 border-l-2 border-slate-200">
                                <div className="font-medium text-slate-700">Q: {f.q}</div>
                                <div className="text-slate-500">A: {f.a}</div>
                              </div>
                            ))}
                          </div>
                        </details>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Yhteydet */}
          {parsedResult.connections.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-slate-600 mb-3 flex items-center gap-2">
                <Route className="w-4 h-4" /> Paikkojen väliset yhteydet ({parsedResult.connections.length})
              </h4>
              <div className="space-y-2">
                {parsedResult.connections.map((conn, i) => (
                  <div
                    key={i}
                    onClick={() => toggleConnection(i)}
                    className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                      conn.accepted
                        ? 'border-emerald-200 bg-emerald-50'
                        : 'border-slate-100 bg-slate-50 opacity-50'
                    }`}
                  >
                    <button className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                      conn.accepted ? 'bg-emerald-600 border-emerald-600' : 'border-slate-300'
                    }`}>
                      {conn.accepted && <CheckCircle className="w-3.5 h-3.5 text-white" />}
                    </button>
                    <div className="flex-1 min-w-0 text-xs">
                      <span className="font-medium text-slate-700">{getPlaceName(conn.from_place_id)}</span>
                      <span className="mx-1.5 text-slate-400">→</span>
                      <span className="font-medium text-slate-700">{getPlaceName(conn.to_place_id)}</span>
                      <span className="ml-2 px-1.5 py-0.5 bg-white border border-emerald-200 text-emerald-700 rounded text-xs">{conn.type}</span>
                    </div>
                    <span className="text-xs text-slate-400 max-w-[150px] truncate">{conn.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tallenna */}
          {savedCount !== null && (
            <div className="flex items-center gap-2 px-4 py-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm font-medium">
              <CheckCircle className="w-5 h-5" />
              Tallennettu {savedCount} paikkaa onnistuneesti!
            </div>
          )}

          <div className="flex justify-between">
            <button onClick={() => setStep(4)} className="flex items-center gap-1.5 px-4 py-2.5 text-slate-600 hover:bg-slate-100 rounded-xl transition-colors text-sm font-medium">
              <ChevronLeft className="w-4 h-4" /> Takaisin
            </button>
            <button
              onClick={handleSave}
              disabled={saving || parsedResult.places.filter(p => p.accepted).length === 0}
              className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? 'Tallennetaan...' : `Tallenna ${parsedResult.places.filter(p => p.accepted).length} paikkaa`}
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
};
