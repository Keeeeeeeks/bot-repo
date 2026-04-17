export type FeatureId =
  | "new_account"
  | "no_recent_commits"
  | "zero_social"
  | "sparse_profile"
  | "star_farmer"
  | "bot_username"
  | "star_burst";

export interface FeatureWeight {
  id: FeatureId;
  weight: number;
  description: string;
}

export interface FeatureWeightsConfig {
  version: number;
  updated_at: string;
  normalization: { max_raw: number; scale: number };
  features: FeatureWeight[];
}

export interface FeatureHit {
  id: FeatureId;
  triggered: boolean;
  weight: number;
}

export type SubscriptionTier = "free" | "pro" | "team";
