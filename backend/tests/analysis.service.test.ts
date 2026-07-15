import { beforeEach, describe, expect, it, vi } from "vitest";
import { ANALYSIS_PROMPT_V1 } from "../src/ai/prompts/analysis.v1.js";
import { DEFAULT_PROMPT_VERSION } from "../src/ai/prompts/prompt-registry.js";
import type { AIProvider, BuiltPrompt, ProviderResult } from "../src/ai/providers/ai-provider.interface.js";
import { ProviderError } from "../src/ai/providers/ai-provider.interface.js";
import { MockProvider } from "../src/ai/providers/mock.provider.js";
import { analysisResponseSchema } from "../src/ai/schemas/analysis-response.schema.js";
import { AnalysisFailedError, AnalysisService } from "../src/ai/services/analysis.service.js";
import type { AnalysisRecord, CreateAnalysisInput } from "../src/analyses/analysis.repository.js";
import { loadConfig } from "../src/config.js";

const BASE_ENV = { JWT_SECRET: "test-only-secret-not-for-production" };
const config = loadConfig(BASE_ENV);

const USER_ID = "11111111-1111-1111-1111-111111111111";

const LONG_TECH_TEXT =
  "Artificial intelligence is reshaping the software industry at an unprecedented pace. " +
  "New machine learning models allow computers to understand natural language with far " +
  "greater accuracy than before. Engineers are racing to embed this technology into " +
  "everyday internet applications, from search engines to customer support bots.";

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
    durationMs: data.durationMs,
    attempts: data.attempts,
    rawResponse: data.rawResponse,
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

/** Builds a ProviderResult carrying the given raw JSON body. */
function providerResult(rawBody: unknown, overrides: Partial<ProviderResult> = {}): ProviderResult {
  return {
    rawText: JSON.stringify(rawBody),
    model: "fake-model-v1",
    tokensIn: 10,
    tokensOut: 20,
    ...overrides,
  };
}

describe("AnalysisService — happy path with the real MockProvider", () => {
  it("returns a value that passes analysisResponseSchema and persists a completed row", async () => {
    const provider = new MockProvider();
    const invokeSpy = vi.spyOn(provider, "invoke");
    const repository = makeRepository();
    const service = new AnalysisService(provider, repository, config);

    const record = await service.analyze(USER_ID, LONG_TECH_TEXT);

    expect(
      analysisResponseSchema.parse({
        summary: record.summary,
        category: record.category,
        confidence: record.confidence,
        keyPoints: record.keyPoints,
        warnings: record.warnings,
      }),
    ).toBeTruthy();

    expect(repository.createAnalysis).toHaveBeenCalledTimes(1);
    const insertedData = repository.createAnalysis.mock.calls[0]?.[0];
    if (!insertedData) {
      throw new Error("expected createAnalysis to have been called");
    }
    expect(insertedData).toMatchObject({
      userId: USER_ID,
      provider: "mock",
      promptVersion: DEFAULT_PROMPT_VERSION,
      status: "completed",
    });
    expect(insertedData.tokensIn).not.toBeNull();
    expect(insertedData.tokensOut).not.toBeNull();
    expect(record.provider).toBe("mock");
    expect(record.promptVersion).toBe(DEFAULT_PROMPT_VERSION);
    expect(record.status).toBe("completed");

    // Replayable trace fields: one provider invocation, and the raw text
    // handed to the repository is exactly what MockProvider returned.
    expect(invokeSpy).toHaveBeenCalledTimes(1);
    const providerResultReturned = await invokeSpy.mock.results[0]?.value;
    if (insertedData.status === "completed") {
      expect(insertedData.attempts).toBe(1);
      expect(insertedData.durationMs).toBeGreaterThanOrEqual(0);
      expect(insertedData.rawResponse).toBe(providerResultReturned.rawText);
    }
  });
});

