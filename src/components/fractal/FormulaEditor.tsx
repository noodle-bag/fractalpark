/**
 * Formula Code Editor Component
 * M4.2 Phase 2.2 + M4.4 Enhanced Error Diagnostics
 *
 * Lazy-loaded CodeMirror 6 editor for .frm formulas with real-time linting.
 * Uses codemirror-lint.ts as the single source of truth for diagnostics.
 */

'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Play, Save, AlertCircle, CheckCircle, ChevronDown, ChevronUp, Info, RotateCcw } from 'lucide-react';
import type { FormulaPlugin } from '@/engine/plugins/types';
import { compileFrm, mapGLSLErrorToFRM } from '@/engine/frm/compile';
import type { FormulaCompatibilityNote, FormulaDialect } from '@/engine/frm/ast';
import {
  formulaMetadataToExperienceHint,
  mergeFormulaExperienceHints,
  type FormulaExperienceHint,
} from '@/engine/frm/authoring';
import type { FRMSourceMap } from '@/engine/frm/sourcemap';
import { detectFormulaDialect } from '@/engine/frm/source-directives';
import { pluginRegistry } from '@/engine/plugins/registry';
import type { ViewBounds } from '@/engine/types';
import { trackEvent } from '@/components/analytics/PageViewTracker';

