package fi.mediazoo.lostrefound

import android.app.ActivityManager
import android.content.Context
import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import fi.mediazoo.lostrefound.model.ItemCategory
import fi.mediazoo.lostrefound.model.LostItem
import androidx.compose.runtime.saveable.rememberSaveable
import kotlinx.coroutines.delay
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit
import android.content.Intent
import android.os.Build
import android.Manifest
import com.google.accompanist.permissions.ExperimentalPermissionsApi
import com.google.accompanist.permissions.isGranted
import com.google.accompanist.permissions.rememberPermissionState
import com.google.accompanist.permissions.rememberMultiplePermissionsState

@OptIn(ExperimentalMaterial3Api::class, ExperimentalPermissionsApi::class)
@Composable
fun LandingScreen(
    onAreaSelected: (String) -> Unit,
    onEventSelected: (String) -> Unit,
    onAdminAccess: () -> Unit,
    onSearchById: (String) -> Unit,
    onShowAll: () -> Unit,
    onShowList: () -> Unit,
    onShowMap: () -> Unit,
    onChangeArea: () -> Unit,
    onCategorySelected: (ItemCategory) -> Unit,
    onReportItem: (ItemCategory) -> Unit,
    onReportObservation: (fi.mediazoo.lostrefound.model.ObservationType) -> Unit,
    onOrganizationSelected: (String, String) -> Unit,
    firebaseService: FirebaseService,
    selectedArea: String?,
    selectedEventId: String? = null,
    selectedEventName: String? = null,
    selectedOrganizationName: String? = null,
    onSearchQueryChanged: (String) -> Unit,
    unreadChatsCount: Int = 0,
    onMyChatsClick: () -> Unit = {},
    onShowObservations: () -> Unit,
    onShowWebObservations: () -> Unit = {},
    onStartObservationCollection: () -> Unit = {},
    onCircularClick: () -> Unit = {},
    onCircularOfferClick: () -> Unit = {},
    onCircularWantedClick: () -> Unit = {}
) {
    var newPlaceName by remember { mutableStateOf("") }
    
    var showObservationTypeSheet by remember { mutableStateOf(false) }
    val observationSheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    LaunchedEffect(selectedArea) {  }
    var searchId by remember { mutableStateOf("") }
    var searchText by remember { mutableStateOf("") }
    var tapCount by remember { mutableStateOf(0) }
    var lastTapTime by remember { mutableStateOf(0L) }
    var showInfoDialog by remember { mutableStateOf(false) }
    var showAreaOptionsDialog by remember { mutableStateOf(false) }
    var isFinderModeActive by remember { mutableStateOf(false) }
    var showPermissionDisclosure by remember { mutableStateOf(false) }
    val context = LocalContext.current
    val prefs = rememberPreferences()
    var hasCheckedFollowedItems by rememberSaveable { mutableStateOf(false) }
    var showFollowedPopup by remember { mutableStateOf(false) }
    var newFollowedItems by remember { mutableStateOf<List<LostItem>>(emptyList()) }
    var followedPopupTitle by remember { mutableStateOf("") }
    var currentFollowedArea by remember { mutableStateOf(prefs.getFollowedArea()) }
    var currentFollowedEventId by remember { mutableStateOf(prefs.getFollowedEventId()) }
    
    val activeCollection by CollectionRepository.activeCollection.collectAsState()

    // Check if service is already running when screen opens
    LaunchedEffect(Unit) {
        CollectionRepository.init(context)
        isFinderModeActive = isServiceRunning(context, FinderModeService::class.java)
    }

    val scrollState = rememberScrollState()

    // Permissions for Finder Mode
    val locationPermissions = rememberMultiplePermissionsState(
        listOf(
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION
        )
    )
    
    val notificationPermission = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        rememberPermissionState(Manifest.permission.POST_NOTIFICATIONS)
    } else {
        null
    }

    LaunchedEffect(tapCount) {
        if (tapCount > 0) {
            delay(2000)
            if (tapCount < 5) {
                tapCount = 0
            }
        }
    }

    LaunchedEffect(hasCheckedFollowedItems) {
        if (!hasCheckedFollowedItems) {
            val fArea = prefs.getFollowedArea()
            val fEventId = prefs.getFollowedEventId()
            val fEventName = prefs.getFollowedEventName()
            if (fArea != null || fEventId != null) {
                val lastSeen = prefs.getLastSeenFollowedTime()
                try {
                    val items = firebaseService.getItems(area = fArea, eventId = fEventId)
                    val sortedItems = items.sortedByDescending { it.timestamp?.toDate()?.time ?: 0L }
                    val newItems = sortedItems.filter { (it.timestamp?.toDate()?.time ?: 0L) > lastSeen }
                    if (newItems.isNotEmpty()) {
                        newFollowedItems = newItems.take(3)
                        followedPopupTitle = fEventName ?: fArea ?: ""
                        showFollowedPopup = true
                        prefs.saveLastSeenFollowedTime(System.currentTimeMillis())
                    }
                } catch (e: Exception) {
                    // Ignore
                }
            }
            hasCheckedFollowedItems = true
        }
    }

    Scaffold(
        topBar = {
            CenterAlignedTopAppBar(
                title = { 
                    Text(
                        "LostReFound",
                        style = MaterialTheme.typography.headlineMedium.copy(
                            fontWeight = FontWeight.ExtraBold,
                            color = Color.White
                        )
                    )
                },
                actions = {
                    Box(modifier = Modifier.padding(end = 8.dp)) {
                        IconButton(onClick = onMyChatsClick) {
                            Icon(Icons.Default.Email, contentDescription = "Omat keskustelut", tint = Color.White)
                        }
                        if (unreadChatsCount > 0) {
                            Badge(
                                modifier = Modifier.align(Alignment.TopEnd).padding(top = 8.dp, end = 8.dp),
                                containerColor = Color.Red,
                                contentColor = Color.White
                            ) {
                                Text(text = unreadChatsCount.toString())
                            }
                        }
                    }
                },
                colors = TopAppBarDefaults.centerAlignedTopAppBarColors(
                    containerColor = Color(0xFF0077b6)
                )
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(Color(0xFFF8F9FA))
                .padding(padding)
                .verticalScroll(scrollState)
                .padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // "Hidden" Admin Access trigger on the welcome text
            Column(
                modifier = Modifier
                    .padding(top = 8.dp, bottom = 14.dp)
                    .clickable {
                        val currentTime = System.currentTimeMillis()
                        if (currentTime - lastTapTime < 500) {
                            tapCount++
                            if (tapCount == 5) {
                                onAdminAccess()
                                tapCount = 0
                            }
                        } else {
                            tapCount = 1
                        }
                        lastTapTime = currentTime
                    },
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    text = "Mitä haluat tehdä?",
                    style = MaterialTheme.typography.titleLarge.copy(
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF1D3557)
                    ),
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "Valitse toiminto aloittaaksesi",
                    style = MaterialTheme.typography.bodyMedium.copy(
                        color = Color(0xFF556575)
                    ),
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center
                )
            }

            // PÄÄTOIMINNOT: Kadotin / Löysin
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                ReportCard(
                    title = "Kadotin\ntavaran 😟",
                    subtitle = "Tee ilmoitus",
                    icon = Icons.Default.Search,
                    containerColor = Color(0xFFFF6B6B),
                    contentColor = Color.White,
                    borderColor = Color(0xFFFF5252),
                    gradientColors = listOf(Color(0xFFFF8A8A), Color(0xFFD32F2F)),
                    modifier = Modifier.weight(1f).height(125.dp),
                    onClick = { onReportItem(ItemCategory.LOST) }
                )
                ReportCard(
                    title = "Löysin\ntavaran 😊",
                    subtitle = "Tee ilmoitus",
                    icon = Icons.Default.CheckCircle,
                    containerColor = Color(0xFF20C997),
                    contentColor = Color.White,
                    borderColor = Color(0xFF1BA37A),
                    gradientColors = listOf(Color(0xFF56E3B9), Color(0xFF0F8A5F)),
                    modifier = Modifier.weight(1f).height(125.dp),
                    onClick = { onReportItem(ItemCategory.FOUND) }
                )
            }

            Spacer(modifier = Modifier.height(10.dp))

            // PAIKALLINEN HAVAINTO
            Card(
                onClick = { showObservationTypeSheet = true },
                colors = CardDefaults.cardColors(containerColor = Color(0xFFFFF9EE)),
                border = BorderStroke(1.2.dp, Color(0xFFF9A825)),
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 14.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("📸", fontSize = 28.sp)
                    Spacer(modifier = Modifier.width(12.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "Tee paikallinen havainto",
                            fontWeight = FontWeight.Bold,
                            fontSize = 15.sp,
                            color = Color(0xFFE65100)
                        )
                        Text(
                            text = "Ilmoita ympäristön tapahtumasta tai tilanteesta",
                            fontSize = 12.sp,
                            color = Color(0xFF795548)
                        )
                    }
                    Text(
                        "Ilmoita →",
                        fontWeight = FontWeight.Bold,
                        fontSize = 13.sp,
                        color = Color(0xFFE65100)
                    )
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            // KIERTOTALOUS (Oma visuaalinen palvelualueensa)
            Card(
                colors = CardDefaults.cardColors(containerColor = Color(0xFFF1F8E9)),
                border = BorderStroke(1.2.dp, Color(0xFF81C784)),
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(14.dp)) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable(onClick = onCircularClick),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("♻️", fontSize = 26.sp)
                        Spacer(modifier = Modifier.width(10.dp))
                        Column(modifier = Modifier.weight(1f, fill = false)) {
                            Text(
                                text = "Kiertotalous",
                                fontWeight = FontWeight.Bold,
                                fontSize = 16.sp,
                                color = Color(0xFF2E7D32)
                            )
                            Text(
                                text = "Tarjoa tai etsi käytettyjä tavaroita ja materiaaleja",
                                fontSize = 12.sp,
                                color = Color(0xFF558B2F)
                            )
                        }
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = "Avaa →",
                            fontWeight = FontWeight.Bold,
                            fontSize = 13.sp,
                            color = Color(0xFF2E7D32),
                            maxLines = 1,
                            softWrap = false,
                            modifier = Modifier.padding(start = 2.dp)
                        )
                    }

                    Spacer(modifier = Modifier.height(10.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        OutlinedButton(
                            onClick = onCircularOfferClick,
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(10.dp),
                            border = BorderStroke(1.dp, Color(0xFF81C784)),
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFF2E7D32)),
                            contentPadding = PaddingValues(vertical = 6.dp, horizontal = 8.dp)
                        ) {
                            Text("📦 Tarjoa tavaraa", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        }

                        OutlinedButton(
                            onClick = onCircularWantedClick,
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(10.dp),
                            border = BorderStroke(1.dp, Color(0xFF81C784)),
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFF2E7D32)),
                            contentPadding = PaddingValues(vertical = 6.dp, horizontal = 8.dp)
                        ) {
                            Text("🔍 Etsi tavaraa", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(20.dp))

            // YHDISTETTY SISÄLTÖALUE: TUTUSTU ILMOITUKSIIN
            val isCollActive = activeCollection?.isActive == true
            var browseTab by remember { mutableStateOf(0) } // 0 = Tavarat, 1 = Havainnot

            Card(
                shape = RoundedCornerShape(20.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(14.dp)) {
                    Text(
                        "Tutustu ilmoituksiin",
                        fontWeight = FontWeight.Bold,
                        fontSize = 16.sp,
                        color = Color(0xFF1D3557)
                    )

                    Spacer(modifier = Modifier.height(10.dp))

                    TabRow(
                        selectedTabIndex = browseTab,
                        containerColor = Color(0xFFF1F5F9),
                        contentColor = Color(0xFF0077B6),
                        modifier = Modifier.clip(RoundedCornerShape(12.dp))
                    ) {
                        Tab(
                            selected = browseTab == 0,
                            onClick = { browseTab = 0 },
                            text = { Text("📦 Tavarat", fontWeight = FontWeight.SemiBold, fontSize = 13.sp) }
                        )
                        Tab(
                            selected = browseTab == 1,
                            onClick = { browseTab = 1 },
                            text = { Text("📸 Havainnot", fontWeight = FontWeight.SemiBold, fontSize = 13.sp) }
                        )
                    }

                    Spacer(modifier = Modifier.height(12.dp))

                    if (browseTab == 0) {
                        // Tavarat (Kadonneet ja löydetyt)
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(
                                "Kadonneet ja löydetyt tavarat",
                                fontSize = 13.sp,
                                color = Color(0xFF64748B)
                            )
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Button(
                                    onClick = onShowList,
                                    modifier = Modifier.weight(1f),
                                    shape = RoundedCornerShape(10.dp),
                                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0077B6))
                                ) {
                                    Icon(Icons.Default.List, contentDescription = null, modifier = Modifier.size(16.dp))
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text("Selaa listaa", fontSize = 13.sp)
                                }
                                OutlinedButton(
                                    onClick = onShowMap,
                                    modifier = Modifier.weight(1f),
                                    shape = RoundedCornerShape(10.dp)
                                ) {
                                    Icon(Icons.Default.Map, contentDescription = null, modifier = Modifier.size(16.dp))
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text("Kartalla", fontSize = 13.sp)
                                }
                            }
                        }
                    } else {
                        // Paikalliset havainnot
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(
                                "Paikalliset havainnot, ongelmat ja vinkit",
                                fontSize = 13.sp,
                                color = Color(0xFF64748B)
                            )
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Button(
                                    onClick = onShowObservations,
                                    modifier = Modifier.weight(1f),
                                    shape = RoundedCornerShape(10.dp),
                                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2A9D8F))
                                ) {
                                    Icon(Icons.Default.Warning, contentDescription = null, modifier = Modifier.size(16.dp))
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text("Havaintosyöte", fontSize = 13.sp)
                                }
                                OutlinedButton(
                                    onClick = onStartObservationCollection,
                                    modifier = Modifier.weight(1f),
                                    shape = RoundedCornerShape(10.dp)
                                ) {
                                    Text(if (isCollActive) "Jatka tilaa" else "Havaintotila", fontSize = 13.sp)
                                }
                            }
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(24.dp))
            HorizontalDivider(color = Color(0xFFE0E0E0), modifier = Modifier.padding(horizontal = 32.dp))
            Spacer(modifier = Modifier.height(24.dp))

            // BOTTOM AREA SELECTION
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(24.dp),
                color = Color(0xFFEDF2F4)
            ) {
                Column(modifier = Modifier.fillMaxWidth()) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { showAreaOptionsDialog = true }
                            .padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.Center
                    ) {
                        Icon(
                            Icons.Default.LocationOn,
                            contentDescription = null,
                            tint = Color(0xFF1D3557),
                            modifier = Modifier.size(24.dp)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Column {
                            Text(
                                text = "Nykyinen alue:",
                                style = MaterialTheme.typography.labelSmall,
                                color = Color.Gray
                            )
                            Text(
                                text = selectedOrganizationName
                                    ?: selectedEventName
                                    ?: selectedArea?.let { parseCityName(it) }
                                    ?: "Koko Suomi",
                                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                                color = Color(0xFF1D3557)
                            )
                        }
                        Spacer(modifier = Modifier.weight(1f))
                        Text(
                            "Asetukset",
                            style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Bold),
                            color = Color(0xFF0077b6)
                        )
                    }
                }
            }
            
            Spacer(modifier = Modifier.height(16.dp))
            
            TextButton(onClick = { showInfoDialog = true }) {
                Icon(Icons.Default.Info, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(4.dp))
                Text("Tietoa sovelluksesta")
            }
        }
    }

    if (showInfoDialog) {
        InfoDialog(onDismiss = { showInfoDialog = false })
    }

    if (showAreaOptionsDialog) {
        val currentName = selectedOrganizationName ?: selectedEventName ?: selectedArea?.let { parseCityName(it) } ?: "Koko Suomi"
        val isFollowing = currentFollowedArea == selectedArea && currentFollowedEventId == selectedEventId && (selectedArea != null || selectedEventId != null)
        
        AlertDialog(
            onDismissRequest = { showAreaOptionsDialog = false },
            title = { Text("Alueasetukset", fontWeight = FontWeight.Bold) },
            text = {
                Column {
                    Text("Nykyinen alue:", style = MaterialTheme.typography.labelMedium, color = Color.Gray)
                    Text(currentName, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = Color(0xFF1D3557))
                    
                    Spacer(modifier = Modifier.height(24.dp))
                    
                    if (selectedArea != null || selectedEventId != null) {
                        OutlinedButton(
                            onClick = {
                                if (isFollowing) {
                                    prefs.saveFollowedArea(null, null, null)
                                    currentFollowedArea = null
                                    currentFollowedEventId = null
                                    WorkManager.getInstance(context).cancelUniqueWork("FollowedAreaWorker")
                                    Toast.makeText(context, "Seuranta lopetettu", Toast.LENGTH_SHORT).show()
                                } else {
                                    prefs.saveFollowedArea(selectedArea, selectedEventId, selectedEventName)
                                    currentFollowedArea = selectedArea
                                    currentFollowedEventId = selectedEventId
                                    
                                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && notificationPermission?.status?.isGranted != true) {
                                        notificationPermission?.launchPermissionRequest()
                                    }
                                    
                                    val constraints = Constraints.Builder()
                                        .setRequiredNetworkType(NetworkType.CONNECTED)
                                        .build()
                                        
                                    val workRequest = PeriodicWorkRequestBuilder<FollowedAreaWorker>(15, TimeUnit.MINUTES)
                                        .setConstraints(constraints)
                                        .build()
                                        
                                    WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                                        "FollowedAreaWorker",
                                        ExistingPeriodicWorkPolicy.UPDATE,
                                        workRequest
                                    )
                                    
                                    Toast.makeText(context, "Aluetta seurataan", Toast.LENGTH_SHORT).show()
                                }
                                showAreaOptionsDialog = false
                            },
                            modifier = Modifier.fillMaxWidth().height(56.dp),
                            shape = RoundedCornerShape(16.dp),
                            border = androidx.compose.foundation.BorderStroke(2.dp, if (isFollowing) Color(0xFFE63946) else Color(0xFF0077b6)),
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = if (isFollowing) Color(0xFFE63946) else Color(0xFF0077b6))
                        ) {
                            Icon(if (isFollowing) Icons.Default.Favorite else Icons.Default.FavoriteBorder, contentDescription = null)
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(if (isFollowing) "Lopeta seuraaminen" else "Seuraa tätä aluetta", fontWeight = FontWeight.Bold)
                        }
                    } else {
                        Text("Valitse tietty alue, kaupunki tai tapahtuma voidaksesi seurata sitä.", style = MaterialTheme.typography.bodySmall, color = Color.Gray)
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = { 
                        showAreaOptionsDialog = false
                        onChangeArea() 
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0077b6))
                ) {
                    Text("Vaihda alue")
                }
            },
            dismissButton = {
                TextButton(onClick = { showAreaOptionsDialog = false }) {
                    Text("Sulje")
                }
            }
        )
    }

    if (showPermissionDisclosure) {
        PermissionDisclosureDialog(
            onDismiss = { showPermissionDisclosure = false },
            onConfirm = {
                showPermissionDisclosure = false
                val locationGranted = locationPermissions.allPermissionsGranted
                val notificationGranted = notificationPermission?.status?.isGranted ?: true

                if (locationGranted && notificationGranted) {
                    // Start service immediately
                    val intent = Intent(context, FinderModeService::class.java)
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        context.startForegroundService(intent)
                    } else {
                        context.startService(intent)
                    }
                    isFinderModeActive = true
                    Toast.makeText(context, "Löytäjätila aktivoitu", Toast.LENGTH_SHORT).show()
                } else {
                    // Trigger actual system requests
                    if (!locationGranted) {
                        locationPermissions.launchMultiplePermissionRequest()
                    } else if (!notificationGranted) {
                        notificationPermission?.launchPermissionRequest()
                    }
                }
            }
        )
    }

    if (showFollowedPopup) {
        AlertDialog(
            onDismissRequest = { showFollowedPopup = false },
            title = {
                Text(
                    "Uutta seuratualla alueella",
                    style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
                    color = Color(0xFF0077b6)
                )
            },
            text = {
                Column {
                    Text(
                        "Alueella $followedPopupTitle on julkaistu ${newFollowedItems.size} uutta ilmoitusta sitten viime näkemän.",
                        style = MaterialTheme.typography.bodyMedium
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    newFollowedItems.forEach { item ->
                        Text(
                            "• ${item.title}",
                            style = MaterialTheme.typography.bodySmall,
                            fontWeight = FontWeight.Medium,
                            modifier = Modifier.padding(vertical = 4.dp)
                        )
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        showFollowedPopup = false
                        val fArea = prefs.getFollowedArea()
                        val fEventId = prefs.getFollowedEventId()
                        
                        if (fEventId != null) {
                            onEventSelected(fEventId)
                        } else if (fArea != null) {
                            onAreaSelected(fArea)
                        } else {
                            onShowAll() // Fallback
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0077b6))
                ) {
                    Text("Katso lisää")
                }
            },
            dismissButton = {
                TextButton(onClick = { showFollowedPopup = false }) {
                    Text("Sulje")
                }
            }
        )
    }

    if (showObservationTypeSheet) {
        ModalBottomSheet(
            onDismissRequest = { showObservationTypeSheet = false },
            sheetState = observationSheetState,
            containerColor = Color.White
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(24.dp)
            ) {
                Text(
                    "Mitä haluat jakaa?",
                    fontWeight = FontWeight.Bold,
                    fontSize = 20.sp,
                    modifier = Modifier.padding(bottom = 16.dp)
                )

                ObservationTypeRow(
                    icon = "📍",
                    title = "Havaintotila (liikkeessä)",
                    subtitle = "Kerää havaintopisteitä nopeasti reitin varrella",
                    onClick = {
                        showObservationTypeSheet = false
                        onStartObservationCollection()
                    }
                )

                ObservationTypeRow(
                    icon = "🔴",
                    title = "Ilmoita ongelma",
                    subtitle = "Jokin vaatii huomiota",
                    onClick = {
                        showObservationTypeSheet = false
                        onReportObservation(fi.mediazoo.lostrefound.model.ObservationType.PROBLEM)
                    }
                )

                ObservationTypeRow(
                    icon = "🟢",
                    title = "Huomaa hyvä",
                    subtitle = "Jaa hyvä paikka tai asia",
                    onClick = {
                        showObservationTypeSheet = false
                        onReportObservation(fi.mediazoo.lostrefound.model.ObservationType.POSITIVE)
                    }
                )

                ObservationTypeRow(
                    icon = "💡",
                    title = "Jaa vinkki",
                    subtitle = "Hyödyllinen tieto muille",
                    onClick = {
                        showObservationTypeSheet = false
                        onReportObservation(fi.mediazoo.lostrefound.model.ObservationType.TIP)
                    }
                )

                ObservationTypeRow(
                    icon = "👀",
                    title = "Tee havainto",
                    subtitle = "Jotain kiinnostavaa",
                    onClick = {
                        showObservationTypeSheet = false
                        onReportObservation(fi.mediazoo.lostrefound.model.ObservationType.SIGHTING)
                    }
                )
                Spacer(modifier = Modifier.height(24.dp))
            }
        }
    }
}

