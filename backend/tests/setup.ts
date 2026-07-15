// Required env that has no default (JWT_SECRET) must exist before any test
// file imports src/config.ts (directly or transitively via app.ts/db.ts).
// Vitest runs setupFiles before a test file's own module graph is evaluated,
// so this assignment is visible to `config.ts`'s top-level `loadConfig` call.
process.env.JWT_SECRET ??= "test-only-secret-not-for-production";
