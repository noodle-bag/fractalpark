/**
 * FRM Parser - GLSL Code Generator
 * M4.2 Phase 2.1
 *
 * Converts FRM AST to GLSL iterateStep() function
 */

import type { ASTNode, FrmAST } from './ast';
import type { VarType } from './type-system';
import { collectVariables, inferType } from './type-system';
import { FRMSourceMap } from './sourcemap';
import { FN_SLOT_OPTIONS, isFnSlotName, isParameterName } from './builtins';

type CodeGenUniformType = 'float' | 'int' | 'vec2';

export interface CodeGenResult {
  glsl: string;
  initGlsl?: string;
  uniforms: { name: string; type: CodeGenUniformType }[];
  bailout: number;
  sourceMap: FRMSourceMap;
}

interface CodeGenContext {
  getVariableType(name: string): VarType | undefined;
  getNodeType(node: ASTNode): VarType;
  sourceMap: FRMSourceMap;
}

const BUILTINS = new Set(['z', 'c', 'pixel', 'zPrev', 'LastSqr', 'pi', 'e', 'maxit', 'ismand']);
const REAL_TYPE: VarType = { kind: 'real' };
const COMPLEX_TYPE: VarType = { kind: 'complex' };

export function generateGLSL(ast: FrmAST, sourceMap: FRMSourceMap): CodeGenResult {
  const variableTypes = collectVariables(ast.initBlock, ast.loopBlock);
  const ctx: CodeGenContext = {
    getVariableType: (name) => variableTypes.get(name),
    getNodeType: (node) => inferType(node, { getVariableType: (name) => variableTypes.get(name) }),
    sourceMap,
  };

  const declarations: string[] = [];
  const uniforms: { name: string; type: CodeGenUniformType }[] = [];

  for (const [name, type] of variableTypes) {
    if (BUILTINS.has(name)) continue;

    if (isParameterName(name)) {
      uniforms.push({ name: `u_${name}`, type: type.kind === 'complex' ? 'vec2' : 'float' });
      continue;
    }

    declarations.push(`${toGlslType(type)} ${name};`);
  }

  const usedFnSlots = collectUsedFnSlots(ast);
  for (const fnSlot of usedFnSlots) {
    uniforms.push({ name: `u_${fnSlot}`, type: 'int' });
  }

  const prelude = buildPrelude(Array.from(usedFnSlots), declarations);

  const initStatements = ast.initBlock.map((stmt) => generateStatement(stmt, ctx, 2));
  const loopStatements = ast.loopBlock.map((stmt) => generateStatement(stmt, ctx, 2));
  const bailoutValue = extractBailoutValue(ast.bailoutExpr);
  const hasNontrivialInit = initStatements.length > 0 && !isDefaultInit(ast.initBlock);

  let initGlsl: string | undefined;
  if (hasNontrivialInit) {
    initGlsl = [
      prelude,
      'vec2 initFormula(vec2 z, vec2 c, vec2 point) {',
      '  vec2 pixel = u_isJulia ? point : c;',
      ...initStatements,
      '  return z;',
      '}',
    ].filter(Boolean).join('\n');
  }

  const iterateLines: string[] = [
    'vec2 iterateStep(vec2 z, vec2 c, vec2 zPrev, vec2 point) {',
    '  vec2 pixel = u_isJulia ? point : c;',
    '',
    '  // Loop block',
    ...loopStatements,
    '',
    '  return z;',
    '}',
  ];

  const glsl = `${hasNontrivialInit ? '' : prelude}\n${iterateLines.join('\n')}`.trim();

  return {
    glsl,
    initGlsl,
    uniforms,
    bailout: bailoutValue,
    sourceMap,
  };
}

