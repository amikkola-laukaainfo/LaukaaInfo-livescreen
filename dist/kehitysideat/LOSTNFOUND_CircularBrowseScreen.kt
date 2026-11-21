package fi.mediazoo.lostrefound.circular

// ============================================================================
// CircularBrowseScreen – Kiertotalouden julkinen ilmoitusselaus (Tori / Feed)
//
// Näyttää aktiiviset OFFER- ja WANTED-ilmoitukset.
// Mahdollistaa:
//  - Kuvien katselun kokonaisina (ContentScale.Fit)
//  - Kuvan napautuksella koko ruudun swipe-selauksen kahdelle kuvalle
//  - Tarkemman sijainnin ja "Näytä kartalla" -toiminnon
//  - "Olen kiinnostunut" / yhteydenottopyynnön jättämisen
// ============================================================================

import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Send
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CircularBrowseScreen(
    viewModel: CircularViewModel,
    onBack: () -> Unit
) {
    val uiState by viewModel.uiState.collectAsState()
    val context = LocalContext.current

    var selectedTab by remember { mutableStateOf(0) } // 0=Kaikki, 1=Tarjoukset, 2=Etsitään
    var searchQuery by remember { mutableStateOf("") }
    var selectedItemDetail by remember { mutableStateOf<CircularItem?>(null) }
    var galleryImages by remember { mutableStateOf<List<String>?>(null) }
    var showInterestDialog by remember { mutableStateOf<CircularItem?>(null) }
    var interestMessage by remember { mutableStateOf("") }
    var isSendingInterest by remember { mutableStateOf(false) }
    var interestSentSuccess by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        viewModel.loadBrowseItems()
    }

    // Suodatus
    val filteredItems = remember(uiState.browseItems, selectedTab, searchQuery) {
        uiState.browseItems.filter { item ->
            val matchesTab = when (selectedTab) {
                1 -> item.itemType == CircularItemType.OFFER
                2 -> item.itemType == CircularItemType.WANTED
                else -> true
            }
            val matchesQuery = searchQuery.isBlank() ||
                item.title.contains(searchQuery, ignoreCase = true) ||
                (item.description ?: "").contains(searchQuery, ignoreCase = true) ||
                (item.placeNameSnapshot ?: "").contains(searchQuery, ignoreCase = true)
            matchesTab && matchesQuery
        }
    }

    // Koko ruudun / swipe-kuvagalleriadialogi
    galleryImages?.let { urls ->
        CircularImageGalleryDialog(
            imageUrls = urls,
            onDismiss = { galleryImages = null }
        )
    }

    // "Olen kiinnostunut" / "Minulla on tämä" -dialogi
    // Toimii sekä OFFER- että WANTED-ilmoituksille.
    showInterestDialog?.let { item ->
        val isOffer = item.itemType == CircularItemType.OFFER
        val accentColor = if (isOffer) Color(0xFF2E7D32) else Color(0xFF1565C0)
        val actorCode = uiState.actorProfile?.actorCode

        AlertDialog(
            onDismissRequest = {
                if (!isSendingInterest) {
                    showInterestDialog = null
                    interestMessage = ""
                    interestSentSuccess = false
                }
            },
            title = {
                Text(
                    if (interestSentSuccess)
                        "✅ Viesti lähetetty!"
                    else if (isOffer)
                        "🤝 Ilmoita kiinnostuksesi"
                    else
                        "📦 Tarjoa tavaraa etsijälle",
                    fontWeight = FontWeight.Bold
                )
            },
            text = {
                if (interestSentSuccess) {
                    // Onnistumistila
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(
                            "Viestisi on lähetetty ilmoittajalle.",
                            fontSize = 14.sp
                        )
                        Text(
                            if (isOffer)
                                "Ilmoittaja ottaa sinuun yhteyttä kun on katsonut viestin. " +
                                "Näet vastaukset Matchit-välilehdeltä."
                            else
                                "Etsijä saa ilmoituksen tarjouksestasi. " +
                                "Näet vastaukset Matchit-välilehdeltä.",
                            fontSize = 13.sp,
                            color = Color(0xFF616161)
                        )
                    }
                } else {
                    // Viestin kirjoitustila
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        // Kohdetiedot
                        Card(
                            colors = CardDefaults.cardColors(
                                containerColor = accentColor.copy(alpha = 0.08f)
                            ),
                            shape = androidx.compose.foundation.shape.RoundedCornerShape(8.dp)
                        ) {
                            Column(modifier = Modifier.padding(10.dp)) {
                                Text(
                                    if (isOffer) "Tarjoaa:" else "Etsii:",
                                    fontSize = 11.sp,
                                    color = accentColor,
                                    fontWeight = FontWeight.SemiBold
                                )
                                Text(
                                    item.title,
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 14.sp
                                )
                                item.placeNameSnapshot?.let {
                                    Text("📍 $it", fontSize = 12.sp, color = Color(0xFF757575))
                                }
                            }
                        }

                        Text(
                            if (isOffer)
                                "Kerro lyhyesti miksi olet kiinnostunut tai milloin pääset noutamaan:"
                            else
                                "Kerro lyhyesti mitä tarjoat tai milloin se on saatavilla:",
                            fontSize = 13.sp,
                            color = Color(0xFF424242)
                        )

                        OutlinedTextField(
                            value = interestMessage,
                            onValueChange = { if (it.length <= 1000) interestMessage = it },
                            placeholder = {
                                Text(
                                    if (isOffer)
                                        "Moi! Olen kiinnostunut noutamaan tämän. Voisin tulla viikonloppuna..."
                                    else
                                        "Moi! Minulta löytyy tällaista tavaraa. Se on hyvässä kunnossa ja..."
                                )
                            },
                            modifier = Modifier.fillMaxWidth(),
                            minLines = 3,
                            maxLines = 6,
                            enabled = !isSendingInterest,
                            supportingText = {
                                Text(
                                    "${interestMessage.length}/1000",
                                    fontSize = 11.sp,
                                    color = if (interestMessage.length > 900) Color(0xFFE53935) else Color(0xFF9E9E9E)
                                )
                            }
                        )

                        // LI-tunniste näkyy jos käyttäjällä on profiili
                        actorCode?.let { code ->
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                Icon(
                                    Icons.Default.Send,
                                    contentDescription = null,
                                    modifier = Modifier.size(14.dp),
                                    tint = Color(0xFF9E9E9E)
                                )
                                Text(
                                    "Lähetetään tunnisteella $code",
                                    fontSize = 11.sp,
                                    color = Color(0xFF9E9E9E)
                                )
                            }
                        }
                    }
                }
            },
            confirmButton = {
                if (interestSentSuccess) {
                    Button(
                        onClick = {
                            showInterestDialog = null
                            interestMessage = ""
                            interestSentSuccess = false
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = accentColor)
                    ) {
                        Text("Sulje")
                    }
                } else {
                    Button(
                        onClick = {
                            if (interestMessage.trim().isEmpty()) return@Button
                            isSendingInterest = true
                            viewModel.sendInterest(
                                itemId          = item.id,
                                message         = interestMessage,
                                senderActorCode = uiState.actorProfile?.actorCode
                            ) { success, errorMsg ->
                                isSendingInterest = false
                                if (success) {
                                    interestSentSuccess = true
                                } else {
                                    // Virhe näkyy ViewModel:n errorMessage kautta (SnackBar)
                                    showInterestDialog = null
                                    interestMessage = ""
                                }
                            }
                        },
                        enabled = interestMessage.trim().isNotEmpty() && !isSendingInterest,
                        colors = ButtonDefaults.buttonColors(containerColor = accentColor)
                    ) {
                        if (isSendingInterest) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(16.dp),
                                color = Color.White,
                                strokeWidth = 2.dp
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                        }
                        Text(if (isOffer) "Lähetä kiinnostus" else "Tarjoa tavaraa")
                    }
                }
            },
            dismissButton = {
                if (!interestSentSuccess) {
                    TextButton(
                        onClick = {
                            if (!isSendingInterest) {
                                showInterestDialog = null
                                interestMessage = ""
                            }
                        },
                        enabled = !isSendingInterest
                    ) {
                        Text("Peruuta")
                    }
                }
            }
        )
    }

    // Yksityiskohtadialogi
    selectedItemDetail?.let { item ->
        val isOffer = item.itemType == CircularItemType.OFFER
        val typeColor = if (isOffer) Color(0xFF2E7D32) else Color(0xFF1565C0)
        AlertDialog(
            onDismissRequest = { selectedItemDetail = null },
            title = {
                Text(
                    item.title,
                    fontWeight = FontWeight.Bold,
                    fontSize = 18.sp
                )
            },
            text = {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    // Kuvat: näytetään kokonaisina ja klikkaus avaa swipe-selaimen
                    if (item.imageUrls.isNotEmpty()) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            item.imageUrls.take(2).forEachIndexed { idx, url ->
                                Box(
                                    modifier = Modifier
                                        .weight(1f)
                                        .height(130.dp)
                                        .clip(RoundedCornerShape(8.dp))
                                        .background(Color(0xFFF0F0F0))
                                        .clickable { galleryImages = item.imageUrls },
                                    contentAlignment = Alignment.Center
                                ) {
                                    AsyncImage(
                                        model = url,
                                        contentDescription = "Kuva ${idx + 1}",
                                        contentScale = ContentScale.Fit,
                                        modifier = Modifier.fillMaxSize().padding(4.dp)
                                    )
                                }
                            }
                        }
                        Text("🔍 Napauta kuvaa suurentaaksesi", fontSize = 11.sp, color = Color.Gray)
                    }

                    // Tyyppi ja tila
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        StatusBadge(
                            label = if (isOffer) "TARJOUS" else "ETSITÄÄN",
                            color = typeColor
                        )
                        item.condition?.let { cond ->
                            StatusBadge(label = "Kunto: $cond", color = Color(0xFF558B2F))
                        }
                    }

                    // Kuvaus
                    item.description?.takeIf { it.isNotBlank() }?.let { desc ->
                        Text(desc, fontSize = 14.sp, color = Color(0xFF424242))
                    }

                    // Tarkempi sijainti
                    item.placeNameSnapshot?.let { place ->
                        Text("📍 Toimipiste: $place", fontSize = 13.sp, color = Color(0xFF424242), fontWeight = FontWeight.Medium)
                    }

                    // Karttalinkki
                    if (item.latitude != 0.0 && item.longitude != 0.0) {
                        OutlinedButton(
                            onClick = {
                                val gmmIntentUri = Uri.parse("geo:${item.latitude},${item.longitude}?q=${item.latitude},${item.longitude}(${Uri.encode(item.title)})")
                                val mapIntent = Intent(Intent.ACTION_VIEW, gmmIntentUri)
                                context.startActivity(mapIntent)
                            },
                            contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp),
                            modifier = Modifier.height(32.dp)
                        ) {
                            Icon(Icons.Default.LocationOn, contentDescription = null, modifier = Modifier.size(14.dp))
                            Spacer(modifier = Modifier.width(4.dp))
                            Text("Avaa karttasovelluksessa", fontSize = 11.sp)
                        }
                    }

                    // Noutotapa
                    val pickupText = when (item.preferredPickup) {
                        "DIRECT_ONLY" -> "Vain suora nouto"
                        "STORAGE_OK" -> "Varastointi / mikrovarasto ok"
                        else -> "Suora nouto tai varasto"
                    }
                    Text("📦 Nouto: $pickupText", fontSize = 13.sp, color = Color(0xFF616161))

                    // Luovutusehto / Hinta
                    val priceLabel = when (item.exchangeType) {
                        "FREE", "WANT_FREE" -> "🎁 Maksuton – annetaan hyötykäyttöön"
                        "FIXED_PRICE" -> if (item.priceAmount != null) "💶 Hinta: ${item.priceAmount.toInt()} €" else "💶 Kiinteä hinta"
                        "MAX_BUDGET" -> if (item.priceAmount != null) "💶 Enimmäisbudjetti: ${item.priceAmount.toInt()} €" else "💶 Budjetti määritelty"
                        "NEGOTIABLE", "CAN_PAY_REASONABLE" -> "🤝 Korvauksesta voidaan sopia"
                        "EXCHANGE", "CAN_EXCHANGE" -> "🔄 Vaihdetaan: ${item.exchangeDescription ?: "tavaraan/apuun"}"
                        else -> if (item.priceEur > 0) "💶 Hinta: ${item.priceEur.toInt()} €" else "🎁 Maksuton"
                    }
                    Text(priceLabel, fontWeight = FontWeight.Bold, color = Color(0xFF2E7D32), fontSize = 13.sp)

                    // Toimijatunniste
                    item.actorCode?.let { code ->
                        Text("🛡️ Toimijatunniste: $code", fontSize = 11.sp, color = Color(0xFF33691E), fontWeight = FontWeight.SemiBold)
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        selectedItemDetail = null
                        showInterestDialog = item
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = typeColor)
                ) {
                    Text(if (isOffer) "🤝 Olen kiinnostunut" else "📦 Minulla on tämä")
                }
            },
            dismissButton = {
                TextButton(onClick = { selectedItemDetail = null }) {
                    Text("Sulje")
                }
            }
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Kiertotalous – Selaa", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Takaisin")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Color(0xFF2E7D32),
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
        ) {
            // Välilehdet: Kaikki / Tarjoukset / Etsitään
            TabRow(
                selectedTabIndex = selectedTab,
                containerColor = Color.White,
                contentColor = Color(0xFF2E7D32)
            ) {
                Tab(
                    selected = selectedTab == 0,
                    onClick = { selectedTab = 0 },
                    text = { Text("Kaikki", fontWeight = FontWeight.SemiBold) }
                )
                Tab(
                    selected = selectedTab == 1,
                    onClick = { selectedTab = 1 },
                    text = { Text("📦 Tarjoukset", fontWeight = FontWeight.SemiBold) }
                )
                Tab(
                    selected = selectedTab == 2,
                    onClick = { selectedTab = 2 },
                    text = { Text("🔍 Etsitään", fontWeight = FontWeight.SemiBold) }
                )
            }

            // Hakukenttä
            OutlinedTextField(
                value = searchQuery,
                onValueChange = { searchQuery = it },
                placeholder = { Text("Hae ilmoituksista tai paikoista...") },
                leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                trailingIcon = {
                    if (searchQuery.isNotEmpty()) {
                        IconButton(onClick = { searchQuery = "" }) {
                            Icon(Icons.Default.Close, contentDescription = "Tyhjennä")
                        }
                    }
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                shape = RoundedCornerShape(12.dp),
                singleLine = true
            )

            // Ilmoituslista
            PullToRefreshBox(
                isRefreshing = uiState.isLoadingBrowse,
                onRefresh = { viewModel.loadBrowseItems() },
                modifier = Modifier.fillMaxSize()
            ) {
                if (uiState.isLoadingBrowse && uiState.browseItems.isEmpty()) {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator()
                    }
                } else if (filteredItems.isEmpty()) {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text("🔍", fontSize = 48.sp)
                            Spacer(modifier = Modifier.height(12.dp))
                            Text(
                                "Ei ilmoituksia valituilla ehdoilla",
                                fontSize = 16.sp,
                                color = Color(0xFF757575)
                            )
                        }
                    }
                } else {
                    LazyColumn(
                        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        items(filteredItems, key = { it.id }) { item ->
                            BrowseItemCard(
                                item = item,
                                onClick = { selectedItemDetail = item },
                                onImageClick = { galleryImages = item.imageUrls }
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun BrowseItemCard(
    item: CircularItem,
    onClick: () -> Unit,
    onImageClick: () -> Unit
) {
    val isOffer = item.itemType == CircularItemType.OFFER
    val typeColor = if (isOffer) Color(0xFF2E7D32) else Color(0xFF1565C0)
    val typeText  = if (isOffer) "TARJOUS" else "ETSITÄÄN"

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.Top
        ) {
            // Kuva: kokonaisena (Fit) siistillä taustalla
            if (item.imageUrls.isNotEmpty()) {
                Box(
                    modifier = Modifier
                        .size(80.dp)
                        .clip(RoundedCornerShape(10.dp))
                        .background(Color(0xFFF5F5F5))
                        .clickable(onClick = onImageClick),
                    contentAlignment = Alignment.Center
                ) {
                    AsyncImage(
                        model = item.imageUrls.first(),
                        contentDescription = item.title,
                        contentScale = ContentScale.Fit,
                        modifier = Modifier.fillMaxSize().padding(2.dp)
                    )
                    if (item.imageUrls.size > 1) {
                        Box(
                            modifier = Modifier
                                .align(Alignment.BottomEnd)
                                .background(Color.Black.copy(alpha = 0.6f), RoundedCornerShape(topStart = 6.dp))
                                .padding(horizontal = 4.dp, vertical = 2.dp)
                        ) {
                            Text(
                                "${item.imageUrls.size}",
                                color = Color.White,
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                }
            } else {
                Box(
                    modifier = Modifier
                        .size(80.dp)
                        .clip(RoundedCornerShape(10.dp))
                        .background(typeColor.copy(alpha = 0.08f)),
                    contentAlignment = Alignment.Center
                ) {
                    Text(if (isOffer) "📦" else "🔍", fontSize = 32.sp)
                }
            }

            Spacer(modifier = Modifier.width(12.dp))

            Column(modifier = Modifier.weight(1f)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    StatusBadge(label = typeText, color = typeColor)

                    val priceText = when (item.exchangeType) {
                        "FREE", "WANT_FREE" -> "Maksuton"
                        "FIXED_PRICE" -> if (item.priceAmount != null) "${item.priceAmount.toInt()} €" else "Kiinteä hinta"
                        "MAX_BUDGET" -> if (item.priceAmount != null) "Max ${item.priceAmount.toInt()} €" else "Budjetti"
                        "NEGOTIABLE", "CAN_PAY_REASONABLE" -> "Sovittavissa"
                        "EXCHANGE", "CAN_EXCHANGE" -> "Vaihto"
                        else -> if (item.priceEur > 0) "${item.priceEur.toInt()} €" else "Maksuton"
                    }
                    Text(priceText, fontSize = 12.sp, color = Color(0xFF2E7D32), fontWeight = FontWeight.SemiBold)
                }

                Spacer(modifier = Modifier.height(4.dp))

                Text(
                    item.title,
                    fontWeight = FontWeight.Bold,
                    fontSize = 15.sp,
                    maxLines = 1,
                    color = Color(0xFF212121)
                )

                item.description?.takeIf { it.isNotBlank() }?.let { desc ->
                    Text(
                        desc,
                        fontSize = 12.sp,
                        color = Color(0xFF616161),
                        maxLines = 2
                    )
                }

                item.placeNameSnapshot?.let { place ->
                    Spacer(modifier = Modifier.height(3.dp))
                    Text("📍 $place", fontSize = 11.sp, color = Color(0xFF9E9E9E))
                }

                item.actorCode?.let { code ->
                    Spacer(modifier = Modifier.height(2.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            text = code,
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFF2E7D32),
                            modifier = Modifier
                                .background(Color(0xFFE8F5E9), RoundedCornerShape(4.dp))
                                .padding(horizontal = 4.dp, vertical = 1.dp)
                        )
                        when (item.actorTier) {
                            "VERIFIED_ACTIVE" -> {
                                Spacer(modifier = Modifier.width(4.dp))
                                Text("✓ Vahvistettu", fontSize = 10.sp, color = Color(0xFF2E7D32), fontWeight = FontWeight.SemiBold)
                            }
                            "ORGANIZATION" -> {
                                Spacer(modifier = Modifier.width(4.dp))
                                Text("🏢 Toimija", fontSize = 10.sp, color = Color(0xFF6A1B9A), fontWeight = FontWeight.SemiBold)
                            }
                        }
                    }
                }
            }
        }
    }
}
