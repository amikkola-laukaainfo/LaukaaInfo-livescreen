/**
 * convert_muisto_to_geojson.js
 * Converts peurunka.muisto directly to a GeoJSON file compatible with tarinakartta.html
 */

const fs = require('fs');
const JSZip = require('d:/projekteja/tarinakartta-editor/node_modules/jszip');
const path = require('path');

const MUISTO_PATH = 'd:/projekteja/tarinakartta-editor/mallireitti/peurunka.muisto';
const OUTPUT_PATH = path.join(__dirname, '../reitix/peltoreitti-peurunka.geojson');

// ImageKit base URL for image references
const IK_BASE = 'https://ik.imagekit.io/vowzx8znjs/reitix/images/';

async function run() {
  const file = fs.readFileSync(MUISTO_PATH);
  const zip = await JSZip.loadAsync(file);
  const jsonStr = await zip.file('project.json').async('string');
  const raw = JSON.parse(jsonStr);

  // Find the route block (has metadata.isRoute === true)
  const routeBlock = raw.blocks.find(b => b.metadata && b.metadata.isRoute);
  if (!routeBlock) {
    console.error('No route block found!');
    return;
  }

  // Parse the route coordinates from routePointsJson
  let routeCoords = [];
  if (routeBlock.metadata.routePointsJson) {
    const points = JSON.parse(routeBlock.metadata.routePointsJson);
    // routePointsJson format: [{latitude, longitude}, ...]
    // GeoJSON needs [longitude, latitude]
    routeCoords = points.map(p => [p.longitude, p.latitude]);
  }
  console.log(`Route: ${routeBlock.title || 'Peltoreitti Peurunka'} with ${routeCoords.length} coords`);

  // Find all experience point blocks (type image/video/audio without isRoute)
  const pointBlocks = raw.blocks.filter(b => 
    !(b.metadata && b.metadata.isRoute) &&
    ['image', 'video', 'audio'].includes(b.type)
  );
  console.log(`Points: ${pointBlocks.length}`);

  // Check mediaLibrary for image URLs
  const mediaLib = raw.mediaLibrary || {};

  const features = [];

  // 1. LineString feature for the route
  features.push({
    type: 'Feature',
    properties: {
      title: routeBlock.title || 'Peltoreitti Peurunka',
      description: routeBlock.description || '',
      type: 'route'
    },
    geometry: {
      type: 'LineString',
      coordinates: routeCoords
    }
  });

  // 2. Point features for experience points
  for (const b of pointBlocks) {
    let lat = b.lat || (b.metadata && b.metadata.latitude);
    let lng = b.lng || (b.metadata && b.metadata.longitude);

    // In Finland, lat ~62, lng ~25. Swap if needed.
    if (typeof lat === 'number' && typeof lng === 'number' && lat < lng) {
      [lat, lng] = [lng, lat];
    }

    if (!lat || !lng) {
      console.warn(`Skipping point "${b.title}" - no coordinates`);
      continue;
    }

    // Resolve image URL - check for imagekit URL in mediaLibrary
    let imageUrl = b.imageUrl || null;
    if (!imageUrl && b.mediaId && mediaLib[b.mediaId]) {
      const mediaItem = mediaLib[b.mediaId];
      // Use cloud URL if available, fall back to constructing from fileName
      imageUrl = mediaItem.url || (mediaItem.fileName ? `${IK_BASE}${mediaItem.fileName}` : null);
    }

    features.push({
      type: 'Feature',
      properties: {
        title: b.title || 'Kohde',
        description: b.description || '',
        type: 'point',
        category: b.category || undefined,
        image: imageUrl || undefined,
        mediaType: imageUrl ? 'IMAGE' : undefined
      },
      geometry: {
        type: 'Point',
        coordinates: [lng, lat]  // GeoJSON: [longitude, latitude]
      }
    });
  }

  const geojson = {
    type: 'FeatureCollection',
    features
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(geojson, null, 2), 'utf8');
  console.log(`\nSaved to: ${OUTPUT_PATH}`);
  console.log(`Total features: ${features.length} (1 route + ${features.length - 1} points)`);
  
  // Show point titles
  const pointFeatures = features.filter(f => f.geometry.type === 'Point');
  pointFeatures.forEach((p, i) => {
    console.log(`  ${i+1}. ${p.properties.title} [${p.geometry.coordinates[1].toFixed(4)}, ${p.geometry.coordinates[0].toFixed(4)}]${p.properties.image ? ' 🖼️' : ''}`);
  });
}

run().catch(console.error);
