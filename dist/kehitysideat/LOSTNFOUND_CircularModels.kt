package fi.mediazoo.lostrefound.circular

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// ============================================================================
// CIRCULAR ECONOMY – Tietomalleja (Android)
// Polku: circular/CircularModels.kt
//
// Nämä data-luokat vastaavat Supabasen tietokantarakennetta ja Edge Function
// -rajapintoja. Muutoksia tehtäessä katso vastaava SQL-migraatio:
//   supabase/migrations/20261120_circular_economy_phase2b.sql
// ============================================================================

// ----------------------------------------------------------------------------
// 1. ILMOITUSTEN TYYPIT JA TILAT
// ----------------------------------------------------------------------------

enum class CircularItemType(val value: String) {
    OFFER("OFFER"),
    WANTED("WANTED");
    companion object { fun fromValue(v: String) = entries.firstOrNull { it.value == v } ?: OFFER }
}

enum class CircularItemStatus(val value: String) {
    ACTIVE("ACTIVE"),
    RESERVED("RESERVED"),
    FULFILLED("FULFILLED"),
    EXPIRED("EXPIRED"),
    DELETED("DELETED");
    companion object { fun fromValue(v: String) = entries.firstOrNull { it.value == v } ?: ACTIVE }
}

enum class CircularMatchStatus(val value: String) {
    POTENTIAL("POTENTIAL"),
    NOTIFIED("NOTIFIED"),
    ACCEPTED("ACCEPTED"),
    RESERVED("RESERVED"),
    FULFILLED("FULFILLED"),
    REJECTED("REJECTED"),
    EXPIRED("EXPIRED"),
    CANCELLED("CANCELLED");
    companion object { fun fromValue(v: String) = entries.firstOrNull { it.value == v } ?: POTENTIAL }
}

enum class PickupMode(val value: String) {
    DIRECT("DIRECT"),
    STORAGE("STORAGE");
    companion object { fun fromValue(v: String) = entries.firstOrNull { it.value == v } ?: DIRECT }
}

// ----------------------------------------------------------------------------
// 2. SUBMIT-CIRCULAR-ITEM – Pyyntö Edge Functionille
// ----------------------------------------------------------------------------

@Serializable
data class SubmitCircularItemRequest(
    @SerialName("item_type")        val itemType: String,          // "OFFER" | "WANTED"
    @SerialName("title")            val title: String,
    @SerialName("description")      val description: String? = null,
    @SerialName("place_id")         val placeId: String? = null,
    @SerialName("place_name_snapshot") val placeNameSnapshot: String? = null,
    @SerialName("latitude")         val latitude: Double,
    @SerialName("longitude")        val longitude: Double,
    @SerialName("radius_meters")    val radiusMeters: Double = 10000.0,
    @SerialName("deadline_at")      val deadlineAt: String? = null,  // ISO 8601
    @SerialName("price_eur")        val priceEur: Double = 0.0,
    @SerialName("condition")        val condition: String? = null,    // "NEW"|"GOOD"|"FAIR"|"FOR_PARTS"
    @SerialName("preferred_pickup") val preferredPickup: String = "EITHER", // "DIRECT_ONLY"|"STORAGE_OK"|"EITHER"
    @SerialName("contact_info")     val contactInfo: String? = null,
    @SerialName("image_urls")       val imageUrls: List<String> = emptyList(),
    @SerialName("attributes")       val attributes: List<CircularAttributeInput> = emptyList(),
    @SerialName("actor_id")         val actorId: String? = null,
    @SerialName("actor_code")       val actorCode: String? = null,
    @SerialName("actor_tier")       val actorTier: String? = null,
    @SerialName("storage_node_id")  val storageNodeId: String? = null,
    @SerialName("exchange_type")    val exchangeType: String = "FREE",
    @SerialName("price_amount")     val priceAmount: Double? = null,
    @SerialName("exchange_description") val exchangeDescription: String? = null
)

@Serializable
data class CircularAttributeInput(
    @SerialName("attribute_key") val attributeKey: String,
    @SerialName("value_text")    val valueText: String? = null,
    @SerialName("value_number")  val valueNumber: Double? = null,
    @SerialName("unit")          val unit: String? = null
)

@Serializable
data class SubmitCircularItemResponse(
    @SerialName("success")  val success: Boolean = false,
    @SerialName("item_id")  val itemId: String? = null,
    @SerialName("error")    val error: String? = null
)

// ----------------------------------------------------------------------------
// 3. RESPOND-TO-MATCH – Hyväksyntä / Hylkäys
// ----------------------------------------------------------------------------

