import type { ColumnDefinitions, MigrationBuilder } from "node-pg-migrate";

export const shorthands: ColumnDefinitions | undefined = undefined;

// Nullable: only set once a user flags a result via POST /analyses/:id/report.
// Its presence (vs. null) is the whole signal — no separate boolean needed.

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumn("analyses", {
    reported_at: { type: "timestamptz" },
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumn("analyses", "reported_at");
}
