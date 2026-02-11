import {
  GRID_SIZE,
  currentLat, currentLon, currentZoom, currentName,
  elevationData, gridOriginTileX, gridOriginTileY,
  chkContours, chkGradient, chkWater, chkCenter,
  centerMarker,
  sliderExag, sliderInterval, sliderExtent,
  valExag, valInterval, valExtent,
  btnElevUp, btnElevDown, btnShare,
  loadBtn, locationInput,
  loadingOverlay, loadingText, elevationInfo,
  setElevationData, setCurrentLat, setCurrentLon, setCurrentName, setCurrentZoom
} from './constants.js';
import { tilePixelToLatLon, extentToZoom } from './tiles-math.js';
import { fetchTerrainTiles } from './tiles.js';
import { buildTerrain, rebuildWithExaggeration, updateUniforms } from './terrain.js';
import { updateLocationInfo } from './location-info.js';

// ── Geocoding ──────────────────────────────────────────────
async function geocode(query) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'TopoView/1.0' }
  });
  const results = await resp.json();
  if (results.length === 0) throw new Error('Location not found');
  return { lat: parseFloat(results[0].lat), lon: parseFloat(results[0].lon), name: results[0].display_name };
}

// ── Load terrain for location ──────────────────────────────
export async function loadLocation(lat, lon, name) {
  loadingOverlay.classList.remove('hidden');
  loadingText.textContent = name ? `Loading ${name.split(',')[0]}...` : 'Loading terrain...';
  loadBtn.disabled = true;

  try {
    const data = await fetchTerrainTiles(lat, lon);
    setElevationData(data);
    setCurrentLat(lat);
    setCurrentLon(lon);
    setCurrentName(name || '');
    buildTerrain(data, parseFloat(sliderExag.value));
    updateLocationInfo();
  } catch (err) {
    console.error(err);
    elevationInfo.textContent = 'Error loading terrain data';
  } finally {
    loadingOverlay.classList.add('hidden');
    loadBtn.disabled = false;
  }
}

// ── Focus camera on elevation extremes ─────────────────────
function focusCameraOnElev(mode) {
  if (!elevationData) return;

  let bestVal = mode === 'max' ? -Infinity : Infinity;
  let bestIdx = 0;
  for (let i = 0; i < elevationData.length; i++) {
    if (mode === 'max' ? elevationData[i] > bestVal : elevationData[i] < bestVal) {
      bestVal = elevationData[i];
      bestIdx = i;
    }
  }

  // Compute lat/lon of peak and grid center using tile math, then take the delta
  const peakCol = bestIdx % GRID_SIZE;
  const peakRow = Math.floor(bestIdx / GRID_SIZE);
  const centerCol = GRID_SIZE / 2;
  const centerRow = GRID_SIZE / 2;

  const peak = tilePixelToLatLon(gridOriginTileX, gridOriginTileY, peakCol, peakRow, currentZoom);
  const gridCenter = tilePixelToLatLon(gridOriginTileX, gridOriginTileY, centerCol, centerRow, currentZoom);

  // Apply delta to the actual currentLat/currentLon (avoids tile-snap error)
  const newLat = currentLat + (peak.lat - gridCenter.lat);
  const newLon = currentLon + (peak.lon - gridCenter.lon);

  loadLocation(newLat, newLon, currentName);
}

// Detect lat,lon patterns like "44.27, -72.74" or "44.27 -72.74"
function parseLatLon(str) {
  const m = str.match(/^\s*(-?\d+\.?\d*)\s*[,\s]\s*(-?\d+\.?\d*)\s*$/);
  if (!m) return null;
  const lat = parseFloat(m[1]), lon = parseFloat(m[2]);
  if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) return { lat, lon };
  return null;
}

// ── UI event wiring ────────────────────────────────────────
export function wireUI() {
  chkContours.addEventListener('change', updateUniforms);
  chkGradient.addEventListener('change', updateUniforms);
  chkWater.addEventListener('change', updateUniforms);
  chkCenter.addEventListener('change', () => {
    if (centerMarker) centerMarker.visible = chkCenter.checked;
  });

  btnElevUp.addEventListener('click', () => focusCameraOnElev('max'));
  btnElevDown.addEventListener('click', () => focusCameraOnElev('min'));

  btnShare.addEventListener('click', () => {
    const mpp = 40075016 * Math.cos(currentLat * Math.PI / 180) / (256 * Math.pow(2, currentZoom));
    const extentKm = GRID_SIZE * mpp / 1000;
    const params = new URLSearchParams();
    params.set('lat', currentLat.toFixed(4));
    params.set('lon', currentLon.toFixed(4));
    params.set('extent', extentKm.toFixed(1));
    if (currentName) params.set('label', currentName);
    if (parseFloat(sliderExag.value) !== 2) params.set('exag', sliderExag.value);
    if (parseFloat(sliderInterval.value) !== 50) params.set('interval', sliderInterval.value);
    if (!chkContours.checked) params.set('contours', '0');
    if (!chkGradient.checked) params.set('gradient', '0');
    if (!chkWater.checked) params.set('water', '0');
    if (!chkCenter.checked) params.set('center', '0');

    // Build parent wrapper URL: strip /app/ from current path
    const wrapperPath = window.location.pathname.replace(/app\/?$/, '');
    const finalUrl = window.location.origin + wrapperPath + '?' + params.toString();

    navigator.clipboard.writeText(finalUrl).then(() => {
      btnShare.classList.add('copied');
      btnShare.textContent = '\u2713';
      setTimeout(() => {
        btnShare.classList.remove('copied');
        btnShare.textContent = '\u{1F517}';
      }, 1500);
    });
  });

  sliderExtent.addEventListener('input', () => {
    const exp = parseFloat(sliderExtent.value);
    const km = Math.pow(10, exp);
    valExtent.textContent = km < 10 ? km.toFixed(1) + ' km' : km.toFixed(0) + ' km';
  });
  sliderExtent.addEventListener('change', async () => {
    const exp = parseFloat(sliderExtent.value);
    const km = Math.pow(10, exp);
    setCurrentZoom(extentToZoom(km, currentLat));
    await loadLocation(currentLat, currentLon, currentName);
  });

  sliderExag.addEventListener('input', () => {
    const v = parseFloat(sliderExag.value);
    valExag.textContent = v.toFixed(1) + '\u00D7';
    rebuildWithExaggeration(v);
  });

  sliderInterval.addEventListener('input', () => {
    const v = parseInt(sliderInterval.value);
    valInterval.textContent = v + ' m';
    updateUniforms();
  });

  loadBtn.addEventListener('click', async () => {
    const query = locationInput.value.trim();
    if (!query) return;
    try {
      const coords = parseLatLon(query);
      if (coords) {
        await loadLocation(coords.lat, coords.lon, `${coords.lat.toFixed(4)}, ${coords.lon.toFixed(4)}`);
      } else {
        const { lat, lon, name } = await geocode(query);
        await loadLocation(lat, lon, name);
      }
    } catch (err) {
      alert('Could not find location: ' + err.message);
    }
  });

  locationInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loadBtn.click();
  });

  document.getElementById('geolocate-btn').addEventListener('click', () => {
    if (!navigator.geolocation) { alert('Geolocation not supported'); return; }
    navigator.geolocation.getCurrentPosition(
      pos => loadLocation(pos.coords.latitude, pos.coords.longitude, 'Current Location'),
      err => alert('Could not get location: ' + err.message)
    );
  });
}
