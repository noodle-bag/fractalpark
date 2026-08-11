/**
 * Assignment-expression sequencing (v0.4.18 Slice 6b2).
 *
 * The classic dialect allows `ident = expr` wherever an expression is
 * legal (frmtutor IfThen-A1 documents that the assignment runs BEFORE the
 * enclosing comparison; the choice.frm family multiplies guarded
 * assignments). Both sides of `*`/`+` always evaluate, left to right —
 * that is the classic stack-machine truth.
 *
 * GLSL deliberately leaves the operand evaluation order of `+`/`*`
 * unspecified, so an expression like
 *   (z = fn1(z) + pixel) * (x < 10) + (z = fn2(z) + pixel) * (10 <= x)
 * cannot be emitted as-is without nondeterministic side effects. This
 * pass lifts every nested assignment into explicit statement order,
 * freezing each assigned value into a generated `frmseq<N>` temp:
 *
 *   (z = A) * (c1) + (z = B) * (c2)
 * becomes
 *   z = A        ; frmseq1 = z     (temp reads the STORED, target-typed
 *   z = B        ; frmseq2 = z      value — see the round-1 review note)
 *   frmseq1 * (c1) + frmseq2 * (c2)   (residual — value discarded)
 *
 * After the pass, no `assignment` node remains inside an expression:
 * codegen, the CPU orbit evaluator, type collection, and capability
 * analysis all consume plain statement sequences, so every verification
 * layer sees exactly the same semantics by construction.
 *
 * Fail-closed guards (no corpus evidence, no silent semantics):
 * - an assignment inside the RHS of `&&` / `||` (short-circuit makes the
 *   write conditional; hoisting would forge it) is a hard error;
 * - an assignment inside an `elseif` condition (its prelude could not run
 *   only-on-reach without restructuring) is a hard error;
 * - an assignment inside the bailout predicate is a hard error;
 * - a component lvalue (`real(tmp) = ...`) in expression position is a
 *   hard error (statement-level component stores are supported natively).
 */

import type { ASTNode, FrmAST } from './ast';

export interface SequenceIssue {
  message: string;
  line: number;
  col: number;
}

export interface SequenceResult {
  initBlock: ASTNode[];
  loopBlock: ASTNode[];
  errors: SequenceIssue[];
}

/** True when `node` contains an assignment anywhere in its subtree. */
export function containsAssignment(node: ASTNode): boolean {
  switch (node.type) {
    case 'assignment':
      return true;
    case 'binary':
      return containsAssignment(node.left) || containsAssignment(node.right);
    case 'unary':
    case 'magnitude':
      return containsAssignment(node.operand);
    case 'call':
      return node.args.some(containsAssignment);
    case 'if':
      return (
        containsAssignment(node.condition) ||
        node.then.some(containsAssignment) ||
        (node.elseIf ?? []).some((b) => containsAssignment(b.condition) || b.body.some(containsAssignment)) ||
        (node.else ?? []).some(containsAssignment)
      );
    default:
      return false;
  }
}

function collectIdents(node: ASTNode, into: Set<string>): void {
  switch (node.type) {
    case 'ident':
      into.add(node.name);
      break;
    case 'assignment':
      into.add(node.target);
      collectIdents(node.value, into);
      break;
    case 'binary':
      collectIdents(node.left, into);
      collectIdents(node.right, into);
      break;
    case 'unary':
    case 'magnitude':
      collectIdents(node.operand, into);
      break;
    case 'call':
      node.args.forEach((a) => collectIdents(a, into));
      break;
    case 'if':
      collectIdents(node.condition, into);
      node.then.forEach((s) => collectIdents(s, into));
      (node.elseIf ?? []).forEach((b) => {
        collectIdents(b.condition, into);
        b.body.forEach((s) => collectIdents(s, into));
      });
      (node.else ?? []).forEach((s) => collectIdents(s, into));
      break;
    default:
      break;
  }
}

/** Side-effect-free leaves may be dropped as residual statements. */
function isPureLeaf(node: ASTNode): boolean {
  return node.type === 'ident' || node.type === 'number' || node.type === 'complex';
}

