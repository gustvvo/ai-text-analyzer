import { z } from "zod";

const configSchema = z
  .object({
    PORT: z.coerce.number().int().positive().default(3000),
    DATABASE_URL: z
      .string()
      .url()
      .default("postgres://postgres:postgres@localhost:5432/ai_text_analyzer"),
    CORS_ORIGIN: z.string().url().default("http://localhost:5173"),
    JWT_SECRET: z.string().min(16),
    JWT_EXPIRES_IN: z.string().default("30m"),
    AI_PROVIDER: z.enum(["mock", "anthropic", "openai"]).default("mock"),
    ANTHROPIC_API_KEY: z.string().optional(),
    OPENAI_API_KEY: z.string().optional(),
    ANTHROPIC_MODEL: z.string().default("claude-opus-4-8"),
    OPENAI_MODEL: z.string().default("gpt-4o-mini"),
    AI_TIMEOUT_MS: z.coerce.number().int().positive().default(20000),
    AI_MAX_RETRIES: z.coerce.number().int().nonnegative().default(2),
    AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().default(2048),
    RATE_LIMIT_ANALYZE_PER_MIN: z.coerce.number().int().positive().default(10),
    RATE_LIMIT_AUTH_PER_MIN: z.coerce.number().int().positive().default(5),
  })
  .superRefine((data, ctx) => {
    if (data.AI_PROVIDER === "anthropic" && !data.ANTHROPIC_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ANTHROPIC_API_KEY"],
        message: "ANTHROPIC_API_KEY is required when AI_PROVIDER=anthropic",
      });
    }
    if (data.AI_PROVIDER === "openai" && !data.OPENAI_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["OPENAI_API_KEY"],
        message: "OPENAI_API_KEY is required when AI_PROVIDER=openai",
      });
    }
  });

export type Config = z.infer<typeof configSchema>;

export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const result = configSchema.safeParse(env);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }

  return result.data;
}

export const config = loadConfig(process.env);
