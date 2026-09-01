'use client';

import { useEffect, useRef, useState } from 'react';

interface CanonicalSourceEditorProps {
  readonly label: string;
  readonly source: string;
}

export function CanonicalSourceEditor({
  label,
  source,
}: CanonicalSourceEditorProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let view: import('@codemirror/view').EditorView | undefined;

    void Promise.all([
      import('@codemirror/view'),
      import('@codemirror/state'),
      import('@/engine/frm/codemirror-language'),
    ])
      .then(([viewModule, stateModule, languageModule]) => {
        if (!active || !parentRef.current) return;
        const { EditorView, lineNumbers } = viewModule;
        const { EditorState } = stateModule;
        view = new EditorView({
          parent: parentRef.current,
          state: EditorState.create({
            doc: source,
            extensions: [
              lineNumbers(),
              languageModule.frmLanguage,
              EditorState.readOnly.of(true),
              EditorView.editable.of(false),
              EditorView.lineWrapping,
              EditorView.contentAttributes.of({
                'aria-label': label,
                'aria-readonly': 'true',
              }),
              EditorView.theme({
                '&': {
                  height: '100%',
                  minHeight: '18rem',
                  backgroundColor: '#111827',
                  color: '#e5e7eb',
                  fontSize: '13px',
                },
                '.cm-scroller': {
                  fontFamily:
                    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                  overflow: 'auto',
                },
                '.cm-content': {
                  caretColor: 'transparent',
                  padding: '0.75rem 0',
                },
                '.cm-gutters': {
                  backgroundColor: '#111827',
                  borderRightColor: '#374151',
                  color: '#9ca3af',
                },
                '.cm-activeLine, .cm-activeLineGutter': {
                  backgroundColor: 'transparent',
                },
              }),
            ],
          }),
        });
        if (active) setReady(true);
      })
      .catch(() => {
        if (active) setFailed(true);
      });

    return () => {
      active = false;
      view?.destroy();
    };
  }, [label, source]);

  return (
    <div
      aria-label={label}
      className="relative min-h-72 overflow-hidden rounded-xl border bg-slate-950"
      data-editor-ready={ready ? 'true' : 'false'}
      data-testid="canonical-source-editor"
      role="region"
    >
      <div className="h-full min-h-72" ref={parentRef} />
      {!ready ? (
        <pre
          aria-hidden={!failed}
          className="absolute inset-0 overflow-auto whitespace-pre p-4 font-mono text-xs leading-6 text-slate-200"
          data-testid="canonical-source-editor-fallback"
        >
          {source}
        </pre>
      ) : null}
    </div>
  );
}
