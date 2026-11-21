// ============================================================================
// LostReFound Circular Economy - Vaihe 2A: Pisteytysmalli ja säännöt
// Polku: supabase/functions/process-matching-queue/scoring.ts
// ============================================================================

export interface CircularItem {
  id: string;
  item_type: "OFFER" | "WANTED";
  title: string;
  description?: string | null;
  status: string;
  place_id?: string | null;
  place_name_snapshot?: string | null;
  latitude: number;
  longitude: number;
  radius_meters: number;
  deadline_at?: string | null;
  price_eur: number;
  condition?: "NEW" | "GOOD" | "FAIR" | "FOR_PARTS" | null;
  preferred_pickup: "DIRECT_ONLY" | "STORAGE_OK" | "EITHER";
  firebase_uid: string;
  user_id?: string | null;
  contact_info?: string | null;
  attributes?: CircularItemAttributes | null;
}

export interface CircularItemAttributes {
  category_code?: string | null;
  material?: string | null;
  color?: string | null;
  quantity?: number | null;
  unit?: string | null;
  dimension_length_mm?: number | null;
  dimension_width_mm?: number | null;
  dimension_height_mm?: number | null;
  weight_kg?: number | null;
  custom_fields?: Record<string, unknown> | null;
}

export interface StorageHubCandidate {
  id: string;
  place_id?: string | null;
  latitude: number;
  longitude: number;
}

export interface MatchScoringResult {
  isMatch: boolean;
  matchConfidence: number;   // 0.00 - 1.00
  fulfillmentScore: number;  // 0.00 - 1.00
  totalScore: number;        // 0.00 - 1.00
  status: "POTENTIAL" | "NOTIFIED" | "REJECTED";
  pickupMode: "DIRECT" | "STORAGE";
  storageLocationId?: string | null;
  storagePlaceId?: string | null;
  rejectionReason?: string | null;
  breakdown: {
    textScore: number;
    dimScore: number;
    qtyScore: number;
    condScore: number;
    distScore: number;
    timeScore: number;
    pickupScore: number;
    distanceMeters: number;
  };
}

// ----------------------------------------------------------------------------
// Suomen kielen yleisimmät täytesanat (stopwords) leksikaalista tokenisointia varten
// ----------------------------------------------------------------------------
const FINNISH_STOP_WORDS = new Set([
  "ja", "tai", "sekä", "mutta", "vaan", "jos", "kun", "jotta", "koska", "kuin",
  "on", "oli", "ovat", "ollut", "olla", "ei", "en", "et", "emme", "ette", "eivät",
  "se", "hän", "he", "ne", "tämä", "tämäkin", "tuo", "nuo", "nämä", "joka", "jotka",
  "kanssa", "mukaan", "varten", "kannalta", "vuoksi", "takia", "ilman", "kautta",
  "myös", "vielä", "jo", "vain", "aina", "koko", "paljon", "vähän", "hyvin", "liian",
  "kpl", "kappale", "kappaletta", "m", "metri", "metriä", "mm", "cm", "kg"
]);

// Tunnetut synonyymit ja samanarvoiset ilmaisut kiertotaloudessa
const SYNONYM_GROUPS: string[][] = [
  ["kakkosnelonen", "48x98", "50x100", "soiro", "lankku", "runkopuu", "puutavara"],
  ["trukkilava", "kuormalava", "eur-lava", "eurlava", "fin-lava", "finlava", "lava"],
  ["tiili", "tiilet", "punatiili", "tiiliä"],
  ["harkko", "lecaharkko", "kevytbetoniharkko", "valuharkko"],
  ["multa", "puutarhamulta", "kuorikate", "kate", "maa-aines"],
  ["polttopuu", "polttopuut", "koivuklapi", "klapi", "sekaklapi", "halko"]
];

