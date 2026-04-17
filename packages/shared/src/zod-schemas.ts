import { z } from "zod";

export const FeatureIdSchema = z.enum([
  "new_account",
  "no_recent_commits",
  "zero_social",
  "sparse_profile",
  "star_farmer",
  "bot_username",
  "star_burst",
]);

export const FeatureWeightSchema = z.object({
  id: FeatureIdSchema,
  weight: z.number().int().min(0).max(10),
  description: z.string().min(5),
});

export const FeatureWeightsConfigSchema = z.object({
  version: z.number().int().min(1),
  updated_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  normalization: z.object({
    max_raw: z.number().int().min(1),
    scale: z.literal(100),
  }),
  features: z.array(FeatureWeightSchema).min(1),
});

export const RepoRefSchema = z.object({
  owner: z.string().min(1).max(100),
  name: z.string().min(1).max(100),
});

export type RepoRef = z.infer<typeof RepoRefSchema>;
