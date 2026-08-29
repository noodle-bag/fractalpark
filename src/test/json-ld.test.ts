import { describe, expect, it } from 'vitest';
import {
  buildFormulaRecordJsonLdV1,
  buildFormulaTeachingJsonLdV1,
  buildSoftwareApplicationJsonLd,
  renderJsonLd,
  websiteJsonLd,
} from '@/lib/json-ld';
import { PUBLIC_PROJECT } from '@/content/public-project';
import { SITE } from '@/lib/site';

/**
 * JSON-LD consistency tests — one stable product entity across Explore and
 * About, with facts from the public-project content contract.
 */

describe('SoftwareApplication JSON-LD builder', () => {
  it('uses the single stable @id everywhere', () => {
    const jsonLd = buildSoftwareApplicationJsonLd();
    expect(jsonLd['@id']).toBe(`${SITE.url}/#software`);
    expect(jsonLd['@type']).toBe('SoftwareApplication');
    expect(jsonLd.author['@id']).toBe(`${SITE.url}/#organization`);
    expect(jsonLd.publisher['@id']).toBe(jsonLd.author['@id']);
    expect(websiteJsonLd.publisher['@id']).toBe(jsonLd.author['@id']);
  });

  it('draws feature facts from the public-project contract', () => {
    const { facts } = PUBLIC_PROJECT;
    const features = buildSoftwareApplicationJsonLd().featureList.join('\n');
    expect(features).toContain(`${facts.formulaCount} GLSL fractal formulas`);
    expect(features).toContain(`${facts.coloringModeCount} coloring modes`);
    expect(features).toContain(`${facts.transformCount} UV transform plugins`);
    expect(features).toContain(`${facts.formulaGuideCount} in-depth Formula Guides`);
    expect(features).toContain(`${facts.maxExportScale}×`);
    expect(features).not.toMatch(/\b7 coloring modes\b/);
  });

  it('defaults to the approved tagline and accepts localized descriptions', () => {
    expect(buildSoftwareApplicationJsonLd().description).toBe(PUBLIC_PROJECT.tagline);
    expect(
      buildSoftwareApplicationJsonLd({ description: 'localized' }).description
    ).toBe('localized');
  });

  it('keeps identity fields when About appends page-consistent extensions', () => {
    const base = buildSoftwareApplicationJsonLd({ description: 'about copy' });
    const aboutVariant = {
      ...base,
      softwareRequirements: 'WebGL 1.0 enabled browser',
      programmingLanguage: ['TypeScript', 'GLSL'],
      datePublished: '2026-02-15',
    };
    expect(aboutVariant['@id']).toBe(base['@id']);
    expect(aboutVariant.featureList).toEqual(base.featureList);
    expect(aboutVariant.license).toBe(PUBLIC_PROJECT.license.url);
  });

  it('serializes to parseable JSON-LD', () => {
    const parsed = JSON.parse(
      renderJsonLd(buildSoftwareApplicationJsonLd())
    ) as Record<string, unknown>;
    expect(parsed['@context']).toBe('https://schema.org');
    expect(parsed['@id']).toBe(`${SITE.url}/#software`);
  });
});

describe('Formula Record JSON-LD', () => {
  it('binds the WebPage and DefinedTerm to the same record master', () => {
    const url = `${SITE.url}/en/formulas/00e14aa8-b766-54ea-a359-3f5d20d329b7`;
    const image = {
      url: `${SITE.url}/formula-library/v1/record-previews/example.webp`,
      width: 1200,
      height: 750,
    };
    const jsonLd = buildFormulaRecordJsonLdV1({
      url,
      directoryUrl: `${SITE.url}/en/formulas/directory`,
      locale: 'en',
      formulaId: '00e14aa8-b766-54ea-a359-3f5d20d329b7',
      canonicalName: 'mandelbrot',
      name: 'Mandelbrot',
      description: 'Formula Record',
      image,
    });
    expect(jsonLd['@graph'][0].primaryImageOfPage).toEqual({
      '@type': 'ImageObject',
      ...image,
    });
    expect(jsonLd['@graph'][1].image).toEqual({
      '@type': 'ImageObject',
      ...image,
    });
  });
});

describe('Formula teaching JSON-LD', () => {
  it('uses canonical locale URLs, BCP 47 language, and reviewed learning goals', () => {
    const url = `${SITE.url}/zh/formulas/00e14aa8-b766-54ea-a359-3f5d20d329b7`;
    const jsonLd = buildFormulaTeachingJsonLdV1({
      url,
      locale: 'zh',
      formulaId: '00e14aa8-b766-54ea-a359-3f5d20d329b7',
      canonicalName: 'mandelbrot',
      name: '曼德勃罗教学页',
      description: '已审校说明',
    });
    expect(jsonLd['@id']).toBe(`${url}#learning-resource`);
    expect(jsonLd['@type']).toEqual(['WebPage', 'LearningResource']);
    expect(jsonLd.inLanguage).toBe('zh-CN');
    expect(jsonLd.url).toBe(url);
    expect(jsonLd.description).toBe('已审校说明');
    expect(jsonLd.isPartOf['@id']).toBe(`${SITE.url}/#website`);
    expect(JSON.parse(renderJsonLd(jsonLd))).toEqual(jsonLd);
  });
});

describe('WebSite JSON-LD', () => {
  it('stays aligned with the public-project positioning and host', () => {
    expect(websiteJsonLd['@id']).toBe(`${SITE.url}/#website`);
    expect(websiteJsonLd.url).toBe(SITE.url);
    expect(websiteJsonLd.description).toBe(PUBLIC_PROJECT.tagline);
    expect(websiteJsonLd.inLanguage).toEqual([
      'en',
      'zh-CN',
      'pt-BR',
      'ko-KR',
      'ru-RU',
      'es-ES',
      'fr-FR',
    ]);
  });
});

describe('renderJsonLd UGC safety', () => {
  it('neutralizes script breakout and markup in user-controlled strings', () => {
    const hostile = '</script><script>alert(1)</script><em>markup</em>&"quoted"';
    const rendered = renderJsonLd({ name: hostile });
    expect(rendered).not.toContain('</script>');
    expect(rendered).not.toContain('<em>');
    expect(rendered).not.toContain('<');
    // The escapes are semantically identical JSON once parsed.
    expect(JSON.parse(rendered)).toEqual({ name: hostile });
  });
});