/**
 * Laskee kahden maantieteellisen koordinaattipisteen etäisyyden metreinä (Haversine).
 */
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Maapallon säde metreinä
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Poimii merkittävät sanajuuret ja tokenit merkkijonosta.
 */
export function extractTokens(text?: string | null): Set<string> {
  if (!text) return new Set();
  const cleaned = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ");

  const words = cleaned.split(" ").filter((w) => w.length >= 2);
  const tokens = new Set<string>();

  for (const word of words) {
    if (!FINNISH_STOP_WORDS.has(word)) {
      tokens.add(word);
    }
  }
  return tokens;
}

/**
 * Tarkistaa osuvatko kaksi token-joukkoa toisiinsa synonyymisanaston avulla.
 */
function checkSynonymOverlap(tokens1: Set<string>, tokens2: Set<string>): boolean {
  for (const group of SYNONYM_GROUPS) {
    const hasIn1 = group.some((term) => tokens1.has(term));
    const hasIn2 = group.some((term) => tokens2.has(term));
    if (hasIn1 && hasIn2) {
      return true;
    }
  }
  return false;
}

/**
 * 3.1. Tekstuaalinen ja käsitteellinen vastaavuus (S_text)
 */
export function calculateTextSimilarity(
  offer: CircularItem,
  wanted: CircularItem
): number {
  // Jos sama taksonomiakoodi, täysi osuma
  if (
    offer.attributes?.category_code &&
    wanted.attributes?.category_code &&
    offer.attributes.category_code === wanted.attributes.category_code
  ) {
    return 1.0;
  }

  const offerTokens = extractTokens(`${offer.title} ${offer.description ?? ""}`);
  const wantedTokens = extractTokens(`${wanted.title} ${wanted.description ?? ""}`);

  if (wantedTokens.size === 0) {
    return 0.50; // Neutraali jos tarveotsikossa ei ole eriteltyä tekstiä
  }

  // Tarkista synonyymiryhmät
  if (checkSynonymOverlap(offerTokens, wantedTokens)) {
    return 0.90;
  }

  let intersectionCount = 0;
  for (const token of wantedTokens) {
    if (offerTokens.has(token)) {
      intersectionCount++;
    }
  }

  const rawScore = intersectionCount / wantedTokens.size;
  return Math.min(1.0, Math.max(0.0, rawScore));
}

/**
 * 3.2. Mitat ja toleranssi (S_dim)
 */
export function calculateDimensionScore(
  offer: CircularItem,
  wanted: CircularItem
): number {
  const oAttr = offer.attributes;
  const wAttr = wanted.attributes;

  const hasOfferDim = !!(oAttr?.dimension_length_mm || oAttr?.dimension_width_mm || oAttr?.dimension_height_mm);
  const hasWantedDim = !!(wAttr?.dimension_length_mm || wAttr?.dimension_width_mm || wAttr?.dimension_height_mm);

  // Puuttuvat mittatiedot
  if (!hasOfferDim && !hasWantedDim) return 0.50;
  if (!hasOfferDim || !hasWantedDim) return 0.60;

  let totalPoints = 0;
  let evaluatedCount = 0;

  // Poikkileikkaus / leveys ja korkeus toleranssi (+-10%)
  if (oAttr?.dimension_width_mm && wAttr?.dimension_width_mm) {
    evaluatedCount++;
    const diffRatio = Math.abs(oAttr.dimension_width_mm - wAttr.dimension_width_mm) / wAttr.dimension_width_mm;
    totalPoints += diffRatio <= 0.10 ? 1.0 : diffRatio <= 0.20 ? 0.60 : 0.20;
  }

  if (oAttr?.dimension_height_mm && wAttr?.dimension_height_mm) {
    evaluatedCount++;
    const diffRatio = Math.abs(oAttr.dimension_height_mm - wAttr.dimension_height_mm) / wAttr.dimension_height_mm;
    totalPoints += diffRatio <= 0.10 ? 1.0 : diffRatio <= 0.20 ? 0.60 : 0.20;
  }

  // Pituus: Jos tarjolla on vähintään tarpeen verran -> 1.0, muuten heikko
  if (oAttr?.dimension_length_mm && wAttr?.dimension_length_mm) {
    evaluatedCount++;
    if (oAttr.dimension_length_mm >= wAttr.dimension_length_mm) {
      totalPoints += 1.0;
    } else {
      const lengthRatio = oAttr.dimension_length_mm / wAttr.dimension_length_mm;
      totalPoints += lengthRatio >= 0.90 ? 0.70 : 0.10;
    }
  }

  return evaluatedCount > 0 ? totalPoints / evaluatedCount : 0.50;
}

