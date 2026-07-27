import { describe, expect, it } from 'vitest';
import {
  FRM_GUIDE_TUTORIALS,
  getFrmGuideTutorialById,
} from '@/content/frm-guide';
import {
  MAX_FRM_FILE_BYTES,
  createFrmDownload,
  editorToExploreHref,
  frmDownloadFilename,
  parseEditorToExploreIntent,
  preflightFrmSource,
  readFrmFile,
  stripEditorToExploreIntent,
} from '@/lib/frm-editor';

const SINGLE_SOURCE = `Single {
init:
  z = 0
loop:
  z = z^2 + c
bailout:
  |z| < 4
}`;

describe('standalone FRM editor helpers', () => {
  it('reads a valid UTF-8 .frm file without rewriting its source', async () => {
    const source = `; keep this comment\n${SINGLE_SOURCE}\n`;
    const result = await readFrmFile(
      new File([source], 'formula.FRM', { type: 'text/plain' })
    );

    expect(result).toEqual({ success: true, source });
  });

  it('preserves an explicit UTF-8 BOM instead of silently cleaning the source', async () => {
    const source = `\uFEFF${SINGLE_SOURCE}\n`;
    const result = await readFrmFile(new File([source], 'bom.frm'));

    expect(result).toEqual({ success: true, source });
  });

  it('rejects the wrong extension, oversized files, and invalid UTF-8', async () => {
    await expect(readFrmFile(new File(['x'], 'formula.txt'))).resolves.toEqual({
      success: false,
      error: 'extension',
    });
    await expect(
      readFrmFile(
        new File(
          [new Uint8Array(MAX_FRM_FILE_BYTES + 1)],
          'large.frm'
        )
      )
    ).resolves.toEqual({ success: false, error: 'size' });
    await expect(
      readFrmFile(
        new File([new Uint8Array([0xc3, 0x28])], 'invalid.frm')
      )
    ).resolves.toEqual({ success: false, error: 'encoding' });
  });

  it('accepts a file at the exact 256 KiB boundary', async () => {
    const result = await readFrmFile(
      new File([new Uint8Array(MAX_FRM_FILE_BYTES)], 'boundary.frm')
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.source).toHaveLength(MAX_FRM_FILE_BYTES);
    }
  });

  it('detects multi-entry and trailing source without truncating it', () => {
    const multiple = `${SINGLE_SOURCE}\nSecond {\nloop:\n  z = z + c\n}`;
    const trailing = `${SINGLE_SOURCE}\nlegacy option`;

    expect(preflightFrmSource(SINGLE_SOURCE)).toEqual({ status: 'single' });
    expect(preflightFrmSource(`; { ignored }\n${SINGLE_SOURCE}`)).toEqual({
      status: 'single',
    });
    expect(preflightFrmSource(multiple)).toEqual({ status: 'multiple' });
    expect(preflightFrmSource(trailing)).toEqual({ status: 'trailing' });
    expect(multiple).toContain('Second');
  });

  it('creates a source-preserving download with a safe filename', async () => {
    const source = `${SINGLE_SOURCE}\n`;
    const download = createFrmDownload(source, '../Unsafe Formula');

    expect(download.filename).toBe('Unsafe-Formula.frm');
    expect(await download.blob.text()).toBe(source);
    expect(frmDownloadFilename('')).toBe('fractalpark-formula.frm');
  });

  it('builds, validates, and strips the one-time Editor to Explore intent', () => {
    expect(editorToExploreHref('en', 'custom-local')).toBe(
      '/en/explore?open=custom-formula&formula=custom-local'
    );
    expect(
      parseEditorToExploreIntent(
        new URLSearchParams('open=custom-formula&formula=custom-local')
      )
    ).toEqual({ status: 'valid', formulaId: 'custom-local' });
    expect(
      parseEditorToExploreIntent(new URLSearchParams('open=custom-formula'))
    ).toEqual({ status: 'invalid', formulaId: '', reason: 'missing' });
    expect(
      parseEditorToExploreIntent(
        new URLSearchParams('open=custom-formula&formula=mandelbrot')
      )
    ).toEqual({
      status: 'invalid',
      formulaId: 'mandelbrot',
      reason: 'invalid-id',
    });
    expect(
      parseEditorToExploreIntent(new URLSearchParams('formula=custom-local'))
    ).toEqual({ status: 'none' });
    expect(
      stripEditorToExploreIntent(
        'zh',
        new URLSearchParams(
          'open=custom-formula&formula=custom-local&panel=coloring'
        )
      )
    ).toBe('/zh/explore?panel=coloring');
  });

  it('allows only the three stable FRM Guide examples in the Editor query', () => {
    expect(FRM_GUIDE_TUTORIALS.map((tutorial) => tutorial.id)).toEqual([
      'starter-brot',
      'parameter-drift',
      'orbit-echo',
    ]);
    expect(getFrmGuideTutorialById('starter-brot')?.example.source).toContain(
      'StarterBrot'
    );
    expect(getFrmGuideTutorialById('fn-slot-weave')).toBeUndefined();
  });
});
