import type { ShaderStyleState } from '@/engine/types';
import type { MeasurementId } from './measurements';
import type { FormulaPlugin } from '@/engine/plugins/types';

export type ModernStyleId = ShaderStyleState['styleId'];

export interface ModernStyleDefinition {
  id: ModernStyleId;
  nameKey: string;
  shaderIndex: number;
  requiredMeasurements: readonly MeasurementId[];
  requiresDistanceEstimate?: boolean;
}

export const MODERN_STYLE_DEFINITIONS: readonly ModernStyleDefinition[] = [
  { id: 'modernSmooth', nameKey: 'coloring.modernSmooth', shaderIndex: 0, requiredMeasurements: ['smoothEscape'] },
  { id: 'layeredOrbit', nameKey: 'coloring.layeredOrbit', shaderIndex: 1, requiredMeasurements: ['smoothEscape', 'pointTrap', 'radialStability'] },
  { id: 'orbitNebula', nameKey: 'coloring.orbitNebula', shaderIndex: 2, requiredMeasurements: ['smoothEscape', 'radialStability'] },
  { id: 'contourField', nameKey: 'coloring.contourField', shaderIndex: 3, requiredMeasurements: ['smoothEscape', 'distanceEstimate'], requiresDistanceEstimate: true },
];

export function getModernStyleShaderIndex(styleId: ModernStyleId | undefined): number {
  return MODERN_STYLE_DEFINITIONS.find((style) => style.id === styleId)?.shaderIndex ?? 0;
}

export type StyleCompatibility = 'supported' | 'smoothFallback';

export function resolveModernStyleCompatibility(
  styleId: ModernStyleId | undefined,
  formula: FormulaPlugin | undefined
): StyleCompatibility {
  const style = MODERN_STYLE_DEFINITIONS.find((entry) => entry.id === styleId);
  return style?.requiresDistanceEstimate && !formula?.distanceEstimate ? 'smoothFallback' : 'supported';
}
