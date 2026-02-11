import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ── Constants ──────────────────────────────────────────────
const TILE_SIZE = 256;
const GRID_SIZE = TILE_SIZE * 3; // 768
let currentZoom = 14; // will be set from extent slider on load
const DEFAULT_LAT = 44.27;
const DEFAULT_LON = -72.74;

// ── State ──────────────────────────────────────────────────
let scene, camera, renderer, controls, terrainMesh, centerMarker;
let elevationData = null;
let elevationMin = 0, elevationMax = 1000, elevationCenter = 500;
let currentLat = DEFAULT_LAT, currentLon = DEFAULT_LON;

// ── DOM refs ───────────────────────────────────────────────
const canvas = document.getElementById('canvas');
const locationInput = document.getElementById('location-input');
const loadBtn = document.getElementById('load-btn');
const chkContours = document.getElementById('chk-contours');
const chkGradient = document.getElementById('chk-gradient');
const sliderExag = document.getElementById('slider-exag');
const sliderInterval = document.getElementById('slider-interval');
const valExag = document.getElementById('val-exag');
const valInterval = document.getElementById('val-interval');
const elevationInfo = document.getElementById('elevation-info');
const loadingOverlay = document.getElementById('loading-overlay');
const loadingText = document.getElementById('loading-text');
const locationInfoEl = document.getElementById('location-text');
const chkWater = document.getElementById('chk-water');
const chkCenter = document.getElementById('chk-center');
const sliderExtent = document.getElementById('slider-extent');
const valExtent = document.getElementById('val-extent');
const btnElevUp = document.getElementById('btn-elev-up');
const btnElevDown = document.getElementById('btn-elev-down');
const btnShare = document.getElementById('btn-share');
let currentName = '';
const compassCanvas = document.getElementById('compass');
const compassCtx = compassCanvas.getContext('2d');

// ── Tile math ──────────────────────────────────────────────
function latLonToTile(lat, lon, zoom) {
  const n = 2 ** zoom;
  const x = Math.floor((lon + 180) / 360 * n);
  const latRad = lat * Math.PI / 180;
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
  return { x, y };
}

// Convert tile pixel coordinates to lat/lon (inverse of Mercator projection)
function tilePixelToLatLon(tileX, tileY, pixelX, pixelY, zoom) {
  const n = 2 ** zoom;
  const lon = (tileX + pixelX / TILE_SIZE) / n * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * (tileY + pixelY / TILE_SIZE) / n)));
  const lat = latRad * 180 / Math.PI;
  return { lat, lon };
}

// Store the top-left tile coords for the current grid
let gridOriginTileX = 0, gridOriginTileY = 0;

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

function extentToZoom(extentKm, lat) {
  // At a given zoom, extent ≈ 3 * 256 * metersPerPixel / 1000 km
  // metersPerPixel = 40075016 * cos(lat) / (256 * 2^zoom)
  // extent = 3 * 40075016 * cos(lat) / (2^zoom * 1000)
  const cosLat = Math.cos(lat * Math.PI / 180);
  const z = Math.log2(3 * 40075016 * cosLat / (extentKm * 1000));
  return Math.round(Math.max(4, Math.min(14, z)));
}

