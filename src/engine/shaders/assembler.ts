import type { FormulaPlugin, PluginCombination, ShaderCacheKey } from '../plugins/types';
import { pluginRegistry } from '../plugins/registry';
import frameworkTemplate from './framework.frag.glsl';
import complexMathLib from './complex-math.glsl';
import paletteLib from './palettes.glsl';

const ORBIT_TRAP_GLSL = `
float orbitTrapDistance(vec2 z) {
  vec2 delta = z - u_orbitTrapPoint;
  if (u_orbitTrapShape == 0) return length(delta);
  if (u_orbitTrapShape == 1) return min(abs(delta.x), abs(delta.y));
  return abs(length(delta) - u_orbitTrapRadius);
}
`;

/** GLSL float literal with full precision (integers gain a `.0` suffix). */
function glslFloatLiteral(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error(`Non-finite GLSL float literal: ${value}`);
  }
  const text = String(value);
  return text.includes('.') || text.includes('e') || text.includes('E') ? text : `${text}.0`;
}

/** Resolve the active formula identically for source assembly and cache keys. */
function resolveFormula(
  combo: PluginCombination,
  formulaOverride?: FormulaPlugin,
): FormulaPlugin | undefined {
  return formulaOverride?.id === combo.formulaId
    ? formulaOverride
    : pluginRegistry.getFormula(combo.formulaId);
}

