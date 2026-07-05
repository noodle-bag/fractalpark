vec3 iqPalette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
  return a + b * cos(6.28318530718 * (c * t + d));
}

vec3 getColor(float t, int index) {
  if (index == 0) return iqPalette(t, vec3(0.5,0.5,0.5), vec3(0.5,0.5,0.5), vec3(1.0,1.0,1.0), vec3(0.00,0.10,0.20));
  else if (index == 1) return iqPalette(t, vec3(0.5,0.5,0.5), vec3(0.5,0.5,0.5), vec3(1.0,1.0,1.0), vec3(0.30,0.20,0.20));
  else if (index == 2) return iqPalette(t, vec3(0.5,0.5,0.5), vec3(0.5,0.5,0.5), vec3(1.0,1.0,0.5), vec3(0.80,0.90,0.30));
  else if (index == 3) return iqPalette(t, vec3(0.8,0.5,0.7), vec3(0.2,0.4,0.2), vec3(1.0,1.0,1.0), vec3(0.00,0.25,0.25));
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
