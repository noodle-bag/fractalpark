/**
 * Server-side custom-formula publication gate (v0.4.16, spec §17.2): a
 * draft carrying a portable formula asset may publish only when the asset
 * is exactly one FRM source, ≤64 KiB, hash-matched, referenced by the
 * document, conflict-free with the builtin registry, and compilable. The
 * publication then freezes under MIT — the source becomes public.
 *
 * Node-side checks mirror the private formula API validation so the
 * publish gate cannot disagree with what the owner could save.
 */

import { createHash } from 'node:crypto';

import type { FractalDocument } from '@/engine/document';
import { readFractalDocumentEnvelope } from '@/engine/document-envelope';
import { compileFrm } from '@/engine/frm/compile';
import { registerBuiltins } from '@/engine/plugins/builtins';
import { getFormulaMetadata } from '@/engine/plugins/formula-catalog';

/** §17.1 contract: portable formula source cap — the same 256 KiB the
 *  envelope validator and the private formula API enforce, so anything
 *  savable stays publishable (review: 64 KiB here stranded 64–256 KiB
 *  formulas behind an unexplained publish rejection). */
export const FORMULA_SOURCE_MAX_BYTES = 256 * 1024;

export type FormulaPublishVerdict =
  | { ok: true; formulaId: string; formulaName: string }
  | {
      ok: false;
      code:
        | 'invalid_envelope'
        | 'formula_compile_failed'
        | 'formula_builtin_conflict';
    };

function sha256HexNode(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** True when the canonical document's formula reference is this asset id. */
function documentReferencesFormula(document: FractalDocument, formulaId: string): boolean {
  return document.formula.formulaId === formulaId;
}

export function validateFormulaPublication(canonicalEnvelope: unknown): FormulaPublishVerdict {
  const read = readFractalDocumentEnvelope(canonicalEnvelope);
  if (read.mode !== 'editable') return { ok: false, code: 'invalid_envelope' };

  const assets = read.envelope.assets?.formulas ?? [];
  if (assets.length !== 1) return { ok: false, code: 'invalid_envelope' };
  const asset = assets[0];

  if (!documentReferencesFormula(read.envelope.document, asset.id)) {
    return { ok: false, code: 'invalid_envelope' };
  }
  if (Buffer.byteLength(asset.source, 'utf8') > FORMULA_SOURCE_MAX_BYTES) {
    return { ok: false, code: 'invalid_envelope' };
  }
  if (asset.hash !== sha256HexNode(asset.source)) {
    return { ok: false, code: 'invalid_envelope' };
  }

  registerBuiltins({ quiet: true });
  if (getFormulaMetadata(asset.id)) {
    return { ok: false, code: 'formula_builtin_conflict' };
  }
  const compiled = compileFrm(asset.source, asset.id);
  if (!compiled.success) {
    return { ok: false, code: 'formula_compile_failed' };
  }

  return {
    ok: true,
    formulaId: asset.id,
    formulaName: compiled.plugin?.name?.trim() || asset.name?.trim() || asset.id,
  };
}
