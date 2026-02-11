import * as THREE from 'three';
import {
  GRID_SIZE,
  scene, camera, controls, terrainMesh, centerMarker,
  currentLat, currentZoom,
  chkContours, chkGradient, chkWater, chkCenter,
  sliderInterval, elevationInfo,
  elevationData,
  setTerrainMesh, setCenterMarker,
  setElevationMin, setElevationMax, setElevationCenter
} from './constants.js';
import { vertexShader, fragmentShader } from './shaders.js';

// ── Build terrain mesh ─────────────────────────────────────
export function buildTerrain(elevations, exaggeration) {
  if (terrainMesh) {
    terrainMesh.geometry.dispose();
    terrainMesh.material.dispose();
    scene.remove(terrainMesh);
  }

  // Compute elevation stats
  let eMin = Infinity;
  let eMax = -Infinity;
  const centerIdx = Math.floor(GRID_SIZE / 2) * GRID_SIZE + Math.floor(GRID_SIZE / 2);
  const eCenter = elevations[centerIdx];
  for (let i = 0; i < elevations.length; i++) {
    if (elevations[i] < eMin) eMin = elevations[i];
    if (elevations[i] > eMax) eMax = elevations[i];
  }
  setElevationMin(eMin);
  setElevationMax(eMax);
  setElevationCenter(eCenter);

  // Geometry: plane in XZ, displaced on Y
  const worldSize = 1000; // arbitrary world units
  const segments = GRID_SIZE - 1;
  const geometry = new THREE.PlaneGeometry(worldSize, worldSize, segments, segments);
  geometry.rotateX(-Math.PI / 2);

  const positions = geometry.attributes.position;
  const elevMid = (eMin + eMax) / 2;
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
      uElevMin: { value: (eMin - elevMid) * elevScale * exaggeration },
      uElevMax: { value: (eMax - elevMid) * elevScale * exaggeration },
      uShowWater: { value: chkWater.checked },
      uLightDir: { value: new THREE.Vector3(0.6, 0.8, 0.4).normalize() },
      uElevMid: { value: elevMid },
      uElevScaleExag: { value: elevScale * exaggeration },
    },
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);
  setTerrainMesh(mesh);

  // Store scale params for uniform updates
  mesh.userData = { elevScale, elevMid, exaggeration };

  // Center marker
  if (centerMarker) { centerMarker.geometry.dispose(); centerMarker.material.dispose(); scene.remove(centerMarker); }
  const centerElev = (eCenter - elevMid) * elevScale * exaggeration;
  const markerHeight = worldSize * 0.02;
  const markerGeo = new THREE.ConeGeometry(worldSize * 0.006, markerHeight, 8);
  markerGeo.translate(0, markerHeight / 2, 0);
  const markerMat = new THREE.MeshBasicMaterial({ color: 0xe05050 });
  const marker = new THREE.Mesh(markerGeo, markerMat);
  marker.position.set(0, centerElev, 0);
  marker.visible = chkCenter.checked;
  scene.add(marker);
  setCenterMarker(marker);

  // Update elevation display
  elevationInfo.innerHTML =
    `Min: ${eMin.toFixed(0)} m &nbsp;|&nbsp; Max: ${eMax.toFixed(0)} m<br>` +
    `Center: ${eCenter.toFixed(0)} m`;

  // Reset camera
  const elevRange = (eMax - eMin) * elevScale * exaggeration;
  camera.position.set(0, elevRange * 2 + 200, worldSize * 0.7);
  controls.target.set(0, 0, 0);
  controls.update();
}

// ── Rebuild mesh with new exaggeration ─────────────────────
export function rebuildWithExaggeration(exaggeration) {
  if (!elevationData) return;
  buildTerrain(elevationData, exaggeration);
}

// ── Update shader uniforms ─────────────────────────────────
export function updateUniforms() {
  if (!terrainMesh) return;
  const u = terrainMesh.material.uniforms;
  const { elevScale, elevMid, exaggeration } = terrainMesh.userData;
  u.uShowContours.value = chkContours.checked;
  u.uShowGradient.value = chkGradient.checked;
  u.uShowWater.value = chkWater.checked;
  u.uContourInterval.value = parseFloat(sliderInterval.value) * elevScale * exaggeration;
}
