package fi.mediazoo.lostrefound.circular

// ============================================================================
// CircularSubmitScreen – Uuden OFFER- tai WANTED-ilmoituksen lomake
//
// itemType-parametri määrittää onko kyseessä OFFER vai WANTED.
// Lomakekentät:
//   • Otsikko (pakollinen)
//   • Kuvaus
//   • Kunto (dropdown) – vain OFFER:lle
//   • Nouto-preferenssi (dropdown)
//   • Sijainti (koordinaatit / placeholder)
//   • Säde km (slider)
//   • Deadline (valinnainen – tekstikenttä ISO-muodossa)
//   • Atribuutit: avain + arvo + yksikkö (kevyt EAV-syöttö)
// ============================================================================

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.MyLocation
import androidx.compose.material.icons.filled.Photo
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import fi.mediazoo.lostrefound.CameraDialog
import fi.mediazoo.lostrefound.FirebaseService
import fi.mediazoo.lostrefound.SupabaseService
import fi.mediazoo.lostrefound.model.Place
import fi.mediazoo.lostrefound.ui.components.MapLocationPickerDialog
import fi.mediazoo.lostrefound.ui.components.PlaceSelectionDialog
import kotlinx.coroutines.launch

/** Kynnys säteen valintaan metreinä (1–50 km) */
private const val RADIUS_MIN_KM = 1f
private const val RADIUS_MAX_KM = 50f

