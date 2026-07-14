import { Pool } from "pg";
import { config } from "./config.js";

const DB_CHECK_TIMEOUT_MS = 2000;

export const pool = new Pool({
  connectionString: config.DATABASE_URL,
});

function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error("db check timed out")), ms);
  });
}

export async function checkDbConnection(): Promise<boolean> {
  try {
    await Promise.race([pool.query("SELECT 1"), timeout(DB_CHECK_TIMEOUT_MS)]);
    return true;
  } catch {
    return false;
  }
}
