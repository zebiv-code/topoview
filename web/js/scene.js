import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  canvas,
  setScene, setCamera, setRenderer, setControls
} from './constants.js';

// ── Three.js setup ─────────────────────────────────────────
export function initScene() {
  const _scene = new THREE.Scene();
  _scene.background = new THREE.Color(0x1a1a2e);
  setScene(_scene);

  const _camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 1, 50000);
  _camera.position.set(0, 600, 800);
  setCamera(_camera);

  const _renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  _renderer.setSize(window.innerWidth, window.innerHeight);
  _renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  setRenderer(_renderer);

  const _controls = new OrbitControls(_camera, canvas);
  _controls.enableDamping = true;
  _controls.dampingFactor = 0.08;
  _controls.minDistance = 50;
  _controls.maxDistance = 5000;
  _controls.maxPolarAngle = Math.PI / 2 - 0.05; // don't go below terrain
  setControls(_controls);

  window.addEventListener('resize', () => {
    _camera.aspect = window.innerWidth / window.innerHeight;
    _camera.updateProjectionMatrix();
    _renderer.setSize(window.innerWidth, window.innerHeight);
  });
}
