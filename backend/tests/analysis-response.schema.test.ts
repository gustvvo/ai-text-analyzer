import { describe, expect, it } from "vitest";
import { analysisResponseSchema } from "../src/ai/schemas/analysis-response.schema.js";

const validPayload = {
  summary: "A concise summary of the input text.",
  category: "technology",
  confidence: 0.87,
  keyPoints: ["Point one", "Point two"],
  warnings: [],
};

describe("analysisResponseSchema", () => {
  it("parses a valid payload", () => {
    const result = analysisResponseSchema.safeParse(validPayload);

    expect(result.success).toBe(true);
  });

  it("rejects a category outside the canonical list", () => {
    const result = analysisResponseSchema.safeParse({
      ...validPayload,
      category: "astrology",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a confidence above 1", () => {
    const result = analysisResponseSchema.safeParse({
      ...validPayload,
      confidence: 1.2,
    });

    expect(result.success).toBe(false);
  });

  it("rejects an empty keyPoints array", () => {
    const result = analysisResponseSchema.safeParse({
      ...validPayload,
      keyPoints: [],
    });

    expect(result.success).toBe(false);
  });

  it("rejects a summary longer than 2000 characters", () => {
    const result = analysisResponseSchema.safeParse({
      ...validPayload,
      summary: "a".repeat(2001),
    });

    expect(result.success).toBe(false);
  });

  it("trims summary and each keyPoint before validating length", () => {
    const result = analysisResponseSchema.safeParse({
      ...validPayload,
      summary: "  padded summary  ",
      keyPoints: ["  padded point  "],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.summary).toBe("padded summary");
      expect(result.data.keyPoints[0]).toBe("padded point");
    }
  });
});