async function fetchTerrainTiles(lat, lon) {
  const center = latLonToTile(lat, lon, currentZoom);
  // Store the top-left tile of the 3x3 grid for coordinate conversion
  gridOriginTileX = center.x - 1;
  gridOriginTileY = center.y - 1;
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

// ── Shaders ────────────────────────────────────────────────
const vertexShader = `
  varying float vElevation;
  varying vec3 vNormal;
  varying vec3 vPosition;

  void main() {
    vElevation = position.y;
    vNormal = normalize(normalMatrix * normal);
    vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  uniform float uContourInterval;
  uniform bool uShowContours;
  uniform bool uShowGradient;
  uniform float uElevMin;
  uniform float uElevMax;
  uniform vec3 uLightDir;
  uniform float uElevMid;
  uniform float uElevScaleExag; // elevScale * exaggeration
  uniform bool uShowWater;

  varying float vElevation;
  varying vec3 vNormal;
  varying vec3 vPosition;

  // Hypsometric color ramp
  vec3 elevationColor(float t) {
    // green → tan → brown → gray → white
    vec3 c0 = vec3(0.25, 0.49, 0.20);  // deep green
    vec3 c1 = vec3(0.48, 0.60, 0.25);  // light green
    vec3 c2 = vec3(0.76, 0.70, 0.42);  // tan
    vec3 c3 = vec3(0.62, 0.45, 0.28);  // brown
    vec3 c4 = vec3(0.55, 0.52, 0.50);  // gray
    vec3 c5 = vec3(0.92, 0.92, 0.94);  // white

    if (t < 0.2) return mix(c0, c1, t / 0.2);
    if (t < 0.4) return mix(c1, c2, (t - 0.2) / 0.2);
    if (t < 0.6) return mix(c2, c3, (t - 0.4) / 0.2);
    if (t < 0.8) return mix(c3, c4, (t - 0.6) / 0.2);
    return mix(c4, c5, (t - 0.8) / 0.2);
  }

  void main() {
    float elevRange = uElevMax - uElevMin;
    float t = clamp((vElevation - uElevMin) / max(elevRange, 1.0), 0.0, 1.0);

    // Reconstruct raw elevation in meters
    float rawElev = vElevation / uElevScaleExag + uElevMid;

    // Water detection (improved)
    // 1) Sea level: anything at or below 2m
    // 2) Flatness: inland water has very low elevation gradient relative to scale
    //    Use both screen-space and object-space derivatives for robustness
    float dElevScreen = fwidth(vElevation);
    float dElevX = dFdx(vElevation);
    float dElevZ = dFdy(vElevation);
    float gradMag = sqrt(dElevX * dElevX + dElevZ * dElevZ);
    // Threshold scales with the elevation scale so it works at all zoom levels
    float flatThreshold = uElevScaleExag * 0.05;
    bool isFlat = gradMag < flatThreshold && dElevScreen < flatThreshold;
    bool isWater = uShowWater && (rawElev <= 2.0 || (isFlat && rawElev < uElevMid * 0.95));

    // Base color
    vec3 baseColor;
    if (isWater) {
      // Water color — deeper = darker
      float depth = clamp(1.0 - rawElev / max(uElevMid, 1.0), 0.0, 1.0);
      baseColor = mix(vec3(0.28, 0.46, 0.60), vec3(0.14, 0.25, 0.42), depth);
    } else if (uShowGradient) {
      baseColor = elevationColor(t);
    } else {
      // Neutral terrain tone
      baseColor = mix(vec3(0.55, 0.58, 0.52), vec3(0.78, 0.76, 0.72), t);
    }

    // Lighting
    vec3 normal = normalize(vNormal);
    vec3 lightDir = normalize(uLightDir);
    float diffuse = max(dot(normal, lightDir), 0.0);
    float ambient = 0.35;
    float lighting = ambient + (1.0 - ambient) * diffuse;
    vec3 color = baseColor * lighting;

    // Water gets subtle specular highlight instead of contour lines
    if (isWater) {
      vec3 viewDir = normalize(-vPosition);
      vec3 halfDir = normalize(lightDir + viewDir);
      float spec = pow(max(dot(normal, halfDir), 0.0), 64.0);
      color += vec3(0.3, 0.35, 0.4) * spec;
    }

    // Contour lines (skip on water)
    if (uShowContours && uContourInterval > 0.0 && !isWater) {
      float majorInterval = uContourInterval * 5.0;

      // Minor contour lines
      float minorPhase = vElevation / uContourInterval;
      float minorDist = abs(fract(minorPhase + 0.5) - 0.5) * uContourInterval;
      float minorWidth = fwidth(vElevation) * 1.2;
      float minorLine = 1.0 - smoothstep(0.0, minorWidth, minorDist);

      // Major contour lines (every 5th)
      float majorPhase = vElevation / majorInterval;
      float majorDist = abs(fract(majorPhase + 0.5) - 0.5) * majorInterval;
      float majorWidth = fwidth(vElevation) * 2.5;
      float majorLine = 1.0 - smoothstep(0.0, majorWidth, majorDist);

      // Compose: major darker than minor
      vec3 contourColor = vec3(0.08, 0.06, 0.04);
      color = mix(color, contourColor, minorLine * 0.35);
      color = mix(color, contourColor, majorLine * 0.6);
    }

    gl_FragColor = vec4(color, 1.0);
  }
`;

// ── Three.js setup ─────────────────────────────────────────
function initScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a2e);

  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 1, 50000);
  camera.position.set(0, 600, 800);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 50;
  controls.maxDistance = 5000;
  controls.maxPolarAngle = Math.PI / 2 - 0.05; // don't go below terrain

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

