/**
 * Isolated FRM-like stdlib v1 reference semantics.
 *
 * This module is deliberately not wired into the legacy evaluator, compiler, or
 * shader assembler. It is a browser-safe binary64 branch-reference for the
 * frozen formulas. Standard32 orbit/event evaluation belongs to the backend and
 * must round every specified primitive; boundary quantization alone is not an
 * oracle for binary32 intermediates.
 */

export interface FrmV1Complex {
  readonly re: number;
  readonly im: number;
}

export type FrmV1NonFiniteEvent = "nonFinite";

export interface FrmV1ResultClassification {
  readonly finite: boolean;
  readonly event?: FrmV1NonFiniteEvent;
}

export interface FrmV1Standard32Evaluation {
  readonly value: FrmV1Complex;
  readonly classification: FrmV1ResultClassification;
}

/** The complete frozen stdlib function-name surface for `@stdlib: 1`. */
export const FRM_V1_STDLIB_NAMES = Object.freeze([
  "abs",
  "sqr",
  "sqrt",
  "exp",
  "log",
  "recip",
  "conj",
  "flip",
  "real",
  "imag",
  "cabs",
  "round",
  "atan2",
  "sin",
  "cos",
  "tan",
  "asin",
  "acos",
  "atan",
  "sinh",
  "cosh",
  "tanh",
  "asinh",
  "acosh",
  "atanh",
  "cotanh",
  "cosxx",
] as const);

export type FrmV1StdlibName = (typeof FRM_V1_STDLIB_NAMES)[number];
export const FRM_V1_UNARY_FUNCTION_NAMES = Object.freeze(
  FRM_V1_STDLIB_NAMES.filter(
    (name): name is Exclude<FrmV1StdlibName, "atan2"> => name !== "atan2",
  ),
);
export type FrmV1UnaryFunctionName =
  (typeof FRM_V1_UNARY_FUNCTION_NAMES)[number];
export const FRM_V1_FUNCTION_SLOT_NAMES = Object.freeze([
  "fn1",
  "fn2",
  "fn3",
  "fn4",
] as const);
export type FrmV1FunctionSlot = (typeof FRM_V1_FUNCTION_SLOT_NAMES)[number];
export type FrmV1ResolvedFunctionSlots = Readonly<
  Partial<Record<FrmV1FunctionSlot, FrmV1UnaryFunctionName>>
>;

export function resolveFrmV1FunctionSlot(
  slot: FrmV1FunctionSlot,
  mappings: FrmV1ResolvedFunctionSlots,
): FrmV1UnaryFunctionName | undefined {
  return mappings[slot];
}

const PI = Math.PI;
const ONE: FrmV1Complex = Object.freeze({ re: 1, im: 0 });
const I: FrmV1Complex = Object.freeze({ re: 0, im: 1 });

export function frmV1Complex(re: number, im = 0): FrmV1Complex {
  return { re, im };
}

export function frmV1Classify(value: FrmV1Complex): FrmV1ResultClassification {
  return Number.isFinite(value.re) && Number.isFinite(value.im)
    ? { finite: true }
    : { finite: false, event: "nonFinite" };
}

export function frmV1Add(a: FrmV1Complex, b: FrmV1Complex): FrmV1Complex {
  return { re: a.re + b.re, im: a.im + b.im };
}

export function frmV1Sub(a: FrmV1Complex, b: FrmV1Complex): FrmV1Complex {
  return { re: a.re - b.re, im: a.im - b.im };
}

export function frmV1Mul(a: FrmV1Complex, b: FrmV1Complex): FrmV1Complex {
  return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re };
}

/** Division intentionally has no zero-denominator repair: non-finite values are events. */
export function frmV1Div(a: FrmV1Complex, b: FrmV1Complex): FrmV1Complex {
  const denominator = b.re * b.re + b.im * b.im;
  return {
    re: (a.re * b.re + a.im * b.im) / denominator,
    im: (a.im * b.re - a.re * b.im) / denominator,
  };
}

