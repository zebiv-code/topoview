// ── Shaders ────────────────────────────────────────────────
export const vertexShader = `
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

export const fragmentShader = `
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
    // green -> tan -> brown -> gray -> white
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
