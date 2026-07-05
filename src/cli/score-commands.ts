import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { createSuccess, CliCommandError, docFromPreset } from '@/cli/doc-commands';
import type { FractalDocument } from '@/engine/document';
import { FORMULA_CATALOG } from '@/engine/plugins/formula-catalog';
import { documentToExploreHref } from '@/lib/url-params';
import { parseGalleryPresetsFile } from '@/lib/gallery-presets';

type JsonRecord = Record<string, unknown>;

type CandidateTargetTags = {
  style: string[];
  structural: string[];
  portfolioRole: string[];
};

type CandidateMutationTraceStep = {
  kind: string;
  summary: string;
  details?: Record<string, unknown>;
};

type CandidateRecord = {
  id: string;
  runId?: string;
  shardIndex?: number;
  seedId?: string;
  document: FractalDocument;
  mutationTrace: CandidateMutationTraceStep[];
  targetTags: CandidateTargetTags;
  metadata?: Record<string, unknown>;
};

type RenderManifestItem = {
  id: string;
  output: string;
  href: string;
  url: string;
  summary: {
    formulaId: string;
    isJulia: boolean;
    paletteIndex: number;
    outsideColoringId: string;
    insideColoringId: string;
    transformId: string;
    bounds: {
      centerX: number;
      centerY: number;
      zoom: number;
      rotation: number;
    };
  };
};

type RenderManifest = {
  mode: 'thumbnail' | 'screenshot';
  locale: string;
  items: RenderManifestItem[];
};

type ImageMetrics = {
  blackRatio: number;
  brightRatio: number;
  contrastStdDev: number;
  entropy: number;
  edgeDensity: number;
  centerEnergyRatio: number;
  colorfulness: number;
};

type QualityGateDecision = 'keep' | 'maybe' | 'reject';

type ScoredCandidateRecord = {
  id: string;
  runId?: string;
  shardIndex?: number;
  seedId?: string;
  document: FractalDocument;
  mutationTrace: CandidateMutationTraceStep[];
  targetTags: CandidateTargetTags;
  render: RenderManifestItem;
  portfolio: {
    signature: string;
    family?: string;
    overlapWithFeatured: boolean;
    overlapReasons: string[];
  };
  scoring: {
    total: number;
    qualityGate: QualityGateDecision;
    componentScores: {
      contrast: number;
      entropy: number;
      edge: number;
      center: number;
      colorDiscipline: number;
      animationPotential: number;
      portfolioDiversity: number;
      structuralMystery: number;
    };
    metrics: ImageMetrics;
    labels: string[];
    penalties: string[];
    rationale: string[];
  };
};

type ShortlistRecord = ScoredCandidateRecord & {
  rank: number;
  adjustedScore: number;
  selectionReasons: string[];
};

type PortfolioSignature = {
  id: string;
  signature: string;
  family?: string;
  formulaId: string;
  transformId: string;
  outsideColoringId: string;
  insideColoringId: string;
  isJulia: boolean;
};

function deriveExploreUrl(renderItem: RenderManifestItem, document: FractalDocument): string {
  const parsed = new URL(renderItem.url);
  const localeMatch = renderItem.href.match(/^\/([a-z-]+)\//i);
  const locale = localeMatch?.[1] ?? 'en';
  return new URL(documentToExploreHref(document, locale), `${parsed.protocol}//${parsed.host}`).toString();
}

function asObject(value: unknown): JsonRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new CliCommandError('INVALID_INPUT', 1, 'Expected a JSON object input.');
  }
  return value as JsonRecord;
}

function normalizeDocumentInput(input: unknown): FractalDocument {
  const value = asObject(input);
  if (typeof value.schemaVersion !== 'number') {
    throw new CliCommandError('INVALID_INPUT', 1, 'Expected a FractalDocument payload.');
  }
  return value as unknown as FractalDocument;
}

function readJsonFile(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'));
}

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeScore(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  return clamp((value - min) / (max - min), 0, 1);
}

