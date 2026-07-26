import type { FormulaMetadata } from '@/engine/plugins/formula-catalog';
import type { FormulaPlugin } from '@/engine/plugins/types';
import type { GalleryPresetConfig } from '@/lib/gallery-presets';
import { buildCanonicalPresetDocument } from '@/lib/gallery-presets';
import type { ArtworkContentEntry } from './artwork-manifest';
import type { FormulaContentEntry } from './formula-manifest';

const PUBLIC_SLUG_PATTERN = /^[a-z0-9-]+$/;
const RESERVED_FORMULA_SLUGS = new Set(['frm', 'editor']);

type Messages = Record<string, unknown>;

export interface ContentManifestValidationInput {
  formulas: readonly FormulaContentEntry[];
  artworks: readonly ArtworkContentEntry[];
  catalog: readonly FormulaMetadata[];
  formulaPlugins: readonly FormulaPlugin[];
  presets: readonly GalleryPresetConfig[];
  messages: {
    en: Messages;
    zh: Messages;
  };
}

function findMessage(messages: Messages, key: string): unknown {
  return key.split('.').reduce<unknown>((value, part) => {
    if (
      typeof value !== 'object' ||
      value === null ||
      !(part in value)
    ) {
      return undefined;
    }

    return (value as Record<string, unknown>)[part];
  }, messages);
}

function assertNonEmptyMessage(
  messages: ContentManifestValidationInput['messages'],
  key: string
): void {
  for (const locale of ['en', 'zh'] as const) {
    const value = findMessage(messages[locale], key);
    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error(`Missing non-empty ${locale} message: ${key}`);
    }
  }
}

function assertUnique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) {
    throw new Error(`${label} must be unique`);
  }
}

function assertNonEmptyIds(values: readonly string[], label: string): void {
  if (values.some((value) => value.trim() === '')) {
    throw new Error(`${label} must be non-empty`);
  }
}

function assertPublicSlug(slug: string, label: string): void {
  if (!PUBLIC_SLUG_PATTERN.test(slug)) {
    throw new Error(`${label} must match ${PUBLIC_SLUG_PATTERN}`);
  }
}