export function assembleShader(
  combo: PluginCombination,
  formulaOverride?: FormulaPlugin,
): string {
  const formula = resolveFormula(combo, formulaOverride);
  const outside = pluginRegistry.getOutsideColoring(combo.outsideColoringId);
  const inside = pluginRegistry.getInsideColoring(combo.insideColoringId);
  const transform = pluginRegistry.getTransform(combo.transformId);

  if (!formula || !outside || !inside || !transform) {
    throw new Error(
      `Missing plugin(s): f=${combo.formulaId} oc=${combo.outsideColoringId} ic=${combo.insideColoringId} t=${combo.transformId}`
    );
  }

  const defines: string[] = [];
  const orbitLifecycle = formula.orbitLifecycle;
  if (orbitLifecycle?.kind === 'frm-like-v1') {
    defines.push('#define PLUGIN_HAS_STATE_RESET');
    defines.push('#define PLUGIN_HAS_CONTINUE_PREDICATE');
    // The v1 backend evaluates its arbitrary continue predicate after every
    // step and has no polynomial smooth-escape guarantee.
    defines.push('#define ESCAPE_AFTER_STEP');
    defines.push('#define SMOOTH_ESCAPE_TIME');
  }
  // Renderer-pipeline v2: a formula carrying a bounded bailout descriptor
  // (strict-v2 FRM compile) drives the escape defines from the descriptor
  // instead of the legacy numeric bailout field — but only when the
  // combination itself requests pipeline v2 (spec §7). A historical
  // pipeline-v1 document renders the legacy path even for strict-v2
  // formulas. C1 thresholds are magnitude values, so the zz comparison
  // consumes threshold²; inverse directions (>, >=) flip the escape
  // condition. Because ESCAPE_CHECK is the negation of the FRM continue
  // predicate, strict continue operators (<, >) produce inclusive escape
  // boundaries, while inclusive continue operators (<=, >=) produce strict
  // escape boundaries. Legacy combinations keep the historical
  // BAILOUT_RADIUS semantics byte-for-byte.
  const pipelineV2 = combo.pipelineVersion === 2;
  const bailoutDescriptor = pipelineV2 ? formula.bailoutDescriptor : undefined;
  if (bailoutDescriptor?.kind === 'C1') {
    // Full precision: fractional thresholds (e.g. |z| < 0.1 → 0.01) must
    // not be rounded away.
    defines.push(`#define BAILOUT_RADIUS ${glslFloatLiteral(bailoutDescriptor.threshold ** 2)}`);
    if (bailoutDescriptor.op === '>' || bailoutDescriptor.op === '>=') {
      defines.push('#define ESCAPE_INVERSE_DIRECTION');
    }
    if (bailoutDescriptor.op === '<' || bailoutDescriptor.op === '>') {
      defines.push('#define BAILOUT_INCLUSIVE');
    }
  } else if (bailoutDescriptor?.kind === 'C2' && formula.c2ThresholdGlsl) {
    // C2 parameterized radial: the threshold is a GLSL expression over
    // parameter uniforms (u_p1…u_p5) — parameter edits take effect without
    // recompilation. Escape is the negated continue predicate over the
    // expression's square (zz vs magnitude²).
    const escapeOp = { '<': '>=', '<=': '>', '>': '<=', '>=': '<' }[bailoutDescriptor.op];
    defines.push('#define ESCAPE_C2');
    defines.push(
      `#define C2_ESCAPE_CHECK(zz) ((zz) ${escapeOp} ((${formula.c2ThresholdGlsl}) * (${formula.c2ThresholdGlsl})))`,
    );
  } else if (bailoutDescriptor?.kind === 'C4R') {
    // C4-R real projection: escape is the negation of the continue
    // predicate over z.x (abs-real uses abs(z.x)). The assembler injects
    // the full comparison expression; the framework routes ESCAPE_CHECK to
    // it. Thresholds are compared against z.x directly (not squared).
    const escapeOp = { '<': '>=', '<=': '>', '>': '<=', '>=': '<' }[bailoutDescriptor.op];
    const operand = bailoutDescriptor.form === 'abs-real' ? 'abs((z).x)' : '(z).x';
    defines.push('#define ESCAPE_C4R');
    defines.push(
      `#define C4R_ESCAPE_CHECK(z) (${operand} ${escapeOp} ${glslFloatLiteral(bailoutDescriptor.threshold)})`,
    );
  } else if (bailoutDescriptor?.kind === 'C5') {
    // C5 LastSqr: the side-channel modulus at the last sqr() call's
    // argument (frmLastSqr). The threshold stays RAW — already squared.
    const escapeOp = { '<': '>=', '<=': '>', '>': '<=', '>=': '<' }[bailoutDescriptor.op];
    defines.push('#define ESCAPE_C5');
    defines.push(
      `#define C5_ESCAPE_CHECK(zz) ((zz) ${escapeOp} ${glslFloatLiteral(bailoutDescriptor.threshold)})`,
    );
  } else {
    defines.push(`#define BAILOUT_RADIUS ${(formula.bailout ?? 4.0).toFixed(1)}`);
  }
  // Strict-v2 classic timing: bailout evaluated after each loop step.
  if (pipelineV2 && formula.afterStepTiming && !orbitLifecycle) {
    defines.push('#define ESCAPE_AFTER_STEP');
  }
  if (pipelineV2 && formula.smoothCapability === 'unavailable') {
    // Spec §7: smooth unavailable (C4-R real projection or inverse-direction
    // radial) → deterministic Escape Time. The requested coloring preference
    // is preserved upstream and deterministically restored when the
    // capability returns (docs/specs/frm-compatibility-v1.md §7).
    defines.push('#define SMOOTH_ESCAPE_TIME');
  }
  if (formula.escapeType === 'converge') {
    defines.push('#define ESCAPE_CONVERGE');
    defines.push('#define CONVERGE_EPSILON 0.000001');
  }
  if (formula.initGlsl || orbitLifecycle) {
    defines.push('#define HAS_INIT_FORMULA');
  }
  const frmSource = `${formula.initGlsl ?? ''}\n${formula.glsl}`;
  if (/\bfloat\s+frmLastSqr\b/.test(frmSource)) {
    // The classic FRM codegen owns this mutable side channel even when the
    // bailout descriptor is C1/C2/C4-R: loop expressions may read LastSqr.
    // Native/B94 plugins do not declare it and must not pay for/reset it.
    defines.push('#define HAS_FRM_LAST_SQR');
  }

  const allNeeded = new Set([...(outside.needsOrbitStats ?? []), ...(inside.needsOrbitStats ?? [])]);
  if (allNeeded.has('trapMin')) defines.push('#define NEED_ORBIT_TRAP');
  if (allNeeded.has('tiaSum')) defines.push('#define NEED_TIA');

  const pluginUniforms = [...formula.uniforms, ...outside.uniforms, ...inside.uniforms, ...transform.uniforms];
  const uniformDecls = pluginUniforms.map((u) => `uniform ${u.type} ${u.name};`).join('\n');

  const orbitTrapSection = allNeeded.has('trapMin') ? ORBIT_TRAP_GLSL : '';

  let shader = frameworkTemplate;
  if (orbitLifecycle?.kind === 'frm-like-v1') {
    const { resetFunction, continueFunction, eventFunction } = orbitLifecycle;
    const escapeAnchor = '#if defined(ESCAPE_C4R)';
    if (!shader.includes(escapeAnchor)) {
      throw new Error('Formula lifecycle escape hook anchor missing');
    }
    shader = shader.replace(
      escapeAnchor,
      `#if defined(PLUGIN_HAS_CONTINUE_PREDICATE)\n  #define ESCAPE_CHECK(z, zz) (!${continueFunction}())\n#elif defined(ESCAPE_C4R)`,
    );

    const orbitInput = '  vec2 c = u_isJulia ? u_juliaC : point;\n';
    const orbitCount = shader.split(orbitInput).length - 1;
    if (orbitCount !== 2) {
      throw new Error(`Formula lifecycle reset hook anchor count: ${orbitCount}`);
    }
    shader = shader.replaceAll(
      orbitInput,
      `${orbitInput}#ifdef PLUGIN_HAS_STATE_RESET\n  ${resetFunction}(point, c, u_maxIterations, !u_isJulia);\n#endif\n`,
    );

    const heightInitAnchor =
      '  vec2 zPrev = vec2(0.0);\n  for (int i = 0; i < 10000; i++) {';
    if (!shader.includes(heightInitAnchor)) {
      throw new Error('Formula lifecycle height-init hook anchor missing');
    }
    shader = shader.replace(
      heightInitAnchor,
      `  vec2 zPrev = vec2(0.0);\n#ifdef PLUGIN_HAS_CONTINUE_PREDICATE\n  if (${eventFunction}()) return 0.0;\n#endif\n  for (int i = 0; i < 10000; i++) {`,
    );

    const colorInitAnchor = '  bool escaped = false;';
    if (!shader.includes(colorInitAnchor)) {
      throw new Error('Formula lifecycle color-init hook anchor missing');
    }
    shader = shader.replace(
      colorInitAnchor,
      `${colorInitAnchor}\n#ifdef PLUGIN_HAS_CONTINUE_PREDICATE\n  escaped = ${eventFunction}();\n#endif`,
    );
    const colorLoopAnchor =
      '  stats.angleAccum = 0.0;\n\n  for (int i = 0; i < 10000; i++) {\n    if (i >= u_maxIterations) break;';
    if (!shader.includes(colorLoopAnchor)) {
      throw new Error('Formula lifecycle color-loop hook anchor missing');
    }
    shader = shader.replace(
      colorLoopAnchor,
      '  stats.angleAccum = 0.0;\n\n  for (int i = 0; i < 10000; i++) {\n#ifdef PLUGIN_HAS_CONTINUE_PREDICATE\n    if (escaped) break;\n#endif\n    if (i >= u_maxIterations) break;',
    );
  }
  shader = shader.replace('precision highp float;', `precision highp float;\n${defines.join('\n')}`);
  shader = shader.replace('/* INJECT_UNIFORMS */', uniformDecls);
  shader = shader.replace('/* INJECT_COMPLEX_MATH */', complexMathLib);
  shader = shader.replace('/* INJECT_PALETTE_FUNCTIONS */', paletteLib);
  shader = shader.replace('/* INJECT_ORBIT_TRAP */', orbitTrapSection);
  shader = shader.replace('/* INJECT_TRANSFORM */', transform.glsl);
  const hasFullInitFunction = Boolean(formula.initGlsl?.includes('vec2 initFormula('));
  const initGlsl = formula.initGlsl
    ? (hasFullInitFunction
        ? formula.initGlsl
        : `vec2 initFormula(vec2 z, vec2 c, vec2 point) {\n  vec2 pixel = u_isJulia ? point : c;\n${formula.initGlsl}\n  return z;\n}`)
    : '';
  shader = shader.replace('/* INJECT_FORMULA_INIT */', initGlsl);
  shader = shader.replace('/* INJECT_FORMULA */', formula.glsl);
  shader = shader.replace('/* INJECT_OUTSIDE_COLORING */', outside.glsl);
  shader = shader.replace('/* INJECT_INSIDE_COLORING */', inside.glsl);

  return shader;
}

