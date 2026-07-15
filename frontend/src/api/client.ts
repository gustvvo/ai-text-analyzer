import type {
  AnalyzeResponse,
  ApiErrorBody,
  AuthResponse,
  GetAnalysisResponse,
  HealthResponse,
  MeResponse,
} from "./types";

const API_URL: string = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

/**
 * Bearer token attached to every request. Set by AuthContext on
 * login/logout/bootstrap so this module never touches localStorage itself.
 */
let authToken: string | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
}

/**
 * Invoked when a request that WAS carrying a token comes back 401 — i.e. the
 * session died server-side (expired/invalid token), not a plain failed
 * login attempt (which also returns 401 but never carries a token).
 * AuthContext wires this up to clear the session and redirect to /login.
 */
let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

export class ApiError extends Error {
  status: number;
  fieldErrors?: Record<string, string[] | undefined>;

  constructor(message: string, status: number, fieldErrors?: Record<string, string[] | undefined>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

async function safeJson<T>(response: Response): Promise<T | undefined> {
  try {
    return (await response.json()) as T;
  } catch {
    return undefined;
  }
}

function normalizeErrorMessage(status: number, body: ApiErrorBody | undefined): string {
  if (status === 429) {
    return "Too many requests — wait a moment and try again.";
  }
  if (body?.error) {
    return body.error;
  }
  return "Something went wrong. Please try again.";
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const hadToken = authToken !== null;
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  if (authToken) {
    headers.set("Authorization", `Bearer ${authToken}`);
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...init, headers });
  } catch {
    throw new ApiError("Cannot reach the server", 0);
  }

  if (response.status === 401 && hadToken) {
    onUnauthorized?.();
  }

  if (!response.ok) {
    const body = await safeJson<ApiErrorBody>(response);
    throw new ApiError(normalizeErrorMessage(response.status, body), response.status, body?.fieldErrors);
  }

  return (await safeJson<T>(response)) as T;
}

export function register(email: string, password: string): Promise<AuthResponse> {
  return request<AuthResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function login(email: string, password: string): Promise<AuthResponse> {
  return request<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function me(): Promise<MeResponse> {
  return request<MeResponse>("/auth/me");
}

export function analyze(text: string): Promise<AnalyzeResponse> {
  return request<AnalyzeResponse>("/analyze", {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

export function getAnalysis(id: string): Promise<GetAnalysisResponse> {
  return request<GetAnalysisResponse>(`/analyses/${id}`);
}

export function health(): Promise<HealthResponse> {
  return request<HealthResponse>("/health");
}