function generateStatement(node: ASTNode, ctx: CodeGenContext, indent: number): string {
  const spaces = ' '.repeat(indent);

  switch (node.type) {
    case 'assignment': {
      const targetType = ctx.getVariableType(node.target) ?? ctx.getNodeType(node.value);
      const value = generateExpression(node.value, ctx, targetType);
      const line = `${spaces}${node.target} = ${value};`;
      ctx.sourceMap.record(node, line);
      ctx.sourceMap.advanceLine();
      return line;
    }

    case 'if': {
      const lines: string[] = [];
      const cond = generateBooleanExpression(node.condition, ctx);
      const ifLine = `${spaces}if (${cond}) {`;
      lines.push(ifLine);
      ctx.sourceMap.record(node, ifLine);
      ctx.sourceMap.advanceLine();

      for (const stmt of node.then) {
        lines.push(generateStatement(stmt, ctx, indent + 2));
      }

      if (node.elseIf) {
        for (const branch of node.elseIf) {
          const elseifCond = generateBooleanExpression(branch.condition, ctx);
          lines.push(`${spaces}} else if (${elseifCond}) {`);
          ctx.sourceMap.advanceLine();
          for (const stmt of branch.body) {
            lines.push(generateStatement(stmt, ctx, indent + 2));
          }
        }
      }

      if (node.else) {
        lines.push(`${spaces}} else {`);
        ctx.sourceMap.advanceLine();
        for (const stmt of node.else) {
          lines.push(generateStatement(stmt, ctx, indent + 2));
        }
      }

      lines.push(`${spaces}}`);
      ctx.sourceMap.advanceLine();
      return lines.join('\n');
    }

    default: {
      const exprType = ctx.getNodeType(node);
      const expr = generateExpression(node, ctx, exprType);
      const line = `${spaces}${expr};`;
      ctx.sourceMap.record(node, line);
      ctx.sourceMap.advanceLine();
      return line;
    }
  }
}

function generateBooleanExpression(node: ASTNode, ctx: CodeGenContext): string {
  if (node.type === 'binary' && ['&&', '||'].includes(node.op)) {
    const left = generateBooleanExpression(node.left, ctx);
    const right = generateBooleanExpression(node.right, ctx);
    return `(${left} ${node.op} ${right})`;
  }

  if (node.type === 'binary' && ['<', '>', '<=', '>=', '==', '!='].includes(node.op)) {
    return generateExpression(node, ctx, REAL_TYPE);
  }

  if (node.type === 'unary' && node.op === '!') {
    return `(!${generateBooleanExpression(node.operand, ctx)})`;
  }

  const exprType = ctx.getNodeType(node);
  const expr = generateExpression(node, ctx, exprType);
  return `(${toRealExpression(expr, exprType)} != 0.0)`;
}

function generateExpression(node: ASTNode, ctx: CodeGenContext, expectedType?: VarType): string {
  const actualType = ctx.getNodeType(node);
  const expr = generateExpressionRaw(node, ctx, actualType);
  return expectedType ? coerceExpression(expr, actualType, expectedType) : expr;
}

function generateExpressionRaw(node: ASTNode, ctx: CodeGenContext, actualType: VarType): string {
  switch (node.type) {
    case 'number': {
      const val = node.value;
      return Number.isInteger(val) ? `${val}.0` : String(val);
    }

    case 'complex':
      return `vec2(${formatFloat(node.real)}, ${formatFloat(node.imag)})`;

    case 'ident':
      return generateIdentifier(node.name);

    case 'binary':
      return generateBinaryExpression(node, ctx);

    case 'unary': {
      if (node.op === '!') {
        return generateBooleanExpression(node.operand, ctx);
      }

      const operandType = ctx.getNodeType(node.operand);
      const operand = generateExpression(node.operand, ctx, operandType);
      if (node.op === '-') {
        return `(-${operand})`;
      }
      return `${node.op}${operand}`;
    }

    case 'magnitude': {
      const operandType = ctx.getNodeType(node.operand);
      const operand = generateExpression(node.operand, ctx, operandType);
      return operandType.kind === 'real' ? `(${operand} * ${operand})` : `frmMagnitude(${operand})`;
    }

    case 'call':
      return generateCallExpression(node, ctx, actualType);

    default:
      return actualType.kind === 'real' ? '0.0' : 'vec2(0.0)';
  }
}

