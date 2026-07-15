import { describe, expect, it } from "vitest";
import { CANONICAL_CATEGORIES } from "../src/ai/schemas/analysis-response.schema.js";
import { ANALYSIS_JSON_SCHEMA } from "../src/ai/schemas/analysis-response.json-schema.js";

describe("ANALYSIS_JSON_SCHEMA", () => {
  it("is a structural object schema requiring exactly the five analysis fields", () => {
    expect(ANALYSIS_JSON_SCHEMA.type).toBe("object");
    expect(ANALYSIS_JSON_SCHEMA.additionalProperties).toBe(false);
    expect(ANALYSIS_JSON_SCHEMA.required).toEqual([
      "summary",
      "category",
      "confidence",
      "keyPoints",
      "warnings",
    ]);
  });

  it("mirrors CANONICAL_CATEGORIES for the category enum (single source of truth)", () => {
    expect(ANALYSIS_JSON_SCHEMA.properties.category.enum).toEqual(CANONICAL_CATEGORIES);
  });

  it("has no length/size numeric constraints (structural only, by design)", () => {
    const serialized = JSON.stringify(ANALYSIS_JSON_SCHEMA);

    expect(serialized).not.toMatch(/minLength|maxLength|minimum|maximum|minItems|maxItems/);
  });
});
