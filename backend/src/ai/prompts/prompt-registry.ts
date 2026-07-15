import type { BuiltPrompt } from "../providers/ai-provider.interface.js";
import { ANALYSIS_PROMPT_V1 } from "./analysis.v1.js";

/** Shape every versioned prompt module must implement. */
export interface PromptModule {
  readonly version: string;
  build(text: string): BuiltPrompt;
}

export const DEFAULT_PROMPT_VERSION = "analysis.v1";

/**
 * Plain, readonly map of prompt version -> prompt module. Adding a new
 * version (e.g. "analysis.v2") is a single new entry here.
 */
const PROMPT_REGISTRY = {
  "analysis.v1": ANALYSIS_PROMPT_V1,
} as const;

type KnownPromptVersion = keyof typeof PROMPT_REGISTRY;

function isKnownVersion(version: string): version is KnownPromptVersion {
  return Object.prototype.hasOwnProperty.call(PROMPT_REGISTRY, version);
}

export function getPrompt(version: string): PromptModule {
  if (!isKnownVersion(version)) {
    throw new Error(`Unknown prompt version: "${version}"`);
  }
  return PROMPT_REGISTRY[version];
}
