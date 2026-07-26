export type FormulaReferenceKind =
  | 'primary'
  | 'reference'
  | 'further-reading';

export interface FormulaContentEntry {
  formulaId: string;
  slug: string;
  math: {
    id: string;
    tex: string;
    plainText: string;
  }[];
  history?: {
    sourceIds: string[];
  };
  frm?: {
    sourcePath: string;
  };
  references?: {
    id: string;
    kind: FormulaReferenceKind;
    title: string;
    url: string;
  }[];
  parameters?: {
    id: string;
    uniformName?: string;
  }[];
  artworkIds: string[];
  relatedFormulaIds: string[];
  faqIds: string[];
}

export const FORMULA_CONTENT_MANIFEST = [
  {
    formulaId: 'mandelbrot',
    slug: 'mandelbrot',
    math: [
      {
        id: 'iteration',
        tex: 'z_{n+1}=z_n^2+c,\\quad z_0=0',
        plainText: 'z(n+1) = z(n)^2 + c, with z(0) = 0',
      },
    ],
    artworkIds: [
      'preset-mandelbrot-deep-escape',
      'preset-mandelbrot-crown',
      'preset-julia-aqua-compass',
    ],
    relatedFormulaIds: ['lambda', 'burningShip', 'quadJulia'],
    faqIds: ['membership', 'julia-mode'],
  },
  {
    formulaId: 'lambda',
    slug: 'lambda',
    math: [
      {
        id: 'iteration',
        tex: 'z_{n+1}=c\\left(z_n+\\frac12\\right)\\left(\\frac12-z_n\\right)',
        plainText:
          'z(n+1) = c times (z(n) + 1/2) times (1/2 - z(n))',
      },
    ],
    artworkIds: [
      'preset-lambda-julia-vortex',
      'preset-lambda-julia-ice-veil',
    ],
    relatedFormulaIds: ['mandelbrot', 'invertedLambda'],
    faqIds: ['parameter-role', 'julia-mode'],
  },
  {
    formulaId: 'mandelbox',
    slug: 'mandelbox',
    math: [
      {
        id: 'iteration',
        tex: 'z_{n+1}=s\\,\\operatorname{ballFold}(\\operatorname{boxFold}(z_n))+c',
        plainText: 'z(n+1) = scale times ballFold(boxFold(z(n))) + c',
      },
    ],
    parameters: [
      {
        id: 'scale',
        uniformName: 'u_mandelboxScale',
      },
    ],
    artworkIds: ['preset-mandelbox-cobalt-bastion'],
    relatedFormulaIds: ['circleInversion', 'buffalo'],
    faqIds: ['folds', 'dimension'],
  },
  {
    formulaId: 'perpendicularCeltic',
    slug: 'perpendicular-celtic',
    math: [
      {
        id: 'iteration',
        tex: 'z_{n+1}=\\left|\\operatorname{Re}((|x_n|+iy_n)^2)\\right|+i\\operatorname{Im}((|x_n|+iy_n)^2)+c',
        plainText:
          'Fold the real input, square it, fold the resulting real part, then add c',
      },
    ],
    artworkIds: ['preset-perpendicular-celtic-porcelain-halo'],
    relatedFormulaIds: ['burningShip', 'buffalo'],
    faqIds: ['folding', 'symmetry'],
  },
  {
    formulaId: 'quadJulia',
    slug: 'quartic-julia',
    math: [
      {
        id: 'iteration',
        tex: 'z_{n+1}=z_n^4+c',
        plainText: 'z(n+1) = z(n)^4 + c',
      },
    ],
    artworkIds: ['preset-quad-julia-ivory-filigree-seal'],
    relatedFormulaIds: ['mandelbrot', 'mcMullen23'],
    faqIds: ['name', 'constant'],
  },
  {
    formulaId: 'burningShip',
    slug: 'burning-ship',
    math: [
      {
        id: 'iteration',
        tex: 'z_{n+1}=(|\\operatorname{Re}z_n|+i|\\operatorname{Im}z_n|)^2+c',
        plainText:
          'z(n+1) = (absolute real z(n) + i times absolute imaginary z(n))^2 + c',
      },
    ],
    artworkIds: ['preset-burning-ship-cinder-rift'],
    relatedFormulaIds: ['airship', 'buffalo', 'perpendicularCeltic'],
    faqIds: ['difference', 'orientation'],
  },
  {
    formulaId: 'airship',
    slug: 'airship',
    math: [
      {
        id: 'iteration',
        tex: 'z_{n+1}=\\left(|x_n|+i\\,x_n|y_n|\\right)^2+c',
        plainText:
          'z(n+1) = (absolute x(n) + i times x(n) times absolute y(n))^2 + c',
      },
    ],
    artworkIds: ['preset-airship-inversion-seafoam-wings'],
    relatedFormulaIds: ['burningShip', 'buffalo'],
    faqIds: ['folding', 'transform'],
  },
  {
    formulaId: 'newton3',
    slug: 'newton-3',
    math: [
      {
        id: 'iteration',
        tex: 'z_{n+1}=z_n-\\frac{z_n^3-1}{3z_n^2}',
        plainText: 'z(n+1) = z(n) - (z(n)^3 - 1) / (3 z(n)^2)',
      },
    ],
    artworkIds: ['preset-newton-deep-spiral'],
    relatedFormulaIds: ['newtonCosh', 'magnet1'],
    faqIds: ['basins', 'escape'],
  },
  {
    formulaId: 'newtonCosh',
    slug: 'newton-cosh',
    math: [
      {
        id: 'iteration',
        tex: 'z_{n+1}=z_n-\\frac{\\cosh z_n-1}{\\sinh z_n}',
        plainText: 'z(n+1) = z(n) - (cosh(z(n)) - 1) / sinh(z(n))',
      },
    ],
    artworkIds: ['preset-newton-cosh-ember-meridian'],
    relatedFormulaIds: ['newton3', 'coshMandelb'],
    faqIds: ['target', 'singularities'],
  },
  {
    formulaId: 'magnet1',
    slug: 'magnet-type-1',
    math: [
      {
        id: 'iteration',
        tex: 'z_{n+1}=\\left(\\frac{z_n+c}{z_n-c}\\right)^2',
        plainText: 'z(n+1) = ((z(n) + c) / (z(n) - c))^2',
      },
    ],
    artworkIds: ['preset-magnet-julia-ember-reach'],
    relatedFormulaIds: ['magnet2', 'newton3'],
    faqIds: ['name', 'poles'],
  },
  {
    formulaId: 'magnet2',
    slug: 'magnet-type-2',
    math: [
      {
        id: 'iteration',
        tex: 'z_{n+1}=\\left(\\frac{z_n^2+c}{z_n^2-c}\\right)^2',
        plainText: 'z(n+1) = ((z(n)^2 + c) / (z(n)^2 - c))^2',
      },
    ],
    artworkIds: [
      'preset-magnet-julia-rust-cross',
      'preset-magnet-julia-moonstone-reef',
    ],
    relatedFormulaIds: ['magnet1', 'newton3'],
    faqIds: ['difference', 'poles'],
  },
  {
    formulaId: 'phoenixMulti',
    slug: 'multi-phoenix',
    math: [
      {
        id: 'iteration',
        tex: 'z_{n+1}=z_n^2+c+pz_{n-1}',
        plainText: 'z(n+1) = z(n)^2 + c + p times z(n-1)',
      },
    ],
    parameters: [
      {
        id: 'memory',
        uniformName: 'u_phoenixMultiP',
      },
    ],
    artworkIds: ['preset-phoenix-multi-ember-compass'],
    relatedFormulaIds: ['mandelbrot', 'spider'],
    faqIds: ['memory', 'initial-state'],
  },
  {
    formulaId: 'coshMandelb',
    slug: 'cosh-mandelbrot',
    math: [
      {
        id: 'iteration',
        tex: 'z_{n+1}=\\cosh(z_n)+c',
        plainText: 'z(n+1) = cosh(z(n)) + c',
      },
    ],
    artworkIds: ['preset-cosh-mandelbrot-gilded-plumes'],
    relatedFormulaIds: ['newtonCosh', 'lambda'],
    faqIds: ['periodicity', 'growth'],
  },
  {
    formulaId: 'buffalo',
    slug: 'buffalo',
    math: [
      {
        id: 'iteration',
        tex: 'z_{n+1}=|x_n|^2-|y_n|^2+2i\\,x_n|y_n|+c',
        plainText:
          'z(n+1) = absolute x(n) squared minus absolute y(n) squared + 2 i x(n) absolute y(n) + c',
      },
    ],
    artworkIds: [
      'preset-buffalo-julia-eclipse',
      'preset-buffalo-julia-spiral-gate',
    ],
    relatedFormulaIds: ['burningShip', 'perpendicularCeltic'],
    faqIds: ['folding', 'julia-mode'],
  },
  {
    formulaId: 'circleInversion',
    slug: 'circle-inversion',
    math: [
      {
        id: 'iteration',
        tex: 'z_{n+1}=\\frac{1}{z_n^2}+c',
        plainText: 'z(n+1) = 1 / z(n)^2 + c',
      },
    ],
    artworkIds: ['preset-circle-inversion-citrine-spine'],
    relatedFormulaIds: ['rationalMap1', 'mcMullen23'],
    faqIds: ['origin', 'singularity'],
  },
  {
    formulaId: 'invertedLambda',
    slug: 'inverted-lambda',
    math: [
      {
        id: 'iteration',
        tex: 'z_{n+1}=c z_n(1-z_n)+\\frac{0.18}{z_n^2+c}',
        plainText: 'z(n+1) = c z(n)(1 - z(n)) + 0.18 / (z(n)^2 + c)',
      },
    ],
    artworkIds: ['preset-inverted-lambda-obsidian-knot'],
    relatedFormulaIds: ['lambda', 'rationalMap1'],
    faqIds: ['inversion', 'poles'],
  },
  {
    formulaId: 'mcMullen23',
    slug: 'mcmullen-2-3',
    math: [
      {
        id: 'iteration',
        tex: 'z_{n+1}=z_n^2+\\frac{c}{z_n^3}',
        plainText: 'z(n+1) = z(n)^2 + c / z(n)^3',
      },
    ],
    artworkIds: ['preset-mcmullen-azure-whorl'],
    relatedFormulaIds: ['rationalMap1', 'circleInversion'],
    faqIds: ['exponents', 'singularity'],
  },
  {
    formulaId: 'rationalMap1',
    slug: 'rational-map-1',
    math: [
      {
        id: 'iteration',
        tex: 'z_{n+1}=\\frac{z_n^2}{z_n+c}',
        plainText: 'z(n+1) = z(n)^2 / (z(n) + c)',
      },
    ],
    artworkIds: ['preset-rational-map-sapphire-fan'],
    relatedFormulaIds: ['circleInversion', 'mcMullen23'],
    faqIds: ['rational', 'pole'],
  },
  {
    formulaId: 'spider',
    slug: 'spider',
    math: [
      {
        id: 'iteration',
        tex: 'z_{n+1}=z_n^2+\\frac{c}{z_n}',
        plainText: 'z(n+1) = z(n)^2 + c / z(n)',
      },
    ],
    artworkIds: ['preset-spider-julia-abyss'],
    relatedFormulaIds: ['mandelbrot', 'phoenixMulti'],
    faqIds: ['zero', 'filaments'],
  },
  {
    formulaId: 'zaslavskyMap',
    slug: 'zaslavsky-map',
    math: [
      {
        id: 'iteration',
        tex: 'z_{n+1}=e^{0.55i}\\left(z_n+0.28\\sin z_n\\right)+c',
        plainText:
          'z(n+1) = exp(0.55 i) times (z(n) + 0.28 sin(z(n))) + c',
      },
    ],
    artworkIds: ['preset-zaslavsky-penitent-mandala'],
    relatedFormulaIds: ['zubieta', 'lambda'],
    faqIds: ['rotation', 'transform'],
  },
  {
    formulaId: 'zubieta',
    slug: 'zubieta',
    math: [
      {
        id: 'iteration',
        tex: 'z_{n+1}=\\left|z_n^2+c\\right|',
        plainText:
          'z(n+1) is the component-wise absolute value of z(n)^2 + c',
      },
    ],
    artworkIds: ['preset-zubieta-kaleido-amber-mandala'],
    relatedFormulaIds: ['buffalo', 'zaslavskyMap'],
    faqIds: ['absolute-value', 'symmetry'],
  },
] satisfies FormulaContentEntry[];

export function getFormulaContentById(
  formulaId: string
): FormulaContentEntry | undefined {
  return FORMULA_CONTENT_MANIFEST.find(
    (entry) => entry.formulaId === formulaId
  );
}

export function getFormulaContentBySlug(
  slug: string
): FormulaContentEntry | undefined {
  return FORMULA_CONTENT_MANIFEST.find((entry) => entry.slug === slug);
}