export function frmV1Sqr(z: FrmV1Complex): FrmV1Complex {
  return frmV1Mul(z, z);
}

/** Principal argument with exact signed zero canonicalized to +0 for standard32. */
export function frmV1Arg(z: FrmV1Complex): number {
  const imaginary = z.im === 0 ? 0 : z.im;
  const angle = Math.atan2(imaginary, z.re);
  return angle === -PI ? PI : angle;
}

/** Principal log. In particular, log(0) remains non-finite rather than clamped. */
export function frmV1Log(z: FrmV1Complex): FrmV1Complex {
  return { re: Math.log(Math.hypot(z.re, z.im)), im: frmV1Arg(z) };
}

/** Principal square root; exact +/-0 imaginary inputs use the canonical upper cut. */
export function frmV1Sqrt(z: FrmV1Complex): FrmV1Complex {
  const radius = Math.hypot(z.re, z.im);
  const real = Math.sqrt((radius + z.re) / 2);
  const imaginaryMagnitude = Math.sqrt((radius - z.re) / 2);
  const negativeImaginary = z.im < 0;
  return {
    re: real,
    im: negativeImaginary ? -imaginaryMagnitude : imaginaryMagnitude,
  };
}

export function frmV1Exp(z: FrmV1Complex): FrmV1Complex {
  const scale = Math.exp(z.re);
  return { re: scale * Math.cos(z.im), im: scale * Math.sin(z.im) };
}

export function frmV1Recip(z: FrmV1Complex): FrmV1Complex {
  return frmV1Div(ONE, z);
}

export function frmV1Conj(z: FrmV1Complex): FrmV1Complex {
  return { re: z.re, im: -z.im };
}

export function frmV1Flip(z: FrmV1Complex): FrmV1Complex {
  return { re: -z.im, im: z.re };
}

export function frmV1Real(z: FrmV1Complex): FrmV1Complex {
  return { re: z.re, im: 0 };
}

export function frmV1Imag(z: FrmV1Complex): FrmV1Complex {
  return { re: z.im, im: 0 };
}

/** `abs` is componentwise for complex values. */
export function frmV1Abs(z: FrmV1Complex): FrmV1Complex {
  return { re: Math.abs(z.re), im: Math.abs(z.im) };
}

/** `cabs` is the scalar complex modulus. */
export function frmV1Cabs(z: FrmV1Complex): FrmV1Complex {
  return { re: Math.hypot(z.re, z.im), im: 0 };
}

export function frmV1RoundComponent(value: number): number {
  return value < 0 ? Math.ceil(value - 0.5) : Math.floor(value + 0.5);
}

/** Componentwise deterministic round: exact halves always go away from zero. */
export function frmV1Round(z: FrmV1Complex): FrmV1Complex {
  return { re: frmV1RoundComponent(z.re), im: frmV1RoundComponent(z.im) };
}

export function frmV1Atan2(y: FrmV1Complex, x: FrmV1Complex): FrmV1Complex {
  return { re: Math.atan2(y.re, x.re), im: 0 };
}

export function frmV1Sin(z: FrmV1Complex): FrmV1Complex {
  return {
    re: Math.sin(z.re) * Math.cosh(z.im),
    im: Math.cos(z.re) * Math.sinh(z.im),
  };
}

export function frmV1Cos(z: FrmV1Complex): FrmV1Complex {
  return {
    re: Math.cos(z.re) * Math.cosh(z.im),
    im: -Math.sin(z.re) * Math.sinh(z.im),
  };
}

/** Fractint compatibility cosine with its historical positive imaginary term. */
export function frmV1Cosxx(z: FrmV1Complex): FrmV1Complex {
  return {
    re: Math.cos(z.re) * Math.cosh(z.im),
    im: Math.sin(z.re) * Math.sinh(z.im),
  };
}

