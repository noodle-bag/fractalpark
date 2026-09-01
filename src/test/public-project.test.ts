import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PUBLIC_PROJECT } from '@/content/public-project';
import {
  CLASSIC_FORMULA_COUNT_V1,
  PUBLISHED_FORMULA_DIRECTORY_COUNT_V1,
} from '@/content/published-formula-directory';
import { PUBLISHED_FORMULA_GUIDES } from '@/content/formula-guides';
import { FORMULA_CATALOG } from '@/engine/plugins/formula-catalog';
import { pluginRegistry } from '@/engine/plugins/registry';
import { registerBuiltins } from '@/engine/plugins/builtins';
import enMessages from '../../messages/en.json';
import zhMessages from '../../messages/zh.json';

registerBuiltins({ quiet: true });

/**
 * Public-project content contract tests.
 *
 * The contract is the single source of truth for product facts shared by the
 * GitHub README, /[locale]/about, the Explore landing, JSON-LD, and llms.txt.
 * These tests pin the contract to the real engine/content numbers and keep
 * the en/zh message projections complete and drift-free.
 */

type MessageTree = Record<string, unknown>;

function flattenKeys(tree: MessageTree, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      return flattenKeys(value as MessageTree, path);
    }
    return [path];
  });
}

function dig(tree: MessageTree, path: string): unknown {
  return path.split('.').reduce<unknown>((node, key) => {
    if (node === null || typeof node !== 'object') return undefined;
    return (node as MessageTree)[key];
  }, tree);
}

const presetsFile = JSON.parse(
  readFileSync(join(process.cwd(), 'public/gallery-presets.json'), 'utf8')
) as { presets: unknown[] };

describe('public-project contract facts', () => {
  it('match the real engine and content numbers', () => {
    const { facts } = PUBLIC_PROJECT;
    expect(facts.formulaCount).toBe(PUBLISHED_FORMULA_DIRECTORY_COUNT_V1);
    expect(facts.classicFormulaCount).toBe(CLASSIC_FORMULA_COUNT_V1);
    expect(FORMULA_CATALOG.length).toBe(facts.classicFormulaCount);
    expect(PUBLISHED_FORMULA_GUIDES.length).toBe(facts.formulaGuideCount);
    expect(presetsFile.presets.length).toBe(facts.galleryPresetCount);

    const coloringCount =
      pluginRegistry.listOutsideColoring().length +
      pluginRegistry.listInsideColoring().length;
    expect(coloringCount).toBe(facts.coloringModeCount);
    expect(pluginRegistry.listTransforms().length).toBe(facts.transformCount);
    expect(pluginRegistry.listFormulas().length).toBe(facts.classicFormulaCount);
  });

  it('uses the approved single-sentence positioning', () => {
    expect(PUBLIC_PROJECT.tagline).toContain('open-source, formula-first');
    expect(PUBLIC_PROJECT.tagline).toContain('published formula source you can read and run');
    expect(PUBLIC_PROJECT.tagline).toContain('Classic-compatible formula editor');
    // Must not over-claim full compatibility or shipped future features.
    expect(PUBLIC_PROJECT.tagline).not.toMatch(/fully Fractint/i);
    expect(PUBLIC_PROJECT.tagline).not.toMatch(/cloud/i);
  });

  it('points hero image at a real committed asset', () => {
    const heroPath = join(process.cwd(), 'public', PUBLIC_PROJECT.heroImage.src);
    expect(() => readFileSync(heroPath)).not.toThrow();
    expect(PUBLIC_PROJECT.heroImage.width).toBeGreaterThan(0);
    expect(PUBLIC_PROJECT.heroImage.height).toBeGreaterThan(0);
  });

  it('uses only in-site capability and CTA destinations', () => {
    const allowed = new Set([
      '/explore',
      '/formulas',
      '/formulas/directory',
      '/formulas/frm',
      '/formulas/editor',
      '/gallery',
      '/about',
      '/drift',
    ]);
    for (const capability of PUBLIC_PROJECT.capabilities) {
      expect(allowed.has(capability.href)).toBe(true);
    }
    for (const cta of PUBLIC_PROJECT.ctas) {
      expect(allowed.has(cta.href)).toBe(true);
    }
    expect(allowed.has(PUBLIC_PROJECT.readmeSourceLink.href)).toBe(true);
    // Drift is noindex and must not be a primary CTA.
    expect(PUBLIC_PROJECT.ctas.map((c) => c.href)).not.toContain('/drift');
  });
});

