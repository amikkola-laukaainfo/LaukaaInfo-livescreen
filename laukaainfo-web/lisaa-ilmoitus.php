<?php
/**
 * Lisaa-ilmoitus.php
 * Simple submission form for Pikkuilmot.
 */
?>
<!DOCTYPE html>
<html lang="fi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Lisää Pikkuilmoitus - LaukaaInfo</title>
    <style>
        :root {
            --primary: #0056b3;
            --accent: #ffb100; /* Yellow highlight for Marketplace */
            --bg: #f8f9fa;
            --text: #333;
            --border: #ddd;
        }
        body {
            font-family: 'Inter', system-ui, -apple-system, sans-serif;
            background-color: var(--bg);
            color: var(--text);
            margin: 0;
            padding: 20px;
            display: flex;
            justify-content: center;
        }
        .container {
            max-width: 500px;
            width: 100%;
            background: #fff;
            padding: 24px;
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.08);
        }
        h1 {
            font-size: 1.5rem;
            margin-bottom: 1rem;
            color: var(--primary);
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .form-group {
            margin-bottom: 16px;
        }
        label {
            display: block;
            margin-bottom: 6px;
            font-weight: 600;
            font-size: 0.9rem;
        }
        input[type="text"], 
        input[type="password"],
        input[type="url"],
        textarea {
            width: 100%;
            padding: 12px;
            border: 1px solid var(--border);
            border-radius: 8px;
            font-size: 1rem;
            box-sizing: border-box;
            transition: border-color 0.2s;
        }
        input:focus {
            outline: none;
            border-color: var(--primary);
        }
        .btn {
            background-color: var(--primary);
            color: white;
            border: none;
            padding: 14px;
            width: 100%;
            border-radius: 8px;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            transition: background 0.2s;
        }
        .btn:hover {
            filter: brightness(1.1);
        }
        .tags-container {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-top: 8px;
        }
        .tag-pill {
            background: #eee;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 0.85rem;
            cursor: pointer;
            transition: 0.2s;
        }
        .tag-pill.active {
            background: var(--accent);
            color: #000;
        }
        .alert {
            padding: 12px;
            border-radius: 8px;
            margin-bottom: 16px;
            font-size: 0.9rem;
            display: none;
        }
        .alert.error {
            background: #ffe3e3;
            color: #d63031;
            display: block;
        }
        .alert.success {
            background: #d4edda;
            color: #155724;
            display: block;
        }
        .success-box {
            display: none;
            text-align: center;
            padding: 20px;
        }
        .success-box p {
            margin-bottom: 15px;
        }
        .share-link {
            background: #f1f1f1;
            padding: 10px;
            border-radius: 4px;
            word-break: break-all;
            font-family: monospace;
            display: block;
            margin-bottom: 15px;
        }
    </style>
</head>
<body>

<div class="container" id="form-container">
    <h1>📢 Lisää Pikkuilmoitus</h1>
    
    <div id="alert-box" class="alert"></div>

    <form id="ad-form">
        <div class="form-group">
            <label for="password">Salasana</label>
            <input type="password" id="password" required placeholder="Laukaa202x">
        </div>

        <div class="form-group">
            <label for="title">Otsikko / Aihe</label>
            <input type="text" id="title" required placeholder="Esim. Renkaanvaihto alk. 25€">
        </div>

        <div class="form-group">
            <label for="link">Facebook-linkki (tai muu)</label>
            <input type="url" id="link" required placeholder="https://facebook.com/groups/...">
        </div>

        <div class="form-group">
            <label>Tunnisteet (Tagit)</label>
            <div class="tags-container" id="tags-suggestions">
                <!-- Dynaamiset tagit ladataan tähän -->
            </div>
            <div style="margin-top: 10px; display: flex; gap: 8px;">
                <input type="text" id="new-tag" placeholder="Lisää uusi tägi...">
                <button type="button" id="add-tag-btn" style="padding: 0 12px; border-radius: 8px; border: 1px solid #ccc;">+</button>
            </div>
            <input type="hidden" id="selected-tags" name="tags" value="">
        </div>

        <button type="submit" class="btn">🚀 Julkaise nyt</button>
        <p style="font-size: 0.8rem; opacity: 0.6; text-align: center; margin-top: 15px;">Ilmoitus on esillä 7 päivää.</p>
    </form>
</div>

<div class="container success-box" id="success-container">
    <h2 style="color: #27ae60;">✅ Julkaistu!</h2>
    <p>Ilmoitus on nyt näkyvissä Pikkuilmoitukset-sivulla ja feedissä.</p>
    <label>Linkki ilmoitukseen:</label>
    <span class="share-link" id="result-link"></span>
    <button class="btn" onclick="window.location.reload()">Lisää uusi</button>
</div>

<script>
    const API_URL = 'pikkuilmot_api.php';
    const form = document.getElementById('ad-form');
    const alertBox = document.getElementById('alert-box');
    const tagsContainer = document.getElementById('tags-suggestions');
    const selectedTagsInput = document.getElementById('selected-tags');
    const newTagInput = document.getElementById('new-tag');
    let selectedTags = [];

    // Lataa olemassaolevat tagit
    fetch(API_URL)
        .then(r => r.json())
        .then(res => {
            if (res.data) {
                const allTags = new Set();
                res.data.forEach(item => {
                    if (item.tags) item.tags.forEach(t => allTags.add(t));
                });
                renderTags(Array.from(allTags));
            }
        });

    function renderTags(tags) {
        tagsContainer.innerHTML = '';
        tags.forEach(t => {
            const span = document.createElement('span');
            span.className = 'tag-pill';
            span.textContent = t;
            span.onclick = () => toggleTag(t, span);
            tagsContainer.appendChild(span);
        });
    }

    function toggleTag(tag, element) {
        if (selectedTags.includes(tag)) {
            selectedTags = selectedTags.filter(t => t !== tag);
            element.classList.remove('active');
        } else {
            selectedTags.push(tag);
            element.classList.add('active');
        }
        selectedTagsInput.value = JSON.stringify(selectedTags);
    }

    document.getElementById('add-tag-btn').onclick = () => {
        const val = newTagInput.value.trim().toLowerCase();
        if (val && !selectedTags.includes(val)) {
            const span = document.createElement('span');
            span.className = 'tag-pill active';
            span.textContent = val;
            span.onclick = () => toggleTag(val, span);
            tagsContainer.appendChild(span);
            selectedTags.push(val);
            selectedTagsInput.value = JSON.stringify(selectedTags);
            newTagInput.value = '';
        }
    };

    form.onsubmit = async (e) => {
        e.preventDefault();
        alertBox.className = 'alert';
        alertBox.style.display = 'none';

        const data = {
            password: document.getElementById('password').value,
            title: document.getElementById('title').value,
            link: document.getElementById('link').value,
            tags: selectedTags
        };

        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            const result = await response.json();
            if (response.ok) {
                document.getElementById('form-container').style.display = 'none';
                document.getElementById('success-container').style.display = 'block';
                document.getElementById('result-link').textContent = result.share_url;
            } else {
                alertBox.textContent = result.message || 'Virhe tallennuksessa';
                alertBox.classList.add('error');
            }
        } catch (err) {
            alertBox.textContent = 'Yhteysvirhe.';
            alertBox.classList.add('error');
        }
    };
</script>

</body>
</html>
