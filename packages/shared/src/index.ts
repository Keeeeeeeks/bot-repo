import weights from "./feature-weights.json" with { type: "json" };
import { FeatureWeightsConfigSchema } from "./zod-schemas";
import type { FeatureWeightsConfig } from "./types";

export * from "./types";
export * from "./zod-schemas";

export const FEATURE_WEIGHTS: FeatureWeightsConfig =
  FeatureWeightsConfigSchema.parse(weights);