private fun getCoordinatesForArea(area: String?): Pair<Double, Double> {
    val clean = area?.substringBefore(" (")?.trim()?.lowercase()
    return when (clean) {
        "laukaa" -> 62.4167 to 25.9500
        "lievestuore" -> 62.2630 to 26.2040
        "jyväskylä" -> 62.2415 to 25.7209
        "muurame" -> 62.1283 to 25.6717
        "äänekoski" -> 62.6044 to 25.7258
        "hankasalmi" -> 62.3892 to 26.4367
        "toivakka" -> 62.0961 to 26.0825
        "petäjävesi" -> 62.2575 to 25.1950
        "helsinki" -> 60.1695 to 24.9354
        "tampere" -> 61.4978 to 23.7610
        "kuopio" -> 62.8924 to 27.6770
        else -> 62.4167 to 25.9500 // Oletus Laukaa
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CircularSubmitScreen(
    itemType: CircularItemType,
    viewModel: CircularViewModel,
    supabaseService: SupabaseService,
    firebaseService: FirebaseService,
    defaultArea: String? = null,
    defaultPlaceId: String? = null,
    defaultPlaceName: String? = null,
    onBack: () -> Unit,
    onSubmitted: () -> Unit
) {
    val uiState by viewModel.uiState.collectAsState()
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()

    // --- Sijaintitilat (oletuksena etusivun valinta / Laukaa) ---
    val cleanArea = defaultArea?.substringBefore(" (")?.trim().let { if (it.isNullOrBlank() || it == "Koko Suomi") "Laukaa" else it }
    val initCoords = getCoordinatesForArea(cleanArea)
    var placeId by remember { mutableStateOf(defaultPlaceId) }
    var placeName by remember { mutableStateOf(defaultPlaceName ?: cleanArea) }
    var latitude by remember { mutableStateOf(initCoords.first) }
    var longitude by remember { mutableStateOf(initCoords.second) }

    var showPlaceSelectionDialog by remember { mutableStateOf(false) }
    var showMapDialog by remember { mutableStateOf(false) }
    var nearbyPlaces by remember { mutableStateOf<List<Place>>(emptyList()) }
    var isLoadingPlaces by remember { mutableStateOf(false) }

    // Hae paikat aktiivisen kunnan perusteella (LaukaaInfo places -taulu)
    LaunchedEffect(cleanArea) {
        isLoadingPlaces = true
        try {
            val places = supabaseService.getNearbyPlaces(latitude, longitude, radiusKm = 50.0)
            nearbyPlaces = if (cleanArea.isNotBlank() && cleanArea != "Koko Suomi") {
                places.filter { it.municipality.equals(cleanArea, ignoreCase = true) }
            } else {
                places
            }
        } catch (e: Exception) {
            android.util.Log.e("CircularSubmit", "Paikkojen haku epäonnistui", e)
        } finally {
            isLoadingPlaces = false
        }
    }

    // --- Lomakekentät ---
    var title          by remember { mutableStateOf("") }
    var description    by remember { mutableStateOf("") }
    var condition      by remember { mutableStateOf("GOOD") }
    var pickup         by remember { mutableStateOf("EITHER") }
    var radiusKm       by remember { mutableStateOf(10f) }
    var deadlineText   by remember { mutableStateOf("") }

    // Kuvat (max 2) - kamera ja galleria
    var imageUri1 by remember { mutableStateOf<Uri?>(null) }
    var imageUri2 by remember { mutableStateOf<Uri?>(null) }
    var isUploadingImages by remember { mutableStateOf(false) }
    var showImageSourceDialogForSlot by remember { mutableStateOf<Int?>(null) }
    var showCameraDialog by remember { mutableStateOf(false) }
    var cameraTargetSlot by remember { mutableStateOf(1) }

    val pickImage1 = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
        imageUri1 = uri
    }
    val pickImage2 = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
        imageUri2 = uri
    }

    // EAV-attribuutit: (avain, arvo_teksti, yksikkö)
    var attributes by remember { mutableStateOf(listOf(Triple("", "", ""))) }

    // Dropdown-tila
    var conditionMenuOpen by remember { mutableStateOf(false) }
    var pickupMenuOpen    by remember { mutableStateOf(false) }
    var storageNodeMenuOpen by remember { mutableStateOf(false) }
    var selectedStorageNodeId by remember { mutableStateOf<String?>(null) }

    // Luovutusehto / Maksuhalukkuus
    var exchangeType by remember { mutableStateOf(if (itemType == CircularItemType.OFFER) "FREE" else "WANT_FREE") }
    var exchangeTypeMenuOpen by remember { mutableStateOf(false) }
    var priceAmountText by remember { mutableStateOf("") }
    var exchangeDescriptionText by remember { mutableStateOf("") }

    // Rakenteinen tunniste / Taksonomia
    var selectedCategory by remember { mutableStateOf("MAT.WOOD") }
    var customTaxonomyTerm by remember { mutableStateOf("") }

    LaunchedEffect(title) {
        val t = title.lowercase()
        when {
            listOf("lauta", "lankku", "puutavara", "kakkosnelonen", "rima", "parru", "halko", "puu", "hirsi").any { t.contains(it) } -> selectedCategory = "MAT.WOOD"
            listOf("kivi", "pihakivi", "sora", "hiekka", "murske", "tiili", "laatta", "muta", "multa").any { t.contains(it) } -> selectedCategory = "MAT.MINERAL"
            listOf("metalli", "rauta", "putki", "pelti", "kupari", "kaapeli", "teräs").any { t.contains(it) } -> selectedCategory = "MAT.METAL"
            listOf("vaneri", "kipsilevy", "eriste", "villa", "styroksi", "levy", "paneeli").any { t.contains(it) } -> selectedCategory = "MAT.BOARD"
            listOf("työkalu", "pora", "saha", "ruohonleikkuri", "kone", "akkukone").any { t.contains(it) } -> selectedCategory = "TOOLS"
            listOf("pöytä", "tuoli", "hylly", "sohva", "kaappi", "sänky", "lipasto").any { t.contains(it) } -> selectedCategory = "FURNITURE"
        }
    }

    // Otsikko
    val screenTitle = if (itemType == CircularItemType.OFFER)
        "Tarjoa tavaraa" else "Etsi tavaraa"
    val accentColor = if (itemType == CircularItemType.OFFER)
        Color(0xFF2E7D32) else Color(0xFF1565C0)

    // Kun lähetys onnistuu → navigoi pois
    LaunchedEffect(uiState.lastSubmittedItemId) {
        if (uiState.lastSubmittedItemId != null) {
            viewModel.clearLastSubmit()
            onSubmitted()
        }
    }

    // Paikkavalintadialogi (suoraan LaukaaInfo places -kohteet kunnassa)
    if (showPlaceSelectionDialog) {
        PlaceSelectionDialog(
            nearbyPlaces = nearbyPlaces,
            title = "🏢 Valitse noutopaikka ($cleanArea)",
            confirmButtonText = "🏢 Valitse tämä noutopaikaksi",
            onPlaceSelected = { place ->
                placeId = place.id
                placeName = place.name
                place.lat?.let { latitude = it }
                place.lon?.let { longitude = it }
                showPlaceSelectionDialog = false
            },
            onCreateNewPlace = {
                showPlaceSelectionDialog = false
                showMapDialog = true
            },
            onDismiss = { showPlaceSelectionDialog = false },
            currentLat = latitude,
            currentLon = longitude
        )
    }

    // Karttavalintadialogi (MapLibre + GPS-paikannus)
    if (showMapDialog) {
        MapLocationPickerDialog(
            initialLat = latitude,
            initialLon = longitude,
            selectedArea = cleanArea,
            title = "🗺️ Osoita sijainti kartalta ($cleanArea)",
            confirmButtonText = "Vahvista sijainti",
            onLocationConfirmed = { lat, lon ->
                latitude = lat
                longitude = lon
                placeId = null
                placeName = "Karttasijainti ($cleanArea)"
                showMapDialog = false
            },
            onDismiss = { showMapDialog = false }
        )
    }

    // Kuvalähteen valintadialogi (Kamera tai Galleria)
    if (showImageSourceDialogForSlot != null) {
        val slot = showImageSourceDialogForSlot!!
        AlertDialog(
            onDismissRequest = { showImageSourceDialogForSlot = null },
            title = { Text("Lisää kuva $slot", fontWeight = FontWeight.Bold) },
            text = { Text("Haluatko ottaa uuden kuvan kameralla vai valita kuvan galleriasta?") },
            confirmButton = {
                Button(
                    onClick = {
                        cameraTargetSlot = slot
                        showImageSourceDialogForSlot = null
                        showCameraDialog = true
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = accentColor)
                ) {
                    Icon(Icons.Default.CameraAlt, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("Ota kuva")
                }
            },
            dismissButton = {
                OutlinedButton(
                    onClick = {
                        val s = slot
                        showImageSourceDialogForSlot = null
                        if (s == 1) pickImage1.launch("image/*")
                        else pickImage2.launch("image/*")
                    }
                ) {
                    Icon(Icons.Default.Photo, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("Galleria")
                }
            }
        )
    }

    // Kameranäkymä-dialogi
    if (showCameraDialog) {
        CameraDialog(
            onImageCaptured = { uri ->
                if (cameraTargetSlot == 1) imageUri1 = uri
                else imageUri2 = uri
                showCameraDialog = false
            },
            onDismiss = { showCameraDialog = false }
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(screenTitle, fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Takaisin")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = accentColor,
                    titleContentColor = Color.White,
                    navigationIconContentColor = Color.White
                )
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {

            // --- Kuvat (max 2 kuvaa) ---
            Text(
                "Kuvat (valinnainen, max 2)",
                fontWeight = FontWeight.SemiBold,
                fontSize = 14.sp,
                color = Color(0xFF616161)
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                // Kuvaruutu 1
                ImagePickerSlot(
                    uri = imageUri1,
                    slotNumber = 1,
                    onPickClick = { showImageSourceDialogForSlot = 1 },
                    onRemoveClick = { imageUri1 = null },
                    modifier = Modifier.weight(1f)
                )

                // Kuvaruutu 2
                ImagePickerSlot(
                    uri = imageUri2,
                    slotNumber = 2,
                    onPickClick = { showImageSourceDialogForSlot = 2 },
                    onRemoveClick = { imageUri2 = null },
                    modifier = Modifier.weight(1f)
                )
            }

            // --- Otsikko ---
            OutlinedTextField(
                value = title,
                onValueChange = { title = it },
                label = { Text("Otsikko *") },
                placeholder = { Text(
                    if (itemType == CircularItemType.OFFER)
                        "esim. Puutavaraa 200m"
                    else
                        "esim. Etsitään tiiltä"
                )},
                modifier = Modifier.fillMaxWidth(),
                singleLine = true
            )

            // --- Resurssiluokka / Rakenteinen tunniste ---
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(
                    "Resurssiluokka *",
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 13.sp,
                    color = Color(0xFF616161)
                )

                val categoryOptions = listOf(
                    "MAT.WOOD" to "🌲 Puutavara",
                    "MAT.MINERAL" to "🪨 Kiviaines",
                    "MAT.METAL" to "🔩 Metalli & LVI",
                    "MAT.BOARD" to "🧱 Levyt",
                    "TOOLS" to "🔧 Työkalut",
                    "FURNITURE" to "🛋️ Huonekalut",
                    "OTHER" to "📦 Muu"
                )

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    categoryOptions.forEach { (catId, label) ->
                        val isSelected = selectedCategory == catId
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(8.dp))
                                .background(if (isSelected) accentColor else Color(0xFFEEEEEE))
                                .clickable { selectedCategory = catId }
                                .padding(horizontal = 10.dp, vertical = 6.dp)
                        ) {
                            Text(
                                text = label,
                                fontSize = 12.sp,
                                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                                color = if (isSelected) Color.White else Color(0xFF424242)
                            )
                        }
                    }
                }

                // Tarkenne / avainsanat
                OutlinedTextField(
                    value = customTaxonomyTerm,
                    onValueChange = { customTaxonomyTerm = it },
                    label = { Text("Tarkenne / Avainsanat (valinnainen)") },
                    placeholder = { Text("esim. lauta, 50x100, terassilauta, pihakivi") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
            }

            // --- Kuvaus ---
            OutlinedTextField(
                value = description,
                onValueChange = { description = it },
                label = { Text("Kuvaus") },
                modifier = Modifier.fillMaxWidth(),
                minLines = 3,
                maxLines = 6
            )

            // --- Kunto (vain OFFER) ---
            if (itemType == CircularItemType.OFFER) {
                ExposedDropdownMenuBox(
                    expanded = conditionMenuOpen,
                    onExpandedChange = { conditionMenuOpen = !conditionMenuOpen }
                ) {
                    OutlinedTextField(
                        value = conditionLabel(condition),
                        onValueChange = {},
                        readOnly = true,
                        label = { Text("Kunto") },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(conditionMenuOpen) },
                        modifier = Modifier
                            .fillMaxWidth()
                            .menuAnchor()
                    )
                    ExposedDropdownMenu(
                        expanded = conditionMenuOpen,
                        onDismissRequest = { conditionMenuOpen = false }
                    ) {
                        listOf("NEW" to "Uusi", "GOOD" to "Hyvä", "FAIR" to "Tyydyttävä", "FOR_PARTS" to "Osia").forEach { (v, l) ->
                            DropdownMenuItem(
                                text = { Text(l) },
                                onClick = { condition = v; conditionMenuOpen = false }
                            )
                        }
                    }
                }
            }

            // --- Luovutusehto / Maksuhalukkuus ---
            Card(
                shape = RoundedCornerShape(12.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                border = BorderStroke(1.dp, Color(0xFFE0E0E0)),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(
                        if (itemType == CircularItemType.OFFER) "🎁 Luovutusehto" else "💶 Maksuhalukkuus",
                        fontWeight = FontWeight.Bold,
                        fontSize = 14.sp,
                        color = Color(0xFF2E7D32)
                    )

                    val exchangeOptions = if (itemType == CircularItemType.OFFER) {
                        listOf(
                            "FREE" to "Maksuton – annetaan hyötykäyttöön",
                            "NEGOTIABLE" to "Korvauksesta voidaan sopia",
                            "FIXED_PRICE" to "Kiinteä hinta",
                            "EXCHANGE" to "Vaihdetaan johonkin muuhun"
                        )
                    } else {
                        listOf(
                            "WANT_FREE" to "Etsin maksutonta",
                            "CAN_PAY_REASONABLE" to "Voin maksaa kohtuullisen korvauksen",
                            "MAX_BUDGET" to "Minulla on enimmäisbudjetti",
                            "CAN_EXCHANGE" to "Voin tarjota vaihtotavaraa tai apua"
                        )
                    }

                    ExposedDropdownMenuBox(
                        expanded = exchangeTypeMenuOpen,
                        onExpandedChange = { exchangeTypeMenuOpen = !exchangeTypeMenuOpen }
                    ) {
                        OutlinedTextField(
                            value = exchangeOptions.find { it.first == exchangeType }?.second ?: exchangeType,
                            onValueChange = {},
                            readOnly = true,
                            label = { Text(if (itemType == CircularItemType.OFFER) "Valitse luovutusehto" else "Valitse maksuhalukkuus") },
                            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(exchangeTypeMenuOpen) },
                            modifier = Modifier
                                .fillMaxWidth()
                                .menuAnchor()
                        )
                        ExposedDropdownMenu(
                            expanded = exchangeTypeMenuOpen,
                            onDismissRequest = { exchangeTypeMenuOpen = false }
                        ) {
                            exchangeOptions.forEach { (v, l) ->
                                DropdownMenuItem(
                                    text = { Text(l) },
                                    onClick = { exchangeType = v; exchangeTypeMenuOpen = false }
                                )
                            }
                        }
                    }

                    // Jos valittu FIXED_PRICE tai MAX_BUDGET → Hintakenttä
                    if (exchangeType == "FIXED_PRICE" || exchangeType == "MAX_BUDGET") {
                        OutlinedTextField(
                            value = priceAmountText,
                            onValueChange = { priceAmountText = it },
                            label = { Text(if (exchangeType == "FIXED_PRICE") "Hinta (€)" else "Enimmäisbudjetti (€)") },
                            placeholder = { Text("esim. 20") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth()
                        )
                    }

                    // Jos valittu EXCHANGE tai CAN_EXCHANGE → Vaihtokuvaus
                    if (exchangeType == "EXCHANGE" || exchangeType == "CAN_EXCHANGE") {
                        OutlinedTextField(
                            value = exchangeDescriptionText,
                            onValueChange = { exchangeDescriptionText = it },
                            label = { Text(if (exchangeType == "EXCHANGE") "Mitä toivot vaihdossa?" else "Mitä voit tarjota vaihdossa?") },
                            placeholder = { Text("esim. kahvipaketti, kottikärryt tai lumityöapua") },
                            modifier = Modifier.fillMaxWidth()
                        )
                    }
                }
            }

            // --- Nouto-preferenssi ---
            ExposedDropdownMenuBox(
                expanded = pickupMenuOpen,
                onExpandedChange = { pickupMenuOpen = !pickupMenuOpen }
            ) {
                OutlinedTextField(
                    value = pickupLabel(pickup),
                    onValueChange = {},
                    readOnly = true,
                    label = { Text("Nouto") },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(pickupMenuOpen) },
                    modifier = Modifier
                        .fillMaxWidth()
                        .menuAnchor()
                )
                ExposedDropdownMenu(
                    expanded = pickupMenuOpen,
                    onDismissRequest = { pickupMenuOpen = false }
                ) {
                    listOf(
                        "DIRECT_ONLY" to "Vain suoraan",
                        "STORAGE_OK"  to "Varastointi ok",
                        "EITHER"      to "Kumpi vain"
                    ).forEach { (v, l) ->
                        DropdownMenuItem(
                            text = { Text(l) },
                            onClick = { pickup = v; pickupMenuOpen = false }
                        )
                    }
                }
            }

            // --- Mikrovarasto (jos sallitaan varastointi) ---
            if (pickup != "DIRECT_ONLY") {
                if (uiState.storageNodes.isNotEmpty()) {
                    val selectedNode = uiState.storageNodes.find { it.id == selectedStorageNodeId }
                    ExposedDropdownMenuBox(
                        expanded = storageNodeMenuOpen,
                        onExpandedChange = { storageNodeMenuOpen = !storageNodeMenuOpen }
                    ) {
                        OutlinedTextField(
                            value = selectedNode?.name ?: "Ei valittua mikrovarastoa (valitse alta)",
                            onValueChange = {},
                            readOnly = true,
                            label = { Text("Mikrovarasto / Säilytyspiste") },
                            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = storageNodeMenuOpen) },
                            modifier = Modifier
                                .menuAnchor()
                                .fillMaxWidth(),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = accentColor,
                                focusedLabelColor  = accentColor
                            )
                        )
                        ExposedDropdownMenu(
                            expanded = storageNodeMenuOpen,
                            onDismissRequest = { storageNodeMenuOpen = false }
                        ) {
                            DropdownMenuItem(
                                text = { Text("Ei valittua mikrovarastoa (käytä omaa osoitetta)") },
                                onClick = { selectedStorageNodeId = null; storageNodeMenuOpen = false }
                            )
                            uiState.storageNodes.forEach { node ->
                                DropdownMenuItem(
                                    text = { 
                                        Column {
                                            Text(node.name, fontWeight = FontWeight.Bold)
                                            if (node.placeNameSnapshot.isNotBlank()) {
                                                Text(node.placeNameSnapshot, fontSize = 11.sp, color = Color.Gray)
                                            }
                                        }
                                    },
                                    onClick = { 
                                        selectedStorageNodeId = node.id
                                        placeName = node.name
                                        placeId = node.placeId
                                        latitude = node.latitude
                                        longitude = node.longitude
                                        storageNodeMenuOpen = false 
                                    }
                                )
                            }
                        }
                    }
                } else {
                    // Mikrovarastoja ei vielä erikseen tietokannassa -> valitaan suoraan LaukaaInfo places -kohde
                    Card(
                        colors = CardDefaults.cardColors(containerColor = Color(0xFFF1F8E9)),
                        border = BorderStroke(1.dp, Color(0xFFAED581)),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text(
                                "🏢 Varastointi / säilytyspaikka",
                                fontWeight = FontWeight.Bold,
                                fontSize = 13.sp,
                                color = Color(0xFF2E7D32)
                            )
                            Text(
                                "Tietokannassa ei ole vielä luotuja mikrovarastoja. Valitse säilytys- tai noutopaikaksi LaukaaInfon toimipiste (esim. kirjasto tai kierrätyspiste):",
                                fontSize = 12.sp,
                                color = Color(0xFF558B2F)
                            )
                            Button(
                                onClick = { showPlaceSelectionDialog = true },
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2E7D32)),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Text("🏢 Valitse toimipiste / varastopaikka")
                            }
                        }
                    }
                }
            }

            // --- Sijainti ja toimipiste ---
            Card(
                shape = RoundedCornerShape(12.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                border = BorderStroke(1.dp, Color(0xFFE0E0E0)),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(14.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            "📍 Sijainti / Toimipiste",
                            fontWeight = FontWeight.SemiBold,
                            fontSize = 13.sp,
                            color = Color(0xFF616161)
                        )
                        if (placeId != null) {
                            StatusBadge(label = "TOIMIPISTE", color = Color(0xFF2E7D32))
                        } else if (placeName.contains("Kartta", ignoreCase = true)) {
                            StatusBadge(label = "KARTTA / GPS", color = Color(0xFF0077B6))
                        } else {
                            StatusBadge(label = "KUNTA ($cleanArea)", color = Color(0xFF1565C0))
                        }
                    }
                    Spacer(modifier = Modifier.height(6.dp))
                    Text(
                        placeName,
                        fontWeight = FontWeight.Bold,
                        fontSize = 16.sp,
                        color = Color(0xFF212121)
                    )
                    Text(
                        if (placeId != null) "LaukaaInfon virallinen toimipiste" else "Koordinaatit: %.4f, %.4f".format(latitude, longitude),
                        fontSize = 12.sp,
                        color = Color(0xFF757575)
                    )

                    Spacer(modifier = Modifier.height(10.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        OutlinedButton(
                            onClick = { showPlaceSelectionDialog = true },
                            modifier = Modifier.weight(1f),
                            contentPadding = PaddingValues(horizontal = 8.dp, vertical = 0.dp)
                        ) {
                            Icon(Icons.Default.LocationOn, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(
                                if (nearbyPlaces.isNotEmpty()) "Valitse paikka (${nearbyPlaces.size})" else "Valitse paikka",
                                fontSize = 12.sp
                            )
                        }

                        OutlinedButton(
                            onClick = { showMapDialog = true },
                            modifier = Modifier.weight(1f),
                            contentPadding = PaddingValues(horizontal = 8.dp, vertical = 0.dp)
                        ) {
                            Icon(Icons.Default.MyLocation, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(4.dp))
                            Text("Kartta / GPS", fontSize = 12.sp)
                        }
                    }

                    if (placeId != null || placeName != cleanArea) {
                        Spacer(modifier = Modifier.height(6.dp))
                        TextButton(
                            onClick = {
                                placeId = null
                                placeName = cleanArea
                                val coords = getCoordinatesForArea(cleanArea)
                                latitude = coords.first
                                longitude = coords.second
                            },
                            modifier = Modifier.align(Alignment.End),
                            contentPadding = PaddingValues(0.dp)
                        ) {
                            Text("Palauta kunnan oletus ($cleanArea)", fontSize = 11.sp, color = accentColor)
                        }
                    }
                }
            }

            // --- Hakusäde ---
            Column {
                Text(
                    "Hakusäde: ${radiusKm.toInt()} km",
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 14.sp,
                    color = Color(0xFF616161)
                )
                Slider(
                    value = radiusKm,
                    onValueChange = { radiusKm = it },
                    valueRange = RADIUS_MIN_KM..RADIUS_MAX_KM,
                    steps = 48,
                    colors = SliderDefaults.colors(thumbColor = accentColor, activeTrackColor = accentColor)
                )
            }

            // --- Deadline (valinnainen) ---
            OutlinedTextField(
                value = deadlineText,
                onValueChange = { deadlineText = it },
                label = { Text("Voimassa asti (valinnainen)") },
                placeholder = { Text("2026-12-31") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true
            )

            // --- Attribuutit ---
            Text("Lisätiedot (valinnainen)", fontWeight = FontWeight.SemiBold, fontSize = 14.sp, color = Color(0xFF616161))
            attributes.forEachIndexed { index, (key, value, unit) ->
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    OutlinedTextField(
                        value = key,
                        onValueChange = { newKey ->
                            attributes = attributes.toMutableList().also { it[index] = Triple(newKey, value, unit) }
                        },
                        label = { Text("Avain") },
                        placeholder = { Text("esim. pituus_mm") },
                        modifier = Modifier.weight(2f),
                        singleLine = true
                    )
                    OutlinedTextField(
                        value = value,
                        onValueChange = { newValue ->
                            attributes = attributes.toMutableList().also { it[index] = Triple(key, newValue, unit) }
                        },
                        label = { Text("Arvo") },
                        modifier = Modifier.weight(2f),
                        singleLine = true
                    )
                    OutlinedTextField(
                        value = unit,
                        onValueChange = { newUnit ->
                            attributes = attributes.toMutableList().also { it[index] = Triple(key, value, newUnit) }
                        },
                        label = { Text("Yks.") },
                        modifier = Modifier.weight(1f),
                        singleLine = true
                    )
                    if (attributes.size > 1) {
                        IconButton(onClick = {
                            attributes = attributes.toMutableList().also { it.removeAt(index) }
                        }) {
                            Icon(Icons.Default.Delete, contentDescription = "Poista", tint = Color(0xFFE53935))
                        }
                    }
                }
            }
            OutlinedButton(
                onClick = { attributes = attributes + Triple("", "", "") },
                modifier = Modifier.align(Alignment.Start)
            ) {
                Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(modifier = Modifier.width(4.dp))
                Text("Lisää rivi")
            }

            // --- Virhe / onnistuminen ---
            uiState.errorMessage?.let { err ->
                Card(colors = CardDefaults.cardColors(containerColor = Color(0xFFFFEBEE))) {
                    Text(
                        "⚠️ $err",
                        modifier = Modifier.padding(12.dp),
                        color = Color(0xFFB71C1C),
                        fontSize = 13.sp
                    )
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            // --- Lähetysnappi ---
            Button(
                onClick = {
                    coroutineScope.launch {
                        isUploadingImages = true
                        val uploadedUrls = mutableListOf<String>()

                        imageUri1?.let { uri ->
                            try {
                                val url = supabaseService.uploadImageSmart(context, uri, "lost-items")
                                if (url != null) uploadedUrls.add(url)
                            } catch (e: Exception) {
                                android.util.Log.e("CircularSubmit", "Kuva 1 lataus epäonnistui", e)
                            }
                        }

                        imageUri2?.let { uri ->
                            try {
                                val url = supabaseService.uploadImageSmart(context, uri, "lost-items")
                                if (url != null) uploadedUrls.add(url)
                            } catch (e: Exception) {
                                android.util.Log.e("CircularSubmit", "Kuva 2 lataus epäonnistui", e)
                            }
                        }

                        isUploadingImages = false

                        val dlAt = deadlineText.trim().ifBlank { null }
                            ?.let { if (it.length == 10) "${it}T23:59:59Z" else it }

                        val attrs = attributes
                            .filter { (k, v, _) -> k.isNotBlank() && v.isNotBlank() }
                            .map { (k, v, u) ->
                                val num = v.toDoubleOrNull()
                                CircularAttributeInput(
                                    attributeKey = k.trim(),
                                    valueText    = if (num == null) v.trim() else null,
                                    valueNumber  = num,
                                    unit         = u.trim().ifBlank { null }
                                )
                            }.toMutableList()

                        // Lisätään rakenteinen resurssiluokka ja taksonomiatarkenne
                        attrs.add(CircularAttributeInput(attributeKey = "resource_category", valueText = selectedCategory))
                        if (customTaxonomyTerm.isNotBlank()) {
                            attrs.add(CircularAttributeInput(attributeKey = "taxonomy_term", valueText = customTaxonomyTerm.trim()))
                        }

                        viewModel.submitCircularItem(
                            SubmitCircularItemRequest(
                                itemType        = itemType.value,
                                title           = title.trim(),
                                description     = description.trim().ifBlank { null },
                                placeId         = placeId,
                                placeNameSnapshot = placeName,
                                latitude        = latitude,
                                longitude       = longitude,
                                radiusMeters    = radiusKm * 1000.0,
                                deadlineAt      = dlAt,
                                condition       = if (itemType == CircularItemType.OFFER) condition else null,
                                preferredPickup = pickup,
                                imageUrls       = uploadedUrls,
                                attributes      = attrs,
                                actorId         = uiState.actorProfile?.id,
                                actorCode       = uiState.actorProfile?.actorCode,
                                actorTier       = uiState.actorProfile?.actorTier,
                                storageNodeId   = selectedStorageNodeId,
                                exchangeType    = exchangeType,
                                priceAmount     = priceAmountText.toDoubleOrNull(),
                                exchangeDescription = exchangeDescriptionText.trim().ifBlank { null }
                            )
                        )
                    }
                },
                enabled = title.isNotBlank() && !uiState.isSubmitting && !isUploadingImages,
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(containerColor = accentColor)
            ) {
                if (uiState.isSubmitting || isUploadingImages) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(20.dp),
                        color = Color.White,
                        strokeWidth = 2.dp
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                }
                Text(
                    when {
                        isUploadingImages -> "Ladataan kuvia..."
                        uiState.isSubmitting -> "Lähetetään..."
                        else -> "Jätä ilmoitus"
                    },
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold
                )
            }

            Spacer(modifier = Modifier.height(24.dp))
        }
    }
}

