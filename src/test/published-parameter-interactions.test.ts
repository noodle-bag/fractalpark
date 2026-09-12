import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import runtimeIndex from '../../public/formula-library/v1/runtime/published/index.json';
import { resolveParameterInteraction } from '@/lib/published-parameter-interactions';
import { compilePublishedFormulaPluginV1, type PublishedFormulaParameterDescriptorV1 } from '@/engine/formulas/v1';

const entries = runtimeIndex.rows.flatMap((row) => row.parameters
  .filter((p) => p.type === 'complex')
  .map((parameter) => ({ row, parameter: parameter as PublishedFormulaParameterDescriptorV1 })));

describe('reviewed parameter interactions', () => {
  it('covers published complex slots and refuses unknown identity/type/uniform combinations', () => {
    const counts: Record<string, number> = {};
    for (const { row, parameter } of entries) {
      const control = resolveParameterInteraction(row.formulaId, parameter);
      expect(control).not.toBeNull();
      counts[control!.kind] = (counts[control!.kind] ?? 0) + 1;
      expect(resolveParameterInteraction('unknown', parameter)).toBeNull();
      expect(resolveParameterInteraction(row.formulaId, { ...parameter, uniformName: 'wrong' })).toBeNull();
      expect(resolveParameterInteraction(row.formulaId, { ...parameter, type: 'real' })).toBeNull();
    }
    expect(counts).toEqual({ plane: 216, polar: 44, real: 104, pair: 5, times: 2 });
  });

  it('does not confuse misleading names with coordinate semantics', () => {
    const kind = (name: string, slot: string) => {
      const item = entries.find(({ row, parameter }) => row.displayName === name && parameter.slotName === slot)!;
      return resolveParameterInteraction(item.row.formulaId, item.parameter);
    };
    expect(kind('scottlps', 'offset')?.kind).toBe('real');
    expect(kind('j_tchebychevu2', 'scale')?.kind).toBe('plane');
    expect(kind('mandconj09', 'exponent')?.kind).toBe('real');
    expect(kind('mandellambdapwr', 'exponent')?.hint).toBe('exponent');
    expect(kind('phoenix_j', 'feedback')?.kind).toBe('pair');
    expect(kind('moe', 'iterationLimit')?.integer).toBe(true);
    expect(kind('five-mandels', 'firstTimes')?.integer).toBe(true);
  });

  it('preserves observable CPU trajectories when only a scalar-projected imaginary component changes', async () => {
    for (const { row, parameter } of entries.filter(({ row, parameter }) =>
      resolveParameterInteraction(row.formulaId, parameter)?.kind === 'real')) {
      const source = readFileSync(resolve('public/formula-library/v1/runtime/published', row.definitionPath), 'utf8');
      const compiled = await compilePublishedFormulaPluginV1({ ...row, source });
      if (!compiled.ok) throw new Error(`compile failed: ${row.displayName}`);
      const cpu = compiled.value.backend.cpu;
      const trace = (im: number) => [-0.7, 0.2, 1.1].flatMap((re) => {
        const state = cpu.createState({ pixel: { re, im: 0.31 }, c: { re, im: 0.31 }, maxit: 16, ismand: true,
          parameters: { [parameter.slotName]: [0.37, im] } });
        const initialized = cpu.init(state);
        const observations: unknown[] = [{ z: { ...state.values.z }, event: initialized.event }];
        if (initialized.event) return observations;
        for (let i = 0; i < 8; i++) {
          const step = cpu.step(state);
          const continuation = step.event ? undefined : cpu.shouldContinue(state);
          observations.push({ z: { ...state.values.z }, event: step.event ?? continuation?.event, continue: continuation?.continue });
          if (step.event || continuation?.event || !continuation?.continue) break;
        }
        return observations;
      });
      expect(trace(0.63), `${row.displayName}.${parameter.slotName}`).toEqual(trace(-0.41));
    }
  }, 30_000);
});
