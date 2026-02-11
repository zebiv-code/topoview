// ── Constants ──────────────────────────────────────────────
export const TILE_SIZE = 256;
export const GRID_SIZE = TILE_SIZE * 3; // 768
export const DEFAULT_LAT = 44.27;
export const DEFAULT_LON = -72.74;

// ── State ──────────────────────────────────────────────────
export let scene, camera, renderer, controls, terrainMesh, centerMarker;
export let elevationData = null;
export let elevationMin = 0, elevationMax = 1000, elevationCenter = 500;
export let currentLat = DEFAULT_LAT, currentLon = DEFAULT_LON;
export let currentZoom = 14; // will be set from extent slider on load
export let currentName = '';
export let gridOriginTileX = 0, gridOriginTileY = 0;

// ── Setters (to allow mutation from other modules) ─────────
export function setScene(v) { scene = v; }
export function setCamera(v) { camera = v; }
export function setRenderer(v) { renderer = v; }
export function setControls(v) { controls = v; }
export function setTerrainMesh(v) { terrainMesh = v; }
export function setCenterMarker(v) { centerMarker = v; }
export function setElevationData(v) { elevationData = v; }
export function setElevationMin(v) { elevationMin = v; }
export function setElevationMax(v) { elevationMax = v; }
export function setElevationCenter(v) { elevationCenter = v; }
export function setCurrentLat(v) { currentLat = v; }
export function setCurrentLon(v) { currentLon = v; }
export function setCurrentZoom(v) { currentZoom = v; }
export function setCurrentName(v) { currentName = v; }
export function setGridOriginTileX(v) { gridOriginTileX = v; }
export function setGridOriginTileY(v) { gridOriginTileY = v; }

// ── DOM refs ───────────────────────────────────────────────
export const canvas = document.getElementById('canvas');
export const locationInput = document.getElementById('location-input');
export const loadBtn = document.getElementById('load-btn');
export const chkContours = document.getElementById('chk-contours');
export const chkGradient = document.getElementById('chk-gradient');
export const sliderExag = document.getElementById('slider-exag');
export const sliderInterval = document.getElementById('slider-interval');
export const valExag = document.getElementById('val-exag');
export const valInterval = document.getElementById('val-interval');
export const elevationInfo = document.getElementById('elevation-info');
export const loadingOverlay = document.getElementById('loading-overlay');
export const loadingText = document.getElementById('loading-text');
export const locationInfoEl = document.getElementById('location-text');
export const chkWater = document.getElementById('chk-water');
export const chkCenter = document.getElementById('chk-center');
export const sliderExtent = document.getElementById('slider-extent');
export const valExtent = document.getElementById('val-extent');
export const btnElevUp = document.getElementById('btn-elev-up');
export const btnElevDown = document.getElementById('btn-elev-down');
export const btnShare = document.getElementById('btn-share');
export const compassCanvas = document.getElementById('compass');
export const compassCtx = compassCanvas.getContext('2d');
