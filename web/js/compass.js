import { camera, controls, compassCanvas, compassCtx } from './constants.js';

// ── Compass rose drawing ───────────────────────────────────
export function drawCompass() {
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
