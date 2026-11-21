package fi.mediazoo.lostrefound

import android.util.Log
import android.widget.Toast
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.lifecycle.viewmodel.compose.viewModel
import fi.mediazoo.lostrefound.model.ItemCategory
import fi.mediazoo.lostrefound.model.ItemStatus
import fi.mediazoo.lostrefound.model.LostItem
import fi.mediazoo.lostrefound.model.Organization
import kotlinx.coroutines.launch
import fi.mediazoo.lostrefound.chat.ChatScreen
import fi.mediazoo.lostrefound.chat.ChatViewModel
import fi.mediazoo.lostrefound.chat.MyChatsScreen
import fi.mediazoo.lostrefound.circular.CircularBrowseScreen
import fi.mediazoo.lostrefound.circular.CircularHomeScreen
import fi.mediazoo.lostrefound.circular.CircularMatchDetailScreen
import fi.mediazoo.lostrefound.circular.CircularMatchesScreen
import fi.mediazoo.lostrefound.circular.CircularMyItemsScreen
import fi.mediazoo.lostrefound.circular.CircularSubmitScreen
import fi.mediazoo.lostrefound.circular.CircularItemType
import fi.mediazoo.lostrefound.circular.CircularViewModel
import fi.mediazoo.lostrefound.circular.CircularViewModelFactory
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.messaging.FirebaseMessaging
import android.provider.Settings
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Warning
import androidx.compose.ui.unit.sp
import fi.mediazoo.lostrefound.model.ObservationType

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LostAndFoundApp(
    firebaseService: FirebaseService,
    supabaseService: SupabaseService,
    viewModel: LostFoundViewModel = viewModel(
        factory = LostFoundViewModelFactory(firebaseService, supabaseService)
    ),
    initialItemId: String? = null,
    initialEventId: String? = null,
    initialOrgId: String? = null,
    initialTargetScreen: String? = null
) {
    // State management
    var showAdminPinDialog by remember { mutableStateOf(false) }
    var showAreaDialog by remember { mutableStateOf(false) }
    var setAsDefaultArea by remember { mutableStateOf(false) }
    var correctAdminPin by remember { mutableStateOf("") }
    var isPinLoading by remember { mutableStateOf(true) }
    var isAdminMode by remember { mutableStateOf(false) }
    var currentScreen by remember {
        mutableStateOf(
            when (initialTargetScreen) {
                "OBSERVATION_COLLECTION" -> Screen.OBSERVATION_COLLECTION
                "CIRCULAR_MATCHES"       -> Screen.CIRCULAR_MATCHES
                else                     -> Screen.LANDING
            }
        )
    }
    val context = LocalContext.current
    var selectedItem by remember { mutableStateOf<LostItem?>(null) }
    var itemBeingMoved by remember { mutableStateOf<LostItem?>(null) } // Varastopaikan siirtoon
    var itemForHandover by remember { mutableStateOf<LostItem?>(null) } // Luovutusskannaukseen (omistajan QR)
    var selectedOrgForLocations by remember { mutableStateOf<Organization?>(null) }
    var selectedOrgForReports by remember { mutableStateOf<Organization?>(null) }
    var showAll by remember { mutableStateOf(true) }
    var qrScannerBackScreen by remember { mutableStateOf(Screen.LANDING) }
    var selectedObservationId by remember { mutableStateOf<String?>(null) }
    var observationDetailBackScreen by remember { mutableStateOf(Screen.OBSERVATION_FEED) }
    val coroutineScope = rememberCoroutineScope()
    val prefs = rememberPreferences()
    var selectedArea by remember { mutableStateOf<String?>(prefs.getDefaultBrowseArea()) }
    var selectedEventId by remember { mutableStateOf<String?>(null) }
    var selectedEventName by remember { mutableStateOf<String?>(null) }
    var selectedEventLat by remember { mutableStateOf<Double?>(null) }
    var selectedEventLng by remember { mutableStateOf<Double?>(null) }
    var selectedEventRadius by remember { mutableStateOf<Double?>(null) }
    var selectedOrganizationId by remember { mutableStateOf<String?>(null) }
    var selectedOrganizationName by remember { mutableStateOf<String?>(null) }
    var selectedOrganizationLat by remember { mutableStateOf<Double?>(null) }
    var selectedOrganizationLng by remember { mutableStateOf<Double?>(null) }
    var selectedOrganizationZoom by remember { mutableStateOf<Double?>(null) }
    var selectedPlaceId by remember { mutableStateOf<String?>(null) }   // LaukaaInfo place_id
    var selectedPlaceName by remember { mutableStateOf<String?>(null) } // LaukaaInfo paikan nimi
    var selectedCategory by remember { mutableStateOf<ItemCategory?>(null) }
    var selectedPhenomenonCategory by remember { mutableStateOf<String?>(null) }
    var selectedPhenomenonArea by remember { mutableStateOf<String?>(null) }
    var phenomenaMapFocusObsId by remember { mutableStateOf<String?>(null) }
    var phenomenaMapBackScreen by remember { mutableStateOf(Screen.PHENOMENA) }
    var selectedPhenomenonDetailCategory by remember { mutableStateOf<String?>(null) }
    var searchQuery by remember { mutableStateOf("") }
    var chatReceiverGoogleId by remember { mutableStateOf<String?>(null) }
    var chatReceiverEmail by remember { mutableStateOf<String?>(null) }
    var webViewUrl by remember { mutableStateOf("https://lostnfound-f0d25.web.app/?tab=havainnot") }
    var webViewBackScreen by remember { mutableStateOf(Screen.OBSERVATION_FEED) }

    // Vaihe 4 navigointitilat
    var detailBackScreen by remember { mutableStateOf(Screen.LIST) }
    var listShowSearchBar by remember { mutableStateOf(false) }
    var showSearchScopeDialog by remember { mutableStateOf(false) }

    // Fetch admin PIN
    LaunchedEffect(Unit) {
        firebaseService.getAdminPin { pin ->
            correctAdminPin = pin
            isPinLoading = false
            if (pin.isEmpty()) {
                Toast.makeText(
                    context,
                    "Admin-toiminnot eivät ole käytettävissä",
                    Toast.LENGTH_LONG
                ).show()
            }
        }
    }

    // ---- Circular Economy -ViewModel ----
    val circularViewModel: CircularViewModel = viewModel(
        factory = CircularViewModelFactory(supabaseService)
    )
    val circularUiState by circularViewModel.uiState.collectAsState()
    var selectedMatchId by remember { mutableStateOf<String?>(null) }
    val currentFirebaseUid = FirebaseAuth.getInstance().currentUser?.uid ?: ""

    // Chat ViewModel for global polling
    val chatViewModel: ChatViewModel = viewModel(
        factory = ChatViewModelFactory(context.applicationContext as android.app.Application, supabaseService)
    )

    LaunchedEffect(Unit) {
        chatViewModel.startPollingUnreadCount()
    }

    // FCM-tokenin rekisteröinti Circular-palvelimelle kirjautumisen yhteydessä
    LaunchedEffect(currentFirebaseUid) {
        if (currentFirebaseUid.isNotEmpty()) {
            FirebaseMessaging.getInstance().token.addOnSuccessListener { token ->
                val deviceId = Settings.Secure.getString(
                    context.contentResolver, Settings.Secure.ANDROID_ID
                )
                circularViewModel.registerFcmToken(token, deviceId)
            }
        }
    }

    val unreadChatsCount by chatViewModel.unreadCount.collectAsState()

    // Handle initial deep link
    LaunchedEffect(initialItemId) {
        initialItemId?.let { id ->
            if (id.isNotBlank()) {
                coroutineScope.launch {
                    try {
                        val item = firebaseService.getItemById(id)
                        if (item != null) {
                            selectedItem = item
                            detailBackScreen = Screen.LANDING
                            currentScreen = Screen.DETAIL
                            Log.d("DeepLink", "Navigating to item $id from notification")
                        }
                    } catch (e: Exception) {
                        Log.e("DeepLink", "Error fetching item $id", e)
                    }
                }
            }
        }
    }

    // Handle initial deep link for events
    LaunchedEffect(initialEventId) {
        initialEventId?.let { id ->
            if (id.isNotBlank()) {
                val decodedName = java.net.URLDecoder.decode(id, "UTF-8")
                val event = firebaseService.getEventById(id) ?: firebaseService.getEventByName(decodedName) ?: firebaseService.getEventByName(id)
                if (event != null) {
                    selectedEventId = event.id
                    selectedEventName = event.name
                    currentScreen = Screen.EVENT_DASHBOARD
                    Log.d("DeepLink", "Navigating to event ${event.id}")
                } else {
                    Toast.makeText(context, "Tapahtumaa ei löytynyt", Toast.LENGTH_SHORT).show()
                    currentScreen = Screen.LANDING
                }
            }
        }
    }

    // Handle initial deep link for organizations (Ilmoituskyltti)
    LaunchedEffect(initialOrgId) {
        initialOrgId?.let { id ->
            if (id.isNotBlank()) {
                val orgs = firebaseService.getOrganizations()
                val org = orgs.find { it.id == id }
                if (org != null) {
                    selectedOrganizationId = org.id
                    selectedOrganizationName = org.name
                    selectedOrganizationLat = org.latitude
                    selectedOrganizationLng = org.longitude
                    selectedOrganizationZoom = org.zoomLevel
                    currentScreen = Screen.ADD
                    Log.d("DeepLink", "Navigating to add item for org ${org.name}")
                } else {
                    Toast.makeText(context, "Organisaatiota ei löytynyt", Toast.LENGTH_SHORT).show()
                    currentScreen = Screen.LANDING
                }
            }
        }
    }
    
    // Admin PIN dialog
    if (showAdminPinDialog) {
        if (isPinLoading) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator()
            }
        } else {
            PinDialog(
                onPinEntered = { pin ->
                    if (pin == correctAdminPin) {
                        showAdminPinDialog = false
                        isAdminMode = true
                        currentScreen = Screen.ADMIN
                    } else {
                        Toast.makeText(
                            context,
                            "Väärä PIN-koodi",
                            Toast.LENGTH_SHORT
                        ).show()
                    }
                },
                onCancel = { showAdminPinDialog = false },
                showError = false,
                title = "Admin-kirjautuminen"
            )
        }
    }

    // Aluevalintadialogi
    if (showAreaDialog) {
        AreaSelectionDialog(
            firebaseService = firebaseService,
            supabaseService = supabaseService,
            onAreaSelected = { area ->
                if (setAsDefaultArea) {
                    prefs.saveDefaultArea(area)
                }
                selectedArea = area
                selectedEventId = null
                selectedOrganizationId = null
                currentScreen = Screen.LIST
                showAreaDialog = false
            },
            onEventSelected = { event ->
                selectedEventId = event.id
                selectedEventName = event.name
                selectedArea = null
                selectedOrganizationId = null
                currentScreen = Screen.EVENT_DASHBOARD
                showAreaDialog = false
            },
            onOrganizationSelected = { org ->
                selectedOrganizationId = org.id
                selectedOrganizationName = org.name
                selectedArea = null
                selectedEventId = null
                currentScreen = Screen.LIST
                showAreaDialog = false
            },
            onCreateEventClick = {
                currentScreen = Screen.CREATE_EVENT
                showAreaDialog = false
            },
            onDismiss = { showAreaDialog = false },
            setAsDefault = setAsDefaultArea,
            onSetDefault = { setAsDefaultArea = it }
        )
    }

    var preselectedCategory by remember { mutableStateOf<ItemCategory?>(null) }
    var preselectedObservationType by remember { mutableStateOf(fi.mediazoo.lostrefound.model.ObservationType.PROBLEM) }
    var showAddChoiceSheet by remember { mutableStateOf(false) }
    var addSheetShowObservationTypes by remember { mutableStateOf(false) }
    val addChoiceSheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    // Haku-aluedialogi: näytetään kun alue on valittu ja käyttäjä painaa Haku-nappia
    if (showSearchScopeDialog) {
        val areaLabel = selectedEventName ?: selectedOrganizationName ?: selectedArea
        AlertDialog(
            onDismissRequest = { showSearchScopeDialog = false },
            title = { Text("Hakualue") },
            text = {
                Text(
                    if (areaLabel != null)
                        "Haetaanko valitulta alueelta \"$areaLabel\" vai kaikista kohteista?"
                    else
                        "Haetaanko valitulta alueelta vai kaikista kohteista?"
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        // Valittu alue – säilytetään rajaus, mennään suoraan listaan
                        showSearchScopeDialog = false
                        selectedCategory = null
                        listShowSearchBar = true
                        currentScreen = Screen.LIST
                    }
                ) {
                    Text(if (areaLabel != null) "Valittu alue" else "Valittu alue")
                }
            },
            dismissButton = {
                TextButton(
                    onClick = {
                        // Kaikki – nollataan rajaukset
                        showSearchScopeDialog = false
                        showAll = true
                        selectedCategory = null
                        selectedArea = null
                        selectedEventId = null
                        selectedEventName = null
                        selectedOrganizationId = null
                        selectedOrganizationName = null
                        listShowSearchBar = true
                        currentScreen = Screen.LIST
                    }
                ) { Text("Kaikki kohteet") }
            }
        )
    }

    // Screen navigation
    Scaffold(
        bottomBar = {
            val showBottomNav = currentScreen in listOf(Screen.LANDING, Screen.LIST, Screen.ADD, Screen.MY_PROFILE, Screen.MORE, Screen.MAP, Screen.EVENT_DASHBOARD, Screen.MY_CHATS)
            if (showBottomNav) {
                NavigationBar {
                    NavigationBarItem(
                        icon = { Icon(Icons.Default.Home, contentDescription = "Etusivu") },
                        label = { Text("Etusivu") },
                        selected = currentScreen == Screen.LANDING || currentScreen == Screen.EVENT_DASHBOARD,
                        onClick = { currentScreen = Screen.LANDING }
                    )
                    NavigationBarItem(
                        icon = { Icon(Icons.Default.Search, contentDescription = "Haku") },
                        label = { Text("Haku") },
                        selected = currentScreen == Screen.LIST || currentScreen == Screen.MAP,
                        onClick = {
                            val hasActiveFilter = selectedArea != null || selectedEventId != null || selectedOrganizationId != null
                            if (hasActiveFilter) {
                                // Kysytään käyttäjältä haetaanko valitulta alueelta vai kaikesta
                                showSearchScopeDialog = true
                            } else {
                                // Ei valittua aluetta – mennään suoraan listaukseen
                                showAll = true
                                selectedCategory = null
                                listShowSearchBar = true
                                currentScreen = Screen.LIST
                            }
                        }
                    )
                    NavigationBarItem(
                        icon = {
                            Surface(
                                shape = CircleShape,
                                color = MaterialTheme.colorScheme.primary,
                                shadowElevation = 2.dp,
                                modifier = Modifier.size(36.dp)
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Icon(
                                        Icons.Default.Add,
                                        contentDescription = "Lisää",
                                        tint = Color.White,
                                        modifier = Modifier.size(22.dp)
                                    )
                                }
                            }
                        },
                        label = { Text("Lisää") },
                        selected = currentScreen == Screen.ADD || currentScreen == Screen.NEW_OBSERVATION,
                        onClick = { 
                            addSheetShowObservationTypes = false
                            showAddChoiceSheet = true
                        }
                    )
                    NavigationBarItem(
                        icon = { Icon(Icons.Default.Favorite, contentDescription = "Oma") },
                        label = { Text("Oma") },
                        selected = currentScreen == Screen.MY_PROFILE || currentScreen == Screen.MY_CHATS,
                        onClick = { currentScreen = Screen.MY_PROFILE }
                    )
                    NavigationBarItem(
                        icon = { Icon(Icons.Default.Menu, contentDescription = "Muut") },
                        label = { Text("Muut") },
                        selected = currentScreen == Screen.MORE || currentScreen == Screen.ADMIN,
                        onClick = { currentScreen = Screen.MORE }
                    )
                }
            }
        }
    ) { innerPadding ->
        if (showAddChoiceSheet) {
            ModalBottomSheet(
                onDismissRequest = { 
                    showAddChoiceSheet = false 
                    addSheetShowObservationTypes = false
                },
                sheetState = addChoiceSheetState,
                containerColor = Color.White
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 24.dp, vertical = 16.dp)
                ) {
                    if (!addSheetShowObservationTypes) {
                        Text(
                            "Mitä haluat ilmoittaa?",
                            fontWeight = FontWeight.Bold,
                            fontSize = 20.sp,
                            modifier = Modifier.padding(bottom = 16.dp)
                        )

                        // 1. Löysin tavaran
                        ActionChoiceRow(
                            icon = "😊",
                            iconVector = Icons.Default.CheckCircle,
                            iconTint = Color(0xFF20C997),
                            title = "Löysin tavaran",
                            subtitle = "Ilmoita löytämästäsi tavarasta",
                            onClick = {
                                showAddChoiceSheet = false
                                preselectedCategory = ItemCategory.FOUND
                                selectedPlaceId = null
                                selectedPlaceName = null
                                currentScreen = Screen.ADD
                            }
                        )

                        // 2. Kadotin tavaran
                        ActionChoiceRow(
                            icon = "😟",
                            iconVector = Icons.Default.Search,
                            iconTint = Color(0xFFFF6B6B),
                            title = "Kadotin tavaran",
                            subtitle = "Tee ilmoitus kadonneesta esineestä",
                            onClick = {
                                showAddChoiceSheet = false
                                preselectedCategory = ItemCategory.LOST
                                selectedPlaceId = null
                                selectedPlaceName = null
                                currentScreen = Screen.ADD
                            }
                        )

                        // 3. Havaintoilmoitus
                        ActionChoiceRow(
                            icon = "📸",
                            iconVector = Icons.Default.Warning,
                            iconTint = Color(0xFFFB8500),
                            title = "Havaintoilmoitus",
                            subtitle = "Ilmoita havainto, ongelma tai vinkki alueelta",
                            onClick = {
                                addSheetShowObservationTypes = true
                            }
                        )

                        // 4. Kiertotalous: Tarjoa tavaraa
                        ActionChoiceRow(
                            icon = "📦",
                            iconVector = Icons.Default.CheckCircle,
                            iconTint = Color(0xFF2E7D32),
                            title = "Tarjoa tavaraa (Kiertotalous)",
                            subtitle = "Ilmoita käytetty tavara tai materiaali",
                            onClick = {
                                showAddChoiceSheet = false
                                currentScreen = Screen.CIRCULAR_SUBMIT_OFFER
                            }
                        )

                        // 5. Kiertotalous: Etsi tavaraa
                        ActionChoiceRow(
                            icon = "🔍",
                            iconVector = Icons.Default.Search,
                            iconTint = Color(0xFF1565C0),
                            title = "Etsi tavaraa (Kiertotalous)",
                            subtitle = "Etsi tarvitsemaasi tavaraa tai materiaalia",
                            onClick = {
                                showAddChoiceSheet = false
                                currentScreen = Screen.CIRCULAR_SUBMIT_WANTED
                            }
                        )
                    } else {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(bottom = 12.dp)
                        ) {
                            IconButton(onClick = { addSheetShowObservationTypes = false }) {
                                Icon(Icons.Default.ArrowBack, contentDescription = "Takaisin")
                            }
                            Text(
                                "Valitse havaintotyyppi",
                                fontWeight = FontWeight.Bold,
                                fontSize = 18.sp
                            )
                        }

                        ObservationTypeChoiceRow(
                            icon = "🔴",
                            title = "Ilmoita ongelma",
                            subtitle = "Jokin vaatii huomiota",
                            onClick = {
                                showAddChoiceSheet = false
                                addSheetShowObservationTypes = false
                                preselectedObservationType = ObservationType.PROBLEM
                                currentScreen = Screen.NEW_OBSERVATION
                            }
                        )

                        ObservationTypeChoiceRow(
                            icon = "🟢",
                            title = "Huomaa hyvä",
                            subtitle = "Jaa hyvä paikka tai asia",
                            onClick = {
                                showAddChoiceSheet = false
                                addSheetShowObservationTypes = false
                                preselectedObservationType = ObservationType.POSITIVE
                                currentScreen = Screen.NEW_OBSERVATION
                            }
                        )

                        ObservationTypeChoiceRow(
                            icon = "💡",
                            title = "Jaa vinkki",
                            subtitle = "Hyödyllinen tieto muille",
                            onClick = {
                                showAddChoiceSheet = false
                                addSheetShowObservationTypes = false
                                preselectedObservationType = ObservationType.TIP
                                currentScreen = Screen.NEW_OBSERVATION
                            }
                        )

                        ObservationTypeChoiceRow(
                            icon = "👀",
                            title = "Tee havainto",
                            subtitle = "Jotain kiinnostavaa",
                            onClick = {
                                showAddChoiceSheet = false
                                addSheetShowObservationTypes = false
                                preselectedObservationType = ObservationType.SIGHTING
                                currentScreen = Screen.NEW_OBSERVATION
                            }
                        )

                        ObservationTypeChoiceRow(
                            icon = "📍",
                            title = "Havaintotila (liikkeessä)",
                            subtitle = "Kerää havaintopisteitä nopeasti reitin varrella",
                            onClick = {
                                showAddChoiceSheet = false
                                addSheetShowObservationTypes = false
                                currentScreen = Screen.OBSERVATION_COLLECTION
                            }
                        )
                    }

                    Spacer(modifier = Modifier.height(24.dp))
                }
            }
        }

        Box(modifier = Modifier.padding(innerPadding).fillMaxSize()) {
            when (currentScreen) {
                Screen.LANDING -> LandingScreen(
            firebaseService = firebaseService,
            onAreaSelected = { area ->
                selectedArea = area
                selectedEventId = null
                selectedOrganizationId = null
                currentScreen = Screen.LIST
            },
            onEventSelected = { eventId ->
                selectedEventId = eventId
                selectedArea = null
                selectedOrganizationId = null
                currentScreen = Screen.EVENT_DASHBOARD
            },
            onOrganizationSelected = { orgId, orgName ->
                selectedOrganizationId = orgId
                selectedOrganizationName = orgName
                selectedArea = null
                selectedEventId = null
                currentScreen = Screen.LIST
            },
            onAdminAccess = {
                if (isPinLoading || correctAdminPin.isEmpty()) {
                    Toast.makeText(
                        context,
                        "Admin-toiminnot eivät ole käytettävissä",
                        Toast.LENGTH_LONG
                    ).show()
                } else {
                    showAdminPinDialog = true
                }
            },
            onSearchById = { id ->
                coroutineScope.launch {
                    try {
                        val item = firebaseService.getItemById(id.trim())
                        item?.let {
                            selectedItem = it
                            detailBackScreen = Screen.LANDING
                            currentScreen = Screen.DETAIL
                            Toast.makeText(context, "Löytyi ID:llä ${it.id}", Toast.LENGTH_SHORT).show()
                        } ?: run {
                            Toast.makeText(context, "Ei löytynyt ID:llä $id", Toast.LENGTH_SHORT).show()
                        }
                    } catch (e: Exception) {
                        Toast.makeText(context, "Haku epäonnistui", Toast.LENGTH_SHORT).show()
                        Log.e("Search", "Virhe haussa", e)
                    }
                }
            },
            onShowAll = {
                selectedArea = null
                selectedEventId = null
                selectedOrganizationId = null
                currentScreen = Screen.LIST
            },
            onShowList = {
                currentScreen = Screen.LIST
            },
            onShowMap = {
                // Näyttää kartan nykyisellä selectedArealla (Kohteet kartalla)
                currentScreen = Screen.MAP
            },
            onChangeArea = {
                showAreaDialog = true
            },
            onCategorySelected = { category ->
                selectedCategory = category
                currentScreen = Screen.LIST
            },
            onReportItem = { category ->
                preselectedCategory = category
                currentScreen = Screen.ADD
            },
            onReportObservation = { type ->
                preselectedObservationType = type
                currentScreen = Screen.NEW_OBSERVATION
            },
            selectedArea = selectedArea,
            selectedEventName = selectedEventName,
            selectedOrganizationName = selectedOrganizationName,
            onSearchQueryChanged = { query ->
                searchQuery = query
                currentScreen = Screen.LIST
            },
            unreadChatsCount = unreadChatsCount,
            onMyChatsClick = { currentScreen = Screen.MY_CHATS },
            onShowObservations = { currentScreen = Screen.OBSERVATION_FEED },
            onShowWebObservations = {
                webViewUrl = "https://lostnfound-f0d25.web.app/"
                webViewBackScreen = Screen.LANDING
                currentScreen = Screen.WEB_VIEW
            },
            onStartObservationCollection = { currentScreen = Screen.OBSERVATION_COLLECTION },
            onCircularClick = { currentScreen = Screen.CIRCULAR_HOME },
            onCircularOfferClick = { currentScreen = Screen.CIRCULAR_SUBMIT_OFFER },
            onCircularWantedClick = { currentScreen = Screen.CIRCULAR_SUBMIT_WANTED }
        )

        Screen.LIST -> LostItemListScreen(
            onAddClick = { 
                preselectedCategory = null
                currentScreen = Screen.ADD 
            },
            onBackToLanding = {
                selectedCategory = null
                searchQuery = ""
                listShowSearchBar = false
                currentScreen = Screen.LANDING
            },
            onObservationSelected = { obsId ->
                selectedObservationId = obsId
                observationDetailBackScreen = Screen.LIST
                currentScreen = Screen.OBSERVATION_DETAIL
            },
            firebaseService = firebaseService,
            selectedItem = selectedItem,
            onItemSelected = { item ->
                selectedItem = item
                if (item != null) {
                    currentScreen = Screen.MAP
                }
            },
            showAll = showAll,
            onShowAllClick = {
                showAll = true
                selectedItem = null
            },
            selectedArea = selectedArea,
            selectedEventId = selectedEventId,
            selectedEventName = selectedEventName,
            selectedOrganizationId = selectedOrganizationId,
            selectedOrganizationName = selectedOrganizationName,
            selectedCategory = selectedCategory,
            onCategorySelected = { category ->
                selectedCategory = category
                showAll = true
                selectedItem = null
            },
            onSearchById = { id ->
                coroutineScope.launch {
                    try {
                        val item = firebaseService.getItemById(id)
                        if (item != null) {
                            selectedItem = item
                            detailBackScreen = Screen.LIST
                            listShowSearchBar = false
                            currentScreen = Screen.DETAIL
                        } else {
                            Toast.makeText(context, "Item not found", Toast.LENGTH_SHORT).show()
                        }
                    } catch (e: Exception) {
                        Toast.makeText(context, "Error searching for item", Toast.LENGTH_SHORT).show()
                        Log.e("LostAndFoundApp", "Search error", e)
                    }
                }
            },
            onItemDetailClick = { item ->
                selectedItem = item
                detailBackScreen = Screen.LIST
                listShowSearchBar = false
                currentScreen = Screen.DETAIL
            },
            searchQuery = searchQuery,
            onSearchQueryChanged = { query -> searchQuery = query },
            onMapClick = {
                if (selectedItem != null) {
                    currentScreen = Screen.MAP
                } else {
                    Toast.makeText(context, "Valitse ensin kohde", Toast.LENGTH_SHORT).show()
                }
            },
            initialShowSearchBar = listShowSearchBar
        )

        Screen.DETAIL -> selectedItem?.let { item ->
            ItemDetailScreen(
                initialItem = item,
                onBack = { currentScreen = detailBackScreen },
                onEdit = { currentScreen = Screen.EDIT },
                onDelete = {
                    coroutineScope.launch {
                        firebaseService.deleteItem(item) {
                            selectedItem = null
                            currentScreen = Screen.LIST
                        }
                    }
                },
                firebaseService = firebaseService,
                onAdminAccess = { showAdminPinDialog = true },
                onOpenChat = { itemId, receiverId, receiverEmail ->
                    chatReceiverGoogleId = receiverId
                    chatReceiverEmail = receiverEmail
                    selectedItem = item
                    currentScreen = Screen.CHAT
                },
            )
        }

        Screen.ADMIN -> AdminScreen(
            firebaseService = firebaseService,
            supabaseService = supabaseService,
            onBack = { currentScreen = Screen.LANDING },
            onReports = { org ->
                selectedOrgForReports = org
                currentScreen = Screen.REPORTS
            },
            onCreateEvent = { currentScreen = Screen.CREATE_EVENT }
        )

        Screen.MAP -> LostItemMapScreen(
            onBack = { currentScreen = Screen.LIST },
            firebaseService = firebaseService,
            selectedItem = selectedItem,
            onItemSelected = { item ->
                selectedItem = item
                if (item != null) {
                    detailBackScreen = Screen.MAP
                    currentScreen = Screen.DETAIL
                }
            },
            showAll = showAll,
            onShowAllClick = {
                showAll = true
                selectedItem = null
            },
            selectedArea = selectedArea,
            selectedEventName = selectedEventName,
            selectedCategory = selectedCategory,
            selectedEventId = selectedEventId,
            onMarkerClick = { item ->
                selectedItem = item
                detailBackScreen = Screen.MAP
                currentScreen = Screen.DETAIL
            }
        )

        Screen.EDIT -> selectedItem?.let { item ->
            EditItemScreen(
                item = item,
                firebaseService = firebaseService,
                onBack = { currentScreen = Screen.DETAIL },
                onSave = { updatedItem ->
                    selectedItem = updatedItem
                    currentScreen = Screen.DETAIL
                },
                onDelete = {
                    coroutineScope.launch {
                        firebaseService.deleteItem(item) {
                            selectedItem = null
                            currentScreen = Screen.LIST
                        }
                    }
                },
                onAdminAccess = { showAdminPinDialog = true }
            )
        }

        Screen.ADD -> AddLostItemScreen(
            firebaseService = firebaseService,
            supabaseService = supabaseService,
            onBack = {
                selectedPlaceId = null
                selectedPlaceName = null
                currentScreen = Screen.LIST
            },
            selectedArea = selectedArea,
            initialCategory = preselectedCategory,
            selectedEventId = selectedEventId,
            selectedEventLat = selectedEventLat,
            selectedEventLng = selectedEventLng,
            selectedEventRadius = selectedEventRadius,
            selectedOrganizationId = selectedOrganizationId,
            selectedOrganizationName = selectedOrganizationName,
            selectedOrganizationLat = selectedOrganizationLat,
            selectedOrganizationLng = selectedOrganizationLng,
            selectedOrganizationZoom = selectedOrganizationZoom,
            selectedPlaceId = selectedPlaceId,
            selectedPlaceName = selectedPlaceName
        )

        Screen.NEW_OBSERVATION -> NewObservationScreen(
            firebaseService = firebaseService,
            supabaseService = supabaseService,
            onBack = { currentScreen = Screen.LANDING },
            selectedArea = selectedArea,
            initialType = preselectedObservationType,
            onReportLostFound = { placeId, placeName ->
                selectedPlaceId = placeId
                selectedPlaceName = placeName
                currentScreen = Screen.ADD
            },
            onObservationSaved = { obsId ->
                selectedObservationId = obsId
                currentScreen = Screen.OBSERVATION_DETAIL
            },
            onNavigateToMap = {
                currentScreen = Screen.OBSERVATION_FEED
            },
            onOpenWebView = { url ->
                webViewUrl = url
                webViewBackScreen = Screen.LANDING
                currentScreen = Screen.WEB_VIEW
            }
        )

        Screen.OBSERVATION_FEED -> ObservationFeedScreen(
            firebaseService = firebaseService,
            onBack = { currentScreen = Screen.LANDING },
            prefs = prefs,
            onObservationClick = { obsId ->
                selectedObservationId = obsId
                currentScreen = Screen.OBSERVATION_DETAIL
            },
            onPhenomenaClick = { currentScreen = Screen.PHENOMENA },
            onCollectionClick = { currentScreen = Screen.OBSERVATION_COLLECTION },
            onWebClick = {
                webViewUrl = "https://lostnfound-f0d25.web.app/?tab=havainnot"
                webViewBackScreen = Screen.OBSERVATION_FEED
                currentScreen = Screen.WEB_VIEW
            }
        )

        Screen.OBSERVATION_COLLECTION -> ObservationCollectionScreen(
            firebaseService = firebaseService,
            supabaseService = supabaseService,
            onBack = { currentScreen = Screen.OBSERVATION_FEED },
            onNavigateToObservation = { obsId ->
                selectedObservationId = obsId
                currentScreen = Screen.OBSERVATION_DETAIL
            }
        )

        Screen.OBSERVATION_DETAIL -> selectedObservationId?.let { obsId ->
            ObservationDetailScreen(
                observationId = obsId,
                firebaseService = firebaseService,
                supabaseService = supabaseService,
                isAdminMode = isAdminMode,
                onNavigateToObservation = { newId ->
                    selectedObservationId = newId
                },
                onNavigateToMap = { category, area ->
                    selectedPhenomenonCategory = category
                    selectedPhenomenonArea = area
                    phenomenaMapFocusObsId = obsId
                    phenomenaMapBackScreen = Screen.OBSERVATION_DETAIL
                    currentScreen = Screen.PHENOMENA_MAP
                },
                onBack = { currentScreen = observationDetailBackScreen }
            )
        }

        Screen.PHENOMENA -> PhenomenaScreen(
            firebaseService = firebaseService,
            selectedArea = selectedArea,
            onBack = { currentScreen = Screen.OBSERVATION_FEED },
            onCategorySelected = { category, area ->
                selectedPhenomenonDetailCategory = category
                currentScreen = Screen.PHENOMENON_DETAIL
            }
        )

        Screen.PHENOMENON_DETAIL -> selectedPhenomenonDetailCategory?.let { detailCategory ->
            val hvConfig = HavaintoverkkoRepository.getConfig(LocalContext.current)
            val phenomenon = hvConfig.phenomena.find { it.title.equals(detailCategory, ignoreCase = true) }
            PhenomenonDetailScreen(
                category = detailCategory,
                phenomenon = phenomenon,
                firebaseService = firebaseService,
                onBack = { currentScreen = Screen.PHENOMENA },
                onShowMap = { cat, area ->
                    selectedPhenomenonCategory = cat
                    selectedPhenomenonArea = area
                    phenomenaMapFocusObsId = null
                    phenomenaMapBackScreen = Screen.PHENOMENON_DETAIL
                    currentScreen = Screen.PHENOMENA_MAP
                }
            )
        }

        Screen.PHENOMENA_MAP -> selectedPhenomenonCategory?.let { category ->
            fi.mediazoo.lostrefound.PhenomenaMapScreen(
                category = category,
                area = selectedPhenomenonArea,
                focusObservationId = phenomenaMapFocusObsId,
                firebaseService = firebaseService,
                onBack = { currentScreen = phenomenaMapBackScreen },
                onObservationClick = { obsId ->
                    selectedObservationId = obsId
                    currentScreen = Screen.OBSERVATION_DETAIL
                }
            )
        }

        Screen.CREATE_EVENT -> CreateEventScreen(
            firebaseService = firebaseService,
            onBack = { currentScreen = Screen.LANDING },
            onEventCreated = { newEventId ->
                selectedEventId = newEventId
                currentScreen = Screen.EVENT_DASHBOARD
            }
        )

        Screen.EVENT_DASHBOARD -> selectedEventId?.let { evId ->
            EventDashboardScreen(
                eventId = evId,
                firebaseService = firebaseService,
                onBack = { currentScreen = Screen.LANDING },
                onBrowseItems = { ev ->
                    selectedEventId = ev.id
                    selectedEventName = ev.name
                    selectedArea = null
                    currentScreen = Screen.LIST
                },
                onReportItem = { ev ->
                    selectedEventId = ev.id
                    selectedEventName = ev.name
                    selectedEventLat = ev.latitude
                    selectedEventLng = ev.longitude
                    selectedEventRadius = ev.radius
                    selectedArea = null
                    preselectedCategory = null
                    currentScreen = Screen.ADD
                }
            )
        }

        Screen.CHAT -> {
            val item = selectedItem
            val receiverId = chatReceiverGoogleId
            val receiverEmail = chatReceiverEmail
            if (item != null && receiverId != null) {
                ChatScreen(
                    itemId = item.id,
                    receiverGoogleId = receiverId,
                    receiverEmail = receiverEmail,
                    supabaseService = supabaseService,
                    onBack = { currentScreen = Screen.DETAIL }
                )
            } else {
                currentScreen = Screen.LANDING
            }
        }

        Screen.MY_CHATS -> {
            MyChatsScreen(
                viewModel = chatViewModel,
                firebaseService = firebaseService,
                onBack = { currentScreen = Screen.LANDING },
                onChatSelected = { itemId, receiverId, receiverEmail ->
                    chatReceiverGoogleId = receiverId
                    chatReceiverEmail = receiverEmail
                    coroutineScope.launch {
                        val item = firebaseService.getItemById(itemId)
                        if (item != null) {
                            selectedItem = item
                            currentScreen = Screen.CHAT
                        }
                    }
                }
            )
        }

        Screen.WEB_VIEW -> {
            WebViewScreen(
                url = webViewUrl,
                onBack = { currentScreen = webViewBackScreen }
            )
        }

        Screen.MY_PROFILE -> {
            MyProfileScreen(
                supabaseService = supabaseService,
                firebaseService = firebaseService,
                onBack = { currentScreen = Screen.LANDING },
                onItemDetailClick = { item ->
                    selectedItem = item
                    detailBackScreen = Screen.MY_PROFILE
                    currentScreen = Screen.DETAIL
                },
                onOrganizationClick = { currentScreen = Screen.ORGANIZATION },
                onMyChatsClick = { currentScreen = Screen.MY_CHATS }
            )
        }

        Screen.MORE -> {
            var showInfoDialogInMore by remember { mutableStateOf(false) }
            
            MoreScreen(
                onInfoClick = { showInfoDialogInMore = true },
                onOrganizationClick = { currentScreen = Screen.ORGANIZATION },
                onSettingsClick = { currentScreen = Screen.SETTINGS },
                onQrScanClick = { 
                    qrScannerBackScreen = Screen.MORE
                    currentScreen = Screen.QR_SCANNER 
                },
                onBack = { currentScreen = Screen.LANDING }
            )
            
            if (showInfoDialogInMore) {
                InfoDialog(onDismiss = { showInfoDialogInMore = false })
            }
        }

        Screen.ORGANIZATION -> {
            OrganizationScreen(
                firebaseService = firebaseService,
                supabaseService = supabaseService,
                isAdminMode = isAdminMode,
                onBack = { currentScreen = Screen.MORE },
                onAddNewItem = { org ->
                    selectedOrganizationId = org.id
                    selectedOrganizationName = org.name
                    selectedOrganizationLat = org.latitude
                    selectedOrganizationLng = org.longitude
                    selectedOrganizationZoom = org.zoomLevel
                    currentScreen = Screen.ADD
                },
                onScanQr = { 
                    qrScannerBackScreen = Screen.ORGANIZATION
                    currentScreen = Screen.QR_SCANNER 
                },
                onMoveItem = { item ->
                    itemBeingMoved = item
                    currentScreen = Screen.QR_SCANNER
                },
                onManageLocations = { org ->
                    selectedOrgForLocations = org
                    currentScreen = Screen.STORAGE_LOCATIONS
                },
                onHandoverQr = { item ->
                    itemForHandover = item
                    currentScreen = Screen.QR_SCANNER
                },
                onReports = { org ->
                    selectedOrgForReports = org
                    currentScreen = Screen.REPORTS
                },
                onObservationClick = { obsId ->
                    selectedObservationId = obsId
                    observationDetailBackScreen = Screen.ORGANIZATION
                    currentScreen = Screen.OBSERVATION_DETAIL
                }
            )
        }

        Screen.STORAGE_LOCATIONS -> {
            val org = selectedOrgForLocations
            if (org != null) {
                StorageLocationScreen(
                    organization = org,
                    firebaseService = firebaseService,
                    onBack = { currentScreen = Screen.ORGANIZATION }
                )
            } else {
                currentScreen = Screen.ORGANIZATION
            }
        }

        Screen.REPORTS -> {
            val org = selectedOrgForReports
            if (org != null) {
                ReportsScreen(
                    organization = org,
                    firebaseService = firebaseService,
                    isAdminMode = isAdminMode,
                    onBack = { currentScreen = Screen.ORGANIZATION }
                )
            } else {
                currentScreen = Screen.ORGANIZATION
            }
        }

        Screen.SETTINGS -> {
            SettingsScreen(
                prefs = prefs,
                onBack = { currentScreen = Screen.MORE }
            )
        }

        Screen.QR_SCANNER -> {
            val movingItem = itemBeingMoved
            val handoverItem = itemForHandover
            if (movingItem != null) {
                QrScannerScreen(
                    title = "Skannaa hyllyn QR",
                    hint = "Skannaa uuden varastopaikan koodi",
                    onBack = { 
                        itemBeingMoved = null
                        currentScreen = Screen.ORGANIZATION 
                    },
                    onResult = { raw ->
                        val result = QrCodeUtils.parseQr(raw)
                        if (result is QrCodeUtils.QrResult.Location) {
                            coroutineScope.launch {
                                val loc = firebaseService.getStorageLocation(result.locationId)
                                if (loc != null) {
                                    firebaseService.assignItemToLocation(movingItem.id, loc.id, loc.label)
                                    android.widget.Toast.makeText(context, "Siirretty: ${loc.label}", android.widget.Toast.LENGTH_SHORT).show()
                                } else {
                                    android.widget.Toast.makeText(context, "Tuntematon varastopaikka", android.widget.Toast.LENGTH_SHORT).show()
                                }
                                itemBeingMoved = null
                                currentScreen = Screen.ORGANIZATION
                            }
                        } else {
                            android.widget.Toast.makeText(context, "Väärä koodityyppi, odotettiin varastopaikkaa", android.widget.Toast.LENGTH_SHORT).show()
                            itemBeingMoved = null
                            currentScreen = Screen.ORGANIZATION
                        }
                    }
                )
            } else if (handoverItem != null) {
                QrScannerScreen(
                    title = "Skannaa asiakkaan QR",
                    hint = "Skannaa vastaanottajan LFRUSER-koodi",
                    onBack = { 
                        itemForHandover = null
                        currentScreen = Screen.ORGANIZATION 
                    },
                    onResult = { raw ->
                        val result = QrCodeUtils.parseQr(raw)
                        if (result is QrCodeUtils.QrResult.User) {
                            coroutineScope.launch {
                                // Tee luovutus
                                firebaseService.updateItemStatus(handoverItem.id, ItemStatus.DELIVERED, "")
                                android.widget.Toast.makeText(context, "Kohde luovutettu käyttäjälle: ${result.userId}", android.widget.Toast.LENGTH_LONG).show()
                                itemForHandover = null
                                currentScreen = Screen.ORGANIZATION
                            }
                        } else {
                            android.widget.Toast.makeText(context, "Väärä koodityyppi, odotettiin asiakkaan QR-koodia", android.widget.Toast.LENGTH_SHORT).show()
                            itemForHandover = null
                            currentScreen = Screen.ORGANIZATION
                        }
                    }
                )
            } else {
                QrScannerScreen(
                    title = "Skannaa kohteen QR",
                    hint = "Pidä LFR-QR-koodi kehyksessä",
                    onBack = { currentScreen = qrScannerBackScreen },
                    onResult = { raw ->
                        when (val result = QrCodeUtils.parseQr(raw)) {
                            is QrCodeUtils.QrResult.Item -> {
                                coroutineScope.launch {
                                    val item = firebaseService.getItemById(result.itemId)
                                    if (item != null) {
                                        selectedItem = item
                                        detailBackScreen = qrScannerBackScreen
                                        currentScreen = Screen.DETAIL
                                    } else {
                                        android.widget.Toast.makeText(
                                            context, "Kohdetta ei löydy: ${result.itemId}",
                                            android.widget.Toast.LENGTH_SHORT
                                        ).show()
                                        currentScreen = qrScannerBackScreen
                                    }
                                }
                            }
                            else -> {
                                android.widget.Toast.makeText(
                                    context, "Ei esineen QR-koodi: $raw",
                                    android.widget.Toast.LENGTH_SHORT
                                ).show()
                                currentScreen = qrScannerBackScreen
                            }
                        }
                    }
                )
            }
        }

                Screen.CIRCULAR_HOME -> CircularHomeScreen(
                    viewModel = circularViewModel,
                    onNavigateTo = { currentScreen = it },
                    onBack = { currentScreen = Screen.LANDING }
                )

                Screen.CIRCULAR_BROWSE -> CircularBrowseScreen(
                    viewModel = circularViewModel,
                    onBack = { currentScreen = Screen.CIRCULAR_HOME }
                )

                Screen.CIRCULAR_SUBMIT_OFFER -> CircularSubmitScreen(
                    itemType = CircularItemType.OFFER,
                    viewModel = circularViewModel,
                    supabaseService = supabaseService,
                    firebaseService = firebaseService,
                    defaultArea = selectedArea,
                    defaultPlaceId = selectedPlaceId,
                    defaultPlaceName = selectedPlaceName,
                    onBack = { currentScreen = Screen.CIRCULAR_HOME },
                    onSubmitted = { currentScreen = Screen.CIRCULAR_MY_ITEMS }
                )

                Screen.CIRCULAR_SUBMIT_WANTED -> CircularSubmitScreen(
                    itemType = CircularItemType.WANTED,
                    viewModel = circularViewModel,
                    supabaseService = supabaseService,
                    firebaseService = firebaseService,
                    defaultArea = selectedArea,
                    defaultPlaceId = selectedPlaceId,
                    defaultPlaceName = selectedPlaceName,
                    onBack = { currentScreen = Screen.CIRCULAR_HOME },
                    onSubmitted = { currentScreen = Screen.CIRCULAR_MY_ITEMS }
                )

                Screen.CIRCULAR_MY_ITEMS -> CircularMyItemsScreen(
                    viewModel = circularViewModel,
                    onBack = { currentScreen = Screen.CIRCULAR_HOME }
                )

                Screen.CIRCULAR_MATCHES -> CircularMatchesScreen(
                    viewModel = circularViewModel,
                    currentUid = currentFirebaseUid,
                    onMatchSelected = { matchId ->
                        selectedMatchId = matchId
                        currentScreen = Screen.CIRCULAR_MATCH_DETAIL
                    },
                    onBack = { currentScreen = Screen.CIRCULAR_HOME }
                )

                Screen.CIRCULAR_MATCH_DETAIL -> {
                    val match = circularUiState.myMatches.firstOrNull { it.id == selectedMatchId }
                    if (match != null) {
                        CircularMatchDetailScreen(
                            match = match,
                            currentUid = currentFirebaseUid,
                            viewModel = circularViewModel,
                            onBack = { currentScreen = Screen.CIRCULAR_MATCHES }
                        )
                    } else {
                        // Palautetaan matchilistaan jos match ei löydy (esim. vanhentunut)
                        LaunchedEffect(Unit) { currentScreen = Screen.CIRCULAR_MATCHES }
                    }
                }

                else -> {
                    // Circular Economy -näkymät
                }

            } // Ends when()
    } // Ends Box
    } // Ends Scaffold
}

