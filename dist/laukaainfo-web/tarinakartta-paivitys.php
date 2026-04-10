<?php
/**
 * Tarinakartta-paivitystyökalu (Editor)
 * ───────────────────────────────────────
 * Mahdollistaa tarinakartta_data.csv tiedoston muokkaamisen visuaalisesti.
 */

date_default_timezone_set('Europe/Helsinki');

$csvFile = 'tarinakartta_data.csv';
$message = '';
$adminToken = 'ADMIN-99-LPS'; // Sama kuin publish.php

// --- TALLENNUSLOGIIKKA ---
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action']) && $_POST['action'] === 'save') {
    $token = $_POST['token'] ?? '';
    
    if ($token !== $adminToken) {
        $message = "Virhe: Pääsy estetty. Väärä salasana/token.";
    } else {
        $jsonData = $_POST['data'] ?? '[]';
        $steps = json_decode($jsonData, true);
        
        if (is_array($steps)) {
            $header = ['step_order', 'category', 'topic', 'story_name', 'title', 'description', 'lat', 'lng', 'image_url', 'more_info_url', 'audio_url'];
            $handle = fopen($csvFile, 'w');
            fputcsv($handle, $header);
            
            foreach ($steps as $index => $step) {
                $row = [
                    $index + 1, // step_order
                    $step['category'] ?? '',
                    $step['topic'] ?? '',
                    $step['story_name'] ?? '',
                    $step['title'] ?? '',
                    $step['description'] ?? '',
                    $step['lat'] ?? '',
                    $step['lng'] ?? '',
                    $step['image_url'] ?? '',
                    $step['more_info_url'] ?? '',
                    $step['audio_url'] ?? ''
                ];
                fputcsv($handle, $row);
            }
            fclose($handle);
            $message = "Tiedot tallennettu onnistuneesti! ✅";
        } else {
            $message = "Virhe: Virheellistä dataa.";
        }
    }
}

// --- LUETAAN NYKYINEN DATA (CSV -> JS varten) ---
$currentData = [];
$readPath = $csvFile;

// Jos paikallista tiedostoa ei ole, kokeillaan lukea juuresta (automaattinen import)
if (!file_exists($readPath) && file_exists('../' . $csvFile)) {
    $readPath = '../' . $csvFile;
}

