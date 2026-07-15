import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getPrompt, DEFAULT_PROMPT_VERSION } from "../ai/prompts/prompt-registry.js";
import { createProvider } from "../ai/providers/provider.factory.js";
import { ProviderError, type AIProvider } from "../ai/providers/ai-provider.interface.js";
import { analysisResponseSchema } from "../ai/schemas/analysis-response.schema.js";
import { normalizeResponse } from "../ai/services/normalize.js";
import { loadConfig } from "../config.js";

/**
 * Standalone golden-set runner for any configured AI_PROVIDER (mock by
 * default). Deliberately does NOT import the analyses repository or touch
 * the database — it re-implements the prompt -> invoke -> parse -> normalize
 * -> validate slice of AnalysisService.analyze, without the persistence
 * step, so this can run with zero infrastructure.
 *
 * Usage:
 *   npm run eval                                            # mock, no key needed
 *   AI_PROVIDER=anthropic ANTHROPIC_API_KEY=... npm run eval
 *   AI_PROVIDER=openai OPENAI_API_KEY=... npm run eval
 */

const ACCURACY_THRESHOLD = 0.7;

interface GoldenCase {
  id: string;
  text: string;
  expectedCategory: string;
  expectedKeyPointHints: string[];
}

interface CaseResult {
  id: string;
  expected: string;
  got: string;
  hintsMatched: boolean;
  tokensIn: number;
  tokensOut: number;
  error?: string;
}

function loadGoldenSet(): GoldenCase[] {
  const filePath = fileURLToPath(new URL("../../eval/golden-set.json", import.meta.url));
  const raw = readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as GoldenCase[];
}

async function runCase(provider: AIProvider, goldenCase: GoldenCase): Promise<CaseResult> {
  const prompt = getPrompt(DEFAULT_PROMPT_VERSION).build(goldenCase.text);

  try {
    const result = await provider.invoke(prompt);
    const parsed: unknown = JSON.parse(result.rawText);
    const { value } = normalizeResponse(parsed);
    const validated = analysisResponseSchema.parse(value);

    const haystack = `${validated.summary} ${validated.keyPoints.join(" ")}`.toLowerCase();
    const hintsMatched = goldenCase.expectedKeyPointHints.every((hint) => haystack.includes(hint.toLowerCase()));

    return {
      id: goldenCase.id,
      expected: goldenCase.expectedCategory,
      got: validated.category,
      hintsMatched,
      tokensIn: result.tokensIn ?? 0,
      tokensOut: result.tokensOut ?? 0,
    };
  } catch (err) {
    // ProviderError (transport/refusal/etc.) or a JSON.parse / schema
    // validation failure both mark the case as ERROR and move on — one bad
    // case must never abort the whole eval run.
    const message = err instanceof ProviderError || err instanceof Error ? err.message : "unknown error";
    return {
      id: goldenCase.id,
      expected: goldenCase.expectedCategory,
      got: "ERROR",
      hintsMatched: false,
      tokensIn: 0,
      tokensOut: 0,
      error: message,
    };
  }
}

function padded(value: string, width: number): string {
  return value.length >= width ? `${value.slice(0, width - 1)} ` : value.padEnd(width);
}

function printTable(results: CaseResult[]): void {
  const header = `${padded("id", 8)}${padded("expected", 16)}${padded("got", 16)}${padded("hints", 8)}error`;
  console.log(header);
  console.log("-".repeat(header.length));
  for (const r of results) {
    console.log(
      `${padded(r.id, 8)}${padded(r.expected, 16)}${padded(r.got, 16)}${padded(r.hintsMatched ? "yes" : "no", 8)}${r.error ?? ""}`,
    );
  }
}

async function main(): Promise<void> {
  // Never echo process.env or the config object — only derived, non-secret
  // numbers (token counts, pass/fail) are ever printed by this script.
  const config = loadConfig(process.env);
  const provider = createProvider(config);
  const cases = loadGoldenSet();

  const results: CaseResult[] = [];
  for (const goldenCase of cases) {
    results.push(await runCase(provider, goldenCase));
  }

  printTable(results);

  const correct = results.filter((r) => r.got === r.expected).length;
  const hintsOk = results.filter((r) => r.hintsMatched).length;
  const totalTokensIn = results.reduce((sum, r) => sum + r.tokensIn, 0);
  const totalTokensOut = results.reduce((sum, r) => sum + r.tokensOut, 0);
  const accuracy = correct / results.length;
  const recall = hintsOk / results.length;

  console.log("");
  console.log(`Provider: ${provider.name}`);
  console.log(`Category accuracy: ${correct}/${results.length} (${(accuracy * 100).toFixed(0)}%)`);
  console.log(`Hint recall: ${hintsOk}/${results.length} (${(recall * 100).toFixed(0)}%)`);
  console.log(`Total tokens used: in=${totalTokensIn} out=${totalTokensOut}`);

  if (accuracy < ACCURACY_THRESHOLD) {
    console.error(`\nFAIL: category accuracy ${(accuracy * 100).toFixed(0)}% is below the ${ACCURACY_THRESHOLD * 100}% threshold.`);
    process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  console.error("Eval run failed:", err instanceof Error ? err.message : "unknown error");
  process.exitCode = 1;
});
