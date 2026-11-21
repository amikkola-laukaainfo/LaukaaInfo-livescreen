/**
 * Kuvalinkkien ja Google Kuvat -ratkaisija (Google Photos Resolver)
 * Muuntaa Google Kuvat -jakolinkit suoriksi korkearesoluutioisiksi kuva-osoitteiksi (lh3.googleusercontent.com)
 * sekä tukee Google Drive -linkkejä ja normaaleja verkko-osoitteita.
 */

export interface GooglePhotosResolveResult {
  success: boolean;
  directUrl?: string;
  error?: string;
  isGooglePhotos: boolean;
}

/**
 * Tunnistaa onko annettu linkki Google Kuvat -osoite
 */
export function isGooglePhotosUrl(url: string): boolean {
  if (!url) return false;
  const clean = url.trim().toLowerCase();
  return (
    clean.includes('photos.app.goo.gl') ||
    clean.includes('photos.google.com') ||
    clean.includes('lh3.googleusercontent.com')
  );
}

/**
 * Tunnistaa onko annettu linkki Google Drive -osoite
 */
export function isGoogleDriveUrl(url: string): boolean {
  if (!url) return false;
  return url.includes('drive.google.com');
}

/**
 * Normalisoi Google lh3-kuvan resoluutiopääte =w1600 parhaan laadun takaamiseksi
 */
export function normalizeLh3Url(url: string): string {
  if (!url.includes('lh3.googleusercontent.com')) return url;
  const base = url.replace(/=w\d+.*$/, '');
  return `${base}=w1600`;
}

/**
 * Muuntaa Google Drive -linkin suoraksi kuvaksi Mediazoo-välityspalvelimen kautta
 */
export function resolveGoogleDriveUrl(url: string): string | null {
  const match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return `https://www.mediazoo.fi/laukaainfo-web/get_image.php?id=${match[1]}`;
  }
  return null;
}

/**
 * Ratkaisee Google Photos / Google Drive / verkko-osoitteen suoraksi kuvalinkiksi
 */
export async function resolveGooglePhotosUrl(rawUrl: string): Promise<GooglePhotosResolveResult> {
  const url = rawUrl.trim();
  if (!url) {
    return { success: false, error: 'Kuvalinkki puuttuu', isGooglePhotos: false };
  }

  // 1. Google Drive
  if (isGoogleDriveUrl(url)) {
    const driveDirect = resolveGoogleDriveUrl(url);
    if (driveDirect) {
      return { success: true, directUrl: driveDirect, isGooglePhotos: false };
    }
  }

  const isGPhoto = isGooglePhotosUrl(url);
  if (!isGPhoto) {
    return { success: true, directUrl: url, isGooglePhotos: false };
  }

  // 2. Jos kyseessä on jo suora lh3-osoite
  if (url.includes('lh3.googleusercontent.com')) {
    return { success: true, directUrl: normalizeLh3Url(url), isGooglePhotos: true };
  }

  // 3. Ulkoiset ratkaisija-aput Google Kuvat -jakolinkeille
  const endpoints = [
    `https://mediazoo.fi/laukaainfo-web/wonderin/resolve-gphoto.php?url=${encodeURIComponent(url)}`,
    `https://laukaainfo.fi/resolve-gphoto.php?url=${encodeURIComponent(url)}`
  ];

  for (const ep of endpoints) {
    try {
      const res = await fetch(ep, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(6000)
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.success && data.directUrl) {
          return {
            success: true,
            directUrl: normalizeLh3Url(data.directUrl),
            isGooglePhotos: true
          };
        }
      }
    } catch {
      // kokeile seuraavaa endpointia
    }
  }

  return {
    success: false,
    isGooglePhotos: true,
    error: 'Google Kuvat -jakolinkin automaattinen muunto epäonnistui. Vinkki: Avaa kuva Google Kuvissa selaimella, paina hiiren oikealla "Kopioi kuvan osoite" ja liitä suora lh3-osoite.'
  };
}
