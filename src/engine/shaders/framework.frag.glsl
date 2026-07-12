precision highp float;

// #define lines injected by assembler
// #define BAILOUT_RADIUS 4.0
// #define ESCAPE_CONVERGE
// #define CONVERGE_EPSILON 0.000001
// #define NEED_ORBIT_TRAP
// #define NEED_TIA

uniform vec2 u_resolution;
uniform vec2 u_center;
uniform float u_zoom;
uniform float u_rotation;
uniform int u_maxIterations;
uniform int u_paletteIndex;
uniform bool u_isJulia;
uniform vec2 u_juliaC;
uniform float u_power;
uniform int u_ssaaLevel; // 0=off, 4=2x2, 9=3x3, 16=4x4
uniform vec2 u_tileOffset; // pixel offset for tiled export; (0,0) for normal rendering
uniform bool u_lightingEnabled;
uniform int u_lightingMode;
uniform float u_lightAzimuth;
uniform float u_lightElevation;
uniform float u_lightIntensity;
uniform bool u_useCustomGradient;
uniform vec3 u_gradientColors[5];
uniform float u_gradientPositions[5];
uniform int u_gradientCount;
uniform bool u_adjustmentsEnabled;
uniform float u_adjustExposure;
uniform float u_adjustContrast;
uniform float u_adjustBrightness;
uniform float u_adjustGamma;
uniform float u_adjustSaturation;
uniform float u_adjustVibrance;
uniform float u_adjustHue;
uniform bool u_adjustInvert;
uniform vec3 u_rgbCurvePoints[5];

uniform int u_orbitTrapShape;
uniform vec2 u_orbitTrapPoint;
uniform float u_orbitTrapRadius;
uniform float u_orbitTrapWidth;

/* INJECT_UNIFORMS */

struct OrbitStats {
  float trapMin;
  float stripeSum;
  float tiaSum;
  float atomMin;
  // Maps to the TypeScript OrbitData.angle channel.
  float finalAngle;
  // These fields snapshot the current orbit state at the moment bailout/converge
  // detection is evaluated, before the next iterateStep() is executed.
  vec2 finalZ;
  vec2 zPrev;
  float radius2;
  float minRadius;
  float maxRadius;
  float angleAccum;
};

/* INJECT_COMPLEX_MATH */
/* INJECT_PALETTE_FUNCTIONS */
/* INJECT_ORBIT_TRAP */
/* INJECT_TRANSFORM */
/* INJECT_FORMULA_INIT */
/* INJECT_FORMULA */
/* INJECT_OUTSIDE_COLORING */
/* INJECT_INSIDE_COLORING */

float escapeHeight(vec2 point) {
#ifdef ESCAPE_CONVERGE
  return 0.0;
#else
  vec2 z = u_isJulia ? point : vec2(0.0);
  vec2 c = u_isJulia ? u_juliaC : point;
#ifdef HAS_INIT_FORMULA
  z = initFormula(z, c, point);
#endif
  vec2 zPrev = vec2(0.0);
  for (int i = 0; i < 10000; i++) {
    if (i >= u_maxIterations) break;
    float zz = dot(z, z);
    if (zz > BAILOUT_RADIUS) {
      float zn = sqrt(zz);
      float si = float(i) - log2(log2(max(zn, 1.00001))) / log2(max(u_power, 2.0)) + 4.0;
      return clamp(si / float(u_maxIterations), 0.0, 1.0);
    }
    vec2 nextZ = iterateStep(z, c, zPrev, point);
    zPrev = z;
    z = nextZ;
  }
  return 0.0;
#endif
}

vec3 applyLighting(vec3 baseColor, vec2 point, vec2 demDz, vec2 z) {
  if (!u_lightingEnabled) return baseColor;
#ifdef ESCAPE_CONVERGE
  return baseColor;
#else
  if (u_lightingMode == 1) {
    // Distance Estimation: d = |z|*log|z| / |dz/dc|, normalized to pixel size
    float absZ = length(z);
    float absDz = length(demDz);
    float pixelSize = 1.0 / (u_zoom * min(u_resolution.x, u_resolution.y));
    float dist = (absDz > 0.0) ? absZ * log(absZ) / absDz : 0.0;
    float normDist = dist / pixelSize;
    float lightness = clamp(pow(normDist, 0.4) * u_lightIntensity * 1.6, 0.0, 1.0);
    return baseColor * lightness;
  } else {
    // Normal-map lighting via escapeHeight gradient
    float h = escapeHeight(point);
    float px = 1.0 / min(u_resolution.x, u_resolution.y);
    float hx = escapeHeight(point + vec2(px, 0.0));
    float hy = escapeHeight(point + vec2(0.0, px));
    vec3 n = normalize(vec3(h - hx, h - hy, 1.0));
    vec3 l = vec3(
      cos(u_lightElevation) * cos(u_lightAzimuth),
      cos(u_lightElevation) * sin(u_lightAzimuth),
      sin(u_lightElevation)
    );
    float diff = max(dot(n, l), 0.0);
    return baseColor * (0.3 + diff * u_lightIntensity);
  }
#endif
}