import type { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import type { EditorError } from '@/engine/frm/codemirror-lint';

interface CodeMirrorModules {
  EditorView: typeof EditorView;
  EditorState: typeof import('@codemirror/state').EditorState;
  frmLanguage: Extension;
  createFRMLinter: typeof import('@/engine/frm/codemirror-lint').createFRMLinter;
}

let cmModules: CodeMirrorModules | null = null;

function getCompatibilityNoteStyle(kind: FormulaCompatibilityNote['kind']) {
  switch (kind) {
    case 'warning':
      return {
        container: 'bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800 text-yellow-900 dark:text-yellow-200',
        item: 'bg-white/40 dark:bg-yellow-950/20',
        icon: 'text-yellow-500',
        Icon: AlertCircle,
      };
    case 'unsupported':
      return {
        container: 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800 text-orange-900 dark:text-orange-200',
        item: 'bg-white/40 dark:bg-orange-950/20',
        icon: 'text-orange-500',
        Icon: AlertCircle,
      };
    default:
      return {
        container: 'bg-sky-50 dark:bg-sky-950/30 border-sky-200 dark:border-sky-800 text-sky-900 dark:text-sky-200',
        item: 'bg-white/40 dark:bg-sky-950/20',
        icon: 'text-sky-500',
        Icon: Info,
      };
  }
}

async function loadCodeMirror(): Promise<CodeMirrorModules> {
  if (!cmModules) {
    const [view, state, lang, lint] = await Promise.all([
      import('@codemirror/view'),
      import('@codemirror/state'),
      import('@/engine/frm/codemirror-language'),
      import('@/engine/frm/codemirror-lint'),
    ]);
    cmModules = {
      EditorView: view.EditorView,
      EditorState: state.EditorState,
      frmLanguage: lang.frmLanguage,
      createFRMLinter: lint.createFRMLinter,
    };
  }
  return cmModules;
}

interface FormulaEditorProps {
  formulaId?: string;
  initialSource?: string;
  initialExperienceHint?: FormulaExperienceHint;
  currentBounds?: ViewBounds;
  onCompile?: (plugin: FormulaPlugin, experienceHint?: FormulaExperienceHint) => void;
  onSave?: (
    name: string,
    source: string,
    experienceHint?: FormulaExperienceHint,
    formulaId?: string,
  ) => { success: boolean; error?: string } | void;
  onClose?: () => void;
}

const DEFAULT_SOURCE = `MyFormula {
init:
  z = 0
loop:
  z = z^2 + c
bailout:
  |z| < 4
}`;

/**
 * Parse GLSL error line/col from a WebGL shader error log.
 * Typical format: "ERROR: 0:42: ..." where 42 is the line number.
 */
function parseGLSLErrorLog(log: string): { line: number; col: number; message: string }[] {
  const errors: { line: number; col: number; message: string }[] = [];
  const lines = log.split('\n');
  for (const line of lines) {
    const match = line.match(/ERROR:\s*\d+:(\d+):\s*(.*)/);
    if (match) {
      errors.push({
        line: parseInt(match[1], 10),
        col: 1,
        message: match[2].trim(),
      });
    }
  }
  return errors;
}

export function FormulaEditor({
  formulaId,
  initialSource = DEFAULT_SOURCE,
  initialExperienceHint,
  currentBounds,
  onCompile,
  onSave,
  onClose,
}: FormulaEditorProps) {
  const t = useTranslations('explore.editor');
  const [source, setSource] = useState(initialSource);
  const [experienceHint, setExperienceHint] = useState<FormulaExperienceHint | undefined>(initialExperienceHint);
  const [isCompiling, setIsCompiling] = useState(false);
  const [isEditorReady, setIsEditorReady] = useState(false);
  const [compileResult, setCompileResult] = useState<{
    success: boolean;
    errors: string[];
    warnings: string[];
    compatibilityNotes: FormulaCompatibilityNote[];
    effectiveExperienceHint?: FormulaExperienceHint;
    plugin?: FormulaPlugin;
  } | null>(null);
  const [editorErrors, setEditorErrors] = useState<EditorError[]>([]);
  const [showAllErrors, setShowAllErrors] = useState(false);
  const [lastSuccessfulSource, setLastSuccessfulSource] = useState<string | null>(null);
  const [lastSuccessfulHint, setLastSuccessfulHint] = useState<FormulaExperienceHint | undefined>(initialExperienceHint);

  const { toast } = useToast();
  const editorRef = useRef<HTMLDivElement>(null);
  const cmViewRef = useRef<EditorView | null>(null);
  const lastSourceMapRef = useRef<FRMSourceMap | null>(null);
  const lastSourceRef = useRef<string>(initialSource);
  const currentDialect: FormulaDialect = detectFormulaDialect(source);

  const replaceSource = useCallback((nextSource: string) => {
    setSource(nextSource);
    lastSourceRef.current = nextSource;
    setCompileResult(null);

    if (cmViewRef.current) {
      const currentDoc = cmViewRef.current.state.doc.toString();
      if (currentDoc !== nextSource) {
        cmViewRef.current.dispatch({
          changes: {
            from: 0,
            to: currentDoc.length,
            insert: nextSource,
          },
        });
      }
    }
  }, []);

  // Stable callback ref for the linter to avoid recreating the editor
  const errorsCallbackRef = useRef<(errors: EditorError[]) => void>(() => {});
  errorsCallbackRef.current = (errors: EditorError[]) => {
    setEditorErrors(prev => {
      const prevStr = JSON.stringify(prev);
      const newStr = JSON.stringify(errors);
      return prevStr === newStr ? prev : errors;
    });
  };

  // Initialize CodeMirror editor
  useEffect(() => {
    let isMounted = true;

    async function initEditor() {
      if (!editorRef.current) return;

      try {
        const { EditorView: EV, EditorState: ES, frmLanguage, createFRMLinter } = await loadCodeMirror();
        if (!isMounted) return;

        const frmLinter = createFRMLinter((errors) => {
          errorsCallbackRef.current(errors);
        });

        const editorState = ES.create({
          doc: source,
          extensions: [
            EV.theme({
              '&': {
                fontSize: '14px',
                fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
                backgroundColor: '#1e1e1e',
              },
              '.cm-content': {
                color: '#d4d4d4',
                caretColor: '#fff',
              },
              '.cm-gutters': {
                backgroundColor: '#1e1e1e',
                color: '#858585',
                borderRight: '1px solid #333',
              },
              '.cm-activeLine': {
                backgroundColor: '#2a2d2e',
              },
              '.cm-activeLineGutter': {
                backgroundColor: '#2a2d2e',
              },
              '.cm-selectionBackground': {
                backgroundColor: '#264f78',
              },
              '.cm-line': {
                padding: '0 4px',
              },
              '.cm-lintRange': {
                textDecoration: 'underline wavy',
              },
              '.cm-lintRange-error': {
                textDecorationColor: '#ff4444',
              },
              '.cm-lintRange-warning': {
                textDecorationColor: '#ffaa00',
              },
              '.cm-lintMarker': {
                width: '16px',
                height: '16px',
              },
              '.cm-lintMarker-error': {
                color: '#ff4444',
              },
              '.cm-lintMarker-warning': {
                color: '#ffaa00',
              },
              '.cm-tooltip.cm-lintTooltip': {
                backgroundColor: '#252526',
                border: '1px solid #454545',
                borderRadius: '4px',
                padding: '8px 12px',
                color: '#cccccc',
                fontSize: '13px',
                maxWidth: '400px',
              },
            }),
            frmLanguage,
            EV.lineWrapping,
            EV.updateListener.of((update) => {
              if (update.docChanged) {
                const newSource = update.state.doc.toString();
                setSource(newSource);
                lastSourceRef.current = newSource;
                setCompileResult(null);
              }
            }),
            frmLinter,
          ],
        });

        const editorView = new EV({
          state: editorState,
          parent: editorRef.current,
        });

        cmViewRef.current = editorView;
        setIsEditorReady(true);
      } catch (error) {
        console.error('Failed to initialize CodeMirror:', error);
        toast({
          title: t('loadFailed'),
          description: t('loadFailedDescription'),
          variant: 'destructive',
        });
      }
    }

    initEditor();

    return () => {
      isMounted = false;
      if (cmViewRef.current) {
        cmViewRef.current.destroy();
        cmViewRef.current = null;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCompile = useCallback(async () => {
    setIsCompiling(true);
    setCompileResult(null);

    try {
      const result = compileFrm(source);

      // Store source map for potential GLSL error mapping
      if (result.sourceMap) {
        lastSourceMapRef.current = result.sourceMap;
      }

      // If FRM compilation produced GLSL, check for GLSL-level issues
      // by attempting to map any errors through the source map
      let mappedErrors = [...result.errors];
      const mappedWarnings = [...result.warnings];

      // If compilation failed and we have a source map, try to enrich error messages
      if (!result.success && result.sourceMap) {
        mappedErrors = result.errors.map(err => {
          // Try to parse GLSL error format from the error string
          const glslErrors = parseGLSLErrorLog(err);
          if (glslErrors.length > 0) {
            const mapped = mapGLSLErrorToFRM(glslErrors[0], result.sourceMap!, source);
            if (mapped) {
              return mapped.formatted;
            }
          }
          return err;
        });
      }

      setCompileResult({
        success: result.success,
        errors: mappedErrors,
        warnings: mappedWarnings,
        compatibilityNotes: result.canonicalFormula?.compatibilityNotes ?? [],
        effectiveExperienceHint: mergeFormulaExperienceHints(
          experienceHint,
          formulaMetadataToExperienceHint(result.canonicalFormula?.metadata),
        ),
        plugin: result.plugin,
      });

      if (result.success && result.plugin) {
        const effectiveHint = mergeFormulaExperienceHints(
          experienceHint,
          formulaMetadataToExperienceHint(result.canonicalFormula?.metadata),
        );
        setLastSuccessfulSource(source);
        setLastSuccessfulHint(effectiveHint);
        try {
          pluginRegistry.register(result.plugin);
        } catch {
          // May already be registered
        }
        toast({
          title: t('compileSuccess'),
          description: t('compileSuccessDescription', { name: result.plugin.name }),
        });
        onCompile?.(result.plugin, effectiveHint);
      } else {
        toast({
          title: t('compileFailed'),
          description: t('compileFailedDescription', { count: mappedErrors.length }),
          variant: 'destructive',
        });
      }
    } catch (error) {
      // Try to map GLSL errors through source map if available
      const errorMessage = error instanceof Error ? error.message : String(error);
      let displayErrors = [errorMessage];

      if (lastSourceMapRef.current && errorMessage.includes('Shader compilation failed')) {
        const glslErrors = parseGLSLErrorLog(errorMessage);
        if (glslErrors.length > 0) {
          displayErrors = glslErrors.map(glslErr => {
            const mapped = mapGLSLErrorToFRM(glslErr, lastSourceMapRef.current!, lastSourceRef.current);
            return mapped ? mapped.formatted : `${t('glslErrorUnmapped')}: ${glslErr.message}`;
          });
        }
      }

      setCompileResult({
        success: false,
        errors: displayErrors,
        warnings: [],
        compatibilityNotes: [],
        effectiveExperienceHint: undefined,
      });

      toast({
        title: t('compileError'),
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsCompiling(false);
    }
  }, [experienceHint, source, onCompile, toast, t]);

  const handleSave = useCallback(() => {
    const name = compileResult?.plugin?.name || 'Untitled';
    const effectiveHint = compileResult?.effectiveExperienceHint ?? experienceHint;
    const saveResult = onSave?.(name, source, effectiveHint, formulaId);
    if (saveResult && saveResult.success === false) {
      toast({
        title: t('saveFailed'),
        description: saveResult.error ?? t('saveFailedDescription'),
        variant: 'destructive',
      });
      return;
    }

    trackEvent('custom_formula_save', { name });

    toast({
      title: t('saved'),
      description: t('savedDescription', { name }),
    });
  }, [source, compileResult, experienceHint, formulaId, onSave, toast, t]);

  const handleRestoreLastSuccessful = useCallback(() => {
    if (!lastSuccessfulSource) return;

    replaceSource(lastSuccessfulSource);
    setExperienceHint(lastSuccessfulHint);
    toast({
      title: t('restoreSuccess'),
      description: t('restoreSuccessDescription'),
    });
  }, [lastSuccessfulHint, lastSuccessfulSource, replaceSource, t, toast]);

  const handleSetCurrentViewAsDefault = useCallback(() => {
    if (!currentBounds) {
      return;
    }

    setExperienceHint(prev => ({
      ...prev,
      bounds: {
        centerX: currentBounds.centerX,
        centerY: currentBounds.centerY,
        zoom: currentBounds.zoom,
        rotation: currentBounds.rotation ?? 0,
      },
    }));

    toast({
      title: t('defaultViewSet'),
      description: t('defaultViewSetDescription'),
    });
  }, [currentBounds, t, toast]);

  const errorCount = editorErrors.filter(e => e.severity === 'error').length;
  const warningCount = editorErrors.filter(e => e.severity === 'warning').length;
  const infoCount = editorErrors.filter(e => e.severity === 'info').length;
  const displayErrors = showAllErrors ? editorErrors : editorErrors.slice(0, 3);

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>{t('title')}</span>
          <div className="flex items-center gap-2 text-sm font-normal">
            {errorCount > 0 && (
              <span className="text-red-500 flex items-center gap-1">
                <AlertCircle className="w-4 h-4" />
                {t('errors', { count: errorCount })}
              </span>
            )}
            {warningCount > 0 && (
              <span className="text-yellow-500 flex items-center gap-1">
                <AlertCircle className="w-4 h-4" />
                {t('warnings', { count: warningCount })}
              </span>
            )}
            {infoCount > 0 && (
              <span className="text-sky-500 flex items-center gap-1">
                <Info className="w-4 h-4" />
                {t('infos', { count: infoCount })}
              </span>
            )}
            {errorCount === 0 && warningCount === 0 && infoCount === 0 && isEditorReady && (
              <span className="text-green-500 flex items-center gap-1">
                <CheckCircle className="w-4 h-4" />
                {t('noErrors')}
              </span>
            )}
          </div>
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              ×
            </Button>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Editor container */}
        <div
          ref={editorRef}
          className="border rounded-md overflow-hidden"
          style={{
            minHeight: '300px',
            backgroundColor: '#1e1e1e',
          }}
        />

        {!isEditorReady && (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            {t('loading')}
          </div>
        )}

        {/* Real-time error list */}
        {editorErrors.length > 0 && (
          <div className="border rounded-md overflow-hidden">
            <div
              className="bg-muted/50 px-3 py-2 flex items-center justify-between cursor-pointer"
              onClick={() => setShowAllErrors(!showAllErrors)}
            >
              <span className="text-sm font-medium">
                {t('diagnostics', { errors: errorCount, warnings: warningCount, infos: infoCount })}
              </span>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                {showAllErrors ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </Button>
            </div>
            <div className={`${showAllErrors ? 'max-h-60' : 'max-h-32'} overflow-auto`}>
              {displayErrors.map((err, i) => (
                <div
                  key={i}
                  className={`px-3 py-2 text-sm border-t first:border-t-0 ${
                    err.severity === 'error'
                      ? 'bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-300'
                      : err.severity === 'warning'
                        ? 'bg-yellow-50 dark:bg-yellow-950/30 text-yellow-800 dark:text-yellow-300'
                        : 'bg-sky-50 dark:bg-sky-950/30 text-sky-800 dark:text-sky-200'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {err.severity === 'info' ? (
                      <Info className="w-4 h-4 mt-0.5 flex-shrink-0 text-sky-500" />
                    ) : (
                      <AlertCircle className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                        err.severity === 'error' ? 'text-red-500' : 'text-yellow-500'
                      }`} />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">
                        {t('line', { line: err.line, col: err.col })}
                      </div>
                      <div>{err.message}</div>
                      {err.suggestion && (
                        <div className="mt-1 text-muted-foreground">
                          {err.suggestion}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {!showAllErrors && editorErrors.length > 3 && (
                <div className="px-3 py-2 text-sm text-muted-foreground bg-muted/30 text-center">
                  {t('moreIssues', { count: editorErrors.length - 3 })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Compilation results */}
        {compileResult && (
          <div className="space-y-2">
            {compileResult.success ? (
              <Alert className="bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800">
                <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                <AlertDescription className="text-green-800 dark:text-green-300">
                  {t('compileSuccess')}
                  {compileResult.warnings.length > 0 && (
                    <span className="ml-2">({t('warnings', { count: compileResult.warnings.length })})</span>
                  )}
                </AlertDescription>
              </Alert>
            ) : (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {t('compileFailed')} ({t('errors', { count: compileResult.errors.length })})
                </AlertDescription>
              </Alert>
            )}

            {compileResult.errors.length > 0 && (
              <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-md p-3 text-sm font-mono text-red-800 dark:text-red-300 max-h-40 overflow-auto whitespace-pre-wrap">
                {compileResult.errors.map((error, i) => (
                  <div key={i} className="py-1">{error}</div>
                ))}
              </div>
            )}

            {compileResult.warnings.length > 0 && (
              <div className="bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded-md p-3 text-sm font-mono text-yellow-800 dark:text-yellow-300 max-h-40 overflow-auto">
                {compileResult.warnings.map((warning, i) => (
                  <div key={i} className="py-1">{warning}</div>
                ))}
              </div>
            )}

            {compileResult.compatibilityNotes.length > 0 && (
              <div className="space-y-2">
                {compileResult.compatibilityNotes.map((note, i) => {
                  const style = getCompatibilityNoteStyle(note.kind);
                  const NoteIcon = style.Icon;
                  return (
                    <div
                      key={`${note.kind}-${i}`}
                      className={`rounded-md border p-3 text-sm ${style.container}`}
                    >
                      <div className="mb-2 flex items-center gap-2 font-medium">
                        <NoteIcon className={`h-4 w-4 ${style.icon}`} />
                        {t('compatibilityNotes')}
                      </div>
                      <div className={`rounded-sm px-2 py-1 ${style.item}`}>
                        {note.message}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </CardContent>

      <CardFooter className="flex justify-between">
        <div className="flex gap-2">
          <Button
            onClick={handleCompile}
            disabled={isCompiling || !isEditorReady || errorCount > 0}
          >
            {isCompiling ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t('compiling')}
              </>
            ) : (
              <>
                <Play className="w-4 h-4 mr-2" />
                {t('compile')}
              </>
            )}
          </Button>

          {compileResult?.success && (
            <Button variant="outline" onClick={handleSave}>
              <Save className="w-4 h-4 mr-2" />
              {t('save')}
            </Button>
          )}

          {!compileResult?.success && lastSuccessfulSource && (
            <Button variant="ghost" onClick={handleRestoreLastSuccessful}>
              <RotateCcw className="w-4 h-4 mr-2" />
              {t('restoreLastSuccessful')}
            </Button>
          )}

          {currentBounds && (
            <Button variant="ghost" onClick={handleSetCurrentViewAsDefault}>
              {t('setCurrentViewAsDefault')}
            </Button>
          )}
        </div>

        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="rounded-full border px-2 py-0.5 text-xs">
            {t(currentDialect === 'myfrac-native' ? 'modeNative' : 'modeCompat')}
          </span>
          <span>
            {t('lines', { count: source.split('\n').length })}
          </span>
        </div>
      </CardFooter>
    </Card>
  );
}

export default FormulaEditor;