@Composable
private fun ActionChoiceRow(
    icon: String,
    iconVector: androidx.compose.ui.graphics.vector.ImageVector,
    iconTint: Color,
    title: String,
    subtitle: String,
    onClick: () -> Unit
) {
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(12.dp),
        color = Color(0xFFF8F9FA),
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(44.dp)
                    .background(iconTint.copy(alpha = 0.15f), shape = CircleShape),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    iconVector,
                    contentDescription = null,
                    tint = iconTint,
                    modifier = Modifier.size(24.dp)
                )
            }
            Spacer(modifier = Modifier.width(14.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = title,
                    fontWeight = FontWeight.Bold,
                    fontSize = 16.sp,
                    color = Color(0xFF1E293B)
                )
                Text(
                    text = subtitle,
                    color = Color.Gray,
                    fontSize = 13.sp
                )
            }
            Text(text = icon, fontSize = 20.sp)
        }
    }
}

@Composable
private fun ObservationTypeChoiceRow(
    icon: String,
    title: String,
    subtitle: String,
    onClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(text = icon, fontSize = 26.sp, modifier = Modifier.padding(end = 14.dp))
        Column {
            Text(text = title, fontWeight = FontWeight.Bold, fontSize = 15.sp)
            Text(text = subtitle, color = Color.Gray, fontSize = 13.sp)
        }
    }
}
