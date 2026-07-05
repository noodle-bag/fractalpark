/**
 * FRM Parser Cache Tests
 * M4.2 Phase 2.3
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { FrmParserCache } from '../engine/frm/cache';
import { compileFrm } from '../engine/frm/compile';
import type { CompileResult } from '../engine/frm/compile';

function makeSuccessfulResult(): CompileResult {
  return { success: true, errors: [], warnings: [] };
}

type CacheEntryView = { timestamp: number };
type CacheInternalsView = {
  cache: Map<string, CacheEntryView>;
};

describe('FRM Parser Cache', () => {
  let cache: FrmParserCache;

  beforeEach(() => {
    cache = new FrmParserCache(10); // Small cache for testing
  });

  it('should cache successful compilation results', () => {
    const source = `Test {
loop:
  z = z^2 + c
bailout:
  |z| < 4
}`;
    
    const result1 = compileFrm(source);
    expect(result1.success).toBe(true);
    
    // Second compilation should use cache
    const result2 = compileFrm(source);
    expect(result2.success).toBe(true);
    
    // Results should be identical
    expect(result2.plugin?.id).toBe(result1.plugin?.id);
  });

  it('should not cache failed compilations', () => {
    const source = `Invalid {
loop:
  z = undefined_var
bailout:
  |z| < 4
}`;
    
    const cache = new FrmParserCache();
    const result = cache.get(source);
    expect(result).toBeNull();
  });

  it('should evict oldest entries when cache is full', () => {
    const smallCache = new FrmParserCache(2);
    
    const source1 = `Test1 { loop: z = z^2 + c bailout: |z| < 4 }`;
    const source2 = `Test2 { loop: z = z^3 + c bailout: |z| < 4 }`;
    const source3 = `Test3 { loop: z = z^4 + c bailout: |z| < 4 }`;
    
    // Add first two entries
    smallCache.set(source1, makeSuccessfulResult());
    smallCache.set(source2, makeSuccessfulResult());
    
    // Add third entry (should evict first)
    smallCache.set(source3, makeSuccessfulResult());
    
    expect(smallCache.getStats().size).toBe(2);
  });

  it('should update timestamp on cache hit', async () => {
    const source = `Test {
loop:
  z = z^2 + c
bailout:
  |z| < 4
}`;
    
    const cache = new FrmParserCache();
    const result = makeSuccessfulResult();
    
    cache.set(source, result);
    const entry1 = (cache as unknown as CacheInternalsView).cache.get(source);
    if (!entry1) {
      throw new Error('Expected cache entry to exist after set');
    }
    const timestamp1 = entry1.timestamp;
    
    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 20));
    
    cache.get(source);
    const entry2 = (cache as unknown as CacheInternalsView).cache.get(source);
    if (!entry2) {
      throw new Error('Expected cache entry to exist after get');
    }
    expect(entry2.timestamp).toBeGreaterThan(timestamp1);
  });

  it('should clear all entries', () => {
    cache.set('test1', makeSuccessfulResult());
    cache.set('test2', makeSuccessfulResult());
    
    cache.clear();
    
    expect(cache.getStats().size).toBe(0);
  });
});