/**
 * 3.3. Määrä ja osittainen match (S_qty)
 */
export function calculateQuantityScore(
  offer: CircularItem,
  wanted: CircularItem
): number {
  const qOffer = offer.attributes?.quantity;
  const qWanted = wanted.attributes?.quantity;

  if (qOffer == null || qWanted == null || qOffer <= 0 || qWanted <= 0) {
    return 0.80; // Oletuskertaerä
  }

  if (qOffer >= qWanted) {
    return 1.0;
  }

  // Osittainen match: max(0.3, offer / wanted)
  return Math.min(1.0, Math.max(0.30, qOffer / qWanted));
}

/**
 * 3.4. Kunto (S_cond)
 * Hierarkia: NEW (4) > GOOD (3) > FAIR (2) > FOR_PARTS (1)
 */
export function calculateConditionScore(
  offer: CircularItem,
  wanted: CircularItem
): number {
  const COND_MAP: Record<string, number> = {
    NEW: 4,
    GOOD: 3,
    FAIR: 2,
    FOR_PARTS: 1
  };

  const cOffer = offer.condition ? COND_MAP[offer.condition] : null;
  const cWanted = wanted.condition ? COND_MAP[wanted.condition] : null;

  if (cOffer == null || cWanted == null) {
    return 0.70; // Normaali hyväksyttävä yleiskunto
  }

  if (cOffer >= cWanted) {
    return 1.0;
  }

  if (cOffer === cWanted - 1) {
    return 0.60;
  }

  return 0.10;
}

/**
 * 4.1. Etäisyyspisteet (S_dist) tiukasti välille [0.0, 1.0] sidottuna
 */
export function calculateDistanceScore(
  distanceMeters: number,
  rOffer: number,
  rWanted: number
): number {
  const rMax = Math.max(rOffer, rWanted, 1000); // Vähintään 1 km
  const score = 1.0 - distanceMeters / rMax;
  return Math.max(0.0, Math.min(1.0, score));
}

/**
 * 4.2. Aikaikkunan pelivara (S_time)
 */
export function calculateTimeScore(
  nowIso: string,
  tOfferIso?: string | null,
  tWantedIso?: string | null
): number {
  const now = new Date(nowIso).getTime();

  if (!tOfferIso && !tWantedIso) {
    return 1.0; // Molemmat avoimia
  }
  if (!tOfferIso || !tWantedIso) {
    return 0.70; // Toinen avoin
  }

  const tOffer = new Date(tOfferIso).getTime();
  const tWanted = new Date(tWantedIso).getTime();

  // Jos menneisyydessä
  if (tOffer < now || tWanted < now) {
    return 0.0;
  }

  const minDeadline = Math.min(tOffer, tWanted);
  const deltaHours = (minDeadline - now) / (1000 * 60 * 60);

  if (deltaHours >= 72) {
    return 1.0;
  }
  if (deltaHours >= 24) {
    // Lineaarinen interpolaatio: 0.40 + 0.60 * ((deltaHours - 24) / 48)
    return 0.40 + 0.60 * ((deltaHours - 24) / 48);
  }
  return 0.40;
}

/**
 * 4.3. Noutotapa ja mikrovarastobonus (S_pickup)
 */