describe("AnalysisService — retry policy", () => {
  it("[[SIMULATE_INVALID_JSON]]: retries once (invoke called twice), then persists a failed row and throws AnalysisFailedError", async () => {
    const provider = new MockProvider();
    const invokeSpy = vi.spyOn(provider, "invoke");
    const repository = makeRepository();
    const service = new AnalysisService(provider, repository, config);

    await expect(
      service.analyze(USER_ID, "Some text. [[SIMULATE_INVALID_JSON]]"),
    ).rejects.toBeInstanceOf(AnalysisFailedError);

    expect(invokeSpy).toHaveBeenCalledTimes(2);
    expect(repository.createAnalysis).toHaveBeenCalledTimes(1);
    const insertedData = repository.createAnalysis.mock.calls[0]?.[0];
    if (!insertedData) {
      throw new Error("expected createAnalysis to have been called");
    }
    expect(insertedData.status).toBe("failed");
    if (insertedData.status === "failed") {
      expect(insertedData.errorMessage).toBe("invalid model output");
      expect(insertedData.attempts).toBe(2);
      // The malformed rawText is the valuable debug artifact — kept, not discarded.
      expect(insertedData.rawResponse).toContain("not valid json");
    }
  });

  it("[[SIMULATE_PROVIDER_ERROR]]: does not retry (invoke called once), persists a failed row and throws AnalysisFailedError", async () => {
    const provider = new MockProvider();
    const invokeSpy = vi.spyOn(provider, "invoke");
    const repository = makeRepository();
    const service = new AnalysisService(provider, repository, config);

    await expect(
      service.analyze(USER_ID, "Some text. [[SIMULATE_PROVIDER_ERROR]]"),
    ).rejects.toBeInstanceOf(AnalysisFailedError);

    expect(invokeSpy).toHaveBeenCalledTimes(1);
    expect(repository.createAnalysis).toHaveBeenCalledTimes(1);
    const insertedData = repository.createAnalysis.mock.calls[0]?.[0];
    if (!insertedData) {
      throw new Error("expected createAnalysis to have been called");
    }
    expect(insertedData.status).toBe("failed");
    if (insertedData.status === "failed") {
      expect(insertedData.errorMessage).toBe("provider error");
      expect(insertedData.attempts).toBe(1);
      // Nothing was ever returned by the provider — there is no raw text to keep.
      expect(insertedData.rawResponse).toBeNull();
    }
  });

  it("adds a system warning when a retry succeeds", async () => {
    const provider: AIProvider = { name: "fake", invoke: vi.fn() };
    const secondRawText = JSON.stringify({
      summary: "A retried summary.",
      category: "technology",
      confidence: 0.9,
      keyPoints: ["Point one."],
      warnings: [],
    });
    vi.mocked(provider.invoke)
      .mockResolvedValueOnce(providerResult("not valid json {{"))
      .mockResolvedValueOnce(providerResult(JSON.parse(secondRawText)));
    const repository = makeRepository();
    const service = new AnalysisService(provider, repository, config);

    const record = await service.analyze(USER_ID, "irrelevant");

    expect(provider.invoke).toHaveBeenCalledTimes(2);
    expect(record.status).toBe("completed");
    expect(record.warnings).toContain("Result was obtained after a retry.");

    const insertedData = repository.createAnalysis.mock.calls[0]?.[0];
    if (!insertedData) {
      throw new Error("expected createAnalysis to have been called");
    }
    expect(insertedData.attempts).toBe(2);
    // rawResponse must be the SECOND (valid) rawText, not the first malformed one.
    expect(insertedData.rawResponse).toBe(secondRawText);
  });
});

describe("AnalysisService — warnings cap keeps system warnings (regression for F1/F2)", () => {
  const TEN_MODEL_WARNINGS = Array.from({ length: 10 }, (_, i) => `Model warning ${i + 1}.`);

  it("keeps the category-normalization system warning when the model already returned 10 warnings", async () => {
    const provider: AIProvider = { name: "fake", invoke: vi.fn() };
    vi.mocked(provider.invoke).mockResolvedValue(
      providerResult({
        summary: "A summary.",
        category: "finanzas",
        confidence: 0.9,
        keyPoints: ["Point one."],
        warnings: TEN_MODEL_WARNINGS,
      }),
    );
    const repository = makeRepository();
    const service = new AnalysisService(provider, repository, config);

    const record = await service.analyze(USER_ID, "irrelevant");

    expect(record.warnings.length).toBeLessThanOrEqual(10);
    expect(record.warnings).toContain("Category was normalized from an unrecognized value.");
    expect(
      analysisResponseSchema.parse({
        summary: record.summary,
        category: record.category,
        confidence: record.confidence,
        keyPoints: record.keyPoints,
        warnings: record.warnings,
      }),
    ).toBeTruthy();
  });

  it("keeps 'Result was obtained after a retry.' when the successful retry attempt already returns 10 warnings", async () => {
    const provider: AIProvider = { name: "fake", invoke: vi.fn() };
    vi.mocked(provider.invoke)
      .mockResolvedValueOnce(providerResult("not valid json {{"))
      .mockResolvedValueOnce(
        providerResult({
          summary: "A retried summary.",
          category: "technology",
          confidence: 0.9,
          keyPoints: ["Point one."],
          warnings: TEN_MODEL_WARNINGS,
        }),
      );
    const repository = makeRepository();
    const service = new AnalysisService(provider, repository, config);

    const record = await service.analyze(USER_ID, "irrelevant");

    expect(provider.invoke).toHaveBeenCalledTimes(2);
    expect(record.warnings.length).toBeLessThanOrEqual(10);
    expect(record.warnings).toContain("Result was obtained after a retry.");
  });

  it("returns a payload with no post-parse mutation: the returned subset deep-equals its own analysisResponseSchema.parse", async () => {
    const provider: AIProvider = { name: "fake", invoke: vi.fn() };
    vi.mocked(provider.invoke)
      .mockResolvedValueOnce(providerResult("not valid json {{"))
      .mockResolvedValueOnce(
        providerResult({
          summary: "A retried summary.",
          category: "finanzas",
          confidence: 0.9,
          keyPoints: ["Point one."],
          warnings: TEN_MODEL_WARNINGS,
        }),
      );
    const repository = makeRepository();
    const service = new AnalysisService(provider, repository, config);

    const record = await service.analyze(USER_ID, "irrelevant");

    const returnedSubset = {
      summary: record.summary,
      category: record.category,
      confidence: record.confidence,
      keyPoints: record.keyPoints,
      warnings: record.warnings,
    };
    expect(analysisResponseSchema.parse(returnedSubset)).toEqual(returnedSubset);
  });
});

