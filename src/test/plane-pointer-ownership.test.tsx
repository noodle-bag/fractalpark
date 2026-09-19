import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ComplexPlanePicker } from '@/components/fractal/ComplexPlanePicker';
import { TransformPointPicker } from '@/components/fractal/TransformPointPicker';

describe.each(['complex', 'transform'] as const)('%s plane pointer ownership', (kind) => {
  function setup() {
    const onChange = vi.fn();
    const { container } = render(kind === 'complex' ? (
      <ComplexPlanePicker
        value={[0, 0]} onChange={onChange}
        keyboardStep={0.01}
        realAxis={{ min: -2, max: 2 }} imaginaryAxis={{ min: -2, max: 2 }}
        realLabel="Re" imaginaryLabel="Im" ariaLabel="plane" resetLabel="reset"
      />
    ) : <TransformPointPicker valueX={0} valueY={0} onChange={onChange} />);
    const svg = container.querySelector('svg')!;
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 200, bottom: 100,
      width: 200, height: 100, toJSON: () => ({}),
    });
    const captured = new Set<number>();
    const capture = vi.fn((id: number) => captured.add(id));
    const release = vi.fn((id: number) => captured.delete(id));
    Object.assign(svg, {
      setPointerCapture: capture, releasePointerCapture: release,
      hasPointerCapture: (id: number) => captured.has(id),
    });
    const pointer = (type: string, id = 1, extra: Record<string, unknown> = {}, target: Element = svg) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.assign(event, { pointerId: id, isPrimary: true, button: 0, buttons: 1, clientX: 50, clientY: 25, ...extra });
      fireEvent(target, event);
    };
    const expectValue = (x: number, y: number) => {
      expect(onChange).toHaveBeenLastCalledWith(...(kind === 'complex' ? [[x, y]] : [x, y]));
    };
    return { svg, onChange, capture, release, pointer, expectValue };
  }

  it('captures the persistent SVG, not a transient child', () => {
    const { svg, capture, pointer, expectValue } = setup();
    const child = svg.querySelector('circle')!;
    pointer('pointerdown', 1, {}, child);
    expect(capture).toHaveBeenCalledWith(1);
    expectValue(-1, 1);
    expect(svg).toHaveClass('touch-none');
  });

  it.each(['pointerup', 'pointercancel', 'lostpointercapture'])('retains the last valid value on %s and permits a new gesture', (finish) => {
    const { pointer, onChange, expectValue } = setup();
    pointer('pointerdown');
    pointer('pointermove', 1, { clientX: 150, clientY: 75 });
    expectValue(1, -1);
    pointer(finish, 1, { clientX: -999, clientY: -999 });
    onChange.mockClear();
    pointer('pointermove', 1, { buttons: 0 });
    expect(onChange).not.toHaveBeenCalled();
    pointer('pointerdown');
    expectValue(-1, 1);
  });

  it('ignores additional pointers and their endings without interrupting the owner', () => {
    const { pointer, onChange, release, expectValue } = setup();
    pointer('pointerdown');
    onChange.mockClear();
    pointer('pointerdown', 2, { isPrimary: false, clientX: 150 });
    pointer('pointermove', 2, { isPrimary: false });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) pointer(type, 2, { isPrimary: false });
    expect(onChange).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
    pointer('pointermove', 1, { clientX: 150, clientY: 75 });
    expectValue(1, -1);
  });

  it('ignores secondary buttons and non-primary pointers when idle', () => {
    const { pointer, capture, onChange } = setup();
    pointer('pointerdown', 1, { button: 2 });
    pointer('pointerdown', 2, { isPrimary: false });
    expect(capture).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not commit idle movement if capture ended before a loss event was delivered', () => {
    const { pointer, onChange } = setup();
    pointer('pointerdown');
    onChange.mockClear();
    pointer('pointermove', 1, { buttons: 0, clientX: 150, clientY: 75 });
    expect(onChange).not.toHaveBeenCalled();
    pointer('pointerdown');
    expect(onChange).toHaveBeenCalled();
  });

  it('clamps outside the plane, continues on reentry, and stops after release', () => {
    const { pointer, onChange, expectValue } = setup();
    pointer('pointerdown');
    pointer('pointermove', 1, { clientX: 300, clientY: -100 });
    expectValue(2, 2);
    pointer('pointermove', 1, { clientX: 150, clientY: 75 });
    expectValue(1, -1);
    pointer('pointerup');
    onChange.mockClear();
    pointer('pointermove');
    expect(onChange).not.toHaveBeenCalled();
  });
});
