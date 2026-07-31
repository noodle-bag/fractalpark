'use client';

import dynamic from 'next/dynamic';

const FrmEditorWorkspace = dynamic(
  () =>
    import('@/components/fractal/FrmEditorWorkspace').then(
      (module) => module.FrmEditorWorkspace
    ),
  { ssr: false }
);

export function FrmEditorClient() {
  return (
    <div data-testid="frm-editor-client">
      <FrmEditorWorkspace />
    </div>
  );
}
