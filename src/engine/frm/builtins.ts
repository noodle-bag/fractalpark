export const PARAMETER_NAMES = ['p1', 'p2', 'p3', 'p4', 'p5'] as const;
export const FN_SLOT_NAMES = ['fn1', 'fn2', 'fn3', 'fn4'] as const;
export const LEGACY_BUILTIN_NAMES = ['LastSqr', 'pi', 'e', 'maxit', 'ismand'] as const;

export type ParameterName = typeof PARAMETER_NAMES[number];
export type FnSlotName = typeof FN_SLOT_NAMES[number];
export type LegacyBuiltinName = typeof LEGACY_BUILTIN_NAMES[number];

export interface FnSlotOption {
  value: number;
  key: string;
  label: string;
}

export const KNOWN_FUNCTION_NAMES = [
  'sin',
  'cos',
  'tan',
  'sinh',
  'cosh',
  'tanh',
  'exp',
  'log',
  'sqrt',
  'abs',
  'sqr',
  'conj',
  'flip',
  'recip',
  'cabs',
  'real',
  'imag',
  'atan2',
  ...FN_SLOT_NAMES,
] as const;

export const FN_SLOT_OPTIONS: FnSlotOption[] = [
  { value: 0, key: 'identity', label: 'Identity' },
  { value: 1, key: 'sin', label: 'sin' },
  { value: 2, key: 'cos', label: 'cos' },
  { value: 3, key: 'tan', label: 'tan' },
  { value: 4, key: 'exp', label: 'exp' },
  { value: 5, key: 'log', label: 'log' },
  { value: 6, key: 'sqrt', label: 'sqrt' },
  { value: 7, key: 'abs', label: 'abs' },
  { value: 8, key: 'sqr', label: 'sqr' },
  { value: 9, key: 'conj', label: 'conj' },
  { value: 10, key: 'flip', label: 'flip' },
  { value: 11, key: 'recip', label: 'recip' },
  { value: 12, key: 'cabs', label: 'cabs' },
  { value: 13, key: 'real', label: 'real' },
  { value: 14, key: 'imag', label: 'imag' },
  { value: 15, key: 'sinh', label: 'sinh' },
  { value: 16, key: 'cosh', label: 'cosh' },
  { value: 17, key: 'tanh', label: 'tanh' },
] as const;

export function isParameterName(name: string): name is ParameterName {
  return PARAMETER_NAMES.includes(name as ParameterName);
}

export function isFnSlotName(name: string): name is FnSlotName {
  return FN_SLOT_NAMES.includes(name as FnSlotName);
}
