import type { ShaderStyleState } from '@/engine/types';

export type ModernStyleId = ShaderStyleState['styleId'];

export interface ModernStyleDefinition {
  id: ModernStyleId;
  nameKey: string;
  shaderIndex: number;
  requiresDistanceEstimate?: boolean;
}

export const MODERN_STYLE_DEFINITIONS: readonly ModernStyleDefinition[] = [
  { id: 'modernSmooth', nameKey: 'coloring.modernSmooth', shaderIndex: 0 },
  { id: 'layeredOrbit', nameKey: 'coloring.layeredOrbit', shaderIndex: 1 },
  { id: 'orbitNebula', nameKey: 'coloring.orbitNebula', shaderIndex: 2 },
  { id: 'contourField', nameKey: 'coloring.contourField', shaderIndex: 3, requiresDistanceEstimate: true },
];

export function getModernStyleShaderIndex(styleId: ModernStyleId | undefined): number {
  return MODERN_STYLE_DEFINITIONS.find((style) => style.id === styleId)?.shaderIndex ?? 0;
}
