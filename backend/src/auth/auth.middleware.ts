import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { config } from "../config.js";

// `email` isn't a registered JWT claim, so jsonwebtoken's JwtPayload type
// falls back to its `[key: string]: any` index signature for it. Parsing the
// decoded payload through zod gives us a properly typed, runtime-checked
// shape instead of trusting that `any`.
const tokenPayloadSchema = z.object({
  sub: z.string(),
  email: z.string(),
});

export interface AuthenticatedUser {
  id: string;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

const BEARER_PREFIX = "Bearer ";

function extractToken(header: string | undefined): string | undefined {
  if (!header || !header.startsWith(BEARER_PREFIX)) {
    return undefined;
  }
  const token = header.slice(BEARER_PREFIX.length).trim();
  return token.length > 0 ? token : undefined;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = extractToken(req.headers.authorization);

  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const decoded = jwt.verify(token, config.JWT_SECRET);
    const payload = tokenPayloadSchema.safeParse(decoded);

    if (!payload.success) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    req.user = { id: payload.data.sub, email: payload.data.email };
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized" });
  }
}
