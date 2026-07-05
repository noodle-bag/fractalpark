/**
 * FRM Parser - Type System
 * M4.2 Phase 2.1
 * 
 * Type inference for complex vs real variables
 */

import type { ASTNode } from './ast';
export type VarType = { kind: 'complex' } | { kind: 'real' };
export type VariableType = VarType;

export interface TypeContext {
  getVariableType(name: string): VarType | undefined;
}

// Built-in variable types
export const BUILTIN_TYPES: Record<string, VarType> = {
  'z': { kind: 'complex' },
  'c': { kind: 'complex' },
  'pixel': { kind: 'complex' },
  'zPrev': { kind: 'complex' },
  'p1': { kind: 'complex' },
  'p2': { kind: 'complex' },
  'p3': { kind: 'complex' },
  'p4': { kind: 'complex' },
  'p5': { kind: 'complex' },
  'LastSqr': { kind: 'real' },
  'pi': { kind: 'real' },
  'e': { kind: 'real' },
  'maxit': { kind: 'real' },
  'ismand': { kind: 'real' },
};

// Function return type mapping
const FUNCTION_RETURN_TYPES: Record<string, VarType> = {
  'sin': { kind: 'complex' },
  'cos': { kind: 'complex' },
  'tan': { kind: 'complex' },
  'exp': { kind: 'complex' },
  'log': { kind: 'complex' },
  'sqrt': { kind: 'complex' },
  'abs': { kind: 'complex' },
  'cabs': { kind: 'real' },
  'real': { kind: 'real' },
  'imag': { kind: 'real' },
  'conj': { kind: 'complex' },
  'flip': { kind: 'complex' },
  'sqr': { kind: 'complex' },
  'recip': { kind: 'complex' },
  'atan2': { kind: 'real' },
  'sinh': { kind: 'complex' },
  'cosh': { kind: 'complex' },
  'tanh': { kind: 'complex' },
  'fn1': { kind: 'complex' },
  'fn2': { kind: 'complex' },
  'fn3': { kind: 'complex' },
  'fn4': { kind: 'complex' },
};

export function inferType(node: ASTNode, ctx: TypeContext): VarType {
  switch (node.type) {
    case 'number':
      // Number literals start as real and are promoted to complex when needed.
      return { kind: 'real' };

    case 'complex':
      return { kind: 'complex' };

    case 'ident': {
      // Check builtins first
      if (BUILTIN_TYPES[node.name]) {
        return BUILTIN_TYPES[node.name];
      }
      // Then user-defined variables
      return ctx.getVariableType(node.name) ?? { kind: 'complex' };
    }

    case 'call': {
      const firstArgType = node.args[0] ? inferType(node.args[0], ctx) : { kind: 'complex' as const };

      if (node.name === 'abs') {
        return firstArgType.kind === 'real' ? { kind: 'real' } : { kind: 'complex' };
      }
      if (node.name === 'sqrt' || node.name === 'sqr' || node.name === 'flip' || node.name === 'recip') {
        return firstArgType.kind === 'real' ? { kind: 'real' } : { kind: 'complex' };
      }

      return FUNCTION_RETURN_TYPES[node.name] ?? { kind: 'complex' };
    }

    case 'binary': {
      const left = inferType(node.left, ctx);
      const right = inferType(node.right, ctx);

      switch (node.op) {
        case '+':
        case '-':
          // complex ± real = complex
          // real ± complex = complex  
          // complex ± complex = complex
          // real ± real = real
          if (left.kind === 'real' && right.kind === 'real') {
            return { kind: 'real' };
          }
          return { kind: 'complex' };

        case '*':
        case '/':
          // Any multiplication/division with complex returns complex
          return { kind: 'complex' };

        case '^':
          if (left.kind === 'real' && right.kind === 'real') {
            return { kind: 'real' };
          }
          return { kind: 'complex' };

        case '<':
        case '>':
        case '<=':
        case '>=':
        case '==':
        case '!=':
        case '&&':
        case '||':
          // Comparison operators return boolean (treated as real 0/1)
          return { kind: 'real' };

        default:
          return { kind: 'complex' };
      }
    }

    case 'unary': {
      const operand = inferType(node.operand, ctx);
      switch (node.op) {
        case '-':
          return operand;
        case '!':
          return { kind: 'real' };
        default:
          return operand;
      }
    }

    case 'magnitude':
      // |z| returns real
      return { kind: 'real' };

    case 'assignment': {
      return inferType(node.value, ctx);
    }

    case 'if': {
      // If expressions don't have a type (statements, not expressions)
      return { kind: 'complex' };
    }

    default:
      return { kind: 'complex' };
  }
}

/**
 * Collect all variable declarations from init and loop blocks
 * and infer their types based on first assignment
 */
export function collectVariables(
  initBlock: ASTNode[],
  loopBlock: ASTNode[]
): Map<string, VarType> {
  const vars = new Map<string, VarType>();

  // Add built-ins
  for (const [name, type] of Object.entries(BUILTIN_TYPES)) {
    vars.set(name, type);
  }
  const ctx: TypeContext = {
    getVariableType: (name) => vars.get(name),
  };

  // Helper to process a block
  const processBlock = (block: ASTNode[]) => {
    for (const stmt of block) {
      processNode(stmt);
    }
  };

  const processNode = (node: ASTNode) => {
    switch (node.type) {
      case 'assignment': {
        const inferredType = inferType(node.value, ctx);
        const existing = vars.get(node.target);
        
        if (existing) {
          // Type conflict: complex wins over real (conservative)
          if (existing.kind === 'real' && inferredType.kind === 'complex') {
            vars.set(node.target, { kind: 'complex' });
          }
        } else {
          vars.set(node.target, inferredType);
        }
        break;
      }

      case 'if': {
        processBlock(node.then);
        if (node.elseIf) {
          for (const branch of node.elseIf) {
            processBlock(branch.body);
          }
        }
        if (node.else) {
          processBlock(node.else);
        }
        break;
      }

      default:
        // Other expression types don't declare variables
        break;
    }
  };

  processBlock(initBlock);
  processBlock(loopBlock);

  return vars;
}
