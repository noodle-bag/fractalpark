import { describe, expect, it } from 'vitest';
import {
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

describe('WebSite JSON-LD', () => {
  it('stays aligned with the public-project positioning and host', () => {
    expect(websiteJsonLd['@id']).toBe(`${SITE.url}/#website`);
    expect(websiteJsonLd.url).toBe(SITE.url);
    expect(websiteJsonLd.description).toBe(PUBLIC_PROJECT.tagline);
    expect(websiteJsonLd.inLanguage).toEqual(['en', 'zh-CN']);
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
