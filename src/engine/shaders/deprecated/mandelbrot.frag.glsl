precision highp float;

uniform vec2 u_resolution;
uniform vec2 u_center;
uniform float u_zoom;
uniform int u_maxIterations;
uniform int u_paletteIndex;
uniform bool u_isJulia;
uniform vec2 u_juliaC;
uniform int u_formula;
uniform float u_power;
uniform int u_outsideColoring;
uniform int u_insideColoring;
uniform int u_orbitTrapShape;
uniform vec2 u_orbitTrapPoint;
uniform float u_orbitTrapRadius;
uniform float u_orbitTrapWidth;
uniform bool u_useSSAA;
uniform bool u_lightingEnabled;
uniform float u_lightAzimuth;
uniform float u_lightElevation;
uniform float u_lightIntensity;
uniform bool u_useCustomGradient;
uniform vec3 u_gradientColors[5];
uniform float u_gradientPositions[5];
uniform int u_gradientCount;
uniform float u_rotation;

const float PHOENIX_P = -0.5;

vec3 iqPalette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
  return a + b * cos(6.28318530718 * (c * t + d));
}

vec3 getColor(float t, int index) {
  if (index == 0) {
    return iqPalette(t, vec3(0.5, 0.5, 0.5), vec3(0.5, 0.5, 0.5), vec3(1.0, 1.0, 1.0), vec3(0.00, 0.10, 0.20));
  } else if (index == 1) {
    return iqPalette(t, vec3(0.5, 0.5, 0.5), vec3(0.5, 0.5, 0.5), vec3(1.0, 1.0, 1.0), vec3(0.30, 0.20, 0.20));
  } else if (index == 2) {
    return iqPalette(t, vec3(0.5, 0.5, 0.5), vec3(0.5, 0.5, 0.5), vec3(1.0, 1.0, 0.5), vec3(0.80, 0.90, 0.30));
  } else if (index == 3) {
    return iqPalette(t, vec3(0.8, 0.5, 0.7), vec3(0.2, 0.4, 0.2), vec3(1.0, 1.0, 1.0), vec3(0.00, 0.25, 0.25));
  }
  return iqPalette(t, vec3(0.5, 0.5, 0.6), vec3(0.5, 0.5, 0.4), vec3(1.0, 1.0, 1.0), vec3(0.20, 0.25, 0.45));
}

vec3 gradientColor(float t) {
  t = clamp(t, 0.0, 1.0);
  if (u_gradientCount <= 1) return u_gradientColors[0];
  if (t <= u_gradientPositions[0]) return u_gradientColors[0];

  for (int i = 0; i < 4; i++) {
    if (i + 1 >= u_gradientCount) break;
    if (t <= u_gradientPositions[i + 1]) {
      float range = u_gradientPositions[i + 1] - u_gradientPositions[i];
      float localT = (range > 0.001) ? (t - u_gradientPositions[i]) / range : 0.0;
      return mix(u_gradientColors[i], u_gradientColors[i + 1], localT);
    }
  }

  if (u_gradientCount == 5) return u_gradientColors[4];
  if (u_gradientCount == 4) return u_gradientColors[3];
  if (u_gradientCount == 3) return u_gradientColors[2];
  return u_gradientColors[1];
}

vec2 complexPow(vec2 z, float n) {
  float r = length(z);
  if (r == 0.0) return vec2(0.0);
  float theta = atan(z.y, z.x);
  float rn = pow(r, n);
  float ntheta = n * theta;
  return vec2(rn * cos(ntheta), rn * sin(ntheta));
}

vec2 mapUVToComplex(vec2 uv) {
  float cos_r = cos(u_rotation);
  float sin_r = sin(u_rotation);
  vec2 rotated = vec2(uv.x * cos_r - uv.y * sin_r, uv.x * sin_r + uv.y * cos_r);
  return vec2(rotated.x / u_zoom + u_center.x, rotated.y / u_zoom + u_center.y);
}

float orbitTrapDistance(vec2 z) {
  vec2 delta = z - u_orbitTrapPoint;
  if (u_orbitTrapShape == 0) return length(delta);
  if (u_orbitTrapShape == 1) return min(abs(delta.x), abs(delta.y));
  return abs(length(delta) - u_orbitTrapRadius);
}

vec2 iterateStep(vec2 z, vec2 c, vec2 zPrev) {
  if (u_formula == 1) {
    vec2 ship = vec2(abs(z.x), abs(z.y));
    return complexPow(ship, u_power) + c;
  }
  if (u_formula == 2) {
    vec2 conjZ = vec2(z.x, -z.y);
    return complexPow(conjZ, u_power) + c;
  }
  if (u_formula == 3) {
    vec2 zn = complexPow(z, 2.0);
    return zn + c + PHOENIX_P * zPrev;
  }
  if (u_power == 2.0) {
    return vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
  }
  return complexPow(z, u_power) + c;
}

float escapeHeight(vec2 point) {
  vec2 z = u_isJulia ? point : vec2(0.0);
  vec2 c = u_isJulia ? u_juliaC : point;
  vec2 zPrev = vec2(0.0);
  float bailout = max(4.0, u_power * 2.0);

  for (int i = 0; i < 10000; i++) {
    if (i >= u_maxIterations) break;
    float zz = dot(z, z);
    if (zz > bailout) {
      float zn = sqrt(zz);
      float smoothIter = float(i) - log2(log2(max(zn, 1.00001))) / log2(max(u_power, 2.0)) + 4.0;
      return clamp(smoothIter / float(u_maxIterations), 0.0, 1.0);
    }
    vec2 nextZ = iterateStep(z, c, zPrev);
    zPrev = z;
    z = nextZ;
  }
  return 0.0;
}

