import type { AnalysisRecord, CreateAnalysisInput } from "../../analyses/analysis.repository.js";
import type { Config } from "../../config.js";
import { DEFAULT_PROMPT_VERSION, getPrompt } from "../prompts/prompt-registry.js";
import type { AIProvider, ProviderResult } from "../providers/ai-provider.interface.js";
import { ProviderError } from "../providers/ai-provider.interface.js";
import { analysisResponseSchema } from "../schemas/analysis-response.schema.js";
import { normalizeResponse } from "./normalize.js";

const MAX_ATTEMPTS = 2;
const MAX_WARNINGS = 10;

const INVALID_OUTPUT_REASON = "invalid model output";
const PROVIDER_ERROR_REASON = "provider error";
const RETRY_SUCCEEDED_WARNING = "Result was obtained after a retry.";

/** Thrown when analysis could not be produced after exhausting the retry policy. */
export class AnalysisFailedError extends Error {
  constructor() {
    super("AI analysis failed");
    this.name = "AnalysisFailedError";
  }
}

/** The slice of the analyses repository the service depends on. */
export interface AnalysisRepositoryPort {
  createAnalysis(data: CreateAnalysisInput): Promise<AnalysisRecord>;
}

/**
 * Model to record on a failed row when no ProviderResult was ever returned
 * (e.g. a ProviderError on the very first call). Falls back to the
 * provider's configured default model; mock has no such config entry, so it
 * reports its own name instead — there is nothing else to fall back to
 * before a first successful invoke.
 */
function defaultModelForProvider(providerName: string, config: Config): string {
  if (providerName === "anthropic") {
    return config.ANTHROPIC_MODEL;
  }
  if (providerName === "openai") {
    return config.OPENAI_MODEL;
  }
  return providerName;
}

interface LogEntry {
  userId: string;
  provider: string;
  model: string;
  promptVersion: string;
  tokensIn: number | null;
  tokensOut: number | null;
  durationMs: number;
  status: "completed" | "failed";
}

/**
 * Structured, metadata-only log line for one analysis attempt. Deliberately
 * excludes input_text, summary, and any raw model output — user content and
 * model content must never end up in logs.
 */
function logAnalysis(entry: LogEntry): void {
  console.log(JSON.stringify({ event: "analysis", ...entry }));
}

interface FailParams {
  userId: string;
  text: string;
  model: string;
  promptVersion: string;
  tokensIn: number | null;
  tokensOut: number | null;
  reason: string;
  startedAt: number;
}

/**
 * Runs the full analysis pipeline for a piece of user text: build prompt ->
 * invoke provider -> parse -> normalize -> validate -> persist, with the
 * retry policy and audit-trail persistence described in the analyses table.
 */
export class AnalysisService {
  constructor(
    private readonly provider: AIProvider,
    private readonly repository: AnalysisRepositoryPort,
    private readonly config: Config,
  ) {}

  async analyze(userId: string, text: string): Promise<AnalysisRecord> {
    const prompt = getPrompt(DEFAULT_PROMPT_VERSION).build(text);
    const startedAt = Date.now();

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      let result: ProviderResult;
      try {
        result = await this.provider.invoke(prompt);
      } catch (err) {
        if (err instanceof ProviderError) {
          // The SDK already retried transport-level errors internally —
          // no service-level retry on top of that.
          return this.fail({
            userId,
            text,
            model: defaultModelForProvider(this.provider.name, this.config),
            promptVersion: prompt.version,
            tokensIn: null,
            tokensOut: null,
            reason: PROVIDER_ERROR_REASON,
            startedAt,
          });
        }
        throw err;
      }

      try {
        const parsed: unknown = JSON.parse(result.rawText);
        const { value } = normalizeResponse(parsed);
        const validated = analysisResponseSchema.parse(value);

        const isRetrySuccess = attempt > 1;
        const warnings = isRetrySuccess
          ? [...validated.warnings, RETRY_SUCCEEDED_WARNING].slice(0, MAX_WARNINGS)
          : validated.warnings;

        const record = await this.repository.createAnalysis({
          userId,
          inputText: text,
          summary: validated.summary,
          category: validated.category,
          confidence: validated.confidence,
          keyPoints: validated.keyPoints,
          warnings,
          provider: this.provider.name,
          model: result.model,
          promptVersion: prompt.version,
          tokensIn: result.tokensIn,
          tokensOut: result.tokensOut,
          status: "completed",
        });

        logAnalysis({
          userId,
          provider: this.provider.name,
          model: result.model,
          promptVersion: prompt.version,
          tokensIn: result.tokensIn,
          tokensOut: result.tokensOut,
          durationMs: Date.now() - startedAt,
          status: "completed",
        });

        return record;
      } catch {
        if (attempt >= MAX_ATTEMPTS) {
          return this.fail({
            userId,
            text,
            model: result.model,
            promptVersion: prompt.version,
            tokensIn: result.tokensIn,
            tokensOut: result.tokensOut,
            reason: INVALID_OUTPUT_REASON,
            startedAt,
          });
        }
        // Malformed model output on the first attempt — retry once from
        // "invoke provider" (step 2 of the pipeline).
      }
    }

    // Unreachable: every loop iteration either returns or throws.
    throw new AnalysisFailedError();
  }

  private async fail(params: FailParams): Promise<never> {
    await this.repository.createAnalysis({
      userId: params.userId,
      inputText: params.text,
      provider: this.provider.name,
      model: params.model,
      promptVersion: params.promptVersion,
      tokensIn: params.tokensIn,
      tokensOut: params.tokensOut,
      status: "failed",
      errorMessage: params.reason,
    });

    logAnalysis({
      userId: params.userId,
      provider: this.provider.name,
      model: params.model,
      promptVersion: params.promptVersion,
      tokensIn: params.tokensIn,
      tokensOut: params.tokensOut,
      durationMs: Date.now() - params.startedAt,
      status: "failed",
    });

    throw new AnalysisFailedError();
  }
}