function generateBinaryExpression(node: Extract<ASTNode, { type: 'binary' }>, ctx: CodeGenContext): string {
  const leftType = ctx.getNodeType(node.left);
  const rightType = ctx.getNodeType(node.right);

  switch (node.op) {
    case '+':
    case '-': {
      if (leftType.kind === 'real' && rightType.kind === 'real') {
        const left = generateExpression(node.left, ctx, REAL_TYPE);
        const right = generateExpression(node.right, ctx, REAL_TYPE);
        return `(${left} ${node.op} ${right})`;
      }

      const left = generateExpression(node.left, ctx, COMPLEX_TYPE);
      const right = generateExpression(node.right, ctx, COMPLEX_TYPE);
      return `(${left} ${node.op} ${right})`;
    }

    case '*': {
      if (leftType.kind === 'real' && rightType.kind === 'real') {
        const left = generateExpression(node.left, ctx, REAL_TYPE);
        const right = generateExpression(node.right, ctx, REAL_TYPE);
        return `(${left} * ${right})`;
      }

      if (leftType.kind === 'complex' && rightType.kind === 'real') {
        const left = generateExpression(node.left, ctx, COMPLEX_TYPE);
        const right = generateExpression(node.right, ctx, REAL_TYPE);
        return `(${left} * ${right})`;
      }

      if (leftType.kind === 'real' && rightType.kind === 'complex') {
        const left = generateExpression(node.left, ctx, REAL_TYPE);
        const right = generateExpression(node.right, ctx, COMPLEX_TYPE);
        return `(${left} * ${right})`;
      }

      const left = generateExpression(node.left, ctx, COMPLEX_TYPE);
      const right = generateExpression(node.right, ctx, COMPLEX_TYPE);
      return `complexMul(${left}, ${right})`;
    }

    case '/': {
      if (leftType.kind === 'real' && rightType.kind === 'real') {
        const left = generateExpression(node.left, ctx, REAL_TYPE);
        const right = generateExpression(node.right, ctx, REAL_TYPE);
        return `(${left} / ${right})`;
      }

      if (leftType.kind === 'complex' && rightType.kind === 'real') {
        const left = generateExpression(node.left, ctx, COMPLEX_TYPE);
        const right = generateExpression(node.right, ctx, REAL_TYPE);
        return `(${left} / ${right})`;
      }

      if (leftType.kind === 'real' && rightType.kind === 'complex') {
        const left = generateExpression(node.left, ctx, COMPLEX_TYPE);
        const right = generateExpression(node.right, ctx, COMPLEX_TYPE);
        return `complexDiv(${left}, ${right})`;
      }

      const left = generateExpression(node.left, ctx, COMPLEX_TYPE);
      const right = generateExpression(node.right, ctx, COMPLEX_TYPE);
      return `complexDiv(${left}, ${right})`;
    }

    case '^': {
      if (leftType.kind === 'real' && rightType.kind === 'real') {
        const left = generateExpression(node.left, ctx, REAL_TYPE);
        const right = generateExpression(node.right, ctx, REAL_TYPE);
        return `pow(${left}, ${right})`;
      }

      const left = generateExpression(node.left, ctx, COMPLEX_TYPE);
      const right = generateExpression(node.right, ctx, REAL_TYPE);
      return `complexPow(${left}, ${right})`;
    }

    case '==':
    case '!=': {
      if (leftType.kind === 'complex' || rightType.kind === 'complex') {
        const left = generateExpression(node.left, ctx, COMPLEX_TYPE);
        const right = generateExpression(node.right, ctx, COMPLEX_TYPE);
        return node.op === '=='
          ? `all(equal(${left}, ${right}))`
          : `any(notEqual(${left}, ${right}))`;
      }

      const left = generateExpression(node.left, ctx, REAL_TYPE);
      const right = generateExpression(node.right, ctx, REAL_TYPE);
      return `(${left} ${node.op} ${right})`;
    }

    case '<':
    case '>':
    case '<=':
    case '>=': {
      const left = toRealExpression(generateExpression(node.left, ctx, leftType), leftType);
      const right = toRealExpression(generateExpression(node.right, ctx, rightType), rightType);
      return `(${left} ${node.op} ${right})`;
    }

    case '&&':
    case '||': {
      const left = generateBooleanExpression(node.left, ctx);
      const right = generateBooleanExpression(node.right, ctx);
      return `(${left} ${node.op} ${right})`;
    }

    default: {
      const left = generateExpression(node.left, ctx, actualBinaryType(leftType, rightType, node.op));
      const right = generateExpression(node.right, ctx, actualBinaryType(leftType, rightType, node.op));
      return `(${left} ${node.op} ${right})`;
    }
  }
}

