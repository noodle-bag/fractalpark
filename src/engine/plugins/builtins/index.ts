import { pluginRegistry } from '../registry';

// Classic (28)
import { mandelbrotPlugin } from './formulas/mandelbrot';
import { burningShipPlugin } from './formulas/burningShip';
import { tricornPlugin } from './formulas/tricorn';
import { lambdaPlugin } from './formulas/lambda';
import { quadJuliaPlugin } from './formulas/quadJulia';
import { cubicMandelbrotPlugin } from './formulas/cubicMandelbrot';
import { quarticMandelbrotPlugin } from './formulas/quarticMandelbrot';
import { mandelboxPlugin } from './formulas/mandelbox';
import { heartPlugin } from './formulas/heart';
import { manowarPlugin } from './formulas/manowar';
import { biomorphPlugin } from './formulas/biomorph';
import { cactusPlugin } from './formulas/cactus';
import { logisticPlugin } from './formulas/logistic';
import { simonBrotPlugin } from './formulas/simonBrot';
import { multicorn4Plugin } from './formulas/multicorn4';
import { multicorn5Plugin } from './formulas/multicorn5';
import { chebyshev2Plugin } from './formulas/chebyshev2';
import { chebyshev3Plugin } from './formulas/chebyshev3';
import { chebyshev4Plugin } from './formulas/chebyshev4';
import { chebyshev5Plugin } from './formulas/chebyshev5';
import { multicorn6Plugin } from './formulas/multicorn6';
import { multicorn7Plugin } from './formulas/multicorn7';
import { perpendicularMandelbrotPlugin } from './formulas/perpendicularMandelbrot';
import { perpendicularTricornPlugin } from './formulas/perpendicularTricorn';
import { perpendicularCelticPlugin } from './formulas/perpendicularCeltic';
import { cubicPerpendicularMandelbrotPlugin } from './formulas/cubicPerpendicularMandelbrot';
import { quarticPerpendicularMandelbrotPlugin } from './formulas/quarticPerpendicularMandelbrot';
import { rabbitJuliaPlugin } from './formulas/rabbitJulia';

// Burning Ship Variants (10)
import { celticMandelbarPlugin } from './formulas/celticMandelbar';
import { burningShipImagPlugin } from './formulas/burningShipImag';
import { airshipPlugin } from './formulas/airship';
import { celticMandelbrotPlugin } from './formulas/celticMandelbrot';
import { celticBurningShipPlugin } from './formulas/celticBurningShip';
import { perpendicularBurningShipPlugin } from './formulas/perpendicularBurningShip';
import { perpendicularCelticBurningShipPlugin } from './formulas/perpendicularCelticBurningShip';
import { burningShipCubicPlugin } from './formulas/burningShipCubic';
import { burningShipQuarticPlugin } from './formulas/burningShipQuartic';
import { airshipCubicPlugin } from './formulas/airshipCubic';

// Newton (13)
import { newton3Plugin } from './formulas/newton3';
import { newton4Plugin } from './formulas/newton4';
import { newtonSinPlugin } from './formulas/newtonSin';
import { newtonExpPlugin } from './formulas/newtonExp';
import { newtonCosPlugin } from './formulas/newtonCos';
import { newton5Plugin } from './formulas/newton5';
import { newton6Plugin } from './formulas/newton6';
import { newtonSinhPlugin } from './formulas/newtonSinh';
import { newtonCoshPlugin } from './formulas/newtonCosh';
import { halleyCubicPlugin } from './formulas/halleyCubic';
import { novaClassicPlugin } from './formulas/novaClassic';
import { novaSinePlugin } from './formulas/novaSine';
import { novaCosPlugin } from './formulas/novaCos';

// Magnet (2)
import { magnet1Plugin } from './formulas/magnet1';
import { magnet2Plugin } from './formulas/magnet2';

// Phoenix (2)
import { phoenixPlugin } from './formulas/phoenix';
import { phoenixMultiPlugin } from './formulas/phoenixMulti';

