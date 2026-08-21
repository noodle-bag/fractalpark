import { beforeAll, describe, expect, it } from 'vitest';
import enMessages from '../../messages/en.json';
import zhMessages from '../../messages/zh.json';
import ptMessages from '../../messages/pt.json';
import koMessages from '../../messages/ko.json';
import ruMessages from '../../messages/ru.json';
import esMessages from '../../messages/es.json';
import frMessages from '../../messages/fr.json';
import presetsFile from '../../public/gallery-presets.json';
import {
  ARTWORK_CONTENT_MANIFEST,
  getArtworkContentByPresetId,
  getArtworkContentBySlug,
  type ArtworkContentEntry,
} from '@/content/artwork-manifest';
import {
  FORMULA_CONTENT_MANIFEST,
  getFormulaContentById,
  getFormulaContentBySlug,
  type FormulaContentEntry,
} from '@/content/formula-manifest';
import { validateContentManifests } from '@/content/manifest-validation';
import { PUBLISHED_TEACHING_GUIDES_V1 } from '@/content/teaching/guide-route-policy';
import { registerBuiltins } from '@/engine/plugins/builtins';
import { FORMULA_CATALOG } from '@/engine/plugins/formula-catalog';
import { pluginRegistry } from '@/engine/plugins/registry';
import {
  buildCanonicalPresetDocument,
  parseGalleryPresetsFile,
} from '@/lib/gallery-presets';

const ALL_MESSAGES: Record<string, Record<string, unknown>> = {
  en: enMessages,
  zh: zhMessages,
  pt: ptMessages,
  ko: koMessages,
  ru: ruMessages,
  es: esMessages,
  fr: frMessages,
};
const RENDERABLE_FORMULA_SLUGS = new Set(
  PUBLISHED_TEACHING_GUIDES_V1.map((entry) => entry.slug),
);

function buildValidationInput(overrides?: {
  formulas?: FormulaContentEntry[];
  artworks?: ArtworkContentEntry[];
  messages?: Record<string, Record<string, unknown>>;
}) {
  return {
    formulas: overrides?.formulas ?? FORMULA_CONTENT_MANIFEST,
    artworks: overrides?.artworks ?? ARTWORK_CONTENT_MANIFEST,
    catalog: FORMULA_CATALOG,
    formulaPlugins: pluginRegistry.listFormulas(),
    presets: parseGalleryPresetsFile(presetsFile).presets,
    messages: overrides?.messages ?? ALL_MESSAGES,
  };
}

describe('formula and artwork content manifests', () => {
  beforeAll(() => {
    registerBuiltins({ quiet: true });
  });

  it('validates 21 identities, 17 locale projections, and 26 artworks', () => {
    expect(() => validateContentManifests(buildValidationInput())).not.toThrow();
    expect(FORMULA_CONTENT_MANIFEST).toHaveLength(21);
    expect(RENDERABLE_FORMULA_SLUGS.size).toBe(17);
    expect(ARTWORK_CONTENT_MANIFEST).toHaveLength(26);
  });

  it('matches the unique formula set and source order from gallery presets', () => {
    const presets = parseGalleryPresetsFile(presetsFile).presets;
    const galleryFormulaIds = new Set(
      presets.map(
        (preset) => buildCanonicalPresetDocument(preset).formula.formulaId
      )
    );

    expect(new Set(FORMULA_CONTENT_MANIFEST.map((entry) => entry.formulaId))).toEqual(
      galleryFormulaIds
    );
    expect(ARTWORK_CONTENT_MANIFEST.map((entry) => entry.presetId)).toEqual(
      presets.map((preset) => preset.id)
    );
  });

  it('resolves stable formula and artwork identities in both directions', () => {
    expect(getFormulaContentById('quadJulia')?.slug).toBe('quartic-julia');
    expect(getFormulaContentBySlug('quartic-julia')?.formulaId).toBe(
      'quadJulia'
    );
    expect(
      getArtworkContentByPresetId('preset-buffalo-julia-spiral-gate')?.slug
    ).toBe('buffalo-crest');
    expect(getArtworkContentBySlug('buffalo-crest')?.presetId).toBe(
      'preset-buffalo-julia-spiral-gate'
    );
  });

  it('rejects a non-public formula slug', () => {
    const formulas = structuredClone(FORMULA_CONTENT_MANIFEST);
    formulas[0].slug = 'Mandelbrot';

    expect(() =>
      validateContentManifests(buildValidationInput({ formulas }))
    ).toThrow(/Formula slug Mandelbrot/);
  });

  it('rejects a formula parameter that is absent from its plugin', () => {
    const formulas = structuredClone(FORMULA_CONTENT_MANIFEST);
    const mandelbox = formulas.find((entry) => entry.formulaId === 'mandelbox');
    if (!mandelbox?.parameters) {
      throw new Error('Expected Mandelbox parameters');
    }
    mandelbox.parameters[0].uniformName = 'u_missingUniform';

    expect(() =>
      validateContentManifests(buildValidationInput({ formulas }))
    ).toThrow(/Unknown uniform u_missingUniform/);
  });

  it('rejects formula TeX that KaTeX cannot render', () => {
    const formulas = structuredClone(FORMULA_CONTENT_MANIFEST);
    formulas[0].math[0].tex = '\\notARealCommand{';

    expect(() =>
      validateContentManifests(buildValidationInput({ formulas }))
    ).toThrow(/Math mandelbrot\.iteration cannot render/);
  });

  it('rejects artwork slugs that do not begin with the owning formula slug', () => {
    const artworks = structuredClone(ARTWORK_CONTENT_MANIFEST);
    artworks[0].slug = 'mandelbrot-deep-spiral';

    expect(() =>
      validateContentManifests(buildValidationInput({ artworks }))
    ).toThrow(/must begin with newton-3-/);
  });

  it('rejects a missing message in any locale', () => {
    const messages = structuredClone(ALL_MESSAGES);
    const zhFormulas = messages.zh.formulas as Record<string, unknown>;
    const zhEntries = zhFormulas.entries as Record<string, unknown>;
    const mandelbrot = zhEntries.mandelbrot as Record<string, unknown>;
    delete mandelbrot.summary;

    expect(() =>
      validateContentManifests(buildValidationInput({ messages }))
    ).toThrow(
      'Missing non-empty zh message: formulas.entries.mandelbrot.summary'
    );
  });
});
