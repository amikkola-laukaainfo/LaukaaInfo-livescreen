// ============================================================================
// LostReFound Circular Economy - Vaihe 2B: respond-to-match
// Polku: supabase/functions/respond-to-match/index.ts
//
// KORJAUKSET (Auditointi 20.11.2026):
//   1. Yhdistetty tietokantatransaktio fn_respond_to_match -RPC-funktiolla.
//   2. Audit-lokiin tallentuu VAIN yksi rivi suoraan käyttäjän UID:lla (ei enää 'system'-tuplariviä).
//   3. Deduplication_key lisätty notifikaatioille estämään tuplaviestit.
//   4. Tiukka omistajuustarkistus tietokantatasolla (vain osapuolet voivat hyväksyä/hylätä).
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
    // 1. Todennetaan käyttäjä varmennetulla Firebase-tokenilla
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
    const { match_id, action, reason } = body;

    if (!match_id || typeof match_id !== "string") {
      return new Response(JSON.stringify({ error: "Missing or invalid match_id" }), {
        status: 400,
        headers: CORS_HEADERS
      });
    }

    if (action !== "ACCEPT" && action !== "REJECT") {
      return new Response(JSON.stringify({ error: "Invalid action. Must be 'ACCEPT' or 'REJECT'." }), {
        status: 400,
        headers: CORS_HEADERS
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // 2. Kutsutaan atomista tietokantafunktiota fn_respond_to_match
    // Tämä asettaa app.current_user_uid -istuntomuuttujan ja tekee hyväksynnän/hylkäyksen
    // yhdessä transaktiossa ilman tupla-audit-rivejä.
    const { data: result, error: rpcError } = await supabase.rpc("fn_respond_to_match", {
      p_match_id: match_id,
      p_action: action,
      p_user_uid: verifiedUser.uid,
      p_reason: reason ? String(reason).trim() : null
    });

    if (rpcError) {
      console.error("Error executing fn_respond_to_match:", rpcError);
      const isForbidden = rpcError.message.includes("Forbidden");
      const isNotFound = rpcError.message.includes("not found");
      return new Response(JSON.stringify({ error: rpcError.message }), {
        status: isForbidden ? 403 : isNotFound ? 404 : 400,
        headers: CORS_HEADERS
      });
    }

    // 3. Tuotetaan tilanteen mukaiset outbox-notifikaatiot deduplication_key:llä
    const isOfferOwner = result.offer_uid === verifiedUser.uid;
    const counterpartUid = isOfferOwner ? result.wanted_uid : result.offer_uid;
    const myItemTitle = isOfferOwner ? result.offer_title : result.wanted_title;
    const counterpartItemTitle = isOfferOwner ? result.wanted_title : result.offer_title;

    if (action === "ACCEPT") {
      if (result.is_mutual) {
        // Molemminpuolinen hyväksyntä (ACCEPTED) -> Ilmoitus molemmille
        const mutualNotifs = [
          {
            recipient_uid: counterpartUid,
            notification_type: "MATCH_ACCEPTED",
            deduplication_key: `match_notif:${match_id}:${counterpartUid}:MUTUAL_ACCEPTED`,
            title: "Kohtaaminen vahvistettu!",
            body: `Molemmat osapuolet ovat hyväksyneet kohteen "${myItemTitle}" siirron. Voitte nyt sopia noudosta!`,
            payload: { match_id, status: "ACCEPTED" }
          },
          {
            recipient_uid: verifiedUser.uid,
            notification_type: "MATCH_ACCEPTED",
            deduplication_key: `match_notif:${match_id}:${verifiedUser.uid}:MUTUAL_ACCEPTED`,
            title: "Kohtaaminen vahvistettu!",
            body: `Hyväksyit kohteen "${counterpartItemTitle}". Molemmat osapuolet ovat nyt vahvistaneet siirron!`,
            payload: { match_id, status: "ACCEPTED" }
          }
        ];

        await supabase
          .from("circular_notifications_queue")
          .upsert(mutualNotifs, { onConflict: "deduplication_key", ignoreDuplicates: true });
      } else {
        // Vain toinen osapuoli hyväksynyt toistaiseksi -> herätetään toinen osapuoli
        const waitingNotif = {
          recipient_uid: counterpartUid,
          notification_type: "MATCH_ACCEPTED",
          deduplication_key: `match_notif:${match_id}:${counterpartUid}:WAITING_ACCEPTANCE`,
          title: "Vastapuoli hyväksyi kohtaamisen",
          body: `Kohteen "${myItemTitle}" omistaja on hyväksynyt kohtaamisen. Vahvista hyväksyntäsi sovelluksessa!`,
          payload: { match_id, waiting_for: isOfferOwner ? "WANTED" : "OFFER" }
        };

        await supabase
          .from("circular_notifications_queue")
          .upsert([waitingNotif], { onConflict: "deduplication_key", ignoreDuplicates: true });
      }
    } else if (action === "REJECT") {
      // Hylkäysilmoitus vastapuolelle (jos match oli edennyt aiemmin NOTIFIED- tai ACCEPTED-tilaan)
      if (result.previous_status === "NOTIFIED" || result.previous_status === "ACCEPTED") {
        const rejectNotif = {
          recipient_uid: counterpartUid,
          notification_type: "MATCH_REJECTED",
          deduplication_key: `match_notif:${match_id}:${counterpartUid}:REJECTED`,
          title: "Kohtaamisehdotus hylätty",
          body: `Kohteen "${myItemTitle}" ehdotus ei sopinut toiselle osapuolelle.`,
          payload: { match_id, previous_status: result.previous_status }
        };

        await supabase
          .from("circular_notifications_queue")
          .upsert([rejectNotif], { onConflict: "deduplication_key", ignoreDuplicates: true });
      }
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: CORS_HEADERS
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("Unhandled error in respond-to-match:", errorMsg);
    return new Response(JSON.stringify({ error: errorMsg }), {
      status: 500,
      headers: CORS_HEADERS
    });
  }
});