@Composable
fun PermissionDisclosureDialog(onDismiss: () -> Unit, onConfirm: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                "Löytäjätilan palvelut",
                style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold)
            )
        },
        text = {
            Column {
                Text(
                    "Löytäjätila auttaa sinua löytämään kadonneet tavarat lähelläsi.",
                    style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Medium)
                )
                Spacer(modifier = Modifier.height(12.dp))
                Text(
                    "Toimiakseen sovellus tarvitsee:\n\n" +
                    "• Sijaintiluvan: Taustaseuranta tunnistaa, kun saavut kadonneen tavaran katoamisalueen läheisyyteen, jopa silloin kun sovellus on suljettu tai taustalla.\n" +
                    "• Ilmoitusluvan: Saat välittömästi push-ilmoituksen, kun osuma löytyy.\n\n" +
                    "Sijaintitietoja käytetään vain etsintään, eikä niitä jaeta kolmansille osapuolille.\n\n" +
                    "Voit kytkeä toiminnon milloin tahansa pois päältä 'Lisää' -välilehden kautta.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = Color.DarkGray
                )
            }
        },
        confirmButton = {
            Button(
                onClick = onConfirm,
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0077b6))
            ) {
                Text("Ymmärrän ja hyväksyn")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Peruuta")
            }
        }
    )
}


