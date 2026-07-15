import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

const BASE_ENV = {
  JWT_SECRET: "test-only-secret-not-for-production",
};

describe("config — AI provider settings", () => {
  it("defaults AI_PROVIDER to 'mock'", () => {
    const config = loadConfig(BASE_ENV);

    expect(config.AI_PROVIDER).toBe("mock");
  });

  it("defaults ANTHROPIC_MODEL and OPENAI_MODEL", () => {
    const config = loadConfig(BASE_ENV);

    expect(config.ANTHROPIC_MODEL).toBe("claude-opus-4-8");
    expect(config.OPENAI_MODEL).toBe("gpt-4o-mini");
  });

  it("defaults AI_TIMEOUT_MS, AI_MAX_RETRIES and AI_MAX_OUTPUT_TOKENS", () => {
    const config = loadConfig(BASE_ENV);

    expect(config.AI_TIMEOUT_MS).toBe(20000);
    expect(config.AI_MAX_RETRIES).toBe(2);
    expect(config.AI_MAX_OUTPUT_TOKENS).toBe(2048);
  });

  it("leaves ANTHROPIC_API_KEY and OPENAI_API_KEY undefined by default", () => {
    const config = loadConfig(BASE_ENV);

    expect(config.ANTHROPIC_API_KEY).toBeUndefined();
    expect(config.OPENAI_API_KEY).toBeUndefined();
  });

  it("accepts an explicit AI_PROVIDER=mock with no keys set", () => {
    expect(() => loadConfig({ ...BASE_ENV, AI_PROVIDER: "mock" })).not.toThrow();
  });

  it("rejects an unknown AI_PROVIDER value", () => {
    expect(() => loadConfig({ ...BASE_ENV, AI_PROVIDER: "cohere" })).toThrow();
  });

  it("fails fast with a clear message when AI_PROVIDER=anthropic and ANTHROPIC_API_KEY is missing", () => {
    expect(() => loadConfig({ ...BASE_ENV, AI_PROVIDER: "anthropic" })).toThrow(/ANTHROPIC_API_KEY/);
  });

  it("fails fast with a clear message when AI_PROVIDER=openai and OPENAI_API_KEY is missing", () => {
    expect(() => loadConfig({ ...BASE_ENV, AI_PROVIDER: "openai" })).toThrow(/OPENAI_API_KEY/);
  });

  it("succeeds when AI_PROVIDER=anthropic and ANTHROPIC_API_KEY is set", () => {
    const config = loadConfig({
      ...BASE_ENV,
      AI_PROVIDER: "anthropic",
      ANTHROPIC_API_KEY: "dummy-anthropic-key",
    });

    expect(config.AI_PROVIDER).toBe("anthropic");
    expect(config.ANTHROPIC_API_KEY).toBe("dummy-anthropic-key");
  });

  it("succeeds when AI_PROVIDER=openai and OPENAI_API_KEY is set", () => {
    const config = loadConfig({
      ...BASE_ENV,
      AI_PROVIDER: "openai",
      OPENAI_API_KEY: "dummy-openai-key",
    });

    expect(config.AI_PROVIDER).toBe("openai");
    expect(config.OPENAI_API_KEY).toBe("dummy-openai-key");
  });

  it("defaults RATE_LIMIT_ANALYZE_PER_MIN and RATE_LIMIT_AUTH_PER_MIN", () => {
    const config = loadConfig(BASE_ENV);

    expect(config.RATE_LIMIT_ANALYZE_PER_MIN).toBe(10);
    expect(config.RATE_LIMIT_AUTH_PER_MIN).toBe(5);
  });

  it("accepts overrides for the rate limit envs", () => {
    const config = loadConfig({
      ...BASE_ENV,
      RATE_LIMIT_ANALYZE_PER_MIN: "20",
      RATE_LIMIT_AUTH_PER_MIN: "3",
    });

    expect(config.RATE_LIMIT_ANALYZE_PER_MIN).toBe(20);
    expect(config.RATE_LIMIT_AUTH_PER_MIN).toBe(3);
  });
});