export function validateContentManifests({
  formulas,
  artworks,
  catalog,
  formulaPlugins,
  presets,
  messages,
}: ContentManifestValidationInput): void {
  const catalogById = new Map(catalog.map((formula) => [formula.id, formula]));
  const pluginsById = new Map(
    formulaPlugins.map((plugin) => [plugin.id, plugin])
  );
  const formulasById = new Map(
    formulas.map((formula) => [formula.formulaId, formula])
  );
  const artworksById = new Map(
    artworks.map((artwork) => [artwork.presetId, artwork])
  );
  const presetsById = new Map(presets.map((preset) => [preset.id, preset]));

  assertUnique(
    formulas.map((entry) => entry.formulaId),
    'Formula manifest IDs'
  );
  assertUnique(
    formulas.map((entry) => entry.slug),
    'Formula manifest slugs'
  );
  assertUnique(
    artworks.map((entry) => entry.presetId),
    'Artwork manifest preset IDs'
  );
  assertUnique(
    artworks.map((entry) => entry.slug),
    'Artwork manifest slugs'
  );

  const presetFormulaIds = new Set(
    presets.map(
      (preset) => buildCanonicalPresetDocument(preset).formula.formulaId
    )
  );
  const manifestFormulaIds = new Set(formulasById.keys());
  if (
    presetFormulaIds.size !== manifestFormulaIds.size ||
    [...presetFormulaIds].some((formulaId) => !manifestFormulaIds.has(formulaId))
  ) {
    throw new Error(
      'Formula manifest IDs must equal the formulas used by gallery presets'
    );
  }

  const presetIds = presets.map((preset) => preset.id);
  if (
    presetIds.length !== artworks.length ||
    presetIds.some((presetId, index) => artworks[index]?.presetId !== presetId)
  ) {
    throw new Error(
      'Artwork manifest must match gallery preset IDs and source order'
    );
  }

  for (const entry of formulas) {
    const metadata = catalogById.get(entry.formulaId);
    const plugin = pluginsById.get(entry.formulaId);
    if (!metadata || !plugin || plugin.source !== 'builtin') {
      throw new Error(`Unknown built-in formula: ${entry.formulaId}`);
    }
    assertPublicSlug(entry.slug, `Formula slug ${entry.slug}`);
    if (RESERVED_FORMULA_SLUGS.has(entry.slug)) {
      throw new Error(`Formula slug is reserved: ${entry.slug}`);
    }
    if (entry.math.length === 0) {
      throw new Error(`Formula ${entry.formulaId} needs at least one math item`);
    }
    assertUnique(
      entry.math.map((item) => item.id),
      `Math IDs for ${entry.formulaId}`
    );
    assertNonEmptyIds(
      entry.math.map((item) => item.id),
      `Math IDs for ${entry.formulaId}`
    );
    for (const item of entry.math) {
      if (item.tex.trim() === '' || item.plainText.trim() === '') {
        throw new Error(
          `Math ${entry.formulaId}.${item.id} needs TeX and plain text`
        );
      }
    }
    if (entry.faqIds.length < 2) {
      throw new Error(`Formula ${entry.formulaId} needs at least two FAQs`);
    }
    assertUnique(entry.faqIds, `FAQ IDs for ${entry.formulaId}`);
    assertNonEmptyIds(entry.faqIds, `FAQ IDs for ${entry.formulaId}`);
    if (entry.relatedFormulaIds.length === 0) {
      throw new Error(
        `Formula ${entry.formulaId} needs at least one related formula`
      );
    }
    assertUnique(
      entry.relatedFormulaIds,
      `Related formula IDs for ${entry.formulaId}`
    );
    assertNonEmptyIds(
      entry.relatedFormulaIds,
      `Related formula IDs for ${entry.formulaId}`
    );
    for (const relatedId of entry.relatedFormulaIds) {
      if (relatedId === entry.formulaId || !catalogById.has(relatedId)) {
        throw new Error(
          `Invalid related formula ${relatedId} for ${entry.formulaId}`
        );
      }
    }
    for (const artworkId of entry.artworkIds) {
      if (!artworksById.has(artworkId)) {
        throw new Error(
          `Unknown artwork ${artworkId} for formula ${entry.formulaId}`
        );
      }
      const preset = presetsById.get(artworkId);
      if (
        !preset ||
        buildCanonicalPresetDocument(preset).formula.formulaId !==
          entry.formulaId
      ) {
        throw new Error(
          `Artwork ${artworkId} does not use formula ${entry.formulaId}`
        );
      }
    }

    const referenceIds = (entry.references ?? []).map(
      (reference) => reference.id
    );
    assertUnique(referenceIds, `Reference IDs for ${entry.formulaId}`);
    assertNonEmptyIds(referenceIds, `Reference IDs for ${entry.formulaId}`);
    const referencesById = new Map(
      (entry.references ?? []).map((reference) => [reference.id, reference])
    );
    for (const reference of entry.references ?? []) {
      if (reference.title.trim() === '') {
        throw new Error(
          `Reference ${entry.formulaId}.${reference.id} needs a title`
        );
      }
      let url: URL;
      try {
        url = new URL(reference.url);
      } catch {
        throw new Error(
          `Reference ${entry.formulaId}.${reference.id} has an invalid URL`
        );
      }
      if (url.protocol !== 'https:') {
        throw new Error(
          `Reference ${entry.formulaId}.${reference.id} must use HTTPS`
        );
      }
    }
    if (entry.history) {
      assertUnique(
        entry.history.sourceIds,
        `History source IDs for ${entry.formulaId}`
      );
      if (
        entry.history.sourceIds.length === 0 ||
        entry.history.sourceIds.some(
          (sourceId) => !referenceIds.includes(sourceId)
        )
      ) {
        throw new Error(
          `History sources must resolve for ${entry.formulaId}`
        );
      }
      const hasIndependentHistorySource = entry.history.sourceIds.some(
        (sourceId) => {
          const reference = referencesById.get(sourceId);
          if (!reference || reference.kind === 'further-reading') {
            return false;
          }

          return !new URL(reference.url).hostname.endsWith('wikipedia.org');
        }
      );
      if (!hasIndependentHistorySource) {
        throw new Error(
          `History for ${entry.formulaId} needs a non-Wikipedia source`
        );
      }
      assertNonEmptyMessage(messages, `formulas.entries.${entry.slug}.history`);
    }
    if (
      entry.frm &&
      !/^src\/content\/formulas\/[a-z0-9-]+\.frm$/.test(entry.frm.sourcePath)
    ) {
      throw new Error(
        `FRM source path is invalid for ${entry.formulaId}: ${entry.frm.sourcePath}`
      );
    }
    const parameterIds = (entry.parameters ?? []).map(
      (parameter) => parameter.id
    );
    assertUnique(parameterIds, `Parameter IDs for ${entry.formulaId}`);
    assertNonEmptyIds(parameterIds, `Parameter IDs for ${entry.formulaId}`);
    for (const parameter of entry.parameters ?? []) {
      if (
        parameter.uniformName &&
        !plugin.uniforms.some(
          (uniform) => uniform.name === parameter.uniformName
        )
      ) {
        throw new Error(
          `Unknown uniform ${parameter.uniformName} for ${entry.formulaId}`
        );
      }
    }

    const messageRoot = `formulas.entries.${entry.slug}`;
    assertNonEmptyMessage(messages, `${messageRoot}.title`);
    assertNonEmptyMessage(messages, `${messageRoot}.summary`);
    assertNonEmptyMessage(messages, `${messageRoot}.visualCharacteristics`);
    for (const item of entry.math) {
      assertNonEmptyMessage(messages, `${messageRoot}.math.${item.id}.label`);
      assertNonEmptyMessage(
        messages,
        `${messageRoot}.math.${item.id}.explanation`
      );
    }
    for (const parameter of entry.parameters ?? []) {
      assertNonEmptyMessage(
        messages,
        `${messageRoot}.parameters.${parameter.id}`
      );
    }
    for (const faqId of entry.faqIds) {
      assertNonEmptyMessage(
        messages,
        `${messageRoot}.faq.${faqId}.question`
      );
      assertNonEmptyMessage(messages, `${messageRoot}.faq.${faqId}.answer`);
    }
  }

  const referencedArtworkIds = formulas.flatMap((entry) => entry.artworkIds);
  assertUnique(referencedArtworkIds, 'Formula artwork references');
  if (
    referencedArtworkIds.length !== artworks.length ||
    artworks.some((artwork) => !referencedArtworkIds.includes(artwork.presetId))
  ) {
    throw new Error(
      'Every artwork must be referenced by exactly one owning formula'
    );
  }

  for (const entry of artworks) {
    const preset = presetsById.get(entry.presetId);
    if (!preset) {
      throw new Error(`Unknown artwork preset: ${entry.presetId}`);
    }
    assertPublicSlug(entry.slug, `Artwork slug ${entry.slug}`);

    const formulaId = buildCanonicalPresetDocument(preset).formula.formulaId;
    const formula = formulasById.get(formulaId);
    if (!formula) {
      throw new Error(
        `Artwork ${entry.presetId} uses an unpublished formula ${formulaId}`
      );
    }
    const requiredPrefix = `${formula.slug}-`;
    if (
      !entry.slug.startsWith(requiredPrefix) ||
      entry.slug.length === requiredPrefix.length
    ) {
      throw new Error(
        `Artwork slug ${entry.slug} must begin with ${requiredPrefix}`
      );
    }
    if (entry.relatedPresetIds.length < 2) {
      throw new Error(
        `Artwork ${entry.presetId} needs at least two related artworks`
      );
    }
    assertUnique(
      entry.relatedPresetIds,
      `Related artwork IDs for ${entry.presetId}`
    );
    assertNonEmptyIds(
      entry.relatedPresetIds,
      `Related artwork IDs for ${entry.presetId}`
    );
    for (const relatedId of entry.relatedPresetIds) {
      if (relatedId === entry.presetId || !artworksById.has(relatedId)) {
        throw new Error(
          `Invalid related artwork ${relatedId} for ${entry.presetId}`
        );
      }
    }

    const messageRoot = `artworks.entries.${entry.presetId}`;
    assertNonEmptyMessage(messages, `${messageRoot}.summary`);
    assertNonEmptyMessage(messages, `${messageRoot}.visualNote`);
  }
}
