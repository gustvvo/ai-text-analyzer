import { describe, expect, it } from "vitest";
import { analysisResponseSchema } from "../src/ai/schemas/analysis-response.schema.js";
import { ProviderError } from "../src/ai/providers/ai-provider.interface.js";
import { MockProvider } from "../src/ai/providers/mock.provider.js";
import { ANALYSIS_PROMPT_V1 } from "../src/ai/prompts/analysis.v1.js";

const provider = new MockProvider();

const LONG_TECH_TEXT =
  "Artificial intelligence is reshaping the software industry at an unprecedented pace. " +
  "New machine learning models allow computers to understand natural language with far " +
  "greater accuracy than before. Engineers are racing to embed this technology into " +
  "everyday internet applications, from search engines to customer support bots.";

const SHORT_TEXT = "Great news today.";

const BUSINESS_TEXT =
  "The startup announced a sharp increase in quarterly revenue after closing a new " +
  "round of investment. Analysts say the company is well positioned to capture more " +
  "of the market next year.";

describe("MockProvider", () => {
  it("is the 'mock' provider", () => {
    expect(provider.name).toBe("mock");
  });

  it("is deterministic: the same input twice yields a deeply identical result", async () => {
    const prompt = ANALYSIS_PROMPT_V1.build(LONG_TECH_TEXT);

    const first = await provider.invoke(prompt);
    const second = await provider.invoke(ANALYSIS_PROMPT_V1.build(LONG_TECH_TEXT));

    expect(second).toEqual(first);
  });

  it("produces schema-conformant JSON classified as technology for tech-ish text", async () => {
    const prompt = ANALYSIS_PROMPT_V1.build(LONG_TECH_TEXT);
    const result = await provider.invoke(prompt);

    const parsed = JSON.parse(result.rawText);
    const validated = analysisResponseSchema.parse(parsed);

    expect(validated.category).toBe("technology");
    expect(result.model).toBe("mock-analyzer-v1");
    expect(result.tokensIn).not.toBeNull();
    expect(result.tokensOut).not.toBeNull();
  });

  it("produces schema-conformant JSON classified as business for business-ish text", async () => {
    const prompt = ANALYSIS_PROMPT_V1.build(BUSINESS_TEXT);
    const result = await provider.invoke(prompt);

    const parsed = JSON.parse(result.rawText);
    const validated = analysisResponseSchema.parse(parsed);

    expect(validated.category).toBe("business");
  });

  it("flags short input with low confidence and a warning", async () => {
    const prompt = ANALYSIS_PROMPT_V1.build(SHORT_TEXT);
    const result = await provider.invoke(prompt);

    const parsed = JSON.parse(result.rawText);
    const validated = analysisResponseSchema.parse(parsed);

    expect(validated.confidence).toBe(0.5);
    expect(validated.warnings).toContain("Input is very short; classification is low-signal.");
  });

  it("does not warn or downgrade confidence for longer input", async () => {
    const prompt = ANALYSIS_PROMPT_V1.build(LONG_TECH_TEXT);
    const result = await provider.invoke(prompt);

    const validated = analysisResponseSchema.parse(JSON.parse(result.rawText));

    expect(validated.confidence).toBe(0.8);
    expect(validated.warnings).toEqual([]);
  });

  it("falls back to the first 240 chars when there is no sentence boundary", async () => {
    const noPunctuation = "word ".repeat(80).trim(); // 399 chars, no '.', '!' or '?'
    const prompt = ANALYSIS_PROMPT_V1.build(noPunctuation);
    const result = await provider.invoke(prompt);

    const validated = analysisResponseSchema.parse(JSON.parse(result.rawText));

    expect(validated.summary).toBe(noPunctuation.slice(0, 240).trim());
    expect(validated.keyPoints).toEqual(["No distinct key points identified."]);
  });

  it("falls back to the whole user string when there are no <user_content> delimiters", async () => {
    const result = await provider.invoke({
      system: "irrelevant system prompt",
      user: BUSINESS_TEXT,
      version: "analysis.v1",
    });

    const validated = analysisResponseSchema.parse(JSON.parse(result.rawText));
    expect(validated.category).toBe("business");
  });

  it("[[SIMULATE_INVALID_JSON]] hook resolves with rawText that fails JSON.parse", async () => {
    const prompt = ANALYSIS_PROMPT_V1.build("Some text. [[SIMULATE_INVALID_JSON]]");
    const result = await provider.invoke(prompt);

    expect(() => JSON.parse(result.rawText)).toThrow();
  });

  it("[[SIMULATE_PROVIDER_ERROR]] hook rejects with a retryable ProviderError", async () => {
    const prompt = ANALYSIS_PROMPT_V1.build("Some text. [[SIMULATE_PROVIDER_ERROR]]");

    expect.assertions(4);
    try {
      await provider.invoke(prompt);
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderError);
      const providerError = error as ProviderError;
      expect(providerError.provider).toBe("mock");
      expect(providerError.retryable).toBe(true);
      expect(providerError.message).toBe("simulated provider failure");
    }
  });

  it("caps summary at schema max length (2000 chars) for very long sentences", async () => {
    const veryLongSentence = "word ".repeat(500) + "the end.";
    const prompt = ANALYSIS_PROMPT_V1.build(veryLongSentence);
    const result = await provider.invoke(prompt);

    const parsed = JSON.parse(result.rawText);
    const validated = analysisResponseSchema.parse(parsed);

    expect(validated.summary.length).toBeLessThanOrEqual(2000);
  });
});