export function frmV1Tan(z: FrmV1Complex): FrmV1Complex {
  return frmV1Div(frmV1Sin(z), frmV1Cos(z));
}

export function frmV1Sinh(z: FrmV1Complex): FrmV1Complex {
  return {
    re: Math.sinh(z.re) * Math.cos(z.im),
    im: Math.cosh(z.re) * Math.sin(z.im),
  };
}

export function frmV1Cosh(z: FrmV1Complex): FrmV1Complex {
  return {
    re: Math.cosh(z.re) * Math.cos(z.im),
    im: Math.sinh(z.re) * Math.sin(z.im),
  };
}

export function frmV1Tanh(z: FrmV1Complex): FrmV1Complex {
  return frmV1Div(frmV1Sinh(z), frmV1Cosh(z));
}

export function frmV1Cotanh(z: FrmV1Complex): FrmV1Complex {
  return frmV1Div(frmV1Cosh(z), frmV1Sinh(z));
}

export function frmV1Asin(z: FrmV1Complex): FrmV1Complex {
  const iz = frmV1Mul(I, z);
  const radicand = frmV1Sub(ONE, frmV1Sqr(z));
  return frmV1Mul(
    { re: 0, im: -1 },
    frmV1Log(frmV1Add(iz, frmV1Sqrt(radicand))),
  );
}

export function frmV1Acos(z: FrmV1Complex): FrmV1Complex {
  const asin = frmV1Asin(z);
  return { re: PI / 2 - asin.re, im: -asin.im };
}

export function frmV1Atan(z: FrmV1Complex): FrmV1Complex {
  const iz = frmV1Mul(I, z);
  const numerator = frmV1Sub(
    frmV1Log(frmV1Add(ONE, iz)),
    frmV1Log(frmV1Sub(ONE, iz)),
  );
  return frmV1Div(numerator, { re: 0, im: 2 });
}

export function frmV1Asinh(z: FrmV1Complex): FrmV1Complex {
  return frmV1Log(frmV1Add(z, frmV1Sqrt(frmV1Add(frmV1Sqr(z), ONE))));
}

export function frmV1Acosh(z: FrmV1Complex): FrmV1Complex {
  const product = frmV1Mul(
    frmV1Sqrt(frmV1Sub(z, ONE)),
    frmV1Sqrt(frmV1Add(z, ONE)),
  );
  return frmV1Log(frmV1Add(z, product));
}

export function frmV1Atanh(z: FrmV1Complex): FrmV1Complex {
  const difference = frmV1Sub(
    frmV1Log(frmV1Add(ONE, z)),
    frmV1Log(frmV1Sub(ONE, z)),
  );
  return { re: difference.re / 2, im: difference.im / 2 };
}

/** Quantizes exactly at this explicit CPU/profile boundary, not as fake GPU identity. */
export function frmV1QuantizeStandard32(z: FrmV1Complex): FrmV1Complex {
  const real = Math.fround(z.re);
  const imaginary = Math.fround(z.im);
  return {
    re: real === 0 ? 0 : real,
    im: imaginary === 0 ? 0 : imaginary,
  };
}

/**
 * Quantizes only the public input/output boundary of a reference operation.
 * This helper is useful for tolerance fixtures but MUST NOT be used or described
 * as the standard32 CPU execution oracle.
 */
export function frmV1QuantizeStandard32Boundary(
  operation: (...args: FrmV1Complex[]) => FrmV1Complex,
  ...args: FrmV1Complex[]
): FrmV1Standard32Evaluation {
  const value = frmV1QuantizeStandard32(
    operation(...args.map(frmV1QuantizeStandard32)),
  );
  return { value, classification: frmV1Classify(value) };
}

export function frmV1Standard32Close(
  actual: FrmV1Complex,
  expected: FrmV1Complex,
  tolerance = 1e-5,
): boolean {
  const close = (a: number, b: number) =>
    Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(a), Math.abs(b));
  return close(actual.re, expected.re) && close(actual.im, expected.im);
}
