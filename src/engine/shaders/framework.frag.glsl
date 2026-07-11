#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

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
uniform int u_colorPipelineVersion;
uniform int u_modernStyle; // 0=modernSmooth, 1=layeredOrbit, 2=orbitNebula, 3=contourField
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
uniform int u_postToneMapping; // 0=none, 1=soft, 2=filmic
uniform float u_postExposure;
uniform float u_postContrast;
uniform float u_postSaturation;
uniform float u_postTemperature;
uniform float u_postTint;
uniform float u_postVignette;
uniform bool u_postDither;

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
  float formulaDistance;
};

struct FractalSample {
  vec2 point;
  vec2 c;
  vec2 z;
  vec2 zPrev;
  int iter;
  float maxIter;
  float smoothIter;
  float escaped;
  float radius2;
  float minRadius2;
  float maxRadius2;
  float finalAngle;
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
#ifndef HAS_ANALYTIC_DE
    return baseColor;
#else
    if (u_power != 2.0) return baseColor;
    // Distance Estimation: d = |z|*log|z| / |dz/dc|, normalized to pixel size
    float absZ = length(z);
    float absDz = length(demDz);
    float pixelSize = 1.0 / (u_zoom * min(u_resolution.x, u_resolution.y));
    float dist = (absDz > 0.0) ? absZ * log(absZ) / absDz : 0.0;
    float normDist = dist / pixelSize;
    float lightness = clamp(pow(normDist, 0.4) * u_lightIntensity * 1.6, 0.0, 1.0);
    return baseColor * lightness;
#endif
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

vec3 srgbToLinear(vec3 color) {
  vec3 low = color / 12.92;
  vec3 high = pow(max((color + 0.055) / 1.055, 0.0), vec3(2.4));
  return mix(high, low, step(color, vec3(0.04045)));
}

vec3 linearToSrgb(vec3 color) {
  color = max(color, 0.0);
  vec3 low = color * 12.92;
  vec3 high = 1.055 * pow(color, vec3(1.0 / 2.4)) - 0.055;
  return mix(high, low, step(color, vec3(0.0031308)));
}

vec3 modernGradientColor(float t) {
  vec3 displayColor = u_useCustomGradient ? gradientColor(t) : getColor(t, u_paletteIndex);
  return srgbToLinear(displayColor);
}

vec3 shadeFractal(FractalSample sample) {
  if (u_modernStyle == 1) {
    float pointTrap = clamp(exp(-length(sample.z - u_orbitTrapPoint) * 3.0), 0.0, 1.0);
    float radialSpan = clamp(sqrt(max(sample.maxRadius2, 0.0)) - sqrt(max(sample.minRadius2, 0.0)), 0.0, 4.0) * 0.25;
    vec3 atmosphere = vec3(0.015, 0.04, 0.12) + radialSpan * vec3(0.08, 0.24, 0.42);
    vec3 detail = vec3(0.95, 0.24, 0.08) * pointTrap;
    return atmosphere + detail * (0.35 + 0.65 * fract(sample.smoothIter * 0.08));
  }
  if (u_modernStyle == 2) {
    float span = clamp(sqrt(max(sample.maxRadius2, 0.0)) - sqrt(max(sample.minRadius2, 0.0)), 0.0, 5.0) * 0.2;
    float phase = 0.5 + 0.5 * sin(sample.angleAccum * 0.18 + sample.finalAngle * 2.0);
    float core = exp(-2.2 * abs(fract(sample.smoothIter * 0.075) - 0.5));
    vec3 nebula = mix(vec3(0.015, 0.01, 0.08), vec3(0.04, 0.36, 0.72), phase) * (0.25 + span);
    return nebula + core * vec3(0.8, 0.18, 0.52) * (0.2 + span);
  }
  if (u_modernStyle == 3) {
#ifdef HAS_ANALYTIC_DE
    float contour = 0.5 + 0.5 * cos(22.0 * log(max(sample.formulaDistance, 0.000001)));
    return mix(vec3(0.01, 0.025, 0.06), vec3(0.18, 0.8, 0.95), contour);
#endif
  }
  float paletteT = fract(sample.smoothIter * 4.0);
  return modernGradientColor(paletteT);
}

vec3 applyModernPost(vec3 color) {
  color *= exp2(u_postExposure);

  if (u_postToneMapping == 1) {
    color = color / (1.0 + color);
  } else if (u_postToneMapping == 2) {
    color = (color * (2.51 * color + 0.03)) / (color * (2.43 * color + 0.59) + 0.14);
  }

  float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color = mix(vec3(luma), color, u_postSaturation);
  color = (color - 0.5) * u_postContrast + 0.5;
  color += vec3(u_postTemperature * 0.025, 0.0, -u_postTemperature * 0.025);
  color += vec3(u_postTint * 0.015, -u_postTint * 0.01, u_postTint * 0.015);
  return color;
}

vec3 finalizeOutput(vec3 color) {
  if (u_colorPipelineVersion != 2) return color;

  vec2 p = (gl_FragCoord.xy + u_tileOffset) / u_resolution;
  float edge = 16.0 * p.x * (1.0 - p.x) * p.y * (1.0 - p.y);
  color = applyModernPost(color);
  color *= mix(1.0, 0.5 + 0.5 * pow(clamp(edge, 0.0, 1.0), 0.15), clamp(u_postVignette, 0.0, 1.0));
  color = linearToSrgb(color);

  if (u_postDither) {
    float noise = fract(sin(dot(gl_FragCoord.xy + u_tileOffset, vec2(12.9898, 78.233))) * 43758.5453);
    color += (noise - 0.5) / 255.0;
  }
  return clamp(color, 0.0, 1.0);
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
    if ((u_lightingEnabled && u_lightingMode == 1 || u_modernStyle == 3) && u_power == 2.0) {
#ifdef HAS_ANALYTIC_DE
      demDz = 2.0 * vec2(z.x * demDz.x - z.y * demDz.y, z.x * demDz.y + z.y * demDz.x) + vec2(1.0, 0.0);
#endif
    }
    zPrev = z;
    z = nextZ;
    iter = i + 1;
  }

