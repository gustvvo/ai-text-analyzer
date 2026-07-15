import { pool } from "../db.js";

export type AnalysisStatus = "completed" | "failed";

/**
 * Domain shape returned to callers — already camelCased and already split
 * into the fields that make sense for a completed vs. a failed analysis.
 */
export interface AnalysisRecord {
  id: string;
  userId: string;
  status: AnalysisStatus;
  inputText: string;
  summary: string | null;
  category: string | null;
  confidence: number | null;
  keyPoints: string[];
  warnings: string[];
  provider: string;
  model: string;
  promptVersion: string;
  tokensIn: number | null;
  tokensOut: number | null;
  errorMessage: string | null;
  reportedAt: Date | null;
  createdAt: Date;
}

interface AnalysisRow {
  id: string;
  user_id: string;
  status: AnalysisStatus;
  input_text: string;
  summary: string | null;
  category: string | null;
  confidence: number | null;
  key_points: string[] | null;
  warnings: string[] | null;
  provider: string;
  model: string;
  prompt_version: string;
  tokens_in: number | null;
  tokens_out: number | null;
  error_message: string | null;
  reported_at: Date | null;
  created_at: Date;
}

function toRecord(row: AnalysisRow): AnalysisRecord {
  return {
    id: row.id,
    userId: row.user_id,
    status: row.status,
    inputText: row.input_text,
    summary: row.summary,
    category: row.category,
    confidence: row.confidence,
    keyPoints: row.key_points ?? [],
    warnings: row.warnings ?? [],
    provider: row.provider,
    model: row.model,
    promptVersion: row.prompt_version,
    tokensIn: row.tokens_in,
    tokensOut: row.tokens_out,
    errorMessage: row.error_message,
    reportedAt: row.reported_at,
    createdAt: row.created_at,
  };
}

export interface CreateCompletedAnalysisInput {
  userId: string;
  inputText: string;
  summary: string;
  category: string;
  confidence: number;
  keyPoints: string[];
  warnings: string[];
  provider: string;
  model: string;
  promptVersion: string;
  tokensIn: number | null;
  tokensOut: number | null;
  status: "completed";
}

export interface CreateFailedAnalysisInput {
  userId: string;
  inputText: string;
  provider: string;
  model: string;
  promptVersion: string;
  tokensIn: number | null;
  tokensOut: number | null;
  status: "failed";
  /** Short, generic reason (e.g. "invalid model output") — never a stack trace or raw output. */
  errorMessage: string;
}

export type CreateAnalysisInput = CreateCompletedAnalysisInput | CreateFailedAnalysisInput;

export async function createAnalysis(data: CreateAnalysisInput): Promise<AnalysisRecord> {
  const isCompleted = data.status === "completed";

  const result = await pool.query<AnalysisRow>(
    `INSERT INTO analyses
      (user_id, input_text, summary, category, confidence, key_points, warnings,
       provider, model, prompt_version, tokens_in, tokens_out, status, error_message)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     RETURNING *`,
    [
      data.userId,
      data.inputText,
      isCompleted ? data.summary : null,
      isCompleted ? data.category : null,
      isCompleted ? data.confidence : null,
      JSON.stringify(isCompleted ? data.keyPoints : []),
      JSON.stringify(isCompleted ? data.warnings : []),
      data.provider,
      data.model,
      data.promptVersion,
      data.tokensIn,
      data.tokensOut,
      data.status,
      isCompleted ? null : data.errorMessage,
    ],
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error("createAnalysis: insert returned no row");
  }
  return toRecord(row);
}

/**
 * Looks up an analysis owned by `userId`. Scoping the WHERE clause to both
 * `id` AND `user_id` means a row that exists but belongs to someone else
 * returns null — identical to a genuinely missing id — so callers can
 * return a plain 404 without leaking whether the id exists at all.
 */
export async function findAnalysisByIdForUser(id: string, userId: string): Promise<AnalysisRecord | null> {
  const result = await pool.query<AnalysisRow>("SELECT * FROM analyses WHERE id = $1 AND user_id = $2", [
    id,
    userId,
  ]);
  const row = result.rows[0];
  return row ? toRecord(row) : null;
}

/**
 * Marks an analysis owned by `userId` as reported. Scoped to `id` AND
 * `user_id`, identically to `findAnalysisByIdForUser`, so a row owned by
 * someone else returns null (404), never a leak of its existence.
 *
 * Idempotent: `COALESCE` keeps the original `reported_at` on repeat calls
 * instead of bumping it to a new `now()` each time, so calling this twice
 * for the same row yields the exact same stored value both times.
 */
export async function reportAnalysis(id: string, userId: string): Promise<AnalysisRecord | null> {
  const result = await pool.query<AnalysisRow>(
    "UPDATE analyses SET reported_at = COALESCE(reported_at, now()) WHERE id = $1 AND user_id = $2 RETURNING *",
    [id, userId],
  );
  const row = result.rows[0];
  return row ? toRecord(row) : null;
}

/** Newest first, using the existing (user_id, created_at DESC) index. */
export async function listAnalysesForUser(
  userId: string,
  limit: number,
  offset: number,
): Promise<AnalysisRecord[]> {
  const result = await pool.query<AnalysisRow>(
    "SELECT * FROM analyses WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3",
    [userId, limit, offset],
  );
  return result.rows.map(toRecord);
}