// Exotic (18)
import { collatzPlugin } from './formulas/collatz';
import { spiderPlugin } from './formulas/spider';
import { buffaloPlugin } from './formulas/buffalo';
import { zubietaPlugin } from './formulas/zubieta';
import { tetrationPlugin } from './formulas/tetration';
import { frothyBasinPlugin } from './formulas/frothyBasin';
import { ringsPlugin } from './formulas/rings';
import { circleInversionPlugin } from './formulas/circleInversion';
import { rationalMap1Plugin } from './formulas/rationalMap1';
import { rationalMap2Plugin } from './formulas/rationalMap2';
import { mcMullen23Plugin } from './formulas/mcMullen23';
import { mcMullen32Plugin } from './formulas/mcMullen32';
import { mcMullen34Plugin } from './formulas/mcMullen34';
import { reciprocalQuadraticPlugin } from './formulas/reciprocalQuadratic';
import { reciprocalCubicPlugin } from './formulas/reciprocalCubic';
import { invertedLambdaPlugin } from './formulas/invertedLambda';
import { novaBasinPlugin } from './formulas/novaBasin';
import { zaslavskyMapPlugin } from './formulas/zaslavskyMap';

// Transcendental (21)
import { expJuliaPlugin } from './formulas/expJulia';
import { sineMandelbPlugin } from './formulas/sineMandelb';
import { sineJuliaPlugin } from './formulas/sineJulia';
import { sinhMandelbPlugin } from './formulas/sinhMandelb';
import { cosMandelbPlugin } from './formulas/cosMandelb';
import { coshMandelbPlugin } from './formulas/coshMandelb';
import { coshJuliaPlugin } from './formulas/coshJulia';
import { coshSinhPlugin } from './formulas/coshSinh';
import { cosJuliaPlugin } from './formulas/cosJulia';
import { tanJuliaPlugin } from './formulas/tanJulia';
import { sinhJuliaPlugin } from './formulas/sinhJulia';
import { expMandelbrotPlugin } from './formulas/expMandelbrot';
import { atanhMandelbrotPlugin } from './formulas/atanhMandelbrot';
import { atanhJuliaPlugin } from './formulas/atanhJulia';
import { asinhMandelbrotPlugin } from './formulas/asinhMandelbrot';
import { asinhJuliaPlugin } from './formulas/asinhJulia';
import { acoshMandelbrotPlugin } from './formulas/acoshMandelbrot';
import { acoshJuliaPlugin } from './formulas/acoshJulia';
import { cothMandelbrotPlugin } from './formulas/cothMandelbrot';
import { cothJuliaPlugin } from './formulas/cothJulia';
import { logJuliaPlugin } from './formulas/logJulia';

// Coloring modes
import { smoothColoring } from './coloring/smooth';
import { orbitTrapColoring } from './coloring/orbitTrap';
import { orbitEchoColoring } from './coloring/orbitEcho';
import { stripeColoring } from './coloring/stripe';
import { binaryColoring } from './coloring/binary';
import { tiaColoring } from './coloring/tia';
import { blackInsideColoring } from './coloring/inside-black';
import { finalOrbitInsideColoring } from './coloring/inside-finalOrbit';
import { atomDomainInsideColoring } from './coloring/inside-atomDomain';

// Transforms
import { noneTransform } from './transforms/none';
import { kaleidoscopeTransform } from './transforms/kaleidoscope';
import { mobiusTransform } from './transforms/mobius';
import { inversionTransform } from './transforms/inversion';
import { polarTransform } from './transforms/polar';
import { sinusoidalTransform } from './transforms/sinusoidal';
import { sphericalTransform } from './transforms/spherical';

let builtinsRegistered = false;

