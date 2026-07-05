/**
 * Performance metrics collection utilities for FractalPark
 * 
 * Usage: Import in browser console or E2E tests to collect metrics.
 */

export interface ShaderCompileMetrics {
  formulaId: string;
  compileTimeMs: number;
  shaderSizeBytes: number;
  uniformCount: number;
  timestamp: number;
}

export interface TransformMetrics {
  transformId: string;
  avgFrameTimeMs: number;
  fps: number;
  sampleCount: number;
}

export interface CacheMetrics {
  cacheSize: number;
  maxSize: number;
  hitRate: number;
  totalRequests: number;
  evictions: number;
}

/**
 * Collect shader compilation metrics from the console logs
 */
export function collectCompileMetrics(): ShaderCompileMetrics[] {
  // This is a placeholder - actual implementation would
  // read from the ShaderCache's performance report
  return [];
}

/**
 * Measure FPS during a transform operation
 */
export async function measureTransformFPS(
  measureDurationMs: number = 2000
): Promise<number> {
  return new Promise((resolve) => {
    let frameCount = 0;
    const startTime = performance.now();

    function countFrame() {
      frameCount++;
      if (performance.now() - startTime < measureDurationMs) {
        requestAnimationFrame(countFrame);
      } else {
        const duration = performance.now() - startTime;
        const fps = (frameCount / duration) * 1000;
        resolve(fps);
      }
    }

    requestAnimationFrame(countFrame);
  });
}

/**
 * Performance thresholds based on M4.1 budget
 */
export const PERFORMANCE_THRESHOLDS = {
  shaderCompile: {
    good: 100,    // <100ms is good
    warning: 300, // 100-300ms is warning
    fail: 500,    // >500ms is failure
  },
  formulaSwitch: {
    good: 500,    // <500ms is good
    warning: 1000,// 500-1000ms is warning
    fail: 2000,   // >2000ms is failure
  },
  fps: {
    good: 30,     // >30 FPS is good
    warning: 20,  // 20-30 FPS is warning
    fail: 15,     // <15 FPS is failure
  },
  memory: {
    good: 50 * 1024 * 1024,      // <50MB is good
    warning: 100 * 1024 * 1024,  // 50-100MB is warning
    fail: 200 * 1024 * 1024,     // >200MB is failure
  },
};

/**
 * Evaluate a metric against thresholds
 */
export function evaluateMetric(
  value: number,
  type: keyof typeof PERFORMANCE_THRESHOLDS
): 'good' | 'warning' | 'fail' {
  const thresholds = PERFORMANCE_THRESHOLDS[type];
  
  // For FPS, higher is better
  if (type === 'fps') {
    if (value >= thresholds.good) return 'good';
    if (value >= thresholds.warning) return 'warning';
    return 'fail';
  }
  
  // For time/memory, lower is better
  if (value < thresholds.good) return 'good';
  if (value < thresholds.warning) return 'warning';
  return 'fail';
}

/**
 * Expected compilation times for each formula (based on complexity)
 */
export const EXPECTED_COMPILE_TIMES: Record<string, { min: number; max: number }> = {
  // Simple formulas
  mandelbrot: { min: 20, max: 50 },
  lambda: { min: 20, max: 50 },
  sierpinski: { min: 20, max: 50 },
  cubicMandelbrot: { min: 20, max: 50 },
  quarticMandelbrot: { min: 20, max: 50 },
  
  // Medium formulas
  burningShip: { min: 50, max: 100 },
  tricorn: { min: 50, max: 100 },
  phoenix: { min: 50, max: 100 },
  magnet1: { min: 50, max: 120 },
  magnet2: { min: 50, max: 120 },
  celtic: { min: 50, max: 100 },
  
  // Complex formulas (converge mode)
  newton3: { min: 100, max: 200 },
  newton4: { min: 100, max: 200 },
  newtonSin: { min: 100, max: 250 },
  nova: { min: 100, max: 200 },
  mandelbox: { min: 150, max: 300 },
  expJulia: { min: 100, max: 200 },
};

/**
 * Validate that a formula's compile time is within expected range
 */
export function validateCompileTime(formulaId: string, actualTimeMs: number): {
  valid: boolean;
  expected: { min: number; max: number } | null;
  actual: number;
  ratio: number;
} {
  const expected = EXPECTED_COMPILE_TIMES[formulaId];
  if (!expected) {
    return { valid: true, expected: null, actual: actualTimeMs, ratio: 1 };
  }
  
  const ratio = actualTimeMs / expected.max;
  const valid = actualTimeMs <= expected.max * 1.5; // Allow 50% margin
  
  return { valid, expected, actual: actualTimeMs, ratio };
}

/**
 * Generate performance report
 */
export function generatePerformanceReport(metrics: ShaderCompileMetrics[]): string {
  const lines: string[] = [];
  lines.push('=== FractalPark Shader Compilation Report ===');
  lines.push('');
  
  let totalTime = 0;
  let slowCompiles = 0;
  
  for (const m of metrics) {
    totalTime += m.compileTimeMs;
    const status = evaluateMetric(m.compileTimeMs, 'shaderCompile');
    const statusIcon = status === 'good' ? '✓' : status === 'warning' ? '⚠' : '✗';
    
    lines.push(`${statusIcon} ${m.formulaId}: ${m.compileTimeMs.toFixed(1)}ms`);
    
    if (status !== 'good') {
      slowCompiles++;
    }
  }
  
  lines.push('');
  lines.push(`Total formulas: ${metrics.length}`);
  lines.push(`Total compile time: ${totalTime.toFixed(1)}ms`);
  lines.push(`Average: ${(totalTime / metrics.length).toFixed(1)}ms`);
  lines.push(`Slow compiles: ${slowCompiles}`);
  
  return lines.join('\n');
}
