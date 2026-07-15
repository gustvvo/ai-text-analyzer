import { describe, expect, it, vi } from "vitest";
import type OpenAI from "openai";
import { RateLimitError, InternalServerError, APIConnectionError, APIError } from "openai";
import { OpenAIProvider, type OpenAIClientLike } from "../src/ai/providers/openai.provider.js";
import { ProviderError } from "../src/ai/providers/ai-provider.interface.js";
import { ANALYSIS_JSON_SCHEMA } from "../src/ai/schemas/analysis-response.json-schema.js";
import { ANALYSIS_PROMPT_V1 } from "../src/ai/prompts/analysis.v1.js";
import { loadConfig } from "../src/config.js";

const config = loadConfig({
  JWT_SECRET: "test-only-secret-not-for-production",
  AI_PROVIDER: "openai",
  OPENAI_API_KEY: "dummy-openai-key",
});

const CANNED_RAW_TEXT = JSON.stringify({
  summary: "A summary.",
  category: "technology",
  confidence: 0.9,
  keyPoints: ["one", "two"],
  warnings: [],
});

function buildCompletion(overrides: {
  choice?: Partial<OpenAI.ChatCompletion.Choice>;
  message?: Partial<OpenAI.ChatCompletionMessage>;
  usage?: OpenAI.ChatCompletion["usage"];
} = {}): OpenAI.ChatCompletion {
  return {
    id: "chatcmpl_test",
    created: 0,
    model: "gpt-4o-mini",
    object: "chat.completion",
    choices: [
      {
        index: 0,
        finish_reason: "stop",
        logprobs: null,
        message: {
          content: CANNED_RAW_TEXT,
          refusal: null,
          role: "assistant",
          ...overrides.message,
        },
        ...overrides.choice,
      },
    ],
    usage:
      "usage" in overrides ? overrides.usage : { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  };
}

function fakeClient(create: OpenAIClientLike["chat"]["completions"]["create"]): OpenAIClientLike {
  return { chat: { completions: { create } } };
}

const prompt = ANALYSIS_PROMPT_V1.build("Some article about robots and software.");

describe("OpenAIProvider", () => {
  it("is the 'openai' provider", () => {
    const provider = new OpenAIProvider(config, fakeClient(vi.fn()));
    expect(provider.name).toBe("openai");
  });

  it("calls chat.completions.create with the expected request shape", async () => {
    const create = vi.fn().mockResolvedValue(buildCompletion());
    const provider = new OpenAIProvider(config, fakeClient(create));

    await provider.invoke(prompt);

    expect(create).toHaveBeenCalledTimes(1);
    const request = create.mock.calls[0][0];

    expect(request.model).toBe(config.OPENAI_MODEL);
    expect(request.messages).toEqual([
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user },
    ]);
    expect(request.max_completion_tokens).toBe(config.AI_MAX_OUTPUT_TOKENS);
    expect(request.response_format.type).toBe("json_schema");
    expect(request.response_format.json_schema.strict).toBe(true);
    expect(request.response_format.json_schema.name).toBe("analysis_response");
    expect(request.response_format.json_schema.schema).toBe(ANALYSIS_JSON_SCHEMA);
  });

  it("maps a successful response to a ProviderResult", async () => {
    const create = vi.fn().mockResolvedValue(buildCompletion());
    const provider = new OpenAIProvider(config, fakeClient(create));

    const result = await provider.invoke(prompt);

    expect(result).toEqual({
      rawText: CANNED_RAW_TEXT,
      model: "gpt-4o-mini",
      tokensIn: 10,
      tokensOut: 5,
    });
  });

  it("is null-safe when usage is absent", async () => {
    const create = vi.fn().mockResolvedValue(buildCompletion({ usage: undefined }));
    const provider = new OpenAIProvider(config, fakeClient(create));

    const result = await provider.invoke(prompt);

    expect(result.tokensIn).toBeNull();
    expect(result.tokensOut).toBeNull();
  });

  it("throws a non-retryable ProviderError when finish_reason is 'length'", async () => {
    const create = vi.fn().mockResolvedValue(buildCompletion({ choice: { finish_reason: "length" } }));
    const provider = new OpenAIProvider(config, fakeClient(create));

    expect.assertions(3);
    try {
      await provider.invoke(prompt);
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderError);
      expect((error as ProviderError).provider).toBe("openai");
      expect((error as ProviderError).retryable).toBe(false);
    }
  });

  it("throws a non-retryable ProviderError when finish_reason is 'content_filter'", async () => {
    const create = vi.fn().mockResolvedValue(
      buildCompletion({ choice: { finish_reason: "content_filter" } }),
    );
    const provider = new OpenAIProvider(config, fakeClient(create));

    await expect(provider.invoke(prompt)).rejects.toMatchObject({
      name: "ProviderError",
      provider: "openai",
      retryable: false,
    });
  });

  it("throws a non-retryable ProviderError when the message carries a refusal", async () => {
    const create = vi.fn().mockResolvedValue(
      buildCompletion({ message: { content: null, refusal: "cannot help with that" } }),
    );
    const provider = new OpenAIProvider(config, fakeClient(create));

    await expect(provider.invoke(prompt)).rejects.toMatchObject({
      name: "ProviderError",
      provider: "openai",
      retryable: false,
    });
  });

  it("throws a ProviderError when message.content is null", async () => {
    const create = vi.fn().mockResolvedValue(buildCompletion({ message: { content: null } }));
    const provider = new OpenAIProvider(config, fakeClient(create));

    await expect(provider.invoke(prompt)).rejects.toBeInstanceOf(ProviderError);
  });

  it("throws a ProviderError when message.content is empty", async () => {
    const create = vi.fn().mockResolvedValue(buildCompletion({ message: { content: "" } }));
    const provider = new OpenAIProvider(config, fakeClient(create));

    await expect(provider.invoke(prompt)).rejects.toBeInstanceOf(ProviderError);
  });

  it("maps OpenAI.RateLimitError to a retryable ProviderError", async () => {
    const create = vi.fn().mockRejectedValue(
      new RateLimitError(429, { error: "rate limited" }, "rate limited", new Headers()),
    );
    const provider = new OpenAIProvider(config, fakeClient(create));

    expect.assertions(3);
    try {
      await provider.invoke(prompt);
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderError);
      expect((error as ProviderError).provider).toBe("openai");
      expect((error as ProviderError).retryable).toBe(true);
    }
  });

  it("maps OpenAI.InternalServerError to a retryable ProviderError", async () => {
    const create = vi.fn().mockRejectedValue(new InternalServerError(500, { error: "boom" }, "boom", new Headers()));
    const provider = new OpenAIProvider(config, fakeClient(create));

    await expect(provider.invoke(prompt)).rejects.toMatchObject({
      name: "ProviderError",
      provider: "openai",
      retryable: true,
    });
  });

  it("maps OpenAI.APIConnectionError to a retryable ProviderError", async () => {
    const create = vi.fn().mockRejectedValue(new APIConnectionError({ message: "network down" }));
    const provider = new OpenAIProvider(config, fakeClient(create));

    await expect(provider.invoke(prompt)).rejects.toMatchObject({
      name: "ProviderError",
      provider: "openai",
      retryable: true,
    });
  });

  it("maps a generic OpenAI.APIError (other 4xx) to a non-retryable ProviderError", async () => {
    const create = vi.fn().mockRejectedValue(
      new APIError(400, { error: "bad request" }, "bad request", new Headers()),
    );
    const provider = new OpenAIProvider(config, fakeClient(create));

    await expect(provider.invoke(prompt)).rejects.toMatchObject({
      name: "ProviderError",
      provider: "openai",
      retryable: false,
    });
  });

  it("never includes the API key in a mapped error message", async () => {
    const create = vi.fn().mockRejectedValue(
      new RateLimitError(429, { error: "rate limited" }, "rate limited", new Headers()),
    );
    const provider = new OpenAIProvider(config, fakeClient(create));

    try {
      await provider.invoke(prompt);
      throw new Error("expected invoke to reject");
    } catch (error) {
      expect((error as ProviderError).message).not.toContain(config.OPENAI_API_KEY);
    }
  });
});
