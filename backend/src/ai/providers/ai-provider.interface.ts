/**
 * Provider-agnostic contract for the AI layer. A provider's only job is to
 * turn an already-built prompt into raw model output — it never sees or
 * touches the JSON schema. Parsing the raw text into structured data and
 * validating it against `analysisResponseSchema` happens one layer up, in
 * the analysis service, so mock and real providers exercise the exact same
 * post-processing path.
 */

/** A fully assembled prompt, ready to hand to a provider. */
export interface BuiltPrompt {
  system: string;
  user: string;
  version: string; // e.g. "analysis.v1"
}

/** What a provider returns after invoking a model with a BuiltPrompt. */
export interface ProviderResult {
  rawText: string; // model's raw text output (expected to be JSON)
  model: string; // concrete model identifier used
  tokensIn: number | null; // null when the provider doesn't report usage
  tokensOut: number | null;
}

/** Thrown by a provider when it cannot produce a ProviderResult. */
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly provider: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export interface AIProvider {
  readonly name: string; // 'mock' | 'anthropic' | 'openai'
  invoke(prompt: BuiltPrompt): Promise<ProviderResult>;
}
