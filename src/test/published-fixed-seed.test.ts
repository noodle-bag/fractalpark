import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import executions from '../../resources/formula-library/v1/fixed-seed-execution.v1.json';
import coordinates from '../../resources/formula-library/v1/coordinate-parameter-execution.v1.json';
import census from '../../resources/formula-library/v1/julia-pixel-final-capability-census.v4.json';
import activation from '../../resources/formula-library/v1/julia-runtime-activation.v1.json';
import index from '../../public/formula-library/v1/runtime/published/index.json';
import { compilePublishedFormulaPluginV1 } from '@/engine/formulas/v1/published-adapter';
import { applyPublishedCoordinateParametersV1, fixedSeedModeV1 } from '@/engine/formulas/v1/published-coordinate-parameters-v1';
import { bindPublishedRenderingSourceV1 } from '@/engine/formulas/v1/published-rendering-source-v1';
import { resolveFormulaRuntimeCapabilityV1 } from '@/engine/formulas/v1/formula-runtime-capability-v1';
import { canonicalizeFrmLikeV1, parseFrmLikeV1 } from '@/engine/frm/v1';
import { FRM_V1_UNARY_FUNCTION_NAMES } from '@/engine/frm/frm-v1-stdlib';
import type { FrmLikeV1CpuInputs, FrmLikeV1CpuState, FrmLikeV1Backend } from '@/engine/frm/v1-backend';
import { DEFAULT_FRACTAL_DOCUMENT } from '@/engine/document';
import { documentToRuntimeParams } from '@/engine/document-adapter';
import { pluginRegistry } from '@/engine/plugins/registry';
import { createFractalDocumentEnvelope, serializeFractalProject, parseFractalProjectJson } from '@/lib/fractal-file';

const points = [{ re: 0.17, im: 0.23 }, { re: -0.42, im: 0.31 }, { re: 1.2, im: 0.19 }];
const constants = [[-0.7, 0.27], [0.2, -0.4]] as const;
function orbit(cpu: FrmLikeV1Backend['cpu'], state: FrmLikeV1CpuState) {
  const result = [JSON.stringify({ z: state.values.z, event: state.terminated })];
  for (let i = 0; i < 128 && !state.terminated; i++) {
    const step = cpu.step(state);
    const predicate = cpu.shouldContinue(state);
    result.push(JSON.stringify({ z: state.values.z, event: step.event, continue: predicate.continue }));
    if (!predicate.continue) break;
  }
  return result;
}
function trace(cpu: FrmLikeV1Backend['cpu'], input: FrmLikeV1CpuInputs) {
  const state = cpu.createState({ maxit: 128, ...input });
  cpu.init(state);
  return orbit(cpu, state);
}

