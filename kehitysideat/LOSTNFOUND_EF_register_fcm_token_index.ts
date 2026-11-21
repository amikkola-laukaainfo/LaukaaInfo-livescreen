// ============================================================================
// LostReFound Circular Economy - Vaihe 2B: register-fcm-token
// Polku: supabase/functions/register-fcm-token/index.ts
//
// TEHTÄVÄ:
//   Gateway-rajapinta mobiililaitteiden FCM-rekisteröintitokeneiden hallintaan.
//   1. Todentaa käyttäjän Firebase ID Tokenin.
//   2. Rekisteröi laitteen tokenin käyttäjälle (REGISTER) tai poistaa sen käytöstä (UNREGISTER).
//   3. Tukee useaa laitetta samalle Firebase UID:lle.
//
// KÄYTTÖÖNOTTO:
//   supabase functions deploy register-fcm-token --no-verify-jwt
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
    const { action = "REGISTER", registration_token, platform = "android", device_id } = body;

    if (!registration_token || typeof registration_token !== "string" || registration_token.trim().length < 10) {
      return new Response(
        JSON.stringify({ error: "Missing or invalid registration_token" }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const validPlatforms = ["android", "ios", "web"];
    const targetPlatform = validPlatforms.includes(platform) ? platform : "android";

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const nowIso = new Date().toISOString();

    if (action === "REGISTER") {
      // Upsert: Jos token oli jo käyttäjällä, aktivoidaan se uudelleen ja päivitetään last_seen
      const { data, error } = await supabase
        .from("user_fcm_tokens")
        .upsert(
          {
            firebase_uid: verifiedUser.uid,
            registration_token: registration_token.trim(),
            platform: targetPlatform,
            device_id: device_id ? String(device_id).trim() : null,
            is_active: true,
            last_seen_at: nowIso,
            updated_at: nowIso
          },
          { onConflict: "firebase_uid,registration_token" }
        )
        .select("id, is_active, updated_at")
        .single();

      if (error) {
        console.error("Error registering FCM token:", error);
        return new Response(JSON.stringify({ error: "Failed to register token", details: error.message }), {
          status: 500,
          headers: CORS_HEADERS
        });
      }

      return new Response(
        JSON.stringify({ success: true, action: "REGISTERED", token_id: data?.id }),
        { status: 200, headers: CORS_HEADERS }
      );
    } else if (action === "UNREGISTER") {
      // Merkitään passiiviseksi kyseisen käyttäjän kyseinen laitetoken
      const { error } = await supabase
        .from("user_fcm_tokens")
        .update({ is_active: false, updated_at: nowIso })
        .eq("firebase_uid", verifiedUser.uid)
        .eq("registration_token", registration_token.trim());

      if (error) {
        console.error("Error unregistering FCM token:", error);
        return new Response(JSON.stringify({ error: "Failed to unregister token", details: error.message }), {
          status: 500,
          headers: CORS_HEADERS
        });
      }

      return new Response(
        JSON.stringify({ success: true, action: "UNREGISTERED" }),
        { status: 200, headers: CORS_HEADERS }
      );
    }

    return new Response(JSON.stringify({ error: "Invalid action. Use REGISTER or UNREGISTER." }), {
      status: 400,
      headers: CORS_HEADERS
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("Unhandled error in register-fcm-token:", errorMsg);
    return new Response(JSON.stringify({ error: errorMsg }), {
      status: 500,
      headers: CORS_HEADERS
    });
  }
});
