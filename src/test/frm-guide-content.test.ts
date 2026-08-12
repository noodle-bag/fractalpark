import { describe, expect, it } from 'vitest';
import enMessages from '../../messages/en.json';
import zhMessages from '../../messages/zh.json';
import esMessages from '../../messages/es.json';
import frMessages from '../../messages/fr.json';
import koMessages from '../../messages/ko.json';
import ptMessages from '../../messages/pt.json';
import ruMessages from '../../messages/ru.json';
import {
  FRM_COMPATIBILITY_GROUPS,
  FRM_COMPATIBILITY_LEVELS,
  FRM_GUIDE_CAPABILITY,
  FRM_GUIDE_REFERENCES,
  FRM_GUIDE_SECTION_IDS,
  FRM_GUIDE_TUTORIALS,
  FRM_PIPELINE_STEP_IDS,
  FRM_SYNTAX_TOPIC_IDS,
} from '@/content/frm-guide';
import { FRM_CAPABILITY_MANIFEST } from '@/engine/frm/capability-manifest';
import { compileFrm } from '@/engine/frm/compile';
import {
  FRM_GUIDE_EXAMPLE_IDS,
  getFormulaExampleById,
} from '@/engine/frm/example-library';

function collectLeafPaths(
  value: unknown,
  prefix = ''
): Map<string, unknown> {
  const leaves = new Map<string, unknown>();

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      for (const [path, leaf] of collectLeafPaths(
        item,
        `${prefix}.${index}`
      )) {
        leaves.set(path, leaf);
      }
    });
    return leaves;
  }

  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      const path = prefix ? `${prefix}.${key}` : key;
      for (const [leafPath, leaf] of collectLeafPaths(child, path)) {
        leaves.set(leafPath, leaf);
      }
    }
    return leaves;
  }

  leaves.set(prefix, value);
  return leaves;
}

