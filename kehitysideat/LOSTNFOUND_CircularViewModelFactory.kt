package fi.mediazoo.lostrefound.circular

import android.app.Application
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import fi.mediazoo.lostrefound.SupabaseService

// ============================================================================
// CircularViewModelFactory
//
// Luo CircularViewModel-instanssin riippuvuuksineen.
// Lisätään ViewModelFactory.kt:n rinnalle — ei muuteta olemassa olevaa
// LostFoundViewModelFactory-luokkaa.
// ============================================================================

class CircularViewModelFactory(
    private val supabaseService: SupabaseService
) : ViewModelProvider.Factory {

    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        if (modelClass.isAssignableFrom(CircularViewModel::class.java)) {
            val repository = CircularRepository(supabaseService)
            return CircularViewModel(repository) as T
        }
        throw IllegalArgumentException("Tuntematon ViewModel-luokka: ${modelClass.name}")
    }
}