describe("AnalysisService — normalization (fake provider returning crafted rawText)", () => {
  it("lowercases/trims a recognized category", async () => {
    const provider: AIProvider = { name: "fake", invoke: vi.fn() };
    vi.mocked(provider.invoke).mockResolvedValue(
      providerResult({
        summary: "A summary.",
        category: "Technology",
        confidence: 0.9,
        keyPoints: ["Point one."],
        warnings: [],
      }),
    );
    const repository = makeRepository();
    const service = new AnalysisService(provider, repository, config);

    const record = await service.analyze(USER_ID, "irrelevant");

    expect(record.category).toBe("technology");
  });

  it("normalizes an unrecognized category to 'other' and adds a system warning", async () => {
    const provider: AIProvider = { name: "fake", invoke: vi.fn() };
    vi.mocked(provider.invoke).mockResolvedValue(
      providerResult({
        summary: "A summary.",
        category: "finanzas",
        confidence: 0.9,
        keyPoints: ["Point one."],
        warnings: [],
      }),
    );
    const repository = makeRepository();
    const service = new AnalysisService(provider, repository, config);

    const record = await service.analyze(USER_ID, "irrelevant");

    expect(record.category).toBe("other");
    expect(record.warnings).toContain("Category was normalized from an unrecognized value.");
  });

  it("clamps confidence above 1 down to 1", async () => {
    const provider: AIProvider = { name: "fake", invoke: vi.fn() };
    vi.mocked(provider.invoke).mockResolvedValue(
      providerResult({
        summary: "A summary.",
        category: "technology",
        confidence: 1.7,
        keyPoints: ["Point one."],
        warnings: [],
      }),
    );
    const repository = makeRepository();
    const service = new AnalysisService(provider, repository, config);

    const record = await service.analyze(USER_ID, "irrelevant");

    expect(record.confidence).toBe(1);
  });

  it("drops empty key points", async () => {
    const provider: AIProvider = { name: "fake", invoke: vi.fn() };
    vi.mocked(provider.invoke).mockResolvedValue(
      providerResult({
        summary: "A summary.",
        category: "technology",
        confidence: 0.9,
        keyPoints: ["Point one.", "   ", "Point two."],
        warnings: [],
      }),
    );
    const repository = makeRepository();
    const service = new AnalysisService(provider, repository, config);

    const record = await service.analyze(USER_ID, "irrelevant");

    expect(record.keyPoints).toEqual(["Point one.", "Point two."]);
  });
});

describe("AnalysisService — logging hygiene", () => {
  it("never logs the input text, summary, or raw model output", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const repository = makeRepository();
      const service = new AnalysisService(new MockProvider(), repository, config);
      const secretText = "SECRET_INPUT_TOKEN this text must never be logged";

      await service.analyze(USER_ID, secretText);

      const loggedText = logSpy.mock.calls.map((call) => call.join(" ")).join("\n");
      expect(loggedText).not.toContain("SECRET_INPUT_TOKEN");
      expect(logSpy).toHaveBeenCalledTimes(1);
    } finally {
      logSpy.mockRestore();
    }
  });
});

describe("AnalysisService — sanity: uses getPrompt(DEFAULT_PROMPT_VERSION)", () => {
  it("builds the prompt the same way ANALYSIS_PROMPT_V1.build does", async () => {
    const provider: AIProvider = { name: "fake", invoke: vi.fn() };
    let capturedPrompt: BuiltPrompt | undefined;
    vi.mocked(provider.invoke).mockImplementation(async (prompt) => {
      capturedPrompt = prompt;
      return providerResult({
        summary: "A summary.",
        category: "technology",
        confidence: 0.9,
        keyPoints: ["Point one."],
        warnings: [],
      });
    });
    const repository = makeRepository();
    const service = new AnalysisService(provider, repository, config);

    await service.analyze(USER_ID, "some input");

    expect(capturedPrompt).toEqual(ANALYSIS_PROMPT_V1.build("some input"));
  });
});
