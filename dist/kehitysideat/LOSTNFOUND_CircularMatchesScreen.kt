package fi.mediazoo.lostrefound.circular

// ============================================================================
// CircularMatchesScreen – Matchilista
//
// Näyttää kaikki käyttäjän matchit statusbadgeilla.
// LaunchedEffect(Unit) lataa matchit avautuessa.
// Pull-to-refresh kutsuu viewModel.loadMyMatches().
// Rivin klikkaus → onMatchSelected(matchId)
// ============================================================================

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Email
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.math.roundToInt

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CircularMatchesScreen(
    viewModel: CircularViewModel,
    currentUid: String,
    onMatchSelected: (matchId: String) -> Unit,
    onBack: () -> Unit
) {
    val uiState by viewModel.uiState.collectAsState()
    var selectedTab by remember { mutableStateOf(0) } // 0 = Matchit, 1 = Yhteydenotot

    var selectedContactForReply by remember { mutableStateOf<CircularContactItem?>(null) }
    var replyText by remember { mutableStateOf("") }
    var isSendingReply by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        viewModel.loadMyMatches()
        viewModel.loadMyContacts()
    }

    Scaffold(
        topBar = {
            Column {
                TopAppBar(
                    title = { Text("Matchit & Viestit", fontWeight = FontWeight.Bold) },
                    navigationIcon = {
                        IconButton(onClick = onBack) {
                            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Takaisin")
                        }
                    },
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = Color(0xFFF57F17),
                        titleContentColor = Color.White,
                        navigationIconContentColor = Color.White
                    )
                )

                TabRow(
                    selectedTabIndex = selectedTab,
                    containerColor = Color.White,
                    contentColor = Color(0xFFF57F17)
                ) {
                    Tab(
                        selected = selectedTab == 0,
                        onClick = { selectedTab = 0 },
                        text = {
                            val count = uiState.myMatches.size
                            Text(if (count > 0) "Matchit ($count)" else "Matchit")
                        }
                    )
                    Tab(
                        selected = selectedTab == 1,
                        onClick = { selectedTab = 1 },
                        text = {
                            val count = uiState.myContacts.size
                            Text(if (count > 0) "Yhteydenotot ($count)" else "Yhteydenotot")
                        }
                    )
                }
            }
        }
    ) { padding ->
        val isRefreshing = if (selectedTab == 0) uiState.isLoadingMatches else uiState.isLoadingContacts

        PullToRefreshBox(
            isRefreshing = isRefreshing,
            onRefresh = {
                if (selectedTab == 0) viewModel.loadMyMatches() else viewModel.loadMyContacts()
            },
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            if (selectedTab == 0) {
                // --- VÄLILEHTI 1: AUTOMAATTISET MATCHIT ---
                if (uiState.isLoadingMatches && uiState.myMatches.isEmpty()) {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator()
                    }
                } else if (uiState.myMatches.isEmpty()) {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text("🤝", fontSize = 48.sp)
                            Spacer(modifier = Modifier.height(12.dp))
                            Text(
                                "Ei matcheja vielä",
                                fontSize = 16.sp,
                                color = Color(0xFF757575)
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                "Järjestelmä etsii sopivat parit automaattisesti",
                                fontSize = 13.sp,
                                color = Color(0xFF9E9E9E)
                            )
                        }
                    }
                } else {
                    LazyColumn(
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        items(uiState.myMatches, key = { it.id }) { match ->
                            CircularMatchRow(
                                match = match,
                                currentUid = currentUid,
                                onClick = { onMatchSelected(match.id) }
                            )
                        }
                    }
                }
            } else {
                // --- VÄLILEHTI 2: SUORAT YHTEYDENOTOT (KIINNOSTUSVIESTIT) ---
                if (uiState.isLoadingContacts && uiState.myContacts.isEmpty()) {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator()
                    }
                } else if (uiState.myContacts.isEmpty()) {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text("📬", fontSize = 48.sp)
                            Spacer(modifier = Modifier.height(12.dp))
                            Text(
                                "Ei yhteydenottoja vielä",
                                fontSize = 16.sp,
                                color = Color(0xFF757575)
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                "Kun joku osoittaa kiinnostusta kohteeseesi, viesti näkyy täällä",
                                fontSize = 13.sp,
                                color = Color(0xFF9E9E9E)
                            )
                        }
                    }
                } else {
                    LazyColumn(
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        items(uiState.myContacts, key = { it.id }) { contact ->
                            CircularContactRow(
                                contact = contact,
                                onReplyClick = {
                                    selectedContactForReply = contact
                                    replyText = contact.ownerReply ?: ""
                                }
                            )
                        }
                    }
                }
            }
        }
    }

    // Vastausdialogi ilmoittajalle
    selectedContactForReply?.let { contact ->
        AlertDialog(
            onDismissRequest = { if (!isSendingReply) selectedContactForReply = null },
            title = {
                Text(
                    if (contact.isIncoming) "Vastaa yhteydenottoon" else "Yhteydenoton tiedot",
                    fontWeight = FontWeight.Bold
                )
            },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        "Kohde: ${contact.itemTitleSnapshot}",
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 14.sp,
                        color = Color(0xFF2E7D32)
                    )
                    Text(
                        "Alkuperäinen viesti:",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF616161)
                    )
                    Text(
                        contact.message,
                        fontSize = 13.sp,
                        color = Color(0xFF212121)
                    )

                    if (contact.isIncoming) {
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            "Kirjoita vastauksesi:",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFF616161)
                        )
                        OutlinedTextField(
                            value = replyText,
                            onValueChange = { replyText = it },
                            placeholder = { Text("esim. Tavara on vielä vapaana, milloin sopisi haku?") },
                            modifier = Modifier.fillMaxWidth(),
                            minLines = 3,
                            maxLines = 6
                        )
                    } else if (contact.ownerReply != null) {
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            "Ilmoittajan vastaus:",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFF2E7D32)
                        )
                        Text(
                            contact.ownerReply,
                            fontSize = 13.sp,
                            color = Color(0xFF212121)
                        )
                    }
                }
            },
            confirmButton = {
                if (contact.isIncoming) {
                    Button(
                        onClick = {
                            if (replyText.trim().isBlank()) return@Button
                            isSendingReply = true
                            viewModel.replyToContact(contact.id, replyText) {
                                isSendingReply = false
                                selectedContactForReply = null
                            }
                        },
                        enabled = replyText.isNotBlank() && !isSendingReply,
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2E7D32))
                    ) {
                        if (isSendingReply) {
                            CircularProgressIndicator(modifier = Modifier.size(16.dp), color = Color.White)
                            Spacer(modifier = Modifier.width(6.dp))
                        }
                        Text("Lähetä vastaus")
                    }
                } else {
                    Button(onClick = { selectedContactForReply = null }) {
                        Text("Sulje")
                    }
                }
            },
            dismissButton = {
                TextButton(
                    onClick = { selectedContactForReply = null },
                    enabled = !isSendingReply
                ) {
                    Text(if (contact.isIncoming) "Peruuta" else "Sulje")
                }
            }
        )
    }
}

