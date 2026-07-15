import type { ColumnDefinitions, MigrationBuilder } from "node-pg-migrate";

export const shorthands: ColumnDefinitions | undefined = undefined;

// `provider` / `model` / `prompt_version` / `tokens_in` / `tokens_out` make every
// stored analysis auditable: given a stored result, we can trace exactly which
// AI provider, model and prompt revision produced it, and compare token usage
// across runs. This is what enables prompt-regression comparison later on.

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createExtension("pgcrypto", { ifNotExists: true });

  pgm.createTable("users", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("gen_random_uuid()"),
    },
    email: { type: "text", notNull: true, unique: true },
    password_hash: { type: "text", notNull: true },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });

  pgm.createTable("analyses", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("gen_random_uuid()"),
    },
    user_id: {
      type: "uuid",
      notNull: true,
      references: '"users"',
      onDelete: "CASCADE",
    },
    input_text: { type: "text", notNull: true },
    summary: { type: "text" },
    category: { type: "text" },
    confidence: { type: "real" },
    key_points: { type: "jsonb" },
    warnings: { type: "jsonb" },
    provider: { type: "text", notNull: true },
    model: { type: "text", notNull: true },
    prompt_version: { type: "text", notNull: true },
    tokens_in: { type: "integer" },
    tokens_out: { type: "integer" },
    status: {
      type: "text",
      notNull: true,
      default: "completed",
      check: "status IN ('processing', 'completed', 'failed')",
    },
    error_message: { type: "text" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });

  pgm.createIndex("analyses", [
    { name: "user_id", sort: "ASC" },
    { name: "created_at", sort: "DESC" },
  ]);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable("analyses");
  pgm.dropTable("users");
  pgm.dropExtension("pgcrypto", { ifExists: true });
}