function generateCallExpression(
  node: Extract<ASTNode, { type: 'call' }>,
  ctx: CodeGenContext,
  actualType: VarType
): string {
  const name = node.name;
  const args = node.args.map((arg) => {
    const argType = ctx.getNodeType(arg);
    return {
      type: argType,
      expr: generateExpression(arg, ctx, argType),
    };
  });

  if (isFnSlotName(name)) {
    const slotArg = args[0];
    return `${nameToApplyHelper(name)}(${coerceExpression(slotArg?.expr ?? 'vec2(0.0)', slotArg?.type ?? COMPLEX_TYPE, COMPLEX_TYPE)})`;
  }

  switch (name) {
    case 'sin':
      return `complexSin(${coerceExpression(args[0]?.expr ?? '0.0', args[0]?.type ?? REAL_TYPE, COMPLEX_TYPE)})`;
    case 'cos':
      return `complexCos(${coerceExpression(args[0]?.expr ?? '0.0', args[0]?.type ?? REAL_TYPE, COMPLEX_TYPE)})`;
    case 'tan':
      return `complexTan(${coerceExpression(args[0]?.expr ?? '0.0', args[0]?.type ?? REAL_TYPE, COMPLEX_TYPE)})`;
    case 'exp':
      return `complexExp(${coerceExpression(args[0]?.expr ?? '0.0', args[0]?.type ?? REAL_TYPE, COMPLEX_TYPE)})`;
    case 'log':
      return `complexLog(${coerceExpression(args[0]?.expr ?? '0.0', args[0]?.type ?? REAL_TYPE, COMPLEX_TYPE)})`;
    case 'sqrt':
      return args[0]?.type.kind === 'real'
        ? `sqrt(${args[0].expr})`
        : `frmComplexSqrt(${coerceExpression(args[0]?.expr ?? 'vec2(0.0)', args[0]?.type ?? COMPLEX_TYPE, COMPLEX_TYPE)})`;
    case 'abs':
      return `abs(${args[0]?.expr ?? fallbackForType(actualType)})`;
    case 'cabs':
      return args[0]?.type.kind === 'real'
        ? `abs(${args[0].expr})`
        : `length(${coerceExpression(args[0]?.expr ?? 'vec2(0.0)', args[0]?.type ?? COMPLEX_TYPE, COMPLEX_TYPE)})`;
    case 'real':
      return args[0]?.type.kind === 'real'
        ? (args[0]?.expr ?? '0.0')
        : `(${coerceExpression(args[0]?.expr ?? 'vec2(0.0)', args[0]?.type ?? COMPLEX_TYPE, COMPLEX_TYPE)}).x`;
    case 'imag':
      return args[0]?.type.kind === 'real'
        ? '0.0'
        : `(${coerceExpression(args[0]?.expr ?? 'vec2(0.0)', args[0]?.type ?? COMPLEX_TYPE, COMPLEX_TYPE)}).y`;
    case 'conj':
      return `complexConj(${coerceExpression(args[0]?.expr ?? '0.0', args[0]?.type ?? REAL_TYPE, COMPLEX_TYPE)})`;
    case 'flip':
      return `frmFlip(${args[0]?.expr ?? fallbackForType(actualType)})`;
    case 'sqr':
      return `frmSqr(${args[0]?.expr ?? fallbackForType(actualType)})`;
    case 'recip':
      return `frmRecip(${args[0]?.expr ?? fallbackForType(actualType)})`;
    case 'atan2':
      if (args.length >= 2) {
        const left = toRealExpression(args[0].expr, args[0].type);
        const right = toRealExpression(args[1].expr, args[1].type);
        return `atan(${left}, ${right})`;
      }
      return args[0]?.type.kind === 'real'
        ? `atan(${args[0].expr})`
        : `atan((${coerceExpression(args[0]?.expr ?? 'vec2(0.0)', args[0]?.type ?? COMPLEX_TYPE, COMPLEX_TYPE)}).y, (${coerceExpression(args[0]?.expr ?? 'vec2(0.0)', args[0]?.type ?? COMPLEX_TYPE, COMPLEX_TYPE)}).x)`;
    case 'sinh':
      return `complexSinhVec(${coerceExpression(args[0]?.expr ?? '0.0', args[0]?.type ?? REAL_TYPE, COMPLEX_TYPE)})`;
    case 'cosh':
      return `complexCoshVec(${coerceExpression(args[0]?.expr ?? '0.0', args[0]?.type ?? REAL_TYPE, COMPLEX_TYPE)})`;
    case 'tanh': {
      const arg = coerceExpression(args[0]?.expr ?? '0.0', args[0]?.type ?? REAL_TYPE, COMPLEX_TYPE);
      return `frmTanh(${arg})`;
    }
    default:
      return fallbackForType(actualType);
  }
}

