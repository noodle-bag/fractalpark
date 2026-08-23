/** Numeric helpers injected only into the 26a recovered native formulas. */
export const RECOVERED_TRANSCENDENTAL_MATH_GLSL_V1 = String.raw`
float recoveredRoundAwayFromZero(float value) {
  return value < 0.0 ? ceil(value - 0.5) : floor(value + 0.5);
}
vec2 recoveredQuantize(vec2 z, float scale) {
  vec2 scaled = z * scale;
  return vec2(
    recoveredRoundAwayFromZero(scaled.x),
    recoveredRoundAwayFromZero(scaled.y)
  ) / scale;
}
float recoveredStableHypot(vec2 z) {
  vec2 magnitude = abs(z);
  float scale = max(magnitude.x, magnitude.y);
  if (scale == 0.0) return 0.0;
  vec2 normalized = magnitude / scale;
  return scale * sqrt(normalized.x * normalized.x + normalized.y * normalized.y);
}
float recoveredStableExpReal(float value) {
  float reduced = value / 256.0;
  float term = 1.0;
  float sum = 1.0;
  term = term * reduced; term = term / 1.0; sum = sum + term;
  term = term * reduced; term = term / 2.0; sum = sum + term;
  term = term * reduced; term = term / 3.0; sum = sum + term;
  term = term * reduced; term = term / 4.0; sum = sum + term;
  term = term * reduced; term = term / 5.0; sum = sum + term;
  term = term * reduced; term = term / 6.0; sum = sum + term;
  term = term * reduced; term = term / 7.0; sum = sum + term;
  term = term * reduced; term = term / 8.0; sum = sum + term;
  sum = sum * sum;
  sum = sum * sum;
  sum = sum * sum;
  sum = sum * sum;
  sum = sum * sum;
  sum = sum * sum;
  sum = sum * sum;
  sum = sum * sum;
  return sum;
}
vec2 recoveredStableSinCos(float value) {
  float tau = 6.283185307179586;
  float quotient = value / tau;
  float turns = quotient < 0.0 ? ceil(quotient - 0.5) : floor(quotient + 0.5);
  float reduced = value - turns * tau;
  float x = reduced / 4.0;
  float x2 = x * x;
  float sineTerm = x;
  float sineValue = x;
  sineTerm = sineTerm * -x2; sineTerm = sineTerm / 6.0; sineValue = sineValue + sineTerm;
  sineTerm = sineTerm * -x2; sineTerm = sineTerm / 20.0; sineValue = sineValue + sineTerm;
  sineTerm = sineTerm * -x2; sineTerm = sineTerm / 42.0; sineValue = sineValue + sineTerm;
  sineTerm = sineTerm * -x2; sineTerm = sineTerm / 72.0; sineValue = sineValue + sineTerm;
  sineTerm = sineTerm * -x2; sineTerm = sineTerm / 110.0; sineValue = sineValue + sineTerm;
  sineTerm = sineTerm * -x2; sineTerm = sineTerm / 156.0; sineValue = sineValue + sineTerm;
  float cosineTerm = 1.0;
  float cosineValue = 1.0;
  cosineTerm = cosineTerm * -x2; cosineTerm = cosineTerm / 2.0; cosineValue = cosineValue + cosineTerm;
  cosineTerm = cosineTerm * -x2; cosineTerm = cosineTerm / 12.0; cosineValue = cosineValue + cosineTerm;
  cosineTerm = cosineTerm * -x2; cosineTerm = cosineTerm / 30.0; cosineValue = cosineValue + cosineTerm;
  cosineTerm = cosineTerm * -x2; cosineTerm = cosineTerm / 56.0; cosineValue = cosineValue + cosineTerm;
  cosineTerm = cosineTerm * -x2; cosineTerm = cosineTerm / 90.0; cosineValue = cosineValue + cosineTerm;
  cosineTerm = cosineTerm * -x2; cosineTerm = cosineTerm / 132.0; cosineValue = cosineValue + cosineTerm;
  float doubledSine = 2.0 * sineValue; doubledSine = doubledSine * cosineValue;
  float cosineSquared = cosineValue * cosineValue;
  float sineSquared = sineValue * sineValue;
  float doubledCosine = cosineSquared - sineSquared;
  sineValue = doubledSine; cosineValue = doubledCosine;
  doubledSine = 2.0 * sineValue; doubledSine = doubledSine * cosineValue;
  cosineSquared = cosineValue * cosineValue;
  sineSquared = sineValue * sineValue;
  doubledCosine = cosineSquared - sineSquared;
  return vec2(doubledSine, doubledCosine);
}
float recoveredSinhReal(float x) {
  x = clamp(x, -80.0, 80.0);
  return (recoveredStableExpReal(x) - recoveredStableExpReal(-x)) * 0.5;
}
float recoveredCoshReal(float x) {
  x = clamp(x, -80.0, 80.0);
  return (recoveredStableExpReal(x) + recoveredStableExpReal(-x)) * 0.5;
}
vec2 recoveredExp(vec2 z) {
  float scale = recoveredStableExpReal(z.x);
  vec2 sinCos = recoveredStableSinCos(z.y);
  return vec2(scale * sinCos.y, scale * sinCos.x);
}
vec2 recoveredLog(vec2 z) {
  return vec2(log(max(recoveredStableHypot(z), 1e-20)), atan(z.y, z.x));
}
vec2 recoveredSin(vec2 z) {
  vec2 sinCos = recoveredStableSinCos(z.x);
  return vec2(sinCos.x * recoveredCoshReal(z.y), sinCos.y * recoveredSinhReal(z.y));
}
vec2 recoveredCos(vec2 z) {
  vec2 sinCos = recoveredStableSinCos(z.x);
  return vec2(sinCos.y * recoveredCoshReal(z.y), -sinCos.x * recoveredSinhReal(z.y));
}
vec2 recoveredSinhVec(vec2 z) {
  vec2 sinCos = recoveredStableSinCos(z.y);
  return vec2(recoveredSinhReal(z.x) * sinCos.y, recoveredCoshReal(z.x) * sinCos.x);
}
vec2 recoveredCoshVec(vec2 z) {
  vec2 sinCos = recoveredStableSinCos(z.y);
  return vec2(recoveredCoshReal(z.x) * sinCos.y, recoveredSinhReal(z.x) * sinCos.x);
}
vec2 recoveredPow(vec2 z, float exponent) {
  float radius = recoveredStableHypot(z);
  if (radius == 0.0) return vec2(0.0);
  float angle = atan(z.y, z.x);
  float poweredRadius = pow(radius, exponent);
  vec2 sinCos = recoveredStableSinCos(exponent * angle);
  return vec2(poweredRadius * sinCos.y, poweredRadius * sinCos.x);
}
`;
