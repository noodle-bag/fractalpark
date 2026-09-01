import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  applyExploreFormulaSelectionPrototype,
  buildAtlasCompactDirectoryPrototype,
  buildFormulaUiSchemaPrototype,
  exportFormulaCandidatePrototype,
  generateMineFormulaIdPrototype,
  parseFormulaCandidatePrototype,
  readFormulaDocumentPrototype,
  revisionHashesPrototype,
  validateFormulaAssetLayersPrototype,
  type FormulaSnapshotPrototype,
} from '@/prototypes/unified-formula-library';

const SOURCE = `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
PowerJulia {
  parameters:
    power: real = 2 domain [1, 16] classic p1
    offset: complex = (-0.75, 0.1) classic p2
    transform: function = sin classic fn1
  init:
    z = pixel
  loop:
    z = transform(z ^ power) + offset
  bailout:
    |z| <= 4
}`;

const DURABLE_DOCUMENT_STATE = {
  scene: {},
  formula: {},
  coloring: {},
  transform: {},
  render: {},
};

function snapshot(overrides: Partial<FormulaSnapshotPrototype> = {}): FormulaSnapshotPrototype {
  const parsed = parseFormulaCandidatePrototype(SOURCE);
  if (!parsed.ok) throw new Error('fixture must parse');
  const hashes = revisionHashesPrototype(SOURCE, parsed.semantic);
  return {
    schemaVersion: 1,
    formulaId: '1cd7a16f-0474-5b8f-a974-e122ea893769',
    scope: 'standard',
    source: SOURCE,
    sourceRevision: hashes.sourceRevision,
    semanticHash: hashes.semanticHash,
    languageVersion: 'frm-like/1',
    stdlibVersion: 1,
    numericProfile: 'standard32',
    parameterSchema: parsed.parameters,
    resolvedParameters: { power: 2, offset: [-0.75, 0.1], transform: 'sin' },
    mode: 'parameter-plane',
    iterations: 100,
    termination: { predicateMeaning: 'continue-iteration', nonFinite: 'terminate-with-event', maximumIterations: 'profile-resolved' },
    channels: [],
    ...overrides,
  };
}

