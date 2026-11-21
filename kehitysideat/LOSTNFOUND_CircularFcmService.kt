package fi.mediazoo.lostrefound.circular

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings
import android.util.Log
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import fi.mediazoo.lostrefound.MainActivity
import fi.mediazoo.lostrefound.R
import fi.mediazoo.lostrefound.SupabaseService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

// ============================================================================
// CircularFcmService
//
// Vastaanottaa Firebase Cloud Messaging -push-ilmoitukset CIRCULAR-matcheille.
//
// Tärkeää arkkitehtuuriperiaatteesta:
//   FCM on ilmoituskanava, ei tietokanta.
//   Push-ilmoitus näyttää viestin käyttäjälle — matchin oikea tila haetaan
//   aina Supabasesta CircularRepository.loadMyMatches():n kautta.
//   Jos push jää saamatta, match löytyy silti sovelluksen avautuessa.
// ============================================================================

class CircularFcmService : FirebaseMessagingService() {

    private val TAG = "CircularFcmService"

    companion object {
        const val CHANNEL_ID = "circular_matches"
        const val CHANNEL_NAME = "Kiertotalous-matchit"
        const val EXTRA_MATCH_ID   = "match_id"
        const val EXTRA_TARGET_SCREEN = "TARGET_SCREEN"
        const val SCREEN_CIRCULAR_MATCHES = "CIRCULAR_MATCHES"
    }

    // ------------------------------------------------------------------------
    // onNewToken: Firebase antaa uuden tokenin kun laite rekisteröityy uudelleen
    // ------------------------------------------------------------------------

    /**
     * Kutsutaan kun FCM-token uusiutuu.
     * Tallennetaan uusi token SharedPreferencesiin ja rekisteröidään palvelimelle
     * heti jos käyttäjä on kirjautunut.
     */
    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.d(TAG, "FCM-token uusiutunut: ${token.take(20)}...")

        // Tallennetaan token odottamaan kirjautumista
        val prefs = getSharedPreferences("circular_fcm", Context.MODE_PRIVATE)
        prefs.edit().putString("pending_fcm_token", token).apply()

