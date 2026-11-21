// ============================================================================
// LostReFound - Jaettu Firebase ID Token -varmennusmoduuli Edge Functioneille
// Polku: supabase/functions/_shared/firebase-auth.ts
// Synkronoitu: LaukaaInfo-livescreen/kehitysideat/
// ============================================================================

import * as jose from "https://deno.land/x/jose@v4.13.1/index.ts";

const FIREBASE_PROJECT_ID = Deno.env.get("FIREBASE_PROJECT_ID") ?? "";

const FIREBASE_JWK_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

// Moduulitason JWKS välimuistittaa julkiset avaimet HTTP Cache-Controlin mukaisesti
const JWKS = jose.createRemoteJWKSet(new URL(FIREBASE_JWK_URL));

export interface VerifiedFirebaseUser {
  uid: string;
  email?: string;
  name?: string;
  tokenPayload: jose.JWTPayload;
}

/**
 * Todentaa Authorization-otsakkeen Firebase ID Tokenin.
 * Heittää virheen jos token puuttuu tai on epäkelpo.
 */
export async function verifyFirebaseBearerToken(
  authHeader: string | null
): Promise<VerifiedFirebaseUser> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("Missing or invalid Authorization header (Bearer token required)");
  }

  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    throw new Error("Empty Bearer token");
  }

  if (!FIREBASE_PROJECT_ID) {
    throw new Error("Server misconfiguration: FIREBASE_PROJECT_ID is not configured");
  }

  // Tarkistetaan allekirjoitus ja standardivaatimukset
  const { payload } = await jose.jwtVerify(token, JWKS, {
    issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
    audience: FIREBASE_PROJECT_ID
  });

  const uid = payload.sub;
  if (!uid) {
    throw new Error("Token payload does not contain subject (UID)");
  }

  return {
    uid,
    email: typeof payload.email === "string" ? payload.email : undefined,
    name: typeof payload.name === "string" ? payload.name : undefined,
    tokenPayload: payload
  };
}