private fun conditionLabel(v: String) = when (v) {
    "NEW"      -> "Uusi"
    "GOOD"     -> "Hyvä"
    "FAIR"     -> "Tyydyttävä"
    "FOR_PARTS"-> "Osia"
    else       -> v
}

private fun pickupLabel(v: String) = when (v) {
    "DIRECT_ONLY" -> "Vain suoraan"
    "STORAGE_OK"  -> "Varastointi ok"
    "EITHER"      -> "Kumpi vain"
    else          -> v
}

@Composable
private fun ImagePickerSlot(
    uri: Uri?,
    slotNumber: Int,
    onPickClick: () -> Unit,
    onRemoveClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .height(110.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(Color(0xFFEEEEEE))
            .border(1.dp, Color(0xFFBDBDBD), RoundedCornerShape(12.dp))
            .clickable(onClick = onPickClick),
        contentAlignment = Alignment.Center
    ) {
        if (uri != null) {
            AsyncImage(
                model = uri,
                contentDescription = "Kuva $slotNumber",
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize()
            )
            IconButton(
                onClick = onRemoveClick,
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .size(28.dp)
                    .background(Color.Black.copy(alpha = 0.6f), RoundedCornerShape(bottomStart = 8.dp))
            ) {
                Icon(
                    Icons.Default.Close,
                    contentDescription = "Poista kuva",
                    tint = Color.White,
                    modifier = Modifier.size(16.dp)
                )
            }
        } else {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center
            ) {
                Icon(
                    Icons.Default.CameraAlt,
                    contentDescription = "Lisää kuva",
                    tint = Color(0xFF757575),
                    modifier = Modifier.size(28.dp)
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    "Kuva $slotNumber",
                    fontSize = 12.sp,
                    color = Color(0xFF757575),
                    fontWeight = FontWeight.Medium
                )
            }
        }
    }
}