function familyForFormula(formulaId: string): string | undefined {
  return FORMULA_CATALOG.find((item) => item.id === formulaId)?.family;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function signatureForDocument(document: FractalDocument): string {
  return [
    document.formula.formulaId,
    document.formula.isJulia ? 'j' : 'm',
    document.transform.transformId,
    document.coloring.outsideColoringId,
    document.coloring.insideColoringId,
    document.coloring.paletteIndex,
  ].join('|');
}

function parseJsonLines<T>(input: string, mapper: (value: unknown, index: number) => T): T[] {
  const lines = input
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    throw new CliCommandError('INVALID_INPUT', 1, 'Expected non-empty JSONL input.');
  }

  return lines.map((line, index) => {
    try {
      return mapper(JSON.parse(line), index);
    } catch (error) {
      if (error instanceof CliCommandError) throw error;
      throw new CliCommandError('INVALID_INPUT', 1, `Invalid JSONL entry at line ${index + 1}.`, {
        line: index + 1,
        cause: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

export function normalizeScoringCandidates(input: unknown): CandidateRecord[] {
  if (Array.isArray(input)) {
    return input.map((value, index) => normalizeScoringCandidate(value, index));
  }

  if (typeof input === 'string') {
    return parseJsonLines(input, normalizeScoringCandidate);
  }

  throw new CliCommandError('INVALID_INPUT', 1, 'Expected candidate JSONL or array input.');
}

function normalizeScoringCandidate(value: unknown, index: number): CandidateRecord {
  const record = asObject(value);
  const targetTagsRecord = typeof record.targetTags === 'object' && record.targetTags !== null ? (record.targetTags as Record<string, unknown>) : undefined;
  return {
    id: typeof record.id === 'string' ? record.id : `candidate-${String(index + 1).padStart(3, '0')}`,
    runId: typeof record.runId === 'string' ? record.runId : undefined,
    shardIndex: typeof record.shardIndex === 'number' ? record.shardIndex : undefined,
    seedId: typeof record.seedId === 'string' ? record.seedId : undefined,
    document: normalizeDocumentInput(record.document),
    mutationTrace: Array.isArray(record.mutationTrace) ? (record.mutationTrace as CandidateMutationTraceStep[]) : [],
    targetTags: {
      style: Array.isArray(targetTagsRecord?.style) ? (targetTagsRecord.style as string[]) : [],
      structural: Array.isArray(targetTagsRecord?.structural) ? (targetTagsRecord.structural as string[]) : [],
      portfolioRole: Array.isArray(targetTagsRecord?.portfolioRole) ? (targetTagsRecord.portfolioRole as string[]) : [],
    },
    metadata: typeof record.metadata === 'object' && record.metadata !== null ? (record.metadata as Record<string, unknown>) : undefined,
  };
}

function normalizeRenderManifest(input: unknown): RenderManifest {
  const record = asObject(input);
  if (!Array.isArray(record.items)) {
    throw new CliCommandError('INVALID_INPUT', 1, 'Expected render manifest with items array.');
  }

  return {
    mode: record.mode === 'screenshot' ? 'screenshot' : 'thumbnail',
    locale: typeof record.locale === 'string' ? record.locale : 'en',
    items: record.items.map((item, index) => {
      const entry = asObject(item);
      return {
        id: typeof entry.id === 'string' ? entry.id : `candidate-${String(index + 1).padStart(3, '0')}`,
        output: typeof entry.output === 'string' ? entry.output : '',
        href: typeof entry.href === 'string' ? entry.href : '',
        url: typeof entry.url === 'string' ? entry.url : '',
        summary: asObject(entry.summary) as RenderManifestItem['summary'],
      };
    }),
  };
}

async function analyzeImage(imagePath: string): Promise<ImageMetrics> {
  const { data, info } = await sharp(imagePath)
    .resize(96, 96, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const channels = info.channels;
  if (channels < 3) {
    throw new CliCommandError('INVALID_INPUT', 1, `Expected RGB image for scoring: ${imagePath}`);
  }

  const width = info.width;
  const height = info.height;
  const grayscale: number[] = [];
  const histogram = new Array<number>(16).fill(0);
  let blackCount = 0;
  let brightCount = 0;
  let sum = 0;
  let sumSquares = 0;
  let rgMean = 0;
  let ybMean = 0;
  let rgSquares = 0;
  let ybSquares = 0;

  for (let index = 0; index < data.length; index += channels) {
    const r = data[index] ?? 0;
    const g = data[index + 1] ?? 0;
    const b = data[index + 2] ?? 0;
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    grayscale.push(luminance);
    sum += luminance;
    sumSquares += luminance * luminance;
    histogram[Math.min(15, Math.floor(luminance / 16))] += 1;
    if (luminance < 18) blackCount += 1;
    if (luminance > 238) brightCount += 1;

    const rg = r - g;
    const yb = (r + g) * 0.5 - b;
    rgMean += rg;
    ybMean += yb;
    rgSquares += rg * rg;
    ybSquares += yb * yb;
  }

  const totalPixels = grayscale.length;
  const mean = sum / totalPixels;
  const variance = Math.max(0, sumSquares / totalPixels - mean * mean);
  const contrastStdDev = Math.sqrt(variance);

  let entropy = 0;
  for (const count of histogram) {
    if (count === 0) continue;
    const probability = count / totalPixels;
    entropy -= probability * Math.log2(probability);
  }

  let edgeHits = 0;
  let edgeCount = 0;
  let centerEnergy = 0;
  let outerEnergy = 0;
  let centerEdgeCount = 0;
  let outerEdgeCount = 0;
  const centerXMin = width * 0.25;
  const centerXMax = width * 0.75;
  const centerYMin = height * 0.25;
  const centerYMax = height * 0.75;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const current = grayscale[index] ?? 0;

      if (x + 1 < width) {
        const diff = Math.abs(current - (grayscale[index + 1] ?? 0));
        edgeCount += 1;
        if (diff > 24) edgeHits += 1;
        const inCenter = x >= centerXMin && x <= centerXMax && y >= centerYMin && y <= centerYMax;
        if (inCenter) {
          centerEnergy += diff;
          centerEdgeCount += 1;
        } else {
          outerEnergy += diff;
          outerEdgeCount += 1;
        }
      }

      if (y + 1 < height) {
        const diff = Math.abs(current - (grayscale[index + width] ?? 0));
        edgeCount += 1;
        if (diff > 24) edgeHits += 1;
        const inCenter = x >= centerXMin && x <= centerXMax && y >= centerYMin && y <= centerYMax;
        if (inCenter) {
          centerEnergy += diff;
          centerEdgeCount += 1;
        } else {
          outerEnergy += diff;
          outerEdgeCount += 1;
        }
      }
    }
  }

  const rgAvg = rgMean / totalPixels;
  const ybAvg = ybMean / totalPixels;
  const rgStd = Math.sqrt(Math.max(0, rgSquares / totalPixels - rgAvg * rgAvg));
  const ybStd = Math.sqrt(Math.max(0, ybSquares / totalPixels - ybAvg * ybAvg));
  const colorfulness = Math.sqrt(rgStd * rgStd + ybStd * ybStd) + 0.3 * Math.sqrt(rgAvg * rgAvg + ybAvg * ybAvg);

  return {
    blackRatio: blackCount / totalPixels,
    brightRatio: brightCount / totalPixels,
    contrastStdDev,
    entropy,
    edgeDensity: edgeCount === 0 ? 0 : edgeHits / edgeCount,
    centerEnergyRatio:
      outerEdgeCount === 0 || outerEnergy === 0 ? 1 : (centerEnergy / Math.max(centerEdgeCount, 1)) / (outerEnergy / outerEdgeCount),
    colorfulness,
  };
}

function scoreImageMetrics(metrics: ImageMetrics, document: FractalDocument, targetTags: CandidateTargetTags, overlapReasons: string[]): ScoredCandidateRecord['scoring'] {
  const contrastScore = normalizeScore(metrics.contrastStdDev, 14, 80) * 20;
  const entropyScore = normalizeScore(metrics.entropy, 2.6, 3.9) * 18;
  const edgeScore = normalizeScore(metrics.edgeDensity, 0.03, 0.24) * 18;
  const centerScore = (1 - Math.abs(clamp(metrics.centerEnergyRatio, 0, 3) - 1) / 2) * 10;
  const colorDisciplineScore = (1 - normalizeScore(metrics.colorfulness, 48, 110)) * 10;
  const animationPotential = (((document.animation?.keyframes.length ?? 0) > 1 ? 1 : 0) + (document.scene.bounds.zoom > 20 ? 0.5 : 0)) * 3;

  const structuralMystery =
    normalizeScore(metrics.entropy, 2.9, 3.9) * 4 +
    normalizeScore(metrics.edgeDensity, 0.05, 0.22) * 3 +
    normalizeScore(metrics.centerEnergyRatio, 0.85, 1.55) * 3;

  const portfolioDiversity = overlapReasons.length === 0 ? 6 : overlapReasons.length === 1 ? 2.5 : 0;

  const penalties: string[] = [];
  const labels: string[] = [];
  const rationale: string[] = [];

  if (metrics.blackRatio > 0.93) penalties.push('black-field-dominant');
  if (metrics.brightRatio > 0.9) penalties.push('empty-field-dominant');
  if (metrics.contrastStdDev < 10) penalties.push('low-contrast');
  if (metrics.edgeDensity < 0.02) penalties.push('weak-structure');
  if (metrics.entropy < 2.2) penalties.push('information-exhausts-quickly');
  if (metrics.colorfulness > 72 && metrics.entropy < 3.0) penalties.push('decorative-over-structural');

  if (metrics.contrastStdDev >= 22 && metrics.edgeDensity >= 0.06) labels.push('clear-structure');
  if (metrics.entropy >= 3.15 && metrics.edgeDensity >= 0.05) labels.push('remaining-depth');
  if (metrics.centerEnergyRatio >= 1.15 && metrics.entropy >= 3.0) labels.push('strong-layering');
  if (metrics.edgeDensity >= 0.09 && metrics.contrastStdDev >= 24) labels.push('strong-boundary-tension');
  if (document.scene.bounds.zoom >= 25 || metrics.entropy >= 3.25) labels.push('dive-ready');
  if (metrics.colorfulness > 72 && metrics.entropy < 3.0) labels.push('decorative-heavy');
  if (metrics.entropy < 2.5 || metrics.edgeDensity < 0.03) labels.push('information-exhausts-quickly');
  if ((document.animation?.keyframes.length ?? 0) > 1) labels.push('animation-ready');
  labels.push(...targetTags.portfolioRole.filter((tag) => !labels.includes(tag)));

  let total =
    contrastScore +
    entropyScore +
    edgeScore +
    centerScore +
    colorDisciplineScore +
    animationPotential +
    structuralMystery +
    portfolioDiversity;

  if (targetTags.structural.includes('clear-structure')) total += 2;
  if (targetTags.structural.includes('remaining-depth')) total += 2;
  if (targetTags.structural.includes('strong-layering')) total += 2;
  if (targetTags.structural.includes('strong-boundary-tension')) total += 1.5;
  if (targetTags.structural.includes('dive-ready')) total += 1.5;

  total -= overlapReasons.length * 3;
  total -= penalties.includes('decorative-over-structural') ? 8 : 0;
  total -= penalties.includes('information-exhausts-quickly') ? 6 : 0;

  if (penalties.includes('black-field-dominant')) rationale.push('The black-field ratio is too high to form an explorable structure.');
  if (penalties.includes('low-contrast')) rationale.push('Overall contrast is weak, making the rule hard to read quickly.');
  if (penalties.includes('weak-structure')) rationale.push('Edge and structure signals are weak, so the view may feel empty or decorative.');
  if (labels.includes('clear-structure')) rationale.push('Local rules are readable and the first-screen structure appears quickly.');
  if (labels.includes('remaining-depth')) rationale.push('The image keeps enough remaining depth after the rule becomes readable.');
  if (labels.includes('strong-boundary-tension')) rationale.push('The boundary tension between stable and unstable regions is strong.');
  if (overlapReasons.length > 0) rationale.push(`Overlaps with the existing portfolio: ${overlapReasons.join(', ')}`);

  let qualityGate: QualityGateDecision = 'keep';
  if (
    penalties.includes('black-field-dominant') ||
    penalties.includes('empty-field-dominant') ||
    penalties.includes('low-contrast') ||
    penalties.includes('weak-structure')
  ) {
    qualityGate = 'reject';
  } else if (penalties.length > 0 || overlapReasons.length > 0) {
    qualityGate = 'maybe';
  }

  total = Number(clamp(total, 0, 100).toFixed(2));

  return {
    total,
    qualityGate,
    componentScores: {
      contrast: Number(contrastScore.toFixed(2)),
      entropy: Number(entropyScore.toFixed(2)),
      edge: Number(edgeScore.toFixed(2)),
      center: Number(centerScore.toFixed(2)),
      colorDiscipline: Number(colorDisciplineScore.toFixed(2)),
      animationPotential: Number(animationPotential.toFixed(2)),
      portfolioDiversity: Number(portfolioDiversity.toFixed(2)),
      structuralMystery: Number(structuralMystery.toFixed(2)),
    },
    metrics: {
      blackRatio: Number(metrics.blackRatio.toFixed(4)),
      brightRatio: Number(metrics.brightRatio.toFixed(4)),
      contrastStdDev: Number(metrics.contrastStdDev.toFixed(2)),
      entropy: Number(metrics.entropy.toFixed(3)),
      edgeDensity: Number(metrics.edgeDensity.toFixed(4)),
      centerEnergyRatio: Number(metrics.centerEnergyRatio.toFixed(3)),
      colorfulness: Number(metrics.colorfulness.toFixed(2)),
    },
    labels: Array.from(new Set(labels)),
    penalties,
    rationale: Array.from(new Set(rationale)),
  };
}

export function loadPortfolioSignatures(presetsPath?: string): PortfolioSignature[] {
  const resolvedPath = presetsPath
    ? path.resolve(presetsPath)
    : path.resolve(process.cwd(), 'public/gallery-presets.json');
  const parsed = readJsonFile(resolvedPath);
  const file = parseGalleryPresetsFile(parsed);

  return file.presets.map((preset) => {
    const document = docFromPreset({ id: preset.id, presetsPath: resolvedPath }).data.document;
    return {
      id: preset.id,
      signature: signatureForDocument(document),
      family: familyForFormula(document.formula.formulaId),
      formulaId: document.formula.formulaId,
      transformId: document.transform.transformId,
      outsideColoringId: document.coloring.outsideColoringId,
      insideColoringId: document.coloring.insideColoringId,
      isJulia: document.formula.isJulia,
    };
  });
}

function overlapReasonsForDocument(document: FractalDocument, portfolio: PortfolioSignature[]): string[] {
  const reasons: string[] = [];
  const signature = signatureForDocument(document);
  const family = familyForFormula(document.formula.formulaId);

  if (portfolio.some((item) => item.signature === signature)) {
    reasons.push('Too close to an existing featured preset formula/coloring/transform signature');
  }
  if (portfolio.some((item) => item.formulaId === document.formula.formulaId)) {
    reasons.push('Uses the same formula as an existing portfolio item');
  }
  if (family && portfolio.some((item) => item.family === family)) {
    reasons.push('Falls within the same formula family as an existing portfolio item');
  }

  return Array.from(new Set(reasons));
}

export async function scoreBatch(args: {
  input: unknown;
  renderManifest: string;
  outputDir: string;
  presetsPath?: string;
}) {
  if (!args.renderManifest) {
    throw new CliCommandError('INVALID_INPUT', 1, 'Expected --render-manifest for score batch.');
  }
  if (!args.outputDir) {
    throw new CliCommandError('INVALID_INPUT', 1, 'Expected --output-dir for score batch.');
  }

  const candidates = normalizeScoringCandidates(args.input);
  const renderManifest = normalizeRenderManifest(readJsonFile(args.renderManifest));
  const itemsById = new Map(renderManifest.items.map((item) => [item.id, item]));
  const portfolio = loadPortfolioSignatures(args.presetsPath);
  const outputDir = path.resolve(args.outputDir);
  ensureDir(outputDir);

  const scored: ScoredCandidateRecord[] = [];
  for (const candidate of candidates) {
    const renderItem = itemsById.get(candidate.id);
    if (!renderItem) {
      throw new CliCommandError('INVALID_INPUT', 1, `Missing render artifact for candidate "${candidate.id}".`);
    }
    const metrics = await analyzeImage(renderItem.output);
    const overlapReasons = overlapReasonsForDocument(candidate.document, portfolio);
    const scoring = scoreImageMetrics(metrics, candidate.document, candidate.targetTags, overlapReasons);

    scored.push({
      id: candidate.id,
      runId: candidate.runId,
      shardIndex: candidate.shardIndex,
      seedId: candidate.seedId,
      document: candidate.document,
      mutationTrace: candidate.mutationTrace,
      targetTags: candidate.targetTags,
      render: renderItem,
      portfolio: {
        signature: signatureForDocument(candidate.document),
        family: familyForFormula(candidate.document.formula.formulaId),
        overlapWithFeatured: overlapReasons.length > 0,
        overlapReasons,
      },
      scoring,
    });
  }

  const scoredPath = path.join(outputDir, 'scored.jsonl');
  fs.writeFileSync(scoredPath, `${scored.map((item) => JSON.stringify(item)).join('\n')}\n`);

  const summary = {
    count: scored.length,
    kept: scored.filter((item) => item.scoring.qualityGate === 'keep').length,
    maybe: scored.filter((item) => item.scoring.qualityGate === 'maybe').length,
    rejected: scored.filter((item) => item.scoring.qualityGate === 'reject').length,
  };
  fs.writeFileSync(
    path.join(outputDir, 'manifest.json'),
    `${JSON.stringify({ renderManifest: path.resolve(args.renderManifest), scored: scoredPath, summary }, null, 2)}\n`,
  );

  const reportLines = ['# Score Batch Summary', '', `- total: ${summary.count}`, `- keep: ${summary.kept}`, `- maybe: ${summary.maybe}`, `- reject: ${summary.rejected}`, ''];
  for (const item of [...scored].sort((a, b) => b.scoring.total - a.scoring.total)) {
    reportLines.push(`## ${item.id}`);
    reportLines.push('');
    reportLines.push(`- score: ${item.scoring.total}`);
    reportLines.push(`- gate: ${item.scoring.qualityGate}`);
    reportLines.push(`- image: \`${item.render.output}\``);
    reportLines.push(`- url: \`${item.render.url}\``);
    reportLines.push(`- labels: ${item.scoring.labels.join(' / ') || 'none'}`);
    reportLines.push(`- penalties: ${item.scoring.penalties.join(' / ') || 'none'}`);
    reportLines.push('');
  }
  fs.writeFileSync(path.join(outputDir, 'score-summary.md'), `${reportLines.join('\n')}\n`);

  return createSuccess('score batch', {
    outputDir,
    scored: scoredPath,
    count: scored.length,
    summary,
  });
}

export function normalizeScoredRecords(input: unknown): ScoredCandidateRecord[] {
  if (Array.isArray(input)) {
    return input as ScoredCandidateRecord[];
  }
  if (typeof input === 'string') {
    return parseJsonLines(input, (value) => value as ScoredCandidateRecord);
  }
  throw new CliCommandError('INVALID_INPUT', 1, 'Expected scored JSONL or array input.');
}

function candidateDiversityBonus(
  candidate: ScoredCandidateRecord,
  selected: ShortlistRecord[],
  limit: number,
): { adjusted: number; reasons: string[] } {
  let adjusted = candidate.scoring.total;
  const reasons: string[] = [];
  const family = candidate.portfolio.family ?? 'unknown';
  const familyCount = selected.filter((item) => item.portfolio.family === family).length;
  const formulaCount = selected.filter((item) => item.document.formula.formulaId === candidate.document.formula.formulaId).length;
  const signatureDuplicate = selected.some((item) => item.portfolio.signature === candidate.portfolio.signature);
  const roleNovelty = candidate.targetTags.portfolioRole.filter((tag) => !selected.some((item) => item.targetTags.portfolioRole.includes(tag)));
  const structuralNovelty = candidate.scoring.labels.filter((label) => !selected.some((item) => item.scoring.labels.includes(label)));

  if (signatureDuplicate) {
    adjusted -= 12;
    reasons.push('Too close to an already selected candidate signature');
  }
  if (formulaCount > 0) {
    adjusted -= formulaCount * 3;
    reasons.push('The same formula already appears in the shortlist');
  }
  if (familyCount >= Math.max(2, Math.ceil(limit / 4))) {
    adjusted -= 4;
    reasons.push('The same family is overrepresented');
  }
  if (roleNovelty.length > 0) {
    adjusted += Math.min(4, roleNovelty.length * 2);
    reasons.push('Fills a portfolio role');
  }
  if (structuralNovelty.length > 0) {
    adjusted += Math.min(3, structuralNovelty.length);
    reasons.push('Adds a new structural aesthetic label');
  }

  return { adjusted: Number(adjusted.toFixed(2)), reasons: Array.from(new Set(reasons)) };
}

export function selectTopRecords(records: ScoredCandidateRecord[], limit: number): ShortlistRecord[] {
  const pool = records
    .filter((item) => item.scoring.qualityGate !== 'reject')
    .sort((a, b) => b.scoring.total - a.scoring.total);
  const selected: ShortlistRecord[] = [];

  while (selected.length < limit && pool.length > 0) {
    let bestIndex = 0;
    let bestAdjusted = Number.NEGATIVE_INFINITY;
    let bestReasons: string[] = [];

    for (let index = 0; index < pool.length; index += 1) {
      const candidate = pool[index];
      const { adjusted, reasons } = candidateDiversityBonus(candidate, selected, limit);
      if (adjusted > bestAdjusted) {
        bestAdjusted = adjusted;
        bestIndex = index;
        bestReasons = reasons;
      }
    }

    const [chosen] = pool.splice(bestIndex, 1);
    selected.push({
      ...chosen,
      rank: selected.length + 1,
      adjustedScore: bestAdjusted,
      selectionReasons: bestReasons,
    });
  }

  return selected;
}

export function selectTop(args: {
  input: unknown;
  outputDir: string;
  limit?: number;
}) {
  if (!args.outputDir) {
    throw new CliCommandError('INVALID_INPUT', 1, 'Expected --output-dir for select top.');
  }
  const limit = args.limit && Number.isFinite(args.limit) ? Math.max(1, args.limit) : 12;
  const records = normalizeScoredRecords(args.input);
  const shortlisted = selectTopRecords(records, limit);
  const outputDir = path.resolve(args.outputDir);
  ensureDir(outputDir);

  const shortlistPath = path.join(outputDir, 'shortlist.json');
  const shortlistJsonlPath = path.join(outputDir, 'shortlist.jsonl');
  fs.writeFileSync(shortlistPath, `${JSON.stringify({ count: shortlisted.length, items: shortlisted }, null, 2)}\n`);
  fs.writeFileSync(shortlistJsonlPath, `${shortlisted.map((item) => JSON.stringify(item)).join('\n')}\n`);

  return createSuccess('select top', {
    outputDir,
    count: shortlisted.length,
    shortlist: shortlistPath,
    shortlistJsonl: shortlistJsonlPath,
  });
}

function normalizePresetDraftItems(input: unknown): ShortlistRecord[] {
  if (Array.isArray(input)) return input as ShortlistRecord[];
  const record = asObject(input);
  if (Array.isArray(record.items)) return record.items as ShortlistRecord[];
  if (record.document) return [record as unknown as ShortlistRecord];
  throw new CliCommandError('INVALID_INPUT', 1, 'Expected shortlist JSON or shortlist item for preset draft.');
}

function placeholderName(document: FractalDocument): string {
  return `TODO ${document.formula.formulaId}`;
}

function buildPresetDraftRecord(item: ShortlistRecord, locale: string) {
  const href = documentToExploreHref(item.document, locale);
  const query = href.includes('?') ? href.slice(href.indexOf('?')) : '';
  const formulaSlug = slugify(item.document.formula.formulaId);
  return {
    preset: {
      id: `draft-${formulaSlug}-${slugify(item.id)}`,
      name: placeholderName(item.document),
      nameZh: 'Untitled',
      url: query,
      featured: true,
      thumbnail: item.render.output,
    },
    source: {
      candidateId: item.id,
      score: item.scoring.total,
      adjustedScore: item.adjustedScore,
      qualityGate: item.scoring.qualityGate,
      labels: item.scoring.labels,
      targetTags: item.targetTags,
      imagePath: item.render.output,
      exploreUrl: deriveExploreUrl(item.render, item.document),
    },
  };
}

export function presetDraft(args: {
  input: unknown;
  output?: string;
  locale?: string;
}) {
  const locale = args.locale === 'zh' ? 'zh' : 'en';
  const items = normalizePresetDraftItems(args.input);
  const drafts = items.map((item) => buildPresetDraftRecord(item, locale));

  if (args.output) {
    const outputPath = path.resolve(args.output);
    ensureDir(path.dirname(outputPath));
    fs.writeFileSync(outputPath, `${JSON.stringify({ count: drafts.length, items: drafts }, null, 2)}\n`);
  }

  return createSuccess('preset draft', {
    count: drafts.length,
    items: drafts,
    output: args.output ? path.resolve(args.output) : undefined,
  });
}

function relativePath(fromDir: string, toPath: string): string {
  return path.relative(fromDir, toPath) || '.';
}

export function reportRun(args: {
  input: unknown;
  outputDir: string;
  selection?: unknown;
}) {
  if (!args.outputDir) {
    throw new CliCommandError('INVALID_INPUT', 1, 'Expected --output-dir for report run.');
  }
  const outputDir = path.resolve(args.outputDir);
  ensureDir(outputDir);
  const scored = normalizeScoredRecords(args.input);
  const shortlist = args.selection ? normalizePresetDraftItems(args.selection) : selectTopRecords(scored, Math.min(12, scored.length));

  const markdown: string[] = ['# FractalPark Preset Discovery Report', ''];
  markdown.push(`- scored candidates: ${scored.length}`);
  markdown.push(`- shortlisted: ${shortlist.length}`);
  markdown.push('');

  const cards = shortlist.map((item) => {
    const relImage = relativePath(outputDir, item.render.output);
    markdown.push(`## #${item.rank} ${item.id}`);
    markdown.push('');
    markdown.push(`![${item.id}](${relImage})`);
    markdown.push('');
    markdown.push(`- adjusted score: ${item.adjustedScore}`);
    markdown.push(`- raw score: ${item.scoring.total}`);
    markdown.push(`- gate: ${item.scoring.qualityGate}`);
    markdown.push(`- formula: \`${item.document.formula.formulaId}\`${item.document.formula.isJulia ? ' (Julia)' : ''}`);
    markdown.push(`- family: \`${item.portfolio.family ?? 'unknown'}\``);
    markdown.push(`- url: \`${deriveExploreUrl(item.render, item.document)}\``);
    markdown.push(`- structural labels: ${item.scoring.labels.join(' / ') || 'none'}`);
    markdown.push(`- campaign tags: style=${item.targetTags.style.join(', ') || 'none'}; structural=${item.targetTags.structural.join(', ') || 'none'}; role=${item.targetTags.portfolioRole.join(', ') || 'none'}`);
    markdown.push(`- selection reasons: ${item.selectionReasons.join(' / ') || 'none'}`);
    markdown.push(`- rationale: ${item.scoring.rationale.join(' / ') || 'none'}`);
    markdown.push('');
    return { ...item, relImage };
  });

  const reportPath = path.join(outputDir, 'report.md');
  fs.writeFileSync(reportPath, `${markdown.join('\n')}\n`);

  const html = [
    '<!doctype html>',
    '<html lang="en"><head><meta charset="utf-8"><title>FractalPark Review Pack</title>',
    '<style>body{font-family:system-ui,sans-serif;background:#0b0f14;color:#e7edf4;padding:24px}h1{margin-top:0}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:18px}.card{background:#121923;border:1px solid #243245;border-radius:14px;padding:12px}.card img{width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:10px;background:#05080b}.meta{font-size:12px;line-height:1.5;color:#b8c6d8}.labels{margin-top:8px;display:flex;flex-wrap:wrap;gap:6px}.tag{background:#1f2f43;color:#d8e7f8;border-radius:999px;padding:2px 8px;font-size:11px}</style></head><body>',
    '<h1>FractalPark Review Pack</h1>',
    `<p>Scored ${scored.length} candidates; shortlisted ${shortlist.length}.</p>`,
    '<div class="grid">',
    ...cards.map((item) => [
      '<article class="card">',
      `<img src="${item.relImage}" alt="${item.id}">`,
      `<h2>#${item.rank} ${item.id}</h2>`,
      `<div class="meta"><div>Adjusted: ${item.adjustedScore}</div><div>Score: ${item.scoring.total}</div><div>Formula: ${item.document.formula.formulaId}${item.document.formula.isJulia ? ' (Julia)' : ''}</div><div>Role: ${item.targetTags.portfolioRole.join(', ') || 'none'}</div><div><a href="${deriveExploreUrl(item.render, item.document)}">${deriveExploreUrl(item.render, item.document)}</a></div></div>`,
      `<div class="labels">${item.scoring.labels.map((label) => `<span class="tag">${label}</span>`).join('')}</div>`,
      '</article>',
    ].join('')),
    '</div></body></html>',
  ].join('');

  const contactSheetPath = path.join(outputDir, 'contact-sheet.html');
  fs.writeFileSync(contactSheetPath, html);

  return createSuccess('report run', {
    outputDir,
    report: reportPath,
    contactSheet: contactSheetPath,
    count: shortlist.length,
  });
}
