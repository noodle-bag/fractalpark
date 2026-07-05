/**
 * FRM Parser - Module Index
 * M4.2 Phase 2.1
 */

export { 
  tokenize, 
  formatLexerErrors,
  type Token, 
  type TokenType,
  type LexerError,
  type TokenizeResult,
} from './lexer';
export { 
  parse, 
  formatParseErrors,
  type ParseError, 
  Parser,
} from './parser';
export { validate, type ValidationError } from './validator';
export { 
  compileFrm, 
  compileToGLSL, 
  compileFrmDetailed,
  mapGLSLErrorToFRM,
  type CompileResult,
  type DetailedCompileResult,
} from './compile';
export { generateGLSL, type CodeGenResult } from './codegen';
export { FRMSourceMap, type SourceMapping } from './sourcemap';
export { ErrorRecovery, type ParseError as RecoveryError } from './error-recovery';
export { 
  inferType, 
  collectVariables, 
  type VarType, 
  type TypeContext,
  BUILTIN_TYPES,
} from './type-system';
export { frmParserCache, FrmParserCache } from './cache';
export type { 
  ASTNode, 
  CanonicalFormula,
  FrmAST, 
  FrmParam, 
  FormulaCompatibilityNote,
  FormulaDialect,
  FormulaMetadata,
  SourceLocation,
  AssignmentNode,
  BinaryNode,
  UnaryNode,
  CallNode,
  IdentNode,
  NumberNode,
  ComplexNode,
  MagnitudeNode,
  IfNode,
} from './ast';