@Serializable
data class RespondToMatchRequest(
    @SerialName("match_id") val matchId: String,
    @SerialName("action")   val action: String,  // "ACCEPT" | "REJECT"
    @SerialName("reason")   val reason: String? = null
)

@Serializable
data class RespondToMatchResponse(
    @SerialName("success")           val success: Boolean = false,
    @SerialName("action")            val action: String? = null,
    @SerialName("status")            val status: String? = null,
    @SerialName("is_mutual")         val isMutual: Boolean = false,
    @SerialName("offer_accepted_at") val offerAcceptedAt: String? = null,
    @SerialName("wanted_accepted_at")val wantedAcceptedAt: String? = null,
    @SerialName("offer_uid")         val offerUid: String? = null,
    @SerialName("wanted_uid")        val wantedUid: String? = null,
    @SerialName("offer_title")       val offerTitle: String? = null,
    @SerialName("wanted_title")      val wantedTitle: String? = null,
    @SerialName("error")             val error: String? = null
)

// ----------------------------------------------------------------------------
// 4. REGISTER-FCM-TOKEN
// ----------------------------------------------------------------------------

@Serializable
data class RegisterFcmTokenRequest(
    @SerialName("registration_token") val registrationToken: String,
    @SerialName("platform")           val platform: String = "android",
    @SerialName("device_id")          val deviceId: String,
    @SerialName("action")             val action: String = "register" // "register" | "unregister"
)

@Serializable
data class RegisterFcmTokenResponse(
    @SerialName("success") val success: Boolean = false,
    @SerialName("action")  val action: String? = null,
    @SerialName("error")   val error: String? = null
)

// ----------------------------------------------------------------------------
// 5. MATCH-TIETUE – Käyttöliittymää varten
// ----------------------------------------------------------------------------

data class CircularMatch(
    val id: String,
    val offerItemId: String,
    val wantedItemId: String,
    val status: CircularMatchStatus,
    val totalScore: Double,
    val matchConfidence: Double,
    val fulfillmentScore: Double,
    val pickupMode: PickupMode,
    val offerTitle: String?,       // liitetty circular_items-kyselystä
    val wantedTitle: String?,
    val offerOwnerUid: String?,
    val wantedOwnerUid: String?,
    val offerAcceptedAt: String?,
    val wantedAcceptedAt: String?,
    val lastEvaluatedAt: String?,
    val updatedAt: String?
) {
    /** Onko kirjautunut käyttäjä OFFER-osapuoli tässä matchissa */
    fun isOfferSide(currentUid: String) = offerOwnerUid == currentUid

    /** Onko kirjautunut käyttäjä WANTED-osapuoli tässä matchissa */
    fun isWantedSide(currentUid: String) = wantedOwnerUid == currentUid

    /** Onko oma puoli jo hyväksytty */
    fun hasCurrentUserAccepted(currentUid: String): Boolean = when {
        isOfferSide(currentUid)  -> offerAcceptedAt != null
        isWantedSide(currentUid) -> wantedAcceptedAt != null
        else -> false
    }

    /** Näytettävä tila suomeksi */
    val statusLabel: String get() = when (status) {
        CircularMatchStatus.POTENTIAL  -> "Ehdokas"
        CircularMatchStatus.NOTIFIED   -> "Ilmoitettu"
        CircularMatchStatus.ACCEPTED   -> "Hyväksytty"
        CircularMatchStatus.RESERVED   -> "Varattu"
        CircularMatchStatus.FULFILLED  -> "Toteutunut"
        CircularMatchStatus.REJECTED   -> "Hylätty"
        CircularMatchStatus.EXPIRED    -> "Vanhentunut"
        CircularMatchStatus.CANCELLED  -> "Peruutettu"
    }
}

// ----------------------------------------------------------------------------
// 6. CIRCULAR ITEM – Käyttöliittymää varten
// ----------------------------------------------------------------------------

data class CircularItem(
    val id: String,
    val firebaseUid: String,
    val itemType: CircularItemType,
    val title: String,
    val description: String?,
    val status: CircularItemStatus,
    val latitude: Double,
    val longitude: Double,
    val radiusMeters: Double,
    val placeId: String?,
    val placeNameSnapshot: String?,
    val deadlineAt: String?,
    val condition: String?,
    val preferredPickup: String,
    val priceEur: Double,
    val imageUrls: List<String> = emptyList(),
    val actorId: String? = null,
    val actorCode: String? = null,
    val actorTier: String? = null,
    val storageNodeId: String? = null,
    val exchangeType: String? = "FREE",
    val priceAmount: Double? = null,
    val exchangeDescription: String? = null,
    val createdAt: String,
    val updatedAt: String
)

