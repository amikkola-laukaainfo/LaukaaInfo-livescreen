package fi.mediazoo.lostrefound.circular

// ============================================================================
// CircularMyItemsScreen – Omat OFFER- ja WANTED-ilmoitukset
//
// Näyttää käyttäjän omat ilmoitukset ja antaa hallinnoida niitä:
// - Tilan vaihto (Aktiivinen / Varattu / Toteutunut)
// - Poisto vahvistusdialogilla
// - Kuvan klikkaus avaa kuvaselaimen (swipe-selaus kokonaisena)
// ============================================================================

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CircularMyItemsScreen(
    viewModel: CircularViewModel,
    onBack: () -> Unit
) {
    val uiState by viewModel.uiState.collectAsState()
    var itemToDelete by remember { mutableStateOf<CircularItem?>(null) }
    var galleryImages by remember { mutableStateOf<List<String>?>(null) }

    LaunchedEffect(Unit) {
        viewModel.loadMyItems()
    }

    // Poiston vahvistusdialogi
    itemToDelete?.let { item ->
        AlertDialog(
            onDismissRequest = { itemToDelete = null },
            title = { Text("Poistetaanko ilmoitus?", fontWeight = FontWeight.Bold) },
            text = { Text("Haluatko varmasti poistaa ilmoituksen \"${item.title}\"?") },
            confirmButton = {
                Button(
                    onClick = {
                        viewModel.deleteItem(item.id)
                        itemToDelete = null
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFD32F2F))
                ) {
                    Text("Poista")
                }
            },
            dismissButton = {
                TextButton(onClick = { itemToDelete = null }) {
                    Text("Peruuta")
                }
            }
        )
    }

    // Koko ruudun / swipe-kuvagalleriadialogi
    galleryImages?.let { urls ->
        CircularImageGalleryDialog(
            imageUrls = urls,
            onDismiss = { galleryImages = null }
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Omat ilmoitukset", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Takaisin")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Color(0xFF6A1B9A),
                    titleContentColor = Color.White,
                    navigationIconContentColor = Color.White
                )
            )
        }
    ) { padding ->
        PullToRefreshBox(
            isRefreshing = uiState.isLoadingItems,
            onRefresh = { viewModel.loadMyItems() },
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            if (uiState.isLoadingItems && uiState.myItems.isEmpty()) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            } else if (uiState.myItems.isEmpty()) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("📋", fontSize = 48.sp)
                        Spacer(modifier = Modifier.height(12.dp))
                        Text(
                            "Ei omia ilmoituksia",
                            fontSize = 16.sp,
                            color = Color(0xFF757575)
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            "Tarjoa tai etsi tavaraa aloitusnäkymästä",
                            fontSize = 13.sp,
                            color = Color(0xFF9E9E9E)
                        )
                    }
                }
            } else {
                LazyColumn(
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    items(uiState.myItems, key = { it.id }) { item ->
                        CircularItemRow(
                            item = item,
                            onStatusChange = { newStatus -> viewModel.updateItemStatus(item.id, newStatus) },
                            onDelete = { itemToDelete = item },
                            onImageClick = { galleryImages = item.imageUrls }
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun CircularItemRow(
    item: CircularItem,
    onStatusChange: (String) -> Unit,
    onDelete: () -> Unit,
    onImageClick: () -> Unit
) {
    val typeColor   = if (item.itemType == CircularItemType.OFFER) Color(0xFF2E7D32) else Color(0xFF1565C0)
    val typeLabel   = if (item.itemType == CircularItemType.OFFER) "TARJOUS" else "ETSITÄÄN"
    val statusColor = when (item.status) {
        CircularItemStatus.ACTIVE    -> Color(0xFF43A047)
        CircularItemStatus.RESERVED  -> Color(0xFF1565C0)
        CircularItemStatus.FULFILLED -> Color(0xFF6A1B9A)
        CircularItemStatus.EXPIRED   -> Color(0xFF757575)
        CircularItemStatus.DELETED   -> Color(0xFF757575)
    }
    val statusLabel = when (item.status) {
        CircularItemStatus.ACTIVE    -> "Aktiivinen"
        CircularItemStatus.RESERVED  -> "Varattu"
        CircularItemStatus.FULFILLED -> "Toteutunut"
        CircularItemStatus.EXPIRED   -> "Vanhentunut"
        CircularItemStatus.DELETED   -> "Poistettu"
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            // Ylärivi: Tagit + Hinta/Maksuton
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    StatusBadge(label = typeLabel, color = typeColor)
                    StatusBadge(label = statusLabel, color = statusColor)
                }

                // Hinta / Luovutusehto teksti
                val priceText = when (item.exchangeType) {
                    "FREE", "WANT_FREE" -> "Maksuton"
                    "FIXED_PRICE" -> if (item.priceAmount != null) "${item.priceAmount.toInt()} €" else "Kiinteä hinta"
                    "MAX_BUDGET" -> if (item.priceAmount != null) "Max ${item.priceAmount.toInt()} €" else "Budjetti"
                    "NEGOTIABLE", "CAN_PAY_REASONABLE" -> "Sovittavissa"
                    "EXCHANGE", "CAN_EXCHANGE" -> "Vaihto"
                    else -> if (item.priceEur > 0) "${item.priceEur.toInt()} €" else "Maksuton"
                }
                Text(
                    priceText,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF2E7D32)
                )
            }

            Spacer(modifier = Modifier.height(10.dp))

            // Kuva (kokonaisena) + Otsikko ja kuvaus
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.Top
            ) {
                if (item.imageUrls.isNotEmpty()) {
                    Box(
                        modifier = Modifier
                            .size(76.dp)
                            .clip(RoundedCornerShape(8.dp))
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
                    Spacer(modifier = Modifier.width(10.dp))
                }

                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        item.title,
                        fontWeight = FontWeight.Bold,
                        fontSize = 15.sp,
                        color = Color(0xFF212121)
                    )
                    item.description?.takeIf { it.isNotBlank() }?.let { desc ->
                        Spacer(modifier = Modifier.height(3.dp))
                        Text(
                            desc,
                            fontSize = 12.sp,
                            color = Color(0xFF616161),
                            maxLines = 2
                        )
                    }
                    item.placeNameSnapshot?.let { place ->
                        Spacer(modifier = Modifier.height(3.dp))
                        Text("📍 $place", fontSize = 11.sp, color = Color(0xFF757575))
                    }
                }
            }

            // Alapalkki: Toiminnot (Tilan muutos & Poista)
            Spacer(modifier = Modifier.height(12.dp))
            HorizontalDivider(color = Color(0xFFEEEEEE), thickness = 1.dp)
            Spacer(modifier = Modifier.height(8.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Tilamuutokset
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    if (item.status == CircularItemStatus.ACTIVE) {
                        OutlinedButton(
                            onClick = { onStatusChange("RESERVED") },
                            contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp),
                            modifier = Modifier.height(32.dp)
                        ) {
                            Text("Merkitse varatuksi", fontSize = 11.sp)
                        }
                        OutlinedButton(
                            onClick = { onStatusChange("FULFILLED") },
                            contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp),
                            modifier = Modifier.height(32.dp)
                        ) {
                            Text("Toteutunut ✓", fontSize = 11.sp)
                        }
                    } else if (item.status == CircularItemStatus.RESERVED) {
                        OutlinedButton(
                            onClick = { onStatusChange("ACTIVE") },
                            contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp),
                            modifier = Modifier.height(32.dp)
                        ) {
                            Text("Vapauta aktiiviseksi", fontSize = 11.sp)
                        }
                        Button(
                            onClick = { onStatusChange("FULFILLED") },
                            contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp),
                            modifier = Modifier.height(32.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF6A1B9A))
                        ) {
                            Text("Toteutunut ✓", fontSize = 11.sp)
                        }
                    } else if (item.status == CircularItemStatus.FULFILLED) {
                        OutlinedButton(
                            onClick = { onStatusChange("ACTIVE") },
                            contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp),
                            modifier = Modifier.height(32.dp)
                        ) {
                            Text("Palauta aktiiviseksi", fontSize = 11.sp)
                        }
                    }
                }

                // Poista-painike
                IconButton(
                    onClick = onDelete,
                    modifier = Modifier.size(32.dp)
                ) {
                    Icon(
                        Icons.Default.Delete,
                        contentDescription = "Poista",
                        tint = Color(0xFFD32F2F),
                        modifier = Modifier.size(18.dp)
                    )
                }
            }
        }
    }
}