  if (!escaped && iter >= u_maxIterations) {
    if (u_colorPipelineVersion == 2) return vec3(0.0);
    return insideColor(stats);
  }

  if (u_colorPipelineVersion == 2) {
    FractalSample sample;
    sample.point = point;
    sample.c = c;
    sample.z = z;
    sample.zPrev = zPrev;
    sample.iter = iter;
    sample.maxIter = float(u_maxIterations);
    sample.smoothIter = smoothIter;
    sample.escaped = 1.0;
    sample.radius2 = stats.radius2;
    sample.minRadius2 = stats.minRadius;
    sample.maxRadius2 = stats.maxRadius;
    sample.finalAngle = stats.finalAngle;
    sample.angleAccum = stats.angleAccum;
    sample.formulaDistance = 0.0;
#ifdef HAS_ANALYTIC_DE
    if (u_power == 2.0 && length(demDz) > 0.0) sample.formulaDistance = length(z) * log(max(length(z), 1.00001)) / length(demDz);
#endif
    return applyLighting(shadeFractal(sample), point, demDz, z);
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

void main() {
  // u_tileOffset shifts gl_FragCoord for tiled export; u_resolution is always the full image size
  vec2 uv = (gl_FragCoord.xy + u_tileOffset - u_resolution * 0.5) / min(u_resolution.x, u_resolution.y);
  float px = 1.0 / min(u_resolution.x, u_resolution.y);

  if (u_ssaaLevel == 16) {
    // 4×4 grid (16-tap SSAA)
    vec3 acc = vec3(0.0);
    for (int y = 0; y < 4; y++) {
      for (int x = 0; x < 4; x++) {
        vec2 offset = vec2(float(x) - 1.5, float(y) - 1.5) * (px / 4.0);
        acc += colorAtUV(uv + offset);
      }
    }
    gl_FragColor = vec4(finalizeOutput(acc / 16.0), 1.0);
  } else if (u_ssaaLevel == 9) {
    // 3×3 grid (9-tap SSAA)
    vec3 acc = vec3(0.0);
    for (int y = 0; y < 3; y++) {
      for (int x = 0; x < 3; x++) {
        vec2 offset = vec2(float(x) - 1.0, float(y) - 1.0) * (px / 3.0);
        acc += colorAtUV(uv + offset);
      }
    }
    gl_FragColor = vec4(finalizeOutput(acc / 9.0), 1.0);
  } else if (u_ssaaLevel == 4) {
    // 2×2 grid (4-tap SSAA) — original behavior
    vec3 c1 = colorAtUV(uv + vec2(-0.25 * px, -0.25 * px));
    vec3 c2 = colorAtUV(uv + vec2( 0.25 * px, -0.25 * px));
    vec3 c3 = colorAtUV(uv + vec2(-0.25 * px,  0.25 * px));
    vec3 c4 = colorAtUV(uv + vec2( 0.25 * px,  0.25 * px));
    gl_FragColor = vec4(finalizeOutput((c1 + c2 + c3 + c4) * 0.25), 1.0);
  } else {
    gl_FragColor = vec4(finalizeOutput(colorAtUV(uv)), 1.0);
  }
}
