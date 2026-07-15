import type { Config } from "../../config.js";
import type { AIProvider } from "./ai-provider.interface.js";
import { MockProvider } from "./mock.provider.js";
import { AnthropicProvider } from "./anthropic.provider.js";
import { OpenAIProvider } from "./openai.provider.js";

/**
 * Selects the AIProvider implementation named by `config.AI_PROVIDER`. The
 * switch is exhaustive: adding a new provider to the config enum without
 * wiring it in here is a compile error, not a silent fallback to mock.
 */
export function createProvider(config: Config): AIProvider {
  switch (config.AI_PROVIDER) {
    case "mock":
      return new MockProvider();
    case "anthropic":
      return new AnthropicProvider(config);
    case "openai":
      return new OpenAIProvider(config);
    default: {
      const exhaustive: never = config.AI_PROVIDER;
      throw new Error(`Unknown AI_PROVIDER: ${String(exhaustive)}`);
    }
  }
}
