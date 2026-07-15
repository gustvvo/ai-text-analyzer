import { CANONICAL_CATEGORIES } from "./analysis-response.schema.js";

/**
 * Hand-written JSON Schema shared by every real provider adapter for
 * provider-side output constraining (Anthropic `output_config.format`,
 * OpenAI `response_format.json_schema`).
 *
 * STRUCTURAL ONLY, intentionally: no `minLength`/`maxLength`/`minimum`/
 * `maximum`/array-size constraints, because provider structured-output
 * implementations do not support those numeric/string constraints. The
 * strict bounds (summary length, keyPoints count, etc.) are enforced by
 * `analysisResponseSchema` (zod) in the service layer — double validation
 * by design: the provider constrains shape, the service enforces limits.
 */
export const ANALYSIS_JSON_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string", description: "Concise summary of the text" },
    category: { type: "string", enum: [...CANONICAL_CATEGORIES] },
    confidence: { type: "number", description: "Self-assessed confidence from 0 to 1" },
    keyPoints: { type: "array", items: { type: "string" } },
    warnings: { type: "array", items: { type: "string" } },
  },
  required: ["summary", "category", "confidence", "keyPoints", "warnings"],
  additionalProperties: false,
} as const;
