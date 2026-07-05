/**
 * FRM Parser - Validator
 * M4.2 Phase 2.1
 * 
 * Validates AST for semantic correctness
 */

import type { ASTNode, FrmAST } from './ast';
import { collectVariables } from './type-system';
import { FN_SLOT_NAMES, KNOWN_FUNCTION_NAMES, LEGACY_BUILTIN_NAMES, PARAMETER_NAMES, isFnSlotName } from './builtins';

export interface ValidationError {
  line: number;
  col: number;
  message: string;
  severity: 'error' | 'warning';
}

// Valid built-in functions
const VALID_FUNCTIONS = new Set(KNOWN_FUNCTION_NAMES);

// GLSL reserved words that can't be used as variable names
const GLSL_RESERVED = new Set([
  'float', 'vec2', 'vec3', 'vec4', 'int', 'bool',
  'if', 'else', 'for', 'while', 'do', 'break', 'continue', 'return',
  'true', 'false', 'void', 'struct', 'uniform', 'varying', 'attribute',
  'const', 'in', 'out', 'inout',
]);

// Built-in variables that cannot be reassigned (readonly)
const READONLY_BUILTINS = new Set([
  'c',
  'pixel',
  'zPrev',
  ...PARAMETER_NAMES,
  ...LEGACY_BUILTIN_NAMES,
  ...FN_SLOT_NAMES,
]);

// All built-in variables (including z which can be reassigned)
const ALL_BUILTINS = new Set([
  'z',
  'c',
  'pixel',
  'zPrev',
  ...PARAMETER_NAMES,
  ...LEGACY_BUILTIN_NAMES,
]);

export function validate(ast: FrmAST): { valid: boolean; errors: ValidationError[] } {
  const errors: ValidationError[] = [];
  const declaredVars = collectVariables(ast.initBlock, ast.loopBlock);

  function addError(line: number, col: number, message: string, severity: 'error' | 'warning' = 'error') {
    errors.push({ line, col, message, severity });
  }

  function validateNode(node: ASTNode, scopeVars: Set<string>) {
    switch (node.type) {
      case 'ident': {
        const name = node.name;
        if (!ALL_BUILTINS.has(name) && !scopeVars.has(name) && !declaredVars.has(name)) {
          addError(node.loc.line, node.loc.col, `Undeclared variable: ${name}`);
        }
        if (GLSL_RESERVED.has(name)) {
          addError(node.loc.line, node.loc.col, `Reserved words cannot be used as variable names: ${name}`);
        }
        break;
      }

      case 'call': {
        if (!VALID_FUNCTIONS.has(node.name as (typeof KNOWN_FUNCTION_NAMES)[number])) {
          addError(node.loc.line, node.loc.col, `Unknown function: ${node.name}`);
        }
        if (isFnSlotName(node.name) && node.args.length !== 1) {
          addError(node.loc.line, node.loc.col, `${node.name} requires exactly 1 argument`);
        }
        // Validate arguments
        for (const arg of node.args) {
          validateNode(arg, scopeVars);
        }
        break;
      }

      case 'assignment': {
        // Check target is not a readonly builtin
        if (READONLY_BUILTINS.has(node.target)) {
          addError(node.loc.line, node.loc.col, `Cannot assign to read-only variable: ${node.target}`);
        }
        if (GLSL_RESERVED.has(node.target)) {
          addError(node.loc.line, node.loc.col, `Reserved words cannot be used as variable names: ${node.target}`);
        }
        // Add target to scope for subsequent statements
        scopeVars.add(node.target);
        validateNode(node.value, scopeVars);
        break;
      }

      case 'binary': {
        validateNode(node.left, scopeVars);
        validateNode(node.right, scopeVars);
        break;
      }

      case 'unary': {
        validateNode(node.operand, scopeVars);
        break;
      }

      case 'magnitude': {
        validateNode(node.operand, scopeVars);
        break;
      }

      case 'if': {
        validateNode(node.condition, scopeVars);
        
        // Create new scope for then branch
        const thenScope = new Set(scopeVars);
        for (const stmt of node.then) {
          validateNode(stmt, thenScope);
        }

        // Validate elseif branches
        if (node.elseIf) {
          for (const branch of node.elseIf) {
            validateNode(branch.condition, scopeVars);
            const elseIfScope = new Set(scopeVars);
            for (const stmt of branch.body) {
              validateNode(stmt, elseIfScope);
            }
          }
        }

        // Validate else branch
        if (node.else) {
          const elseScope = new Set(scopeVars);
          for (const stmt of node.else) {
            validateNode(stmt, elseScope);
          }
        }
        break;
      }

      case 'number':
      case 'complex':
        // Always valid
        break;

      default:
        break;
    }
  }

  // Validate init block
  const initScope = new Set<string>();
  for (const stmt of ast.initBlock) {
    validateNode(stmt, initScope);
  }

  // Validate loop block
  const loopScope = new Set(initScope);
  for (const stmt of ast.loopBlock) {
    validateNode(stmt, loopScope);
  }

  // Validate bailout expression
  validateNode(ast.bailoutExpr, loopScope);

  // Check bailout is boolean-like (comparison or logical)
  const bailoutType = getBailoutType(ast.bailoutExpr);
  if (bailoutType !== 'comparison' && bailoutType !== 'logical') {
    addError(
      ast.bailoutExpr.loc.line,
      ast.bailoutExpr.loc.col,
      'Bailout expression should be a comparison expression, for example |z| < 4',
      'warning'
    );
  }

  return {
    valid: !errors.some(e => e.severity === 'error'),
    errors,
  };
}

function getBailoutType(node: ASTNode): string {
  switch (node.type) {
    case 'binary':
      if (['<', '>', '<=', '>=', '==', '!='].includes(node.op)) {
        return 'comparison';
      }
      if (['&&', '||'].includes(node.op)) {
        return 'logical';
      }
      return 'other';
    case 'unary':
      if (node.op === '!') return 'logical';
      return 'other';
    default:
      return 'other';
  }
}
