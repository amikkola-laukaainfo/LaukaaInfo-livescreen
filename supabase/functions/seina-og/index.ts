// LaukaaInfo Supabase Edge Function: seina-og
// ============================================
// Tuottaa Open Graph -metatiedot Seinä-julkaisuille palvelinpuolella,
// jotta Facebookin/WhatsAppin/Twitterin botit saavat oikean jakokuvan
// ja -tekstin ilman JavaScript-suoritusta.
//
// Deploy:  supabase functions deploy seina-og
// URL:     https://duxluwyqxvbmkkjzuzkz.supabase.co/functions/v1/seina-og?post=<id>
//
// Toiminta:
//   1. Hakee julkaisun Supabasesta (posts + post_media)
//   2. Valitsee paras jakokuva (post_media → image_url → oletuskuva)
//   3. Lisää Supabase Storage -kuvaan transformaatioparametrit (1200x630)
//   4. Palauttaa minimaalisen HTML:n, jossa oikeat <meta>-tagit
//   5. JavaScript redirect → seina.html?post=<id> (normaalikäyttäjälle)
//
// Jakolinkki Seinässä - vaihda shareContent URL muotoon:
//   https://duxluwyqxvbmkkjzuzkz.supabase.co/functions/v1/seina-og?post=<id>

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── Vakiot ────────────────────────────────────────────────────────────────────

const SITE_BASE = 'https://laukaainfo.fi';
const DEFAULT_OG_IMAGE = `${SITE_BASE}/og-yrityskortti.png`;
const DEFAULT_OG_TITLE = 'LaukaaInfo — Seinä';
const DEFAULT_OG_DESC =
  'LaukaaInfon yhteisöseinä — alueen organisaatioiden, yritysten ja yhdistysten ajankohtaiset julkaisut yhdessä paikassa.';

const HTML_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'public, max-age=60, s-maxage=300',
  'Access-Control-Allow-Origin': '*',
};

// ── Apufunktiot ───────────────────────────────────────────────────────────────

/** Rajoittaa merkkijonon pituuden ja lisää ellipsis loppuun tarvittaessa */
function truncate(text: string, maxLen: number): string {
  if (!text) return '';
  const clean = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim();
  return clean.length > maxLen ? clean.substring(0, maxLen) + '\u2026' : clean;
}

/** Escape HTML-erikoismerkit metatiedoista */
function esc(text: string): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Lisää Supabase Storage -kuvaan Facebook-jako-optimoinnit (1200x630, WebP) */
function optimizeImageUrl(url: string): string {
  if (!url) return url;
  // Supabase Storage: käytä Image Transformations API:a
  if (url.includes('supabase.co/storage/v1/object/public/')) {
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}width=1200&height=630&resize=cover&format=webp`;
  }
  // ImageKit: lisää transformaatio-URL-parametrit
  if (url.includes('ik.imagekit.io') && !url.includes('tr=')) {
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}tr=w-1200,h-630,c-at_max,f-webp`;
  }
  return url;
}

/** Valitsee parhaan jakokuvan prioriteettijärjestyksessä */
function selectOgImage(
  postMedia: Array<{ media_type: string; url: string }> | null,
  imageUrl: string | null
): string {
  // 1. Ensimmäinen kuva post_media-listalta (ei video)
  if (postMedia && postMedia.length > 0) {
    const firstImg = postMedia.find(
      (m) =>
        m.media_type === 'image' ||
        (m.url &&
          !m.url.includes('youtube.com') &&
          !m.url.includes('youtu.be') &&
          !m.url.includes('vimeo.com') &&
          !m.url.endsWith('.mp4') &&
          !m.url.endsWith('.webm'))
    );
    if (firstImg?.url) return optimizeImageUrl(firstImg.url);
  }
  // 2. image_url -kenttä suoraan (jos kuva, ei video)
  if (imageUrl && !imageUrl.includes('youtube.com') && !imageUrl.includes('youtu.be')) {
    return optimizeImageUrl(imageUrl);
  }
  // 3. Seinän oletuskuva
  return DEFAULT_OG_IMAGE;
}

