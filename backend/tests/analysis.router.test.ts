import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { config } from "../src/config.js";
import { createAnalysisRouter } from "../src/analyses/analysis.router.js";
import type { AnalysisRecord } from "../src/analyses/analysis.repository.js";
import { createAnalysis, findAnalysisByIdForUser, listAnalysesForUser } from "../src/analyses/analysis.repository.js";

vi.mock("../src/analyses/analysis.repository.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/analyses/analysis.repository.js")>();
  return {
    ...actual,
    createAnalysis: vi.fn(),
    findAnalysisByIdForUser: vi.fn(),
    listAnalysesForUser: vi.fn(),
  };
});

const mockCreateAnalysis = vi.mocked(createAnalysis);
const mockFindAnalysisByIdForUser = vi.mocked(findAnalysisByIdForUser);
const mockListAnalysesForUser = vi.mocked(listAnalysesForUser);

const USER_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_USER_ID = "22222222-2222-2222-2222-222222222222";
const ANALYSIS_ID = "33333333-3333-4333-8333-333333333333";

function signToken(userId = USER_ID, email = "jane@example.com"): string {
  return jwt.sign({ email }, config.JWT_SECRET, {
    subject: userId,
    expiresIn: config.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
}

function fakeAnalysisRecord(overrides: Partial<AnalysisRecord> = {}): AnalysisRecord {
  return {
    id: ANALYSIS_ID,
    userId: USER_ID,
    status: "completed",
    inputText: "some input text",
    summary: "a summary",
    category: "technology",
    confidence: 0.8,
    keyPoints: ["a point"],
    warnings: [],
    provider: "mock",
    model: "mock-analyzer-v1",
    promptVersion: "analysis.v1",
    tokensIn: 10,
    tokensOut: 20,
    errorMessage: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

beforeEach(() => {
  mockCreateAnalysis.mockReset();
  mockFindAnalysisByIdForUser.mockReset();
  mockListAnalysesForUser.mockReset();
});

describe("POST /analyze", () => {
  it("returns 401 without a token", async () => {
    const app = createApp();

    const response = await request(app).post("/analyze").send({ text: "hello" });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "Unauthorized" });
    expect(mockCreateAnalysis).not.toHaveBeenCalled();
  });

  it("returns 400 with field errors for text over 15000 chars", async () => {
    const app = createApp();
    const token = signToken();
    const tooLong = "a".repeat(15001);

    const response = await request(app)
      .post("/analyze")
      .set("Authorization", `Bearer ${token}`)
      .send({ text: tooLong });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Invalid input");
    expect(response.body.fieldErrors.text).toBeDefined();
    expect(mockCreateAnalysis).not.toHaveBeenCalled();
  });

  it("returns 201 with the analysis payload (real service + MockProvider + mocked repository)", async () => {
    const app = createApp();
    const token = signToken();
    mockCreateAnalysis.mockResolvedValue(fakeAnalysisRecord());

    const response = await request(app)
      .post("/analyze")
      .set("Authorization", `Bearer ${token}`)
      .send({ text: "Artificial intelligence is transforming the software industry at scale." });

    expect(response.status).toBe(201);
    expect(response.body.analysis).toMatchObject({
      id: ANALYSIS_ID,
      status: "completed",
      provider: "mock",
      promptVersion: "analysis.v1",
      inputText: "some input text",
    });
    expect(mockCreateAnalysis).toHaveBeenCalledTimes(1);
    const insertedData = mockCreateAnalysis.mock.calls[0]?.[0];
    expect(insertedData?.status).toBe("completed");
    expect(insertedData?.userId).toBe(USER_ID);
  });

  it("returns 502 with the exact generic body when the AI pipeline fails after exhausting retries", async () => {
    const app = createApp();
    const token = signToken();
    mockCreateAnalysis.mockResolvedValue(fakeAnalysisRecord({ status: "failed" }));

    const response = await request(app)
      .post("/analyze")
      .set("Authorization", `Bearer ${token}`)
      .send({ text: "Some text. [[SIMULATE_PROVIDER_ERROR]]" });

    expect(response.status).toBe(502);
    expect(response.body).toEqual({ error: "AI analysis failed" });
    expect(mockCreateAnalysis).toHaveBeenCalledTimes(1);
    const insertedData = mockCreateAnalysis.mock.calls[0]?.[0];
    expect(insertedData?.status).toBe("failed");
  });
});

describe("GET /analyses", () => {
  it("returns 401 without a token", async () => {
    const app = createApp();

    const response = await request(app).get("/analyses");

    expect(response.status).toBe(401);
  });

  it("returns 200 with the list shape, without input_text (payload hygiene)", async () => {
    const app = createApp();
    const token = signToken();
    mockListAnalysesForUser.mockResolvedValue([fakeAnalysisRecord()]);

    const response = await request(app).get("/analyses").set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.limit).toBe(20);
    expect(response.body.offset).toBe(0);
    expect(response.body.analyses).toHaveLength(1);
    expect(response.body.analyses[0]).toEqual({
      id: ANALYSIS_ID,
      status: "completed",
      category: "technology",
      confidence: 0.8,
      summary: "a summary",
      provider: "mock",
      model: "mock-analyzer-v1",
      promptVersion: "analysis.v1",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(response.body.analyses[0].inputText).toBeUndefined();
    expect(mockListAnalysesForUser).toHaveBeenCalledWith(USER_ID, 20, 0);
  });

  it("honors limit/offset query params", async () => {
    const app = createApp();
    const token = signToken();
    mockListAnalysesForUser.mockResolvedValue([]);

    const response = await request(app)
      .get("/analyses?limit=5&offset=10")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.limit).toBe(5);
    expect(response.body.offset).toBe(10);
    expect(mockListAnalysesForUser).toHaveBeenCalledWith(USER_ID, 5, 10);
  });

  it("returns 400 when limit exceeds the max of 100", async () => {
    const app = createApp();
    const token = signToken();

    const response = await request(app).get("/analyses?limit=101").set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(400);
    expect(mockListAnalysesForUser).not.toHaveBeenCalled();
  });
});

describe("GET /analyses/:id", () => {
  it("returns 401 without a token", async () => {
    const app = createApp();

    const response = await request(app).get(`/analyses/${ANALYSIS_ID}`);

    expect(response.status).toBe(401);
  });

  it("returns 200 with full detail INCLUDING inputText", async () => {
    const app = createApp();
    const token = signToken();
    mockFindAnalysisByIdForUser.mockResolvedValue(fakeAnalysisRecord());

    const response = await request(app)
      .get(`/analyses/${ANALYSIS_ID}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.analysis.inputText).toBe("some input text");
    expect(response.body.analysis.id).toBe(ANALYSIS_ID);
    expect(mockFindAnalysisByIdForUser).toHaveBeenCalledWith(ANALYSIS_ID, USER_ID);
  });

  it("returns 404 for another user's row (no existence leak)", async () => {
    const app = createApp();
    const token = signToken(OTHER_USER_ID);
    mockFindAnalysisByIdForUser.mockResolvedValue(null);

    const response = await request(app)
      .get(`/analyses/${ANALYSIS_ID}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "Not found" });
    expect(mockFindAnalysisByIdForUser).toHaveBeenCalledWith(ANALYSIS_ID, OTHER_USER_ID);
  });

  it("returns 404 for a malformed id instead of a DB error", async () => {
    const app = createApp();
    const token = signToken();

    const response = await request(app).get("/analyses/not-a-uuid").set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(404);
    expect(mockFindAnalysisByIdForUser).not.toHaveBeenCalled();
  });
});

describe("rate limiting on /analyze", () => {
  it("returns 429 on the 3rd request within the window when the limit is 2/min", async () => {
    const app = express();
    app.use(express.json());
    app.use(createAnalysisRouter({ analyzeRateLimitPerMin: 2 }));
    const token = signToken();
    mockCreateAnalysis.mockResolvedValue(fakeAnalysisRecord());
    const body = { text: "A short but valid piece of text to analyze." };

    const first = await request(app).post("/analyze").set("Authorization", `Bearer ${token}`).send(body);
    const second = await request(app).post("/analyze").set("Authorization", `Bearer ${token}`).send(body);
    const third = await request(app).post("/analyze").set("Authorization", `Bearer ${token}`).send(body);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(third.status).toBe(429);
    expect(third.body).toEqual({ error: "Too many requests, please slow down." });
  });
});