function generateIdentifier(name: string): string {
  if (isParameterName(name)) {
    return `u_${name}`;
  }

  switch (name) {
    case 'LastSqr':
      return 'frmLastSqr';
    case 'pi':
      return '3.141592653589793';
    case 'e':
      return '2.718281828459045';
    case 'maxit':
      return 'float(u_maxIterations)';
    case 'ismand':
      return '(u_isJulia ? 0.0 : 1.0)';
    default:
      return name;
  }
}

function coerceExpression(expr: string, from: VarType, to: VarType): string {
  if (from.kind === to.kind) return expr;
  if (from.kind === 'real' && to.kind === 'complex') {
    return `vec2(${expr}, 0.0)`;
  }
  return `(${expr}).x`;
}

function toRealExpression(expr: string, type: VarType): string {
  return type.kind === 'real' ? expr : `(${expr}).x`;
}

function toGlslType(type: VarType): string {
  return type.kind === 'real' ? 'float' : 'vec2';
}

function fallbackForType(type: VarType): string {
  return type.kind === 'real' ? '0.0' : 'vec2(0.0)';
}

function actualBinaryType(left: VarType, right: VarType, op: string): VarType {
  if (['<', '>', '<=', '>=', '==', '!=', '&&', '||'].includes(op)) {
    return REAL_TYPE;
  }
  if (left.kind === 'real' && right.kind === 'real') {
    return REAL_TYPE;
  }
  return COMPLEX_TYPE;
}

function formatFloat(value: number): string {
  const fixed = value.toFixed(6);
  return fixed === '-0.000000' ? '0.000000' : fixed;
}