export function sequenceAssignmentExpressions(ast: FrmAST): SequenceResult {
  const errors: SequenceIssue[] = [];
  const used = new Set<string>();
  ast.initBlock.forEach((s) => collectIdents(s, used));
  ast.loopBlock.forEach((s) => collectIdents(s, used));
  collectIdents(ast.bailoutExpr, used);

  let counter = 0;
  const fresh = (): string => {
    do {
      counter += 1;
    } while (used.has(`frmseq${counter}`));
    const name = `frmseq${counter}`;
    used.add(name);
    return name;
  };

  /** Returns the residual expression; appends prelude statements in
   * left-to-right evaluation order. */
  const seqExpr = (node: ASTNode, prelude: ASTNode[]): ASTNode => {
    switch (node.type) {
      case 'assignment': {
        if (node.component) {
          errors.push({
            message:
              'Component lvalue assignment (real(x)/imag(x)) is not supported inside an expression; use a plain statement',
            line: node.loc.line,
            col: node.loc.col,
          });
          return { type: 'number', value: 0, loc: node.loc };
        }
        const residualValue = seqExpr(node.value, prelude);
        const temp = fresh();
        // Target-first: the store coerces the value to the target's fixed
        // static type (e.g. complex z), and the expression must yield the
        // STORED value — so the temp reads the target AFTER the store,
        // never the raw RHS (Codex 6b2 round-1: `flip(z=1)` must see the
        // complex (1,0), not a real 1).
        prelude.push({ type: 'assignment', target: node.target, value: residualValue, loc: node.loc });
        prelude.push({
          type: 'assignment',
          target: temp,
          value: { type: 'ident', name: node.target, loc: node.loc },
          loc: node.loc,
        });
        return { type: 'ident', name: temp, loc: node.loc };
      }
      case 'binary': {
        if (node.op === '&&' || node.op === '||') {
          const left = seqExpr(node.left, prelude);
          if (containsAssignment(node.right)) {
            errors.push({
              message: `Assignment inside the right operand of '${node.op}' would be conditionally executed (short-circuit); hoist it into a statement instead`,
              line: node.right.loc.line,
              col: node.right.loc.col,
            });
          }
          return { ...node, left };
        }
        const left = seqExpr(node.left, prelude);
        const right = seqExpr(node.right, prelude);
        return { ...node, left, right };
      }
      case 'unary':
      case 'magnitude':
        return { ...node, operand: seqExpr(node.operand, prelude) };
      case 'call':
        return { ...node, args: node.args.map((a) => seqExpr(a, prelude)) };
      default:
        return node;
    }
  };

  const seqStatement = (stmt: ASTNode, out: ASTNode[]): void => {
    switch (stmt.type) {
      case 'assignment': {
        const prelude: ASTNode[] = [];
        const value = seqExpr(stmt.value, prelude);
        out.push(...prelude);
        out.push({ ...stmt, value });
        return;
      }
      case 'if': {
        // The if condition always evaluates when the statement is reached,
        // so its prelude runs immediately before it. elseif conditions are
        // reach-dependent — assignments there are rejected above-board.
        const condPrelude: ASTNode[] = [];
        const condition = seqExpr(stmt.condition, condPrelude);
        out.push(...condPrelude);
        for (const branch of stmt.elseIf ?? []) {
          if (containsAssignment(branch.condition)) {
            errors.push({
              message:
                'Assignment inside an elseif condition cannot be sequenced honestly; rewrite it as a nested if inside else',
              line: branch.condition.loc.line,
              col: branch.condition.loc.col,
            });
          }
        }
        const then: ASTNode[] = [];
        stmt.then.forEach((s) => seqStatement(s, then));
        const elseIf = stmt.elseIf?.map((b) => {
          const body: ASTNode[] = [];
          b.body.forEach((s) => seqStatement(s, body));
          return { ...b, body };
        });
        const elseBody: ASTNode[] = [];
        stmt.else?.forEach((s) => seqStatement(s, elseBody));
        out.push({
          ...stmt,
          condition,
          then,
          elseIf,
          else: stmt.else ? elseBody : undefined,
        });
        return;
      }
      default: {
        // Expression statement: sequence nested assignments; keep the
        // residual unless it is a pure leaf (side channels must still fire).
        const prelude: ASTNode[] = [];
        const residual = seqExpr(stmt, prelude);
        out.push(...prelude);
        if (!isPureLeaf(residual)) out.push(residual);
        return;
      }
    }
  };

  if (containsAssignment(ast.bailoutExpr)) {
    errors.push({
      message: 'Assignment inside the bailout predicate is not supported',
      line: ast.bailoutExpr.loc.line,
      col: ast.bailoutExpr.loc.col,
    });
  }

  const initBlock: ASTNode[] = [];
  ast.initBlock.forEach((s) => seqStatement(s, initBlock));
  const loopBlock: ASTNode[] = [];
  ast.loopBlock.forEach((s) => seqStatement(s, loopBlock));
  return { initBlock, loopBlock, errors };
}
