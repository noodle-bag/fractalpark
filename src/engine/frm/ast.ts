/**
 * FRM Parser - AST Type Definitions
 * M4.2 Phase 2.1
 */

import { isFnSlotName } from './builtins';
import { parseFormulaSourceDirectives } from './source-directives';

export type ASTNode =
  | AssignmentNode
  | BinaryNode
  | UnaryNode
  | CallNode
  | IdentNode
  | NumberNode
  | ComplexNode
  | MagnitudeNode
  | IfNode;

export interface SourceLocation {
  line: number;
  col: number;
}

export interface AssignmentNode {
  type: 'assignment';
  target: string;
  value: ASTNode;
  loc: SourceLocation;
}

export interface BinaryNode {
  type: 'binary';
  op: string;
  left: ASTNode;
  right: ASTNode;
  loc: SourceLocation;
}

export interface UnaryNode {
  type: 'unary';
  op: string;
  operand: ASTNode;
  loc: SourceLocation;
}

export interface CallNode {
  type: 'call';
  name: string;
  args: ASTNode[];
  loc: SourceLocation;
}

export interface IdentNode {
  type: 'ident';
  name: string;
  loc: SourceLocation;
}

export interface NumberNode {
  type: 'number';
  value: number;
  loc: SourceLocation;
}

export interface ComplexNode {
  type: 'complex';
  real: number;
  imag: number;
  loc: SourceLocation;
}

export interface MagnitudeNode {
  type: 'magnitude';
  operand: ASTNode;
  loc: SourceLocation;
}

export interface IfBranch {
  condition: ASTNode;
  body: ASTNode[];
  loc: SourceLocation;
}

export interface IfNode {
  type: 'if';
  condition: ASTNode;
  then: ASTNode[];
  elseIf?: IfBranch[];
  else?: ASTNode[];
  loc: SourceLocation;
}

export interface FrmParam {
  name: string;
  type: 'float' | 'complex';
  default: number | [number, number];
  min?: number;
  max?: number;
}

export interface FrmAST {
  name: string;
  params: FrmParam[];
  initBlock: ASTNode[];
  loopBlock: ASTNode[];
  bailoutExpr: ASTNode;
}

export type FormulaDialect = 'fractint-compat' | 'myfrac-native';

export interface FormulaMetadata {
  dialect: FormulaDialect;
  symmetry?: string;
  defaultView?: {
    centerX: number;
    centerY: number;
    zoom: number;
    rotation?: number;
  };
  defaultColoringHint?: {
    outsideColoringId?: string;
    insideColoringId?: string;
    paletteIndex?: number;
  };
}

export interface FormulaCompatibilityNote {
  kind: 'info' | 'warning' | 'unsupported';
  message: string;
  loc?: SourceLocation;
}

export interface CanonicalFormula {
  name: string;
  metadata: FormulaMetadata;
  ast: FrmAST;
  compatibilityNotes: FormulaCompatibilityNote[];
}

export function createCanonicalFormula(ast: FrmAST, source?: string): CanonicalFormula {
  const sourceDirectives = source ? parseFormulaSourceDirectives(source) : null;

  return {
    name: ast.name,
    metadata: sourceDirectives?.metadata ?? {
      dialect: 'fractint-compat',
    },
    ast,
    compatibilityNotes: [
      ...(sourceDirectives?.compatibilityNotes ?? []),
      ...collectCompatibilityNotes(ast),
    ],
  };
}

function collectCompatibilityNotes(ast: FrmAST): FormulaCompatibilityNote[] {
  const notes: FormulaCompatibilityNote[] = [];
  const usedFnSlots = new Map<string, SourceLocation>();
  let usesIsmandLoc: SourceLocation | undefined;

  const visit = (node: ASTNode) => {
    switch (node.type) {
      case 'assignment':
        visit(node.value);
        break;
      case 'binary':
        visit(node.left);
        visit(node.right);
        break;
      case 'unary':
      case 'magnitude':
        visit(node.operand);
        break;
      case 'ident':
        if (node.name === 'ismand' && !usesIsmandLoc) {
          usesIsmandLoc = node.loc;
        }
        break;
      case 'call':
        if (isFnSlotName(node.name) && !usedFnSlots.has(node.name)) {
          usedFnSlots.set(node.name, node.loc);
        }
        node.args.forEach(visit);
        break;
      case 'if':
        visit(node.condition);
        node.then.forEach(visit);
        node.elseIf?.forEach((branch) => {
          visit(branch.condition);
          branch.body.forEach(visit);
        });
        node.else?.forEach(visit);
        break;
      default:
        break;
    }
  };

  ast.initBlock.forEach(visit);
  ast.loopBlock.forEach(visit);
  visit(ast.bailoutExpr);

  if (usesIsmandLoc) {
    notes.push({
      kind: 'info',
      message: 'ismand currently maps to !u_isJulia; runtime semantics may differ slightly from Fractint.',
      loc: usesIsmandLoc,
    });
  }

  if (usedFnSlots.size > 0) {
    const slots = Array.from(usedFnSlots.keys()).sort().join(', ');
    notes.push({
      kind: 'info',
      message: `Used ${slots}; fn slots currently expand through compile-time dispatch, so function selection takes effect before rendering.`,
      loc: usedFnSlots.values().next().value,
    });
  }

  return notes;
}