describe('publicProject message projections', () => {
  const enPP = enMessages.publicProject as MessageTree;
  const zhPP = zhMessages.publicProject as MessageTree;

  it('have identical key structure in en and zh', () => {
    expect(flattenKeys(zhPP).sort()).toEqual(flattenKeys(enPP).sort());
  });

  it('mirrors the English canonical strings from the contract', () => {
    expect(dig(enMessages as MessageTree, 'publicProject.tagline')).toBe(
      PUBLIC_PROJECT.tagline
    );
    for (const capability of PUBLIC_PROJECT.capabilities) {
      expect(
        dig(enMessages as MessageTree, `publicProject.capabilities.${capability.id}.title`)
      ).toBe(capability.titleEn);
      expect(
        dig(enMessages as MessageTree, `publicProject.capabilities.${capability.id}.summary`)
      ).toBe(capability.summaryEn);
    }
    PUBLIC_PROJECT.boundaries.currentEn.forEach((text, index) => {
      expect(dig(enMessages as MessageTree, `publicProject.boundaries.current.${index}`)).toBe(text);
    });
    PUBLIC_PROJECT.boundaries.futureEn.forEach((text, index) => {
      expect(dig(enMessages as MessageTree, `publicProject.boundaries.future.${index}`)).toBe(text);
    });
    for (const cta of PUBLIC_PROJECT.ctas) {
      expect(dig(enMessages as MessageTree, `publicProject.cta.${cta.id}`)).toBe(cta.labelEn);
    }
    expect(dig(enMessages as MessageTree, 'publicProject.heroAlt')).toBe(
      PUBLIC_PROJECT.heroImage.altEn
    );
  });

  it('keeps current/future boundaries explicit in both locales', () => {
    for (const locale of [enMessages, zhMessages] as MessageTree[]) {
      const current = flattenKeys(dig(locale, 'publicProject.boundaries.current') as MessageTree)
        .map((key) => dig(locale, `publicProject.boundaries.current.${key}`) as string);
      const future = flattenKeys(dig(locale, 'publicProject.boundaries.future') as MessageTree)
        .map((key) => dig(locale, `publicProject.boundaries.future.${key}`) as string);
      expect(current.length).toBeGreaterThanOrEqual(3);
      expect(future.length).toBeGreaterThanOrEqual(2);
      expect(current.join(' ')).not.toMatch(/cloud sync.*available|account.*included/i);
    }
  });
});

describe('locale message surface for Slice 2.1', () => {
  it('has matching en/zh keys for drift, metadata.drift, and explore.landing', () => {
    for (const namespace of ['drift', 'metadata.drift', 'explore.landing']) {
      const enKeys = flattenKeys(dig(enMessages as MessageTree, namespace) as MessageTree).sort();
      const zhKeys = flattenKeys(dig(zhMessages as MessageTree, namespace) as MessageTree).sort();
      expect(zhKeys, `namespace ${namespace}`).toEqual(enKeys);
      expect(enKeys.length, `namespace ${namespace}`).toBeGreaterThan(0);
    }
  });

  it('removed the legacy home surfaces', () => {
    for (const messages of [enMessages, zhMessages] as MessageTree[]) {
      expect(dig(messages, 'home')).toBeUndefined();
      expect(dig(messages, 'metadata.home')).toBeUndefined();
      expect(dig(messages, 'explore.seo')).toBeUndefined();
      expect(dig(messages, 'common.nav.home')).toBeUndefined();
    }
  });

  it('nav exposes localized Drift entries', () => {
    expect(dig(enMessages as MessageTree, 'common.nav.drift')).toBe('Drift');
    expect(typeof dig(zhMessages as MessageTree, 'common.nav.drift')).toBe('string');
  });
});