@Composable
fun ReportCard(
    title: String,
    subtitle: String,
    icon: ImageVector,
    containerColor: Color,
    contentColor: Color,
    borderColor: Color,
    gradientColors: List<Color> = emptyList(),
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    val gradient = if (gradientColors.size >= 2)
        Brush.verticalGradient(gradientColors)
    else
        Brush.verticalGradient(listOf(containerColor, containerColor))

    Card(
        modifier = modifier.clickable { onClick() },
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Color.Transparent),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
        border = androidx.compose.foundation.BorderStroke(2.dp, borderColor)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(gradient)
                .padding(4.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Surface(
                shape = RoundedCornerShape(12.dp),
                color = contentColor.copy(alpha = 0.2f),
                modifier = Modifier.size(40.dp)
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(icon, contentDescription = null, tint = contentColor, modifier = Modifier.size(24.dp))
                }
            }
            
            Spacer(modifier = Modifier.height(8.dp))
            
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    text = title,
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                    style = MaterialTheme.typography.labelMedium.copy(
                        fontWeight = FontWeight.ExtraBold,
                        color = contentColor,
                        lineHeight = 16.sp
                    )
                )
                Text(
                    text = subtitle,
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                    style = MaterialTheme.typography.labelSmall,
                    color = contentColor.copy(alpha = 0.8f),
                    fontSize = 10.sp
                )
            }
        }
    }
}

