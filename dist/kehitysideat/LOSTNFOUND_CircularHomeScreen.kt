package fi.mediazoo.lostrefound.circular

// ============================================================================
// CircularHomeScreen – Kiertotalouden etusivu
//
// Kolme toimintakorttia:
//   • Tarjoa tavaraa  → CIRCULAR_SUBMIT_OFFER
//   • Etsi tavaraa    → CIRCULAR_SUBMIT_WANTED
//   • Omat matchit    → CIRCULAR_MATCHES  (badge: odottavat matchit)
//
// Kutsuu viewModel.loadAll() avautuessaan.
// ============================================================================

import androidx.compose.foundation.background
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.Recycling
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import fi.mediazoo.lostrefound.Screen

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CircularHomeScreen(
    viewModel: CircularViewModel,
    onNavigateTo: (Screen) -> Unit,
    onBack: () -> Unit
) {
    val uiState by viewModel.uiState.collectAsState()

    // Ladataan tiedot avautuessa
    LaunchedEffect(Unit) {
        viewModel.loadAll()
    }

    // Kuinka monta matchia odottaa vastausta
    val pendingMatchCount = uiState.myMatches.count { match ->
        match.status == CircularMatchStatus.NOTIFIED
    }

    var showLinkDialog by remember { mutableStateOf(false) }
    var inputCode by remember { mutableStateOf("") }
    var linkError by remember { mutableStateOf<String?>(null) }

    if (showLinkDialog) {
        var isLinking by remember { mutableStateOf(false) }
        AlertDialog(
            onDismissRequest = { if (!isLinking) showLinkDialog = false },
            title = { Text("Yhdistä LaukaaInfo-tunniste", fontWeight = FontWeight.Bold) },
            text = {
                Column {
                    Text(
                        "Syötä LaukaaInfosta saamasi profiilitunniste (esim. LI-8K4P-72MX):",
                        fontSize = 14.sp,
                        color = Color(0xFF424242)
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    OutlinedTextField(
                        value = inputCode,
                        onValueChange = { inputCode = it.uppercase() },
                        placeholder = { Text("LI-XXXX-XXXX") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    linkError?.let { err ->
                        Spacer(modifier = Modifier.height(6.dp))
                        Text(err, color = MaterialTheme.colorScheme.error, fontSize = 12.sp)
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        if (inputCode.isBlank()) {
                            linkError = "Syötä koodi"
                            return@Button
                        }
                        isLinking = true
                        linkError = null
                        viewModel.linkActorCode(inputCode.trim()) { success, err ->
                            isLinking = false
                            if (success) {
                                showLinkDialog = false
                            } else {
                                linkError = err ?: "Yhdistäminen epäonnistui"
                            }
                        }
                    },
                    enabled = inputCode.isNotBlank() && !isLinking,
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2E7D32))
                ) {
                    if (isLinking) {
                        CircularProgressIndicator(modifier = Modifier.size(18.dp), color = Color.White, strokeWidth = 2.dp)
                        Spacer(modifier = Modifier.width(6.dp))
                    }
                    Text("Yhdistä")
                }
            },
            dismissButton = {
                TextButton(
                    onClick = { showLinkDialog = false },
                    enabled = !isLinking
                ) {
                    Text("Peruuta")
                }
            }
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Kiertotalous", fontWeight = FontWeight.Bold) },
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
                .verticalScroll(rememberScrollState())
                .background(Color(0xFFF5F5F5))
        ) {
            // Yläbanneri
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(
                        Brush.verticalGradient(
                            listOf(Color(0xFF2E7D32), Color(0xFF43A047))
                        )
                    )
                    .padding(horizontal = 24.dp, vertical = 14.dp)
            ) {
                Text(
                    "Tarjoa tai etsi käytettyä tavaraa lähialueelta",
                    color = Color.White.copy(alpha = 0.92f),
                    fontSize = 14.sp
                )
            }

            Spacer(modifier = Modifier.height(16.dp))

            // --- LaukaaInfo Toimijaprofiili ---
            Box(modifier = Modifier.padding(horizontal = 16.dp)) {
                val actor = uiState.actorProfile
                if (actor != null) {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(16.dp),
                        colors = CardDefaults.cardColors(containerColor = Color.White),
                        border = BorderStroke(1.5.dp, Color(0xFF2E7D32)),
                        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(
                                        Icons.Default.VerifiedUser,
                                        contentDescription = null,
                                        tint = Color(0xFF2E7D32),
                                        modifier = Modifier.size(20.dp)
                                    )
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text(
                                        actor.displayName,
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 16.sp,
                                        color = Color(0xFF212121)
                                    )
                                }
                                StatusBadge(
                                    label = actor.tierEnum.label,
                                    color = when (actor.tierEnum) {
                                        CircularActorTier.ORGANIZATION -> Color(0xFF6A1B9A)
                                        CircularActorTier.VERIFIED_ACTIVE -> Color(0xFF2E7D32)
                                        CircularActorTier.INDIVIDUAL -> Color(0xFF1565C0)
                                    }
                                )
                            }
                            Spacer(modifier = Modifier.height(8.dp))
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text("Tunniste: ", fontSize = 13.sp, color = Color(0xFF616161))
                                    Surface(
                                        shape = RoundedCornerShape(6.dp),
                                        color = Color(0xFFF1F8E9)
                                    ) {
                                        Text(
                                            actor.actorCode,
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 13.sp,
                                            color = Color(0xFF2E7D32),
                                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                        )
                                    }
                                }
                                Text("📍 ${actor.municipality}", fontSize = 13.sp, color = Color(0xFF757575))
                            }
                            if (actor.isMembershipActive) {
                                Spacer(modifier = Modifier.height(6.dp))
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(Icons.Default.Star, contentDescription = null, tint = Color(0xFFF57F17), modifier = Modifier.size(16.dp))
                                    Spacer(modifier = Modifier.width(4.dp))
                                    Text("LaukaaInfo Jäsen", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Color(0xFFF57F17))
                                }
                            }
                        }
                    }
                } else {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(16.dp),
                        colors = CardDefaults.cardColors(containerColor = Color.White),
                        border = BorderStroke(1.dp, Color(0xFFE0E0E0)),
                        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    "LaukaaInfo-toimijatunniste",
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 15.sp,
                                    color = Color(0xFF212121)
                                )
                                StatusBadge(label = "EI YHDISTETTY", color = Color(0xFF757575))
                            }
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                "Yhdistä toimijatunniste (esim. LI-8K4P-72MX) saadaksesi vahvistetun leiman ja luottamustason ilmoituksillesi.",
                                fontSize = 12.sp,
                                color = Color(0xFF616161),
                                lineHeight = 16.sp
                            )
                            Spacer(modifier = Modifier.height(10.dp))
                            OutlinedButton(
                                onClick = {
                                    inputCode = ""
                                    linkError = null
                                    showLinkDialog = true
                                },
                                modifier = Modifier.fillMaxWidth(),
                                colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFF2E7D32)),
                                border = BorderStroke(1.dp, Color(0xFF2E7D32))
                            ) {
                                Icon(Icons.Default.Link, contentDescription = null, modifier = Modifier.size(18.dp))
                                Spacer(modifier = Modifier.width(6.dp))
                                Text("Yhdistä LaukaaInfo-tunniste", fontWeight = FontWeight.SemiBold)
                            }
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Toimintakortit
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                CircularActionCard(
                    emoji = "🌐",
                    title = "Selaa ilmoituksia",
                    subtitle = "Katso mitä tavaroita ja materiaaleja on tarjolla",
                    backgroundColor = Color(0xFFE0F2F1),
                    accentColor = Color(0xFF00796B),
                    onClick = { onNavigateTo(Screen.CIRCULAR_BROWSE) }
                )

                CircularActionCard(
                    emoji = "📦",
                    title = "Tarjoa tavaraa",
                    subtitle = "Ilmoita tavara, jolle etsit uutta omistajaa",
                    backgroundColor = Color(0xFFE8F5E9),
                    accentColor = Color(0xFF2E7D32),
                    onClick = { onNavigateTo(Screen.CIRCULAR_SUBMIT_OFFER) }
                )

                CircularActionCard(
                    emoji = "🔍",
                    title = "Etsi tavaraa",
                    subtitle = "Hae käytettyä tavaraa lähialueelta",
                    backgroundColor = Color(0xFFE3F2FD),
                    accentColor = Color(0xFF1565C0),
                    onClick = { onNavigateTo(Screen.CIRCULAR_SUBMIT_WANTED) }
                )

                CircularActionCard(
                    emoji = "🤝",
                    title = "Matchit",
                    subtitle = if (pendingMatchCount > 0)
                        "$pendingMatchCount uutta matchia odottaa vastaustasi"
                    else
                        "Katso ilmoituksesi kohtaamiset",
                    backgroundColor = Color(0xFFFFF8E1),
                    accentColor = Color(0xFFF57F17),
                    badge = pendingMatchCount,
                    onClick = { onNavigateTo(Screen.CIRCULAR_MATCHES) }
                )

                CircularActionCard(
                    emoji = "📋",
                    title = "Omat ilmoitukset",
                    subtitle = "Hallinnoi tarjoamiasi ja etsittyjä tavaroita",
                    backgroundColor = Color(0xFFF3E5F5),
                    accentColor = Color(0xFF6A1B9A),
                    onClick = { onNavigateTo(Screen.CIRCULAR_MY_ITEMS) }
                )
            }

            // Virheviesti
            uiState.errorMessage?.let { err ->
                Spacer(modifier = Modifier.height(16.dp))
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFFFFEBEE))
                ) {
                    Row(
                        modifier = Modifier.padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("⚠️", fontSize = 18.sp)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(err, color = Color(0xFFB71C1C), fontSize = 13.sp)
                    }
                }
            }

            Spacer(modifier = Modifier.height(24.dp))

            // Infoteksti
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                shape = RoundedCornerShape(12.dp)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        "Miten toimii?",
                        fontWeight = FontWeight.Bold,
                        fontSize = 15.sp,
                        color = Color(0xFF212121)
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    InfoRow("1", "Tarjoa tai etsi — jätä ilmoitus")
                    InfoRow("2", "Järjestelmä etsii sopivat parit automaattisesti")
                    InfoRow("3", "Saat push-ilmoituksen matchista")
                    InfoRow("4", "Molemmat hyväksyvät → yhteydenotto onnistuu")
                }
            }

            Spacer(modifier = Modifier.height(32.dp))
        }
    }
}

