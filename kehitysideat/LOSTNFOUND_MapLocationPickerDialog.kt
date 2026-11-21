package fi.mediazoo.lostrefound.ui.components

import android.Manifest
import android.util.Log
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.MyLocation
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.google.accompanist.permissions.ExperimentalPermissionsApi
import com.google.accompanist.permissions.isGranted
import com.google.accompanist.permissions.rememberPermissionState
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.maplibre.android.annotations.MarkerOptions
import org.maplibre.android.camera.CameraPosition
import org.maplibre.android.camera.CameraUpdateFactory
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.maps.MapView
import org.maplibre.android.maps.Style

@OptIn(ExperimentalPermissionsApi::class)
@Composable
fun MapLocationPickerDialog(
    initialLat: Double,
    initialLon: Double,
    selectedArea: String? = null,
    title: String = "📍 Valitse sijainti kartalta",
    confirmButtonText: String = "Vahvista sijainti",
    onLocationConfirmed: (lat: Double, lon: Double) -> Unit,
    onDismiss: () -> Unit
) {
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black.copy(alpha = 0.5f))
        ) {
            val context = LocalContext.current
            val coroutineScope = rememberCoroutineScope()
            val mapView = remember { MapView(context) }
            var currentZoom by remember { mutableStateOf(14.0) }
            var mapLibreMap by remember { mutableStateOf<org.maplibre.android.maps.MapLibreMap?>(null) }
            
            var tempPosition by remember { 
                mutableStateOf(LatLng(initialLat, initialLon)) 
            }
            
            val fusedLocationClient = remember { LocationServices.getFusedLocationProviderClient(context) }
            val locationPermState = rememberPermissionState(Manifest.permission.ACCESS_FINE_LOCATION)

            fun applyLocation(lat: Double, lon: Double) {
                val userLatLng = LatLng(lat, lon)
                tempPosition = userLatLng
                mapLibreMap?.animateCamera(
                    CameraUpdateFactory.newCameraPosition(
                        CameraPosition.Builder()
                            .target(userLatLng)
                            .zoom(16.0)
                            .build()
                    ), 500
                )
                currentZoom = 16.0
            }

            fun locateUser() {
                if (locationPermState.status.isGranted) {
                    try {
                        fusedLocationClient.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, null)
                            .addOnSuccessListener { loc ->
                                if (loc != null) {
                                    applyLocation(loc.latitude, loc.longitude)
                                } else {
                                    fusedLocationClient.lastLocation.addOnSuccessListener { lastLoc ->
                                        if (lastLoc != null) {
                                            applyLocation(lastLoc.latitude, lastLoc.longitude)
                                        } else {
                                            Toast.makeText(context, "Sijaintia ei löytynyt", Toast.LENGTH_SHORT).show()
                                        }
                                    }
                                }
                            }
                            .addOnFailureListener {
                                Toast.makeText(context, "Virhe sijainnin haussa", Toast.LENGTH_SHORT).show()
                            }
                    } catch (e: SecurityException) {
                        Log.e("MapPicker", "Sijaintilupaa ei ole", e)
                    }
                } else {
                    locationPermState.launchPermissionRequest()
                }
            }

            fun zoomIn() {
                mapLibreMap?.let { map ->
                    currentZoom = (currentZoom + 1).coerceAtMost(18.0)
                    map.animateCamera(
                        CameraUpdateFactory.newCameraPosition(
                            CameraPosition.Builder()
                                .target(map.cameraPosition.target)
                                .zoom(currentZoom)
                                .build()
                        ), 300
                    )
                }
            }

            fun zoomOut() {
                mapLibreMap?.let { map ->
                    currentZoom = (currentZoom - 1).coerceAtLeast(0.0)
                    map.animateCamera(
                        CameraUpdateFactory.newCameraPosition(
                            CameraPosition.Builder()
                                .target(map.cameraPosition.target)
                                .zoom(currentZoom)
                                .build()
                        ), 300
                    )
                }
            }

            DisposableEffect(mapView) {
                val mapReadyListener = org.maplibre.android.maps.OnMapReadyCallback { map ->
                    mapLibreMap = map
                    try {
                        map.setStyle(Style.Builder().fromUri("https://tiles.openfreemap.org/styles/liberty")) {
                            coroutineScope.launch {
                                delay(300)
                                map.addOnMapClickListener { point ->
                                    tempPosition = point
                                    true
                                }
                                val startPos = tempPosition ?: LatLng(initialLat, initialLon)
                                map.cameraPosition = CameraPosition.Builder()
                                    .target(startPos)
                                    .zoom(currentZoom)
                                    .build()
                            }
                        }
                    } catch (e: Exception) {
                        Log.e("MapPicker", "Error initializing map", e)
                    }
                }

                mapView.getMapAsync(mapReadyListener)

                onDispose {
                    mapView.onDestroy()
                }
            }

            // Marker visualization
            LaunchedEffect(tempPosition, mapLibreMap) {
                mapLibreMap?.let { map ->
                    map.clear()
                    tempPosition?.let { pos ->
                        map.addMarker(MarkerOptions().position(pos))
                    }
                }
            }

            AndroidView(
                factory = { mapView },
                modifier = Modifier.fillMaxSize()
            )

            // Header info & Close button at top
            Row(
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .fillMaxWidth()
                    .padding(16.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Card(
                    colors = CardDefaults.cardColors(containerColor = Color.White.copy(alpha = 0.95f)),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.weight(1f)
                ) {
                    Column(modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp)) {
                        Text(
                            text = title,
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFF212121)
                        )
                        Text(
                            text = "Kosketa karttaa tai paina GPS-painiketta",
                            style = MaterialTheme.typography.bodySmall,
                            color = Color(0xFF616161)
                        )
                    }
                }
                Spacer(modifier = Modifier.width(8.dp))
                IconButton(
                    onClick = onDismiss,
                    colors = IconButtonDefaults.iconButtonColors(containerColor = Color.White)
                ) {
                    Icon(Icons.Default.Close, contentDescription = "Sulje", tint = Color(0xFF212121))
                }
            }

            // Zoom and Locate controls
            Column(
                modifier = Modifier
                    .align(Alignment.CenterEnd)
                    .padding(16.dp)
            ) {
                FloatingActionButton(
                    onClick = { locateUser() },
                    modifier = Modifier.padding(bottom = 16.dp),
                    containerColor = Color.White,
                    contentColor = Color(0xFF2E7D32)
                ) {
                    Icon(Icons.Default.MyLocation, contentDescription = "Oma sijainti (GPS)")
                }
                FloatingActionButton(
                    onClick = { zoomIn() },
                    modifier = Modifier.padding(bottom = 8.dp),
                    containerColor = Color.White,
                    contentColor = Color(0xFF212121)
                ) {
                    Icon(Icons.Default.Add, contentDescription = "Lähennä")
                }
                FloatingActionButton(
                    onClick = { zoomOut() },
                    containerColor = Color.White,
                    contentColor = Color(0xFF212121)
                ) {
                    Icon(Icons.Default.Remove, contentDescription = "Loitonna")
                }
            }

            // Select location button at bottom
            Column(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(16.dp)
                    .padding(bottom = 24.dp)
            ) {
                Button(
                    onClick = {
                        tempPosition?.let {
                            onLocationConfirmed(it.latitude, it.longitude)
                        }
                    },
                    enabled = tempPosition != null,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(54.dp),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2E7D32))
                ) {
                    Text(
                        "$confirmButtonText (%.4f, %.4f)".format(tempPosition?.latitude ?: 0.0, tempPosition?.longitude ?: 0.0),
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
        }
    }
}