@Composable
private fun CircularContactRow(
    contact: CircularContactItem,
    onReplyClick: () -> Unit
) {
    val isIncoming = contact.isIncoming
    val cardColor = if (isIncoming) Color.White else Color(0xFFFAFAFA)
    val roleColor = if (isIncoming) Color(0xFF2E7D32) else Color(0xFF1565C0)

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = cardColor),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                StatusBadge(
                    label = if (isIncoming) "SAAPUNUT VIESTI" else "LÄHETETTY PYYNTÖ",
                    color = roleColor
                )
                Text(
                    contact.statusLabel,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = if (contact.status.uppercase() == "PENDING") Color(0xFFE65100) else Color(0xFF757575)
                )
            }

            Spacer(modifier = Modifier.height(8.dp))

            Text(
                "Kohde: ${contact.itemTitleSnapshot}",
                fontWeight = FontWeight.Bold,
                fontSize = 14.sp,
                color = Color(0xFF212121)
            )

            contact.senderActorCode?.let { code ->
                Text(
                    "Lähettäjän tunniste: $code",
                    fontSize = 12.sp,
                    color = Color(0xFF1565C0),
                    fontWeight = FontWeight.Medium
                )
            }

            Spacer(modifier = Modifier.height(6.dp))

            Text(
                contact.message,
                fontSize = 13.sp,
                color = Color(0xFF424242)
            )

            if (contact.ownerReply != null) {
                Spacer(modifier = Modifier.height(8.dp))
                Card(
                    colors = CardDefaults.cardColors(containerColor = Color(0xFFE8F5E9)),
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(8.dp)) {
                        Text("Vastattu:", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Color(0xFF2E7D32))
                        Text(contact.ownerReply, fontSize = 12.sp, color = Color(0xFF1B5E20))
                    }
                }
            }

            Spacer(modifier = Modifier.height(10.dp))
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                OutlinedButton(
                    onClick = onReplyClick,
                    modifier = Modifier.height(32.dp),
                    contentPadding = PaddingValues(horizontal = 14.dp, vertical = 0.dp)
                ) {
                    Icon(
                        if (isIncoming) Icons.AutoMirrored.Filled.Send else Icons.Default.Email,
                        contentDescription = null,
                        modifier = Modifier.size(14.dp)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(if (isIncoming) "Vastaa" else "Katso tiedot", fontSize = 12.sp)
                }
            }
        }
    }
}

