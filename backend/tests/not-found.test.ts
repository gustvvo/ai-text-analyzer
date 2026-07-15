import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

describe("unknown routes", () => {
  it("returns a JSON 404 instead of the default HTML error page", async () => {
    const app = createApp();

    const response = await request(app).get("/unknown");

    expect(response.status).toBe(404);
    expect(response.headers["content-type"]).toMatch(/json/);
    expect(response.body).toEqual({ error: "Not found" });
  });
});

describe("malformed request bodies", () => {
  it("returns a JSON 400 instead of a 500 when the body is not valid JSON", async () => {
    const app = createApp();

    const response = await request(app)
      .post("/auth/login")
      .set("content-type", "application/json")
      .send("{not json");

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "Invalid JSON body" });
  });
});
