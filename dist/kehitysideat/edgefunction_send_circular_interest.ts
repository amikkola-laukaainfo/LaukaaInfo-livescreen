// ============================================================================
// LostReFound Circular Economy – send-circular-interest
// Polku: supabase/functions/send-circular-interest/index.ts
//
// Tehtävä:
//   Vastaanottaa "Olen kiinnostunut" / "Minulla on tämä" -viesti,
//   tallentaa sen circular_contacts-tauluun ja lisää push-ilmoituksen
//   ilmoittajalle circular_notifications_queue:een.
//
// Kutsu:
//   POST /functions/v1/send-circular-interest
//   Authorization: Bearer <firebase-id-token>
//   {
//     "item_id":           "uuid",
//     "message":           "Moi! Olen kiinnostunut...",
//     "sender_actor_code": "LI-8K4P-72MX"   (valinnainen)
//   }
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyFirebaseBearerToken } from "../_shared/firebase-auth.ts";

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")            ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Content-Type": "application/json"
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Käytä POST-pyyntöä." }),
      { status: 405, headers: CORS_HEADERS }
    );
  }

  try {
    // 1. Varmenna Firebase-token
    const authHeader = req.headers.get("authorization");
    let verifiedUser: { uid: string };
    try {
      verifiedUser = await verifyFirebaseBearerToken(authHeader);
    } catch (authErr: unknown) {
      const msg = authErr instanceof Error ? authErr.message : String(authErr);
      return new Response(
        JSON.stringify({ error: "Kirjautuminen vaaditaan", details: msg }),
        { status: 401, headers: CORS_HEADERS }
      );
    }

    // 2. Lue pyyntö
    const body = await req.json();
    const { item_id, message, sender_actor_code } = body;

    if (!item_id || typeof item_id !== "string") {
      return new Response(
        JSON.stringify({ error: "item_id puuttuu tai on virheellinen" }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Viesti ei voi olla tyhjä" }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    if (message.trim().length > 1000) {
      return new Response(
        JSON.stringify({ error: "Viesti on liian pitkä (max 1000 merkkiä)" }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // 3. Atominen tallennus tietokantafunktiolla
    const { data: result, error: rpcError } = await supabase.rpc(
      "fn_send_circular_interest",
      {
        p_item_id:           item_id,
        p_sender_uid:        verifiedUser.uid,
        p_sender_actor_code: sender_actor_code ?? null,
        p_message:           message.trim()
      }
    );

    if (rpcError) {
      console.error("fn_send_circular_interest virhe:", rpcError);
      return new Response(
        JSON.stringify({ error: rpcError.message }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // RPC palauttaa virhetilanteen myös onnistuneen JSON:n sisällä
    if (result?.error) {
      const isOwnItem = result.error.includes("omaan ilmoitukseesi");
      return new Response(
        JSON.stringify({ error: result.error }),
        { status: isOwnItem ? 403 : 400, headers: CORS_HEADERS }
      );
    }

    // 4. Lisää push-ilmoitus ilmoittajalle (outbox-malli)
    const ownerUid   = result.item_owner_uid as string;
    const itemTitle  = result.item_title     as string;
    const itemType   = result.item_type      as string;
    const contactId  = result.contact_id     as string;

    const notifTitle = itemType === "OFFER"
      ? "Joku on kiinnostunut ilmoituksestasi!"
      : "Joku tarjoaa etsimääsi tavaraa!";

    const notifBody = itemType === "OFFER"
      ? `Kohde: "${itemTitle}" – käy katsomassa viesti Matchit-välilehdellä.`
      : `Kohde: "${itemTitle}" – joku tarjoaa sinulle tavaraa. Katso Matchit-välilehdeltä!`;

    const dedupKey = `interest:${contactId}:${ownerUid}`;

    const { error: notifError } = await supabase
      .from("circular_notifications_queue")
      .upsert(
        [{
          recipient_uid:      ownerUid,
          notification_type:  "INTEREST_RECEIVED",
          deduplication_key:  dedupKey,
          title:              notifTitle,
          body:               notifBody,
          payload: {
            contact_id: contactId,
            item_id:    item_id,
            item_type:  itemType,
            screen:     "CONTACTS"
          }
        }],
        { onConflict: "deduplication_key", ignoreDuplicates: true }
      );

    if (notifError) {
      // Ei palauteta virhettä käyttäjälle — tallennus onnistui, ilmoitus voidaan yrittää uudelleen
      console.warn("Notifikaation lisäys epäonnistui:", notifError.message);
    }

    return new Response(
      JSON.stringify({
        success:    true,
        contact_id: contactId,
        message:    "Viestisi on lähetetty ilmoittajalle."
      }),
      { status: 200, headers: CORS_HEADERS }
    );

  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("Käsittelemätön virhe send-circular-interest:", errorMsg);
    return new Response(
      JSON.stringify({ error: errorMsg }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
});
