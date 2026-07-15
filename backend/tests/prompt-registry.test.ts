import { describe, expect, it } from "vitest";
import { DEFAULT_PROMPT_VERSION, getPrompt } from "../src/ai/prompts/prompt-registry.js";
import { ANALYSIS_PROMPT_V1 } from "../src/ai/prompts/analysis.v1.js";

describe("prompt registry", () => {
  it("defaults to analysis.v1", () => {
    expect(DEFAULT_PROMPT_VERSION).toBe("analysis.v1");
  });

  it("returns the v1 prompt module for 'analysis.v1'", () => {
    expect(getPrompt("analysis.v1")).toBe(ANALYSIS_PROMPT_V1);
  });

  it("throws a clear error for an unknown version", () => {
    expect(() => getPrompt("analysis.v99")).toThrow(/analysis\.v99/);
  });
});
