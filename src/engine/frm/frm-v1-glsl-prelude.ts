/**
 * Isolated GLSL source for the FRM-like stdlib v1 contract.
 *
 * It is intentionally unintegrated: no legacy shader source imports this prelude
 * yet. In particular, inverse functions use frmV1Log directly and never the
 * legacy radius-clamping log helper.
 */
export const FRM_V1_GLSL_PRELUDE = String.raw`
bool frmV1NonFiniteEvent = false;
float frmV1CanonicalZero(float value) { return value == 0.0 ? 0.0 : value; }
bool frmV1FiniteComponent(float value) {
  return value == value && abs(value) <= 3.402823466e38;
}
vec2 frmV1Checked(vec2 value) {
  if (!frmV1FiniteComponent(value.x) || !frmV1FiniteComponent(value.y)) {
    frmV1NonFiniteEvent = true;
    return vec2(0.0);
  }
  return vec2(frmV1CanonicalZero(value.x), frmV1CanonicalZero(value.y));
}
vec2 frmV1Add(vec2 a, vec2 b) { return frmV1Checked(a + b); }
vec2 frmV1Sub(vec2 a, vec2 b) { return frmV1Checked(a - b); }
vec2 frmV1Mul(vec2 a, vec2 b) {
  return frmV1Checked(vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x));
}
vec2 frmV1Div(vec2 a, vec2 b) {
  float d = dot(b, b);
  if (d == 0.0 || !frmV1FiniteComponent(d)) {
    frmV1NonFiniteEvent = true;
    return vec2(0.0);
  }
  return frmV1Checked(vec2(a.x * b.x + a.y * b.y, a.y * b.x - a.x * b.y) / d);
}
vec2 frmV1Sqr(vec2 z) { return frmV1Mul(z, z); }
float frmV1Radius(vec2 z) {
  vec2 magnitude = abs(z);
  float scale = max(magnitude.x, magnitude.y);
  if (scale == 0.0) return 0.0;
  vec2 normalized = magnitude / scale;
  return scale * sqrt(normalized.x * normalized.x + normalized.y * normalized.y);
}
float frmV1Arg(vec2 z) {
  float imaginary = z.y == 0.0 ? 0.0 : z.y;
  if (imaginary == 0.0 && z.x < 0.0) return 3.14159265358979323846;
  return atan(imaginary, z.x);
}
vec2 frmV1Log(vec2 z) {
  float radius = frmV1Radius(z);
  if (radius == 0.0 || !frmV1FiniteComponent(radius)) {
    frmV1NonFiniteEvent = true;
    return vec2(0.0);
  }
  return frmV1Checked(vec2(log(radius), frmV1Arg(z)));
}
vec2 frmV1Sqrt(vec2 z) {
  float radius = frmV1Radius(z);
  float real = sqrt((radius + z.x) * 0.5);
  float imaginaryMagnitude = sqrt((radius - z.x) * 0.5);
  float imaginary = z.y < 0.0 ? -imaginaryMagnitude : imaginaryMagnitude;
  return frmV1Checked(vec2(real, imaginary));
}
float frmV1StableExpReal(float value) {
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
vec2 frmV1StableSinCos(float value) {
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
vec2 frmV1Exp(vec2 z) {
  float scale = frmV1StableExpReal(z.x);
  vec2 sinCos = frmV1StableSinCos(z.y);
  return frmV1Checked(vec2(scale * sinCos.y, scale * sinCos.x));
}
vec2 frmV1Recip(vec2 z) { return frmV1Div(vec2(1.0, 0.0), z); }
vec2 frmV1Conj(vec2 z) { return frmV1Checked(vec2(z.x, -z.y)); }
vec2 frmV1Flip(vec2 z) { return frmV1Checked(vec2(z.y, z.x)); }
vec2 frmV1Identity(vec2 z) { return frmV1Checked(z); }
vec2 frmV1Real(vec2 z) { return frmV1Checked(vec2(z.x, 0.0)); }
vec2 frmV1Imag(vec2 z) { return frmV1Checked(vec2(z.y, 0.0)); }
vec2 frmV1Abs(vec2 z) { return frmV1Checked(abs(z)); }
vec2 frmV1Cabs(vec2 z) { return frmV1Checked(vec2(frmV1Radius(z), 0.0)); }
float frmV1RoundComponent(float value) {
  return value < 0.0 ? ceil(value - 0.5) : floor(value + 0.5);
}
vec2 frmV1Round(vec2 z) {
  return frmV1Checked(vec2(frmV1RoundComponent(z.x), frmV1RoundComponent(z.y)));
}
vec2 frmV1Atan2(vec2 y, vec2 x) {
  float yy = y.x == 0.0 ? 0.0 : y.x;
  float xx = x.x == 0.0 ? 0.0 : x.x;
  if (yy == 0.0 && xx == 0.0) return vec2(0.0);
  if (yy == 0.0 && xx < 0.0) return vec2(3.14159265358979323846, 0.0);
  return frmV1Checked(vec2(atan(yy, xx), 0.0));
}
float frmV1SinhReal(float value) {
  return (frmV1StableExpReal(value) - frmV1StableExpReal(-value)) * 0.5;
}
float frmV1CoshReal(float value) {
  return (frmV1StableExpReal(value) + frmV1StableExpReal(-value)) * 0.5;
}
vec2 frmV1Sin(vec2 z) {
  vec2 sinCos = frmV1StableSinCos(z.x);
  return frmV1Checked(vec2(sinCos.x * frmV1CoshReal(z.y), sinCos.y * frmV1SinhReal(z.y)));
}
vec2 frmV1Cos(vec2 z) {
  vec2 sinCos = frmV1StableSinCos(z.x);
  return frmV1Checked(vec2(sinCos.y * frmV1CoshReal(z.y), -sinCos.x * frmV1SinhReal(z.y)));
}
vec2 frmV1Cosxx(vec2 z) {
  vec2 sinCos = frmV1StableSinCos(z.x);
  return frmV1Checked(vec2(sinCos.y * frmV1CoshReal(z.y), sinCos.x * frmV1SinhReal(z.y)));
}
vec2 frmV1Tan(vec2 z) { return frmV1Div(frmV1Sin(z), frmV1Cos(z)); }
vec2 frmV1Sinh(vec2 z) {
  vec2 sinCos = frmV1StableSinCos(z.y);
  return frmV1Checked(vec2(frmV1SinhReal(z.x) * sinCos.y, frmV1CoshReal(z.x) * sinCos.x));
}
vec2 frmV1Cosh(vec2 z) {
  vec2 sinCos = frmV1StableSinCos(z.y);
  return frmV1Checked(vec2(frmV1CoshReal(z.x) * sinCos.y, frmV1SinhReal(z.x) * sinCos.x));
}
vec2 frmV1Tanh(vec2 z) { return frmV1Div(frmV1Sinh(z), frmV1Cosh(z)); }
vec2 frmV1Cotanh(vec2 z) { return frmV1Div(frmV1Cosh(z), frmV1Sinh(z)); }
vec2 frmV1Asin(vec2 z) {
  vec2 iz = frmV1Mul(vec2(0.0, 1.0), z);
  vec2 root = frmV1Sqrt(frmV1Sub(vec2(1.0, 0.0), frmV1Sqr(z)));
  return frmV1Mul(vec2(0.0, -1.0), frmV1Log(frmV1Add(iz, root)));
}
vec2 frmV1Acos(vec2 z) {
  vec2 value = frmV1Asin(z);
  return frmV1Checked(vec2(1.57079632679489661923 - value.x, -value.y));
}
vec2 frmV1Atan(vec2 z) {
  vec2 iz = frmV1Mul(vec2(0.0, 1.0), z);
  return frmV1Div(
    frmV1Sub(frmV1Log(frmV1Add(vec2(1.0, 0.0), iz)), frmV1Log(frmV1Sub(vec2(1.0, 0.0), iz))),
    vec2(0.0, 2.0)
  );
}
vec2 frmV1Asinh(vec2 z) {
  return frmV1Log(frmV1Add(z, frmV1Sqrt(frmV1Add(frmV1Sqr(z), vec2(1.0, 0.0)))));
}
vec2 frmV1Acosh(vec2 z) {
  vec2 product = frmV1Mul(
    frmV1Sqrt(frmV1Sub(z, vec2(1.0, 0.0))),
    frmV1Sqrt(frmV1Add(z, vec2(1.0, 0.0)))
  );
  return frmV1Log(frmV1Add(z, product));
}
vec2 frmV1Atanh(vec2 z) {
  return frmV1Checked(frmV1Sub(frmV1Log(frmV1Add(vec2(1.0, 0.0), z)), frmV1Log(frmV1Sub(vec2(1.0, 0.0), z))) * 0.5);
}
`;
