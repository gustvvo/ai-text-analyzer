import bcrypt from "bcryptjs";
import { pool } from "../db.js";

const DEMO_EMAIL = "demo@example.com";
const DEMO_PASSWORD = "demo1234";
const BCRYPT_COST = 10;

async function seed(): Promise<void> {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, BCRYPT_COST);

  const result = await pool.query(
    "INSERT INTO users (email, password_hash) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING RETURNING id",
    [DEMO_EMAIL, passwordHash],
  );

  if (result.rowCount) {
    console.log(`Seeded demo user: ${DEMO_EMAIL}`);
  } else {
    console.log(`Demo user already exists, skipped: ${DEMO_EMAIL}`);
  }
}

seed()
  .catch((err) => {
    console.error("Seed failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => {
    void pool.end();
  });
