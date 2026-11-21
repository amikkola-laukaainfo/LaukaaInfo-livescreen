// ============================================================================
// LostReFound Circular Economy - Vaihe 2B: submit-circular-item
// Polku: supabase/functions/submit-circular-item/index.ts
//
// TEHTÄVÄ:
//   Gateway-rajapinta uusien kiertotalousilmoitusten tallentamiseen.
//   1. Todentaa käyttäjän Firebase ID Tokenin (Google JWK).
//   2. Validoi ilmoituksen tiedot ja attribuutit.
//   3. Tallentaa ilmoituksen (circular_items) ja sen attribuutit EAV-rakenteella
//      (circular_item_attributes: attribute_key, value_text, value_number, unit).
//   4. Tietokannan triggeri trg_circular_item_enqueue asettaa ilmoituksen
//      automaattisesti matchausjonoon (circular_matching_queue).
//
// KÄYTTÖÖNOTTO:
//   supabase functions deploy submit-circular-item --no-verify-jwt
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyFirebaseBearerToken } from "../_shared/firebase-auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Content-Type": "application/json"
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed. Use POST." }), {
      status: 405,
      headers: CORS_HEADERS
    });
  }

  try {
    // 1. Todennetaan Firebase ID Token
    const authHeader = req.headers.get("authorization");
    let verifiedUser;
    try {
      verifiedUser = await verifyFirebaseBearerToken(authHeader);
    } catch (authErr: unknown) {
      const msg = authErr instanceof Error ? authErr.message : String(authErr);
      return new Response(JSON.stringify({ error: "Unauthorized", details: msg }), {
        status: 401,
        headers: CORS_HEADERS
      });
    }

    const body = await req.json();

    // 2. Syötevalidointi
    const {
      item_type,
      title,
      description,
      place_id,
      place_name_snapshot,
      latitude,
      longitude,
      radius_meters,
      deadline_at,
      price_eur,
      condition,
      preferred_pickup,
      contact_info,
      image_urls,
      attributes
    } = body;

    if (!item_type || (item_type !== "OFFER" && item_type !== "WANTED")) {
      return new Response(
        JSON.stringify({ error: "Invalid item_type. Must be 'OFFER' or 'WANTED'." }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    if (!title || typeof title !== "string" || title.trim().length < 3) {
      return new Response(
        JSON.stringify({ error: "Title must be at least 3 characters long." }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const latNum = Number(latitude);
    const lonNum = Number(longitude);
    if (isNaN(latNum) || isNaN(lonNum) || latNum < -90 || latNum > 90 || lonNum < -180 || lonNum > 180) {
      return new Response(
        JSON.stringify({ error: "Invalid coordinates (latitude: -90..90, longitude: -180..180)." }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const radiusNum = Number(radius_meters ?? 5000);
    if (isNaN(radiusNum) || radiusNum <= 0) {
      return new Response(
        JSON.stringify({ error: "radius_meters must be a positive number." }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const priceNum = Number(price_eur ?? 0);
    if (isNaN(priceNum) || priceNum < 0) {
      return new Response(
        JSON.stringify({ error: "price_eur must be non-negative." }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const validConditions = ["NEW", "GOOD", "FAIR", "FOR_PARTS", null, undefined];
    if (!validConditions.includes(condition)) {
      return new Response(
        JSON.stringify({ error: "Invalid condition. Must be NEW, GOOD, FAIR, or FOR_PARTS." }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const validPickups = ["DIRECT_ONLY", "STORAGE_OK", "EITHER", null, undefined];
    if (!validPickups.includes(preferred_pickup)) {
      return new Response(
        JSON.stringify({ error: "Invalid preferred_pickup. Must be DIRECT_ONLY, STORAGE_OK, or EITHER." }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // 3. Tallennetaan ilmoitus tietokantaan service_role -avaimella
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Tarkistetaan onko käyttäjällä linkitetty LaukaaInfo circular_actors -profiili
    const { data: actorProfile } = await supabase
      .from("circular_actors")
      .select("id, actor_code, actor_tier")
      .eq("firebase_uid", verifiedUser.uid)
      .maybeSingle();

    const itemRow = {
      item_type,
      title: title.trim(),
      description: description ? String(description).trim() : null,
      status: "ACTIVE",
      place_id: place_id ? String(place_id) : null,
      place_name_snapshot: place_name_snapshot ? String(place_name_snapshot) : null,
      latitude: latNum,
      longitude: lonNum,
      radius_meters: radiusNum,
      deadline_at: deadline_at ? new Date(deadline_at).toISOString() : null,
      price_eur: priceNum,
      condition: condition || null,
      preferred_pickup: preferred_pickup || "EITHER",
      firebase_uid: verifiedUser.uid,
      contact_info: contact_info ? String(contact_info).trim() : null,
      image_urls: Array.isArray(image_urls) ? image_urls.slice(0, 2) : [],
      actor_id: actorProfile?.id || (body.actor_id ? String(body.actor_id) : null),
      actor_code: actorProfile?.actor_code || (body.actor_code ? String(body.actor_code) : null),
      actor_tier: actorProfile?.actor_tier || (body.actor_tier ? String(body.actor_tier) : "INDIVIDUAL"),
      storage_node_id: body.storage_node_id ? String(body.storage_node_id) : null,
      exchange_type: body.exchange_type ? String(body.exchange_type) : "FREE",
      price_amount: body.price_amount !== undefined && body.price_amount !== null ? Number(body.price_amount) : null,
      exchange_description: body.exchange_description ? String(body.exchange_description).trim() : null,
      transport_preference: body.transport_preference ? String(body.transport_preference) : "PICKUP_BY_RECEIVER"
    };

    const { data: createdItem, error: insertItemError } = await supabase
      .from("circular_items")
      .insert(itemRow)
      .select()
      .single();

    if (insertItemError || !createdItem) {
      console.error("Error inserting circular item:", insertItemError);
      return new Response(
        JSON.stringify({ error: "Database error inserting item", details: insertItemError?.message }),
        { status: 500, headers: CORS_HEADERS }
      );
    }

    // 4. Tallennetaan attribuutit tietokannan EAV-rakenteen mukaisesti
    // (attribute_key, value_text, value_number, unit)
    const savedAttributes: Record<string, any> = {};

    if (attributes && typeof attributes === "object") {
      const eavRows: Array<{
        item_id: string;
        attribute_key: string;
        value_text: string | null;
        value_number: number | null;
        unit: string | null;
      }> = [];

      for (const [key, val] of Object.entries(attributes)) {
        if (val === null || val === undefined) continue;

        if (typeof val === "number") {
          const unit = (key === "quantity" && (attributes as any).unit)
            ? String((attributes as any).unit)
            : (key.endsWith("_mm") ? "mm" : key.endsWith("_kg") ? "kg" : null);

          eavRows.push({
            item_id: createdItem.id,
            attribute_key: key,
            value_text: null,
            value_number: val,
            unit
          });
          savedAttributes[key] = val;
        } else if (typeof val === "string") {
          if (key === "unit") continue;
          eavRows.push({
            item_id: createdItem.id,
            attribute_key: key,
            value_text: val,
            value_number: null,
            unit: null
          });
          savedAttributes[key] = val;
        }
      }

      if (eavRows.length > 0) {
        const { error: attrError } = await supabase
          .from("circular_item_attributes")
          .insert(eavRows);

        if (attrError) {
          console.error("Error inserting EAV attributes:", attrError);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        item: {
          ...createdItem,
          attributes: savedAttributes
        }
      }),
      { status: 201, headers: CORS_HEADERS }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("Unhandled error in submit-circular-item:", errorMsg);
    return new Response(JSON.stringify({ error: errorMsg }), {
      status: 500,
      headers: CORS_HEADERS
    });
  }
});
