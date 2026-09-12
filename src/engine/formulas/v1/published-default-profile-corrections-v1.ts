import type {
  PublishedFormulaProfileV1,
  PublishedFormulaRuntimeIndexRowV1,
} from './published-runtime';
import { resolveActivatedPublishedFormulaDefaultProfileV1 } from './julia-runtime-activation-v1';

type CorrectedProfile = Omit<
  PublishedFormulaProfileV1,
  'schema' | 'quality' | 'probe'
>;

const CORRECTED_PROFILES_V1: Readonly<Record<string, CorrectedProfile>> =
  Object.freeze({
    '17d88272-6dbf-5622-996a-b116ea3a3fab': {
      mode: 'parameter-plane', center: [0.18, 0], zoom: 1.15, rotation: 0, iterations: 200,
    },
    '190fa538-89c9-590f-8170-34b3c570fc5d': {
      mode: 'parameter-plane', center: [-0.16, 0], zoom: 1.15, rotation: 0, iterations: 200,
    },
    '201c54f3-a77a-5be0-a0a5-6f4f1998ee6d': {
      mode: 'parameter-plane', center: [-1.0953073803, -0.1848506655], zoom: 0.0694, rotation: 1.57, iterations: 200,
    },
    '22d9a008-eb14-53de-9960-11eb5d37bb8e': {
      mode: 'parameter-plane', center: [-0.0036386858, -0.0036407475], zoom: 4, rotation: 0, iterations: 200,
    },
    '280cd3e2-865b-5c78-90b7-39b2a36d7be0': {
      mode: 'parameter-plane', center: [0, 0], zoom: 0.0481, rotation: 0, iterations: 200,
    },
    '3edbea29-956a-5900-9aa7-02ccc2183016': {
      mode: 'julia', center: [0, 0.5], zoom: 0.25, rotation: 0, iterations: 200, juliaC: [-0.8, 0.156],
    },
    '62098934-def3-527a-ac43-2c80449c9848': {
      mode: 'julia', center: [0, 0.5], zoom: 0.35, rotation: 0, iterations: 200, juliaC: [-0.8, 0.156],
    },
    '78e550c6-d58d-57b7-92ff-82e9ed0728f0': {
      mode: 'parameter-plane', center: [0.5, 0.866], zoom: 1, rotation: 0, iterations: 200,
    },
    '8eb342fe-8a05-524e-8b98-35cdc8af5be3': {
      mode: 'parameter-plane', center: [1, 0], zoom: 10, rotation: 0, iterations: 200,
    },
    '9f301c01-13fa-57b4-a3b2-99add821bfb0': {
      mode: 'parameter-plane', center: [-1.2, 0], zoom: 0.25, rotation: 0, iterations: 200,
    },
    'af500910-46ce-5a43-b430-c0154cc05959': {
      mode: 'parameter-plane', center: [-0.3, 0], zoom: 1.6, rotation: 0, iterations: 200,
    },
    'beeb4aec-91cd-5d01-83bb-0b98ca851e79': {
      mode: 'parameter-plane', center: [-0.25, 0.12], zoom: 1.25, rotation: 0, iterations: 200,
    },
    'd89f722f-35fe-587a-bee9-efdf05885728': {
      mode: 'parameter-plane', center: [0, 0], zoom: 1.05, rotation: 0, iterations: 200,
    },
  });

export const CORRECTED_PUBLISHED_DEFAULT_PROFILE_IDS_V1 = Object.freeze(
  Object.keys(CORRECTED_PROFILES_V1).sort(),
);

export function resolveCorrectedPublishedDefaultProfileV1(
  row: PublishedFormulaRuntimeIndexRowV1,
): PublishedFormulaProfileV1 {
  const correction = CORRECTED_PROFILES_V1[row.formulaId];
  if (!correction) return row.profile;
  return Object.freeze({
    schema: row.profile.schema,
    quality: row.profile.quality,
    ...correction,
  });
}

/** Application initialization only; sealed Record assets keep their own inputs. */
export function resolveApplicationPublishedDefaultProfileV1(
  row: PublishedFormulaRuntimeIndexRowV1,
): PublishedFormulaProfileV1 {
  return resolveActivatedPublishedFormulaDefaultProfileV1({
    ...row,
    profile: resolveCorrectedPublishedDefaultProfileV1(row),
  });
}