// ── Build terrain mesh ─────────────────────────────────────
function buildTerrain(elevations, exaggeration) {
  if (terrainMesh) {
    terrainMesh.geometry.dispose();
    terrainMesh.material.dispose();
    scene.remove(terrainMesh);
  }

  // Compute elevation stats
  elevationMin = Infinity;
  elevationMax = -Infinity;
  const centerIdx = Math.floor(GRID_SIZE / 2) * GRID_SIZE + Math.floor(GRID_SIZE / 2);
  elevationCenter = elevations[centerIdx];
  for (let i = 0; i < elevations.length; i++) {
    if (elevations[i] < elevationMin) elevationMin = elevations[i];
    if (elevations[i] > elevationMax) elevationMax = elevations[i];
  }

  // Geometry: plane in XZ, displaced on Y
  const worldSize = 1000; // arbitrary world units
  const segments = GRID_SIZE - 1;
  const geometry = new THREE.PlaneGeometry(worldSize, worldSize, segments, segments);
  geometry.rotateX(-Math.PI / 2);

  const positions = geometry.attributes.position;
  const elevMid = (elevationMin + elevationMax) / 2;
  // Compute real horizontal extent so vertical scale matches horizontal
  const metersPerPixel = 40075016 * Math.cos(currentLat * Math.PI / 180) / (256 * Math.pow(2, currentZoom));
  const totalMeters = GRID_SIZE * metersPerPixel; // ~25km for 3 tiles at zoom 12
  const elevScale = worldSize / totalMeters; // world units per meter of elevation

  for (let i = 0; i < positions.count; i++) {
    const elev = elevations[i];
    // Map raw elevation to world-space Y
    const y = (elev - elevMid) * elevScale * exaggeration;
    positions.setY(i, y);
  }

  geometry.computeVertexNormals();

  // ShaderMaterial
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uContourInterval: { value: parseFloat(sliderInterval.value) * elevScale * exaggeration },
      uShowContours: { value: chkContours.checked },
      uShowGradient: { value: chkGradient.checked },
      uElevMin: { value: (elevationMin - elevMid) * elevScale * exaggeration },
      uElevMax: { value: (elevationMax - elevMid) * elevScale * exaggeration },
      uShowWater: { value: chkWater.checked },
      uLightDir: { value: new THREE.Vector3(0.6, 0.8, 0.4).normalize() },
      uElevMid: { value: elevMid },
      uElevScaleExag: { value: elevScale * exaggeration },
    },
    side: THREE.DoubleSide,
  });

  terrainMesh = new THREE.Mesh(geometry, material);
  scene.add(terrainMesh);

  // Store scale params for uniform updates
  terrainMesh.userData = { elevScale, elevMid, exaggeration };

  // Center marker
  if (centerMarker) { centerMarker.geometry.dispose(); centerMarker.material.dispose(); scene.remove(centerMarker); }
  const centerElev = (elevationCenter - elevMid) * elevScale * exaggeration;
  const markerHeight = worldSize * 0.02;
  const markerGeo = new THREE.ConeGeometry(worldSize * 0.006, markerHeight, 8);
  markerGeo.translate(0, markerHeight / 2, 0);
  const markerMat = new THREE.MeshBasicMaterial({ color: 0xe05050 });
  centerMarker = new THREE.Mesh(markerGeo, markerMat);
  centerMarker.position.set(0, centerElev, 0);
  centerMarker.visible = chkCenter.checked;
  scene.add(centerMarker);

  // Update elevation display
  elevationInfo.innerHTML =
    `Min: ${elevationMin.toFixed(0)} m &nbsp;|&nbsp; Max: ${elevationMax.toFixed(0)} m<br>` +
    `Center: ${elevationCenter.toFixed(0)} m`;

  // Reset camera
  const elevRange = (elevationMax - elevationMin) * elevScale * exaggeration;
  camera.position.set(0, elevRange * 2 + 200, worldSize * 0.7);
  controls.target.set(0, 0, 0);
  controls.update();
}