describe('unified formula library Slice 0 prototypes', () => {
  it('parses the exact line-aware candidate parameter grammar and projects UI schemas', () => {
    const parsed = parseFormulaCandidatePrototype(SOURCE);
    expect(parsed).toMatchObject({ ok: true, formulaName: 'PowerJulia' });
    if (!parsed.ok) return;
    expect(parsed.parameters).toEqual([
      { name: 'power', type: 'real', default: 2, hardDomain: [1, 16], classicBinding: 'p1' },
      { name: 'offset', type: 'complex', default: [-0.75, 0.1], classicBinding: 'p2' },
      { name: 'transform', type: 'function', default: 'sin', classicBinding: 'fn1' },
    ]);
    expect(buildFormulaUiSchemaPrototype(parsed.parameters)).toEqual([
      { name: 'power', control: 'number', default: 2, hardDomain: [1, 16] },
      { name: 'offset', control: 'complex', default: [-0.75, 0.1] },
      { name: 'transform', control: 'function', default: 'sin' },
    ]);
  });

  it.each([
    ['duplicate binding', SOURCE.replace('classic p2', 'classic p1'), 'duplicate-classic-binding'],
    ['reserved parameter', SOURCE.replace('power: real', 'pixel: real'), 'reserved-name'],
    ['collision assignment', SOURCE.replace('z = pixel', 'pixel = z'), 'reserved-assignment'],
    ['undeclared read', SOURCE.replace('z ^ power', 'z ^ unknown'), 'undeclared-read'],
    ['out-of-domain default', SOURCE.replace('power: real = 2', 'power: real = 20'), 'default-out-of-domain'],
    ['multi-line parameter', SOURCE.replace('power: real = 2 domain [1, 16] classic p1', 'power: real = 2\n      domain [1, 16]'), 'invalid-parameter-declaration'],
    ['binding type mismatch', SOURCE.replace('classic p1', 'classic fn2'), 'invalid-classic-binding'],
    ['unknown semantic directive', SOURCE.replace('; @language', '; @future: 1\n; @language'), 'unknown-semantic-directive'],
    ['duplicate semantic directive', SOURCE.replace('; @stdlib: 1', '; @stdlib: 1\n; @stdlib: 1'), 'duplicate-semantic-directive'],
    ['misplaced semantic directive', SOURCE.replace('    z = pixel', '    ; @stdlib: 1\n    z = pixel'), 'misplaced-semantic-directive'],
    ['trailing semantic directive', `${SOURCE}\n; @stdlib: 1`, 'misplaced-semantic-directive'],
    ['reserved formula name', SOURCE.replace('PowerJulia {', 'pixel {'), 'reserved-formula-name'],
    ['duplicate section', SOURCE.replace('  loop:', '  init:'), 'duplicate-section'],
    ['out-of-order section', SOURCE.replace('  init:\n    z = pixel\n  loop:', '  loop:\n    z = pixel\n  init:'), 'invalid-section-order'],
    ['missing init section', SOURCE.replace('  init:\n    z = pixel\n', ''), 'missing-init-section'],
    ['missing loop section', SOURCE.replace('  loop:\n    z = transform(z ^ power) + offset\n', ''), 'missing-loop-section'],
    ['read before write', SOURCE.replace('z = pixel', 'tmp = later\n    later = pixel'), 'undeclared-read'],
    ['semicolon without whitespace is not an inline comment', SOURCE.replace('z = pixel', 'z = pixel;ordinary'), 'unsupported-statement-token'],
    ['residual semicolon is not silently accepted', SOURCE.replace('z = pixel', 'z = pixel;'), 'unsupported-statement-token'],
    ['unsupported punctuation is fatal', SOURCE.replace('z = pixel', 'z = pixel @@@'), 'unsupported-statement-token'],
  ])('rejects %s', (_case, source, reason) => {
    expect(parseFormulaCandidatePrototype(source)).toMatchObject({ ok: false, reason });
  });

  it('enforces the executable-source UTF-8 byte ceiling before parsing', () => {
    expect(parseFormulaCandidatePrototype(`${SOURCE}\n${'a'.repeat(65_536)}`)).toMatchObject({
      ok: false,
      reason: 'source-too-large',
    });
  });

  it('layers exact source revisions over comment/format-insensitive semantic hashes', () => {
    const first = parseFormulaCandidatePrototype(SOURCE);
    const changedText = parseFormulaCandidatePrototype(
      SOURCE
        .replace('power: real = 2 domain [1, 16]', 'power : real = 2 domain [1,16]')
        .replace('z = pixel', 'z = pixel ; ordinary comment')
        .replace('  loop:', '; prose only\n  loop:')
        .replace('z = transform', 'z=transform'),
    );
    const changedSemantic = parseFormulaCandidatePrototype(SOURCE.replace('power: real = 2', 'power: real = 3'));
    if (!first.ok || !changedText.ok || !changedSemantic.ok) throw new Error('fixtures must parse');
    const a = revisionHashesPrototype(SOURCE, first.semantic);
    const b = revisionHashesPrototype(changedText.source, changedText.semantic);
    const c = revisionHashesPrototype(changedSemantic.source, changedSemantic.semantic);
    expect(a.sourceRevision).not.toBe(b.sourceRevision);
    expect(a.semanticHash).toBe(b.semanticHash);
    expect(a.semanticHash).not.toBe(c.semanticHash);
  });

  it('round-trips the candidate .frm entry through one canonical export spelling', () => {
    const imported = parseFormulaCandidatePrototype(SOURCE);
    if (!imported.ok) throw new Error('fixture must parse');
    const exported = exportFormulaCandidatePrototype(imported.semantic);
    const reimported = parseFormulaCandidatePrototype(exported);
    expect(reimported).toMatchObject({ ok: true, formulaName: 'PowerJulia' });
    if (!reimported.ok) return;
    expect(reimported.semantic).toEqual(imported.semantic);
    expect(exportFormulaCandidatePrototype(reimported.semantic)).toBe(exported);
  });

  it('uses opaque UUIDv4 identities for Mine without the Standard derivation namespace', () => {
    const first = generateMineFormulaIdPrototype();
    const second = generateMineFormulaIdPrototype();
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(second).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(second).not.toBe(first);
  });

  it('rejects ownership drift across Definition, Profile, Record, and Document', () => {
    const layers = {
      definition: { formulaId: 'id', source: SOURCE, parameterSchema: [] },
      profile: { formulaId: 'id', resolvedParameters: {} },
      record: { formulaId: 'id', title: 'Title' },
      document: { formulaSnapshot: {} },
    };
    expect(validateFormulaAssetLayersPrototype(layers)).toEqual([]);
    expect(validateFormulaAssetLayersPrototype({
      definition: { ...layers.definition, title: 'Wrong owner' },
      profile: { ...layers.profile, source: SOURCE },
      record: { ...layers.record, resolvedParameters: {} },
      document: {},
    })).toEqual([
      'definition-owns-foreign-fields',
      'profile-owns-foreign-fields',
      'record-owns-executable-state',
      'document-missing-snapshot',
    ]);
  });

  it('dual-reads legacy v2, valid v3 and Envelope v2, but fail-closes future, corrupt, tampered and unsupported snapshots', () => {
    const validSnapshot = snapshot();
    const v2 = { schemaVersion: 2, ...DURABLE_DOCUMENT_STATE };
    const v3 = { schemaVersion: 3, ...DURABLE_DOCUMENT_STATE, formulaSnapshot: validSnapshot };
    const assetBytes = Buffer.from('prototype-preview', 'utf8');
    const validAsset = {
      kind: 'preview',
      mediaType: 'image/webp',
      sha256: createHash('sha256').update(assetBytes).digest('hex'),
      bytesBase64: assetBytes.toString('base64'),
    };
    expect(readFormulaDocumentPrototype(v2)).toEqual({ mode: 'readable', source: 'legacy-v2', writer: 'legacy-only' });
    expect(readFormulaDocumentPrototype({ envelopeVersion: 1, document: v2 })).toEqual({ mode: 'readable', source: 'legacy-envelope-v1', writer: 'legacy-only' });
    expect(readFormulaDocumentPrototype(v3)).toEqual({ mode: 'readable', source: 'document-v3', writer: 'disabled' });
    expect(readFormulaDocumentPrototype({
      ...v3,
      formulaSnapshot: {
        ...validSnapshot,
        scope: 'mine',
        formulaId: generateMineFormulaIdPrototype(),
      },
    })).toEqual({ mode: 'readable', source: 'document-v3', writer: 'disabled' });
    expect(readFormulaDocumentPrototype({
      ...v3,
      formulaSnapshot: { ...validSnapshot, scope: 'mine' },
    })).toMatchObject({ mode: 'read-only', reason: 'corrupt-document' });
    expect(readFormulaDocumentPrototype({ envelopeVersion: 2, document: v3, assets: [validAsset] })).toEqual({ mode: 'readable', source: 'envelope-v2', writer: 'disabled' });
    expect(readFormulaDocumentPrototype({ schemaVersion: 4 })).toMatchObject({ mode: 'read-only', reason: 'future-document-version' });
    expect(readFormulaDocumentPrototype({ envelopeVersion: 3, document: { schemaVersion: 3 } })).toMatchObject({ mode: 'read-only', reason: 'future-envelope-version' });
    expect(readFormulaDocumentPrototype({ envelopeVersion: 2, document: { ...v3, schemaVersion: 4 }, assets: [] })).toMatchObject({ mode: 'read-only', reason: 'future-document-version' });
    expect(readFormulaDocumentPrototype({ envelopeVersion: 2, document: v2, assets: [] })).toMatchObject({ mode: 'read-only', reason: 'corrupt-document' });
    expect(readFormulaDocumentPrototype({ ...v3, formulaSnapshot: { ...validSnapshot, sourceRevision: '0'.repeat(64) } })).toMatchObject({ mode: 'read-only', reason: 'source-revision-mismatch' });
    expect(readFormulaDocumentPrototype({ ...v3, formulaSnapshot: { ...validSnapshot, numericProfile: 'extended64' } })).toMatchObject({ mode: 'read-only', reason: 'unsupported-numeric-profile' });
    expect(readFormulaDocumentPrototype({ ...v3, formulaSnapshot: { ...validSnapshot, formulaId: 'not-a-uuid' } })).toMatchObject({ mode: 'read-only', reason: 'corrupt-document' });
    expect(readFormulaDocumentPrototype({ ...v3, formulaSnapshot: { ...validSnapshot, parameterSchema: [] } })).toMatchObject({ mode: 'read-only', reason: 'parameter-schema-mismatch' });
    expect(readFormulaDocumentPrototype({ ...v3, formulaSnapshot: { ...validSnapshot, resolvedParameters: { power: 20, offset: [-0.75, 0.1], transform: 'sin' } } })).toMatchObject({ mode: 'read-only', reason: 'resolved-parameter-mismatch' });
    expect(readFormulaDocumentPrototype({ schemaVersion: 3, formulaSnapshot: validSnapshot })).toMatchObject({ mode: 'read-only', reason: 'corrupt-document' });
    expect(readFormulaDocumentPrototype({ envelopeVersion: 2, document: v3, assets: [{ ...validAsset, bytesBase64: Buffer.from('tampered').toString('base64') }] })).toMatchObject({ mode: 'read-only', reason: 'envelope-asset-hash-mismatch' });
    expect(readFormulaDocumentPrototype({ envelopeVersion: 2, document: v3, assets: undefined })).toMatchObject({ mode: 'read-only', reason: 'corrupt-envelope-assets' });
  });

  it('keeps Standard and Mine walking-skeleton loading isolated, Atlas compact, and Explore atomic', async () => {
    const directory = buildAtlasCompactDirectoryPrototype([
      { formulaId: 'standard-a', scope: 'standard', title: 'A', facets: ['classic'], preview: 'a.webp', source: 'secret', runtime: 'runtime-a' },
      { formulaId: 'mine-a', scope: 'mine', title: 'Mine', facets: ['custom'], preview: 'm.webp', source: 'mine source', runtime: 'runtime-m' },
    ]);
    expect(directory).toEqual([{ formulaId: 'standard-a', scope: 'standard', title: 'A', facets: ['classic'], preview: 'a.webp' }]);
    expect(JSON.stringify(directory)).not.toContain('source');
    expect(JSON.stringify(directory)).not.toContain('runtime');

    const current = { formulaId: 'previous', profile: { iterations: 50 } };
    await expect(applyExploreFormulaSelectionPrototype(current, 'standard-a', async (id) => ({ formulaId: id, profile: { iterations: 100 } }))).resolves.toEqual({ formulaId: 'standard-a', profile: { iterations: 100 } });
    await expect(applyExploreFormulaSelectionPrototype(current, 'mine-a', async () => { throw new Error('unavailable'); })).resolves.toEqual(current);
  });
});