@Composable
private fun CircularMatchRow(
    match: CircularMatch,
    currentUid: String,
    onClick: () -> Unit
) {
    val statusColor = when (match.status) {
        CircularMatchStatus.NOTIFIED  -> Color(0xFFF57F17)
        CircularMatchStatus.ACCEPTED  -> Color(0xFF2E7D32)
        CircularMatchStatus.RESERVED  -> Color(0xFF1565C0)
        CircularMatchStatus.FULFILLED -> Color(0xFF6A1B9A)
        CircularMatchStatus.REJECTED  -> Color(0xFF757575)
        CircularMatchStatus.EXPIRED   -> Color(0xFF757575)
        else                          -> Color(0xFF9E9E9E)
    }

    // Roolimääritys: kumpi osapuoli kirjautunut käyttäjä on
    val myTitle    = if (match.isOfferSide(currentUid)) match.offerTitle else match.wantedTitle
    val otherTitle = if (match.isOfferSide(currentUid)) match.wantedTitle else match.offerTitle
    val myRole     = if (match.isOfferSide(currentUid)) "Tarjouksesi" else "Etsintäsi"
    val myAccepted = match.hasCurrentUserAccepted(currentUid)

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                StatusBadge(label = match.statusLabel.uppercase(), color = statusColor)
                Text(
                    "${(match.totalScore * 100).roundToInt()}% sopivuus",
                    fontSize = 12.sp,
                    color = Color(0xFF9E9E9E)
                )
            }

            Spacer(modifier = Modifier.height(8.dp))

            // Oma ilmoitus
            Text(
                "$myRole: ${myTitle ?: "—"}",
                fontWeight = FontWeight.Bold,
                fontSize = 14.sp,
                color = Color(0xFF212121)
            )
            // Vastapuoli
            Text(
                "↔ ${otherTitle ?: "—"}",
                fontSize = 13.sp,
                color = Color(0xFF616161)
            )

            // Oman hyväksynnän tila
            if (match.status == CircularMatchStatus.NOTIFIED ||
                match.status == CircularMatchStatus.ACCEPTED
            ) {
                Spacer(modifier = Modifier.height(8.dp))
                val acceptText = if (myAccepted) "✅ Olet hyväksynyt" else "⏳ Et ole vielä hyväksynyt"
                val acceptColor = if (myAccepted) Color(0xFF2E7D32) else Color(0xFFF57F17)
                Text(acceptText, fontSize = 12.sp, color = acceptColor)
            }

            // Avaa-painike
            Spacer(modifier = Modifier.height(10.dp))
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                OutlinedButton(
                    onClick = onClick,
                    modifier = Modifier.height(32.dp),
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 0.dp)
                ) {
                    Text("Avaa", fontSize = 13.sp)
                }
            }
        }
    }
}

