/**
 * FRM Parser Cache
 * M4.2 Phase 2.3
 * 
 * Caches compilation results to avoid re-parsing unchanged formulas
 */

import type { CompileResult } from './compile';

interface CacheEntry {
  result: CompileResult;
  timestamp: number;
}

export class FrmParserCache {
  private cache = new Map<string, CacheEntry>();
  private maxSize: number;

  constructor(maxSize = 100) {
    this.maxSize = maxSize;
  }

  /**
   * Get cached compilation result
   */
  get(source: string): CompileResult | null {
    const entry = this.cache.get(source);
    if (entry) {
      // Update access time
      entry.timestamp = Date.now();
      return entry.result;
    }
    return null;
  }

  /**
   * Store compilation result in cache
   */
  set(source: string, result: CompileResult): void {
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      let oldestKey: string | null = null;
      let oldestTime = Infinity;
      
      for (const [key, entry] of this.cache) {
        if (entry.timestamp < oldestTime) {
          oldestTime = entry.timestamp;
          oldestKey = key;
        }
      }
      
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(source, {
      result,
      timestamp: Date.now(),
    });
  }

  /**
   * Clear all cached entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
    };
  }
}

// Global singleton instance
export const frmParserCache = new FrmParserCache();
