import { describe, expect, it } from 'vitest';
import { parseFormulaSourceDirectives } from '@/engine/frm/source-directives';
import { compileFrm } from '@/engine/frm/compile';

describe('FRM source directives', () => {
  it('detects native mode and parses default view metadata from comment directives', () => {
    const source = `; @mode: native
; @default-view: -0.75, 0.1, 12, 0.3
NativeExample {
init:
  z = 0
loop:
  z = z^2 + c
bailout:
  |z| < 4
}`;

    const parsed = parseFormulaSourceDirectives(source);
    expect(parsed.metadata.dialect).toBe('myfrac-native');
    expect(parsed.metadata.defaultView).toEqual({
      centerX: -0.75,
      centerY: 0.1,
      zoom: 12,
      rotation: 0.3,
    });

    const result = compileFrm(source);
    expect(result.success).toBe(true);
    expect(result.canonicalFormula?.metadata.dialect).toBe('myfrac-native');
    expect(result.canonicalFormula?.metadata.defaultView?.zoom).toBe(12);
  });

  it('supports #native shorthand and parses default coloring metadata', () => {
    const source = `; #native
; @default-coloring: outside=orbitEcho, inside=finalOrbit, palette=4
NativeColoring {
init:
  z = 0
loop:
  z = z^2 + c
bailout:
  |z| < 4
}`;

    const parsed = parseFormulaSourceDirectives(source);
    expect(parsed.metadata.dialect).toBe('myfrac-native');
    expect(parsed.metadata.defaultColoringHint).toEqual({
      outsideColoringId: 'orbitEcho',
      insideColoringId: 'finalOrbit',
      paletteIndex: 4,
    });
  });

  it('emits compatibility warnings when native-only metadata is used in compat mode', () => {
    const source = `; @default-view: -0.5, 0.0, 2
CompatExample {
init:
  z = 0
loop:
  z = z^2 + c
bailout:
  |z| < 4
}`;

    const parsed = parseFormulaSourceDirectives(source);
    expect(parsed.metadata.dialect).toBe('fractint-compat');
    expect(parsed.compatibilityNotes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'warning',
        }),
      ]),
    );
  });

  it('marks unknown source directives as unsupported', () => {
    const source = `; @orbit-channel: trapDistance
CompatExample {
init:
  z = 0
loop:
  z = z^2 + c
bailout:
  |z| < 4
}`;

    const parsed = parseFormulaSourceDirectives(source);
    expect(parsed.compatibilityNotes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'unsupported',
        }),
      ]),
    );
  });
});