// ── Rebuild mesh with new exaggeration ─────────────────────
function rebuildWithExaggeration(exaggeration) {
  if (!elevationData) return;
  buildTerrain(elevationData, exaggeration);
}

// ── Update shader uniforms ─────────────────────────────────
function updateUniforms() {
  if (!terrainMesh) return;
  const u = terrainMesh.material.uniforms;
  const { elevScale, elevMid, exaggeration } = terrainMesh.userData;
  u.uShowContours.value = chkContours.checked;
  u.uShowGradient.value = chkGradient.checked;
  u.uShowWater.value = chkWater.checked;
  u.uContourInterval.value = parseFloat(sliderInterval.value) * elevScale * exaggeration;
}

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
function updateLocationInfo() {
  const mpp = 40075016 * Math.cos(currentLat * Math.PI / 180) / (256 * Math.pow(2, currentZoom));
  const extentKmNum = GRID_SIZE * mpp / 1000;
  const extentKm = extentKmNum.toFixed(1);
  // Sync the slider and label to actual extent
  const logVal = Math.log10(Math.max(1, extentKmNum));
  sliderExtent.value = Math.max(0, Math.min(3, logVal));
  valExtent.textContent = extentKmNum < 10 ? extentKmNum.toFixed(1) + ' km' : Math.round(extentKmNum) + ' km';
  const latDir = currentLat >= 0 ? 'N' : 'S';
  const lonDir = currentLon >= 0 ? 'E' : 'W';
  const latStr = Math.abs(currentLat).toFixed(4) + '°' + latDir;
  const lonStr = Math.abs(currentLon).toFixed(4) + '°' + lonDir;
  let html = '';
  if (currentName) html += `<div class="loc-name">${currentName}</div>`;
  html += `<div class="loc-detail">${latStr}, ${lonStr}</div>`;
  html += `<div class="loc-detail">${extentKm} × ${extentKm} km</div>`;
  locationInfoEl.innerHTML = html;
}

async function loadLocation(lat, lon, name) {
  loadingOverlay.classList.remove('hidden');
  loadingText.textContent = name ? `Loading ${name.split(',')[0]}...` : 'Loading terrain...';
  loadBtn.disabled = true;

  try {
    elevationData = await fetchTerrainTiles(lat, lon);
    currentLat = lat;
    currentLon = lon;
    currentName = name || '';
    buildTerrain(elevationData, parseFloat(sliderExag.value));
    updateLocationInfo();
  } catch (err) {
    console.error(err);
    elevationInfo.textContent = 'Error loading terrain data';
  } finally {
    loadingOverlay.classList.add('hidden');
    loadBtn.disabled = false;
  }
}

// ── UI event wiring ────────────────────────────────────────
chkContours.addEventListener('change', updateUniforms);
chkGradient.addEventListener('change', updateUniforms);
chkWater.addEventListener('change', updateUniforms);
chkCenter.addEventListener('change', () => {
  if (centerMarker) centerMarker.visible = chkCenter.checked;
});

btnElevUp.addEventListener('click', () => focusCameraOnElev('max'));
btnElevDown.addEventListener('click', () => focusCameraOnElev('min'));

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
  currentZoom = extentToZoom(km, currentLat);
  await loadLocation(currentLat, currentLon, currentName);
});

sliderExag.addEventListener('input', () => {
  const v = parseFloat(sliderExag.value);
  valExag.textContent = v.toFixed(1) + '×';
  rebuildWithExaggeration(v);
});

sliderInterval.addEventListener('input', () => {
  const v = parseInt(sliderInterval.value);
  valInterval.textContent = v + ' m';
  updateUniforms();
});

// Detect lat,lon patterns like "44.27, -72.74" or "44.27 -72.74"
function parseLatLon(str) {
  const m = str.match(/^\s*(-?\d+\.?\d*)\s*[,\s]\s*(-?\d+\.?\d*)\s*$/);
  if (!m) return null;
  const lat = parseFloat(m[1]), lon = parseFloat(m[2]);
  if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) return { lat, lon };
  return null;
}

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

