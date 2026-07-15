import OpenAI, { APIConnectionError, APIError, InternalServerError, RateLimitError } from "openai";
import type { Config } from "../../config.js";
import { ANALYSIS_JSON_SCHEMA } from "../schemas/analysis-response.json-schema.js";
import type { AIProvider, BuiltPrompt, ProviderResult } from "./ai-provider.interface.js";
import { ProviderError } from "./ai-provider.interface.js";

/**
 * The narrow surface of the OpenAI SDK client this provider depends on.
 * A real `OpenAI` instance satisfies this; tests inject a fake instead.
 */
export interface OpenAIClientLike {
  chat: {
    completions: {
      create(params: OpenAI.ChatCompletionCreateParamsNonStreaming): Promise<OpenAI.ChatCompletion>;
    };
  };
}

/**
 * Thin adapter over the OpenAI Chat Completions API. Builds the request,
 * calls the SDK, and maps the response/errors to ProviderResult/ProviderError.
 * No JSON parsing or validation of the model's output happens here — that
 * is the analysis service's job, one layer up.
 */
export class OpenAIProvider implements AIProvider {
  readonly name = "openai";

  private readonly client: OpenAIClientLike;
  private readonly model: string;
  private readonly maxOutputTokens: number;

  constructor(config: Config, client?: OpenAIClientLike) {
    this.model = config.OPENAI_MODEL;
    this.maxOutputTokens = config.AI_MAX_OUTPUT_TOKENS;
    this.client =
      client ??
      new OpenAI({
        apiKey: config.OPENAI_API_KEY,
        timeout: config.AI_TIMEOUT_MS,
        maxRetries: config.AI_MAX_RETRIES,
      });
  }

  async invoke(prompt: BuiltPrompt): Promise<ProviderResult> {
    const response = await this.createCompletion(prompt);

    const choice = response.choices[0];
    if (!choice) {
      throw new ProviderError("provider response contained no choices", "openai", false);
    }

    if (choice.finish_reason === "length") {
      throw new ProviderError("output truncated by token limit", "openai", false);
    }
    if (choice.finish_reason === "content_filter") {
      throw new ProviderError("provider declined the request", "openai", false);
    }
    if (choice.message.refusal) {
      throw new ProviderError("provider declined the request", "openai", false);
    }

    const rawText = choice.message.content;
    if (!rawText) {
      throw new ProviderError("provider response contained no text content", "openai", false);
    }

    return {
      rawText,
      model: response.model,
      tokensIn: response.usage?.prompt_tokens ?? null,
      tokensOut: response.usage?.completion_tokens ?? null,
    };
  }

  private async createCompletion(prompt: BuiltPrompt): Promise<OpenAI.ChatCompletion> {
    try {
      return await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user },
        ],
        max_completion_tokens: this.maxOutputTokens,
        response_format: {
          type: "json_schema",
          json_schema: { name: "analysis_response", strict: true, schema: ANALYSIS_JSON_SCHEMA },
        },
      });
    } catch (error) {
      throw toProviderError(error);
    }
  }
}

/**
 * Maps the SDK's typed error classes to ProviderError, most-specific-first
 * (subclasses of APIError are checked before the generic APIError catch-all).
 * Messages are short and generic, with the HTTP status when available —
 * never the API key or request body.
 */
function toProviderError(error: unknown): ProviderError {
  if (error instanceof RateLimitError) {
    return new ProviderError(withStatus("rate limited by the provider", error.status), "openai", true);
  }
  if (error instanceof InternalServerError) {
    return new ProviderError(withStatus("provider internal error", error.status), "openai", true);
  }
  if (error instanceof APIConnectionError) {
    return new ProviderError("could not connect to the provider", "openai", true);
  }
  if (error instanceof APIError) {
    return new ProviderError(withStatus("provider request failed", error.status), "openai", false);
  }
  return new ProviderError("unexpected error calling the provider", "openai", false);
}

function withStatus(message: string, status: number | undefined): string {
  return status ? `${message} (status ${status})` : message;
}
