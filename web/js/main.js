import {
  scene, camera, renderer, controls,
  sliderExtent, DEFAULT_LAT, DEFAULT_LON,
  chkContours, chkGradient, chkWater, chkCenter,
  sliderExag, sliderInterval, valExag, valInterval, valExtent,
  setCurrentZoom
} from './constants.js';
import { extentToZoom } from './tiles-math.js';
import { initScene } from './scene.js';
import { drawCompass } from './compass.js';
import { wireUI, loadLocation } from './ui.js';

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
    valExag.textContent = v.toFixed(1) + '\u00D7';
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

// ── Render loop ────────────────────────────────────────────
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
  drawCompass();
}

// ── Boot ───────────────────────────────────────────────────
initScene();
wireUI();
animate();
const bootParams = parseQueryParams();
setCurrentZoom(extentToZoom(Math.pow(10, parseFloat(sliderExtent.value)), bootParams.lat));
loadLocation(bootParams.lat, bootParams.lon, bootParams.label);