// ── Render loop ────────────────────────────────────────────
function drawCompass() {
  const w = compassCanvas.width, h = compassCanvas.height;
  const cx = w / 2, cy = h / 2, r = 38;
  const ctx = compassCtx;
  ctx.clearRect(0, 0, w, h);

  // Camera azimuth: angle of camera position projected onto XZ plane
  // In Three.js with OrbitControls, camera orbits around target
  // Z+ is "south" in our terrain (plane rotated to XZ), X+ is "east"
  const dx = camera.position.x - controls.target.x;
  const dz = camera.position.z - controls.target.z;
  const azimuth = Math.atan2(dx, dz); // angle from Z+ axis (north)

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-azimuth);

  // Outer ring
  ctx.beginPath();
  ctx.arc(0, 0, r + 4, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(20,20,40,0.7)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, r + 4, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Tick marks for E, S, W
  const dirs = [
    { angle: 0, label: 'N', color: '#e05050' },
    { angle: Math.PI / 2, label: 'E', color: '#8ba4d0' },
    { angle: Math.PI, label: 'S', color: '#8ba4d0' },
    { angle: -Math.PI / 2, label: 'W', color: '#8ba4d0' },
  ];
  for (const d of dirs) {
    const tx = Math.sin(d.angle), ty = -Math.cos(d.angle);
    // Tick line
    ctx.beginPath();
    ctx.moveTo(tx * (r - 6), ty * (r - 6));
    ctx.lineTo(tx * (r + 1), ty * (r + 1));
    ctx.strokeStyle = d.color;
    ctx.lineWidth = d.label === 'N' ? 2.5 : 1.5;
    ctx.stroke();
    // Label
    ctx.fillStyle = d.color;
    ctx.font = d.label === 'N' ? 'bold 13px sans-serif' : '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(d.label, tx * (r - 16), ty * (r - 16));
  }

  // North arrow (triangle)
  ctx.beginPath();
  ctx.moveTo(0, -(r + 1));
  ctx.lineTo(-5, -(r - 10));
  ctx.lineTo(5, -(r - 10));
  ctx.closePath();
  ctx.fillStyle = '#e05050';
  ctx.fill();

  // Center dot
  ctx.beginPath();
  ctx.arc(0, 0, 3, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fill();

  ctx.restore();
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
  drawCompass();
}

// ── Query parameters ──────────────────────────────────────
// Supported: ?lat=44.27&lon=-72.74&label=Mount+Washington&extent=10
//            &contours=0&gradient=1&water=0&center=1&exag=2.5&interval=100
function parseQueryParams() {
  const p = new URLSearchParams(window.location.search);
  const lat = p.has('lat') ? parseFloat(p.get('lat')) : DEFAULT_LAT;
  const lon = p.has('lon') ? parseFloat(p.get('lon')) : DEFAULT_LON;
  const label = p.get('label') || (p.has('lat') ? '' : 'Mount Washington, VT');

  if (p.has('extent')) {
    const km = parseFloat(p.get('extent'));
    const exp = Math.log10(Math.max(1, Math.min(1000, km)));
    sliderExtent.value = exp;
    valExtent.textContent = km < 10 ? km.toFixed(1) + ' km' : km.toFixed(0) + ' km';
  }
  if (p.has('exag')) {
    const v = parseFloat(p.get('exag'));
    sliderExag.value = Math.max(1, Math.min(5, v));
    valExag.textContent = v.toFixed(1) + '×';
  }
  if (p.has('interval')) {
    const v = parseFloat(p.get('interval'));
    sliderInterval.value = Math.max(10, Math.min(200, v));
    valInterval.textContent = v + ' m';
  }
  if (p.has('contours')) chkContours.checked = p.get('contours') !== '0';
  if (p.has('gradient')) chkGradient.checked = p.get('gradient') !== '0';
  if (p.has('water')) chkWater.checked = p.get('water') !== '0';
  if (p.has('center')) chkCenter.checked = p.get('center') !== '0';

  return { lat, lon, label };
}

// ── Boot ───────────────────────────────────────────────────
initScene();
animate();
const bootParams = parseQueryParams();
currentZoom = extentToZoom(Math.pow(10, parseFloat(sliderExtent.value)), bootParams.lat);
loadLocation(bootParams.lat, bootParams.lon, bootParams.label);
