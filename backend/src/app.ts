import cors from "cors";
import express, { type Express } from "express";
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

  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  return app;
}
