// Mirrors the backend's JSON response shapes (camelCase, as sent over the
// wire). Deliberately hand-written instead of importing backend code —
// frontend and backend are separate deployables in this monorepo.

export interface AuthUser {
  id: string;
  email: string;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export interface MeResponse {
  user: AuthUser;
}

export type AnalysisStatus = "completed" | "failed";

export interface AnalysisDetail {
  id: string;
  status: AnalysisStatus;
  inputText: string;
  summary: string | null;
  category: string | null;
  confidence: number | null;
  keyPoints: string[];
  warnings: string[];
  provider: string;
  model: string;
  promptVersion: string;
  tokensIn: number | null;
  tokensOut: number | null;
  createdAt: string;
}

export interface AnalyzeResponse {
  analysis: AnalysisDetail;
}

export interface GetAnalysisResponse {
  analysis: AnalysisDetail;
}

export interface HealthResponse {
  status: string;
  db: "connected" | "disconnected";
}

export interface ApiErrorBody {
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
}
