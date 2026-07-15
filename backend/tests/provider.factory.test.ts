import { describe, expect, it } from "vitest";
import { createProvider } from "../src/ai/providers/provider.factory.js";
import { MockProvider } from "../src/ai/providers/mock.provider.js";
import { AnthropicProvider } from "../src/ai/providers/anthropic.provider.js";
import { OpenAIProvider } from "../src/ai/providers/openai.provider.js";
import { loadConfig } from "../src/config.js";

const BASE_ENV = { JWT_SECRET: "test-only-secret-not-for-production" };

describe("createProvider", () => {
  it("returns a MockProvider for the default config", () => {
    const config = loadConfig(BASE_ENV);

    expect(createProvider(config)).toBeInstanceOf(MockProvider);
  });

  it("returns a MockProvider when AI_PROVIDER=mock", () => {
    const config = loadConfig({ ...BASE_ENV, AI_PROVIDER: "mock" });

    expect(createProvider(config)).toBeInstanceOf(MockProvider);
  });

  it("returns an AnthropicProvider when AI_PROVIDER=anthropic", () => {
    const config = loadConfig({
      ...BASE_ENV,
      AI_PROVIDER: "anthropic",
      ANTHROPIC_API_KEY: "dummy-anthropic-key",
    });

    expect(createProvider(config)).toBeInstanceOf(AnthropicProvider);
  });

  it("returns an OpenAIProvider when AI_PROVIDER=openai", () => {
    const config = loadConfig({
      ...BASE_ENV,
      AI_PROVIDER: "openai",
      OPENAI_API_KEY: "dummy-openai-key",
    });

    expect(createProvider(config)).toBeInstanceOf(OpenAIProvider);
  });
});
