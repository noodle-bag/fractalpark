export type MeasurementId = 'smoothEscape' | 'pointTrap' | 'radialStability' | 'distanceEstimate';

export interface MeasurementDefinition {
  id: MeasurementId;
  perIterationCost: 'low' | 'medium';
  requiresDistanceEstimate?: boolean;
}

export const MEASUREMENT_DEFINITIONS: readonly MeasurementDefinition[] = [
  { id: 'smoothEscape', perIterationCost: 'low' },
  { id: 'pointTrap', perIterationCost: 'low' },
  { id: 'radialStability', perIterationCost: 'low' },
  { id: 'distanceEstimate', perIterationCost: 'medium', requiresDistanceEstimate: true },
];
