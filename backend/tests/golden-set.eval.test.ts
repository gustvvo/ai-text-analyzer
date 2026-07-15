import { describe, expect, it, vi } from "vitest";
import goldenSet from "../eval/golden-set.json" with { type: "json" };
import { MockProvider } from "../src/ai/providers/mock.provider.js";
import { analysisResponseSchema } from "../src/ai/schemas/analysis-response.schema.js";
import { AnalysisService } from "../src/ai/services/analysis.service.js";
import type { AnalysisRecord, CreateAnalysisInput } from "../src/analyses/analysis.repository.js";
import { loadConfig } from "../src/config.js";

/**
 * Golden-set evaluation: runs the REAL AnalysisService + REAL MockProvider
 * (only the repository is mocked, exactly like analysis.router.test.ts) over
 * every case in eval/golden-set.json. This exercises the full pipeline
 * (prompt -> invoke -> parse -> normalize -> validate) end-to-end, not the
 * MockProvider in isolation.
 */

interface GoldenCase {
  id: string;
  text: string;
  expectedCategory: string;
  expectedKeyPointHints: string[];
}

const CASES = goldenSet as GoldenCase[];

const BASE_ENV = { JWT_SECRET: "test-only-secret-not-for-production" };
const config = loadConfig(BASE_ENV);

const USER_ID = "11111111-1111-1111-1111-111111111111";

const SHORT_INPUT_WARNING = "Input is very short; classification is low-signal.";

function fakeRecord(data: CreateAnalysisInput): AnalysisRecord {
  const base = {
    id: "generated-id",
    userId: data.userId,
    inputText: data.inputText,
    provider: data.provider,
    model: data.model,
    promptVersion: data.promptVersion,
    tokensIn: data.tokensIn,
    tokensOut: data.tokensOut,
    reportedAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  };

  if (data.status === "completed") {
    return {
      ...base,
      status: "completed",
      summary: data.summary,
      category: data.category,
      confidence: data.confidence,
      keyPoints: data.keyPoints,
      warnings: data.warnings,
      errorMessage: null,
    };
  }

  return {
    ...base,
    status: "failed",
    summary: null,
    category: null,
    confidence: null,
    keyPoints: [],
    warnings: [],
    errorMessage: data.errorMessage,
  };
}

function makeRepository() {
  return {
    createAnalysis: vi.fn(async (data: CreateAnalysisInput) => fakeRecord(data)),
  };
}

describe("golden-set eval — real AnalysisService + real MockProvider", () => {
  it(`evaluates all ${CASES.length} golden-set cases (category accuracy + hint recall)`, async () => {
    let categoryHits = 0;
    let hintHits = 0;

    for (const goldenCase of CASES) {
      const repository = makeRepository();
      const service = new AnalysisService(new MockProvider(), repository, config);

      const record = await service.analyze(USER_ID, goldenCase.text);

      expect(
        analysisResponseSchema.parse({
          summary: record.summary,
          category: record.category,
          confidence: record.confidence,
          keyPoints: record.keyPoints,
          warnings: record.warnings,
        }),
      ).toBeTruthy();

      const categoryMatches = record.category === goldenCase.expectedCategory;
      expect(categoryMatches, `${goldenCase.id}: expected category "${goldenCase.expectedCategory}", got "${record.category}"`).toBe(true);
      if (categoryMatches) categoryHits += 1;

      const haystack = `${record.summary ?? ""} ${record.keyPoints.join(" ")}`.toLowerCase();
      const hintsMatch = goldenCase.expectedKeyPointHints.every((hint) => haystack.includes(hint.toLowerCase()));
      expect(hintsMatch, `${goldenCase.id}: expected hints ${JSON.stringify(goldenCase.expectedKeyPointHints)} in "${haystack}"`).toBe(
        true,
      );
      if (hintsMatch) hintHits += 1;

      // Bonus honesty check: the deliberately short/ambiguous case (gs-10)
      // must actually exercise MockProvider's low-signal path, not just
      // coincidentally land on "other".
      if (goldenCase.id === "gs-10") {
        expect(record.warnings).toContain(SHORT_INPUT_WARNING);
        expect(record.confidence).toBe(0.5);
      }
    }

    const categoryAccuracy = categoryHits / CASES.length;
    const hintRecall = hintHits / CASES.length;

    console.log(
      `eval: ${categoryHits}/${CASES.length} category accuracy, hint recall ${Math.round(hintRecall * 100)}%`,
    );

    // Deterministic mock — the golden set is crafted to be 100% honest
    // against MockProvider's documented keyword map, so both must be 100%.
    expect(categoryAccuracy).toBe(1);
    expect(hintRecall).toBe(1);
  });
});