export function registerBuiltins(options?: { quiet?: boolean }): void {
  if (builtinsRegistered) return;

  // === 94 Formula Plugins ===
  const formulas = [
    // Classic (28)
    mandelbrotPlugin,
    burningShipPlugin,
    tricornPlugin,
    lambdaPlugin,
    quadJuliaPlugin,
    cubicMandelbrotPlugin,
    quarticMandelbrotPlugin,
    mandelboxPlugin,
    heartPlugin,
    manowarPlugin,
    biomorphPlugin,
    cactusPlugin,
    logisticPlugin,
    simonBrotPlugin,
    multicorn4Plugin,
    multicorn5Plugin,
    chebyshev2Plugin,
    chebyshev3Plugin,
    chebyshev4Plugin,
    chebyshev5Plugin,
    multicorn6Plugin,
    multicorn7Plugin,
    perpendicularMandelbrotPlugin,
    perpendicularTricornPlugin,
    perpendicularCelticPlugin,
    cubicPerpendicularMandelbrotPlugin,
    quarticPerpendicularMandelbrotPlugin,
    rabbitJuliaPlugin,

    // Burning Ship Variants (10)
    celticMandelbarPlugin,
    burningShipImagPlugin,
    airshipPlugin,
    celticMandelbrotPlugin,
    celticBurningShipPlugin,
    perpendicularBurningShipPlugin,
    perpendicularCelticBurningShipPlugin,
    burningShipCubicPlugin,
    burningShipQuarticPlugin,
    airshipCubicPlugin,

    // Newton (13)
    newton3Plugin,
    newton4Plugin,
    newtonSinPlugin,
    newtonExpPlugin,
    newtonCosPlugin,
    newton5Plugin,
    newton6Plugin,
    newtonSinhPlugin,
    newtonCoshPlugin,
    halleyCubicPlugin,
    novaClassicPlugin,
    novaSinePlugin,
    novaCosPlugin,

    // Magnet (2)
    magnet1Plugin,
    magnet2Plugin,

    // Phoenix (2)
    phoenixPlugin,
    phoenixMultiPlugin,

    // Exotic (18)
    collatzPlugin,
    spiderPlugin,
    buffaloPlugin,
    zubietaPlugin,
    tetrationPlugin,
    frothyBasinPlugin,
    ringsPlugin,
    circleInversionPlugin,
    rationalMap1Plugin,
    rationalMap2Plugin,
    mcMullen23Plugin,
    mcMullen32Plugin,
    mcMullen34Plugin,
    reciprocalQuadraticPlugin,
    reciprocalCubicPlugin,
    invertedLambdaPlugin,
    novaBasinPlugin,
    zaslavskyMapPlugin,

    // Transcendental (21)
    expJuliaPlugin,
    sineMandelbPlugin,
    sineJuliaPlugin,
    sinhMandelbPlugin,
    cosMandelbPlugin,
    coshMandelbPlugin,
    coshJuliaPlugin,
    coshSinhPlugin,
    cosJuliaPlugin,
    tanJuliaPlugin,
    sinhJuliaPlugin,
    expMandelbrotPlugin,
    atanhMandelbrotPlugin,
    atanhJuliaPlugin,
    asinhMandelbrotPlugin,
    asinhJuliaPlugin,
    acoshMandelbrotPlugin,
    acoshJuliaPlugin,
    cothMandelbrotPlugin,
    cothJuliaPlugin,
    logJuliaPlugin,
  ];

  // === 9 Coloring Plugins (6 outside + 3 inside) ===
  const coloring = [
    smoothColoring,
    orbitTrapColoring,
    orbitEchoColoring,
    stripeColoring,
    binaryColoring,
    tiaColoring,
    blackInsideColoring,
    finalOrbitInsideColoring,
    atomDomainInsideColoring,
  ];

  // === 7 Transform Plugins (1 original + 6 new) ===
  const transforms = [
    noneTransform,
    kaleidoscopeTransform,
    mobiusTransform,
    inversionTransform,
    polarTransform,
    sinusoidalTransform,
    sphericalTransform,
  ];

  // Register all plugins
  for (const plugin of [...formulas, ...coloring, ...transforms]) {
    pluginRegistry.register(plugin);
  }

  if (!options?.quiet) {
    console.log(`[FractalPark] Registered ${formulas.length} formulas, ${coloring.length} coloring modes, ${transforms.length} transforms`);
  }

  builtinsRegistered = true;
}

export function getRegisteredFormulaCount(): number {
  return pluginRegistry.listFormulas().length;
}

export function getRegisteredColoringCount(): number {
  return pluginRegistry.listOutsideColoring().length + pluginRegistry.listInsideColoring().length;
}
