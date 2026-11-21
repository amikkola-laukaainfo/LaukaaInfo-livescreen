package fi.mediazoo.lostrefound.circular

// ============================================================================
// CircularMatchDetailScreen – Yksittäisen matchin tiedot + hyväksyntä
//
// Näyttää:
//   • OFFER- ja WANTED-ilmoitusten otsikot
//   • Sopivuusprosentit
//   • Nouto-preferenssi
//   • Aikaleimoja
//   • Hyväksy / Hylkää -painikkeet (vain kun NOTIFIED eikä vielä hyväksynyt)
//   • Juhlakortit molemminpuoliseen hyväksyntään
// ============================================================================

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.*
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
fun CircularMatchDetailScreen(
    match: CircularMatch,
    currentUid: String,
    viewModel: CircularViewModel,
    onBack: () -> Unit
) {
    val uiState by viewModel.uiState.collectAsState()

    // Päivitetty matchin versio tilasta (kun loadMyMatches on päivittänyt)
    val liveMatch = uiState.myMatches.firstOrNull { it.id == match.id } ?: match

    var showRejectDialog by remember { mutableStateOf(false) }
    var rejectReason     by remember { mutableStateOf("") }

    val myAccepted  = liveMatch.hasCurrentUserAccepted(currentUid)
    val isMutual    = liveMatch.status == CircularMatchStatus.RESERVED ||
                      (liveMatch.offerAcceptedAt != null && liveMatch.wantedAcceptedAt != null)

    val canRespond  = (liveMatch.status == CircularMatchStatus.NOTIFIED ||
                       liveMatch.status == CircularMatchStatus.ACCEPTED) && !myAccepted

    val statusColor = when (liveMatch.status) {
        CircularMatchStatus.NOTIFIED  -> Color(0xFFF57F17)
        CircularMatchStatus.ACCEPTED  -> Color(0xFF2E7D32)
        CircularMatchStatus.RESERVED  -> Color(0xFF1565C0)
        CircularMatchStatus.FULFILLED -> Color(0xFF6A1B9A)
        CircularMatchStatus.REJECTED  -> Color(0xFF757575)
        else                          -> Color(0xFF9E9E9E)
    }

    // Hylkäysdialoogi
    if (showRejectDialog) {
        AlertDialog(
            onDismissRequest = { showRejectDialog = false },
            title = { Text("Hylkää match") },
            text = {
                Column {
                    Text("Voit halutessasi kertoa syyn hylkäykseen:")
                    Spacer(modifier = Modifier.height(8.dp))
                    OutlinedTextField(
                        value = rejectReason,
                        onValueChange = { rejectReason = it },
                        label = { Text("Syy (valinnainen)") },
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        showRejectDialog = false
                        viewModel.rejectMatch(liveMatch.id, rejectReason.trim().ifBlank { null })
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFE53935))
                ) { Text("Hylkää") }
            },
            dismissButton = {
                TextButton(onClick = { showRejectDialog = false }) { Text("Peruuta") }
            }
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Matchin tiedot", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Takaisin")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = statusColor,
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
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {

            // --- Juhlakori (molemminpuolinen hyväksyntä) ---
            if (isMutual) {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFFE8F5E9)),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text("🎉", fontSize = 40.sp)
                        Spacer(modifier = Modifier.height(6.dp))
                        Text(
                            "Kohtaaminen vahvistettu!",
                            fontWeight = FontWeight.Bold,
                            fontSize = 17.sp,
                            color = Color(0xFF2E7D32)
                        )
                        Text(
                            "Molemmat osapuolet ovat hyväksyneet. Sopikaa toimitus keskenänne.",
                            fontSize = 13.sp,
                            color = Color(0xFF388E3C),
                            modifier = Modifier.padding(top = 4.dp)
                        )
                    }
                }
            }

            // --- Tila ---
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                elevation = CardDefaults.cardElevation(2.dp)
            ) {
                Column(modifier = Modifier.padding(14.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("Tila", fontWeight = FontWeight.SemiBold, color = Color(0xFF616161))
                        StatusBadge(label = liveMatch.statusLabel.uppercase(), color = statusColor)
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                    DetailRow("Sopivuus", "${(liveMatch.totalScore * 100).roundToInt()}%")
                    DetailRow("Varmuus",  "${(liveMatch.matchConfidence * 100).roundToInt()}%")
                    DetailRow("Täyttyminen", "${(liveMatch.fulfillmentScore * 100).roundToInt()}%")
                    DetailRow("Nouto", pickupModeLabel(liveMatch.pickupMode))
                }
            }

            // --- Ilmoitusten otsikot ---
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                elevation = CardDefaults.cardElevation(2.dp)
            ) {
                Column(modifier = Modifier.padding(14.dp)) {
                    Text("Ilmoitukset", fontWeight = FontWeight.SemiBold, color = Color(0xFF616161))
                    Spacer(modifier = Modifier.height(8.dp))
                    Row(verticalAlignment = Alignment.Top) {
                        Text("📦", fontSize = 16.sp, modifier = Modifier.padding(top = 1.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Column {
                            Text("Tarjous", fontSize = 11.sp, color = Color(0xFF9E9E9E))
                            Text(liveMatch.offerTitle ?: "—", fontWeight = FontWeight.Medium)
                        }
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                    Row(verticalAlignment = Alignment.Top) {
                        Text("🔍", fontSize = 16.sp, modifier = Modifier.padding(top = 1.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Column {
                            Text("Etsintä", fontSize = 11.sp, color = Color(0xFF9E9E9E))
                            Text(liveMatch.wantedTitle ?: "—", fontWeight = FontWeight.Medium)
                        }
                    }
                }
            }

            // --- Hyväksyntätilanne ---
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                elevation = CardDefaults.cardElevation(2.dp)
            ) {
                Column(modifier = Modifier.padding(14.dp)) {
                    Text("Hyväksynnät", fontWeight = FontWeight.SemiBold, color = Color(0xFF616161))
                    Spacer(modifier = Modifier.height(8.dp))
                    AcceptanceRow(
                        label = "Tarjoaja",
                        accepted = liveMatch.offerAcceptedAt != null,
                        isMe = liveMatch.isOfferSide(currentUid),
                        timestamp = liveMatch.offerAcceptedAt?.take(16)
                    )
                    Spacer(modifier = Modifier.height(6.dp))
                    AcceptanceRow(
                        label = "Etsijä",
                        accepted = liveMatch.wantedAcceptedAt != null,
                        isMe = liveMatch.isWantedSide(currentUid),
                        timestamp = liveMatch.wantedAcceptedAt?.take(16)
                    )
                }
            }

            // --- Virhe / onnistuminen ---
            uiState.errorMessage?.let { err ->
                Card(colors = CardDefaults.cardColors(containerColor = Color(0xFFFFEBEE))) {
                    Text("⚠️ $err", modifier = Modifier.padding(12.dp), color = Color(0xFFB71C1C), fontSize = 13.sp)
                }
            }
            uiState.successMessage?.let { msg ->
                Card(colors = CardDefaults.cardColors(containerColor = Color(0xFFE8F5E9))) {
                    Text("✅ $msg", modifier = Modifier.padding(12.dp), color = Color(0xFF2E7D32), fontSize = 13.sp)
                }
            }

            // --- Toimintopainikkeet ---
            if (canRespond) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    // Hyväksy
                    Button(
                        onClick = { viewModel.acceptMatch(liveMatch.id) },
                        enabled = !uiState.isResponding,
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2E7D32))
                    ) {
                        if (uiState.isResponding) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(16.dp),
                                color = Color.White,
                                strokeWidth = 2.dp
                            )
                        } else {
                            Text("✅ Hyväksy", fontWeight = FontWeight.Bold)
                        }
                    }

                    // Hylkää
                    OutlinedButton(
                        onClick = { showRejectDialog = true },
                        enabled = !uiState.isResponding,
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFFE53935))
                    ) {
                        Text("❌ Hylkää", fontWeight = FontWeight.Bold)
                    }
                }
            } else if (!canRespond && !myAccepted &&
                (liveMatch.status == CircularMatchStatus.NOTIFIED ||
                 liveMatch.status == CircularMatchStatus.ACCEPTED)) {
                // Ei pitäisi koskaan tapahtua, mutta varmuuden vuoksi
            } else if (myAccepted && !isMutual) {
                Card(
                    colors = CardDefaults.cardColors(containerColor = Color(0xFFFFF8E1))
                ) {
                    Text(
                        "⏳ Olet hyväksynyt — odotetaan toista osapuolta",
                        modifier = Modifier.padding(12.dp),
                        fontSize = 13.sp,
                        color = Color(0xFFF57F17)
                    )
                }
            }

            Spacer(modifier = Modifier.height(24.dp))
        }
    }
}

@Composable
private fun DetailRow(label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 2.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(label, fontSize = 13.sp, color = Color(0xFF757575))
        Text(value, fontSize = 13.sp, fontWeight = FontWeight.Medium)
    }
}

@Composable
private fun AcceptanceRow(label: String, accepted: Boolean, isMe: Boolean, timestamp: String?) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically
    ) {
        val icon  = if (accepted) "✅" else "⏳"
        val color = if (accepted) Color(0xFF2E7D32) else Color(0xFF9E9E9E)
        Text(icon, fontSize = 16.sp)
        Spacer(modifier = Modifier.width(8.dp))
        Column {
            Text(
                "${label}${if (isMe) " (sinä)" else ""}",
                fontSize = 13.sp,
                fontWeight = FontWeight.Medium,
                color = color
            )
            timestamp?.let { Text(it.replace("T", " "), fontSize = 11.sp, color = Color(0xFF9E9E9E)) }
        }
    }
}

private fun pickupModeLabel(mode: PickupMode) = when (mode) {
    PickupMode.DIRECT  -> "Suoraan"
    PickupMode.STORAGE -> "Varastointi"
}