// ----------------------------------------------------------------------------
// 7. LAUKAAINFO PROFILOINTI & TOIMIJA (CIRCULAR ACTOR)
// ----------------------------------------------------------------------------

enum class CircularActorTier(val value: String, val label: String) {
    INDIVIDUAL("INDIVIDUAL", "Yksityishenkilö"),
    VERIFIED_ACTIVE("VERIFIED_ACTIVE", "Vahvistettu toimija"),
    ORGANIZATION("ORGANIZATION", "Organisaatio / Yritys");

    companion object {
        fun fromValue(v: String?) = entries.firstOrNull { it.value.equals(v, ignoreCase = true) } ?: INDIVIDUAL
    }
}

@Serializable
data class CircularActor(
    @SerialName("id")                   val id: String,
    @SerialName("actor_code")           val actorCode: String,
    @SerialName("display_name")         val displayName: String,
    @SerialName("actor_tier")           val actorTier: String = "INDIVIDUAL",
    @SerialName("organization_id")      val organizationId: String? = null,
    @SerialName("organization_name")    val organizationName: String? = null,
    @SerialName("municipality")         val municipality: String = "Laukaa",
    @SerialName("phone_verified")       val phoneVerified: Boolean = false,
    @SerialName("is_membership_active") val isMembershipActive: Boolean = false,
    @SerialName("reputation_score")     val reputationScore: Int = 100,
    @SerialName("is_active")            val isActive: Boolean = true
) {
    val tierEnum: CircularActorTier get() = CircularActorTier.fromValue(actorTier)
}

// ----------------------------------------------------------------------------
// 8. MIKROVARASTOT (CIRCULAR STORAGE NODES)
// ----------------------------------------------------------------------------

@Serializable
data class CircularStorageNode(
    @SerialName("id")                  val id: String,
    @SerialName("place_id")            val placeId: String,
    @SerialName("place_name_snapshot") val placeNameSnapshot: String,
    @SerialName("organization_id")     val organizationId: String? = null,
    @SerialName("name")                val name: String,
    @SerialName("description")         val description: String? = null,
    @SerialName("latitude")            val latitude: Double,
    @SerialName("longitude")           val longitude: Double,
    @SerialName("capacity_status")     val capacityStatus: String = "AVAILABLE", // AVAILABLE, LIMITED, FULL, MAINTENANCE
    @SerialName("is_public")           val isPublic: Boolean = true
)

// ----------------------------------------------------------------------------
// 9. KIINNOSTUSVIESTI (CIRCULAR CONTACTS)
// ----------------------------------------------------------------------------

@Serializable
data class SendInterestRequest(
    @SerialName("item_id")           val itemId: String,
    @SerialName("message")           val message: String,
    @SerialName("sender_actor_code") val senderActorCode: String? = null
)

@Serializable
data class SendInterestResponse(
    @SerialName("success")    val success: Boolean = false,
    @SerialName("contact_id") val contactId: String? = null,
    @SerialName("message")    val message: String? = null,
    @SerialName("error")      val error: String? = null
)

@Serializable
data class CircularContactItem(
    @SerialName("id")                  val id: String,
    @SerialName("item_id")             val itemId: String,
    @SerialName("sender_uid")          val senderUid: String,
    @SerialName("sender_actor_code")   val senderActorCode: String? = null,
    @SerialName("item_owner_uid")      val itemOwnerUid: String,
    @SerialName("message")             val message: String,
    @SerialName("item_type_snapshot")  val itemTypeSnapshot: String,
    @SerialName("item_title_snapshot") val itemTitleSnapshot: String,
    @SerialName("status")              val status: String = "PENDING",
    @SerialName("owner_reply")         val ownerReply: String? = null,
    @SerialName("owner_replied_at")    val ownerRepliedAt: String? = null,
    @SerialName("created_at")          val createdAt: String,
    @SerialName("updated_at")          val updatedAt: String? = null,
    @SerialName("is_incoming")         val isIncoming: Boolean = true
) {
    val isOffer: Boolean get() = itemTypeSnapshot.equals("OFFER", ignoreCase = true)
    val statusLabel: String get() = when (status.uppercase()) {
        "PENDING" -> "Uusi"
        "SEEN"    -> "Luettu"
        "REPLIED" -> "Vastattu"
        "CLOSED"  -> "Suljettu"
        else      -> status
    }
}

// ----------------------------------------------------------------------------
// 10. YLEISET TULOSTYYPIT
// ----------------------------------------------------------------------------

/** Repository-funktioiden palautustyyppi — onnistuminen tai virhesanoma */
sealed class CircularResult<out T> {
    data class Success<T>(val data: T) : CircularResult<T>()
    data class Error(val message: String, val cause: Throwable? = null) : CircularResult<Nothing>()
}

