import { describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { RateLimitError, InternalServerError, APIConnectionError, APIError } from "@anthropic-ai/sdk";
import { AnthropicProvider, type AnthropicClientLike } from "../src/ai/providers/anthropic.provider.js";
import { ProviderError } from "../src/ai/providers/ai-provider.interface.js";
import { ANALYSIS_JSON_SCHEMA } from "../src/ai/schemas/analysis-response.json-schema.js";
import { ANALYSIS_PROMPT_V1 } from "../src/ai/prompts/analysis.v1.js";
import { loadConfig } from "../src/config.js";

const config = loadConfig({
  JWT_SECRET: "test-only-secret-not-for-production",
  AI_PROVIDER: "anthropic",
  ANTHROPIC_API_KEY: "dummy-anthropic-key",
});

const CANNED_RAW_TEXT = JSON.stringify({
  summary: "A summary.",
  category: "technology",
  confidence: 0.9,
  keyPoints: ["one", "two"],
  warnings: [],
});

function buildMessage(overrides: Partial<Anthropic.Message> = {}): Anthropic.Message {
  return {
    id: "msg_test",
    container: null,
    content: [{ type: "text", text: CANNED_RAW_TEXT, citations: null }],
    model: "claude-opus-4-8",
    role: "assistant",
    stop_details: null,
    stop_reason: "end_turn",
    stop_sequence: null,
    type: "message",
    usage: {
      input_tokens: 10,
      output_tokens: 5,
      cache_creation: null,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      inference_geo: null,
      output_tokens_details: null,
      server_tool_use: null,
      service_tier: null,
    },
    ...overrides,
  };
}

function fakeClient(create: AnthropicClientLike["messages"]["create"]): AnthropicClientLike {
  return { messages: { create } };
}

const prompt = ANALYSIS_PROMPT_V1.build("Some article about robots and software.");

describe("AnthropicProvider", () => {
  it("is the 'anthropic' provider", () => {
    const provider = new AnthropicProvider(config, fakeClient(vi.fn()));
    expect(provider.name).toBe("anthropic");
  });

  it("calls messages.create with the expected request shape", async () => {
    const create = vi.fn().mockResolvedValue(buildMessage());
    const provider = new AnthropicProvider(config, fakeClient(create));

    await provider.invoke(prompt);

    expect(create).toHaveBeenCalledTimes(1);
    const request = create.mock.calls[0][0];

    expect(request.model).toBe(config.ANTHROPIC_MODEL);
    expect(request.system).toBe(prompt.system);
    expect(request.max_tokens).toBe(config.AI_MAX_OUTPUT_TOKENS);
    expect(request.messages).toEqual([{ role: "user", content: prompt.user }]);
    expect(request.output_config.format.type).toBe("json_schema");
    expect(request.output_config.format.schema).toBe(ANALYSIS_JSON_SCHEMA);
  });

  it("maps a successful response to a ProviderResult", async () => {
    const create = vi.fn().mockResolvedValue(buildMessage());
    const provider = new AnthropicProvider(config, fakeClient(create));

    const result = await provider.invoke(prompt);

    expect(result).toEqual({
      rawText: CANNED_RAW_TEXT,
      model: "claude-opus-4-8",
      tokensIn: 10,
      tokensOut: 5,
    });
  });

  it("throws a non-retryable ProviderError when stop_reason is 'refusal'", async () => {
    const create = vi.fn().mockResolvedValue(buildMessage({ stop_reason: "refusal" }));
    const provider = new AnthropicProvider(config, fakeClient(create));

    expect.assertions(3);
    try {
      await provider.invoke(prompt);
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderError);
      expect((error as ProviderError).provider).toBe("anthropic");
      expect((error as ProviderError).retryable).toBe(false);
    }
  });

  it("throws a non-retryable ProviderError when stop_reason is 'max_tokens'", async () => {
    const create = vi.fn().mockResolvedValue(buildMessage({ stop_reason: "max_tokens" }));
    const provider = new AnthropicProvider(config, fakeClient(create));

    expect.assertions(2);
    try {
      await provider.invoke(prompt);
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderError);
      expect((error as ProviderError).retryable).toBe(false);
    }
  });

  it("throws a ProviderError when no text content block is present", async () => {
    const create = vi.fn().mockResolvedValue(
      buildMessage({ content: [{ type: "tool_use", id: "t1", input: {}, name: "x" }] as never }),
    );
    const provider = new AnthropicProvider(config, fakeClient(create));

    await expect(provider.invoke(prompt)).rejects.toBeInstanceOf(ProviderError);
  });

  it("maps Anthropic.RateLimitError to a retryable ProviderError", async () => {
    const create = vi.fn().mockRejectedValue(
      new RateLimitError(429, { error: "rate limited" }, "rate limited", new Headers()),
    );
    const provider = new AnthropicProvider(config, fakeClient(create));

    expect.assertions(3);
    try {
      await provider.invoke(prompt);
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderError);
      expect((error as ProviderError).provider).toBe("anthropic");
      expect((error as ProviderError).retryable).toBe(true);
    }
  });

  it("maps Anthropic.InternalServerError to a retryable ProviderError", async () => {
    const create = vi.fn().mockRejectedValue(
      new InternalServerError(500, { error: "boom" }, "boom", new Headers()),
    );
    const provider = new AnthropicProvider(config, fakeClient(create));

    await expect(provider.invoke(prompt)).rejects.toMatchObject({
      name: "ProviderError",
      provider: "anthropic",
      retryable: true,
    });
  });

  it("maps Anthropic.APIConnectionError to a retryable ProviderError", async () => {
    const create = vi.fn().mockRejectedValue(new APIConnectionError({ message: "network down" }));
    const provider = new AnthropicProvider(config, fakeClient(create));

    await expect(provider.invoke(prompt)).rejects.toMatchObject({
      name: "ProviderError",
      provider: "anthropic",
      retryable: true,
    });
  });

  it("maps a generic Anthropic.APIError (other 4xx) to a non-retryable ProviderError", async () => {
    const create = vi.fn().mockRejectedValue(
      new APIError(400, { error: "bad request" }, "bad request", new Headers()),
    );
    const provider = new AnthropicProvider(config, fakeClient(create));

    await expect(provider.invoke(prompt)).rejects.toMatchObject({
      name: "ProviderError",
      provider: "anthropic",
      retryable: false,
    });
  });

  it("never includes the API key in a mapped error message", async () => {
    const create = vi.fn().mockRejectedValue(
      new RateLimitError(429, { error: "rate limited" }, "rate limited", new Headers()),
    );
    const provider = new AnthropicProvider(config, fakeClient(create));

    try {
      await provider.invoke(prompt);
      throw new Error("expected invoke to reject");
    } catch (error) {
      expect((error as ProviderError).message).not.toContain(config.ANTHROPIC_API_KEY);
    }
  });
});
