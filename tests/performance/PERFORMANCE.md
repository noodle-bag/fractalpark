# FractalPark Performance Testing

This document describes the performance testing scaffold for the M4.1 plugin architecture.

## Performance Budgets

| Metric | Target | Warning Threshold | Failure Threshold |
|--------|--------|-------------------|-------------------|
| Shader compile time | <100ms | 100-300ms | >300ms |
| First frame delay | <50ms | 50-200ms | >200ms |
| Formula switch latency | <500ms | 500ms-1s | >1s |
| Transform FPS impact | <10% drop | 10-20% drop | >20% drop |
| Memory (GPU) | <50MB | 50-100MB | >100MB |

## Shader Compilation Performance

The shader cache (`src/engine/shaders/cache.ts`) automatically tracks compilation metrics:

```typescript
interface CompileMetrics {
  compileTime: number;    // Time to compile + link shader
  formulaId: string;      // Which formula was compiled
  timestamp: number;      // When compilation occurred
}
```

Access metrics via browser console:

```javascript
// After rendering several formulas, access the performance report
const canvas = document.querySelector('canvas');
const gl = canvas.getContext('webgl');
// Metrics are logged to console when compile time > 100ms
```

### Expected Compile Times

| Formula Complexity | Expected Time | Formulas |
|-------------------|---------------|----------|
| Simple | 20-50ms | mandelbrot, lambda, sierpinski |
| Medium | 50-150ms | burningShip, tricorn, magnet1/2 |
| Complex | 150-300ms | newton3/4, newtonSin, nova, mandelbox |

## Manual Performance Testing

### 1. Shader Compilation Time

1. Open browser DevTools
2. Go to Console tab
3. Enable "Verbose" logging
4. Switch between formulas in the UI
5. Look for `[ShaderCache] Slow compile` warnings

### 2. Cache Memory Behavior

The LRU cache (max 8 entries) ensures:
- Most recently used shaders are retained
- Old shaders are automatically evicted
- GPU memory is released via `gl.deleteProgram()`

To verify:
1. Switch through 10+ different formulas
2. Check Memory tab in DevTools
3. GPU memory should stabilize after ~8 formulas

### 3. Transform FPS Check

To measure transform impact on frame rate:

1. Open Performance tab in DevTools
2. Start recording
3. Pan/zoom with no transform (baseline)
4. Enable various transforms
5. Compare frame times

Expected: <10% FPS drop with any transform enabled.

## Automated Performance Tests

Run performance benchmarks:

```bash
# Build and start production server
npm run build
npm run start

# Run E2E tests (includes performance assertions)
npx playwright test tests/e2e --reporter=list
```

### Adding New Performance Tests

Add performance assertions to E2E tests:

```typescript
test('formula switch performance', async ({ page }) => {
  const startTime = Date.now();
  await page.click('[data-testid="formula-burningShip"]');
  await page.waitForTimeout(100); // Wait for render
  const switchTime = Date.now() - startTime;
  
  expect(switchTime).toBeLessThan(500); // 500ms budget
});
```

## Optimization Guidelines

### When Adding New Formulas

1. **Test compile time**: Must be <300ms on mid-range hardware
2. **Check shader size**: Complex formulas generate larger GLSL
3. **Verify cache hit**: Repeated switches should use cache

### When Adding New Transforms

1. **Benchmark FPS**: Compare with/without transform
2. **Check uniform overhead**: Minimal additional uniforms preferred
3. **Test on mobile**: Some transforms may be expensive on low-end GPUs

## Known Performance Characteristics

### Fast Formulas (<50ms compile)
- mandelbrot
- lambda
- sierpinski
- cubicMandelbrot
- quarticMandelbrot

### Medium Formulas (50-150ms compile)
- burningShip
- tricorn
- phoenix
- magnet1, magnet2
- celtic

### Slow Formulas (150-300ms compile)
- newton3, newton4, newtonSin, nova (converge mode complexity)
- mandelbox (fold operations)
- expJulia (transcendental functions)

### Transform Overhead

All transforms add minimal overhead (<5% FPS drop):
- none: 0%
- kaleidoscope: ~2% (trig operations)
- mobius: ~3% (complex division)
- inversion: ~1% (length calculation)
- polar: ~2% (trig conversion)
- sinusoidal: ~2% (sin/cos)
- spherical: ~1% (simple arithmetic)

## Future Improvements

- [ ] Web Worker compilation for complex formulas
- [ ] KHR_parallel_shader_compile extension usage
- [ ] Shader binary caching (if supported)
- [ ] Progressive quality rendering (low res → high res)