describe('FRM Guide content contract', () => {
  it('keeps the frozen section, syntax, and pipeline order', () => {
    expect(FRM_GUIDE_SECTION_IDS).toEqual([
      'what-is-frm',
      'support',
      'anatomy',
      'syntax',
      'pipeline',
      'tutorials',
      'diagnostics',
      'sharing',
      'next-steps',
    ]);
    expect(FRM_SYNTAX_TOPIC_IDS).toEqual([
      'sections',
      'values',
      'operators',
      'control-flow',
      'builtins',
      'comments',
    ]);
    expect(FRM_PIPELINE_STEP_IDS).toEqual([
      'source',
      'tokens',
      'ast',
      'validation',
      'glsl',
      'plugin',
    ]);
  });

  it('uses the frozen compatibility vocabulary without duplicate claims', () => {
    expect(FRM_COMPATIBILITY_GROUPS.map((group) => group.level)).toEqual(
      FRM_COMPATIBILITY_LEVELS
    );

    const itemIds = FRM_COMPATIBILITY_GROUPS.flatMap(
      (group) => group.itemIds
    );
    expect(new Set(itemIds).size).toBe(itemIds.length);
    expect(itemIds).toHaveLength(18);
  });

  it('resolves and compiles the three shared progressive examples by ID', () => {
    expect(FRM_GUIDE_TUTORIALS.map((tutorial) => tutorial.id)).toEqual(
      FRM_GUIDE_EXAMPLE_IDS
    );

    for (const tutorial of FRM_GUIDE_TUTORIALS) {
      const sharedExample = getFormulaExampleById(tutorial.id);
      expect(tutorial.example).toBe(sharedExample);
      expect(tutorial.editorPath).toBe(
        `/formulas/editor?example=${tutorial.id}`
      );

      const result = compileFrm(
        tutorial.example.source,
        `guide-${tutorial.id}`
      );
      expect(result.success, tutorial.id).toBe(true);
      expect(result.ast, tutorial.id).toBeDefined();
      expect(result.canonicalFormula, tutorial.id).toBeDefined();
      expect(result.glsl, tutorial.id).toBeTruthy();
      expect(result.sourceMap, tutorial.id).toBeDefined();
    }
  });

  it('keeps English and Chinese guide content complete and structurally equal', () => {
    const enGuide = collectLeafPaths(enMessages.formulas.frmGuide);
    const zhGuide = collectLeafPaths(zhMessages.formulas.frmGuide);

    expect([...zhGuide.keys()]).toEqual([...enGuide.keys()]);

    for (const [path, value] of enGuide) {
      expect(value, `en formulas.frmGuide.${path}`).toBeTypeOf('string');
      expect(String(value).trim(), `en formulas.frmGuide.${path}`).not.toBe('');
      expect(
        String(zhGuide.get(path)).trim(),
        `zh formulas.frmGuide.${path}`
      ).not.toBe('');
    }

    expect(enMessages.metadata.frmGuide.title).toBeTruthy();
    expect(enMessages.metadata.frmGuide.description).toBeTruthy();
    expect(zhMessages.metadata.frmGuide.title).toBeTruthy();
    expect(zhMessages.metadata.frmGuide.description).toBeTruthy();
  });

  it('renders verified-capability facts straight from the manifest', () => {
    // The Guide must never hand-write capability facts (plan §13.3): the
    // exported view model is the manifest, field for field.
    expect(FRM_GUIDE_CAPABILITY.manifestVersion).toBe(
      FRM_CAPABILITY_MANIFEST.manifestVersion
    );
    expect(FRM_GUIDE_CAPABILITY.strictSemanticsVersion).toBe(
      FRM_CAPABILITY_MANIFEST.semantics.strictVersion
    );
    expect(FRM_GUIDE_CAPABILITY.target).toBe(
      FRM_CAPABILITY_MANIFEST.compatibility.target
    );
    expect(FRM_GUIDE_CAPABILITY.excluded).toBe(
      FRM_CAPABILITY_MANIFEST.compatibility.excluded
    );
    expect(FRM_GUIDE_CAPABILITY.tiers).toBe(
      FRM_CAPABILITY_MANIFEST.compatibility.tiers
    );
    expect(FRM_GUIDE_CAPABILITY.descriptorKinds).toBe(
      FRM_CAPABILITY_MANIFEST.bailout.descriptorKinds
    );
    expect(FRM_GUIDE_CAPABILITY.rejectReasons).toBe(
      FRM_CAPABILITY_MANIFEST.bailout.rejectReasons
    );
    expect(FRM_GUIDE_CAPABILITY.builtinFunctions).toBe(
      FRM_CAPABILITY_MANIFEST.dialect.builtinFunctions
    );
    expect(FRM_GUIDE_CAPABILITY.parameters).toBe(
      FRM_CAPABILITY_MANIFEST.dialect.parameters
    );
    expect(FRM_GUIDE_CAPABILITY.fnSlots).toBe(
      FRM_CAPABILITY_MANIFEST.dialect.fnSlots
    );
  });

  it('keeps the guide structurally complete in all seven locales', () => {
    const enGuide = collectLeafPaths(enMessages.formulas.frmGuide);
    const localeGuides: Array<[string, Map<string, unknown>]> = [
      ['zh', collectLeafPaths(zhMessages.formulas.frmGuide)],
      ['es', collectLeafPaths(esMessages.formulas.frmGuide)],
      ['fr', collectLeafPaths(frMessages.formulas.frmGuide)],
      ['ko', collectLeafPaths(koMessages.formulas.frmGuide)],
      ['pt', collectLeafPaths(ptMessages.formulas.frmGuide)],
      ['ru', collectLeafPaths(ruMessages.formulas.frmGuide)],
    ];
    for (const [locale, guide] of localeGuides) {
      expect([...guide.keys()].sort(), `locale ${locale}`).toEqual(
        [...enGuide.keys()].sort()
      );
      for (const [path] of guide) {
        expect(
          String(guide.get(path)).trim(),
          `${locale} formulas.frmGuide.${path}`
        ).not.toBe('');
      }
    }
  });

  it('uses unique HTTPS reference IDs and URLs', () => {
    expect(
      new Set(FRM_GUIDE_REFERENCES.map((reference) => reference.id)).size
    ).toBe(FRM_GUIDE_REFERENCES.length);
    expect(
      new Set(FRM_GUIDE_REFERENCES.map((reference) => reference.url)).size
    ).toBe(FRM_GUIDE_REFERENCES.length);

    for (const reference of FRM_GUIDE_REFERENCES) {
      expect(new URL(reference.url).protocol).toBe('https:');
    }
  });
});
