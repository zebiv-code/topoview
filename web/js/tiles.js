import {
  TILE_SIZE, GRID_SIZE, currentZoom,
  setGridOriginTileX, setGridOriginTileY
} from './constants.js';
import { latLonToTile } from './tiles-math.js';

// ── Fetch & decode tiles ───────────────────────────────────
function loadTileImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load tile: ${url}`));
    img.src = url;
  });
}

function decodeTerrariumPixels(imageData) {
  const { width, height, data } = imageData;
  const elevations = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    elevations[i] = (r * 256 + g + b / 256) - 32768;
  }
  return elevations;
}

export async function fetchTerrainTiles(lat, lon) {
  const center = latLonToTile(lat, lon, currentZoom);
  // Store the top-left tile of the 3x3 grid for coordinate conversion
  setGridOriginTileX(center.x - 1);
  setGridOriginTileY(center.y - 1);
  const offscreen = document.createElement('canvas');
  offscreen.width = GRID_SIZE;
  offscreen.height = GRID_SIZE;
  const ctx = offscreen.getContext('2d', { willReadFrequently: true });

  const promises = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const tx = center.x + dx;
      const ty = center.y + dy;
      const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${currentZoom}/${tx}/${ty}.png`;
      const px = (dx + 1) * TILE_SIZE;
      const py = (dy + 1) * TILE_SIZE;
      promises.push(
        loadTileImage(url).then(img => ({ img, px, py }))
      );
    }
  }

  const tiles = await Promise.all(promises);
  for (const { img, px, py } of tiles) {
    ctx.drawImage(img, px, py);
  }

  const imageData = ctx.getImageData(0, 0, GRID_SIZE, GRID_SIZE);
  return decodeTerrariumPixels(imageData);
}
