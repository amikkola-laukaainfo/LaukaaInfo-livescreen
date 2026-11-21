// Screen.kt
package fi.mediazoo.lostrefound

enum class Screen {
    LANDING, LIST, MAP, DETAIL, EDIT, ADD, ADMIN, CREATE_EVENT, EVENT_DASHBOARD, CHAT, MY_CHATS, MY_PROFILE,
    MANAGE_ORGANIZATION,
    NEW_OBSERVATION,
    OBSERVATION_FEED,
    OBSERVATION_DETAIL,
    PHENOMENA,
    PHENOMENA_MAP,
    PHENOMENON_DETAIL,
    MORE,
    ORGANIZATION,
    SETTINGS,
    QR_SCANNER,
    STORAGE_LOCATIONS,
    REPORTS,
    WEB_VIEW,
    OBSERVATION_COLLECTION,
    // CIRCULAR Economy
    CIRCULAR_HOME,          // Kiertotalouden etusivu (Tarjoa / Etsi / Omat)
    CIRCULAR_BROWSE,        // Selattavat olemassa olevat ilmoitukset (Feed / Tori)
    CIRCULAR_SUBMIT_OFFER,  // Uuden OFFER-ilmoituksen lomake
    CIRCULAR_SUBMIT_WANTED, // Uuden WANTED-ilmoituksen lomake
    CIRCULAR_MY_ITEMS,      // Omat ilmoitukset (OFFER + WANTED)
    CIRCULAR_MATCHES,       // Saadut matchit ja niiden tila
    CIRCULAR_MATCH_DETAIL   // Yksittäisen matchin tiedot + hyväksyntä
}