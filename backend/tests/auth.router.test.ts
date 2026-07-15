import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { config } from "../src/config.js";
import { DuplicateEmailError, createUser, findUserByEmail } from "../src/users/user.repository.js";

vi.mock("../src/users/user.repository.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/users/user.repository.js")>();
  return {
    ...actual,
    createUser: vi.fn(),
    findUserByEmail: vi.fn(),
  };
});

const mockCreateUser = vi.mocked(createUser);
const mockFindUserByEmail = vi.mocked(findUserByEmail);

const STORED_USER = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "jane@example.com",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};
const STORED_PASSWORD = "correct-password";

beforeEach(() => {
  mockCreateUser.mockReset();
  mockFindUserByEmail.mockReset();
});

describe("POST /auth/register", () => {
  it("returns 201 with a token and the user on success", async () => {
    const app = createApp();
    mockCreateUser.mockResolvedValue(STORED_USER);

    const response = await request(app)
      .post("/auth/register")
      .send({ email: STORED_USER.email, password: "password123" });

    expect(response.status).toBe(201);
    expect(response.body.user).toEqual({ id: STORED_USER.id, email: STORED_USER.email });
    expect(typeof response.body.token).toBe("string");

    const decoded = jwt.verify(response.body.token, config.JWT_SECRET);
    if (typeof decoded === "string") throw new Error("expected object payload");
    expect(decoded.sub).toBe(STORED_USER.id);
    expect(decoded.email).toBe(STORED_USER.email);

    expect(mockCreateUser).toHaveBeenCalledTimes(1);
    const [, passwordHash] = mockCreateUser.mock.calls[0] ?? [];
    expect(passwordHash).not.toBe("password123");
  });

  it("returns 409 when the email is already registered", async () => {
    const app = createApp();
    mockCreateUser.mockRejectedValue(new DuplicateEmailError(STORED_USER.email));

    const response = await request(app)
      .post("/auth/register")
      .send({ email: STORED_USER.email, password: "password123" });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: "Email already registered" });
  });

  it("returns 400 with field errors for a weak password, without touching the repository", async () => {
    const app = createApp();

    const response = await request(app)
      .post("/auth/register")
      .send({ email: "someone@example.com", password: "short" });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Invalid input");
    expect(response.body.fieldErrors.password).toBeDefined();
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it("returns 400 with field errors for an invalid email", async () => {
    const app = createApp();

    const response = await request(app)
      .post("/auth/register")
      .send({ email: "not-an-email", password: "password123" });

    expect(response.status).toBe(400);
    expect(response.body.fieldErrors.email).toBeDefined();
    expect(mockCreateUser).not.toHaveBeenCalled();
  });
});

describe("POST /auth/login", () => {
  it("returns 200 with a token that verifies with JWT_SECRET on success", async () => {
    const app = createApp();
    const passwordHash = await bcrypt.hash(STORED_PASSWORD, 10);
    mockFindUserByEmail.mockResolvedValue({ ...STORED_USER, passwordHash });

    const response = await request(app)
      .post("/auth/login")
      .send({ email: STORED_USER.email, password: STORED_PASSWORD });

    expect(response.status).toBe(200);
    expect(response.body.user).toEqual({ id: STORED_USER.id, email: STORED_USER.email });

    const decoded = jwt.verify(response.body.token, config.JWT_SECRET);
    if (typeof decoded === "string") throw new Error("expected object payload");
    expect(decoded.sub).toBe(STORED_USER.id);
    expect(decoded.email).toBe(STORED_USER.email);
  });

  it("returns an identical 401 body for an unknown email and a wrong password (no user enumeration)", async () => {
    const app = createApp();
    const passwordHash = await bcrypt.hash(STORED_PASSWORD, 10);

    mockFindUserByEmail.mockResolvedValueOnce(null);
    const unknownEmailResponse = await request(app)
      .post("/auth/login")
      .send({ email: "nobody@example.com", password: STORED_PASSWORD });

    mockFindUserByEmail.mockResolvedValueOnce({ ...STORED_USER, passwordHash });
    const wrongPasswordResponse = await request(app)
      .post("/auth/login")
      .send({ email: STORED_USER.email, password: "totally-wrong" });

    expect(unknownEmailResponse.status).toBe(401);
    expect(wrongPasswordResponse.status).toBe(401);
    expect(unknownEmailResponse.body).toEqual({ error: "Invalid credentials" });
    expect(wrongPasswordResponse.body).toEqual(unknownEmailResponse.body);
  });
});

describe("GET /auth/me", () => {
  function signToken(overrides: { expiresIn?: string } = {}): string {
    return jwt.sign({ email: STORED_USER.email }, config.JWT_SECRET, {
      subject: STORED_USER.id,
      expiresIn: (overrides.expiresIn ?? config.JWT_EXPIRES_IN) as jwt.SignOptions["expiresIn"],
    });
  }

  it("returns 200 with the authenticated user for a valid token", async () => {
    const app = createApp();
    const token = signToken();

    const response = await request(app).get("/auth/me").set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ user: { id: STORED_USER.id, email: STORED_USER.email } });
  });

  it("returns 401 when no Authorization header is present", async () => {
    const app = createApp();

    const response = await request(app).get("/auth/me");

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "Unauthorized" });
  });

  it("returns 401 for a garbage token", async () => {
    const app = createApp();

    const response = await request(app).get("/auth/me").set("Authorization", "Bearer not-a-real-token");

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "Unauthorized" });
  });

  it("returns 401 for an expired token", async () => {
    const app = createApp();
    const token = signToken({ expiresIn: "-1s" });

    const response = await request(app).get("/auth/me").set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "Unauthorized" });
  });
});
