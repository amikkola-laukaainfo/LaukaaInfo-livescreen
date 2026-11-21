// ============================================================================
// LostReFound Circular Economy - Pisteytysmallin yksikkötestit (Vaihe 2A)
// Polku: supabase/functions/process-matching-queue/scoring_test.ts
// Synkronoitu: LaukaaInfo-livescreen/kehitysideat/
// ============================================================================

import { assertEquals, assert } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  evaluateCircularMatch,
  calculateDistanceMeters,
  CircularItem
} from "./scoring.ts";

Deno.test("Tapaus A: Puutavaran osittainen match (Lievestuore - Laukaa) -> NOTIFIED", () => {
  const now = "2026-11-20T12:00:00.000Z";
  const deadlineIn7Days = "2026-11-27T12:00:00.000Z";

  // Lievestuore: 62.2612, 26.2023
  const offerItem: CircularItem = {
    id: "offer-001",
    item_type: "OFFER",
    title: "Lankkua 48x98 runkopuu",
    description: "Hyväkuntoista kuivaa kakkosnelosta remontista yli jäänyttä",
    status: "ACTIVE",
    latitude: 62.2612,
    longitude: 26.2023,
    radius_meters: 25000,
    deadline_at: deadlineIn7Days,
    price_eur: 0,
    condition: "GOOD",
    preferred_pickup: "EITHER",
    firebase_uid: "user-offer-123",
    attributes: {
      category_code: "wood_timber",
      quantity: 200,
      unit: "m",
      dimension_width_mm: 48,
      dimension_height_mm: 98,
      dimension_length_mm: 3000
    }
  };

  // Laukaa kk: 62.4136, 25.9557 (~21 km linnuntietä)
  const wantedItem: CircularItem = {
    id: "wanted-001",
    item_type: "WANTED",
    title: "Etsitään runkopuuta 50x100",
    description: "Tarve autotallin seinään, tyydyttäväkin kunto kelpaa",
    status: "ACTIVE",
    latitude: 62.4136,
    longitude: 25.9557,
    radius_meters: 25000,
    deadline_at: deadlineIn7Days,
    price_eur: 0,
    condition: "FAIR",
    preferred_pickup: "EITHER",
    firebase_uid: "user-wanted-456",
    attributes: {
      category_code: "wood_timber",
      quantity: 150,
      unit: "m",
      dimension_width_mm: 50,
      dimension_height_mm: 100,
      dimension_length_mm: 2500
    }
  };

  const result = evaluateCircularMatch(offerItem, wantedItem, now);

  assert(result.isMatch, "Pitäisi olla match");
  assertEquals(result.status, "NOTIFIED", "Pitäisi saavuttaa NOTIFIED-tila (total >= 0.75)");
  assert(result.matchConfidence >= 0.85, `Match confidence liian matala: ${result.matchConfidence}`);
  assert(result.fulfillmentScore >= 0.60, `Fulfillment score liian matala: ${result.fulfillmentScore}`);
  assert(result.totalScore >= 0.75, `Total score liian matala: ${result.totalScore}`);
});

Deno.test("Tapaus B: Täydellinen tuote, mutta etäisyys liian suuri (Oulu - Laukaa) -> Hard Gating hylkää", () => {
  const now = "2026-11-20T12:00:00.000Z";

  // Oulu: 65.0121, 25.4651
  const offerOulu: CircularItem = {
    id: "offer-oulu",
    item_type: "OFFER",
    title: "EUR-lava kuormalavoja 50 kpl",
    status: "ACTIVE",
    latitude: 65.0121,
    longitude: 25.4651,
    radius_meters: 30000, // 30 km säde
    price_eur: 0,
    preferred_pickup: "DIRECT_ONLY",
    firebase_uid: "user-oulu-1",
    attributes: {
      quantity: 50
    }
  };

  // Laukaa: 62.4136, 25.9557 (~290 km)
  const wantedLaukaa: CircularItem = {
    id: "wanted-laukaa",
    item_type: "WANTED",
    title: "EUR-lava kuormalava tarve 20 kpl",
    status: "ACTIVE",
    latitude: 62.4136,
    longitude: 25.9557,
    radius_meters: 30000, // 30 km säde
    price_eur: 0,
    preferred_pickup: "DIRECT_ONLY",
    firebase_uid: "user-laukaa-2",
    attributes: {
      quantity: 20
    }
  };

  const result = evaluateCircularMatch(offerOulu, wantedLaukaa, now);

  assertEquals(result.isMatch, false, "Ei pitäisi hyväksyä matchiksi");
  assertEquals(result.status, "REJECTED", "Pitäisi olla REJECTED");
  assert(
    result.rejectionReason?.includes("Distance exceeds radius"),
    `Odotettiin etäisyyshylkäystä, saatiin: ${result.rejectionReason}`
  );
});

Deno.test("Tapaus C: Itsematchauksen esto (sama firebase_uid) -> REJECTED", () => {
  const item1: CircularItem = {
    id: "item-1",
    item_type: "OFFER",
    title: "Testituote",
    status: "ACTIVE",
    latitude: 62.4,
    longitude: 25.9,
    radius_meters: 5000,
    price_eur: 0,
    preferred_pickup: "EITHER",
    firebase_uid: "same-user-uid"
  };

  const item2: CircularItem = {
    id: "item-2",
    item_type: "WANTED",
    title: "Testituote",
    status: "ACTIVE",
    latitude: 62.4,
    longitude: 25.9,
    radius_meters: 5000,
    price_eur: 0,
    preferred_pickup: "EITHER",
    firebase_uid: "same-user-uid"
  };

  const result = evaluateCircularMatch(item1, item2);
  assertEquals(result.isMatch, false);
  assertEquals(result.rejectionReason, "Self-matching not allowed");
});