@Composable
fun ObservationTypeRow(icon: String, title: String, subtitle: String, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(text = icon, fontSize = 28.sp, modifier = Modifier.padding(end = 16.dp))
        Column {
            Text(text = title, fontWeight = FontWeight.Bold, fontSize = 16.sp)
            Text(text = subtitle, color = Color.Gray, fontSize = 14.sp)
        }
    }
}

@Composable
fun FilterButton(
    text: String,
    icon: ImageVector,
    color: Color,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    OutlinedButton(
        onClick = onClick,
        modifier = modifier.height(56.dp),
        shape = RoundedCornerShape(16.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, color.copy(alpha = 0.3f)),
        colors = ButtonDefaults.outlinedButtonColors(contentColor = color)
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(icon, contentDescription = null, modifier = Modifier.size(18.dp))
            Text(text, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
        }
    }
}

private fun isServiceRunning(context: Context, serviceClass: Class<*>): Boolean {
    val manager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
    @Suppress("DEPRECATION")
    for (service in manager.getRunningServices(Int.MAX_VALUE)) {
        if (serviceClass.name == service.service.className) {
            return true
        }
    }
    return false
}

@Composable
fun InfoDialog(onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Tietoa & Käyttöehdot", fontWeight = FontWeight.Bold) },
        text = {
            Column(
                modifier = Modifier
                    .verticalScroll(rememberScrollState())
                    .padding(vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text(
                    "LostRefound auttaa kadonneita tavaroita löytämään takaisin kotiin.",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold
                )
                
                Text(
                    "LostRefoundin rooli",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF0077b6)
                )
                Text(
                    "LostRefound on ilmoitus- ja yhteydenvälityspalvelu. Palvelu ei vastaanota, säilytä eikä välitä löytötavaroita, eikä toimi löytötavaralain tarkoittamana löytötavaratoimistona.",
                    style = MaterialTheme.typography.bodySmall
                )

                Text(
                    "Löytäjän vastuu",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF0077b6)
                )
                Text(
                    "Löytäjä vastaa siitä, että toimii voimassa olevan löytötavaralainsäädännön mukaisesti. Palvelu suosittelee pyrkimään palauttamaan tavaran omistajalle viipymättä. Tarvittaessa löytötavara tulee toimittaa poliisille tai muulle lain edellyttämälle löytötavaraviranomaiselle.",
                    style = MaterialTheme.typography.bodySmall
                )

                Text(
                    "Omistajuus ja vastuut",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF0077b6)
                )
                Text(
                    "Kadonneen tai löytyneen tavaran omistajuuden varmistaminen on käyttäjien vastuulla. LostRefound ei vastaa käyttäjien antamien tietojen oikeellisuudesta eikä tavaran luovutuksesta aiheutuvista vahingoista tai riidoista.",
                    style = MaterialTheme.typography.bodySmall
                )

                Text(
                    "Tietosuoja",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF0077b6)
                )
                Text(
                    "Palvelu käsittelee henkilötietoja ainoastaan ilmoitusten julkaisemiseksi, yhteyden mahdollistamiseksi ja palvelun ylläpitämiseksi. Sijaintitietoja käytetään vain etsintään.",
                    style = MaterialTheme.typography.bodySmall
                )

                HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))
                
                Text(
                    "Versio: 19.2\nTuki: info@mediazoo.fi",
                    style = MaterialTheme.typography.labelSmall,
                    color = Color.Gray
                )
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text("Sulje") }
        }
    )
}

private fun parseCityName(cityData: String): String {
    return cityData.substringBefore(" (").trim()
}