vec3 colorAtComplex(vec2 point) {
#ifdef ESCAPE_CONVERGE
  // Newton-type formulas: start from point to avoid div-by-zero
  vec2 z = point;
#else
  vec2 z = u_isJulia ? point : vec2(0.0);
#endif
  vec2 c = u_isJulia ? u_juliaC : point;
#ifdef HAS_INIT_FORMULA
  z = initFormula(z, c, point);
#endif
  vec2 zPrev = vec2(0.0);
  int iter = 0;
  float smoothIter = 0.0;
  bool escaped = false;
  vec2 demDz = vec2(0.0); // dz/dc for DEM, tracked only when needed

  OrbitStats stats;
  stats.trapMin = 1e9;
  stats.stripeSum = 0.0;
  stats.tiaSum = 0.0;
  stats.atomMin = 1e9;
  stats.finalAngle = atan(z.y, z.x);
  stats.finalZ = z;
  stats.zPrev = zPrev;
  stats.radius2 = dot(z, z);
  // min/max radius start from the initial z. For converge formulas this means
  // maxRadius may remain dominated by the initial point; treat it as an orbit
  // envelope metric rather than a converge-specific invariant.
  stats.minRadius = stats.radius2;
  stats.maxRadius = stats.radius2;
  stats.angleAccum = 0.0;

  for (int i = 0; i < 10000; i++) {
    if (i >= u_maxIterations) break;
    float zz = dot(z, z);
    float angle = atan(z.y, z.x);

    stats.finalZ = z;
    stats.zPrev = zPrev;
    stats.radius2 = zz;
    stats.finalAngle = angle;
    stats.minRadius = min(stats.minRadius, zz);
    stats.maxRadius = max(stats.maxRadius, zz);
    stats.angleAccum += angle;

#ifdef ESCAPE_CONVERGE
    float diff = length(z - zPrev);
    if (i > 0 && diff < CONVERGE_EPSILON) {
      escaped = true;
      smoothIter = float(i);
      iter = i;
      break;
    }
#else
    if (zz > BAILOUT_RADIUS) {
      escaped = true;
      float zn = sqrt(zz);
      smoothIter = float(i) - log2(log2(max(zn, 1.00001))) / log2(max(u_power, 2.0)) + 4.0;
      iter = i;
      break;
    }
#endif

    stats.stripeSum += 0.5 + 0.5 * sin(8.0 * stats.finalAngle);
    stats.atomMin = min(stats.atomMin, zz);

#ifdef NEED_ORBIT_TRAP
    stats.trapMin = min(stats.trapMin, orbitTrapDistance(z));
#endif

#ifdef NEED_TIA
    float zr = sqrt(zz);
    float cr = length(c);
    float denom = zr + cr;
    if (denom > 0.00001) stats.tiaSum += abs(zr - cr) / denom;
#endif

    vec2 nextZ = iterateStep(z, c, zPrev, point);
    // Track dz/dc = 2*z*(dz/dc) + 1 for DEM lighting (generalised, correct for z^2+c family)
    if (u_lightingEnabled && u_lightingMode == 1) {
      demDz = 2.0 * vec2(z.x * demDz.x - z.y * demDz.y, z.x * demDz.y + z.y * demDz.x) + vec2(1.0, 0.0);
    }
    zPrev = z;
    z = nextZ;
    iter = i + 1;
  }

  if (!escaped && iter >= u_maxIterations) {
    return insideColor(stats);
  }

  float paletteT = outsideColor(smoothIter, iter, stats);
  vec3 color = u_useCustomGradient ? gradientColor(paletteT) : getColor(paletteT, u_paletteIndex);
  return applyLighting(color, point, demDz, z);
}

vec2 mapUVToComplex(vec2 uv) {
  // Apply rotation
  float cos_r = cos(u_rotation);
  float sin_r = sin(u_rotation);
  vec2 rotated = vec2(
    uv.x * cos_r - uv.y * sin_r,
    uv.x * sin_r + uv.y * cos_r
  );

  // Apply center and zoom to get complex plane coordinates
  vec2 complex = vec2(
    rotated.x / u_zoom + u_center.x,
    rotated.y / u_zoom + u_center.y
  );

  // Apply transform on complex plane
  return transformUV(complex);
}

vec3 colorAtUV(vec2 uv) {
  return colorAtComplex(mapUVToComplex(uv));
}

float sampleCurve(float value, float p0, float p1, float p2, float p3, float p4) {
  float scaled = clamp(value, 0.0, 1.0) * 4.0;
  if (scaled < 1.0) return mix(p0, p1, scaled);
  if (scaled < 2.0) return mix(p1, p2, scaled - 1.0);
  if (scaled < 3.0) return mix(p2, p3, scaled - 2.0);
  return mix(p3, p4, scaled - 3.0);
}

