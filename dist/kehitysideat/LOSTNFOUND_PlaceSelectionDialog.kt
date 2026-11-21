package fi.mediazoo.lostrefound.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import fi.mediazoo.lostrefound.model.Place

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlaceSelectionDialog(
    nearbyPlaces: List<Place>,
    onPlaceSelected: (Place) -> Unit,
    onCreateNewPlace: () -> Unit,
    onDismiss: () -> Unit,
    onSuggestNewPlace: (name: String, lat: Double?, lon: Double?) -> Unit = { _, _, _ -> },
    onPickLocationOnMap: (suggestionName: String) -> Unit = {},
    currentLat: Double? = null,
    currentLon: Double? = null,
    title: String = "📍 Missä havainto sijaitsee?",
    confirmButtonText: String = "📍 Liitä havainto tähän paikkaan"
) {
    var searchQuery by remember { mutableStateOf("") }
    var selectedPlaceForSummary by remember { mutableStateOf<Place?>(null) }
    var selectedParentPlace by remember { mutableStateOf<Place?>(null) }
    var showSuggestionConfirm by remember { mutableStateOf(false) }
    
    // DEBUG: loki parent_place_id-arvoista
    android.util.Log.d("PlaceDialog", "=== Paikkalista (${nearbyPlaces.size} kpl) ===")
    nearbyPlaces.forEach { p ->
        android.util.Log.d("PlaceDialog", "  id=${p.id} name=${p.name} parentId=${p.parentPlaceId}")
    }
    
    val parentIdsInList = remember(nearbyPlaces) { nearbyPlaces.map { it.id }.toSet() }

    // Filter places based on search query or hierarchy
    val placesToShow = remember(searchQuery, selectedParentPlace, nearbyPlaces, parentIdsInList) {
        val filtered = if (searchQuery.isNotBlank()) {
            nearbyPlaces.filter { it.displayName.contains(searchQuery, ignoreCase = true) }
        } else if (selectedParentPlace != null) {
            nearbyPlaces.filter { it.parentPlaceId == selectedParentPlace!!.id }
        } else {
            // Päänäkymä: näytetään paikat, joiden parentId ei ole itse tässä listassa (eli juuritason kohteet ja alueet)
            val roots = nearbyPlaces.filter { it.parentPlaceId == null || !parentIdsInList.contains(it.parentPlaceId) }
            if (roots.isNotEmpty()) roots else nearbyPlaces
        }
        
        // Järjestetään ensisijaisesti tärkeyden mukaan (isoin ensin), sitten nimen mukaan
        filtered.sortedWith(compareByDescending<Place> { it.importance }.thenBy { it.displayName })
    }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Surface(
            modifier = Modifier.fillMaxSize(),
            color = MaterialTheme.colorScheme.background
        ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(16.dp)
        ) {
            // Header
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                if (selectedParentPlace != null && selectedPlaceForSummary == null && searchQuery.isBlank()) {
                    IconButton(onClick = { selectedParentPlace = null }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Takaisin")
                    }
                }
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.weight(1f)
                )
                IconButton(onClick = onDismiss) {
                    Icon(Icons.Default.Close, contentDescription = "Sulje")
                }
            }
            
            Spacer(modifier = Modifier.height(16.dp))
            
            if (selectedPlaceForSummary != null) {
                val place = selectedPlaceForSummary!!
                Spacer(modifier = Modifier.height(16.dp))
                
                Text(
                    text = "Oletko tässä paikassa?",
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(bottom = 8.dp)
                )
                
                PlaceCard(
                    place = place,
                    onClick = { /* Myöhemmin avataan tästä koko paikan näkymä */ }
                )
                
                Spacer(modifier = Modifier.weight(1f))
                
                Button(
                    onClick = { onPlaceSelected(place) },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(56.dp),
                    shape = androidx.compose.foundation.shape.RoundedCornerShape(12.dp)
                ) {
                    Text(confirmButtonText, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                }
                
                Spacer(modifier = Modifier.height(12.dp))
                
                TextButton(
                    onClick = { selectedPlaceForSummary = null },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Takaisin listaan")
                }
                
                Spacer(modifier = Modifier.height(16.dp))
            } else {
                // Search field
                if (selectedParentPlace == null) {
                    OutlinedTextField(
                        value = searchQuery,
                        onValueChange = { searchQuery = it },
                        modifier = Modifier.fillMaxWidth(),
                        placeholder = { Text("Hae paikka...") },
                        leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                        singleLine = true
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    HorizontalDivider()
                } else if (searchQuery.isBlank()) {
                    Text(
                        text = selectedParentPlace!!.displayName,
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.padding(vertical = 8.dp)
                    )
                    HorizontalDivider()
                }
                
                // List of places
                LazyColumn(
                    modifier = Modifier.weight(1f)
                ) {
                    if (placesToShow.isEmpty() && searchQuery.isNotBlank()) {
                        item {
                            Text(
                                text = "Paikkaa ei löytynyt hakusanalla.",
                                modifier = Modifier.padding(16.dp),
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    } else {
                        if (selectedParentPlace == null && searchQuery.isBlank()) {
                            item {
                                Column(modifier = Modifier.padding(vertical = 8.dp)) {
                                    Text(
                                        text = "📍 Pääalueet",
                                        style = MaterialTheme.typography.titleMedium,
                                        fontWeight = FontWeight.Bold,
                                        color = MaterialTheme.colorScheme.onSurface
                                    )
                                    Text(
                                        text = "Valitse alue ja sen jälkeen tarkempi kohde",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                            }
                        }
                        
                        if (selectedParentPlace != null && searchQuery.isBlank()) {
                            item {
                                ListItem(
                                    headlineContent = { Text("Koko alue: ${selectedParentPlace!!.displayName}", fontWeight = FontWeight.Bold) },
                                    supportingContent = { Text("Liitä havainto koko alueeseen") },
                                    leadingContent = {
                                        Icon(Icons.Default.Place, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                                    },
                                    modifier = Modifier.clickable { selectedPlaceForSummary = selectedParentPlace }
                                )
                                HorizontalDivider()
                            }
                            if (placesToShow.isNotEmpty()) {
                                item {
                                    Text(
                                        text = "Tarkemmat kohteet",
                                        style = MaterialTheme.typography.labelLarge,
                                        modifier = Modifier.padding(vertical = 8.dp),
                                        color = MaterialTheme.colorScheme.secondary
                                    )
                                }
                            }
                        }
                        
                        items(placesToShow) { place ->
                            val hasChildren = nearbyPlaces.any { it.parentPlaceId == place.id }
                            ListItem(
                                headlineContent = { Text(place.displayName) },
                                supportingContent = { 
                                    if (hasChildren && searchQuery.isBlank()) {
                                        Text("Sisältää alakohteita")
                                    } else {
                                        Text(place.type ?: "Muu kohde")
                                    }
                                },
                                leadingContent = {
                                    Icon(Icons.Default.Place, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                                },
                                modifier = Modifier.clickable { 
                                    if (hasChildren && searchQuery.isBlank()) {
                                        selectedParentPlace = place
                                    } else {
                                        selectedPlaceForSummary = place
                                    }
                                }
                            )
                            HorizontalDivider()
                        }
                    }
                    
                    if (searchQuery.isNotBlank()) {
                        item {
                            Spacer(modifier = Modifier.height(16.dp))
                            ListItem(
                                headlineContent = { Text("+ Ehdota uutta paikkaa", fontWeight = FontWeight.Bold) },
                                supportingContent = {
                                    if (currentLat != null && currentLon != null) {
                                        Text("Lähettää sijainnillasi: '${searchQuery}' (📍 ${String.format("%.4f", currentLat)}, ${String.format("%.4f", currentLon)})")
                                    } else {
                                        Text("Lähetä ylläpidolle ehdotus: '${searchQuery}' (sijainti tuntematon)")
                                    }
                                },
                                leadingContent = {
                                    Icon(Icons.Default.Add, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                                },
                                modifier = Modifier.clickable { showSuggestionConfirm = true }
                            )
                            HorizontalDivider()
                        }
                    }

                    // Vahvistus-dialog paikkaehdotukselle
                    if (showSuggestionConfirm) {
                        item {
                            Card(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(8.dp),
                                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)
                            ) {
                                Column(modifier = Modifier.padding(16.dp)) {
                                    Text(
                                        "Ehdotetaan paikkaa:",
                                        style = MaterialTheme.typography.labelLarge,
                                        color = MaterialTheme.colorScheme.onPrimaryContainer
                                    )
                                    Text(
                                        "📍 $searchQuery",
                                        style = MaterialTheme.typography.titleMedium,
                                        fontWeight = FontWeight.Bold,
                                        modifier = Modifier.padding(vertical = 4.dp)
                                    )
                                    if (currentLat != null && currentLon != null) {
                                        Text(
                                            "Sijainti: ${String.format("%.5f", currentLat)}, ${String.format("%.5f", currentLon)}",
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.7f)
                                        )
                                    } else {
                                        Text(
                                            "⚠️ Sijaintia ei saatavilla",
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.error
                                        )
                                        Spacer(modifier = Modifier.height(6.dp))
                                        OutlinedButton(
                                            onClick = {
                                                showSuggestionConfirm = false
                                                onPickLocationOnMap(searchQuery)
                                            },
                                            modifier = Modifier.fillMaxWidth()
                                        ) {
                                            Icon(
                                                Icons.Default.Place,
                                                contentDescription = null,
                                                modifier = Modifier.size(16.dp)
                                            )
                                            Spacer(modifier = Modifier.width(6.dp))
                                            Text("Valitse sijainti kartalta", style = MaterialTheme.typography.labelMedium)
                                        }
                                    }
                                    Spacer(modifier = Modifier.height(12.dp))
                                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                        TextButton(
                                            onClick = { showSuggestionConfirm = false },
                                            modifier = Modifier.weight(1f)
                                        ) { Text("Peruuta") }
                                        Button(
                                            onClick = {
                                                onSuggestNewPlace(searchQuery, currentLat, currentLon)
                                                showSuggestionConfirm = false
                                            },
                                            modifier = Modifier.weight(1f)
                                        ) { Text("Lähetä ehdotus") }
                                    }
                                }
                            }
                        }
                    }
                    
                    // Create new place / Select from map option
                    if (searchQuery.isBlank() && selectedParentPlace == null) {
                        item {
                            Spacer(modifier = Modifier.height(16.dp))
                            ListItem(
                                headlineContent = { Text("Valitse sijainti kartalta", fontWeight = FontWeight.Bold) },
                                supportingContent = { Text("Merkitse havainto vapaasti kartalle") },
                                leadingContent = {
                                    Icon(Icons.Default.Place, contentDescription = null, tint = MaterialTheme.colorScheme.secondary)
                                },
                                modifier = Modifier.clickable { onCreateNewPlace() }
                            )
                        }
                    }
                }
            }
        }
    }
}
}
