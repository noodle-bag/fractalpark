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
    history: {
      sourceIds: [
        'fatou-biography',
        'julia-biography',
        'brooks-matelski-1978',
        'mandelbrot-1980',
        'mandelbrot-yale',
        'douady-1982',
        'hubbard-connectivity',
        'discovery-history',
      ],
    },
    references: [
      {
        id: 'fatou-biography',
        kind: 'reference',
        title: 'Pierre Fatou (1878–1929) — MacTutor History of Mathematics',
        url: 'https://mathshistory.st-andrews.ac.uk/Biographies/Fatou/',
      },
      {
        id: 'julia-biography',
        kind: 'reference',
        title: 'Gaston Julia (1893–1978) — MacTutor History of Mathematics',
        url: 'https://mathshistory.st-andrews.ac.uk/Biographies/Julia/',
      },
      {
        id: 'brooks-matelski-1978',
        kind: 'primary',
        title: 'The Dynamics of 2-Generator Subgroups of PSL(2, C) — Robert Brooks and J. Peter Matelski',
        url: 'https://doi.org/10.1515/9781400881550-007',
      },
      {
        id: 'mandelbrot-1980',
        kind: 'primary',
        title: 'Fractal Aspects of the Iteration of z → λz(1-z) for Complex λ and z — Benoit B. Mandelbrot',
        url: 'https://doi.org/10.1111/j.1749-6632.1980.tb29690.x',
      },
      {
        id: 'mandelbrot-yale',
        kind: 'reference',
        title: 'In memoriam: Benoit Mandelbrot — Yale News',
        url: 'https://news.yale.edu/2010/10/18/in-memoriam-benoit-mandelbrot',
      },
      {
        id: 'douady-1982',
        kind: 'primary',
        title: 'Systèmes dynamiques holomorphes — Adrien Douady',
        url: 'https://eudml.org/doc/110016',
      },
      {
        id: 'hubbard-cornell',
        kind: 'reference',
        title: 'John H. Hubbard — Cornell University Department of Mathematics',
        url: 'https://math.cornell.edu/john-h-hubbard',
      },
      {
        id: 'hubbard-connectivity',
        kind: 'reference',
        title: 'Hubbard among the first mathematicians to show connectivity of the Mandelbrot set — Cornell Mathematics',
        url: 'https://math.cornell.edu/news/hubbard-among-first-mathematicians-show-connectivity-mandelbrot-set',
      },
      {
        id: 'discovery-history',
        kind: 'further-reading',
        title: 'Who Discovered the Mandelbrot Set? — Scientific American',
        url: 'https://www.scientificamerican.com/article/mandelbrot-set-1990-horgan/',
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
    history: {
      sourceIds: [
        'mandelbrot-1980-lambda',
        'peitgen-beauty-of-fractals',
      ],
    },
    references: [
      {
        id: 'mandelbrot-1980-lambda',
        kind: 'primary',
        title: 'Fractal Aspects of the Iteration of z → λz(1−z) for Complex λ and z — Benoit B. Mandelbrot (Annals of the New York Academy of Sciences, 1980)',
        url: 'https://doi.org/10.1111/j.1749-6632.1980.tb29690.x',
      },
      {
        id: 'peitgen-beauty-of-fractals',
        kind: 'reference',
        title: 'The Beauty of Fractals — Heinz-Otto Peitgen and Peter H. Richter (Springer, 1986)',
        url: 'https://link.springer.com/book/9783540158516',
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
    history: {
      sourceIds: [
        'lowe-amazing-fractal-2010',
        'imaginary-mandelbox',
        'bridges-helt-2018',
      ],
    },
    references: [
      {
        id: 'lowe-amazing-fractal-2010',
        kind: 'primary',
        title: 'Amazing Fractal — Tom Lowe on FractalForums',
        url: 'https://www.fractalforums.com/3d-fractal-generation/amazing-fractal/',
      },
      {
        id: 'imaginary-mandelbox',
        kind: 'reference',
        title: 'The Mandelbox, an Artistic and Geometric Journey — IMAGINARY',
        url: 'https://www.imaginary.org/gallery/the-mandelbox-an-artistic-and-geometric-journey',
      },
      {
        id: 'bridges-helt-2018',
        kind: 'reference',
        title: 'Extending Mandelbox Fractals with Shape Inversions — Bridges 2018 Conference Proceedings',
        url: 'https://archive.bridgesmathart.org/2018/bridges2018-547.pdf',
      },
      {
        id: 'lowe-mandelbox-site',
        kind: 'reference',
        title: 'What is a Mandelbox — Tom Lowe\'s Mandelbox Site',
        url: 'https://sites.google.com/site/mandelbox/what-is-a-mandelbox',
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
    history: {
      sourceIds: [
        'fractal-wiki-celtic',
      ],
    },
    references: [
      {
        id: 'fractal-wiki-celtic',
        kind: 'reference',
        title: 'Celtic — Fractal Art Wiki',
        url: 'https://fractal.fandom.com/wiki/Celtic',
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
    history: {
      sourceIds: [
        'fatou-biography',
        'julia-biography',
      ],
    },
    references: [
      {
        id: 'fatou-biography',
        kind: 'reference',
        title: 'Pierre Fatou — MacTutor History of Mathematics',
        url: 'https://mathshistory.st-andrews.ac.uk/Biographies/Fatou/',
      },
      {
        id: 'julia-biography',
        kind: 'reference',
        title: 'Gaston Julia — MacTutor History of Mathematics',
        url: 'https://mathshistory.st-andrews.ac.uk/Biographies/Julia/',
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
    history: {
      sourceIds: [
        'michelitsch-rossler-1992',
        'paul-bourke-1993',
        'wikipedia-burning-ship',
      ],
    },
    references: [
      {
        id: 'michelitsch-rossler-1992',
        kind: 'primary',
        title: 'The "Burning Ship" and Its Quasi-Julia Sets — Computers & Graphics Vol. 16, No. 4, pp. 435–438 (1992)',
        url: 'https://doi.org/10.1016/0097-8493(92)90032-Q',
      },
      {
        id: 'paul-bourke-1993',
        kind: 'reference',
        title: 'Burning Ship Fractal — Paul Bourke (1993)',
        url: 'https://paulbourke.net/fractals/burnship/',
      },
      {
        id: 'wikipedia-burning-ship',
        kind: 'further-reading',
        title: 'Burning Ship fractal — Wikipedia',
        url: 'https://en.wikipedia.org/wiki/Burning_Ship_fractal',
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
    references: [
      {
        id: 'reddit-airship',
        kind: 'further-reading',
        title: 'The Airship Fractal — Reddit r/fractals',
        url: 'https://www.reddit.com/r/fractals/comments/1h5yehe/the_airship_fractal/',
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
    history: {
      sourceIds: [
        'cayley-1879',
        'peitgen-richter-1986',
      ],
    },
    references: [
      {
        id: 'cayley-1879',
        kind: 'primary',
        title: 'The Newton-Fourier imaginary problem — Arthur Cayley, American Journal of Mathematics 2(1):97, 1879',
        url: 'https://doi.org/10.2307/2369201',
      },
      {
        id: 'peitgen-richter-1986',
        kind: 'primary',
        title: 'The Beauty of Fractals: Images of Complex Dynamical Systems — Heinz-Otto Peitgen and Peter H. Richter (Chapter 6: Newton\'s Method for Complex Polynomials: Cayley\'s Problem)',
        url: 'https://link.springer.com/book/10.1007/978-3-642-61717-1',
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
    history: {
      sourceIds: [
        'peitgen-richter-1986',
        'povray-fractal-patterns',
      ],
    },
    references: [
      {
        id: 'peitgen-richter-1986',
        kind: 'primary',
        title: 'The Beauty of Fractals: Images of Complex Dynamical Systems — Heinz-Otto Peitgen and Peter H. Richter',
        url: 'https://link.springer.com/book/10.1007/978-3-642-61717-1',
      },
      {
        id: 'povray-fractal-patterns',
        kind: 'reference',
        title: 'Fractal Patterns — POV-Ray Documentation',
        url: 'https://www.povray.org/documentation/view/3.60/377/',
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
    history: {
      sourceIds: [
        'peitgen-richter-1986',
        'povray-fractal-patterns',
      ],
    },
    references: [
      {
        id: 'peitgen-richter-1986',
        kind: 'primary',
        title: 'The Beauty of Fractals: Images of Complex Dynamical Systems — Heinz-Otto Peitgen and Peter H. Richter',
        url: 'https://link.springer.com/book/10.1007/978-3-642-61717-1',
      },
      {
        id: 'povray-fractal-patterns',
        kind: 'reference',
        title: 'Fractal Patterns — POV-Ray Documentation',
        url: 'https://www.povray.org/documentation/view/3.60/377/',
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
    history: {
      sourceIds: [
        'ushiki-phoenix-1988',
        'ushiki-homepage',
        'ushiki-papers',
        'ultrafractal-phoenix',
        'synapticspiral-phoenix',
      ],
    },
    references: [
      {
        id: 'ushiki-phoenix-1988',
        kind: 'primary',
        title: 'Phoenix — Shigehiro Ushiki, IEEE Trans. Circuits and Systems, Vol.35, No.7, July 1988, pp788–789',
        url: 'https://doi.org/10.1109/31.1839',
      },
      {
        id: 'ushiki-homepage',
        kind: 'reference',
        title: 'Shigehiro Ushiki — Kyoto University Homepage',
        url: 'https://www.math.kyoto-u.ac.jp/~ushiki/',
      },
      {
        id: 'ushiki-papers',
        kind: 'reference',
        title: 'Shigehiro Ushiki — Papers',
        url: 'https://www.math.kyoto-u.ac.jp/~ushiki/papers/index.html',
      },
      {
        id: 'ultrafractal-phoenix',
        kind: 'further-reading',
        title: 'Standard PhoenixJulia — Ultra Fractal Reference',
        url: 'https://www.ultrafractal.com/formulas/reference/Standard/Standard_PhoenixJulia.html',
      },
      {
        id: 'synapticspiral-phoenix',
        kind: 'further-reading',
        title: 'What Is the Phoenix Fractal? Memory-Driven Fractal Art',
        url: 'https://synapticspiral.nz/phoenix-fractal-info.html',
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
    history: {
      sourceIds: [
        'pickover-cosh-1988',
        'devaney-krych-exp-1984',
      ],
    },
    references: [
      {
        id: 'pickover-cosh-1988',
        kind: 'primary',
        title: 'Chaotic behavior of the transcendental mapping (Z→cosh(Z)+μ) — Clifford A. Pickover, The Visual Computer, Vol.4, 1988, pp243–246',
        url: 'https://doi.org/10.1007/BF01901279',
      },
      {
        id: 'devaney-krych-exp-1984',
        kind: 'reference',
        title: 'Dynamics of exp(z) — R. Devaney and M. Krych, Ergodic Theory and Dynamical Systems, Vol.4, 1984, pp35–52',
        url: 'https://doi.org/10.1017/S0143385700002253',
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
    history: {
      sourceIds: [
        'theory-org-buffalo',
      ],
    },
    references: [
      {
        id: 'theory-org-buffalo',
        kind: 'reference',
        title: 'Buffalo Fractal — theory.org',
        url: 'https://theory.org/fracdyn/buffalo/',
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
    history: {
      sourceIds: [
        'mcmullen-1988-perturbation',
        'devaney-mcmullen-family',
      ],
    },
    references: [
      {
        id: 'mcmullen-1988-perturbation',
        kind: 'primary',
        title: 'Automorphisms of Rational Maps — Curt McMullen (Holomorphic Functions and Moduli I, MSRI Publications 10, Springer, 1988)',
        url: 'https://doi.org/10.1007/978-1-4613-9602-4_3',
      },
      {
        id: 'devaney-mcmullen-family',
        kind: 'further-reading',
        title: 'Singular Perturbations of Complex Polynomials — Robert L. Devaney (Bulletin of the AMS 50(3), 2013)',
        url: 'https://doi.org/10.1090/s0273-0979-2013-01410-1',
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
    history: {
      sourceIds: [
        'mandelbrot-1980-lambda',
        'mcmullen-1988-perturbation',
      ],
    },
    references: [
      {
        id: 'mandelbrot-1980-lambda',
        kind: 'primary',
        title: 'Fractal Aspects of the Iteration of z → λz(1−z) for Complex λ and z — Benoit B. Mandelbrot',
        url: 'https://doi.org/10.1111/j.1749-6632.1980.tb29690.x',
      },
      {
        id: 'mcmullen-1988-perturbation',
        kind: 'reference',
        title: 'Automorphisms of Rational Maps — Curt McMullen (Holomorphic Functions and Moduli I, MSRI Publications 10, Springer, 1988)',
        url: 'https://doi.org/10.1007/978-1-4613-9602-4_3',
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
    history: {
      sourceIds: [
        'mcmullen-1988',
        'mcmullen-homepage',
        'garijo-godillon-2014',
        'devaney-look-uminsky-2005',
        'qiu-wang-yin-2012',
      ],
    },
    references: [
      {
        id: 'mcmullen-1988',
        kind: 'primary',
        title: 'Automorphisms of Rational Maps — Curtis T. McMullen',
        url: 'https://doi.org/10.1007/978-1-4613-9602-4_3',
      },
      {
        id: 'mcmullen-homepage',
        kind: 'reference',
        title: 'Curtis T. McMullen — Harvard University',
        url: 'https://people.math.harvard.edu/~ctm/',
      },
      {
        id: 'garijo-godillon-2014',
        kind: 'primary',
        title: 'On McMullen-like Mappings — Antonio Garijo and Sébastien Godillon',
        url: 'https://arxiv.org/abs/1403.2420',
      },
      {
        id: 'devaney-look-uminsky-2005',
        kind: 'primary',
        title: 'The Escape Trichotomy for Singularly Perturbed Rational Maps — Robert L. Devaney, Daniel M. Look, and David Uminsky',
        url: 'https://doi.org/10.1512/iumj.2005.54.2615',
      },
      {
        id: 'qiu-wang-yin-2012',
        kind: 'primary',
        title: 'Dynamics of McMullen Maps — Weiyuan Qiu, Xiaoguang Wang, and Yongcheng Yin',
        url: 'https://doi.org/10.1016/j.aim.2011.12.026',
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
    history: {
      sourceIds: [
        'zaslavsky-1978',
        'scholarpedia-zaslavsky',
      ],
    },
    references: [
      {
        id: 'scholarpedia-zaslavsky',
        kind: 'reference',
        title: 'Zaslavsky Map — Scholarpedia (George Zaslavsky, 2007)',
        url: 'https://doi.org/10.4249/scholarpedia.2662',
      },
      {
        id: 'zaslavsky-1978',
        kind: 'primary',
        title: 'The Simplest Case of a Strange Attractor — G. M. Zaslavskii, Physics Letters A (1978)',
        url: 'https://doi.org/10.1016/0375-9601(78)90195-0',
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
    history: {
      sourceIds: [
        'burning-ship-wikipedia',
        'michelitsch-rossler-1992',
      ],
    },
    references: [
      {
        id: 'burning-ship-wikipedia',
        kind: 'further-reading',
        title: 'Burning Ship fractal — Wikipedia',
        url: 'https://en.wikipedia.org/wiki/Burning_Ship_fractal',
      },
      {
        id: 'michelitsch-rossler-1992',
        kind: 'reference',
        title: 'The "Burning Ship" and Its Quasi-Julia Sets — Michelitsch and Rössler, 1992',
        url: 'https://doi.org/10.1016/0898-1221(92)90028-F',
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