describe('fixed-seed execution modes', { timeout: 30_000 }, () => {
  it('covers the complete non-system-c activation set without duplicate identities', () => {
    const active = new Set(activation.rows.map(row => row.formulaId));
    const expected = census.rows.filter(row => active.has(row.formulaId) && row.supportLane !== 'existing-system-c').map(row => row.formulaId);
    const actual = [...coordinates.rows, ...executions.rows].map(row => row.formulaId);
    expect(actual.length).toBe(new Set(actual).size);
    expect(actual.sort()).toEqual(expected.sort());
    expect(executions.rows.filter(row => row.mode === 'julia')).toHaveLength(8);
    expect(executions.rows.filter(row => row.mode === 'dynamical')).toHaveLength(7);
  });
  for (const execution of executions.rows) {
    const row = index.rows.find(row => row.formulaId === execution.formulaId)!;
    const source = readFileSync(`public/formula-library/v1/runtime/published/${row.definitionPath}`, 'utf8');
    const julia = execution.mode === 'julia';
    async function load() {
      const original = await compilePublishedFormulaPluginV1({ ...row, source });
      if (!original.ok) throw new Error(original.code);
      const next = await applyPublishedCoordinateParametersV1(original.value);
      if (!next.ok) throw new Error(next.code);
      return { original: original.value, next: next.value };
    }
    const mode = (constant: readonly [number, number]): FrmLikeV1CpuInputs => julia
      ? { ismand: false, c: { re: constant[0], im: constant[1] } }
      : { ismand: true, parameters: { pixelSource: 1, pixelConstant: constant } };

    it(`${row.displayName}: exact source, default branch, descriptors and cache`, async () => {
      const { original, next } = await load();
      const parsed = parseFrmLikeV1(execution.source), before = parseFrmLikeV1(source);
      if (!parsed.ok || !before.ok) throw new Error('parse-failed');
      expect(canonicalizeFrmLikeV1(parsed.ir)).toBe(execution.source);
      const branch = parsed.ir.init[1];
      expect(branch.kind).toBe('if');
      if (branch.kind === 'if') expect(branch.else).toEqual(before.ir.init);
      expect(JSON.parse(JSON.stringify(parsed.ir.loop), (key, value) => key === 'name' && value === 'orbitPixel' ? 'pixel' : value)).toEqual(before.ir.loop);
      expect(parsed.ir.bailout).toEqual(before.ir.bailout);
      expect(julia ? next.descriptor.parameters : next.descriptor.parameters.slice(0, -2)).toEqual(original.descriptor.parameters);
      expect(bindPublishedRenderingSourceV1(next).cacheFingerprint).toBe(execution.sourceRevision);
      expect(() => bindPublishedRenderingSourceV1({ ...next })).toThrow('published-rendering-source-mismatch');
      expect(fixedSeedModeV1(row.formulaId, 'stale')).toBeUndefined();
      expect((await applyPublishedCoordinateParametersV1({ ...original, descriptor: { ...original.descriptor, sourceRevision: 'stale' } })).ok).toBe(false);
    });

    it(`${row.displayName}: ordinary mode preserves defaults and every unary option`, async () => {
      const { original, next } = await load();
      const variants: FrmLikeV1CpuInputs['parameters'][] = [{}, Object.fromEntries(original.descriptor.parameters.filter(p => p.type === 'complex').map(p => [p.slotName, [0.3, 0.1] as const]))];
      for (const slot of original.descriptor.parameters.filter(p => p.type === 'function')) {
        for (const option of FRM_V1_UNARY_FUNCTION_NAMES) variants.push({ [slot.slotName]: option });
      }
      for (const parameters of variants) for (const pixel of points) {
        const input = { pixel, parameters, ismand: true, c: { re: 9, im: -7 } };
        expect(trace(next.backend.cpu, input)).toEqual(trace(original.backend.cpu, input));
      }
    });

    it(`${row.displayName}: fixed coefficients match an independently seeded original orbit`, async () => {
      const { original, next } = await load();
      const variants: NonNullable<FrmLikeV1CpuInputs['parameters']>[] = [{}];
      for (const slot of original.descriptor.parameters.filter(p => p.type === 'function')) {
        for (const option of FRM_V1_UNARY_FUNCTION_NAMES) variants.push({ [slot.slotName]: option });
      }
      for (const parameters of variants) for (const constant of constants) for (const pixel of points) {
        const selected = mode(constant);
        const input = { ...selected, pixel, parameters: { ...parameters, ...selected.parameters } };
        const reference = original.backend.cpu.createState({ pixel: { re: constant[0], im: constant[1] }, parameters, ismand: true, maxit: 128 });
        original.backend.cpu.init(reference);
        reference.values.z = { re: Math.fround(pixel.re), im: Math.fround(pixel.im) };
        if (row.displayName === 'fractalfenderca') reference.values.x = { re: Math.fround(Math.hypot(reference.values.z.re, reference.values.z.im)), im: 0 };
        expect(trace(next.backend.cpu, input)).toEqual(orbit(original.backend.cpu, reference));
      }
    });

    it(`${row.displayName}: changes respond to both seed and fixed coordinate`, async () => {
      const { next } = await load();
      expect(trace(next.backend.cpu, { ...mode(constants[0]), pixel: points[0] }))
        .not.toEqual(trace(next.backend.cpu, { ...mode(constants[1]), pixel: points[0] }));
      expect(trace(next.backend.cpu, { ...mode(constants[0]), pixel: points[0] }))
        .not.toEqual(trace(next.backend.cpu, { ...mode(constants[0]), pixel: points[1] }));
      if (!julia) {
        const input = { ...mode(constants[0]), pixel: points[0] };
        expect(trace(next.backend.cpu, { ...input, ismand: false, c: { re: 9, im: -7 } })).toEqual(trace(next.backend.cpu, input));
      }
    });

    it(`${row.displayName}: mode capability and project round-trip remain separate`, async () => {
      const { next } = await load();
      const plugin = bindPublishedRenderingSourceV1(next);
      pluginRegistry.register(plugin);
      expect(resolveFormulaRuntimeCapabilityV1(row.formulaId, plugin).supportsRuntime).toBe(julia);
      const doc = structuredClone(DEFAULT_FRACTAL_DOCUMENT);
      doc.formula.formulaId = row.formulaId;
      doc.formula.isJulia = true;
      doc.formula.juliaC = [-0.7, 0.27];
      doc.formula.params = { formula: julia ? undefined : { frmV1_pixelSource: [1, 0], frmV1_pixelConstant: [3.456789, -4.56789] } };
      const before = JSON.stringify(doc);
      expect(documentToRuntimeParams(doc).isJulia).toBe(julia);
      expect(JSON.stringify(doc)).toBe(before);
      const envelope = await createFractalDocumentEnvelope(doc, []);
      if (!envelope.success) throw new Error('envelope-failed');
      const encoded = serializeFractalProject(envelope.value);
      if (!encoded.success) throw new Error('encode-failed');
      const decoded = parseFractalProjectJson(encoded.value);
      if (!decoded.success || decoded.value.mode !== 'editable') throw new Error('decode-failed');
      expect(decoded.value.envelope.document.formula).toEqual(doc.formula);
    });
  }
});