vec3 applyLighting(vec3 baseColor, vec2 point) {
  if (!u_lightingEnabled) return baseColor;

  float minDim = min(u_resolution.x, u_resolution.y);
  float eps = max(0.0001, 1.0 / (u_zoom * minDim));
  float h = escapeHeight(point);
  float hx = escapeHeight(point + vec2(eps, 0.0));
  float hy = escapeHeight(point + vec2(0.0, eps));

  vec3 normal = normalize(vec3(h - hx, h - hy, 0.4));
  vec3 lightDir = normalize(vec3(
    cos(u_lightAzimuth) * cos(u_lightElevation),
    sin(u_lightAzimuth) * cos(u_lightElevation),
    sin(u_lightElevation)
  ));
  float diffuse = max(dot(normal, lightDir), 0.0);
  float ambient = 0.35;
  float lit = ambient + diffuse * max(u_lightIntensity, 0.0);
  return clamp(baseColor * lit, 0.0, 1.0);
}

vec3 colorAtComplex(vec2 point) {
  vec2 z = u_isJulia ? point : vec2(0.0);
  vec2 c = u_isJulia ? u_juliaC : point;
  vec2 zPrev = vec2(0.0);
  float bailout = max(4.0, u_power * 2.0);
  int iter = 0;
  float trapMin = 1e9;
  float stripeSum = 0.0;
  float tiaSum = 0.0;
  float atomMin = 1e9;
  float finalAngle = 0.0;
  float smoothIter = 0.0;
  bool escaped = false;

  for (int i = 0; i < 10000; i++) {
    if (i >= u_maxIterations) break;
    float zz = dot(z, z);
    if (zz > bailout) {
      escaped = true;
      float zn = sqrt(zz);
      smoothIter = float(i) - log2(log2(max(zn, 1.00001))) / log2(max(u_power, 2.0)) + 4.0;
      iter = i;
      break;
    }

    trapMin = min(trapMin, orbitTrapDistance(z));
    finalAngle = atan(z.y, z.x);
    stripeSum += 0.5 + 0.5 * sin(8.0 * finalAngle);
    atomMin = min(atomMin, zz);

    float zr = sqrt(zz);
    float cr = length(c);
    float denom = zr + cr;
    if (denom > 0.00001) {
      tiaSum += abs(zr - cr) / denom;
    }

    vec2 nextZ = iterateStep(z, c, zPrev);
    zPrev = z;
    z = nextZ;
    iter = i + 1;
  }

  vec3 color;
  if (!escaped && iter >= u_maxIterations) {
    if (u_insideColoring == 1) {
      float insideT = 0.5 + 0.5 * sin(6.0 * finalAngle);
      color = u_useCustomGradient ? gradientColor(insideT) : getColor(insideT, u_paletteIndex);
    } else if (u_insideColoring == 2) {
      float atomT = 1.0 / (1.0 + 12.0 * atomMin);
      color = u_useCustomGradient ? gradientColor(atomT) : getColor(atomT, u_paletteIndex);
    } else {
      color = vec3(0.0);
    }
    return color;
  }

  float smoothT = clamp(smoothIter / float(u_maxIterations), 0.0, 1.0);
  float modeT = smoothT;
  if (u_outsideColoring == 1) {
    float width = max(u_orbitTrapWidth, 0.0005);
    modeT = exp(-6.0 * trapMin / width);
  } else if (u_outsideColoring == 2) {
    modeT = fract(stripeSum / max(float(iter), 1.0));
  } else if (u_outsideColoring == 3) {
    modeT = mod(float(iter), 2.0);
  } else if (u_outsideColoring == 4) {
    modeT = fract(tiaSum / max(float(iter), 1.0));
  }

  float paletteT = (u_outsideColoring == 0) ? fract(smoothT * 4.0) : clamp(modeT, 0.0, 1.0);
  color = u_useCustomGradient ? gradientColor(paletteT) : getColor(paletteT, u_paletteIndex);
  return applyLighting(color, point);
}

vec3 colorAtUV(vec2 uv) {
  return colorAtComplex(mapUVToComplex(uv));
}

void main() {
  vec2 uv = (gl_FragCoord.xy - u_resolution * 0.5) / min(u_resolution.x, u_resolution.y);

  if (u_useSSAA) {
    float px = 1.0 / min(u_resolution.x, u_resolution.y);
    vec3 c1 = colorAtUV(uv + vec2(-0.25 * px, -0.25 * px));
    vec3 c2 = colorAtUV(uv + vec2(0.25 * px, -0.25 * px));
    vec3 c3 = colorAtUV(uv + vec2(-0.25 * px, 0.25 * px));
    vec3 c4 = colorAtUV(uv + vec2(0.25 * px, 0.25 * px));
    gl_FragColor = vec4((c1 + c2 + c3 + c4) * 0.25, 1.0);
  } else {
    gl_FragColor = vec4(colorAtUV(uv), 1.0);
  }
}