export function calculatePickupScore(
  offer: CircularItem,
  wanted: CircularItem,
  distanceMeters: number,
  availableHubs: StorageHubCandidate[] = []
): { score: number; pickupMode: "DIRECT" | "STORAGE"; storageLocationId?: string | null; storagePlaceId?: string | null } {
  const oPick = offer.preferred_pickup;
  const wPick = wanted.preferred_pickup;

  // 0. Sama toimipiste / noutopaikka suoraan
  if (offer.place_id && wanted.place_id && offer.place_id === wanted.place_id) {
    return {
      score: 1.0,
      pickupMode: "STORAGE",
      storagePlaceId: offer.place_id
    };
  }

  // 1. Molemmat sallivat mikrovaraston
  const bothAllowStorage =
    (oPick === "STORAGE_OK" || oPick === "EITHER") &&
    (wPick === "STORAGE_OK" || wPick === "EITHER");

  if (bothAllowStorage && availableHubs.length > 0) {
    // Etsitään hub, joka on <= 15 km (15000 m) kummastakin
    for (const hub of availableHubs) {
      const d1 = calculateDistanceMeters(offer.latitude, offer.longitude, hub.latitude, hub.longitude);
      const d2 = calculateDistanceMeters(wanted.latitude, wanted.longitude, hub.latitude, hub.longitude);
      if (d1 <= 15000 && d2 <= 15000) {
        return {
          score: 1.0,
          pickupMode: "STORAGE",
          storageLocationId: hub.id,
          storagePlaceId: hub.place_id ?? null
        };
      }
    }
  }

  // 2. Suora nouto toimii
  if (
    (oPick === "DIRECT_ONLY" || oPick === "EITHER") &&
    (wPick === "DIRECT_ONLY" || wPick === "EITHER")
  ) {
    return {
      score: 1.0,
      pickupMode: "DIRECT"
    };
  }

  // 3. Ristiriitainen noutotapa
  if (distanceMeters < 5000) {
    return { score: 0.70, pickupMode: "DIRECT" };
  } else {
    return { score: 0.30, pickupMode: "DIRECT" };
  }
}

/**
 * PÄÄFUNKTIO: Pisteyttää OFFER- ja WANTED-parin täydellisesti Vaihe 2A:n mukaan.
 */
