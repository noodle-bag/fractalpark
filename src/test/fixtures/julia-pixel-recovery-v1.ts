export type JuliaPixelRecoveryFixtureExpectationV1 = Readonly<{
  roleOutcome:
    | "classic-direct"
    | "transitive-constant"
    | "mutable-fail-closed"
    | "literal-review"
    | "generalized-held"
    | "unresolved";
  reachabilityOutcome: "reachable" | "unreachable" | "unknown-as-reachable";
  negativeReason: string | null;
}>;

export type JuliaPixelRecoveryFixtureV1 = Readonly<{
  id: string;
  source: string;
  renamedSource?: string;
  parseFailureReason?: string;
  expectation: JuliaPixelRecoveryFixtureExpectationV1;
}>;

function source(
  name: string,
  init: string,
  loop: string,
  bailout = "    |z| <= 64\n",
): string {
  return `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
${name} {
  init:
${init}  loop:
${loop}  bailout:
${bailout}}
`;
}

const direct = source(
  "DirectPixelConstant",
  "    z = 0\n    orbitConstant = pixel\n",
  "    z = sqr(z) + orbitConstant\n",
);

const transitive = source(
  "TransitivePixelConstant",
  "    z = 0\n    pixelCopy = pixel\n    orbitConstant = pixelCopy\n",
  "    z = sqr(z) + orbitConstant\n",
);

const transitiveRenamed = source(
  "TransitivePixelConstantRenamed",
  "    z = 0\n    alpha = pixel\n    beta = alpha\n",
  "    z = sqr(z) + beta\n",
);

const mutable = source(
  "MutablePixelAlias",
  "    z = 0\n    orbitConstant = pixel\n",
  "    orbitConstant = orbitConstant + z\n    z = sqr(z) + orbitConstant\n",
);

const componentWrite = source(
  "ComponentWriteAlias",
  "    z = 0\n    orbitConstant = pixel\n",
  "    real(orbitConstant) = real(z)\n    z = sqr(z) + orbitConstant\n",
);

const readThenOverwrite = source(
  "ReadThenOverwriteAlias",
  "    z = 0\n    orbitConstant = pixel\n",
  "    observed = orbitConstant\n    orbitConstant = (0.2, 0.3)\n    z = sqr(z) + orbitConstant\n",
);

const conditionalUninitialized = source(
  "ConditionalUninitializedAlias",
  "    z = 0\n    if real(pixel) > 0\n      orbitConstant = pixel\n    endif\n",
  "    z = sqr(z) + orbitConstant\n",
);

const literalRecurrence = source(
  "LiteralRecurrence",
  "    z = pixel\n",
  "    z = sqr(z) + (0.2, 0.3)\n",
);

const literalControl = source(
  "LiteralControl",
  "    z = pixel\n",
  "    z = sqr(z) + c\n",
  "    |z| <= 4\n",
);

const generalized = source(
  "DerivedPixelSeed",
  "    seed = sqr(pixel)\n    z = seed\n",
  "    z = sqr(z) + c\n",
);

const staticallyReachable = source(
  "StaticallyReachableBranch",
  "    z = 0\n    orbitConstant = pixel\n",
  "    if real(pixel) > 0\n      z = sqr(z) + orbitConstant\n    else\n      z = z + orbitConstant\n    endif\n",
);

const analyzerUnknown = source(
  "AnalyzerUnknownBranch",
  "    z = 0\n    orbitConstant = pixel\n",
  "    if real(sin(z)) > 0\n      z = sqr(z) + orbitConstant\n    else\n      z = z - orbitConstant\n    endif\n",
);

export const JULIA_PIXEL_RECOVERY_FIXTURES_V1: readonly JuliaPixelRecoveryFixtureV1[] =
  Object.freeze([
    Object.freeze({
      id: "direct-pixel-constant",
      source: direct,
      expectation: Object.freeze({
        roleOutcome: "classic-direct",
        reachabilityOutcome: "reachable",
        negativeReason: null,
      }),
    }),
    Object.freeze({
      id: "transitive-alpha-renaming",
      source: transitive,
      renamedSource: transitiveRenamed,
      expectation: Object.freeze({
        roleOutcome: "transitive-constant",
        reachabilityOutcome: "reachable",
        negativeReason: null,
      }),
    }),
    ...[
      ["mutable-loop-write", mutable, "loop-carried-write"],
      ["component-write", componentWrite, "component-write"],
      ["read-then-overwrite", readThenOverwrite, "read-then-overwrite"],
      [
        "conditional-uninitialized",
        conditionalUninitialized,
        "not-initialized-on-all-paths",
      ],
    ].map(([id, fixtureSource, negativeReason]) =>
      Object.freeze({
        id: id!,
        source: fixtureSource!,
        ...(id === "conditional-uninitialized"
          ? { parseFailureReason: "possibly-uninitialized-read" }
          : {}),
        expectation: Object.freeze({
          roleOutcome: "mutable-fail-closed" as const,
          reachabilityOutcome: "reachable" as const,
          negativeReason: negativeReason!,
        }),
      }),
    ),
    Object.freeze({
      id: "literal-recurrence-review",
      source: literalRecurrence,
      expectation: Object.freeze({
        roleOutcome: "literal-review",
        reachabilityOutcome: "reachable",
        negativeReason: "identity-authority-required",
      }),
    }),
    Object.freeze({
      id: "literal-control-rejected",
      source: literalControl,
      expectation: Object.freeze({
        roleOutcome: "unresolved",
        reachabilityOutcome: "reachable",
        negativeReason: "control-literal-not-orbit-constant",
      }),
    }),
    Object.freeze({
      id: "derived-pixel-seed-generalized",
      source: generalized,
      expectation: Object.freeze({
        roleOutcome: "generalized-held",
        reachabilityOutcome: "reachable",
        negativeReason: "nontrivial-pixel-seed-not-classic",
      }),
    }),
    Object.freeze({
      id: "static-path-cannot-be-marked-unreachable",
      source: staticallyReachable,
      expectation: Object.freeze({
        roleOutcome: "transitive-constant",
        reachabilityOutcome: "reachable",
        negativeReason: "false-unreachable-claim",
      }),
    }),
    Object.freeze({
      id: "analysis-unknown-is-reachable",
      source: analyzerUnknown,
      expectation: Object.freeze({
        roleOutcome: "unresolved",
        reachabilityOutcome: "unknown-as-reachable",
        negativeReason: "unknown-treated-as-reachable",
      }),
    }),
  ]);