if (file_exists($readPath)) {
    $handle = fopen($readPath, 'r');
    $headers = fgetcsv($handle);
    if ($headers) {
        while (($row = fgetcsv($handle)) !== FALSE) {
            if (count($row) < count($headers)) continue;
            $currentData[] = array_combine($headers, $row);
        }
    }
    fclose($handle);
}
?>
<!DOCTYPE html>
<html lang="fi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Tarinakartta Editori — LaukaaInfo</title>
    <link rel="icon" href="../logo.png">
    
    <!-- Fonts -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
    
    <!-- Leaflet -->
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    
    <!-- SortableJS -->
    <script src="https://cdn.jsdelivr.net/npm/sortablejs@1.15.0/Sortable.min.js"></script>

    <style>
        :root {
            --primary: #007bff;
            --primary-dark: #0056b3;
            --bg: #0f172a;
            --card: #1e293b;
            --text: #f8fafc;
            --text-muted: #94a3b8;
            --border: #334155;
            --accent: #f59e0b;
            --success: #10b981;
            --error: #ef4444;
        }

        * { box-sizing: border-box; }
        body {
            font-family: 'Inter', sans-serif;
            background-color: var(--bg);
            color: var(--text);
            margin: 0;
            overflow: hidden;
            height: 100vh;
            display: flex;
            flex-direction: column;
        }

        h1, h2, h3 { font-family: 'Outfit', sans-serif; margin-top: 0; }

        /* Header */
        header {
            background: rgba(30, 41, 59, 0.8);
            backdrop-filter: blur(10px);
            padding: 0.75rem 1.5rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid var(--border);
            z-index: 1000;
        }

        .logo-area { display: flex; align-items: center; gap: 10px; }
        .logo-area img { height: 32px; }
        .logo-area span { font-weight: 800; font-size: 1.2rem; color: var(--text); }

        .auth-area { display: flex; align-items: center; gap: 15px; }
        .auth-area input {
            background: #0f172a;
            border: 1px solid var(--border);
            color: white;
            padding: 0.5rem 0.8rem;
            border-radius: 8px;
            font-size: 0.9rem;
        }

        .btn {
            background: var(--primary);
            color: white;
            border: none;
            padding: 0.6rem 1.2rem;
            border-radius: 8px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
            display: inline-flex;
            align-items: center;
            gap: 8px;
        }
        .btn:hover { background: var(--primary-dark); transform: translateY(-1px); }
        .btn-success { background: var(--success); }
        .btn-success:hover { background: #059669; }
        .btn-accent { background: var(--accent); color: #000; }
        .btn-accent:hover { background: #d97706; }

        /* Main Layout */
        main {
            display: flex;
            flex: 1;
            overflow: hidden;
        }

        /* Left Panel: Sidebar / Editor */
        #editor-pane {
            width: 450px;
            background: var(--card);
            border-right: 1px solid var(--border);
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        .pane-header {
            padding: 1.5rem;
            border-bottom: 1px solid var(--border);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        #step-list {
            flex: 1;
            overflow-y: auto;
            padding: 1rem;
        }

        .step-item {
            background: #0f172a;
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 1rem;
            margin-bottom: 0.8rem;
            cursor: pointer;
            transition: all 0.2s;
            position: relative;
            display: flex;
            align-items: center;
            gap: 15px;
        }
        .step-item:hover { border-color: var(--primary); background: #1e293b; }
        .step-item.active { border-color: var(--primary); background: #1e293b; box-shadow: 0 0 0 2px var(--primary); }

        .step-handle { cursor: grab; color: var(--text-muted); }
        .step-number {
            width: 30px;
            height: 30px;
            background: var(--primary);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            font-size: 0.85rem;
            flex-shrink: 0;
        }
        .step-info { flex: 1; overflow: hidden; }
        .step-info h4 { margin: 0; font-size: 0.95rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .step-info p { margin: 4px 0 0; font-size: 0.8rem; color: var(--text-muted); }

        .btn-delete {
            opacity: 0;
            background: rgba(239, 68, 68, 0.1);
            color: var(--error);
            border: 1px solid var(--error);
            padding: 4px 8px;
            border-radius: 6px;
            font-size: 0.75rem;
            transition: all 0.2s;
        }
        .step-item:hover .btn-delete { opacity: 1; }
        .btn-delete:hover { background: var(--error); color: white; }

        /* Right Panel: Map & Form */
        #content-pane {
            flex: 1;
            display: flex;
            flex-direction: column;
            position: relative;
        }

        #map-area {
            flex: 1;
            position: relative;
        }

        #map { width: 100%; height: 100%; }

        /* Float Form */
        #edit-form-overlay {
            position: absolute;
            top: 20px;
            right: 20px;
            width: 400px;
            max-height: calc(100% - 40px);
            background: rgba(30, 41, 59, 0.95);
            backdrop-filter: blur(15px);
            border: 1px solid var(--border);
            border-radius: 20px;
            padding: 1.5rem;
            box-shadow: 0 20px 50px rgba(0,0,0,0.5);
            display: none; /* Shown when a step is selected */
            flex-direction: column;
            z-index: 1001;
            overflow-y: auto;
        }

        .form-group { margin-bottom: 1rem; }
        .form-group label { display: block; margin-bottom: 0.4rem; font-size: 0.85rem; color: var(--text-muted); font-weight: 500; }
        .form-group input, .form-group textarea, .form-group select {
            width: 100%;
            background: #0f172a;
            border: 1px solid var(--border);
            color: white;
            padding: 0.6rem;
            border-radius: 8px;
            font-family: inherit;
        }
        .form-group textarea { resize: vertical; height: 80px; }
        .form-group input:focus { border-color: var(--primary); outline: none; }

        .lat-lng-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }

        .search-container {
            position: absolute;
            top: 20px;
            left: 20px;
            z-index: 1000;
            width: 300px;
        }
        .search-container input {
            width: 100%;
            padding: 0.8rem 1.2rem;
            border-radius: 50px;
            border: 1px solid var(--border);
            background: rgba(30, 41, 59, 0.9);
            color: white;
            backdrop-filter: blur(5px);
            box-shadow: 0 4px 15px rgba(0,0,0,0.3);
        }

        /* Alerts */
        .toast {
            position: fixed;
            bottom: 30px;
            left: 50%;
            transform: translateX(-50%);
            padding: 1rem 2rem;
            border-radius: 50px;
            background: var(--success);
            color: white;
            font-weight: 600;
            z-index: 2000;
            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
            display: none;
            animation: slideUp 0.3s ease-out;
        }

        @keyframes slideUp {
            from { transform: translate(-50%, 100%); opacity: 0; }
            to { transform: translate(-50%, 0); opacity: 1; }
        }

        .image-preview {
            width: 100%;
            height: 120px;
            background: #0f172a;
            border-radius: 8px;
            overflow: hidden;
            margin-top: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 1px dashed var(--border);
        }
        .image-preview img { width: 100%; height: 100%; object-fit: cover; }

        #empty-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            color: var(--text-muted);
            height: 100%;
            text-align: center;
            padding: 2rem;
        }
        #empty-state svg { width: 64px; height: 64px; margin-bottom: 1rem; opacity: 0.5; }
    </style>
</head>
<body>

<header>
    <div class="logo-area">
        <img src="../logo.png" alt="Logo">
        <span>Tarinakartta Editori</span>
    </div>
    
    <div class="auth-area">
        <input type="password" id="auth-token" placeholder="Syötä Admin-token" value="">
        <button class="btn btn-success" id="save-all-btn">
            <span>💾 Tallenna kaikki</span>
        </button>
    </div>
</header>

<main>
    <div id="editor-pane">
        <div class="pane-header">
            <h3>Tarinan askeleet</h3>
            <button class="btn btn-accent btn-small" id="add-step-btn">
                <span>➕ Lisää uusi</span>
            </button>
        </div>
        
        <div id="step-list">
            <!-- Steps will be injected here -->
        </div>
    </div>
    
    <div id="content-pane">
        <div class="search-container">
            <input type="text" id="geo-search" placeholder="Hae osoitteella...">
        </div>
        
        <div id="map-area">
            <div id="map"></div>
        </div>
        
        <div id="edit-form-overlay">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
                <h3 style="margin:0;">Muokkaa kohdetta</h3>
                <button id="close-form" style="background:none; border:none; color:white; font-size:1.5rem; cursor:pointer;">&times;</button>
            </div>
            
            <div class="form-group">
                <label>Otsikko (Title)</label>
                <input type="text" id="f-title" placeholder="Kohteen nimi">
            </div>
            
            <div class="form-group">
                <label>Tarinan osa (Story name)</label>
                <input type="text" id="f-story_name" placeholder="Esim. Kirkkoherran tarina">
            </div>
            
            <div class="form-group">
                <label>Kuvaus (Description)</label>
                <textarea id="f-description" placeholder="Kerro tästä kohteesta..."></textarea>
            </div>
            
            <div class="lat-lng-row">
                <div class="form-group">
                    <label>Latitud (Leveys)</label>
                    <input type="number" step="any" id="f-lat">
                </div>
                <div class="form-group">
                    <label>Longitud (Pituus)</label>
                    <input type="number" step="any" id="f-lng">
                </div>
            </div>
            <p style="font-size: 0.7rem; color: var(--accent); margin-top: -5px;">💡 Voit myös klikata karttaa asettaaksesi sijainnin.</p>
            
            <div class="row" style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                <div class="form-group">
                    <label>Kategoria</label>
                    <input type="text" id="f-category" placeholder="Esim. Historia">
                </div>
                <div class="form-group">
                    <label>Aihe (Topic)</label>
                    <input type="text" id="f-topic" placeholder="Esim. Kirkkohistoria">
                </div>
            </div>
            
            <div class="form-group">
                <label>Kuva URL (ImageKit tai YouTube thumb)</label>
                <input type="text" id="f-image_url" placeholder="https://...">
                <div class="image-preview" id="f-img-preview">
                    <span>Ei kuvaa</span>
                </div>
            </div>
            
            <div class="form-group">
                <label>Lisätietolinkki (URL)</label>
                <input type="url" id="f-more_info_url" placeholder="https://...">
            </div>

            <div class="form-group">
                <label>Ääni URL (MP3/OGG)</label>
                <input type="url" id="f-audio_url" placeholder="https://...">
            </div>
        </div>
        
        <div id="empty-state" style="position: absolute; top:0; left:0; right:0; bottom:0; background: var(--bg); z-index: 500;">
             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"/><path d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"/></svg>
             <h3>Tervetuloa tarinaeditoriin</h3>
             <p>Valitse askel vasemmalta muokataksesi tai <br>lisää uusi kohde napista.</p>
             <button class="btn btn-accent" style="margin-top:1rem;" onclick="document.getElementById('add-step-btn').click()">Aloita uusi tarina</button>
        </div>
    </div>
</main>

<div class="toast" id="toast">Tallennettu!</div>

<!-- Footer Hidden Form for Saving -->
<form id="save-form" method="POST" style="display:none;">
    <input type="hidden" name="action" value="save">
    <input type="hidden" name="token" id="save-token">
    <input type="hidden" name="data" id="save-data">
</form>

<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>

<script>
    // 1. DATA INITIALIZATION
    let steps = <?php echo json_encode($currentData); ?>;
    let selectedIndex = -1;
    let map, activeMarker;
    let stepMarkers = [];

    // 2. UI ELEMENTS
    const listEl = document.getElementById('step-list');
    const formOverlay = document.getElementById('edit-form-overlay');
    const emptyState = document.getElementById('empty-state');
    const toast = document.getElementById('toast');
    
    // 3. MAP SETUP
    function initMap() {
        map = L.map('map').setView([62.4, 25.9], 10);
        L.tileLayer('https://{s}.tile.osm.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OSM contributors'
        }).addTo(map);

        map.on('click', (e) => {
            if (selectedIndex !== -1) {
                const { lat, lng } = e.latlng;
                updateStepCoords(lat, lng);
            }
        });
    }

    function updateStepCoords(lat, lng) {
        document.getElementById('f-lat').value = lat.toFixed(6);
        document.getElementById('f-lng').value = lng.toFixed(6);
        steps[selectedIndex].lat = lat.toFixed(6).toString();
        steps[selectedIndex].lng = lng.toFixed(6).toString();
        updateMarkers();
    }

    function updateMarkers() {
        // Clear old markers
        stepMarkers.forEach(m => map.removeLayer(m));
        stepMarkers = [];

        steps.forEach((step, idx) => {
            const lat = parseFloat(step.lat);
            const lng = parseFloat(step.lng);
            if (isNaN(lat) || isNaN(lng)) return;

            const isSelected = idx === selectedIndex;
            const marker = L.marker([lat, lng], {
                icon: L.divIcon({
                    className: 'custom-icon',
                    html: `<div style="background:${isSelected ? '#f59e0b' : '#007bff'}; color:white; padding:5px; border-radius:50%; width:24px; height:24px; text-align:center; font-size:10px; font-weight:bold; border:2px solid white;">${idx + 1}</div>`,
                    iconSize: [24, 24]
                }),
                draggable: isSelected
            }).addTo(map);

            marker.on('click', () => selectStep(idx));
            
            if (isSelected) {
                marker.on('dragend', (e) => {
                    const { lat, lng } = e.target.getLatLng();
                    updateStepCoords(lat, lng);
                });
            }

            stepMarkers.push(marker);
        });
    }

    // 4. CRUD LOGIC
    function renderList() {
        listEl.innerHTML = '';
        steps.forEach((step, idx) => {
            const div = document.createElement('div');
            div.className = `step-item ${idx === selectedIndex ? 'active' : ''}`;
            div.dataset.index = idx;
            div.innerHTML = `
                <div class="step-handle">⋮⋮</div>
                <div class="step-number">${idx + 1}</div>
                <div class="step-info">
                    <h4>${step.title || 'Nimetön kohde'}</h4>
                    <p>${step.category || 'Ei kategoriaa'} • ${step.story_name || ''}</p>
                </div>
                <button class="btn-delete" onclick="deleteStep(event, ${idx})">Poista</button>
            `;
            div.onclick = () => selectStep(idx);
            listEl.appendChild(div);
        });

        // Re-init Sortable
        new Sortable(listEl, {
            animation: 150,
            handle: '.step-handle',
            onEnd: function (evt) {
                const oldIdx = evt.oldIndex;
                const newIdx = evt.newIndex;
                const moved = steps.splice(oldIdx, 1)[0];
                steps.splice(newIdx, 0, moved);
                
                // Keep selection on the same item
                if (selectedIndex === oldIdx) selectedIndex = newIdx;
                else if (oldIdx < selectedIndex && newIdx >= selectedIndex) selectedIndex--;
                else if (oldIdx > selectedIndex && newIdx <= selectedIndex) selectedIndex++;

                renderList();
                updateMarkers();
            }
        });
    }

    function selectStep(idx) {
        selectedIndex = idx;
        const step = steps[idx];
        
        // UI
        emptyState.style.display = 'none';
        formOverlay.style.display = 'flex';
        renderList();
        
        // Fill Form
        document.getElementById('f-title').value = step.title || '';
        document.getElementById('f-story_name').value = step.story_name || '';
        document.getElementById('f-description').value = step.description || '';
        document.getElementById('f-category').value = step.category || '';
        document.getElementById('f-topic').value = step.topic || '';
        document.getElementById('f-lat').value = step.lat || '';
        document.getElementById('f-lng').value = step.lng || '';
        document.getElementById('f-image_url').value = step.image_url || '';
        document.getElementById('f-more_info_url').value = step.more_info_url || '';
        document.getElementById('f-audio_url').value = step.audio_url || '';
        
        updateImgPreview(step.image_url);
        updateMarkers();
        
        // Fly to
        if (step.lat && step.lng) {
            map.flyTo([step.lat, step.lng], 13);
        }
    }
    
    function deleteStep(e, idx) {
        e.stopPropagation();
        if (confirm('Haluatko varmasti poistaa tämän askeleen?')) {
            steps.splice(idx, 1);
            if (selectedIndex === idx) selectedIndex = -1;
            else if (selectedIndex > idx) selectedIndex--;
            
            if (selectedIndex === -1) {
                formOverlay.style.display = 'none';
                emptyState.style.display = 'flex';
            }
            renderList();
            updateMarkers();
        }
    }

    // 5. EVENT LISTENERS
    document.getElementById('add-step-btn').onclick = () => {
        const center = map.getCenter();
        const newStep = {
            title: 'Uusi kohde',
            category: 'Historia',
            lat: center.lat.toFixed(6).toString(),
            lng: center.lng.toFixed(6).toString(),
            description: '',
            image_url: ''
        };
        steps.push(newStep);
        selectStep(steps.length - 1);
    };

    document.getElementById('close-form').onclick = () => {
        selectedIndex = -1;
        formOverlay.style.display = 'none';
        emptyState.style.display = 'flex';
        renderList();
        updateMarkers();
    };

    // Auto-update steps on form input
    ['title', 'story_name', 'description', 'category', 'topic', 'lat', 'lng', 'image_url', 'more_info_url', 'audio_url'].forEach(id => {
        document.getElementById('f-' + id).addEventListener('input', (e) => {
            if (selectedIndex === -1) return;
            steps[selectedIndex][id] = e.target.value;
            if (id === 'title' || id === 'category' || id === 'story_name') renderList();
            if (id === 'lat' || id === 'lng') updateMarkers();
            if (id === 'image_url') updateImgPreview(e.target.value);
        });
    });

    function updateImgPreview(url) {
        const preview = document.getElementById('f-img-preview');
        if (url && url.length > 5) {
            preview.innerHTML = `<img src="${url}" alt="Preview" onerror="this.parentElement.innerHTML='Virheellinen kuva'">`;
        } else {
            preview.innerHTML = '<span>Ei kuvaa</span>';
        }
    }

    // 6. GEO SEARCH
    document.getElementById('geo-search').addEventListener('keypress', async (e) => {
        if (e.key === 'Enter') {
            const query = e.target.value;
            const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`);
            const data = await res.json();
            if (data.length > 0) {
                const { lat, lon } = data[0];
                map.flyTo([lat, lon], 14);
                if (selectedIndex !== -1) {
                    updateStepCoords(parseFloat(lat), parseFloat(lon));
                }
            } else {
                alert('Osoitetta ei löytynyt.');
            }
        }
    });

    // 7. SAVE ALL
    document.getElementById('save-all-btn').onclick = () => {
        const token = document.getElementById('auth-token').value;
        if (!token) {
            alert('Syötä Admin-token tallentaaksesi.');
            return;
        }
        
        document.getElementById('save-token').value = token;
        document.getElementById('save-data').value = JSON.stringify(steps);
        document.getElementById('save-form').submit();
    };

    // 8. ON LOAD
    window.onload = () => {
        initMap();
        renderList();
        updateMarkers();
        
        <?php if ($message): ?>
            showToast("<?php echo $message; ?>");
        <?php endif; ?>
    };

    function showToast(msg) {
        const toast = document.getElementById('toast');
        toast.textContent = msg;
        toast.style.display = 'block';
        setTimeout(() => toast.style.display = 'none', 4000);
    }
</script>

</body>
</html>
