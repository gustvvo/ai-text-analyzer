import { Router } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { z } from "zod";
import { createProvider } from "../ai/providers/provider.factory.js";
import { AnalysisFailedError, AnalysisService } from "../ai/services/analysis.service.js";
import { requireAuth } from "../auth/auth.middleware.js";
import { config } from "../config.js";
import * as analysisRepository from "./analysis.repository.js";
import type { AnalysisRecord } from "./analysis.repository.js";

const RATE_LIMIT_WINDOW_MS = 60_000;

const analyzeBodySchema = z.object({
  text: z.string().trim().min(1).max(15000),
});

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const idParamSchema = z.string().uuid();

export interface AnalysisRouterOptions {
  /** Overrides config.RATE_LIMIT_ANALYZE_PER_MIN — used by tests. */
  analyzeRateLimitPerMin?: number;
}

/**
 * Full detail, including input_text — used by POST /analyze and GET /analyses/:id.
 *
 * `durationMs`/`attempts` are safe, aggregate trace fields and are exposed
 * here. `rawResponse` is deliberately NOT included: it's operator/audit data
 * queried via SQL, and returning pre-validation model output to clients
 * would bypass the validation gate semantics zod exists to enforce.
 */
function toDetail(record: AnalysisRecord) {
  return {
    id: record.id,
    status: record.status,
    inputText: record.inputText,
    summary: record.summary,
    category: record.category,
    confidence: record.confidence,
    keyPoints: record.keyPoints,
    warnings: record.warnings,
    provider: record.provider,
    model: record.model,
    promptVersion: record.promptVersion,
    tokensIn: record.tokensIn,
    tokensOut: record.tokensOut,
    reportedAt: record.reportedAt,
    createdAt: record.createdAt,
    durationMs: record.durationMs,
    attempts: record.attempts,
  };
}

/** Slim item for GET /analyses — no input_text, for payload hygiene. */
function toListItem(record: AnalysisRecord) {
  return {
    id: record.id,
    status: record.status,
    category: record.category,
    confidence: record.confidence,
    summary: record.summary,
    provider: record.provider,
    model: record.model,
    promptVersion: record.promptVersion,
    reportedAt: record.reportedAt,
    createdAt: record.createdAt,
  };
}

/**
 * Builds the router for the analysis endpoints. A factory (rather than a
 * module-level singleton, like authRouter) so each call gets its own
 * AnalysisService/provider and its own rate-limit store — the latter lets
 * tests spin up an app with a very low limit without disturbing any other
 * app instance.
 */
export function createAnalysisRouter(options: AnalysisRouterOptions = {}): Router {
  const router = Router();
  const provider = createProvider(config);
  const analysisService = new AnalysisService(provider, analysisRepository, config);

  const analyzeLimiter = rateLimit({
    windowMs: RATE_LIMIT_WINDOW_MS,
    limit: options.analyzeRateLimitPerMin ?? config.RATE_LIMIT_ANALYZE_PER_MIN,
    standardHeaders: true,
    legacyHeaders: false,
    // Keyed by authenticated user (requireAuth runs first), falling back to
    // IP for the rare case requireAuth let a request through without one.
    keyGenerator: (req) => req.user?.id ?? ipKeyGenerator(req.ip ?? "unknown"),
    message: { error: "Too many requests, please slow down." },
  });

  router.post("/analyze", requireAuth, analyzeLimiter, async (req, res, next) => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const parsed = analyzeBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input", fieldErrors: parsed.error.flatten().fieldErrors });
      return;
    }

    try {
      const record = await analysisService.analyze(req.user.id, parsed.data.text);
      res.status(201).json({ analysis: toDetail(record) });
    } catch (err) {
      if (err instanceof AnalysisFailedError) {
        res.status(502).json({ error: "AI analysis failed" });
        return;
      }
      next(err);
    }
  });

  router.get("/analyses", requireAuth, async (req, res, next) => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input", fieldErrors: parsed.error.flatten().fieldErrors });
      return;
    }

    try {
      const { limit, offset } = parsed.data;
      const records = await analysisRepository.listAnalysesForUser(req.user.id, limit, offset);
      res.status(200).json({ analyses: records.map(toListItem), limit, offset });
    } catch (err) {
      next(err);
    }
  });

  router.get("/analyses/:id", requireAuth, async (req, res, next) => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const parsedId = idParamSchema.safeParse(req.params.id);
    if (!parsedId.success) {
      // A malformed id can't belong to anyone; treat it the same as a
      // missing row instead of exposing a distinct validation-error status.
      res.status(404).json({ error: "Not found" });
      return;
    }

    try {
      const record = await analysisRepository.findAnalysisByIdForUser(parsedId.data, req.user.id);
      if (!record) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      res.status(200).json({ analysis: toDetail(record) });
    } catch (err) {
      next(err);
    }
  });

  router.post("/analyses/:id/report", requireAuth, async (req, res, next) => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const parsedId = idParamSchema.safeParse(req.params.id);
    if (!parsedId.success) {
      // Same rationale as GET /analyses/:id: a malformed id can't belong to
      // anyone, so it gets the same 404 as a genuinely missing/foreign row.
      res.status(404).json({ error: "Not found" });
      return;
    }

    try {
      const record = await analysisRepository.reportAnalysis(parsedId.data, req.user.id);
      if (!record) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      res.status(200).json({ analysis: toDetail(record) });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
