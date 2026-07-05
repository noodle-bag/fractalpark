vec2 complexPow(vec2 z, float n) {
  float r = length(z);
  if (r == 0.0) return vec2(0.0);
  float theta = atan(z.y, z.x);
  float rn = pow(r, n);
  float ntheta = n * theta;
  return vec2(rn * cos(ntheta), rn * sin(ntheta));
}

vec2 complexMul(vec2 a, vec2 b) {
  return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

vec2 complexDiv(vec2 a, vec2 b) {
  float d = dot(b, b);
  if (d == 0.0) return vec2(0.0);
  return vec2(a.x * b.x + a.y * b.y, a.y * b.x - a.x * b.y) / d;
}

vec2 complexSqr(vec2 z) {
  return vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y);
}

vec2 complexConj(vec2 z) { return vec2(z.x, -z.y); }

float complexCosh(float x) {
  x = clamp(x, -80.0, 80.0);
  return (exp(x) + exp(-x)) * 0.5;
}
float complexSinh(float x) {
  x = clamp(x, -80.0, 80.0);
  return (exp(x) - exp(-x)) * 0.5;
}

vec2 complexExp(vec2 z) {
  float er = exp(z.x);
  return vec2(er * cos(z.y), er * sin(z.y));
}

vec2 complexLog(vec2 z) {
  return vec2(log(max(length(z), 1e-20)), atan(z.y, z.x));
}

vec2 complexSin(vec2 z) {
  return vec2(sin(z.x) * complexCosh(z.y), cos(z.x) * complexSinh(z.y));
}

vec2 complexCos(vec2 z) {
  return vec2(cos(z.x) * complexCosh(z.y), -sin(z.x) * complexSinh(z.y));
}

vec2 complexTan(vec2 z) {
  return complexDiv(complexSin(z), complexCos(z));
}

vec2 complexSinhVec(vec2 z) {
  return vec2(complexSinh(z.x) * cos(z.y), complexCosh(z.x) * sin(z.y));
}

vec2 complexCoshVec(vec2 z) {
  return vec2(complexCosh(z.x) * cos(z.y), complexSinh(z.x) * sin(z.y));
}
