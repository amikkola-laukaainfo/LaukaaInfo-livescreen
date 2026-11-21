// ============================================================================
// LostReFound Circular Economy - Vaihe 2B: process-matching-queue
// Polku: supabase/functions/process-matching-queue/index.ts
//
// KORJAUKSET (Auditointi 20.11.2026):
//   1. CRON_SECRET -suojaus estää luvattomat ulkopuoliset käynnistykset.
//   2. fn_upsert_circular_match_evaluation suojaa elinkaaritilat (ACCEPTED, RESERVED, jne.
//      eivät koskaan palaudu taaksepäin).
//   3. Deduplication_key ja status_changed_to_notified estävät kaksoisilmoitukset.
//   4. RPC-kutsussa virheparametri korjattu: p_error (aiemmin virheellinen p_error_message).
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  evaluateCircularMatch,
  CircularItem,
  CircularItemAttributes,
  StorageHubCandidate
} from "./scoring.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-cron-secret",
  "Content-Type": "application/json"
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  // 1. CRON_SECRET -suojaus taustafunktiolle
  if (CRON_SECRET) {
    const authHeader = req.headers.get("authorization") ?? "";
    const customHeader = req.headers.get("x-cron-secret") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();

    if (token !== CRON_SECRET && customHeader !== CRON_SECRET) {
      return new Response(JSON.stringify({ error: "Unauthorized worker invocation" }), {
        status: 401,
        headers: CORS_HEADERS
      });
    }
  }

  try {
    let batchSize = 10;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body?.batch_size && typeof body.batch_size === "number") {
          batchSize = Math.max(1, Math.min(50, body.batch_size));
        }
      } catch {
        // Sallitaan tyhjä body GET/POST-kutsussa
      }
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      return new Response(
        JSON.stringify({ error: "Missing Supabase server configuration" }),
        { status: 500, headers: CORS_HEADERS }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // 2. Poimi erä tehtäviä atomisesti claim_tokenilla
    const { data: queueTasks, error: popError } = await supabase.rpc(
      "fn_pop_matching_queue_batch",
      { p_batch_size: batchSize }
    );

    if (popError) {
      console.error("Error popping from matching queue:", popError);
      return new Response(JSON.stringify({ error: popError.message }), {
        status: 500,
        headers: CORS_HEADERS
      });
    }

    if (!queueTasks || queueTasks.length === 0) {
      return new Response(
        JSON.stringify({ message: "Queue is empty", processed: 0 }),
        { status: 200, headers: CORS_HEADERS }
      );
    }

    console.log(`Processing ${queueTasks.length} tasks from circular_matching_queue...`);

    // Haetaan mahdolliset mikrovarastopisteet kerralla muistiin
    let storageHubs: StorageHubCandidate[] = [];
    try {
      const { data: hubs } = await supabase
        .from("storage_locations")
        .select("id, place_id, latitude, longitude")
        .limit(100);
      if (hubs) {
        storageHubs = hubs;
      }
    } catch {
      storageHubs = [];
    }

    let processedCount = 0;
    let matchesCreatedCount = 0;

    for (const task of queueTasks) {
      const queueId: number = task.queue_id;
      const itemId: string = task.item_id;
      const claimToken: string = task.claim_token;

      try {
        // 3. Hae käsiteltävän kohteen tiedot ja sen attribuutit
        const { data: rawItem, error: itemError } = await supabase
          .from("circular_items")
          .select("*, circular_item_attributes(*)")
          .eq("id", itemId)
          .single();

        if (itemError || !rawItem) {
          console.warn(`Item ${itemId} not found, completing queue task:`, itemError);
          await supabase.rpc("fn_complete_matching_queue_task", {
            p_id: queueId,
            p_claim_token: claimToken
          });
          continue;
        }

        // Jos kohde ei ole enää aktiivinen, ei matchata
        if (rawItem.status !== "ACTIVE") {
          await supabase.rpc("fn_complete_matching_queue_task", {
            p_id: queueId,
            p_claim_token: claimToken
          });
          continue;
        }

        const currentItem = mapDbRowToCircularItem(rawItem);
        const targetType = currentItem.item_type === "OFFER" ? "WANTED" : "OFFER";

        // 4. Etsi vastakkaisen tyypin aktiiviset kandidaatit (eri käyttäjä)
        const { data: rawCandidates, error: candError } = await supabase
          .from("circular_items")
          .select("*, circular_item_attributes(*)")
          .eq("item_type", targetType)
          .eq("status", "ACTIVE")
          .neq("firebase_uid", currentItem.firebase_uid);

        if (candError) {
          throw new Error(`Failed to query candidates: ${candError.message}`);
        }

        const candidates = (rawCandidates || []).map(mapDbRowToCircularItem);

        // 5. Pisteytä kaikki vastakandidaatit
        for (const candidate of candidates) {
          const offer = currentItem.item_type === "OFFER" ? currentItem : candidate;
          const wanted = currentItem.item_type === "WANTED" ? currentItem : candidate;

          const scoringResult = evaluateCircularMatch(
            offer,
            wanted,
            new Date().toISOString(),
            storageHubs
          );

          if (scoringResult.isMatch) {
            // 6. Tallennus tietokannan fn_upsert_circular_match_evaluation -funktiolla
            // Tämä suojaa ACCEPTED/RESERVED/FULFILLED -tilat palautumasta taaksepäin!
            const { data: evalResult, error: evalError } = await supabase.rpc(
              "fn_upsert_circular_match_evaluation",
              {
                p_offer_item_id: offer.id,
                p_wanted_item_id: wanted.id,
                p_match_confidence: scoringResult.matchConfidence,
                p_fulfillment_score: scoringResult.fulfillmentScore,
                p_total_score: scoringResult.totalScore,
                p_evaluated_status: scoringResult.status,
                p_pickup_mode: scoringResult.pickupMode,
                p_storage_location_id: scoringResult.storageLocationId ?? null,
                p_storage_place_id: scoringResult.storagePlaceId ?? null
              }
            );

            if (evalError) {
              console.error("Error evaluating match in DB:", evalError);
              continue;
            }

            matchesCreatedCount++;

            // 7. Lähetä notifikaatio VAIN silloin kun tila on siirtynyt NOTIFIED-tilaan
            // Ja käytä deduplication_key -avainta estämään tuplalähetykset
            if (evalResult?.status_changed_to_notified && evalResult?.match_id) {
              const matchId = evalResult.match_id;
              const pct = Math.round(scoringResult.totalScore * 100);

              const notifications = [
                {
                  recipient_uid: offer.firebase_uid,
                  notification_type: "MATCH_FOUND",
                  deduplication_key: `match_notif:${matchId}:${offer.firebase_uid}:MATCH_FOUND`,
                  title: "Uusi kiertotalousosuma!",
                  body: `Ilmoituksellesi "${offer.title}" löytyi sopiva tarvitsija (${pct} % osuma).`,
                  payload: {
                    match_id: matchId,
                    my_item_id: offer.id,
                    counterpart_item_id: wanted.id,
                    total_score: scoringResult.totalScore
                  }
                },
                {
                  recipient_uid: wanted.firebase_uid,
                  notification_type: "MATCH_FOUND",
                  deduplication_key: `match_notif:${matchId}:${wanted.firebase_uid}:MATCH_FOUND`,
                  title: "Etsimäsi kohde löytyi!",
                  body: `Etsimällesi kohteelle "${wanted.title}" löytyi tarjous (${pct} % osuma).`,
                  payload: {
                    match_id: matchId,
                    my_item_id: wanted.id,
                    counterpart_item_id: offer.id,
                    total_score: scoringResult.totalScore
                  }
                }
              ];

              // Lisätään outboxiin (ON CONFLICT deduplication_key DO NOTHING)
              const { error: notifError } = await supabase
                .from("circular_notifications_queue")
                .upsert(notifications, { onConflict: "deduplication_key", ignoreDuplicates: true });

              if (notifError) {
                console.error("Error enqueuing push notification:", notifError);
              }
            }
          }
        }

        // 8. Kuittaa tehtävä valmiiksi fencing tokenilla
        const { data: completeSuccess, error: completeError } = await supabase.rpc(
          "fn_complete_matching_queue_task",
          {
            p_id: queueId,
            p_claim_token: claimToken
          }
        );

        if (completeError || !completeSuccess) {
          console.warn(`fn_complete_matching_queue_task returned false or error for task ${queueId}:`, completeError);
        } else {
          processedCount++;
        }
      } catch (taskErr: unknown) {
        const errorMsg = taskErr instanceof Error ? taskErr.message : String(taskErr);
        console.error(`Task ${queueId} failed:`, errorMsg);

        // KORJAUS: Oikea parametrin nimi p_error (aiemmin virheellinen p_error_message)
        await supabase.rpc("fn_fail_matching_queue_task", {
          p_id: queueId,
          p_claim_token: claimToken,
          p_error: errorMsg
        });
      }
    }

    return new Response(
      JSON.stringify({
        status: "success",
        processed_tasks: processedCount,
        matches_found: matchesCreatedCount
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (globalErr: unknown) {
    const errorMsg = globalErr instanceof Error ? globalErr.message : String(globalErr);
    console.error("Unhandled error in process-matching-queue:", errorMsg);
    return new Response(JSON.stringify({ error: errorMsg }), {
      status: 500,
      headers: CORS_HEADERS
    });
  }
});

function mapDbRowToCircularItem(row: Record<string, any>): CircularItem {
  const attrArray = Array.isArray(row.circular_item_attributes)
    ? row.circular_item_attributes
    : row.circular_item_attributes
    ? [row.circular_item_attributes]
    : [];

  // Muunnetaan EAV-rivit (attribute_key, value_text, value_number, unit) CircularItemAttributes-objektiksi
  const parsedAttrs: CircularItemAttributes = {};
  for (const attr of attrArray) {
    const k = attr.attribute_key;
    if (k === "category_code") parsedAttrs.category_code = attr.value_text;
    else if (k === "resource_category") parsedAttrs.resource_category = attr.value_text;
    else if (k === "taxonomy_term") parsedAttrs.taxonomy_term = attr.value_text;
    else if (k === "material") parsedAttrs.material = attr.value_text;
    else if (k === "color") parsedAttrs.color = attr.value_text;
    else if (k === "quantity") {
      parsedAttrs.quantity = attr.value_number != null ? Number(attr.value_number) : null;
      parsedAttrs.unit = attr.unit ?? null;
    }
    else if (k === "dimension_length_mm") parsedAttrs.dimension_length_mm = attr.value_number != null ? Number(attr.value_number) : null;
    else if (k === "dimension_width_mm") parsedAttrs.dimension_width_mm = attr.value_number != null ? Number(attr.value_number) : null;
    else if (k === "dimension_height_mm") parsedAttrs.dimension_height_mm = attr.value_number != null ? Number(attr.value_number) : null;
    else if (k === "weight_kg") parsedAttrs.weight_kg = attr.value_number != null ? Number(attr.value_number) : null;
  }

  return {
    id: row.id,
    item_type: row.item_type,
    title: row.title,
    description: row.description,
    status: row.status,
    place_id: row.place_id,
    place_name_snapshot: row.place_name_snapshot,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    radius_meters: Number(row.radius_meters ?? 5000),
    deadline_at: row.deadline_at,
    price_eur: Number(row.price_eur ?? 0),
    condition: row.condition,
    preferred_pickup: row.preferred_pickup ?? "EITHER",
    firebase_uid: row.firebase_uid,
    user_id: row.user_id,
    contact_info: row.contact_info,
    attributes: parsedAttrs
  };
}