vec3 applyRgbCurves(vec3 color) {
  return vec3(
    sampleCurve(color.r, u_rgbCurvePoints[0].r, u_rgbCurvePoints[1].r, u_rgbCurvePoints[2].r, u_rgbCurvePoints[3].r, u_rgbCurvePoints[4].r),
    sampleCurve(color.g, u_rgbCurvePoints[0].g, u_rgbCurvePoints[1].g, u_rgbCurvePoints[2].g, u_rgbCurvePoints[3].g, u_rgbCurvePoints[4].g),
    sampleCurve(color.b, u_rgbCurvePoints[0].b, u_rgbCurvePoints[1].b, u_rgbCurvePoints[2].b, u_rgbCurvePoints[3].b, u_rgbCurvePoints[4].b)
  );
}

vec3 rotateHue(vec3 color, float angle) {
  const mat3 rgbToYiq = mat3(
    0.299, 0.596, 0.211,
    0.587, -0.274, -0.523,
    0.114, -0.322, 0.312
  );
  const mat3 yiqToRgb = mat3(
    1.0, 1.0, 1.0,
    0.956, -0.272, -1.106,
    0.621, -0.647, 1.703
  );
  vec3 yiq = rgbToYiq * color;
  float c = cos(angle);
  float s = sin(angle);
  yiq.yz = mat2(c, -s, s, c) * yiq.yz;
  return yiqToRgb * yiq;
}

vec3 applyColorAdjustments(vec3 color) {
  if (!u_adjustmentsEnabled) return clamp(color, 0.0, 1.0);
  color = max(color, vec3(0.0)) * exp2(u_adjustExposure);
  color += vec3(u_adjustBrightness * 0.005);
  color = (color - 0.5) * (1.0 + u_adjustContrast * 0.01) + 0.5;
  color = pow(max(color, vec3(0.0)), vec3(1.0 / max(u_adjustGamma, 0.25)));

  float maxChannel = max(color.r, max(color.g, color.b));
  float minChannel = min(color.r, min(color.g, color.b));
  float chroma = clamp(maxChannel - minChannel, 0.0, 1.0);
  float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
  float vibranceFactor = 1.0 + u_adjustVibrance * 0.01 * (1.0 - chroma);
  color = mix(vec3(luminance), color, max(vibranceFactor, 0.0));

  luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color = mix(vec3(luminance), color, max(1.0 + u_adjustSaturation * 0.01, 0.0));
  if (abs(u_adjustHue) > 0.001) color = rotateHue(color, radians(u_adjustHue));
  color = applyRgbCurves(clamp(color, 0.0, 1.0));
  if (u_adjustInvert) color = vec3(1.0) - color;
  return clamp(color, 0.0, 1.0);
}

void main() {
  // u_tileOffset shifts gl_FragCoord for tiled export; u_resolution is always the full image size
  vec2 uv = (gl_FragCoord.xy + u_tileOffset - u_resolution * 0.5) / min(u_resolution.x, u_resolution.y);
  float px = 1.0 / min(u_resolution.x, u_resolution.y);

  vec3 resolvedColor;
  if (u_ssaaLevel == 16) {
    // 4×4 grid (16-tap SSAA)
    vec3 acc = vec3(0.0);
    for (int y = 0; y < 4; y++) {
      for (int x = 0; x < 4; x++) {
        vec2 offset = vec2(float(x) - 1.5, float(y) - 1.5) * (px / 4.0);
        acc += colorAtUV(uv + offset);
      }
    }
    resolvedColor = acc / 16.0;
  } else if (u_ssaaLevel == 9) {
    // 3×3 grid (9-tap SSAA)
    vec3 acc = vec3(0.0);
    for (int y = 0; y < 3; y++) {
      for (int x = 0; x < 3; x++) {
        vec2 offset = vec2(float(x) - 1.0, float(y) - 1.0) * (px / 3.0);
        acc += colorAtUV(uv + offset);
      }
    }
    resolvedColor = acc / 9.0;
  } else if (u_ssaaLevel == 4) {
    // 2×2 grid (4-tap SSAA) — original behavior
    vec3 c1 = colorAtUV(uv + vec2(-0.25 * px, -0.25 * px));
    vec3 c2 = colorAtUV(uv + vec2( 0.25 * px, -0.25 * px));
    vec3 c3 = colorAtUV(uv + vec2(-0.25 * px,  0.25 * px));
    vec3 c4 = colorAtUV(uv + vec2( 0.25 * px,  0.25 * px));
    resolvedColor = (c1 + c2 + c3 + c4) * 0.25;
  } else {
    resolvedColor = colorAtUV(uv);
  }
  gl_FragColor = vec4(applyColorAdjustments(resolvedColor), 1.0);
}
