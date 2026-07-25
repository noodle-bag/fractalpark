import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FractalDocument } from '@/engine/document';
import { pluginRegistry } from '@/engine/plugins/registry';
import {
  commitPreparedFractalProjectImport,
  CUSTOM_FORMULAS_CHANGED_EVENT,
  CUSTOM_FORMULAS_STORAGE_KEY,
} from '@/lib/custom-formula-storage';
import type { PreparedFractalProjectImport } from '@/lib/fractal-file';
import documentV2 from './fixtures/documents/document-v2.json';

const SOURCE = `ImportedFormula {
init:
  z = pixel
loop:
  z = z^2 + c
bailout:
  |z| < 4
}`;

function createPreparedImport(id: string): PreparedFractalProjectImport {
  return {
    document: {
      ...structuredClone(documentV2),
      formula: {
        ...structuredClone(documentV2.formula),
        formulaId: id,
      },
    } as unknown as FractalDocument,
    formulasToAdd: [{
      id,
      name: 'Imported Formula',
      source: SOURCE,
      hash: 'fixture-hash',
    }],
    reusedFormulaIds: [],
  };
}

describe('custom formula import commits', () => {
  let storage: Map<string, string>;

  beforeEach(() => {
    storage = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
  });

  it('persists, registers, loads, and announces one committed import', () => {
    const prepared = createPreparedImport('custom-import-commit');
    const loadDocument = vi.fn();
    const changed = vi.fn();
    window.addEventListener(CUSTOM_FORMULAS_CHANGED_EVENT, changed);

    const result = commitPreparedFractalProjectImport(prepared, loadDocument);

    expect(result).toEqual({ success: true });
    expect(loadDocument).toHaveBeenCalledWith(prepared.document);
    expect(pluginRegistry.hasFormula('custom-import-commit')).toBe(true);
    expect(JSON.parse(storage.get(CUSTOM_FORMULAS_STORAGE_KEY) ?? '[]')).toMatchObject([
      {
        id: 'custom-import-commit',
        name: 'Imported Formula',
        source: SOURCE,
      },
    ]);
    expect(changed).toHaveBeenCalledOnce();

    window.removeEventListener(CUSTOM_FORMULAS_CHANGED_EVENT, changed);
    pluginRegistry.unregister('formula', 'custom-import-commit');
  });

  it('restores storage and registration when document loading fails', () => {
    const original = JSON.stringify([{
      id: 'custom-existing',
      name: 'Existing',
      source: SOURCE,
      createdAt: 1,
      updatedAt: 1,
    }]);
    storage.set(CUSTOM_FORMULAS_STORAGE_KEY, original);

    const result = commitPreparedFractalProjectImport(
      createPreparedImport('custom-import-rollback'),
      () => {
        throw new Error('load failed');
      }
    );

    expect(result).toEqual({ success: false, code: 'formula-commit-failed' });
    expect(storage.get(CUSTOM_FORMULAS_STORAGE_KEY)).toBe(original);
    expect(pluginRegistry.hasFormula('custom-import-rollback')).toBe(false);
  });
});
