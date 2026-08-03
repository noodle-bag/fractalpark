import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Static guard (spec §17 matrix A1): the retired artwork localStorage keys
 * must never reappear in application source. Tests and docs may reference
 * them (probes, migration notes) — app code may not.
 */

const FORBIDDEN_KEYS = ['fractalpark-artworks-v1', 'myfrac-saved-fractals'];

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      collectSourceFiles(path, out);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(path);
    }
  }
  return out;
}

describe('legacy artwork storage guard', () => {
  it('no app source reads or writes the retired localStorage keys', () => {
    const files = collectSourceFiles(join(__dirname, '..')).filter(
      // Tests reference the keys legitimately (probes, this guard).
      (file) => !file.includes(`${__dirname}/`),
    );
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      for (const key of FORBIDDEN_KEYS) {
        if (text.includes(key)) offenders.push(`${file}: ${key}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
