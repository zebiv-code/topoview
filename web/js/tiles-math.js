import { TILE_SIZE } from './constants.js';

// ── Tile math ──────────────────────────────────────────────
export function latLonToTile(lat, lon, zoom) {
  const n = 2 ** zoom;
  const x = Math.floor((lon + 180) / 360 * n);
  const latRad = lat * Math.PI / 180;
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
  return { x, y };
}

// Convert tile pixel coordinates to lat/lon (inverse of Mercator projection)
export function tilePixelToLatLon(tileX, tileY, pixelX, pixelY, zoom) {
  const n = 2 ** zoom;
  const lon = (tileX + pixelX / TILE_SIZE) / n * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * (tileY + pixelY / TILE_SIZE) / n)));
  const lat = latRad * 180 / Math.PI;
  return { lat, lon };
}

export function extentToZoom(extentKm, lat) {
  // At a given zoom, extent ~ 3 * 256 * metersPerPixel / 1000 km
  // metersPerPixel = 40075016 * cos(lat) / (256 * 2^zoom)
  // extent = 3 * 40075016 * cos(lat) / (2^zoom * 1000)
  const cosLat = Math.cos(lat * Math.PI / 180);
  const z = Math.log2(3 * 40075016 * cosLat / (extentKm * 1000));
  return Math.round(Math.max(4, Math.min(14, z)));
}
