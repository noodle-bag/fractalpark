import type {
  FrmLikeV1Expression,
  FrmLikeV1Ir,
  FrmLikeV1Statement,
} from '@/engine/frm/v1';
import {
  canonicalJsonV1,
  sha256HexSyncV1,
} from '@/engine/formulas/v1/revisions';

export const TEACHING_SEMANTIC_ANCHOR_SCHEMA_V1 =
  'fractalpark-teaching-semantic-anchors/v1' as const;

export type TeachingSemanticAnchorRoleV1 =
  | 'parameter-use'
  | 'initialization'
  | 'iteration'
  | 'state'
  | 'branch'
  | 'termination'
  | 'expression';

export interface TeachingSemanticAnchorV1 {
  readonly nodeId: string;
  readonly irPath: string;
  readonly role: TeachingSemanticAnchorRoleV1;
  readonly kind: string;
  readonly nodeHash: string;
}

function nodeHash(value: unknown): string {
  return sha256HexSyncV1(canonicalJsonV1(value, 16_384));
}

function nodeId(sourceRevision: string, irPath: string): string {
  return `frm-v1:${sourceRevision}:${irPath}`;
}

function expressionChildren(
  expression: FrmLikeV1Expression,
): ReadonlyArray<readonly [string, FrmLikeV1Expression]> {
  switch (expression.kind) {
    case 'call':
      return expression.args.map((argument, index) => [`args/${index}`, argument]);
    case 'unary':
    case 'magnitude':
      return [['operand', expression.operand]];
    case 'binary':
      return [
        ['left', expression.left],
        ['right', expression.right],
      ];
    default:
      return [];
  }
}

export function deriveTeachingSemanticAnchorsV1(
  sourceRevision: string,
  ir: FrmLikeV1Ir,
): readonly TeachingSemanticAnchorV1[] {
  const anchors: TeachingSemanticAnchorV1[] = [];
  const parameterNames = new Set(ir.parameters.map((parameter) => parameter.name));

  const add = (
    irPath: string,
    role: TeachingSemanticAnchorRoleV1,
    kind: string,
    value: unknown,
  ) => {
    anchors.push({
      nodeId: nodeId(sourceRevision, irPath),
      irPath,
      role,
      kind,
      nodeHash: nodeHash(value),
    });
  };

  const walkExpression = (expression: FrmLikeV1Expression, irPath: string) => {
    add(
      irPath,
      expression.kind === 'identifier' && parameterNames.has(expression.name)
        ? 'parameter-use'
        : 'expression',
      expression.kind,
      expression,
    );
    for (const [suffix, child] of expressionChildren(expression)) {
      walkExpression(child, `${irPath}/${suffix}`);
    }
  };

  const walkStatement = (
    statement: FrmLikeV1Statement,
    irPath: string,
    role: 'initialization' | 'iteration' | 'state',
  ) => {
    add(
      irPath,
      statement.kind === 'if' ? 'branch' : role,
      statement.kind,
      statement,
    );
    if (statement.kind === 'assignment' || statement.kind === 'component-assignment') {
      walkExpression(statement.value, `${irPath}/value`);
      return;
    }

    walkExpression(statement.condition, `${irPath}/condition`);
    statement.then.forEach((child, index) =>
      walkStatement(child, `${irPath}/then/${index}`, 'state'),
    );
    statement.elseIf.forEach((branch, branchIndex) => {
      add(
        `${irPath}/elseIf/${branchIndex}`,
        'branch',
        'else-if',
        branch,
      );
      walkExpression(
        branch.condition,
        `${irPath}/elseIf/${branchIndex}/condition`,
      );
      branch.body.forEach((child, index) =>
        walkStatement(
          child,
          `${irPath}/elseIf/${branchIndex}/body/${index}`,
          'state',
        ),
      );
    });
    statement.else?.forEach((child, index) =>
      walkStatement(child, `${irPath}/else/${index}`, 'state'),
    );
  };

  ir.parameters.forEach((parameter, index) =>
    add(`parameters/${index}`, 'parameter-use', `parameter:${parameter.type}`, parameter),
  );
  ir.locals.forEach((local, index) =>
    add(`locals/${index}`, 'state', `local:${local.type}`, local),
  );
  ir.init.forEach((statement, index) =>
    walkStatement(statement, `init/${index}`, 'initialization'),
  );
  ir.loop.forEach((statement, index) =>
    walkStatement(statement, `loop/${index}`, 'iteration'),
  );
  add('bailout', 'termination', ir.bailout.kind, ir.bailout);
  for (const [suffix, child] of expressionChildren(ir.bailout)) {
    walkExpression(child, `bailout/${suffix}`);
  }

  if (anchors.length === 0) throw new Error('teaching-semantic-anchors-empty');
  if (new Set(anchors.map((anchor) => anchor.nodeId)).size !== anchors.length) {
    throw new Error('teaching-semantic-anchor-id-duplicate');
  }
  return Object.freeze(anchors.map((anchor) => Object.freeze(anchor)));
}
