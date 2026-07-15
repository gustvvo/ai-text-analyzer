import { z } from "zod";

/**
 * Provider-agnostic contract for the result of analyzing a piece of text.
 * Every provider (mock, Anthropic, OpenAI, ...) must produce output that
 * validates against this schema before it is persisted or returned to callers.
 */
export const CANONICAL_CATEGORIES = [
  "technology",
  "business",
  "science",
  "health",
  "politics",
  "sports",
  "entertainment",
  "education",
  "other",
] as const;

export const analysisResponseSchema = z.object({
  summary: z.string().trim().min(1).max(2000),
  category: z.enum(CANONICAL_CATEGORIES),
  confidence: z.number().min(0).max(1),
  keyPoints: z.array(z.string().trim().min(1).max(300)).min(1).max(8),
  warnings: z.array(z.string()).max(10),
});

export type AnalysisResponse = z.infer<typeof analysisResponseSchema>;
export type Category = (typeof CANONICAL_CATEGORIES)[number];
