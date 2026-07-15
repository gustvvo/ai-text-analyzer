import bcrypt from "bcryptjs";
import jwt, { type SignOptions } from "jsonwebtoken";
import { config } from "../config.js";
import { createUser, findUserByEmail } from "../users/user.repository.js";

const BCRYPT_COST = 10;

// Precomputed once at module load so `login` can run a bcrypt compare even
// when the email is unknown — this keeps the unknown-email and
// wrong-password paths doing the same amount of work, so the response time
// doesn't leak whether an email is registered.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync("not-a-real-password", BCRYPT_COST);

export interface AuthUser {
  id: string;
  email: string;
}

/** Thrown by login on any failure (unknown email or wrong password). */
export class InvalidCredentialsError extends Error {
  constructor() {
    super("Invalid credentials");
    this.name = "InvalidCredentialsError";
  }
}

export async function register(email: string, password: string): Promise<AuthUser> {
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  const user = await createUser(email, passwordHash);
  return { id: user.id, email: user.email };
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const user = await findUserByEmail(email);

  if (!user) {
    await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
    throw new InvalidCredentialsError();
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatches) {
    throw new InvalidCredentialsError();
  }

  return { id: user.id, email: user.email };
}

export function issueToken(user: AuthUser): string {
  const options: SignOptions = {
    subject: user.id,
    expiresIn: config.JWT_EXPIRES_IN as NonNullable<SignOptions["expiresIn"]>,
  };
  return jwt.sign({ email: user.email }, config.JWT_SECRET, options);
}
