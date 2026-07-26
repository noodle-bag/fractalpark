import {
  FRM_GUIDE_EXAMPLE_IDS,
  getFormulaExampleById,
  type FormulaExample,
  type FrmGuideExampleId,
} from '@/engine/frm/example-library';

export const FRM_GUIDE_SECTION_IDS = [
  'what-is-frm',
  'support',
  'anatomy',
  'syntax',
  'pipeline',
  'tutorials',
  'diagnostics',
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
