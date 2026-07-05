import { compileFrm } from '@/engine/frm/compile';
import {
  generateDiversifiedFormula,
  generateFormulaFromSeed,
  normalizeFormulaGenerationSeed,
} from '@/engine/frm/generator';
import { CliCommandError, createSuccess } from './doc-commands';
import { prependFormulaHistoryEntry, readFormulaHistory, writeFormulaHistory } from './formula-history';

export function formulaGenerate(args: { seed?: string; historyPath?: string; randomByte?: () => number }) {
  const explicitSeed = typeof args.seed === 'string' ? normalizeFormulaGenerationSeed(args.seed) : undefined;
  const generated = explicitSeed
    ? generateFormulaFromSeed(explicitSeed)
    : generateDiversifiedFormula({
        history: readFormulaHistory(args.historyPath),
        randomByte: args.randomByte,
      });
  const seed = generated.seed;
  const compileResult = compileFrm(generated.source, `generated-${generated.formulaName.toLowerCase()}`);

  if (!compileResult.success) {
    throw new CliCommandError(
      'FORMULA_GENERATION_FAILED',
      2,
      `Generated formula failed to compile for seed "${seed}".`,
      {
        seed,
        errors: compileResult.errors,
        warnings: compileResult.warnings,
        source: generated.source,
      },
    );
  }

  if (!explicitSeed) {
    const history = readFormulaHistory(args.historyPath);
    writeFormulaHistory(prependFormulaHistoryEntry(generated, history), args.historyPath);
  }

  return createSuccess('formula generate', {
    seed,
    formulaName: generated.formulaName,
    source: generated.source,
    starterParams: generated.starterParams,
    experienceHint: generated.experienceHint,
    selection: generated.selection,
    compile: {
      success: true,
      pluginId: compileResult.plugin?.id,
      pluginName: compileResult.plugin?.name,
      warnings: compileResult.warnings,
    },
  });
}
