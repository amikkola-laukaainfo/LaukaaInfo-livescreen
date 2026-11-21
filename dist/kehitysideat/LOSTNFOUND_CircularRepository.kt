package fi.mediazoo.lostrefound.circular

import android.util.Log
import com.google.firebase.auth.FirebaseAuth
import fi.mediazoo.lostrefound.SupabaseService
import io.ktor.client.HttpClient
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.header
import io.ktor.client.request.get
import io.ktor.client.request.patch
import io.ktor.client.request.post
import io.ktor.client.request.delete
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.double
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * CircularRepository
 *
 * Vastuut:
 *  - Hakee Firebase ID Tokenin todennusta varten
 *  - Kutsuu Edge Functioneita Ktorin httpClient-pyynöillä
 *  - Palauttaa CircularResult<T>-tyypin (Success/Error)
 *
 * Ei tiedä käyttöliittymästä eikä ViewModelista.
 * Ei tee matchauspäättelyjä — Supabase on totuuden lähde.
 */
class CircularRepository(
    private val supabaseService: SupabaseService
) {
    private val TAG = "CircularRepository"

    private val baseUrl get() = supabaseService.supabaseUrl
    private val auth = FirebaseAuth.getInstance()

    // Oma http-client, sama rakenne kuin SupabaseService:ssä
    private val httpClient = HttpClient(OkHttp) {
        install(ContentNegotiation) {
            json(Json { ignoreUnknownKeys = true })
        }
    }

    private val json = Json { ignoreUnknownKeys = true }

    // ------------------------------------------------------------------------
    // YKSITYINEN APUFUNKTIO: Firebase ID Token
    // Edge Functionit varmentavat tämän tokenin palvelimella.
    // ------------------------------------------------------------------------

    /**
     * Hakee voimassa olevan Firebase ID Tokenin.
     * Palauttaa null jos käyttäjä ei ole kirjautunut.
     */
    private suspend fun getFirebaseIdToken(): String? = withContext(Dispatchers.IO) {
        try {
            auth.currentUser?.getIdToken(true)?.await()?.token
        } catch (e: Exception) {
            Log.e(TAG, "Firebase ID Token -haku epäonnistui", e)
            null
        }
    }

    // ------------------------------------------------------------------------
    // 1. SUBMIT-CIRCULAR-ITEM — Ilmoituksen jättäminen
    // ------------------------------------------------------------------------

    /**
     * Lähettää uuden OFFER- tai WANTED-ilmoituksen palvelimelle.
     *
     * Edge Function: submit-circular-item
     * Vaatii: kirjautunut Firebase-käyttäjä
     */
    suspend fun submitCircularItem(
        request: SubmitCircularItemRequest
    ): CircularResult<SubmitCircularItemResponse> = withContext(Dispatchers.IO) {
        try {
            val idToken = getFirebaseIdToken()
                ?: return@withContext CircularResult.Error("Käyttäjä ei ole kirjautunut")

            val response = httpClient.post("$baseUrl/functions/v1/submit-circular-item") {
                header("Authorization", "Bearer $idToken")
                contentType(ContentType.Application.Json)
                setBody(json.encodeToString(SubmitCircularItemRequest.serializer(), request))
            }

            val body = response.bodyAsText()
            Log.d(TAG, "submitCircularItem vastaus [${response.status}]: $body")

            if (!response.status.isSuccess()) {
                return@withContext CircularResult.Error(
                    "Palvelin palautti virheen ${response.status.value}: $body"
                )
            }

            val parsed = json.decodeFromString(SubmitCircularItemResponse.serializer(), body)
            if (parsed.success) {
                CircularResult.Success(parsed)
            } else {
                CircularResult.Error(parsed.error ?: "Tuntematon virhe palvelimella")
            }

        } catch (e: Exception) {
            Log.e(TAG, "submitCircularItem epäonnistui", e)
            CircularResult.Error("Verkkovirhe: ${e.message}", e)
        }
    }

    // ------------------------------------------------------------------------
    // 2. RESPOND-TO-MATCH — Hyväksyntä tai hylkäys
    // ------------------------------------------------------------------------

    /**
     * Hyväksyy tai hylkää matchin käyttäjän puolesta.
     *
     * Edge Function: respond-to-match
     * Vaatii: kirjautunut Firebase-käyttäjä joka on matchin osapuoli
     *
     * Palvelin tarkistaa omistajuuden — väärän osapuolen kutsu palautuu virheenä.
     */
    suspend fun respondToMatch(
        matchId: String,
        action: String,     // "ACCEPT" tai "REJECT"
        reason: String? = null
    ): CircularResult<RespondToMatchResponse> = withContext(Dispatchers.IO) {
        try {
            val idToken = getFirebaseIdToken()
                ?: return@withContext CircularResult.Error("Käyttäjä ei ole kirjautunut")

            val requestBody = RespondToMatchRequest(
                matchId = matchId,
                action = action,
                reason = reason
            )

            val response = httpClient.post("$baseUrl/functions/v1/respond-to-match") {
                header("Authorization", "Bearer $idToken")
                contentType(ContentType.Application.Json)
                setBody(json.encodeToString(RespondToMatchRequest.serializer(), requestBody))
            }

            val body = response.bodyAsText()
            Log.d(TAG, "respondToMatch [$action] vastaus [${response.status}]: $body")

            if (!response.status.isSuccess()) {
                return@withContext CircularResult.Error(
                    "Palvelin palautti virheen ${response.status.value}: $body"
                )
            }

            val parsed = json.decodeFromString(RespondToMatchResponse.serializer(), body)
            if (parsed.success) {
                CircularResult.Success(parsed)
            } else {
                CircularResult.Error(parsed.error ?: "Tuntematon virhe hyväksynnässä")
            }

        } catch (e: Exception) {
            Log.e(TAG, "respondToMatch epäonnistui", e)
            CircularResult.Error("Verkkovirhe: ${e.message}", e)
        }
    }

    // ------------------------------------------------------------------------
    // 3. REGISTER-FCM-TOKEN — Laitteen push-tokenin rekisteröinti
    // ------------------------------------------------------------------------

    /**
     * Rekisteröi tai poistaa laitteen FCM-tokenin palvelimella.
     *
     * Edge Function: register-fcm-token
     * Vaatii: kirjautunut Firebase-käyttäjä
     *
     * Kutsu tätä kun:
     *  - Käyttäjä kirjautuu sisään ja FCM-token on saatavilla
     *  - FCM kutsuu onNewToken() (token uusiutui)
     *  - Käyttäjä kirjautuu ulos (action = "unregister")
     */
    suspend fun registerFcmToken(
        registrationToken: String,
        deviceId: String,
        action: String = "register"   // "register" | "unregister"
    ): CircularResult<RegisterFcmTokenResponse> = withContext(Dispatchers.IO) {
        try {
            val idToken = getFirebaseIdToken()
                ?: return@withContext CircularResult.Error("Käyttäjä ei ole kirjautunut")

            val requestBody = RegisterFcmTokenRequest(
                registrationToken = registrationToken,
                deviceId = deviceId,
                action = action
            )

            val response = httpClient.post("$baseUrl/functions/v1/register-fcm-token") {
                header("Authorization", "Bearer $idToken")
                contentType(ContentType.Application.Json)
                setBody(json.encodeToString(RegisterFcmTokenRequest.serializer(), requestBody))
            }

            val body = response.bodyAsText()
            Log.d(TAG, "registerFcmToken [$action] vastaus [${response.status}]: $body")

            if (!response.status.isSuccess()) {
                return@withContext CircularResult.Error(
                    "Palvelin palautti virheen ${response.status.value}: $body"
                )
            }

            val parsed = json.decodeFromString(RegisterFcmTokenResponse.serializer(), body)
            if (parsed.success) {
                CircularResult.Success(parsed)
            } else {
                CircularResult.Error(parsed.error ?: "Token-rekisteröinti epäonnistui")
            }

        } catch (e: Exception) {
            Log.e(TAG, "registerFcmToken epäonnistui", e)
            CircularResult.Error("Verkkovirhe: ${e.message}", e)
        }
    }

    // ------------------------------------------------------------------------
    // 4. MATCHIEN HAKU — Käyttäjän omat matchit
    // ------------------------------------------------------------------------

    /**
     * Hakee käyttäjän omat matchit Supabasen PostgREST-rajapinnasta.
     *
     * Suodattaa matchit joissa kirjautunut käyttäjä on joko OFFER- tai
     * WANTED-osapuoli. Palauttaa vain NOTIFIED/ACCEPTED/RESERVED-tilaiset
     * matchit (POTENTIAL piiloon, käyttäjä ei tarvitse niitä).
     *
     * HUOM: Tämä hakee matchit palvelimelta — ei paikallisesta välimuistista.
     * Push-ilmoitusten tehtävä on käynnistää haku, ei toimia tietokantana.
     */
    suspend fun getMyMatches(
        currentFirebaseUid: String
    ): CircularResult<List<CircularMatch>> = withContext(Dispatchers.IO) {
        try {
            val idToken = getFirebaseIdToken()
                ?: return@withContext CircularResult.Error("Käyttäjä ei ole kirjautunut")

            // Haetaan matchit joissa käyttäjä on jompikumpi osapuoli
            // circular_matches → liitetään circular_items offer- ja wanted-puolelta
            val url = "$baseUrl/rest/v1/rpc/fn_get_my_matches"
            val response = httpClient.post(url) {
                header("Authorization", "Bearer ${getAnonKey()}")
                header("apikey", getAnonKey())
                contentType(ContentType.Application.Json)
                setBody("""{"p_user_uid":"$currentFirebaseUid"}""")
            }

            val body = response.bodyAsText()
            Log.d(TAG, "getMyMatches vastaus [${response.status}]: ${body.take(500)}")

            if (!response.status.isSuccess()) {
                return@withContext CircularResult.Error(
                    "Matchien haku epäonnistui ${response.status.value}: $body"
                )
            }

            val matches = parseMatchesFromJson(body, currentFirebaseUid)
            CircularResult.Success(matches)

        } catch (e: Exception) {
            Log.e(TAG, "getMyMatches epäonnistui", e)
            CircularResult.Error("Verkkovirhe: ${e.message}", e)
        }
    }

    /**
     * Hakee käyttäjän omat ilmoitukset (OFFER ja WANTED).
     */
    suspend fun getMyItems(
        currentFirebaseUid: String
    ): CircularResult<List<CircularItem>> = withContext(Dispatchers.IO) {
        try {
            val idToken = getFirebaseIdToken()
                ?: return@withContext CircularResult.Error("Käyttäjä ei ole kirjautunut")

            val url = "$baseUrl/rest/v1/circular_items" +
                "?firebase_uid=eq.$currentFirebaseUid" +
                "&status=in.(ACTIVE,RESERVED)" +
                "&order=created_at.desc"

            val response = httpClient.get(url) {
                header("Authorization", "Bearer ${getAnonKey()}")
                header("apikey", getAnonKey())
            }

            val body = response.bodyAsText()
            Log.d(TAG, "getMyItems vastaus [${response.status}]: ${body.take(300)}")

            if (!response.status.isSuccess()) {
                return@withContext CircularResult.Error(
                    "Ilmoitusten haku epäonnistui ${response.status.value}: $body"
                )
            }

            val items = parseItemsFromJson(body)
            CircularResult.Success(items)

        } catch (e: Exception) {
            Log.e(TAG, "getMyItems epäonnistui", e)
            CircularResult.Error("Verkkovirhe: ${e.message}", e)
        }
    }

    /**
     * Päivittää ilmoituksen tilan (esim. ACTIVE, RESERVED, FULFILLED, DELETED).
     */
    suspend fun updateItemStatus(
        itemId: String,
        newStatus: String
    ): CircularResult<Unit> = withContext(Dispatchers.IO) {
        try {
            val url = "$baseUrl/rest/v1/circular_items?id=eq.$itemId"
            val response = httpClient.patch(url) {
                header("Authorization", "Bearer ${getAnonKey()}")
                header("apikey", getAnonKey())
                contentType(ContentType.Application.Json)
                setBody("""{"status":"$newStatus"}""")
            }
            if (!response.status.isSuccess()) {
                val body = response.bodyAsText()
                return@withContext CircularResult.Error("Tilan päivitys epäonnistui: $body")
            }
            CircularResult.Success(Unit)
        } catch (e: Exception) {
            Log.e(TAG, "updateItemStatus epäonnistui", e)
            CircularResult.Error("Verkkovirhe: ${e.message}", e)
        }
    }

    /**
     * Merkitsee ilmoituksen poistetuksi (soft-delete: status='DELETED').
     */
    suspend fun deleteItem(
        itemId: String
    ): CircularResult<Unit> = withContext(Dispatchers.IO) {
        updateItemStatus(itemId, "DELETED")
    }

    // ------------------------------------------------------------------------
    // 5. KIINNOSTUSVIESTI – "Olen kiinnostunut" / "Minulla on tämä"
    //    Toimii sekä OFFER- että WANTED-ilmoituksille.
    // ------------------------------------------------------------------------

    /**
     * Lähettää kiinnostumisviestin ilmoittajalle.
     * OFFER: "Olen kiinnostunut noutamaan"
     * WANTED: "Minulla on tätä tavaraa"
     *
     * Tallentaa circular_contacts-tauluun ja lisää push-ilmoituksen
     * ilmoittajalle.
     */
    suspend fun sendInterestMessage(
        itemId: String,
        message: String,
        senderActorCode: String? = null
    ): CircularResult<SendInterestResponse> = withContext(Dispatchers.IO) {
        try {
            val token = getFirebaseIdToken()
                ?: return@withContext CircularResult.Error("Kirjaudu sisään ensin")

            val request = SendInterestRequest(
                itemId          = itemId,
                message         = message,
                senderActorCode = senderActorCode
            )

            val response = httpClient.post("$baseUrl/functions/v1/send-circular-interest") {
                header("Authorization", "Bearer $token")
                contentType(ContentType.Application.Json)
                setBody(request)
            }

            val body = response.bodyAsText()
            Log.d(TAG, "sendInterestMessage [${response.status}]: ${body.take(300)}")

            if (!response.status.isSuccess()) {
                val errObj = runCatching { json.decodeFromString<SendInterestResponse>(body) }.getOrNull()
                return@withContext CircularResult.Error(
                    errObj?.error ?: "Viestin lähetys epäonnistui (${response.status.value})"
                )
            }

            val result = json.decodeFromString<SendInterestResponse>(body)
            if (result.error != null) {
                CircularResult.Error(result.error)
            } else {
                CircularResult.Success(result)
            }

        } catch (e: Exception) {
            Log.e(TAG, "sendInterestMessage epäonnistui", e)
            CircularResult.Error("Verkkovirhe: ${e.message}", e)
        }
    }

    // ------------------------------------------------------------------------
    // 5B. KIINNOSTUSVIESTIEN HAKU JA VASTAAMINEN (Contacts & Messages)
    // ------------------------------------------------------------------------

    /**
     * Hakee käyttäjälle saapuneet ja käyttäjän itse lähettämät kiinnostumisviestit.
     */
    suspend fun getMyContacts(
        currentFirebaseUid: String
    ): CircularResult<List<CircularContactItem>> = withContext(Dispatchers.IO) {
        try {
            val idToken = getFirebaseIdToken()
                ?: return@withContext CircularResult.Error("Käyttäjä ei ole kirjautunut")

            val url = "$baseUrl/rest/v1/rpc/fn_get_my_circular_contacts"
            val response = httpClient.post(url) {
                header("Authorization", "Bearer ${getAnonKey()}")
                header("apikey", getAnonKey())
                contentType(ContentType.Application.Json)
                setBody("""{"p_user_uid":"$currentFirebaseUid"}""")
            }

            val body = response.bodyAsText()
            Log.d(TAG, "getMyContacts vastaus [${response.status}]: ${body.take(500)}")

            if (!response.status.isSuccess()) {
                return@withContext CircularResult.Error(
                    "Viestien haku epäonnistui ${response.status.value}: $body"
                )
            }

            val contacts = parseContactsFromJson(body)
            CircularResult.Success(contacts)
        } catch (e: Exception) {
            Log.e(TAG, "getMyContacts epäonnistui", e)
            CircularResult.Error("Verkkovirhe viestien haussa: ${e.message}", e)
        }
    }

    /**
     * Päivittää yhteydenoton tilan (esim. SEEN, REPLIED, CLOSED) ja tallentaa vastauksen.
     */
    suspend fun updateContactStatus(
        contactId: String,
        currentFirebaseUid: String,
        status: String,
        reply: String? = null
    ): CircularResult<Unit> = withContext(Dispatchers.IO) {
        try {
            val idToken = getFirebaseIdToken()
                ?: return@withContext CircularResult.Error("Käyttäjä ei ole kirjautunut")

            val url = "$baseUrl/rest/v1/rpc/fn_update_circular_contact_status"
            val jsonBody = buildString {
                append("{")
                append("\"p_contact_id\":\"$contactId\",")
                append("\"p_user_uid\":\"$currentFirebaseUid\",")
                append("\"p_status\":\"$status\"")
                if (reply != null) {
                    append(",\"p_reply\":\"${reply.replace("\"", "\\\"").replace("\n", "\\n")}\"")
                }
                append("}")
            }

            val response = httpClient.post(url) {
                header("Authorization", "Bearer ${getAnonKey()}")
                header("apikey", getAnonKey())
                contentType(ContentType.Application.Json)
                setBody(jsonBody)
            }

            val body = response.bodyAsText()
            Log.d(TAG, "updateContactStatus [${response.status}]: $body")

            if (!response.status.isSuccess()) {
                return@withContext CircularResult.Error("Päivitys epäonnistui: $body")
            }

            CircularResult.Success(Unit)
        } catch (e: Exception) {
            Log.e(TAG, "updateContactStatus epäonnistui", e)
            CircularResult.Error("Verkkovirhe tilan päivityksessä: ${e.message}", e)
        }
    }

    // ------------------------------------------------------------------------
    // 6. JULKINEN ILMOITUSSELAUS (Browse)
    // ------------------------------------------------------------------------

    /**
     * Hakee kaikki aktiiviset kiertotalousilmoitukset julkista selausta varten.
     * Ei vaadi käyttäjäkohtaista suodatusta.
     */
    suspend fun getAllActiveItems(
        typeFilter: CircularItemType? = null
    ): CircularResult<List<CircularItem>> = withContext(Dispatchers.IO) {
        try {
            var url = "$baseUrl/rest/v1/circular_items?status=eq.ACTIVE&order=created_at.desc"
            if (typeFilter != null) {
                url += "&item_type=eq.${typeFilter.value}"
            }

            val response = httpClient.get(url) {
                header("Authorization", "Bearer ${getAnonKey()}")
                header("apikey", getAnonKey())
            }

            val body = response.bodyAsText()
            Log.d(TAG, "getAllActiveItems vastaus [${response.status}]: ${body.take(300)}")

            if (!response.status.isSuccess()) {
                return@withContext CircularResult.Error(
                    "Ilmoitusten haku epäonnistui ${response.status.value}: $body"
                )
            }

            val items = parseItemsFromJson(body)
            CircularResult.Success(items)

        } catch (e: Exception) {
            Log.e(TAG, "getAllActiveItems epäonnistui", e)
            CircularResult.Error("Verkkovirhe: ${e.message}", e)
        }
    }

    // ------------------------------------------------------------------------
    // 6. LAUKAAINFO PROFILOINTI & TOIMIJATUNNISTE
    // ------------------------------------------------------------------------

    /**
     * Hakee toimijaprofiilin koodin (esim. 'LI-8K4P-72MX') perusteella.
     */
    suspend fun getActorByCode(
        actorCode: String
    ): CircularResult<CircularActor> = withContext(Dispatchers.IO) {
        try {
            val cleanCode = actorCode.trim().uppercase()
            val url = "$baseUrl/rest/v1/circular_actors?actor_code=eq.$cleanCode&select=*"
            val response = httpClient.get(url) {
                header("Authorization", "Bearer ${getAnonKey()}")
                header("apikey", getAnonKey())
            }
            val body = response.bodyAsText()
            if (!response.status.isSuccess()) {
                return@withContext CircularResult.Error("Virhe toimijahaussa: ${response.status.value}")
            }
            val arr = json.parseToJsonElement(body).jsonArray
            if (arr.isEmpty()) {
                return@withContext CircularResult.Error("Toimijakoodilla '$cleanCode' ei löytynyt profiilia.")
            }
            val actor = json.decodeFromJsonElement(CircularActor.serializer(), arr[0])
            CircularResult.Success(actor)
        } catch (e: Exception) {
            Log.e(TAG, "getActorByCode epäonnistui", e)
            CircularResult.Error("Toimijahaun virhe: ${e.message}", e)
        }
    }

    /**
     * Hakee kirjautuneen käyttäjän linkitetyn toimijaprofiilin Firebase UID:n perusteella.
     */
    suspend fun getActorByFirebaseUid(
        firebaseUid: String
    ): CircularResult<CircularActor?> = withContext(Dispatchers.IO) {
        try {
            val url = "$baseUrl/rest/v1/circular_actors?firebase_uid=eq.$firebaseUid&select=*"
            val response = httpClient.get(url) {
                header("Authorization", "Bearer ${getAnonKey()}")
                header("apikey", getAnonKey())
            }
            val body = response.bodyAsText()
            if (!response.status.isSuccess()) {
                return@withContext CircularResult.Error("Virhe toimijahaussa: ${response.status.value}")
            }
            val arr = json.parseToJsonElement(body).jsonArray
            if (arr.isEmpty()) {
                return@withContext CircularResult.Success(null)
            }
            val actor = json.decodeFromJsonElement(CircularActor.serializer(), arr[0])
            CircularResult.Success(actor)
        } catch (e: Exception) {
            Log.e(TAG, "getActorByFirebaseUid epäonnistui", e)
            CircularResult.Error("Toimijahaun virhe: ${e.message}", e)
        }
    }

    /**
     * Linkittää toimijakoodin nykyisen käyttäjän Firebase UID:hen.
     */
    suspend fun linkActorToFirebase(
        actorCode: String,
        firebaseUid: String
    ): CircularResult<CircularActor> = withContext(Dispatchers.IO) {
        try {
            val cleanCode = actorCode.trim().uppercase()
            val url = "$baseUrl/rest/v1/circular_actors?actor_code=eq.$cleanCode"
            val response = httpClient.patch(url) {
                header("Authorization", "Bearer ${getAnonKey()}")
                header("apikey", getAnonKey())
                header("Prefer", "return=representation")
                contentType(ContentType.Application.Json)
                setBody("""{"firebase_uid": "$firebaseUid"}""")
            }
            val body = response.bodyAsText()
            if (!response.status.isSuccess()) {
                return@withContext CircularResult.Error("Linkitys epäonnistui: ${response.status.value}")
            }
            val arr = json.parseToJsonElement(body).jsonArray
            if (arr.isEmpty()) {
                return@withContext CircularResult.Error("Toimijakoodia ei löytynyt")
            }
            val actor = json.decodeFromJsonElement(CircularActor.serializer(), arr[0])
            CircularResult.Success(actor)
        } catch (e: Exception) {
            Log.e(TAG, "linkActorToFirebase epäonnistui", e)
            CircularResult.Error("Linkitysvirhe: ${e.message}", e)
        }
    }

    // ------------------------------------------------------------------------
    // 7. MIKROVARASTOJEN HAKU
    // ------------------------------------------------------------------------

    /**
     * Hakee aktiiviset mikrovarastot (circular_storage_nodes).
     */
    suspend fun getStorageNodes(): CircularResult<List<CircularStorageNode>> = withContext(Dispatchers.IO) {
        try {
            val url = "$baseUrl/rest/v1/circular_storage_nodes?select=*&is_public=eq.true"
            val response = httpClient.get(url) {
                header("Authorization", "Bearer ${getAnonKey()}")
                header("apikey", getAnonKey())
            }
            val body = response.bodyAsText()
            if (!response.status.isSuccess()) {
                return@withContext CircularResult.Error("Mikrovarastojen haku epäonnistui: ${response.status.value}")
            }
            val arr = json.parseToJsonElement(body).jsonArray
            val list = arr.mapNotNull {
                try { json.decodeFromJsonElement(CircularStorageNode.serializer(), it) }
                catch (e: Exception) { null }
            }
            CircularResult.Success(list)
        } catch (e: Exception) {
            Log.e(TAG, "getStorageNodes epäonnistui", e)
            CircularResult.Error("Mikrovarastojen haun virhe: ${e.message}", e)
        }
    }

    // ------------------------------------------------------------------------
    // YKSITYISET APUFUNKTIOT
    // ------------------------------------------------------------------------

    /**
     * Palauttaa anon-avaimen PostgREST-kutsuihin.
     * Supabase vaatii apikey-headerin REST-rajapinnassa vaikka Authorization olisi asetettu.
     * Anon-avain on julkinen — se ei anna oikeuksia RLS-suojattuihin tauluihin
     * ilman kelvollista JWT:tä Authorization-headerissa.
     */
    private fun getAnonKey() = CIRCULAR_ANON_KEY

    companion object {
        // Sama arvo kuin MainActivity:n SUPABASE_KEY.
        // Pidettäköön tässä vakiona kunnes avaimet siirretään BuildConfig:iin.
        private const val CIRCULAR_ANON_KEY =
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzc3dvanRsdnJucXR6d25mZnBnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxOTY4NjUsImV4cCI6MjA3Mzc3Mjg2NX0.U9CODvTikNmERjA9mwHZ8z3tfJ0JDrzknhY4aCA3DTg"
    }

    /** Parsii JSON-taulukon CircularContactItem-listaksi */
    private fun parseContactsFromJson(jsonStr: String): List<CircularContactItem> {
        return try {
            json.decodeFromString<List<CircularContactItem>>(jsonStr)
        } catch (e: Exception) {
            Log.e(TAG, "parseContactsFromJson epäonnistui", e)
            emptyList()
        }
    }

    /** Parsii JSON-taulukon CircularMatch-listaksi */
    private fun parseMatchesFromJson(json: String, currentUid: String): List<CircularMatch> {
        return try {
            val arr: JsonArray = this.json.parseToJsonElement(json).jsonArray
            arr.mapNotNull { el ->
                try {
                    val o = el.jsonObject
                    CircularMatch(
                        id                = o["id"]?.jsonPrimitive?.content ?: return@mapNotNull null,
                        offerItemId       = o["offer_item_id"]?.jsonPrimitive?.content ?: "",
                        wantedItemId      = o["wanted_item_id"]?.jsonPrimitive?.content ?: "",
                        status            = CircularMatchStatus.fromValue(
                            o["status"]?.jsonPrimitive?.content ?: "POTENTIAL"
                        ),
                        totalScore        = o["total_score"]?.jsonPrimitive?.double ?: 0.0,
                        matchConfidence   = o["match_confidence"]?.jsonPrimitive?.double ?: 0.0,
                        fulfillmentScore  = o["fulfillment_score"]?.jsonPrimitive?.double ?: 0.0,
                        pickupMode        = PickupMode.fromValue(
                            o["pickup_mode"]?.jsonPrimitive?.content ?: "DIRECT"
                        ),
                        offerTitle        = o["offer_title"]?.jsonPrimitive?.content,
                        wantedTitle       = o["wanted_title"]?.jsonPrimitive?.content,
                        offerOwnerUid     = o["offer_uid"]?.jsonPrimitive?.content,
                        wantedOwnerUid    = o["wanted_uid"]?.jsonPrimitive?.content,
                        offerAcceptedAt   = o["offer_accepted_at"]?.jsonPrimitive?.content,
                        wantedAcceptedAt  = o["wanted_accepted_at"]?.jsonPrimitive?.content,
                        lastEvaluatedAt   = o["last_evaluated_at"]?.jsonPrimitive?.content,
                        updatedAt         = o["updated_at"]?.jsonPrimitive?.content
                    )
                } catch (e: Exception) {
                    Log.w(TAG, "Match-rivin parsinta epäonnistui: ${e.message}")
                    null
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "parseMatchesFromJson epäonnistui", e)
            emptyList()
        }
    }

    /** Parsii JSON-taulukon CircularItem-listaksi */
    private fun parseItemsFromJson(json: String): List<CircularItem> {
        return try {
            val arr: JsonArray = this.json.parseToJsonElement(json).jsonArray
            arr.mapNotNull { el ->
                try {
                    val o: JsonObject = el.jsonObject
                    CircularItem(
                        id               = o["id"]?.jsonPrimitive?.content ?: return@mapNotNull null,
                        firebaseUid      = o["firebase_uid"]?.jsonPrimitive?.content ?: "",
                        itemType         = CircularItemType.fromValue(
                            o["item_type"]?.jsonPrimitive?.content ?: "OFFER"
                        ),
                        title            = o["title"]?.jsonPrimitive?.content ?: "",
                        description      = o["description"]?.jsonPrimitive?.content,
                        status           = CircularItemStatus.fromValue(
                            o["status"]?.jsonPrimitive?.content ?: "ACTIVE"
                        ),
                        latitude         = o["latitude"]?.jsonPrimitive?.double ?: 0.0,
                        longitude        = o["longitude"]?.jsonPrimitive?.double ?: 0.0,
                        radiusMeters     = o["radius_meters"]?.jsonPrimitive?.double ?: 10000.0,
                        placeId          = o["place_id"]?.jsonPrimitive?.content,
                        placeNameSnapshot= o["place_name_snapshot"]?.jsonPrimitive?.content,
                        deadlineAt       = o["deadline_at"]?.jsonPrimitive?.content,
                        condition        = o["condition"]?.jsonPrimitive?.content,
                        preferredPickup  = o["preferred_pickup"]?.jsonPrimitive?.content ?: "EITHER",
                        priceEur         = o["price_eur"]?.jsonPrimitive?.double ?: 0.0,
                        imageUrls        = try {
                            o["image_urls"]?.jsonArray?.mapNotNull { it.jsonPrimitive.content } ?: emptyList()
                        } catch (e: Exception) { emptyList() },
                        actorId          = o["actor_id"]?.jsonPrimitive?.content,
                        actorCode        = o["actor_code"]?.jsonPrimitive?.content,
                        actorTier        = o["actor_tier"]?.jsonPrimitive?.content,
                        storageNodeId    = o["storage_node_id"]?.jsonPrimitive?.content,
                        exchangeType     = o["exchange_type"]?.jsonPrimitive?.content ?: "FREE",
                        priceAmount      = o["price_amount"]?.jsonPrimitive?.doubleOrNull,
                        exchangeDescription = o["exchange_description"]?.jsonPrimitive?.content,
                        createdAt        = o["created_at"]?.jsonPrimitive?.content ?: "",
                        updatedAt        = o["updated_at"]?.jsonPrimitive?.content ?: ""
                    )
                } catch (e: Exception) {
                    Log.w(TAG, "Item-rivin parsinta epäonnistui: ${e.message}")
                    null
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "parseItemsFromJson epäonnistui", e)
            emptyList()
        }
    }
}
