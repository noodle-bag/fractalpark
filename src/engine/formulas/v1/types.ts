export type FormulaScopeV1 = "standard" | "mine" | "community";
export type FormulaIdV1 = string & { readonly __formulaIdV1: unique symbol };
export type FormulaRevisionV1 = string & {
  readonly __formulaRevisionV1: unique symbol;
};

export type FormulaAliasKindV1 =
  | "f588"
  | "b94-canonical"
  | "b94-runtime-alias"
  | "runtime-id"
  | "guide-slug";

export type FormulaParameterValueV1 =
  | number
  | readonly [number, number]
  | string;

export interface FormulaParameterSchemaV1 {
  readonly name: string;
  readonly type: "real" | "complex" | "function";
  readonly default: FormulaParameterValueV1;
  readonly hardDomain?: readonly [number, number];
  readonly classicBinding?:
    | "p1"
    | "p2"
    | "p3"
    | "p4"
    | "p5"
    | "fn1"
    | "fn2"
    | "fn3"
    | "fn4";
}

export interface FormulaTerminationContractV1 {
  readonly predicateMeaning: "continue-iteration";
  readonly nonFinite: "terminate-with-event";
  readonly maximumIterations: "profile-resolved";
}

export interface FormulaDefinitionV1 {
  readonly schemaVersion: 1;
  readonly formulaId: FormulaIdV1;
  readonly scope: FormulaScopeV1;
  readonly source: string;
  readonly sourceRevision: FormulaRevisionV1;
  readonly semanticHash: FormulaRevisionV1;
  readonly languageVersion: "frm-like/1";
  readonly stdlibVersion: 1;
  readonly supportedNumericProfiles: readonly ["standard32", ...string[]];
  readonly parameters: readonly FormulaParameterSchemaV1[];
  readonly programModel: "orbit";
  readonly termination: FormulaTerminationContractV1;
  readonly channels: readonly string[];
  readonly capabilities: readonly string[];
}

/** Scope and identity are deliberately absent from compiler safety input. */
export type ExecutableFormulaDefinitionV1 = Omit<
  FormulaDefinitionV1,
  "formulaId" | "scope"
>;

export interface FormulaViewBoundsV1 {
  readonly centerX: number;
  readonly centerY: number;
  readonly zoom: number;
  readonly rotation: number;
}

export interface FormulaColoringStateV1 {
  readonly pipelineVersion: 1 | 2;
  readonly outsideColoringId: string;
  readonly insideColoringId: string;
  readonly smooth: boolean;
  readonly measurement?: string;
  readonly channel?: string;
  readonly post?: Readonly<Record<string, number | string | boolean>>;
}

export interface FormulaPaletteStateV1 {
  readonly paletteId: string;
  readonly colorSpace?: string;
  readonly gradient?: readonly Readonly<{
    position: number;
    color: string;
  }>[];
}

export interface FormulaTransformStateV1 {
  readonly rotation: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly skewX: number;
  readonly skewY: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

export interface FormulaProfileV1 {
  readonly schemaVersion: 1;
  readonly formulaId: FormulaIdV1;
  readonly sourceRevision: FormulaRevisionV1;
  readonly profileRevision: FormulaRevisionV1;
  readonly parameters: Readonly<Record<string, FormulaParameterValueV1>>;
  readonly mode: "parameter-plane" | "julia";
  readonly juliaC?: readonly [number, number];
  readonly view: FormulaViewBoundsV1;
  readonly iterations: number;
  readonly coloring: FormulaColoringStateV1;
  readonly palette: FormulaPaletteStateV1;
  readonly transform: FormulaTransformStateV1;
}

export interface FormulaRecordRelationV1 {
  readonly kind: string;
  readonly targetFormulaId: FormulaIdV1;
  readonly evidence: string;
}

/** Editorial/discovery ownership only. No executable source or resolved state. */
export interface FormulaRecordV1 {
  readonly schemaVersion: 1;
  readonly formulaId: FormulaIdV1;
  readonly scope: FormulaScopeV1;
  readonly names: Readonly<Record<string, string>>;
  readonly facets: readonly string[];
  readonly relations: readonly FormulaRecordRelationV1[];
  readonly provenance: Readonly<Record<string, unknown>>;
  readonly rights: Readonly<Record<string, unknown>>;
  readonly preview?: Readonly<Record<string, unknown>>;
}

export interface FormulaBackendRevisionV1 {
  readonly schemaVersion: 1;
  readonly buildId: string;
  readonly artifactSha256: FormulaRevisionV1;
}

export interface FormulaRevisionSetV1 {
  readonly sourceRevision: FormulaRevisionV1;
  readonly semanticHash: FormulaRevisionV1;
  readonly profileRevision?: FormulaRevisionV1;
  readonly backendRevision?: FormulaBackendRevisionV1;
}

export interface FormulaRuntimeArtifactRefV1 {
  readonly formulaId: FormulaIdV1;
  readonly sourceRevision: FormulaRevisionV1;
  readonly semanticHash: FormulaRevisionV1;
  readonly format: "glsl-es-1.00";
  readonly backendRevision: FormulaBackendRevisionV1;
}

export type FormulaReferenceV1 =
  | { readonly kind: "canonical"; readonly formulaId: FormulaIdV1 }
  | {
      readonly kind: "legacy-alias";
      readonly alias: {
        readonly kind: FormulaAliasKindV1;
        readonly value: string;
      };
    };

export interface FormulaAssetRevisionRequestV1 {
  readonly reference: FormulaReferenceV1;
  readonly sourceRevision: FormulaRevisionV1;
  readonly profileRevision: FormulaRevisionV1;
}

export type FormulaFailureCodeV1 =
  | "invalid-reference"
  | "unknown-alias"
  | "invalid-standard-manifest"
  | "definition-not-found"
  | "profile-not-found"
  | "asset-store-failed"
  | "identity-mismatch"
  | "definition-invalid"
  | "profile-invalid"
  | "source-revision-mismatch"
  | "semantic-hash-mismatch"
  | "profile-revision-mismatch"
  | "unsafe-definition"
  | "compiler-failed"
  | "backend-revision-invalid";

export type FormulaResultV1<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: FormulaFailureCodeV1 };
