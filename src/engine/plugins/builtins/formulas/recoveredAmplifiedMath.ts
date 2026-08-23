/** Numeric helpers injected only into the 26b recovered native formulas. */
export const RECOVERED_AMPLIFIED_MATH_GLSL_V1 = String.raw`
float recoveredAmplifiedRoundAwayFromZero(float value) {
  return value < 0.0 ? ceil(value - 0.5) : floor(value + 0.5);
}
vec2 recoveredAmplifiedQuantize(vec2 z, float scale) {
  vec2 scaled = z * scale;
  return vec2(
    recoveredAmplifiedRoundAwayFromZero(scaled.x),
    recoveredAmplifiedRoundAwayFromZero(scaled.y)
  ) / scale;
}
vec2 recoveredAmplifiedIntegerPower(vec2 base, float exponent) {
  vec2 result = vec2(1.0, 0.0);
  for (int index = 0; index < 16; index++) {
    if (float(index) >= exponent) break;
    result = complexMul(result, base);
  }
  return result;
}
float recoveredAmplifiedStableExpReal(float value) {
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
vec2 recoveredAmplifiedStableSinCos(float value) {
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
float recoveredAmplifiedSinhReal(float value) {
  value = clamp(value, -80.0, 80.0);
  return (recoveredAmplifiedStableExpReal(value) - recoveredAmplifiedStableExpReal(-value)) * 0.5;
}
float recoveredAmplifiedCoshReal(float value) {
  value = clamp(value, -80.0, 80.0);
  return (recoveredAmplifiedStableExpReal(value) + recoveredAmplifiedStableExpReal(-value)) * 0.5;
}
vec2 recoveredAmplifiedExp(vec2 z) {
  float scale = recoveredAmplifiedStableExpReal(z.x);
  vec2 sinCos = recoveredAmplifiedStableSinCos(z.y);
  return vec2(scale * sinCos.y, scale * sinCos.x);
}
vec2 recoveredAmplifiedSinhVec(vec2 z) {
  vec2 sinCos = recoveredAmplifiedStableSinCos(z.y);
  return vec2(
    recoveredAmplifiedSinhReal(z.x) * sinCos.y,
    recoveredAmplifiedCoshReal(z.x) * sinCos.x
  );
}
vec2 recoveredAmplifiedCoshVec(vec2 z) {
  vec2 sinCos = recoveredAmplifiedStableSinCos(z.y);
  return vec2(
    recoveredAmplifiedCoshReal(z.x) * sinCos.y,
    recoveredAmplifiedSinhReal(z.x) * sinCos.x
  );
}
`;
