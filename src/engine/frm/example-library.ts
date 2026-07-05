import type { FormulaExperienceHint } from './authoring';

export interface FormulaExample {
  id: string;
  nameKey: string;
  descriptionKey: string;
  source: string;
  experienceHint?: FormulaExperienceHint;
}

export const CUSTOM_FORMULA_EXAMPLES: FormulaExample[] = [
  {
    id: 'starter-brot',
    nameKey: 'formula.examples.starterBrot.name',
    descriptionKey: 'formula.examples.starterBrot.description',
    source: `StarterBrot {
init:
  z = 0
loop:
  z = z^2 + c
bailout:
  |z| < 4
}`,
    experienceHint: {
      bounds: {
        centerX: -0.5,
        centerY: 0,
        zoom: 0.4,
        rotation: 0,
      },
      coloring: {
        outsideColoringId: 'smooth',
        insideColoringId: 'black',
        paletteIndex: 0,
      },
    },
  },
  {
    id: 'parameter-drift',
    nameKey: 'formula.examples.parameterDrift.name',
    descriptionKey: 'formula.examples.parameterDrift.description',
    source: `ParameterDrift {
init:
  z = 0
loop:
  z = z^2 + c + p1 * 0.15 + p2 * (0.05, -0.02)
bailout:
  cabs(z) < 8
}`,
    experienceHint: {
      bounds: {
        centerX: -0.2,
        centerY: 0.02,
        zoom: 0.75,
        rotation: 0,
      },
      coloring: {
        outsideColoringId: 'smooth',
        insideColoringId: 'black',
        paletteIndex: 1,
      },
    },
  },
  {
    id: 'orbit-echo',
    nameKey: 'formula.examples.orbitEcho.name',
    descriptionKey: 'formula.examples.orbitEcho.description',
    source: `OrbitEcho {
init:
  z = pixel
loop:
  z = sqr(z) + zPrev * (0.30, -0.12) + pixel * (0.85, 0.0)
bailout:
  |z| < 48
}`,
    experienceHint: {
      bounds: {
        centerX: -0.08,
        centerY: 0.0,
        zoom: 1.08,
        rotation: 0,
      },
      coloring: {
        outsideColoringId: 'orbitEcho',
        insideColoringId: 'finalOrbit',
        paletteIndex: 4,
      },
    },
  },
  {
    id: 'fn-slot-weave',
    nameKey: 'formula.examples.fnSlotWeave.name',
    descriptionKey: 'formula.examples.fnSlotWeave.description',
    source: `FnSlotWeave {
init:
  z = pixel
loop:
  z = fn1(z) + fn2(zPrev) * 0.35 + p1
bailout:
  |z| < 24
}`,
    experienceHint: {
      bounds: {
        centerX: 0.12,
        centerY: 0.02,
        zoom: 1.18,
        rotation: 0,
      },
      coloring: {
        outsideColoringId: 'stripe',
        insideColoringId: 'black',
        paletteIndex: 2,
      },
    },
  },
  {
    id: 'branch-garden',
    nameKey: 'formula.examples.branchGarden.name',
    descriptionKey: 'formula.examples.branchGarden.description',
    source: `BranchGarden {
init:
  z = pixel
loop:
  if |z| < 0.25
    z = z^2 + pixel
  elseif real(z) > 0
    z = sin(z) + pixel * 0.40
  else
    z = cos(z) + pixel * -0.40
  endif
bailout:
  |z| < 32
}`,
    experienceHint: {
      bounds: {
        centerX: -0.18,
        centerY: 0.0,
        zoom: 0.92,
        rotation: 0,
      },
      coloring: {
        outsideColoringId: 'smooth',
        insideColoringId: 'finalOrbit',
        paletteIndex: 3,
      },
    },
  },
];
