import Anthropic, { APIConnectionError, APIError, InternalServerError, RateLimitError } from "@anthropic-ai/sdk";
import type { Config } from "../../config.js";
import { ANALYSIS_JSON_SCHEMA } from "../schemas/analysis-response.json-schema.js";
import type { AIProvider, BuiltPrompt, ProviderResult } from "./ai-provider.interface.js";
import { ProviderError } from "./ai-provider.interface.js";

/**
 * The narrow surface of the Anthropic SDK client this provider depends on.
 * A real `Anthropic` instance satisfies this; tests inject a fake instead.
 */
export interface AnthropicClientLike {
  messages: {
    create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message>;
  };
}

/**
 * Thin adapter over the Anthropic Messages API. Builds the request, calls
 * the SDK, and maps the response/errors to ProviderResult/ProviderError.
 * No JSON parsing or validation of the model's output happens here — that
 * is the analysis service's job, one layer up.
 */
export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic";

  private readonly client: AnthropicClientLike;
  private readonly model: string;
  private readonly maxOutputTokens: number;

  constructor(config: Config, client?: AnthropicClientLike) {
    this.model = config.ANTHROPIC_MODEL;
    this.maxOutputTokens = config.AI_MAX_OUTPUT_TOKENS;
    this.client =
      client ??
      new Anthropic({
        apiKey: config.ANTHROPIC_API_KEY,
        timeout: config.AI_TIMEOUT_MS,
        maxRetries: config.AI_MAX_RETRIES,
      });
  }

  async invoke(prompt: BuiltPrompt): Promise<ProviderResult> {
    const response = await this.createMessage(prompt);

    if (response.stop_reason === "refusal") {
      throw new ProviderError("provider declined the request", "anthropic", false);
    }
    if (response.stop_reason === "max_tokens") {
      throw new ProviderError("output truncated by token limit", "anthropic", false);
    }

    const textBlock = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === "text",
    );
    if (!textBlock) {
      throw new ProviderError("provider response contained no text content", "anthropic", false);
    }

    return {
      rawText: textBlock.text,
      model: response.model,
      tokensIn: response.usage.input_tokens,
      tokensOut: response.usage.output_tokens,
    };
  }

  private async createMessage(prompt: BuiltPrompt): Promise<Anthropic.Message> {
    try {
      return await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxOutputTokens,
        system: prompt.system,
        messages: [{ role: "user", content: prompt.user }],
        output_config: { format: { type: "json_schema", schema: ANALYSIS_JSON_SCHEMA } },
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
    return new ProviderError(withStatus("rate limited by the provider", error.status), "anthropic", true);
  }
  if (error instanceof InternalServerError) {
    return new ProviderError(withStatus("provider internal error", error.status), "anthropic", true);
  }
  if (error instanceof APIConnectionError) {
    return new ProviderError("could not connect to the provider", "anthropic", true);
  }
  if (error instanceof APIError) {
    return new ProviderError(withStatus("provider request failed", error.status), "anthropic", false);
  }
  return new ProviderError("unexpected error calling the provider", "anthropic", false);
}

function withStatus(message: string, status: number | undefined): string {
  return status ? `${message} (status ${status})` : message;
}