export function makeCacheKey(combo: PluginCombination, formulaOverride?: FormulaPlugin): ShaderCacheKey {
  const formula = resolveFormula(combo, formulaOverride);
  const base = `${combo.formulaId}|${combo.outsideColoringId}|${combo.insideColoringId}|${combo.transformId}`;
  const sourceBase = formula?.cacheFingerprint
    ? `${base}|src:${formula.cacheFingerprint}`
    : base;
  // Shader semantics now depend on the formula's bailout descriptor (strict
  // v2). A v1 and a v2 variant of the same formula id must never share a
  // compiled program — fingerprint the descriptor into the key. The
  // fingerprint applies only to pipeline-v2 combinations: a pipeline-v1
  // render of the same formula uses the legacy path and the legacy key.
  if (combo.pipelineVersion !== 2) return sourceBase;
  // Resolve the formula through the exact same path as assembleShader.
  // Registry-backed custom formulas normally have no instance override; if
  // their descriptor were omitted here, pipeline v1 and v2 could reuse one
  // compiled program even though assembleShader emits different source.
  const descriptor = formula?.bailoutDescriptor;
  const timingBit = formula?.afterStepTiming ? '|t:after' : '';
  if (!descriptor) return `${sourceBase}${timingBit}`;
  const fingerprint =
    descriptor.kind === 'C2'
      ? `C2:${descriptor.op}:${descriptor.params.join(',')}`
      : descriptor.kind === 'C1'
        ? `C1:${descriptor.op}:${descriptor.threshold}`
        : descriptor.kind === 'C4R'
          ? `C4R:${descriptor.form}:${descriptor.op}:${descriptor.threshold}`
          : `C5:${descriptor.op}:${descriptor.threshold}`;
  return `${sourceBase}|bo:${fingerprint}${timingBit}`;
}
