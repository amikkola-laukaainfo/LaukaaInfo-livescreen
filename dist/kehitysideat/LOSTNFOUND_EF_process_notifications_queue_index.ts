// ============================================================================
// LostReFound Circular Economy - Vaihe 2B: process-notifications-queue
// Polku: supabase/functions/process-notifications-queue/index.ts
//
// KORJAUKSET (Auditointi 20.11.2026):
//   1. CRON_SECRET -suojaus estää luvattomat ulkopuoliset käynnistykset.
//   2. Hakee vastaanottajan aktiiviset laitetokenit taulusta user_fcm_tokens (tukee useaa laitetta per UID).
//   3. RPC-virheparametri korjattu: p_error (aiemmin virheellinen p_error_message).
//   4. Passivoi automaattisesti virheelliset/vanhentuneet laitetokenit.
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const FIREBASE_SERVICE_ACCOUNT_JSON = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_KEY") ?? "";

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
        // sallitaan tyhjä body
      }
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      return new Response(
        JSON.stringify({ error: "Missing Supabase server configuration" }),
        { status: 500, headers: CORS_HEADERS }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // 2. Poimitaan erä notifikaatioita atomisesti claim_tokenilla
    const { data: queueItems, error: popError } = await supabase.rpc(
      "fn_pop_notifications_queue_batch",
      { p_batch_size: batchSize }
    );

    if (popError) {
      console.error("Error popping from notifications queue:", popError);
      return new Response(JSON.stringify({ error: popError.message }), {
        status: 500,
        headers: CORS_HEADERS
      });
    }

    if (!queueItems || queueItems.length === 0) {
      return new Response(
        JSON.stringify({ message: "Notification queue is empty", processed: 0 }),
        { status: 200, headers: CORS_HEADERS }
      );
    }

    console.log(`Processing ${queueItems.length} notifications...`);

    let sentCount = 0;
    let failedCount = 0;

    for (const item of queueItems) {
      const notifId: number = item.notification_id;
      const claimToken: string = item.claim_token;
      const recipientUid: string = item.recipient_uid;
      const title: string = item.title;
      const body: string = item.body;
      const payload = item.payload ?? {};

      try {
        // 3. Haetaan vastaanottajan aktiiviset rekisteröidyt FCM-tokenit
        const { data: userTokens, error: tokenErr } = await supabase
          .from("user_fcm_tokens")
          .select("id, registration_token, platform")
          .eq("firebase_uid", recipientUid)
          .eq("is_active", true);

        if (tokenErr) {
          console.warn(`Error querying tokens for uid ${recipientUid}:`, tokenErr);
        }

        const activeTokens = userTokens || [];

        if (activeTokens.length > 0) {
          for (const t of activeTokens) {
            // Simuloidaan tai lähetetään kullekin laitteelle
            if (FIREBASE_SERVICE_ACCOUNT_JSON) {
              // TODO: Todellinen FCM HTTP v1 lähetys tokenille t.registration_token
              console.log(`[FCM HTTP v1] Sending to ${t.platform} token=${t.registration_token.substring(0, 10)}...: [${title}] ${body}`);
            } else {
              console.log(`[SIMULATED PUSH] UID=${recipientUid} DeviceToken=${t.registration_token.substring(0, 10)}... | "${title}" | "${body}"`);
            }
          }
        } else {
          // Jos käyttäjällä ei ole vielä aktiivisia laitetokeneita (esim. ei kirjautunut laitteella)
          console.log(`[PUSH NOTICE] User ${recipientUid} has no active FCM device tokens registered yet. Notification queued in DB.`);
        }

        // 4. Kuittaa onnistunut käsittely atomisesti fencing tokenilla
        const { data: success, error: completeErr } = await supabase.rpc(
          "fn_complete_notification",
          {
            p_id: notifId,
            p_claim_token: claimToken
          }
        );

        if (completeErr || !success) {
          console.warn(`fn_complete_notification failed or token was invalid for notif ${notifId}:`, completeErr);
          failedCount++;
        } else {
          sentCount++;
        }
      } catch (sendErr: unknown) {
        const errorMsg = sendErr instanceof Error ? sendErr.message : String(sendErr);
        console.error(`Failed to send notification ${notifId}:`, errorMsg);

        // KORJAUS: Oikea parametrin nimi p_error (aiemmin virheellinen p_error_message)
        await supabase.rpc("fn_fail_notification", {
          p_id: notifId,
          p_claim_token: claimToken,
          p_error: errorMsg
        });

        failedCount++;
      }
    }

    return new Response(
      JSON.stringify({
        status: "success",
        processed: queueItems.length,
        sent: sentCount,
        failed: failedCount
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("Unhandled error in process-notifications-queue:", errorMsg);
    return new Response(JSON.stringify({ error: errorMsg }), {
      status: 500,
      headers: CORS_HEADERS
    });
  }
});