export function evaluateCircularMatch(
  offer: CircularItem,
  wanted: CircularItem,
  nowIso: string = new Date().toISOString(),
  availableHubs: StorageHubCandidate[] = []
): MatchScoringResult {
  // Hard Gating 1: Vastakkaiset tyypit
  if (offer.item_type !== "OFFER" || wanted.item_type !== "WANTED") {
    return createRejectedResult("Invalid item types: must be OFFER and WANTED");
  }

  // Hard Gating 2: Eri käyttäjät
  if (offer.firebase_uid === wanted.firebase_uid) {
    return createRejectedResult("Self-matching not allowed");
  }

  // Hard Gating 3: Molemmat aktiivisia
  if (offer.status !== "ACTIVE" || wanted.status !== "ACTIVE") {
    return createRejectedResult("Both items must be ACTIVE");
  }

  // Hard Gating 4: Hintaehto
  if (offer.price_eur > 0 && wanted.price_eur > 0 && offer.price_eur > wanted.price_eur) {
    return createRejectedResult("Offer price exceeds wanted budget");
  }

  // Etäisyyden laskenta (jos sama place_id, etäisyys on 0)
  const isSamePlace = Boolean(offer.place_id && wanted.place_id && offer.place_id === wanted.place_id);
  const distanceMeters = isSamePlace
    ? 0
    : calculateDistanceMeters(
        offer.latitude,
        offer.longitude,
        wanted.latitude,
        wanted.longitude
      );

  const rMax = Math.max(offer.radius_meters || 5000, wanted.radius_meters || 5000);

  // Hard Gating 5: Alustava etäisyyskarsinta (d <= rMax * 1.5 ellei mikrovarastoa sallittu)
  const canUseStorage =
    (offer.preferred_pickup === "STORAGE_OK" || offer.preferred_pickup === "EITHER") &&
    (wanted.preferred_pickup === "STORAGE_OK" || wanted.preferred_pickup === "EITHER");

  if (distanceMeters > rMax * 1.5 && !canUseStorage) {
    return createRejectedResult("Distance exceeds radius threshold without storage option");
  }

  // --------------------------------------------------------------------------
  // MATCH CONFIDENCE (S_conf): 0.35 text + 0.30 dim + 0.20 qty + 0.15 cond
  // --------------------------------------------------------------------------
  const textScore = calculateTextSimilarity(offer, wanted);
  const dimScore = calculateDimensionScore(offer, wanted);
  const qtyScore = calculateQuantityScore(offer, wanted);
  const condScore = calculateConditionScore(offer, wanted);

  const matchConfidence = Number(
    (0.35 * textScore + 0.30 * dimScore + 0.20 * qtyScore + 0.15 * condScore).toFixed(4)
  );

  // --------------------------------------------------------------------------
  // FULFILLMENT SCORE (S_fulf): 0.45 dist + 0.35 time + 0.20 pickup
  // --------------------------------------------------------------------------
  const distScore = calculateDistanceScore(distanceMeters, offer.radius_meters, wanted.radius_meters);
  const timeScore = calculateTimeScore(nowIso, offer.deadline_at, wanted.deadline_at);
  const pickupResult = calculatePickupScore(offer, wanted, distanceMeters, availableHubs);

  const fulfillmentScore = Number(
    (0.45 * distScore + 0.35 * timeScore + 0.20 * pickupResult.score).toFixed(4)
  );

  // --------------------------------------------------------------------------
  // TOTAL SCORE (S_total): 0.60 S_conf + 0.40 S_fulf
  // --------------------------------------------------------------------------
  const totalScore = Number((0.60 * matchConfidence + 0.40 * fulfillmentScore).toFixed(4));

  // Kynnysarvot:
  // S_conf < 0.40 tai S_fulf < 0.30 -> hylätään
  if (matchConfidence < 0.40 || fulfillmentScore < 0.30 || totalScore < 0.50) {
    return {
      isMatch: false,
      matchConfidence,
      fulfillmentScore,
      totalScore,
      status: "REJECTED",
      pickupMode: pickupResult.pickupMode,
      rejectionReason: "Scores below minimum operational thresholds",
      breakdown: {
        textScore,
        dimScore,
        qtyScore,
        condScore,
        distScore,
        timeScore,
        pickupScore: pickupResult.score,
        distanceMeters
      }
    };
  }

  const finalStatus: "POTENTIAL" | "NOTIFIED" = totalScore >= 0.75 ? "NOTIFIED" : "POTENTIAL";

  return {
    isMatch: true,
    matchConfidence,
    fulfillmentScore,
    totalScore,
    status: finalStatus,
    pickupMode: pickupResult.pickupMode,
    storageLocationId: pickupResult.storageLocationId,
    storagePlaceId: pickupResult.storagePlaceId,
    breakdown: {
      textScore,
      dimScore,
      qtyScore,
      condScore,
      distScore,
      timeScore,
      pickupScore: pickupResult.score,
      distanceMeters
    }
  };
}

function createRejectedResult(reason: string): MatchScoringResult {
  return {
    isMatch: false,
    matchConfidence: 0.0,
    fulfillmentScore: 0.0,
    totalScore: 0.0,
    status: "REJECTED",
    pickupMode: "DIRECT",
    rejectionReason: reason,
    breakdown: {
      textScore: 0,
      dimScore: 0,
      qtyScore: 0,
      condScore: 0,
      distScore: 0,
      timeScore: 0,
      pickupScore: 0,
      distanceMeters: 0
    }
  };
}

