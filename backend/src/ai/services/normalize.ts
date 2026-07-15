import { CANONICAL_CATEGORIES } from "../schemas/analysis-response.schema.js";

const MAX_KEY_POINTS = 8;
const MAX_KEY_POINT_LENGTH = 300;
const MAX_WARNINGS = 10;

const CATEGORY_NORMALIZED_WARNING = "Category was normalized from an unrecognized value.";

const CANONICAL_CATEGORY_SET: ReadonlySet<string> = new Set(CANONICAL_CATEGORIES);

export interface NormalizeResult {
  value: unknown;
  systemWarnings: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Keeps only strings, trims them, and drops the ones that end up empty. */
function trimNonEmptyStrings(items: unknown): string[] {
  if (!Array.isArray(items)) {
    return [];
  }
  return items
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/**
 * Normalizes a raw (already-JSON-parsed) provider response BEFORE it is
 * validated against `analysisResponseSchema` — the schema is the final gate,
 * this step just repairs the common, harmless shape drift models produce
 * (mixed-case categories, slightly out-of-range confidence, untrimmed
 * strings) so it isn't rejected for cosmetic reasons.
 *
 * Fields with a fundamentally wrong type (e.g. `confidence` as a string) are
 * left untouched here and rejected by zod downstream, since there is no safe
 * way to normalize a wrong type into a valid value.
 */
export function normalizeResponse(raw: unknown): NormalizeResult {
  const systemWarnings: string[] = [];

  if (!isRecord(raw)) {
    return { value: raw, systemWarnings };
  }

  const normalized: Record<string, unknown> = { ...raw };

  if (typeof raw.category === "string") {
    const category = raw.category.trim().toLowerCase();
    if (CANONICAL_CATEGORY_SET.has(category)) {
      normalized.category = category;
    } else {
      normalized.category = "other";
      systemWarnings.push(CATEGORY_NORMALIZED_WARNING);
    }
  }

  if (typeof raw.confidence === "number" && Number.isFinite(raw.confidence)) {
    normalized.confidence = Math.min(1, Math.max(0, raw.confidence));
  }

  if (typeof raw.summary === "string") {
    normalized.summary = raw.summary.trim();
  }

  normalized.keyPoints = trimNonEmptyStrings(raw.keyPoints)
    .map((point) => point.slice(0, MAX_KEY_POINT_LENGTH))
    .slice(0, MAX_KEY_POINTS);

  // Leave room for system warnings before capping at MAX_WARNINGS, so a
  // model that already maxed out its own warnings doesn't crowd out ours.
  const userWarnings = trimNonEmptyStrings(raw.warnings);
  normalized.warnings = [...userWarnings, ...systemWarnings].slice(0, MAX_WARNINGS);

  return { value: normalized, systemWarnings };
}