/** Rakentaa täydellisen OG HTML -vastauksen */
function buildOgHtml(params: {
  postId: string;
  title: string;
  description: string;
  imageUrl: string;
  pageUrl: string;
  postType: string;
}): string {
  const { postId, title, description, imageUrl, pageUrl, postType } = params;
  const ogType = postType === 'event' ? 'event' : 'article';
  const redirectUrl = postId
    ? `${SITE_BASE}/seina.html?post=${encodeURIComponent(postId)}`
    : `${SITE_BASE}/seina.html`;

  return `<!DOCTYPE html>
<html lang="fi" prefix="og: https://ogp.me/ns#">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)}</title>

  <!-- ── Open Graph ─────────────────────────────────────── -->
  <meta property="og:site_name" content="LaukaaInfo" />
  <meta property="og:type" content="${esc(ogType)}" />
  <meta property="og:locale" content="fi_FI" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:url" content="${esc(pageUrl)}" />
  <meta property="og:image" content="${esc(imageUrl)}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="${esc(title)}" />

  <!-- ── Twitter / X Card ──────────────────────────────── -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(title)}" />
  <meta name="twitter:description" content="${esc(description)}" />
  <meta name="twitter:image" content="${esc(imageUrl)}" />

  <!-- ── SEO ───────────────────────────────────────────── -->
  <meta name="description" content="${esc(description)}" />
  <link rel="canonical" href="${esc(pageUrl)}" />

  <!-- Ohjaa normaalikäyttäjä välittömästi seina.html:ään -->
  <meta http-equiv="refresh" content="0;url=${esc(redirectUrl)}" />
  <script>window.location.replace(${JSON.stringify(redirectUrl)});</script>
</head>
<body style="font-family:sans-serif;padding:2rem;color:#4a5568;background:#f8fafc;">
  <p>Avataan julkaisua: <strong>${esc(title)}</strong></p>
  <a href="${esc(redirectUrl)}" style="color:#7c3aed;font-weight:bold;">
    Siirry julkaisuun →
  </a>
</body>
</html>`;
}

// ── Pääkäsittelijä ────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: HTML_HEADERS });
  }

  const url = new URL(req.url);
  const postId = url.searchParams.get('post') || url.searchParams.get('id');

  // Ei post-parametria → ohjaa Seinän etusivulle
  if (!postId) {
    const html = buildOgHtml({
      postId: '',
      title: DEFAULT_OG_TITLE,
      description: DEFAULT_OG_DESC,
      imageUrl: DEFAULT_OG_IMAGE,
      pageUrl: `${SITE_BASE}/seina.html`,
      postType: 'article',
    });
    return new Response(html, { headers: HTML_HEADERS });
  }

  // Supabase-client palvelinpuolen avaimella (ohittaa RLS)
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    // 1. Hae julkaisun perustiedot
    const { data: rawPost, error: postErr } = await supabase
      .from('posts')
      .select('id, title, content, description, type, image_url, organization_id, org_name, publisher_name')
      .eq('id', postId)
      .maybeSingle();

    if (postErr || !rawPost) {
      // Julkaisua ei löydy → fallback-HTML (ohjaa silti Seinälle)
      const html = buildOgHtml({
        postId,
        title: DEFAULT_OG_TITLE,
        description: DEFAULT_OG_DESC,
        imageUrl: DEFAULT_OG_IMAGE,
        pageUrl: `${SITE_BASE}/seina.html?post=${encodeURIComponent(postId)}`,
        postType: 'article',
      });
      return new Response(html, { status: 200, headers: HTML_HEADERS });
    }

    // 2. Hae post_media (max 5, järjestyksessä)
    const { data: mediaRows } = await supabase
      .from('post_media')
      .select('media_type, url')
      .eq('post_id', postId)
      .order('display_order', { ascending: true })
      .limit(5);

    // 3. Selvitä organisaation nimi
    let orgName = rawPost.publisher_name || rawPost.org_name || '';
    if (!orgName) {
      const rawOrgId = rawPost.organization_id;
      if (rawOrgId) {
        const { data: orgData } = await supabase
          .from('organizations')
          .select('name')
          .eq('id', rawOrgId)
          .maybeSingle();
        if (orgData?.name) {
          orgName = orgData.name;
        } else {
          const { data: compData } = await supabase
            .from('companies')
            .select('name, nimi')
            .eq('id', rawOrgId)
            .maybeSingle();
          orgName = compData?.name || compData?.nimi || 'LaukaaInfo';
        }
      }
    }
    if (!orgName) orgName = 'LaukaaInfo';

    // 4. Laske OG-kentät
    const rawContent = rawPost.content || rawPost.description || '';
    const ogTitle = `${rawPost.title || 'Julkaisu'} \u2014 ${orgName} \u00b7 LaukaaInfo`;
    const ogDesc =
      truncate(rawContent, 200) ||
      `${orgName} \u2014 Ajankohtainen julkaisu LaukaaInfo-sein\u00e4ll\u00e4.`;
    const ogImage = selectOgImage(
      mediaRows as Array<{ media_type: string; url: string }> | null,
      rawPost.image_url
    );
    const ogUrl = `${SITE_BASE}/seina.html?post=${encodeURIComponent(postId)}`;

    // 5. Palauta OG HTML
    const html = buildOgHtml({
      postId,
      title: ogTitle,
      description: ogDesc,
      imageUrl: ogImage,
      pageUrl: ogUrl,
      postType: rawPost.type || 'announcement',
    });

    return new Response(html, { headers: HTML_HEADERS });

  } catch (err: unknown) {
    console.error('seina-og error:', err);
    // Virhetilanteessa ohjataan silti seina.html:ään oletustiedoilla
    const html = buildOgHtml({
      postId,
      title: DEFAULT_OG_TITLE,
      description: DEFAULT_OG_DESC,
      imageUrl: DEFAULT_OG_IMAGE,
      pageUrl: `${SITE_BASE}/seina.html?post=${encodeURIComponent(postId)}`,
      postType: 'article',
    });
    return new Response(html, { status: 200, headers: HTML_HEADERS });
  }
});
