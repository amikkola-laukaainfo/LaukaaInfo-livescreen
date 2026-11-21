package fi.mediazoo.lostrefound.circular

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.firebase.auth.FirebaseAuth
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

// ============================================================================
// CircularViewModel
//
// Vastuut:
//  - Pitää UI:n tarvitsemat tilat (StateFlow)
//  - Delegoi kaiken verkkoliikenteet CircularRepository:lle
//  - Ei tee matchauspäättelyä — Supabase on totuuden lähde
//  - Yksittäiset UI-toiminnot eivät riko toisiaan (erilliset loading-liput)
// ============================================================================

// ----------------------------------------------------------------------------
// UI-tilarakenteet
// ----------------------------------------------------------------------------

data class CircularUiState(
    // Yleiset lataus- ja virhetilat
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val successMessage: String? = null,

    // Käyttäjän ilmoitukset
    val myItems: List<CircularItem> = emptyList(),
    val isLoadingItems: Boolean = false,

    // Matchit
    val myMatches: List<CircularMatch> = emptyList(),
    val isLoadingMatches: Boolean = false,

    // Julkinen selaus (Browse)
    val browseItems: List<CircularItem> = emptyList(),
    val isLoadingBrowse: Boolean = false,

    // Ilmoituksen jättäminen
    val isSubmitting: Boolean = false,
    val lastSubmittedItemId: String? = null,

    // Hyväksyntä / hylkäys
    val isResponding: Boolean = false,
    val lastRespondedMatchId: String? = null,
    val lastRespondResult: RespondToMatchResponse? = null,

    // FCM-token rekisteröinti
    val isFcmRegistered: Boolean = false,

    // LaukaaInfo Toimijaprofiili
    val actorProfile: CircularActor? = null,
    val isLoadingActor: Boolean = false,

    // Mikrovarastot
    val storageNodes: List<CircularStorageNode> = emptyList(),
    val isLoadingStorageNodes: Boolean = false,

    // Kiinnostumisviestit & Yhteydenotot (Contacts)
    val myContacts: List<CircularContactItem> = emptyList(),
    val isLoadingContacts: Boolean = false
)

