import cors from "cors";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { authRouter } from "./auth/auth.router.js";
import { config } from "./config.js";
import { checkDbConnection } from "./db.js";

export function createApp(): Express {
  const app = express();

  app.use(express.json());
  app.use(cors({ origin: config.CORS_ORIGIN }));

  app.get("/health", async (_req, res) => {
    const isDbConnected = await checkDbConnection();

    res.status(200).json({
      status: "ok",
      db: isDbConnected ? "connected" : "disconnected",
    });
  });

  app.use("/auth", authRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  // Must be declared last, with 4 params, for Express to treat it as an
  // error handler. Catches errors forwarded via next(err) from route
  // handlers (e.g. unexpected repository/DB failures).
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error("Unhandled error:", err instanceof Error ? err.message : err);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
