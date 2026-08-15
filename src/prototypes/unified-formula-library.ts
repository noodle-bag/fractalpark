import { createHash, randomUUID } from 'node:crypto';

/**
 * Slice 0 evidence only. This module is imported by focused tests and is not a
 * production parser, reader, writer, route, or client bundle dependency.
 */

export type FormulaParameterTypePrototype = 'real' | 'complex' | 'function';
export type FormulaParameterDefaultPrototype = number | [number, number] | string;
export type ClassicBindingPrototype =
  | 'p1'
  | 'p2'
  | 'p3'
  | 'p4'
  | 'p5'
  | 'fn1'
  | 'fn2'
  | 'fn3'
  | 'fn4';

export interface FormulaParameterPrototype {
  name: string;
  type: FormulaParameterTypePrototype;
  default: FormulaParameterDefaultPrototype;
  hardDomain?: [number, number];
  classicBinding?: ClassicBindingPrototype;
}

export interface FormulaSemanticPrototype {
  directives: {
    language: 'frm-like/1';
    stdlib: 1;
    numericProfile: 'standard32';
  };
  formulaName: string;
  parameters: FormulaParameterPrototype[];
  init: string[];
  loop: string[];
  bailout: string;
}

export type FormulaParseResultPrototype =
  | { ok: true; source: string; formulaName: string; parameters: FormulaParameterPrototype[]; semantic: FormulaSemanticPrototype }
  | { ok: false; reason: string; line?: number };

const IMMUTABLE_SYSTEM_NAMES = new Set([
  'pixel', 'c', 'zPrev', 'LastSqr', 'pi', 'e', 'maxit', 'ismand',
  'p1', 'p2', 'p3', 'p4', 'p5', 'fn1', 'fn2', 'fn3', 'fn4',
]);
const WRITABLE_SYSTEM_NAMES = new Set(['z']);
const SECTION_NAMES = new Set(['parameters', 'init', 'loop', 'bailout']);
const SEMANTIC_DIRECTIVES = new Set(['language', 'stdlib', 'numeric-profile']);
const STDLIB_FUNCTIONS = new Set([
  'abs', 'sqr', 'sqrt', 'exp', 'log', 'recip', 'conj', 'flip', 'real', 'imag',
  'cabs', 'round', 'atan2', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan',
  'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh', 'cotanh', 'cosxx',
]);
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const REAL_LITERAL = /^(?:-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)$/;
const PARAMETER_LINE = /^(\w+)\s*:\s*(real|complex|function)\s*=\s*(.+?)(?:\s+domain\s*\[\s*([^,\]]+)\s*,\s*([^\]]+)\s*\])?(?:\s+classic\s+(p[1-5]|fn[1-4]))?\s*$/;

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** Mine uses the same opaque UUID shape but never the deterministic Standard namespace. */
export function generateMineFormulaIdPrototype(): string {
  return randomUUID();
}

