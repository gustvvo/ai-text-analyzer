// Imported FIRST by run-eval.ts (side-effect only). ESM evaluates imports
// before the importing module's body, and ../config.js validates the full
// env schema at module scope — so this must run ahead of that import.
// The eval slice never uses auth or the database; the value is inert.
process.env.JWT_SECRET ??= "eval-only-not-a-real-secret";
