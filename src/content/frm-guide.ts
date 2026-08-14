import {
  FRM_GUIDE_EXAMPLE_IDS,
  getFormulaExampleById,
  type FormulaExample,
  type FrmGuideExampleId,
} from '@/engine/frm/example-library';
import { FRM_CAPABILITY_MANIFEST } from '@/engine/frm/capability-manifest';

const COMPATIBILITY_TIERS = FRM_CAPABILITY_MANIFEST.compatibility.tiers;

/**
 * Verified-capability facts rendered by the Guide's support section.
 * Derived from the versioned capability manifest — never hand-write
 * counts, function lists, or vocabulary here (plan §13.3).
 */
export const FRM_GUIDE_CAPABILITY = {
  manifestVersion: FRM_CAPABILITY_MANIFEST.manifestVersion,
  strictSemanticsVersion: FRM_CAPABILITY_MANIFEST.semantics.strictVersion,
  target: FRM_CAPABILITY_MANIFEST.compatibility.target,
  passed:
    COMPATIBILITY_TIERS.t0.pass +
    COMPATIBILITY_TIERS.t1.pass +
    COMPATIBILITY_TIERS.t2.pass,
  waivers:
    COMPATIBILITY_TIERS.t0.waivers +
    COMPATIBILITY_TIERS.t1.waivers +
    COMPATIBILITY_TIERS.t2.waivers,
  excluded: FRM_CAPABILITY_MANIFEST.compatibility.excluded,
  tiers: FRM_CAPABILITY_MANIFEST.compatibility.tiers,
  descriptorKinds: FRM_CAPABILITY_MANIFEST.bailout.descriptorKinds,
  rejectReasons: FRM_CAPABILITY_MANIFEST.bailout.rejectReasons,
  builtinFunctions: FRM_CAPABILITY_MANIFEST.dialect.builtinFunctions,
  parameters: FRM_CAPABILITY_MANIFEST.dialect.parameters,
  fnSlots: FRM_CAPABILITY_MANIFEST.dialect.fnSlots,
} as const;

export const FRM_GUIDE_SECTION_IDS = [
  'what-is-frm',
  'support',
  'anatomy',
  'syntax',
  'pipeline',
  'tutorials',
  'diagnostics',
  'sharing',
  'next-steps',
] as const;

export type FrmGuideSectionId = (typeof FRM_GUIDE_SECTION_IDS)[number];

export const FRM_COMPATIBILITY_LEVELS = [
  'supported',
  'adapted',
  'unsupported',
] as const;

export type FrmCompatibilityLevel =
  (typeof FRM_COMPATIBILITY_LEVELS)[number];

export interface FrmCompatibilityGroup {
  level: FrmCompatibilityLevel;
  itemIds: readonly string[];
}

export const FRM_COMPATIBILITY_GROUPS: readonly FrmCompatibilityGroup[] = [
  {
    level: 'supported',
    itemIds: [
      'single-formula',
      'core-sections',
      'variables',
      'expressions',
      'conditionals',
      'builtins',
      'comments',
      'diagnostics',
    ],
  },
  {
    level: 'adapted',
    itemIds: ['ismand', 'function-slots', 'native-directives'],
  },
  {
    level: 'unsupported',
    itemIds: [
      'multi-formula-files',
      'dialect-conversion',
      'arbitrary-directives',
      'non-ascii-identifiers',
      'user-functions',
      'preprocessor',
      'rejected-constructs',
    ],
  },
] as const;

export const FRM_SYNTAX_TOPIC_IDS = [
  'sections',
  'values',
  'operators',
  'control-flow',
  'builtins',
  'comments',
] as const;

export type FrmSyntaxTopicId = (typeof FRM_SYNTAX_TOPIC_IDS)[number];

export const FRM_PIPELINE_STEP_IDS = [
  'source',
  'tokens',
  'ast',
  'validation',
  'glsl',
  'plugin',
] as const;

export type FrmPipelineStepId = (typeof FRM_PIPELINE_STEP_IDS)[number];

export interface FrmGuideTutorial {
  id: FrmGuideExampleId;
  example: FormulaExample;
  editorPath: `/formulas/editor?example=${FrmGuideExampleId}`;
}

export const FRM_GUIDE_TUTORIALS: readonly FrmGuideTutorial[] =
  FRM_GUIDE_EXAMPLE_IDS.map((id) => {
    const example = getFormulaExampleById(id);

    if (!example) {
      throw new Error(`Missing shared FRM Guide example: ${id}`);
    }

    return {
      id,
      example,
      editorPath: `/formulas/editor?example=${id}`,
    };
  });

export function getFrmGuideTutorialById(
  id: string
): FrmGuideTutorial | undefined {
  return FRM_GUIDE_TUTORIALS.find((tutorial) => tutorial.id === id);
}

export const FRM_GUIDE_REFERENCES = [
  {
    id: 'fractint-project',
    url: 'https://fractint.org/',
  },
  {
    id: 'fractalpark-frm-source',
    url: 'https://github.com/noodle-bag/fractalpark/tree/main/src/engine/frm',
  },
  {
    id: 'fractalpark-repository',
    url: 'https://github.com/noodle-bag/fractalpark',
  },
] as const;
