import type { FeatureModelChoice, FeatureModelId } from '@devdigest/shared';

/**
 * Facade other modules use to read a system feature's model choice (Settings →
 * Models). Resolved as `container.featureModels`; implemented by
 * `feature-models.ts` (workspace override, else the registry default).
 */
export interface FeatureModels {
  resolve(workspaceId: string, id: FeatureModelId): Promise<FeatureModelChoice>;
}
