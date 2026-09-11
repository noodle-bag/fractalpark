import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import executions from '../../resources/formula-library/v1/coordinate-parameter-execution.v1.json';
import index from '../../public/formula-library/v1/runtime/published/index.json';
import { compilePublishedFormulaPluginV1, type PublishedFormulaPluginArtifactV1 } from '@/engine/formulas/v1/published-adapter';
import { applyPublishedCoordinateParametersV1 } from '@/engine/formulas/v1/published-coordinate-parameters-v1';
import { bindPublishedRenderingSourceV1 } from '@/engine/formulas/v1/published-rendering-source-v1';
import { resolveFormulaRuntimeCapabilityV1 } from '@/engine/formulas/v1/formula-runtime-capability-v1';
import { FRM_V1_UNARY_FUNCTION_NAMES } from '@/engine/frm/frm-v1-stdlib';
import { canonicalizeFrmLikeV1, parseFrmLikeV1 } from '@/engine/frm/v1';
import type { FrmLikeV1Statement } from '@/engine/frm/v1';
import type { FrmLikeV1CpuInputs } from '@/engine/frm/v1-backend';
import { createPublishedFormulaLibraryClient } from '@/lib/published-formula-library';
import { normalizePublishedFormulaParams } from '@/lib/published-formula-params';
import { DEFAULT_FRACTAL_DOCUMENT } from '@/engine/document';
import { documentToRuntimeParams } from '@/engine/document-adapter';
import { pluginRegistry } from '@/engine/plugins/registry';
import { createFractalDocumentEnvelope, serializeFractalProject, parseFractalProjectJson } from '@/lib/fractal-file';

const root = 'public/formula-library/v1/runtime/published/';
const points = [{ re: 0.17, im: 0.23 }, { re: -0.42, im: 0.31 }, { re: 0.71, im: -0.19 }];
const values = [[-0.7, 0.27], [0.2, -0.4]] as const;

function writtenState(body: readonly FrmLikeV1Statement[], output = new Set(['z', 'zPrev', 'LastSqr'])) {
  for (const statement of body) {
    if (statement.kind === 'if') {
      writtenState(statement.then, output);
      for (const branch of statement.elseIf) writtenState(branch.body, output);
      writtenState(statement.else ?? [], output);
    } else output.add(statement.target);
  }
  return output;
}

async function original(formulaId: string) {
  const row = index.rows.find(row => row.formulaId === formulaId)!;
  const result = await compilePublishedFormulaPluginV1({
    ...row, source: readFileSync(root + row.definitionPath, 'utf8'),
  });
  if (!result.ok) throw new Error(result.code);
  return result.value;
}

async function projected(baseline: PublishedFormulaPluginArtifactV1) {
  const result = await applyPublishedCoordinateParametersV1(baseline);
  if (!result.ok) throw new Error(result.code);
  return result.value;
}

function trace(artifact: PublishedFormulaPluginArtifactV1, inputs: FrmLikeV1CpuInputs) {
  const cpu = artifact.backend.cpu;
  const state = cpu.createState({ maxit: 128, ...inputs });
  const init = cpu.init(state);
  const checkpoints = [JSON.stringify({ z: state.values.z, event: init.event })];
  for (let i = 0; i < 128 && !state.terminated; i++) {
    const result = cpu.step(state);
    const predicate = cpu.shouldContinue(state);
    checkpoints.push(JSON.stringify({
      z: state.values.z, zPrev: state.values.zPrev, LastSqr: state.values.LastSqr,
      event: result.event, continue: predicate.continue,
    }));
    if (!predicate.continue) break;
  }
  return checkpoints;
}

