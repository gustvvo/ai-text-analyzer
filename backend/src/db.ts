import { Pool } from "pg";
import { config } from "./config.js";

const DB_CHECK_TIMEOUT_MS = 2000;

export const pool = new Pool({
  connectionString: config.DATABASE_URL,
});

// Idle clients emit 'error' when the connection drops (e.g. Postgres restarts).
// Without a listener, Node treats it as an unhandled error and crashes the process.
pool.on("error", (err) => {
  console.error(`db pool error: ${err.message}`);
});

export async function checkDbConnection(): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("db check timed out")), DB_CHECK_TIMEOUT_MS);
  });

  try {
    await Promise.race([pool.query("SELECT 1"), timeout]);
    return true;
  } catch (err) {
    const reason = err instanceof Error ? err.message : "timeout";
    console.warn(`db health check failed: ${reason}`);
    return false;
  } finally {
    clearTimeout(timer);
  }
}