class CircularViewModel(
    private val repository: CircularRepository
) : ViewModel() {

    private val TAG = "CircularViewModel"
    private val auth = FirebaseAuth.getInstance()

    private val _uiState = MutableStateFlow(CircularUiState())
    val uiState: StateFlow<CircularUiState> = _uiState.asStateFlow()

    // ------------------------------------------------------------------------
    // 1. ILMOITUSTEN LATAUS
    // ------------------------------------------------------------------------

    /**
     * Lataa kirjautuneen käyttäjän omat OFFER- ja WANTED-ilmoitukset.
     * Kutsu esimerkiksi näkymän avautuessa tai pull-to-refresh -eleellä.
     */
    fun loadMyItems() {
        val uid = currentUid() ?: return
        viewModelScope.launch {
            _uiState.update { it.copy(isLoadingItems = true, errorMessage = null) }
            when (val result = repository.getMyItems(uid)) {
                is CircularResult.Success -> {
                    _uiState.update { it.copy(
                        myItems = result.data,
                        isLoadingItems = false
                    )}
                }
                is CircularResult.Error -> {
                    Log.e(TAG, "loadMyItems virhe: ${result.message}")
                    _uiState.update { it.copy(
                        isLoadingItems = false,
                        errorMessage = "Ilmoitusten lataus epäonnistui: ${result.message}"
                    )}
                }
            }
        }
    }

    /**
     * Päivittää käyttäjän oman ilmoituksen tilan (ACTIVE, RESERVED, FULFILLED).
     */
    fun updateItemStatus(itemId: String, newStatus: String, onComplete: (Boolean) -> Unit = {}) {
        viewModelScope.launch {
            when (val res = repository.updateItemStatus(itemId, newStatus)) {
                is CircularResult.Success -> {
                    _uiState.update { state ->
                        state.copy(
                            myItems = state.myItems.map {
                                if (it.id == itemId) it.copy(status = CircularItemStatus.fromValue(newStatus)) else it
                            }
                        )
                    }
                    onComplete(true)
                }
                is CircularResult.Error -> {
                    _uiState.update { it.copy(errorMessage = res.message) }
                    onComplete(false)
                }
            }
        }
    }

    /**
     * Merkitsee ilmoituksen poistetuksi ja poistaa sen listasta.
     */
    fun deleteItem(itemId: String, onComplete: (Boolean) -> Unit = {}) {
        viewModelScope.launch {
            when (val res = repository.deleteItem(itemId)) {
                is CircularResult.Success -> {
                    _uiState.update { state ->
                        state.copy(myItems = state.myItems.filter { it.id != itemId })
                    }
                    onComplete(true)
                }
                is CircularResult.Error -> {
                    _uiState.update { it.copy(errorMessage = res.message) }
                    onComplete(false)
                }
            }
        }
    }

    // ------------------------------------------------------------------------
    // 2B. KIINNOSTUSVIESTI – "Olen kiinnostunut" / "Minulla on tämä"
    //     Toimii sekä OFFER- että WANTED-ilmoituksille.
    // ------------------------------------------------------------------------

    /**
     * Lähettää kiinnostumisviestin ilmoittajalle.
     *
     * @param itemId   Kohde-ilmoituksen UUID
     * @param message  Käyttäjän kirjoittama vapaa viesti
     * @param senderActorCode  Lähettäjän LI-tunniste (valinnainen)
     * @param onResult (success, errorMessage?) -callback UI:lle
     */
    fun sendInterest(
        itemId: String,
        message: String,
        senderActorCode: String? = null,
        onResult: (Boolean, String?) -> Unit = { _, _ -> }
    ) {
        if (message.trim().isEmpty()) {
            onResult(false, "Kirjoita viesti ennen lähettämistä")
            return
        }
        viewModelScope.launch {
            _uiState.update { it.copy(isSubmitting = true, errorMessage = null) }
            when (val res = repository.sendInterestMessage(
                itemId          = itemId,
                message         = message.trim(),
                senderActorCode = senderActorCode
            )) {
                is CircularResult.Success -> {
                    _uiState.update { it.copy(
                        isSubmitting   = false,
                        successMessage = res.data.message ?: "Viestisi on lähetetty ilmoittajalle!"
                    ) }
                    onResult(true, null)
                }
                is CircularResult.Error -> {
                    _uiState.update { it.copy(
                        isSubmitting = false,
                        errorMessage = res.message
                    ) }
                    onResult(false, res.message)
                }
            }
        }
    }

    // ------------------------------------------------------------------------
    // 2. MATCHIEN LATAUS
    // ------------------------------------------------------------------------

    /**
     * Lataa kirjautuneen käyttäjän matchit palvelimelta.
     *
     * Push-ilmoitukset käynnistävät tämän uudelleen — mutta matchin oikea tila
     * haetaan aina palvelimelta, ei push-ilmoituksen sisällöstä.
     */
    fun loadMyMatches() {
        val uid = currentUid() ?: return
        viewModelScope.launch {
            _uiState.update { it.copy(isLoadingMatches = true, errorMessage = null) }
            when (val result = repository.getMyMatches(uid)) {
                is CircularResult.Success -> {
                    _uiState.update { it.copy(
                        myMatches = result.data,
                        isLoadingMatches = false
                    )}
                }
                is CircularResult.Error -> {
                    Log.e(TAG, "loadMyMatches virhe: ${result.message}")
                    _uiState.update { it.copy(
                        isLoadingMatches = false,
                        errorMessage = "Matchien lataus epäonnistui: ${result.message}"
                    )}
                }
            }
        }
    }

    // ------------------------------------------------------------------------
    // 2C. KIINNOSTUSVIESTIEN JA YHTEYDENOTTOJEN LATAUS & VASTAAMINEN
    // ------------------------------------------------------------------------

    /**
     * Lataa käyttäjälle saapuneet ja käyttäjän itse lähettämät kiinnostumisviestit.
     */
    fun loadMyContacts() {
        val uid = currentUid() ?: return
        viewModelScope.launch {
            _uiState.update { it.copy(isLoadingContacts = true, errorMessage = null) }
            when (val result = repository.getMyContacts(uid)) {
                is CircularResult.Success -> {
                    _uiState.update { it.copy(
                        myContacts = result.data,
                        isLoadingContacts = false
                    )}
                }
                is CircularResult.Error -> {
                    Log.e(TAG, "loadMyContacts virhe: ${result.message}")
                    _uiState.update { it.copy(
                        isLoadingContacts = false,
                        errorMessage = "Yhteydenottojen lataus epäonnistui: ${result.message}"
                    )}
                }
            }
        }
    }

    /**
     * Vastaa kiinnostumisviestiin tai merkitsee sen tilan.
     */
    fun replyToContact(
        contactId: String,
        replyText: String,
        onComplete: (Boolean) -> Unit = {}
    ) {
        val uid = currentUid() ?: return
        viewModelScope.launch {
            when (val result = repository.updateContactStatus(
                contactId = contactId,
                currentFirebaseUid = uid,
                status = "REPLIED",
                reply = replyText.trim()
            )) {
                is CircularResult.Success -> {
                    loadMyContacts()
                    onComplete(true)
                }
                is CircularResult.Error -> {
                    _uiState.update { it.copy(errorMessage = "Vastaus epäonnistui: ${result.message}") }
                    onComplete(false)
                }
            }
        }
    }

    /** Lataa ilmoitukset, matchit, toimijaprofiilin ja mikrovarastot */
    fun loadAll() {
        loadMyItems()
        loadMyMatches()
        loadMyContacts()
        loadBrowseItems()
        loadActorProfile()
        loadStorageNodes()
    }

    /**
     * Lataa kaikki aktiiviset kiertotalousilmoitukset julkiseen selausnäkymään.
     */
    fun loadBrowseItems(typeFilter: CircularItemType? = null) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoadingBrowse = true, errorMessage = null) }
            when (val result = repository.getAllActiveItems(typeFilter)) {
                is CircularResult.Success -> {
                    _uiState.update { it.copy(
                        browseItems = result.data,
                        isLoadingBrowse = false
                    )}
                }
                is CircularResult.Error -> {
                    Log.e(TAG, "loadBrowseItems virhe: ${result.message}")
                    _uiState.update { it.copy(
                        isLoadingBrowse = false,
                        errorMessage = "Ilmoitusten selaus epäonnistui: ${result.message}"
                    )}
                }
            }
        }
    }

    // ------------------------------------------------------------------------
    // 3. ILMOITUKSEN JÄTTÄMINEN
    // ------------------------------------------------------------------------

    /**
     * Lähettää uuden OFFER- tai WANTED-ilmoituksen.
     *
     * @param onSuccess Kutsutaan kun ilmoitus on tallennettu — saa item_id:n
     */
    fun submitCircularItem(
        request: SubmitCircularItemRequest,
        onSuccess: (itemId: String) -> Unit = {},
        onError: (message: String) -> Unit = {}
    ) {
        viewModelScope.launch {
            _uiState.update { it.copy(isSubmitting = true, errorMessage = null, successMessage = null) }
            when (val result = repository.submitCircularItem(request)) {
                is CircularResult.Success -> {
                    val itemId = result.data.itemId ?: ""
                    _uiState.update { it.copy(
                        isSubmitting = false,
                        lastSubmittedItemId = itemId,
                        successMessage = "Ilmoitus jätetty onnistuneesti!"
                    )}
                    // Päivitä ilmoituslista automaattisesti
                    loadMyItems()
                    onSuccess(itemId)
                }
                is CircularResult.Error -> {
                    Log.e(TAG, "submitCircularItem virhe: ${result.message}")
                    _uiState.update { it.copy(
                        isSubmitting = false,
                        errorMessage = result.message
                    )}
                    onError(result.message)
                }
            }
        }
    }

    // ------------------------------------------------------------------------
    // 4. HYVÄKSYNTÄ / HYLKÄYS
    // ------------------------------------------------------------------------

    /**
     * Hyväksyy matchin kirjautuneen käyttäjän puolesta.
     *
     * Palvelin tarkistaa omistajuuden — väärän käyttäjän kutsu hylätään.
     * Jos molemmat osapuolet ovat hyväksyneet, vastaus sisältää is_mutual=true.
     */
    fun acceptMatch(
        matchId: String,
        onSuccess: (response: RespondToMatchResponse) -> Unit = {},
        onError: (message: String) -> Unit = {}
    ) {
        respondToMatch(matchId, "ACCEPT", null, onSuccess, onError)
    }

    /**
     * Hylkää matchin kirjautuneen käyttäjän puolesta.
     */
    fun rejectMatch(
        matchId: String,
        reason: String? = null,
        onSuccess: (response: RespondToMatchResponse) -> Unit = {},
        onError: (message: String) -> Unit = {}
    ) {
        respondToMatch(matchId, "REJECT", reason, onSuccess, onError)
    }

    private fun respondToMatch(
        matchId: String,
        action: String,
        reason: String?,
        onSuccess: (RespondToMatchResponse) -> Unit,
        onError: (String) -> Unit
    ) {
        viewModelScope.launch {
            _uiState.update { it.copy(isResponding = true, errorMessage = null) }
            when (val result = repository.respondToMatch(matchId, action, reason)) {
                is CircularResult.Success -> {
                    val response = result.data
                    _uiState.update { it.copy(
                        isResponding = false,
                        lastRespondedMatchId = matchId,
                        lastRespondResult = response,
                        successMessage = when {
                            response.isMutual -> "🎉 Molemmat osapuolet ovat hyväksyneet — kohtaaminen vahvistettu!"
                            action == "ACCEPT" -> "Hyväksyntäsi tallennettu. Odotetaan toista osapuolta."
                            else -> "Match hylätty."
                        }
                    )}
                    // Päivitä matchilista uudella tilalla
                    loadMyMatches()
                    onSuccess(response)
                }
                is CircularResult.Error -> {
                    Log.e(TAG, "respondToMatch virhe: ${result.message}")
                    _uiState.update { it.copy(
                        isResponding = false,
                        errorMessage = result.message
                    )}
                    onError(result.message)
                }
            }
        }
    }

    // ------------------------------------------------------------------------
    // 5. FCM-TOKEN REKISTERÖINTI
    // ------------------------------------------------------------------------

    /**
     * Rekisteröi laitteen FCM-tokenin palvelimelle.
     * Kutsutaan kirjautumisen yhteydessä ja tokenin uusiutuessa.
     */
    fun registerFcmToken(
        registrationToken: String,
        deviceId: String
    ) {
        viewModelScope.launch {
            Log.d(TAG, "Rekisteröidään FCM-token laitteelle: $deviceId")
            when (val result = repository.registerFcmToken(registrationToken, deviceId)) {
                is CircularResult.Success -> {
                    _uiState.update { it.copy(isFcmRegistered = true) }
                    Log.d(TAG, "FCM-token rekisteröity onnistuneesti")
                }
                is CircularResult.Error -> {
                    Log.e(TAG, "FCM-token rekisteröinti epäonnistui: ${result.message}")
                    // Ei näytetä käyttäjälle — push-ilmoitukset ovat lisäarvo, ei vaatimus
                }
            }
        }
    }

    /**
     * Poistaa laitteen FCM-tokenin palvelimelta (uloskirjautuminen).
     */
    fun unregisterFcmToken(
        registrationToken: String,
        deviceId: String
    ) {
        viewModelScope.launch {
            Log.d(TAG, "Poistetaan FCM-token laitteelle: $deviceId")
            repository.registerFcmToken(registrationToken, deviceId, action = "unregister")
            _uiState.update { it.copy(isFcmRegistered = false) }
        }
    }

    // ------------------------------------------------------------------------
    // 6. LAUKAAINFO PROFIILI & TOIMIJA
    // ------------------------------------------------------------------------

    /**
     * Lataa nykyisen käyttäjän linkitetyn toimijaprofiilin (jos sellainen on).
     */
    fun loadActorProfile() {
        val uid = auth.currentUser?.uid ?: return
        viewModelScope.launch {
            _uiState.update { it.copy(isLoadingActor = true) }
            when (val res = repository.getActorByFirebaseUid(uid)) {
                is CircularResult.Success -> {
                    _uiState.update { it.copy(actorProfile = res.data, isLoadingActor = false) }
                }
                is CircularResult.Error -> {
                    Log.w(TAG, "Toimijaprofiilin haku epäonnistui: ${res.message}")
                    _uiState.update { it.copy(isLoadingActor = false) }
                }
            }
        }
    }

    /**
     * Linkittää annetun toimijakoodin (esim. 'LI-8K4P-72MX') nykyiseen käyttäjään.
     */
    fun linkActorCode(code: String, onResult: (Boolean, String?) -> Unit) {
        val uid = auth.currentUser?.uid
        if (uid == null) {
            onResult(false, "Kirjaudu ensin sisään sovellukseen.")
            return
        }
        viewModelScope.launch {
            _uiState.update { it.copy(isLoadingActor = true) }
            when (val res = repository.linkActorToFirebase(code, uid)) {
                is CircularResult.Success -> {
                    _uiState.update { it.copy(
                        actorProfile = res.data,
                        isLoadingActor = false,
                        successMessage = "LaukaaInfo-profiili yhdistetty onnistuneesti!"
                    )}
                    onResult(true, null)
                }
                is CircularResult.Error -> {
                    _uiState.update { it.copy(isLoadingActor = false) }
                    onResult(false, res.message)
                }
            }
        }
    }

    /**
     * Lataa aktiiviset mikrovarastot.
     */
    fun loadStorageNodes() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoadingStorageNodes = true) }
            when (val res = repository.getStorageNodes()) {
                is CircularResult.Success -> {
                    _uiState.update { it.copy(storageNodes = res.data, isLoadingStorageNodes = false) }
                }
                is CircularResult.Error -> {
                    Log.w(TAG, "Mikrovarastojen haku epäonnistui: ${res.message}")
                    _uiState.update { it.copy(isLoadingStorageNodes = false) }
                }
            }
        }
    }

    // ------------------------------------------------------------------------
    // 7. VIESTI- JA VIRHETILOJEN NOLLAUS
    // ------------------------------------------------------------------------

    fun clearMessages() {
        _uiState.update { it.copy(errorMessage = null, successMessage = null) }
    }

    fun clearLastSubmit() {
        _uiState.update { it.copy(lastSubmittedItemId = null) }
    }

    fun clearLastResponse() {
        _uiState.update { it.copy(lastRespondedMatchId = null, lastRespondResult = null) }
    }

    // ------------------------------------------------------------------------
    // YKSITYISET APUFUNKTIOT
    // ------------------------------------------------------------------------

    private fun currentUid(): String? {
        val uid = auth.currentUser?.uid
        if (uid == null) {
            Log.w(TAG, "Käyttäjä ei ole kirjautunut — ohitetaan operaatio")
            _uiState.update { it.copy(errorMessage = "Kirjaudu sisään ensin") }
        }
        return uid
    }
}

