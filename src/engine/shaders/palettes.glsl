vec3 iqPalette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
  return a + b * cos(6.28318530718 * (c * t + d));
}

vec3 palette5(float t, vec3 c0, vec3 c1, vec3 c2, vec3 c3, vec3 c4) {
  float x = clamp(t, 0.0, 1.0) * 4.0;
  if (x < 1.0) return mix(c0, c1, x);
  if (x < 2.0) return mix(c1, c2, x - 1.0);
  if (x < 3.0) return mix(c2, c3, x - 2.0);
  return mix(c3, c4, x - 3.0);
}

vec3 getColor(float t, int index) {
  if (index == 0) return iqPalette(t, vec3(0.5,0.5,0.5), vec3(0.5,0.5,0.5), vec3(1.0,1.0,1.0), vec3(0.00,0.10,0.20));
  else if (index == 1) return iqPalette(t, vec3(0.5,0.5,0.5), vec3(0.5,0.5,0.5), vec3(1.0,1.0,1.0), vec3(0.30,0.20,0.20));
  else if (index == 2) return iqPalette(t, vec3(0.5,0.5,0.5), vec3(0.5,0.5,0.5), vec3(1.0,1.0,0.5), vec3(0.80,0.90,0.30));
  else if (index == 3) return iqPalette(t, vec3(0.8,0.5,0.7), vec3(0.2,0.4,0.2), vec3(1.0,1.0,1.0), vec3(0.00,0.25,0.25));
  else if (index == 5) return palette5(t, vec3(0.000,0.000,0.016), vec3(0.318,0.071,0.486), vec3(0.718,0.216,0.475), vec3(0.988,0.537,0.380), vec3(0.988,0.992,0.749));
  else if (index == 6) return palette5(t, vec3(0.267,0.004,0.329), vec3(0.231,0.322,0.545), vec3(0.129,0.569,0.549), vec3(0.369,0.788,0.384), vec3(0.992,0.906,0.145));
  else if (index == 7) return palette5(t, vec3(0.004,0.098,0.349), vec3(0.094,0.353,0.451), vec3(0.510,0.510,0.192), vec3(0.827,0.608,0.451), vec3(0.980,0.800,0.980));
  else if (index == 8) return palette5(t, vec3(0.000), vec3(0.420,0.000,0.082), vec3(0.827,0.184,0.000), vec3(1.000,0.690,0.000), vec3(1.000));
  else if (index == 9) return palette5(t, vec3(0.012,0.020,0.102), vec3(0.063,0.184,0.341), vec3(0.031,0.498,0.549), vec3(0.404,0.780,0.647), vec3(0.953,0.902,0.741));
  else if (index == 10) return palette5(t, vec3(0.886,0.851,0.886), vec3(0.384,0.463,0.729), vec3(0.188,0.078,0.216), vec3(0.690,0.290,0.353), vec3(0.886,0.851,0.886));
  else if (index == 11) return palette5(t, vec3(0.451,0.224,0.341), vec3(0.302,0.533,0.725), vec3(0.541,0.776,0.647), vec3(0.843,0.702,0.361), vec3(0.451,0.224,0.341));
  else if (index == 12) return palette5(t, vec3(0.000,0.071,0.376), vec3(0.392,0.561,0.769), vec3(0.925,0.898,0.875), vec3(0.776,0.427,0.341), vec3(0.349,0.000,0.031));
  else if (index == 13) return palette5(t, vec3(0.608,0.173,0.259), vec3(0.302,0.090,0.153), vec3(0.067,0.094,0.153), vec3(0.086,0.306,0.388), vec3(0.294,0.639,0.647));
  else if (index == 14) return palette5(t, vec3(0.035,0.031,0.024), vec3(0.286,0.145,0.102), vec3(0.706,0.353,0.196), vec3(0.290,0.651,0.608), vec3(0.851,0.847,0.678));
  else if (index == 15) return palette5(t, vec3(0.027,0.078,0.149), vec3(0.204,0.294,0.608), vec3(0.545,0.294,0.710), vec3(0.208,0.816,0.627), vec3(0.910,1.000,0.604));
  else if (index == 16) return palette5(t, vec3(0.027,0.102,0.176), vec3(0.157,0.314,0.435), vec3(0.525,0.651,0.667), vec3(0.941,0.933,0.898), vec3(0.784,0.663,0.420));
  return iqPalette(t, vec3(0.5,0.5,0.6), vec3(0.5,0.5,0.4), vec3(1.0,1.0,1.0), vec3(0.20,0.25,0.45));
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
