import type { FormulaGeneratorCoefficientProfile, FormulaGeneratorInitMode } from './types';

export const FORMULA_GENERATOR_SEED_PREFIX = 'mf1';

export function createFormulaGenerationSeedFromBytes(bytes: number[]): string {
  if (bytes.length !== 8) {
    throw new Error('formula generator seed requires exactly 8 bytes');
  }

  const hex = bytes
    .map((byte) => {
      if (!Number.isInteger(byte) || byte < 0 || byte > 0xff) {
        throw new Error(`invalid seed byte: ${byte}`);
      }
      return byte.toString(16).padStart(2, '0');
    })
    .join('');

  return `${FORMULA_GENERATOR_SEED_PREFIX}-${hex}`;
}

export function normalizeFormulaGenerationSeed(seed: string): string {
  const normalized = seed.trim().toLowerCase();
  const match = normalized.match(/^mf1-([0-9a-f]{16})$/);
  if (!match) {
    throw new Error(`invalid formula generation seed: ${seed}`);
  }
  return `${FORMULA_GENERATOR_SEED_PREFIX}-${match[1]}`;
}

export function parseFormulaGenerationSeed(seed: string): number[] {
  const normalized = normalizeFormulaGenerationSeed(seed);
  const hex = normalized.slice(FORMULA_GENERATOR_SEED_PREFIX.length + 1);
  const bytes: number[] = [];

  for (let index = 0; index < hex.length; index += 2) {
    bytes.push(Number.parseInt(hex.slice(index, index + 2), 16));
  }

  return bytes;
}

export function decodeCoefficientProfile(byte: number): FormulaGeneratorCoefficientProfile {
  const nibble = (byte >> 4) & 0x0f;
  if (nibble <= 0x5) return 'gentle';
  if (nibble <= 0xb) return 'balanced';
  if (nibble <= 0xe) return 'tense';
  return 'wild-lite';
}

export function decodeInitMode(byte: number): FormulaGeneratorInitMode {
  const nibble = byte & 0x0f;
  switch (nibble) {
    case 0x0:
      return 'z0';
    case 0x1:
      return 'pixel';
    case 0x2:
      return 'pixel-light-offset';
    case 0x3:
      return 'z0-light-offset';
    default:
      return 'z0';
  }
}

