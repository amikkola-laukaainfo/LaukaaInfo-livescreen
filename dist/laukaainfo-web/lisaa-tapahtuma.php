<?php
// lisaa-tapahtuma.php – LaukaaInfo Tapahtumailmoitus

$success = false;
$error = '';
$sentJson = '';

function generateId() {
    return 'kohde_' . substr(str_shuffle('abcdefghijklmnopqrstuvwxyz0123456789'), 0, 7);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $name         = trim($_POST['name'] ?? '');
    $shortDesc    = trim($_POST['shortDescription'] ?? '');
    $desc         = trim($_POST['description'] ?? '');
    $imageUrl     = trim($_POST['imageUrl'] ?? '');
    $address      = trim($_POST['address'] ?? '');
    $postalCode   = trim($_POST['postalCode'] ?? '');
    $municipality = trim($_POST['municipality'] ?? 'Laukaa');
    $venue        = trim($_POST['venue'] ?? '');
    $organizer    = trim($_POST['organizer'] ?? '');
    $email        = trim($_POST['email'] ?? '');
    $phone        = trim($_POST['phone'] ?? '');
    $website      = trim($_POST['website'] ?? '');
    $ticketUrl    = trim($_POST['ticketUrl'] ?? '');
    $startDate    = trim($_POST['startDate'] ?? '');
    $startTime    = trim($_POST['startTime'] ?? '00:00');
    $endDate      = trim($_POST['endDate'] ?? '');
    $endTime      = trim($_POST['endTime'] ?? '23:59');
    $taxonomy     = $_POST['taxonomy'] ?? [];
    $tags         = array_filter(array_map('trim', explode(',', $_POST['tags'] ?? '')));
    $profiles     = $_POST['profiles'] ?? [];
    $senderName   = trim($_POST['senderName'] ?? '');
    $senderEmail  = trim($_POST['senderEmail'] ?? '');

    if (!$name || !$shortDesc || !$desc || !$startDate || !$endDate || !$organizer || !$venue || !$senderName || !$senderEmail) {
        $error = 'Täytä kaikki pakolliset kentät.';
    } else {
        $kohde = [[
            'id'               => generateId(),
            'type'             => 'event',
            'name'             => $name,
            'shortDescription' => $shortDesc,
            'description'      => $desc,
            'status'           => 'active',
            'images'           => $imageUrl ? [$imageUrl] : [],
            'location'         => [
                'address'      => $address,
                'postalCode'   => $postalCode,
                'municipality' => $municipality,
                'latitude'     => '',
                'longitude'    => '',
                'mapUrl'       => ''
            ],
            'contact'          => [
                'email'   => $email,
                'phone'   => $phone,
                'website' => $website
            ],
            'taxonomy'         => array_values($taxonomy),
            'tags'             => array_values($tags),
            'profiles'         => array_values($profiles),
            'event'            => [
                'startDate'  => $startDate . 'T' . $startTime . ':00',
                'endDate'    => $endDate . 'T' . $endTime . ':00',
                'organizer'  => $organizer,
                'venue'      => $venue,
                'ticketUrl'  => $ticketUrl
            ]
        ]];

        $sentJson = json_encode($kohde, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);

        $to      = 'info@mediazoo.fi';
        $subject = '=?UTF-8?B?' . base64_encode('LaukaaInfo – Uusi tapahtumailmoitus: ' . $name) . '?=';
        $body    = "Uusi tapahtumailmoitus lomakkeelta.\nLähettäjä: $senderName <$senderEmail>\n\n--- JSON ---\n\n$sentJson";
        $headers = "From: noreply@mediazoo.fi\r\nReply-To: $senderEmail\r\nContent-Type: text/plain; charset=UTF-8";

        if (mail($to, $subject, $body, $headers)) {
            $success = true;
            if ($senderEmail) {
                $ackSubject = '=?UTF-8?B?' . base64_encode('Tapahtumailmoituksesi on vastaanotettu – LaukaaInfo') . '?=';
                $ackBody    = "Hei $senderName,\n\nTapahtumailmoituksesi \"$name\" on vastaanotettu onnistuneesti.\n\nKäymme sen läpi ja lisäämme sen LaukaaInfo-palveluun pian.\n\nYstävällisin terveisin,\nLaukaaInfo-tiimi";
                mail($senderEmail, $ackSubject, $ackBody, "From: noreply@mediazoo.fi\r\nContent-Type: text/plain; charset=UTF-8");
            }
        } else {
            $error = 'Sähköpostin lähetys epäonnistui. Yritä uudelleen myöhemmin.';
        }
    }
}
?>
<!DOCTYPE html>
<html lang="fi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Lisää tapahtuma – LaukaaInfo</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --primary:#1a56db;
  --primary-dark:#1342a8;
  --accent:#f5a623;
  --bg:#f0f4ff;
  --surface:#fff;
  --text:#1e293b;
  --muted:#64748b;
  --border:#e2e8f0;
  --success:#10b981;
  --error:#ef4444;
  --radius:12px;
}
body{font-family:'Inter',system-ui,sans-serif;background:var(--bg);color:var(--text);min-height:100vh;padding:24px 16px;}
.page-header{text-align:center;margin-bottom:32px;}
.page-header .logo{font-size:1.1rem;font-weight:700;color:var(--primary);letter-spacing:0.05em;margin-bottom:8px;}
.page-header h1{font-size:1.8rem;font-weight:700;color:var(--text);margin-bottom:6px;}
.page-header p{color:var(--muted);font-size:0.95rem;}
.container{max-width:660px;margin:0 auto;}
.card{background:var(--surface);border-radius:var(--radius);box-shadow:0 4px 24px rgba(26,86,219,0.08);padding:28px;margin-bottom:20px;}
.card h2{font-size:1rem;font-weight:700;color:var(--primary);margin-bottom:20px;display:flex;align-items:center;gap:8px;border-bottom:2px solid var(--bg);padding-bottom:10px;}
.form-row{display:grid;grid-template-columns:1fr 1fr;gap:16px;}
@media(max-width:520px){.form-row{grid-template-columns:1fr;}}
.form-group{margin-bottom:18px;}
.form-group:last-child{margin-bottom:0;}
label{display:block;font-size:0.85rem;font-weight:600;color:var(--text);margin-bottom:6px;}
label .req{color:var(--error);}
input[type=text],input[type=email],input[type=tel],input[type=url],input[type=date],input[type=time],textarea,select{
  width:100%;padding:11px 14px;border:1.5px solid var(--border);border-radius:8px;
  font-size:0.95rem;font-family:inherit;color:var(--text);background:#fff;
  transition:border-color .2s,box-shadow .2s;
}
input:focus,textarea:focus,select:focus{outline:none;border-color:var(--primary);box-shadow:0 0 0 3px rgba(26,86,219,0.1);}
textarea{resize:vertical;min-height:90px;}
.pills{display:flex;flex-wrap:wrap;gap:8px;margin-top:4px;}
.pill{padding:6px 14px;border-radius:20px;font-size:0.82rem;font-weight:500;border:1.5px solid var(--border);cursor:pointer;transition:.2s;user-select:none;color:var(--muted);}
.pill:hover{border-color:var(--primary);color:var(--primary);}
.pill.active{background:var(--primary);border-color:var(--primary);color:#fff;}
.pill.profile.active{background:var(--accent);border-color:var(--accent);color:#000;}
.tags-input-row{display:flex;gap:8px;margin-top:8px;}
.tags-input-row input{flex:1;}
.tags-input-row button{padding:0 14px;border-radius:8px;border:1.5px solid var(--border);background:#fff;cursor:pointer;font-size:1.2rem;font-weight:700;color:var(--primary);transition:.2s;}
.tags-input-row button:hover{background:var(--primary);color:#fff;}
.btn-submit{width:100%;padding:15px;background:var(--primary);color:#fff;border:none;border-radius:10px;font-size:1.05rem;font-weight:700;cursor:pointer;transition:background .2s,transform .1s;margin-top:8px;}
.btn-submit:hover{background:var(--primary-dark);}
.btn-submit:active{transform:scale(0.99);}
.alert{padding:14px 16px;border-radius:8px;font-size:0.92rem;margin-bottom:20px;}
.alert.error{background:#fee2e2;color:#b91c1c;border:1px solid #fca5a5;}
.alert.success-msg{background:#d1fae5;color:#065f46;border:1px solid #6ee7b7;}
.success-box{text-align:center;padding:40px 20px;}
.success-box .icon{font-size:3rem;margin-bottom:16px;}
.success-box h2{font-size:1.5rem;font-weight:700;color:var(--success);margin-bottom:10px;}
.success-box p{color:var(--muted);margin-bottom:20px;}
.json-preview{background:#0f172a;color:#7dd3fc;padding:16px;border-radius:8px;font-size:0.78rem;font-family:monospace;text-align:left;overflow-x:auto;white-space:pre;margin-top:20px;max-height:300px;overflow-y:auto;}
.btn-back{padding:12px 28px;background:var(--primary);color:#fff;border:none;border-radius:8px;font-size:1rem;font-weight:600;cursor:pointer;margin-top:16px;}
.hint{font-size:0.78rem;color:var(--muted);margin-top:4px;}
</style>
</head>
<body>

<div class="container">
  <div class="page-header">
    <div class="logo">📍 LaukaaInfo</div>
    <h1>Lisää tapahtuma</h1>
    <p>Täytä lomake ja lähetämme tapahtumasi LaukaaInfo-palveluun</p>
  </div>

<?php if ($success): ?>
  <div class="card">
    <div class="success-box">
      <div class="icon">🎉</div>
      <h2>Tapahtuma lähetetty!</h2>
      <p>Kiitos! Tapahtumailmoituksesi on vastaanotettu ja käymme sen läpi pian.<br>Saat kuittauksen sähköpostiisi.</p>
      <div class="json-preview"><?= htmlspecialchars($sentJson) ?></div>
      <button class="btn-back" onclick="window.location.reload()">Lisää uusi tapahtuma</button>
    </div>
  </div>
<?php else: ?>

<?php if ($error): ?>
  <div class="alert error">⚠️ <?= htmlspecialchars($error) ?></div>
<?php endif; ?>

<form method="POST" action="">

  <div class="card">
    <h2>📝 Perustiedot</h2>
    <div class="form-group">
      <label>Tapahtuman nimi <span class="req">*</span></label>
      <input type="text" name="name" value="<?= htmlspecialchars($_POST['name'] ?? '') ?>" placeholder="Esim. Laukaan Kesämarkkinat" required>
    </div>
    <div class="form-group">
      <label>Lyhyt kuvaus <span class="req">*</span> <span class="hint">(1 lause)</span></label>
      <input type="text" name="shortDescription" value="<?= htmlspecialchars($_POST['shortDescription'] ?? '') ?>" placeholder="Esim. Vuosittaiset kesämarkkinat Laukaan torilla." required>
    </div>
    <div class="form-group">
      <label>Kuvaus <span class="req">*</span> <span class="hint">(2–4 lausetta)</span></label>
      <textarea name="description" rows="4" placeholder="Tarkempi kuvaus tapahtumasta..." required><?= htmlspecialchars($_POST['description'] ?? '') ?></textarea>
    </div>
    <div class="form-group">
      <label>Kuvan URL</label>
      <input type="url" name="imageUrl" value="<?= htmlspecialchars($_POST['imageUrl'] ?? '') ?>" placeholder="https://...">
      <div class="hint">Linkki tapahtumakuvaan (jpg/png). Jätä tyhjäksi jos ei ole.</div>
    </div>
  </div>

  <div class="card">
    <h2>📅 Aika</h2>
    <div class="form-row">
      <div class="form-group">
        <label>Alkamispäivä <span class="req">*</span></label>
        <input type="date" name="startDate" value="<?= htmlspecialchars($_POST['startDate'] ?? '') ?>" required>
      </div>
      <div class="form-group">
        <label>Alkamisaika <span class="req">*</span></label>
        <input type="time" name="startTime" value="<?= htmlspecialchars($_POST['startTime'] ?? '10:00') ?>" required>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Päättymispäivä <span class="req">*</span></label>
        <input type="date" name="endDate" value="<?= htmlspecialchars($_POST['endDate'] ?? '') ?>" required>
      </div>
      <div class="form-group">
        <label>Päättymisaika <span class="req">*</span></label>
        <input type="time" name="endTime" value="<?= htmlspecialchars($_POST['endTime'] ?? '18:00') ?>" required>
      </div>
    </div>
  </div>

  <div class="card">
    <h2>📍 Paikka</h2>
    <div class="form-group">
      <label>Tapahtumapaikka <span class="req">*</span></label>
      <input type="text" name="venue" value="<?= htmlspecialchars($_POST['venue'] ?? '') ?>" placeholder="Esim. Laukaan tori" required>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Osoite</label>
        <input type="text" name="address" value="<?= htmlspecialchars($_POST['address'] ?? '') ?>" placeholder="Kauppakatu 1">
      </div>
      <div class="form-group">
        <label>Postinumero</label>
        <input type="text" name="postalCode" value="<?= htmlspecialchars($_POST['postalCode'] ?? '') ?>" placeholder="41340">
      </div>
    </div>
    <div class="form-group">
      <label>Kunta</label>
      <input type="text" name="municipality" value="<?= htmlspecialchars($_POST['municipality'] ?? 'Laukaa') ?>">
    </div>
  </div>

  <div class="card">
    <h2>🏢 Järjestäjä &amp; yhteystiedot</h2>
    <div class="form-group">
      <label>Järjestäjä <span class="req">*</span></label>
      <input type="text" name="organizer" value="<?= htmlspecialchars($_POST['organizer'] ?? '') ?>" placeholder="Yhdistys tai organisaatio" required>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Sähköposti (julkinen)</label>
        <input type="email" name="email" value="<?= htmlspecialchars($_POST['email'] ?? '') ?>" placeholder="info@esimerkki.fi">
      </div>
      <div class="form-group">
        <label>Puhelin</label>
        <input type="tel" name="phone" value="<?= htmlspecialchars($_POST['phone'] ?? '') ?>" placeholder="040 1234567">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Verkkosivut</label>
        <input type="url" name="website" value="<?= htmlspecialchars($_POST['website'] ?? '') ?>" placeholder="https://...">
      </div>
      <div class="form-group">
        <label>Lipunmyynti-URL</label>
        <input type="url" name="ticketUrl" value="<?= htmlspecialchars($_POST['ticketUrl'] ?? '') ?>" placeholder="https://lippu.fi/...">
      </div>
    </div>
  </div>

  <div class="card">
    <h2>🏷️ Kategoria &amp; tunnisteet</h2>
    <div class="form-group">
      <label>Kategoria <span class="req">*</span></label>
      <div class="pills" id="taxonomy-pills">
        <?php
        $taxonomyOptions = [
          'event.culture'   => 'Kulttuuri',
          'event.sports'    => 'Urheilu &amp; liikunta',
          'event.music'     => 'Musiikki &amp; konsertit',
          'event.family'    => 'Lapsiperheet',
          'event.nature'    => 'Luonto &amp; retkeily',
          'event.food'      => 'Ruoka &amp; juoma',
          'event.arts'      => 'Taide &amp; käsityöt',
          'event.community' => 'Yhteisö',
          'event.education' => 'Koulutus',
          'event.other'     => 'Muut',
        ];
        $selTaxonomy = $_POST['taxonomy'] ?? [];
        foreach ($taxonomyOptions as $val => $label):
          $active = in_array($val, $selTaxonomy) ? 'active' : '';
        ?>
        <span class="pill <?= $active ?>" data-group="taxonomy" data-value="<?= $val ?>"><?= $label ?></span>
        <?php endforeach; ?>
      </div>
      <input type="hidden" name="taxonomy[]" id="taxonomy-input" value="">
    </div>
    <div class="form-group">
      <label>Kohderyhmä</label>
      <div class="pills">
        <?php
        $profileOptions = [
          'family'  => 'Perheet',
          'youth'   => 'Nuoret',
          'seniors' => 'Seniorit',
          'sports'  => 'Urheilijat',
          'culture' => 'Kulttuuriharrastajat',
          'all'     => 'Kaikki',
        ];
        $selProfiles = $_POST['profiles'] ?? [];
        foreach ($profileOptions as $val => $label):
          $active = in_array($val, $selProfiles) ? 'active' : '';
        ?>
        <span class="pill profile <?= $active ?>" data-group="profiles" data-value="<?= $val ?>"><?= $label ?></span>
        <?php endforeach; ?>
      </div>
      <input type="hidden" name="profiles[]" id="profiles-input" value="">
    </div>
    <div class="form-group">
      <label>Avainsanat / Tagit</label>
      <div class="pills" id="tags-display"></div>
      <div class="tags-input-row">
        <input type="text" id="tag-input" placeholder="Lisää tägi ja paina +" maxlength="30">
        <button type="button" id="add-tag">+</button>
      </div>
      <input type="hidden" name="tags" id="tags-hidden" value="<?= htmlspecialchars($_POST['tags'] ?? '') ?>">
    </div>
  </div>

  <div class="card">
    <h2>✉️ Lähettäjän tiedot</h2>
    <div class="hint" style="margin-bottom:14px;">Nämä tiedot eivät näy julkisesti – tarvitsemme ne yhteydenottoa varten.</div>
    <div class="form-row">
      <div class="form-group">
        <label>Nimesi <span class="req">*</span></label>
        <input type="text" name="senderName" value="<?= htmlspecialchars($_POST['senderName'] ?? '') ?>" required placeholder="Etunimi Sukunimi">
      </div>
      <div class="form-group">
        <label>Sähköpostisi <span class="req">*</span></label>
        <input type="email" name="senderEmail" value="<?= htmlspecialchars($_POST['senderEmail'] ?? '') ?>" required placeholder="sinun@email.fi">
      </div>
    </div>
  </div>

  <button type="submit" class="btn-submit">🚀 Lähetä tapahtumailmoitus</button>
  <p style="text-align:center;color:var(--muted);font-size:0.8rem;margin-top:12px;">Käymme ilmoituksen läpi ja lisäämme sen LaukaaInfo-palveluun.</p>

</form>
<?php endif; ?>
</div>

<script>
// --- Taxonomy & Profiles pill selection ---
const groups = { taxonomy: [], profiles: [] };
const postTaxonomy = <?= json_encode(array_values($_POST['taxonomy'] ?? [])) ?>;
const postProfiles = <?= json_encode(array_values($_POST['profiles'] ?? [])) ?>;
groups.taxonomy = [...postTaxonomy];
groups.profiles = [...postProfiles];

document.querySelectorAll('.pill[data-group]').forEach(pill => {
  const g = pill.dataset.group;
  const v = pill.dataset.value;
  pill.addEventListener('click', () => {
    if (groups[g].includes(v)) {
      groups[g] = groups[g].filter(x => x !== v);
      pill.classList.remove('active');
    } else {
      groups[g].push(v);
      pill.classList.add('active');
    }
    syncHiddenInputs();
  });
});

function syncHiddenInputs() {
  document.getElementById('taxonomy-input').name = '';
  document.getElementById('profiles-input').name = '';
  // Remove old hidden inputs
  document.querySelectorAll('input.dyn-hidden').forEach(e => e.remove());
  const form = document.querySelector('form');
  groups.taxonomy.forEach(v => {
    const i = document.createElement('input');
    i.type = 'hidden'; i.name = 'taxonomy[]'; i.value = v; i.className = 'dyn-hidden';
    form.appendChild(i);
  });
  groups.profiles.forEach(v => {
    const i = document.createElement('input');
    i.type = 'hidden'; i.name = 'profiles[]'; i.value = v; i.className = 'dyn-hidden';
    form.appendChild(i);
  });
}
syncHiddenInputs();

// --- Tags ---
let tags = [];
const initialTags = '<?= addslashes($_POST['tags'] ?? '') ?>';
if (initialTags) tags = initialTags.split(',').map(t => t.trim()).filter(Boolean);

function renderTags() {
  const d = document.getElementById('tags-display');
  d.innerHTML = '';
  tags.forEach((t, i) => {
    const s = document.createElement('span');
    s.className = 'pill active';
    s.textContent = t + ' ×';
    s.onclick = () => { tags.splice(i, 1); renderTags(); };
    d.appendChild(s);
  });
  document.getElementById('tags-hidden').value = tags.join(',');
}
renderTags();

document.getElementById('add-tag').onclick = () => {
  const v = document.getElementById('tag-input').value.trim().toLowerCase();
  if (v && !tags.includes(v)) { tags.push(v); renderTags(); }
  document.getElementById('tag-input').value = '';
};
document.getElementById('tag-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); document.getElementById('add-tag').click(); }
});
</script>
</body>
</html>
