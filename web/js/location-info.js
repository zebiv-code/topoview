import {
  GRID_SIZE,
  currentLat, currentLon, currentZoom, currentName,
  sliderExtent, valExtent, locationInfoEl
} from './constants.js';

// ── Location info overlay ──────────────────────────────────
export function updateLocationInfo() {
  const mpp = 40075016 * Math.cos(currentLat * Math.PI / 180) / (256 * Math.pow(2, currentZoom));
  const extentKmNum = GRID_SIZE * mpp / 1000;
  const extentKm = extentKmNum.toFixed(1);
  // Sync the slider and label to actual extent
  const logVal = Math.log10(Math.max(1, extentKmNum));
  sliderExtent.value = Math.max(0, Math.min(3, logVal));
  valExtent.textContent = extentKmNum < 10 ? extentKmNum.toFixed(1) + ' km' : Math.round(extentKmNum) + ' km';
  const latDir = currentLat >= 0 ? 'N' : 'S';
  const lonDir = currentLon >= 0 ? 'E' : 'W';
  const latStr = Math.abs(currentLat).toFixed(4) + '\u00B0' + latDir;
  const lonStr = Math.abs(currentLon).toFixed(4) + '\u00B0' + lonDir;
  let html = '';
  if (currentName) html += `<div class="loc-name">${currentName}</div>`;
  html += `<div class="loc-detail">${latStr}, ${lonStr}</div>`;
  html += `<div class="loc-detail">${extentKm} \u00D7 ${extentKm} km</div>`;
  locationInfoEl.innerHTML = html;
}
