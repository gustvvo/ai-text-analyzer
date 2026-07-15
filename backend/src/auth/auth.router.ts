import { Router } from "express";
import { z } from "zod";
import { DuplicateEmailError } from "../users/user.repository.js";
import { requireAuth } from "./auth.middleware.js";
import { InvalidCredentialsError, issueToken, login, register } from "./auth.service.js";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const authRouter = Router();

authRouter.post("/register", async (req, res, next) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", fieldErrors: parsed.error.flatten().fieldErrors });
    return;
  }

  const { email, password } = parsed.data;

  try {
    const user = await register(email, password);
    const token = issueToken(user);
    res.status(201).json({ token, user });
  } catch (err) {
    if (err instanceof DuplicateEmailError) {
      res.status(409).json({ error: "Email already registered" });
      return;
    }
    next(err);
  }
});

authRouter.post("/login", async (req, res, next) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", fieldErrors: parsed.error.flatten().fieldErrors });
    return;
  }

  const { email, password } = parsed.data;

  try {
    const user = await login(email, password);
    const token = issueToken(user);
    res.status(200).json({ token, user });
  } catch (err) {
    if (err instanceof InvalidCredentialsError) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    next(err);
  }
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.status(200).json({ user: req.user });
});
