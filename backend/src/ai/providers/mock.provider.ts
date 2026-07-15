import type { AnalysisResponse, Category } from "../schemas/analysis-response.schema.js";
import type { AIProvider, BuiltPrompt, ProviderResult } from "./ai-provider.interface.js";
import { ProviderError } from "./ai-provider.interface.js";

const USER_CONTENT_OPEN = "<user_content>";
const USER_CONTENT_CLOSE = "</user_content>";

const SIMULATE_INVALID_JSON = "[[SIMULATE_INVALID_JSON]]";
const SIMULATE_PROVIDER_ERROR = "[[SIMULATE_PROVIDER_ERROR]]";
const SIMULATED_INVALID_RAW_TEXT = "this is not valid json {{";

const MODEL_ID = "mock-analyzer-v1";

const SHORT_INPUT_THRESHOLD = 40;
const SHORT_INPUT_WARNING = "Input is very short; classification is low-signal.";

const SUMMARY_FALLBACK = "The provided text was analyzed.";
const SUMMARY_CHAR_FALLBACK_LENGTH = 240;
const MAX_SUMMARY_LENGTH = 2000;
const KEY_POINTS_FALLBACK: readonly string[] = ["No distinct key points identified."];
const MAX_KEY_POINT_LENGTH = 300;

/**
 * Category keyword map, checked in order — the first category whose keyword
 * list matches (as a case-insensitive substring) wins. Falls back to
 * "other" when nothing matches.
 */
const CATEGORY_KEYWORDS: ReadonlyArray<readonly [Category, readonly string[]]> = [
  [
    "technology",
    ["software", "ai ", "artificial intelligence", "computer", "tech", "internet", "robot"],
  ],
  ["business", ["market", "revenue", "company", "business", "startup", "invest"]],
  ["science", ["research", "study", "scientist", "experiment", "physics", "biology"]],
  ["health", ["health", "medical", "doctor", "disease", "patient"]],
  ["politics", ["government", "election", "policy", "president", "congress"]],
  ["sports", ["game", "team", "player", "match", "championship", "league"]],
  ["entertainment", ["film", "movie", "music", "celebrity", "series", "show"]],
  ["education", ["school", "university", "student", "teacher", "course"]],
];

/**
 * Extracts the text to analyze from a BuiltPrompt's `user` message. Prompts
 * produced by the versioned prompt builders (see ../prompts) wrap this text
 * in <user_content> delimiters; if a caller passes a plain string with no
 * delimiters, the whole user message is used as-is.
 */
function extractContent(user: string): string {
  const start = user.indexOf(USER_CONTENT_OPEN);
  const end = user.indexOf(USER_CONTENT_CLOSE);
  if (start === -1 || end === -1 || end <= start) {
    return user.trim();
  }
  return user.slice(start + USER_CONTENT_OPEN.length, end).trim();
}

/** Splits text into trimmed sentences on '.', '!' or '?'. */
function splitSentences(content: string): string[] {
  const matches = content.match(/[^.!?]+[.!?]+/g);
  if (!matches) {
    return [];
  }
  return matches.map((sentence) => sentence.trim()).filter((sentence) => sentence.length > 0);
}

function buildSummary(content: string, sentences: string[]): string {
  if (sentences.length > 0) {
    const summary = sentences.slice(0, 2).join(" ").slice(0, MAX_SUMMARY_LENGTH).trim();
    if (summary.length > 0) {
      return summary;
    }
  }
  const truncated = content.slice(0, SUMMARY_CHAR_FALLBACK_LENGTH).trim();
  return truncated.length > 0 ? truncated : SUMMARY_FALLBACK;
}

function buildKeyPoints(sentences: string[]): string[] {
  const points = sentences
    .slice(0, 3)
    .map((sentence) => sentence.slice(0, MAX_KEY_POINT_LENGTH).trim())
    .filter((sentence) => sentence.length > 0);
  return points.length > 0 ? points : [...KEY_POINTS_FALLBACK];
}

function classifyCategory(lowercasedContent: string): Category {
  for (const [category, keywords] of CATEGORY_KEYWORDS) {
    if (keywords.some((keyword) => lowercasedContent.includes(keyword))) {
      return category;
    }
  }
  return "other";
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Deterministic, network-free implementation of AIProvider: the same
 * BuiltPrompt always produces byte-identical output. No delays, no
 * randomness. Used for local development, tests, and CI, and to exercise
 * the analysis service's post-processing path without a real API.
 *
 * Test hooks — including one of these literal markers in the analyzed text
 * forces a specific failure path, so downstream layers (service, frontend,
 * e2e tests) can be exercised without a real provider:
 *   [[SIMULATE_PROVIDER_ERROR]] -> rejects with a retryable ProviderError
 *   [[SIMULATE_INVALID_JSON]]   -> resolves with a rawText that fails JSON.parse
 * (checked in that order; a real input is not expected to contain either)
 */
export class MockProvider implements AIProvider {
  readonly name = "mock";

  async invoke(prompt: BuiltPrompt): Promise<ProviderResult> {
    const content = extractContent(prompt.user);

    if (content.includes(SIMULATE_PROVIDER_ERROR)) {
      throw new ProviderError("simulated provider failure", "mock", true);
    }

    const tokensIn = estimateTokens(prompt.system + prompt.user);

    if (content.includes(SIMULATE_INVALID_JSON)) {
      return {
        rawText: SIMULATED_INVALID_RAW_TEXT,
        model: MODEL_ID,
        tokensIn,
        tokensOut: estimateTokens(SIMULATED_INVALID_RAW_TEXT),
      };
    }

    const sentences = splitSentences(content);
    const warnings: string[] = [];
    let confidence = 0.8;

    if (content.length < SHORT_INPUT_THRESHOLD) {
      confidence = 0.5;
      warnings.push(SHORT_INPUT_WARNING);
    }

    const response: AnalysisResponse = {
      summary: buildSummary(content, sentences),
      category: classifyCategory(content.toLowerCase()),
      confidence,
      keyPoints: buildKeyPoints(sentences),
      warnings,
    };

    const rawText = JSON.stringify(response);

    return {
      rawText,
      model: MODEL_ID,
      tokensIn,
      tokensOut: estimateTokens(rawText),
    };
  }
}