        // Yritetään rekisteröidä heti jos käyttäjä on kirjautunut
        val firebaseUser = com.google.firebase.auth.FirebaseAuth.getInstance().currentUser
        if (firebaseUser != null) {
            registerTokenToServer(token)
        } else {
            Log.d(TAG, "Käyttäjä ei kirjautunut — FCM-token odottaa kirjautumista")
        }
    }

    // ------------------------------------------------------------------------
    // onMessageReceived: Saapuva push-ilmoitus
    // ------------------------------------------------------------------------

    /**
     * Kutsutaan kun FCM-ilmoitus saapuu sovelluksen ollessa etualalla tai taustalla.
     *
     * Data-payload:
     *   notification_type : "MATCH_FOUND" | "MATCH_ACCEPTED" | "MATCH_REJECTED" | ...
     *   match_id          : UUID
     *   title             : Ilmoituksen otsikko (Edge Function täyttää)
     *   body              : Ilmoituksen teksti
     */
    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)
        Log.d(TAG, "FCM-viesti vastaanotettu. Data: ${message.data}")

        val data            = message.data
        val notificationType = data["notification_type"] ?: ""
        val matchId         = data["match_id"]
        val title           = message.notification?.title ?: data["title"] ?: titleForType(notificationType)
        val body            = message.notification?.body  ?: data["body"]  ?: bodyForType(notificationType)

        // Näytetään paikallinen ilmoitus vain CIRCULAR-tyypeille
        if (notificationType.startsWith("MATCH_") || notificationType.startsWith("CIRCULAR_")) {
            showNotification(title, body, matchId, notificationType)
        } else {
            Log.d(TAG, "Ei-CIRCULAR ilmoitus ohitetaan: $notificationType")
        }
    }

    // ------------------------------------------------------------------------
    // Paikallisen ilmoituksen näyttäminen
    // ------------------------------------------------------------------------

    private fun showNotification(
        title: String,
        body: String,
        matchId: String?,
        notificationType: String
    ) {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        ensureChannelExists(manager)

        // Intent avaa sovelluksen CIRCULAR_MATCHES-näkymään
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra(EXTRA_TARGET_SCREEN, SCREEN_CIRCULAR_MATCHES)
            matchId?.let { putExtra(EXTRA_MATCH_ID, it) }
        }

        val pendingIntent = PendingIntent.getActivity(
            this,
            matchId.hashCode(),   // uniikki requestCode matchin perusteella
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()

        // Käytetään matchId-pohjaista notificationId:tä jotta saman matchin
        // päivitysilmoitukset korvaavat toisensa
        val notificationId = matchId?.hashCode() ?: notificationType.hashCode()
        manager.notify(notificationId, notification)

        Log.d(TAG, "Ilmoitus näytetty: $title | match=$matchId | type=$notificationType")
    }

    private fun ensureChannelExists(manager: NotificationManager) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Kiertotalousilmoitusten matchit ja hyväksynnät"
            }
            manager.createNotificationChannel(channel)
        }
    }

    // ------------------------------------------------------------------------
    // FCM-tokenin rekisteröinti palvelimelle
    // ------------------------------------------------------------------------

    private fun registerTokenToServer(token: String) {
        val deviceId = Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID)
        Log.d(TAG, "Rekisteröidään FCM-token palvelimelle, device: $deviceId")

        // Luodaan repository tilapäisesti rekisteröintiä varten
        // (ViewModel ei ole saatavilla Service-kontekstissa)
        val supabaseService = SupabaseService(
            applicationContext,
            supabaseUrl = "https://usswojtlvrnqtzwnffpg.supabase.co",
            supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzc3dvanRsdnJucXR6d25mZnBnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxOTY4NjUsImV4cCI6MjA3Mzc3Mjg2NX0.U9CODvTikNmERjA9mwHZ8z3tfJ0JDrzknhY4aCA3DTg"
        )
        val repo = CircularRepository(supabaseService)

        // Ajetaan coroutinessa — Service ei tue suspend-funktioita suoraan
        CoroutineScope(Dispatchers.IO).launch {
            try {
                repo.registerFcmToken(token, deviceId)
                // Merkitään tallennettu token rekisteröidyksi
                val prefs = getSharedPreferences("circular_fcm", Context.MODE_PRIVATE)
                prefs.edit()
                    .putString("registered_fcm_token", token)
                    .remove("pending_fcm_token")
                    .apply()
                Log.d(TAG, "FCM-token rekisteröity palvelimelle onnistuneesti")
            } catch (e: Exception) {
                Log.e(TAG, "FCM-token rekisteröinti palvelimelle epäonnistui", e)
            }
        }
    }

    // ------------------------------------------------------------------------
    // Ilmoitustekstit ilmoitustyypin perusteella
    // ------------------------------------------------------------------------

    private fun titleForType(type: String) = when (type) {
        "MATCH_FOUND"      -> "Uusi kiertotalousosuma!"
        "MATCH_ACCEPTED"   -> "Osapuoli hyväksyi kohtaamisen"
        "MATCH_MUTUAL"     -> "Kohtaaminen vahvistettu! 🎉"
        "MATCH_REJECTED"   -> "Match hylätty"
        "MATCH_EXPIRED"    -> "Match vanhentui"
        else               -> "Kiertotalousilmoitus"
    }

    private fun bodyForType(type: String) = when (type) {
        "MATCH_FOUND"      -> "Tarjonnallesi löytyi sopiva tarvitsija."
        "MATCH_ACCEPTED"   -> "Odotetaan vielä toisen osapuolen hyväksyntää."
        "MATCH_MUTUAL"     -> "Molemmat osapuolet ovat hyväksyneet. Noutotiedot on jaettu."
        "MATCH_REJECTED"   -> "Toinen osapuoli hylkäsi ehdotuksen."
        "MATCH_EXPIRED"    -> "Match vanhentui ilman hyväksyntää."
        else               -> "Avaa sovellus nähdäksesi lisätiedot."
    }
}