function parseReal(value: string): number | undefined {
  if (!REAL_LITERAL.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function semanticStatement(line: string): string {
  return line
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\s*([=+\-*/^|<>!(),\[\]])\s*/g, '$1');
}

function parseSemanticStatement(
  line: string,
  number: number,
): string | FormulaParseResultPrototype {
  const executable = line.replace(/\s+;.*$/, '').trim();
  if (
    executable.length === 0
    || /[;@]/.test(executable)
    || /[^A-Za-z0-9_+\-*/^|<>=!(),.\[\]\s]/.test(executable)
  ) {
    return { ok: false, reason: 'unsupported-statement-token', line: number };
  }
  return semanticStatement(executable);
}

function nonCommentLines(source: string): Array<{ text: string; number: number }> {
  return source.replace(/\r\n/g, '\n').split('\n').map((text, index) => ({ text, number: index + 1 }));
}

function parseParameter(line: string, number: number): FormulaParameterPrototype | FormulaParseResultPrototype {
  const match = PARAMETER_LINE.exec(line.trim());
  if (!match) return { ok: false, reason: 'invalid-parameter-declaration', line: number };
  const [, name, type, rawDefault, rawMin, rawMax, rawBinding] = match;
  if (!IDENTIFIER.test(name)) return { ok: false, reason: 'invalid-parameter-name', line: number };
  if (
    IMMUTABLE_SYSTEM_NAMES.has(name)
    || WRITABLE_SYSTEM_NAMES.has(name)
    || SECTION_NAMES.has(name)
    || STDLIB_FUNCTIONS.has(name)
  ) {
    return { ok: false, reason: 'reserved-name', line: number };
  }
  const parameter: FormulaParameterPrototype = { name, type: type as FormulaParameterTypePrototype, default: 0 };
  if (type === 'real') {
    const value = parseReal(rawDefault);
    if (value === undefined) return { ok: false, reason: 'invalid-real-default', line: number };
    parameter.default = value;
    if ((rawMin === undefined) !== (rawMax === undefined)) return { ok: false, reason: 'invalid-domain', line: number };
    if (rawMin !== undefined && rawMax !== undefined) {
      const min = parseReal(rawMin.trim());
      const max = parseReal(rawMax.trim());
      if (min === undefined || max === undefined || min > max) return { ok: false, reason: 'invalid-domain', line: number };
      if (value < min || value > max) return { ok: false, reason: 'default-out-of-domain', line: number };
      parameter.hardDomain = [min, max];
    }
  } else if (type === 'complex') {
    if (rawMin !== undefined) return { ok: false, reason: 'complex-domain-not-supported', line: number };
    const complex = /^\(\s*(.+?)\s*,\s*(.+?)\s*\)$/.exec(rawDefault);
    if (!complex) return { ok: false, reason: 'invalid-complex-default', line: number };
    const real = parseReal(complex[1]);
    const imaginary = parseReal(complex[2]);
    if (real === undefined || imaginary === undefined) return { ok: false, reason: 'invalid-complex-default', line: number };
    parameter.default = [real, imaginary];
  } else {
    if (rawMin !== undefined) return { ok: false, reason: 'function-domain-not-supported', line: number };
    if (!STDLIB_FUNCTIONS.has(rawDefault)) return { ok: false, reason: 'unknown-stdlib-function', line: number };
    parameter.default = rawDefault;
  }
  if (
    rawBinding
    && ((type === 'function' && !rawBinding.startsWith('fn'))
      || (type !== 'function' && !rawBinding.startsWith('p')))
  ) {
    return { ok: false, reason: 'invalid-classic-binding', line: number };
  }
  if (rawBinding) parameter.classicBinding = rawBinding as ClassicBindingPrototype;
  return parameter;
}

function validateReads(statements: string[], parameters: FormulaParameterPrototype[]): FormulaParseResultPrototype | undefined {
  const parameterNames = new Set(parameters.map(({ name }) => name));
  const available = new Set([
    ...parameterNames,
    ...IMMUTABLE_SYSTEM_NAMES,
    ...WRITABLE_SYSTEM_NAMES,
    ...STDLIB_FUNCTIONS,
  ]);
  const locals = new Set<string>();
  for (const statement of statements) {
    const assignment = /^([A-Za-z_]\w*)\s*=/.exec(statement.trim());
    const target = assignment?.[1];
    const identifiers = statement.match(/[A-Za-z_]\w*/g) ?? [];
    for (const name of identifiers) {
      if (name === target || available.has(name) || locals.has(name)) continue;
      return { ok: false, reason: 'undeclared-read' };
    }
    if (assignment) {
      const assignedName = assignment[1];
      if (
        IMMUTABLE_SYSTEM_NAMES.has(assignedName)
        || SECTION_NAMES.has(assignedName)
        || STDLIB_FUNCTIONS.has(assignedName)
        || parameterNames.has(assignedName)
      ) {
        return { ok: false, reason: 'reserved-assignment' };
      }
      if (!WRITABLE_SYSTEM_NAMES.has(assignedName)) locals.add(assignedName);
    }
  }
  return undefined;
}

/** Parses only the Slice 0 candidate grammar; it is deliberately not wired to runtime compilation. */
export function parseFormulaCandidatePrototype(source: string): FormulaParseResultPrototype {
  if (Buffer.byteLength(source, 'utf8') > 65_536) {
    return { ok: false, reason: 'source-too-large' };
  }
  const lines = nonCommentLines(source);
  const directives = new Map<string, string>();
  let index = 0;
  while (index < lines.length && (lines[index].text.trim() === '' || lines[index].text.trim().startsWith(';'))) {
    const match = /^\s*;\s*@([a-z-]+):\s*(.+)\s*$/.exec(lines[index].text);
    if (match) {
      const [, name, value] = match;
      if (!SEMANTIC_DIRECTIVES.has(name)) {
        return { ok: false, reason: 'unknown-semantic-directive', line: lines[index].number };
      }
      if (directives.has(name)) {
        return { ok: false, reason: 'duplicate-semantic-directive', line: lines[index].number };
      }
      directives.set(name, value);
    }
    index += 1;
  }
  if (directives.get('language') !== 'frm-like/1' || directives.get('stdlib') !== '1' || directives.get('numeric-profile') !== 'standard32') {
    return { ok: false, reason: 'invalid-semantic-directives' };
  }
  const opening = /^\s*([A-Za-z_]\w*)\s*\{\s*$/.exec(lines[index]?.text ?? '');
  if (!opening) return { ok: false, reason: 'invalid-formula-header', line: lines[index]?.number };
  const formulaName = opening[1];
  if (
    IMMUTABLE_SYSTEM_NAMES.has(formulaName)
    || WRITABLE_SYSTEM_NAMES.has(formulaName)
    || SECTION_NAMES.has(formulaName)
    || STDLIB_FUNCTIONS.has(formulaName)
  ) {
    return { ok: false, reason: 'reserved-formula-name', line: lines[index]?.number };
  }
  index += 1;
  let section: 'parameters' | 'init' | 'loop' | 'bailout' | undefined;
  const parameters: FormulaParameterPrototype[] = [];
  const statements = { init: [] as string[], loop: [] as string[], bailout: '' };
  const bindings = new Set<string>();
  const sectionOrder = { parameters: 0, init: 1, loop: 2, bailout: 3 } as const;
  const seenSections = new Set<keyof typeof sectionOrder>();
  let lastSectionOrder = -1;
  let closed = false;
  for (; index < lines.length; index += 1) {
    const { text, number } = lines[index];
    const trimmed = text.trim();
    if (trimmed === '') continue;
    if (trimmed.startsWith(';')) {
      if (/^;\s*@/.test(trimmed)) {
        return { ok: false, reason: 'misplaced-semantic-directive', line: number };
      }
      continue;
    }
    if (trimmed === '}') { closed = true; index += 1; break; }
    const sectionMatch = /^(parameters|init|loop|bailout):\s*$/.exec(trimmed);
    if (sectionMatch) {
      const nextSection = sectionMatch[1] as keyof typeof sectionOrder;
      if (seenSections.has(nextSection)) {
        return { ok: false, reason: 'duplicate-section', line: number };
      }
      if (sectionOrder[nextSection] <= lastSectionOrder) {
        return { ok: false, reason: 'invalid-section-order', line: number };
      }
      seenSections.add(nextSection);
      lastSectionOrder = sectionOrder[nextSection];
      section = nextSection;
      continue;
    }
    if (!section) return { ok: false, reason: 'statement-before-section', line: number };
    if (section === 'parameters') {
      const parsed = parseParameter(text, number);
      if ('ok' in parsed && !parsed.ok) return parsed;
      const parameter = parsed as FormulaParameterPrototype;
      if (parameters.some(({ name }) => name === parameter.name)) return { ok: false, reason: 'duplicate-parameter', line: number };
      if (parameter.classicBinding && bindings.has(parameter.classicBinding)) return { ok: false, reason: 'duplicate-classic-binding', line: number };
      if (parameter.classicBinding) bindings.add(parameter.classicBinding);
      parameters.push(parameter);
    } else if (section === 'bailout') {
      if (statements.bailout) return { ok: false, reason: 'duplicate-bailout', line: number };
      const parsedStatement = parseSemanticStatement(text, number);
      if (typeof parsedStatement !== 'string') return parsedStatement;
      statements.bailout = parsedStatement;
    } else {
      const parsedStatement = parseSemanticStatement(text, number);
      if (typeof parsedStatement !== 'string') return parsedStatement;
      statements[section].push(parsedStatement);
    }
  }
  if (!closed) return { ok: false, reason: 'missing-formula-close' };
  const trailingLines = lines.slice(index);
  const misplacedDirective = trailingLines.find(({ text }) => /^\s*;\s*@/.test(text));
  if (misplacedDirective) {
    return { ok: false, reason: 'misplaced-semantic-directive', line: misplacedDirective.number };
  }
  if (trailingLines.some(({ text }) => text.trim() !== '' && !text.trim().startsWith(';'))) {
    return { ok: false, reason: 'trailing-executable-tokens' };
  }
  if (!seenSections.has('init')) return { ok: false, reason: 'missing-init-section' };
  if (!seenSections.has('loop')) return { ok: false, reason: 'missing-loop-section' };
  if (!seenSections.has('bailout') || !statements.bailout) return { ok: false, reason: 'missing-bailout' };
  const readsFailure = validateReads([...statements.init, ...statements.loop, statements.bailout], parameters);
  if (readsFailure) return readsFailure;
  const semantic: FormulaSemanticPrototype = {
    directives: { language: 'frm-like/1', stdlib: 1, numericProfile: 'standard32' },
    formulaName,
    parameters,
    init: statements.init,
    loop: statements.loop,
    bailout: statements.bailout,
  };
  return { ok: true, source, formulaName, parameters, semantic };
}

function formatPrototypeNumber(value: number): string {
  if (!Number.isFinite(value)) throw new Error('candidate exports require finite numbers');
  return Object.is(value, -0) ? '0' : String(value);
}

function formatPrototypeParameter(parameter: FormulaParameterPrototype): string {
  let declaration = `  ${parameter.name}: ${parameter.type} = `;
  if (parameter.type === 'real') {
    declaration += formatPrototypeNumber(parameter.default as number);
    if (parameter.hardDomain) {
      declaration += ` domain [${formatPrototypeNumber(parameter.hardDomain[0])}, ${formatPrototypeNumber(parameter.hardDomain[1])}]`;
    }
  } else if (parameter.type === 'complex') {
    const [real, imaginary] = parameter.default as [number, number];
    declaration += `(${formatPrototypeNumber(real)}, ${formatPrototypeNumber(imaginary)})`;
  } else {
    declaration += parameter.default as string;
  }
  if (parameter.classicBinding) declaration += ` classic ${parameter.classicBinding}`;
  return declaration;
}

/** Emits the canonical Slice 0 candidate spelling for semantic round-trip evidence. */
export function exportFormulaCandidatePrototype(semantic: FormulaSemanticPrototype): string {
  const lines = [
    '; @language: frm-like/1',
    '; @stdlib: 1',
    '; @numeric-profile: standard32',
    `${semantic.formulaName} {`,
  ];
  if (semantic.parameters.length > 0) {
    lines.push('  parameters:', ...semantic.parameters.map(formatPrototypeParameter));
  }
  lines.push(
    '  init:',
    ...semantic.init.map((statement) => `    ${statement}`),
    '  loop:',
    ...semantic.loop.map((statement) => `    ${statement}`),
    '  bailout:',
    `    ${semantic.bailout}`,
    '}',
  );
  return lines.join('\n');
}

/** Deterministic source/semantic revision proof for the candidate grammar. */
export function revisionHashesPrototype(source: string, semantic: FormulaSemanticPrototype): { sourceRevision: string; semanticHash: string } {
  return { sourceRevision: sha256(source), semanticHash: sha256(JSON.stringify(semantic)) };
}

export type FormulaUiFieldPrototype =
  | { name: string; control: 'number'; default: number; hardDomain?: [number, number] }
  | { name: string; control: 'complex'; default: [number, number] }
  | { name: string; control: 'function'; default: string };

export function buildFormulaUiSchemaPrototype(parameters: readonly FormulaParameterPrototype[]): FormulaUiFieldPrototype[] {
  return parameters.map((parameter) => {
    if (parameter.type === 'real') return { name: parameter.name, control: 'number', default: parameter.default as number, ...(parameter.hardDomain ? { hardDomain: parameter.hardDomain } : {}) };
    if (parameter.type === 'complex') return { name: parameter.name, control: 'complex', default: parameter.default as [number, number] };
    return { name: parameter.name, control: 'function', default: parameter.default as string };
  });
}

export interface FormulaAssetLayersPrototype {
  definition: Record<string, unknown>;
  profile: Record<string, unknown>;
  record: Record<string, unknown>;
  document: Record<string, unknown>;
}

function ownsAny(layer: Record<string, unknown>, names: readonly string[]): boolean {
  return names.some((name) => Object.hasOwn(layer, name));
}

/** Minimal ownership-drift proof for the four frozen asset layers. */
export function validateFormulaAssetLayersPrototype(
  layers: FormulaAssetLayersPrototype,
): string[] {
  const failures: string[] = [];
  if (!Object.hasOwn(layers.definition, 'source') || !Object.hasOwn(layers.definition, 'parameterSchema')) {
    failures.push('definition-missing-source-contract');
  }
  if (ownsAny(layers.definition, ['view', 'palette', 'title', 'history', 'references'])) {
    failures.push('definition-owns-foreign-fields');
  }
  if (!Object.hasOwn(layers.profile, 'formulaId') || !Object.hasOwn(layers.profile, 'resolvedParameters')) {
    failures.push('profile-missing-state-contract');
  }
  if (ownsAny(layers.profile, ['source', 'canonicalSource', 'rightsClass', 'history', 'references'])) {
    failures.push('profile-owns-foreign-fields');
  }
  if (!Object.hasOwn(layers.record, 'formulaId') || !Object.hasOwn(layers.record, 'title')) {
    failures.push('record-missing-content-contract');
  }
  if (ownsAny(layers.record, ['source', 'parameterSchema', 'resolvedParameters', 'view', 'palette', 'runtime'])) {
    failures.push('record-owns-executable-state');
  }
  if (!Object.hasOwn(layers.document, 'formulaSnapshot')) {
    failures.push('document-missing-snapshot');
  }
  if (ownsAny(layers.document, ['history', 'references', 'rightsClass'])) {
    failures.push('document-owns-record-content');
  }
  return failures;
}

export interface FormulaSnapshotPrototype {
  schemaVersion: 1;
  formulaId: string;
  scope: 'standard' | 'mine' | 'community';
  source: string;
  sourceRevision: string;
  semanticHash: string;
  languageVersion: 'frm-like/1';
  stdlibVersion: 1;
  numericProfile: string;
  parameterSchema: FormulaParameterPrototype[];
  resolvedParameters: Record<string, FormulaParameterDefaultPrototype>;
  mode: 'parameter-plane' | 'julia';
  iterations: number;
  termination: { predicateMeaning: 'continue-iteration'; nonFinite: 'terminate-with-event'; maximumIterations: 'profile-resolved' };
  channels: string[];
}

export type FormulaReadResultPrototype =
  | {
    mode: 'readable';
    source: 'legacy-v2' | 'legacy-envelope-v1' | 'document-v3' | 'envelope-v2';
    writer: 'legacy-only' | 'disabled';
  }
  | { mode: 'read-only'; reason: string };

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const UUID_V5_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasValidScopedFormulaId(scope: unknown, formulaId: unknown): boolean {
  if (typeof formulaId !== 'string') return false;
  if (scope === 'standard') return UUID_V5_PATTERN.test(formulaId);
  if (scope === 'mine' || scope === 'community') return UUID_V4_PATTERN.test(formulaId);
  return false;
}

function validateResolvedParameters(
  schema: readonly FormulaParameterPrototype[],
  resolved: unknown,
): boolean {
  if (!isRecord(resolved)) return false;
  const expectedNames = schema.map(({ name }) => name).sort();
  if (JSON.stringify(Object.keys(resolved).sort()) !== JSON.stringify(expectedNames)) return false;
  return schema.every((parameter) => {
    const current = resolved[parameter.name];
    if (parameter.type === 'real') {
      if (typeof current !== 'number' || !Number.isFinite(current)) return false;
      return !parameter.hardDomain
        || (current >= parameter.hardDomain[0] && current <= parameter.hardDomain[1]);
    }
    if (parameter.type === 'complex') {
      return Array.isArray(current)
        && current.length === 2
        && current.every((part) => typeof part === 'number' && Number.isFinite(part));
    }
    return typeof current === 'string' && STDLIB_FUNCTIONS.has(current);
  });
}

function validateSnapshot(snapshot: unknown): FormulaReadResultPrototype | undefined {
  if (!isRecord(snapshot)) return { mode: 'read-only', reason: 'corrupt-document' };
  const value = snapshot as Partial<FormulaSnapshotPrototype>;
  if (
    value.schemaVersion !== 1
    || !hasValidScopedFormulaId(value.scope, value.formulaId)
    || typeof value.source !== 'string'
    || value.languageVersion !== 'frm-like/1'
    || value.stdlibVersion !== 1
    || !Array.isArray(value.parameterSchema)
    || !['parameter-plane', 'julia'].includes(value.mode ?? '')
    || !Number.isInteger(value.iterations)
    || (value.iterations ?? 0) < 1
    || (value.iterations ?? 0) > 1_000_000
    || !Array.isArray(value.channels)
    || !value.channels.every((channel) => typeof channel === 'string')
  ) {
    return { mode: 'read-only', reason: 'corrupt-document' };
  }
  if (value.numericProfile !== 'standard32') {
    return { mode: 'read-only', reason: 'unsupported-numeric-profile' };
  }
  if (
    !isRecord(value.termination)
    || value.termination.predicateMeaning !== 'continue-iteration'
    || value.termination.nonFinite !== 'terminate-with-event'
    || value.termination.maximumIterations !== 'profile-resolved'
  ) {
    return { mode: 'read-only', reason: 'corrupt-document' };
  }
  const parsed = parseFormulaCandidatePrototype(value.source);
  if (!parsed.ok) return { mode: 'read-only', reason: 'unsafe-source' };
  if (JSON.stringify(value.parameterSchema) !== JSON.stringify(parsed.parameters)) {
    return { mode: 'read-only', reason: 'parameter-schema-mismatch' };
  }
  if (!validateResolvedParameters(parsed.parameters, value.resolvedParameters)) {
    return { mode: 'read-only', reason: 'resolved-parameter-mismatch' };
  }
  const hashes = revisionHashesPrototype(value.source, parsed.semantic);
  if (hashes.sourceRevision !== value.sourceRevision) {
    return { mode: 'read-only', reason: 'source-revision-mismatch' };
  }
  if (hashes.semanticHash !== value.semanticHash) {
    return { mode: 'read-only', reason: 'semantic-hash-mismatch' };
  }
  return undefined;
}

function hasDurableDocumentState(document: Record<string, unknown>): boolean {
  return ['scene', 'formula', 'coloring', 'transform', 'render']
    .every((field) => isRecord(document[field]));
}

function validateEnvelopeAssets(assets: unknown): FormulaReadResultPrototype | undefined {
  if (!Array.isArray(assets)) return { mode: 'read-only', reason: 'corrupt-envelope-assets' };
  for (const asset of assets) {
    if (
      !isRecord(asset)
      || typeof asset.kind !== 'string'
      || typeof asset.mediaType !== 'string'
      || typeof asset.sha256 !== 'string'
      || !/^[0-9a-f]{64}$/.test(asset.sha256)
      || typeof asset.bytesBase64 !== 'string'
      || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(asset.bytesBase64)
    ) {
      return { mode: 'read-only', reason: 'corrupt-envelope-assets' };
    }
    const bytes = Buffer.from(asset.bytesBase64, 'base64');
    if (createHash('sha256').update(bytes).digest('hex') !== asset.sha256) {
      return { mode: 'read-only', reason: 'envelope-asset-hash-mismatch' };
    }
  }
  return undefined;
}

/** Reader-only v3/v2 prototype. No writers or production format activation are included. */
export function readFormulaDocumentPrototype(input: unknown): FormulaReadResultPrototype {
  if (!isRecord(input)) return { mode: 'read-only', reason: 'corrupt-document' };
  const envelopeVersion = input.envelopeVersion;
  if (envelopeVersion !== undefined) {
    if (typeof envelopeVersion !== 'number' || !Number.isInteger(envelopeVersion)) {
      return { mode: 'read-only', reason: 'corrupt-document' };
    }
    if (envelopeVersion > 2) return { mode: 'read-only', reason: 'future-envelope-version' };
    if (!isRecord(input.document)) return { mode: 'read-only', reason: 'corrupt-document' };
    const documentVersion = input.document.schemaVersion;
    if (envelopeVersion === 1) {
      return documentVersion === 2 && hasDurableDocumentState(input.document)
        ? { mode: 'readable', source: 'legacy-envelope-v1', writer: 'legacy-only' }
        : { mode: 'read-only', reason: 'corrupt-document' };
    }
    if (envelopeVersion !== 2) return { mode: 'read-only', reason: 'corrupt-document' };
    if (typeof documentVersion === 'number' && documentVersion > 3) {
      return { mode: 'read-only', reason: 'future-document-version' };
    }
    if (documentVersion !== 3 || !hasDurableDocumentState(input.document)) {
      return { mode: 'read-only', reason: 'corrupt-document' };
    }
    const invalidAssets = validateEnvelopeAssets(input.assets);
    if (invalidAssets) return invalidAssets;
    const invalid = validateSnapshot(input.document.formulaSnapshot);
    return invalid ?? { mode: 'readable', source: 'envelope-v2', writer: 'disabled' };
  }
  const schemaVersion = input.schemaVersion;
  if (schemaVersion === 2) {
    return hasDurableDocumentState(input)
      ? { mode: 'readable', source: 'legacy-v2', writer: 'legacy-only' }
      : { mode: 'read-only', reason: 'corrupt-document' };
  }
  if (schemaVersion === 3) {
    if (!hasDurableDocumentState(input)) {
      return { mode: 'read-only', reason: 'corrupt-document' };
    }
    const invalid = validateSnapshot(input.formulaSnapshot);
    return invalid ?? { mode: 'readable', source: 'document-v3', writer: 'disabled' };
  }
  return {
    mode: 'read-only',
    reason: typeof schemaVersion === 'number' && schemaVersion > 3
      ? 'future-document-version'
      : 'corrupt-document',
  };
}

export interface FormulaDirectoryCandidatePrototype {
  formulaId: string;
  scope: 'standard' | 'mine';
  title: string;
  facets: string[];
  preview: string;
  source: string;
  runtime: string;
}

export interface AtlasCompactEntryPrototype {
  formulaId: string;
  scope: 'standard';
  title: string;
  facets: string[];
  preview: string;
}

/** Atlas selector intentionally drops source/runtime and excludes Mine assets from its initial directory. */
export function buildAtlasCompactDirectoryPrototype(candidates: readonly FormulaDirectoryCandidatePrototype[]): AtlasCompactEntryPrototype[] {
  return candidates
    .filter((candidate): candidate is FormulaDirectoryCandidatePrototype & { scope: 'standard' } => candidate.scope === 'standard')
    .map(({ formulaId, scope, title, facets, preview }) => ({ formulaId, scope, title, facets: [...facets], preview }));
}

/** Explore selector has one success boundary: failed loads retain the exact last successful document. */
export async function applyExploreFormulaSelectionPrototype<T>(current: T, formulaId: string, load: (formulaId: string) => Promise<T>): Promise<T> {
  try {
    return await load(formulaId);
  } catch {
    return current;
  }
}