describe('published coordinate parameters', { timeout: 30_000 }, () => {
  for (const execution of executions.rows) {
    describe(execution.formulaId, () => {
      it('pins canonical source and preserves all existing parameter descriptors', async () => {
        const parsed = parseFrmLikeV1(execution.source);
        if (!parsed.ok) throw new Error(parsed.reason);
        expect(canonicalizeFrmLikeV1(parsed.ir)).toBe(execution.source);
        const baseline = await original(execution.formulaId);
        const next = await projected(baseline);
        expect(next.descriptor.parameters.slice(0, -2)).toEqual(baseline.descriptor.parameters);
        expect(next.plugin.uniforms.slice(0, -2)).toEqual(baseline.plugin.uniforms);
        const branch = parsed.ir.init[1];
        if (branch?.kind === 'if' && branch.else) {
          const row = index.rows.find(row => row.formulaId === execution.formulaId)!;
          const originalIr = parseFrmLikeV1(readFileSync(root + row.definitionPath, 'utf8'));
          if (!originalIr.ok) throw new Error(originalIr.reason);
          // This batch retains the entire original initialization branch and
          // changes only coordinate identifier reads in the loop, not math.
          expect(branch.else).toEqual(originalIr.ir.init);
          const normalizedLoop = JSON.parse(JSON.stringify(parsed.ir.loop), (key, value) =>
            key === 'name' && value === 'orbitPixel' ? 'pixel' : value);
          expect(normalizedLoop).toEqual(originalIr.ir.loop);
          expect(parsed.ir.bailout).toEqual(originalIr.ir.bailout);
        }
      });

      it('preserves canvas-mode traces across all unary options, including legacy Julia intent', async () => {
        const baseline = await original(execution.formulaId);
        const next = await projected(baseline);
        for (const pixel of points) expect(trace(next, { pixel })).toEqual(trace(baseline, { pixel }));
        for (const slot of baseline.descriptor.parameters.filter(slot => slot.type === 'function')) {
          for (const option of FRM_V1_UNARY_FUNCTION_NAMES) {
            for (const pixel of points) {
              const inputs: FrmLikeV1CpuInputs = {
                pixel, c: pixel, ismand: true,
                parameters: { [slot.slotName]: option },
              };
              const expected = trace(baseline, inputs);
              expect(trace(next, inputs), `${slot.slotName}=${option}`).toEqual(expected);
              expect(trace(next, { ...inputs, ismand: false, c: { re: 8, im: 9 } })).toEqual(expected);
              expect(trace(next, { ...inputs, parameters: {
                ...inputs.parameters, pixelSource: 0, pixelConstant: values[1],
              } })).toEqual(expected);
            }
          }
        }
      });

      it('fixes only the recurrence coordinate, leaving the initial point variable', async () => {
        const next = await projected(await original(execution.formulaId));
        // Zero multipliers legitimately hide coordinate changes. Exercise the
        // non-degenerate family without changing the formula's defaults.
        const independent = Object.fromEntries(next.descriptor.parameters
          .filter(slot => slot.type === 'complex' && slot.slotName !== 'pixelConstant')
          .map(slot => [slot.slotName, [0.3, 0.1]]));
        const parsed = parseFrmLikeV1(execution.source);
        if (!parsed.ok) throw new Error(parsed.reason);
        const dynamicState = writtenState(parsed.ir.loop);
        for (const value of values) {
          const parameters = { ...independent, pixelSource: 1, pixelConstant: value };
          const initialPoints = points.map(pixel => trace(next, { pixel, parameters }));
          expect(new Set(initialPoints.map(value => JSON.stringify(value))).size).toBeGreaterThan(1);
          for (const slot of [undefined, ...next.descriptor.parameters.filter(slot => slot.type === 'function')]) {
            for (const option of slot ? FRM_V1_UNARY_FUNCTION_NAMES : ['identity']) {
              const transitions = points.map(pixel => {
                const state = next.backend.cpu.createState({ pixel, parameters: { ...parameters, ...(slot ? { [slot.slotName]: option } : {}) } });
                next.backend.cpu.init(state);
                expect(state.values.z).toEqual({ re: Math.fround(pixel.re), im: Math.fround(pixel.im) });
                for (const name of dynamicState) state.values[name] = { re: 0.19, im: 0.11 };
                const result = next.backend.cpu.step(state);
                return JSON.stringify({ state: Object.fromEntries([...dynamicState].map(name => [name, state.values[name]])), event: result.event });
              });
              expect(new Set(transitions).size, `${slot?.slotName ?? 'default'}=${option}`).toBe(1);
            }
          }
        }
        expect(trace(next, { pixel: points[0], parameters: { ...independent, pixelSource: 1, pixelConstant: values[0] } }))
          .not.toEqual(trace(next, { pixel: points[0], parameters: { ...independent, pixelSource: 1, pixelConstant: values[1] } }));
      });

      it('preserves non-default ordinary parameters and numeric boundaries in canvas mode', async () => {
        const baseline = await original(execution.formulaId);
        const next = await projected(baseline);
        for (const value of [[0, 0], [0.3, 0.1], [1, 0], [-0.4, 0.2]] as const) {
          for (const slot of baseline.descriptor.parameters.filter(slot => slot.type === 'complex')) {
            for (const pixel of [...points, { re: 0, im: 0 }]) {
              const parameters = { [slot.slotName]: value };
              expect(trace(next, { pixel, parameters })).toEqual(trace(baseline, { pixel, parameters }));
            }
          }
        }
      });

      it('separates execution cache identity and rejects stale/copy-forged projections', async () => {
        const baseline = await original(execution.formulaId);
        const next = await projected(baseline);
        const plugin = bindPublishedRenderingSourceV1(next);
        expect(plugin.sourceRevision).toBe(execution.baselineSourceRevision);
        expect(plugin.cacheFingerprint).toBe(execution.sourceRevision);
        expect(resolveFormulaRuntimeCapabilityV1(plugin.id, plugin).supportsRuntime).toBe(false);
        expect(() => bindPublishedRenderingSourceV1({ ...next })).toThrow('published-rendering-source-mismatch');
        for (const property of ['sourceRevision', 'semanticHash']) {
          expect((await applyPublishedCoordinateParametersV1({
            ...baseline, descriptor: { ...baseline.descriptor, [property]: '0'.repeat(64) },
          })).ok).toBe(false);
        }
      });

      it('preserves stored coordinate values and legacy Julia fields without migrating them', async () => {
        const next = await projected(await original(execution.formulaId));
        pluginRegistry.register(bindPublishedRenderingSourceV1(next));
        const doc = structuredClone(DEFAULT_FRACTAL_DOCUMENT);
        doc.formula.formulaId = execution.formulaId;
        doc.formula.isJulia = true;
        doc.formula.juliaC = [-0.42, 0.19];
        doc.formula.params = { formula: normalizePublishedFormulaParams(next.descriptor, {
          frmV1_pixelSource: [1, 0], frmV1_pixelConstant: [3.456789, -4.56789],
        }) };
        const before = JSON.stringify(doc);
        const runtime = documentToRuntimeParams(doc);
        expect(runtime.isJulia).toBe(false);
        expect(runtime.pluginParams?.frmV1_pixelConstant).toEqual([3.456789, -4.56789]);
        expect(JSON.stringify(doc)).toBe(before);
        const envelope = await createFractalDocumentEnvelope(doc, []);
        if (!envelope.success) throw new Error('envelope-failed');
        const serialized = serializeFractalProject(envelope.value);
        if (!serialized.success) throw new Error('serialization-failed');
        const restored = parseFractalProjectJson(serialized.value);
        if (!restored.success || restored.value.mode !== 'editable') throw new Error('restore-failed');
        expect(restored.value.envelope.document.formula).toEqual(doc.formula);
        doc.formula.params.formula!.frmV1_pixelSource = [0, 0];
        expect(documentToRuntimeParams(doc).pluginParams?.frmV1_pixelConstant).toEqual([3.456789, -4.56789]);
      });
    });
  }

  it('keeps shift independent from the coordinate parameter', async () => {
    const next = await projected(await original(executions.rows[0].formulaId));
    for (const pixelSource of [0, 1]) {
      const parameters = { pixelSource, pixelConstant: values[0] };
      expect(trace(next, { pixel: points[0], parameters: { ...parameters, shift: [0, 0] } }))
        .not.toEqual(trace(next, { pixel: points[0], parameters: { ...parameters, shift: [0.3, 0.1] } }));
    }
  });

  it('retains zero-multiplier defaults without inventing coordinate sensitivity', async () => {
    for (const name of ['ok-34', 'tjerfzppfnre']) {
      const row = index.rows.find(row => row.displayName === name)!;
      const next = await projected(await original(row.formulaId));
      const parameters = { pixelSource: 1 };
      expect(trace(next, { pixel: points[0], parameters: { ...parameters, pixelConstant: values[0] } }))
        .toEqual(trace(next, { pixel: points[0], parameters: { ...parameters, pixelConstant: values[1] } }));
    }
  });

  it('leaves unrelated formulas unchanged and applies extensions in the shared client', async () => {
    const untouched = await original(index.rows.find(row => row.displayName === 'mandelbrot')!.formulaId);
    expect(await applyPublishedCoordinateParametersV1(untouched)).toEqual({ ok: true, value: untouched });
    const client = await createPublishedFormulaLibraryClient(async input => new Response(
      readFileSync(`public${String(input)}`, 'utf8'),
    ));
    if (!client.ok) throw new Error(client.code);
    for (const execution of executions.rows) {
      const loaded = await client.value.load(execution.formulaId);
      if (!loaded.ok) throw new Error(loaded.code);
      expect(bindPublishedRenderingSourceV1(loaded.value).cacheFingerprint).toBe(execution.sourceRevision);
    }
  });
});