function collectUsedFnSlots(ast: FrmAST): Set<string> {
  const used = new Set<string>();

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
      case 'call':
        if (isFnSlotName(node.name)) {
          used.add(node.name);
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
  return used;
}

function buildPrelude(fnSlots: string[], declarations: string[]): string {
  const parts: string[] = [];

  parts.push(`float frmLastSqr = 0.0;

float frmMagnitude(float value) {
  return value * value;
}

float frmMagnitude(vec2 value) {
  return dot(value, value);
}

float frmSqr(float value) {
  float result = value * value;
  frmLastSqr = result;
  return result;
}

vec2 frmSqr(vec2 value) {
  frmLastSqr = dot(value, value);
  return complexSqr(value);
}

float frmFlip(float value) {
  return value;
}

vec2 frmFlip(vec2 value) {
  return vec2(value.y, value.x);
}

float frmRecip(float value) {
  return value == 0.0 ? 0.0 : 1.0 / value;
}

vec2 frmRecip(vec2 value) {
  return complexDiv(vec2(1.0, 0.0), value);
}

vec2 frmComplexSqrt(vec2 value) {
  return complexPow(value, 0.5);
}

vec2 frmTanh(vec2 value) {
  return complexDiv(complexSinhVec(value), complexCoshVec(value));
}`);

  for (const fnSlot of fnSlots) {
    parts.push(buildFnSlotHelper(fnSlot));
  }

  if (declarations.length > 0) {
    parts.push(declarations.join('\n'));
  }

  return parts.join('\n\n');
}

function buildFnSlotHelper(fnSlot: string): string {
  const uniformName = `u_${fnSlot}`;
  const helperName = nameToApplyHelper(fnSlot);
  const cases = FN_SLOT_OPTIONS.map((option) => {
    switch (option.key) {
      case 'identity':
        return `  if (${uniformName} == ${option.value}) return value;`;
      case 'sin':
        return `  if (${uniformName} == ${option.value}) return complexSin(value);`;
      case 'cos':
        return `  if (${uniformName} == ${option.value}) return complexCos(value);`;
      case 'tan':
        return `  if (${uniformName} == ${option.value}) return complexTan(value);`;
      case 'exp':
        return `  if (${uniformName} == ${option.value}) return complexExp(value);`;
      case 'log':
        return `  if (${uniformName} == ${option.value}) return complexLog(value);`;
      case 'sqrt':
        return `  if (${uniformName} == ${option.value}) return frmComplexSqrt(value);`;
      case 'abs':
        return `  if (${uniformName} == ${option.value}) return abs(value);`;
      case 'sqr':
        return `  if (${uniformName} == ${option.value}) return frmSqr(value);`;
      case 'conj':
        return `  if (${uniformName} == ${option.value}) return complexConj(value);`;
      case 'flip':
        return `  if (${uniformName} == ${option.value}) return frmFlip(value);`;
      case 'recip':
        return `  if (${uniformName} == ${option.value}) return frmRecip(value);`;
      case 'cabs':
        return `  if (${uniformName} == ${option.value}) return vec2(length(value), 0.0);`;
      case 'real':
        return `  if (${uniformName} == ${option.value}) return vec2(value.x, 0.0);`;
      case 'imag':
        return `  if (${uniformName} == ${option.value}) return vec2(value.y, 0.0);`;
      case 'sinh':
        return `  if (${uniformName} == ${option.value}) return complexSinhVec(value);`;
      case 'cosh':
        return `  if (${uniformName} == ${option.value}) return complexCoshVec(value);`;
      case 'tanh':
        return `  if (${uniformName} == ${option.value}) return frmTanh(value);`;
      default:
        return '';
    }
  }).filter(Boolean);

  return [
    `vec2 ${helperName}(vec2 value) {`,
    ...cases,
    '  return value;',
    '}',
  ].join('\n');
}

function nameToApplyHelper(name: string): string {
  return `apply${name.charAt(0).toUpperCase()}${name.slice(1)}`;
}

function extractBailoutValue(node: ASTNode): number {
  if (node.type === 'binary' && ['<', '<='].includes(node.op)) {
    if (node.right.type === 'number') {
      return node.right.value;
    }
    if (node.left.type === 'number') {
      return node.left.value;
    }
  }
  return 4.0;
}

function isDefaultInit(initBlock: ASTNode[]): boolean {
  if (initBlock.length !== 1) return false;
  const stmt = initBlock[0];
  if (stmt.type !== 'assignment') return false;
  if (stmt.target !== 'z') return false;
  if (stmt.value.type === 'number' && stmt.value.value === 0) return true;
  if (stmt.value.type === 'complex' && stmt.value.real === 0 && stmt.value.imag === 0) return true;
  return false;
}