@Composable
private fun CircularActionCard(
    emoji: String,
    title: String,
    subtitle: String,
    backgroundColor: Color,
    accentColor: Color,
    badge: Int = 0,
    onClick: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = backgroundColor),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp, vertical = 18.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(emoji, fontSize = 32.sp)
            Spacer(modifier = Modifier.width(16.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    title,
                    fontWeight = FontWeight.Bold,
                    fontSize = 17.sp,
                    color = accentColor
                )
                Text(
                    subtitle,
                    fontSize = 13.sp,
                    color = Color(0xFF616161)
                )
            }
            if (badge > 0) {
                Box(
                    modifier = Modifier
                        .size(26.dp)
                        .clip(CircleShape)
                        .background(Color(0xFFE53935)),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        badge.toString(),
                        color = Color.White,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
        }
    }
}

@Composable
private fun InfoRow(step: String, text: String) {
    Row(
        modifier = Modifier.padding(vertical = 3.dp),
        verticalAlignment = Alignment.Top
    ) {
        Box(
            modifier = Modifier
                .size(20.dp)
                .clip(CircleShape)
                .background(Color(0xFF2E7D32)),
            contentAlignment = Alignment.Center
        ) {
            Text(step, color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Bold)
        }
        Spacer(modifier = Modifier.width(10.dp))
        Text(text, fontSize = 13.sp, color = Color(0xFF424242))
    }
}

