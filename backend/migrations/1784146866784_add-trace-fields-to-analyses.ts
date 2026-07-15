import type { ColumnDefinitions, MigrationBuilder } from "node-pg-migrate";

export const shorthands: ColumnDefinitions | undefined = undefined;

// Replayable trace, one row per analysis: `raw_response` is the provider's
// rawText exactly as returned, before normalization/validation, so a bad
// stored result can be diffed against what the model actually said instead
// of trusting the post-processing pipeline blindly. `duration_ms` and
// `attempts` give per-row latency and retry visibility (was this row slow?
// did the retry policy kick in?) without having to correlate against logs.
// All three are nullable: older rows predate this migration and have none
// of them.

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumn("analyses", {
    raw_response: { type: "text" },
    duration_ms: { type: "integer" },
    attempts: { type: "integer" },
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumn("analyses", ["raw_response", "duration_ms", "attempts"]);
}
