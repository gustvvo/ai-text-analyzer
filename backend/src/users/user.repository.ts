import { pool } from "../db.js";

export interface User {
  id: string;
  email: string;
  createdAt: Date;
}

export interface UserWithPasswordHash extends User {
  passwordHash: string;
}

/** Thrown by createUser when the email already exists (unique constraint). */
export class DuplicateEmailError extends Error {
  constructor(email: string) {
    super(`Email already registered: ${email}`);
    this.name = "DuplicateEmailError";
  }
}

const POSTGRES_UNIQUE_VIOLATION = "23505";

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === POSTGRES_UNIQUE_VIOLATION
  );
}

interface UserRow {
  id: string;
  email: string;
  created_at: Date;
}

interface UserWithPasswordHashRow extends UserRow {
  password_hash: string;
}

export async function createUser(email: string, passwordHash: string): Promise<User> {
  try {
    const result = await pool.query<UserRow>(
      "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at",
      [email, passwordHash],
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error("createUser: insert returned no row");
    }
    return { id: row.id, email: row.email, createdAt: row.created_at };
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new DuplicateEmailError(email);
    }
    throw err;
  }
}

export async function findUserByEmail(email: string): Promise<UserWithPasswordHash | null> {
  const result = await pool.query<UserWithPasswordHashRow>(
    "SELECT id, email, password_hash, created_at FROM users WHERE email = $1",
    [email],
  );
  const row = result.rows[0];
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    createdAt: row.created_at,
  };
}
