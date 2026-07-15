import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { ErrorBanner } from "../components/ErrorBanner";

type Mode = "sign-in" | "create-account";

export function LoginPage() {
  const { status, login, register } = useAuth();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === "loading") {
    return (
      <main className="app-shell auth-shell">
        <p>Loading…</p>
      </main>
    );
  }

  if (status === "authenticated") {
    return <Navigate to="/analyze" replace />;
  }

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (mode === "sign-in") {
        await login(email, password);
      } else {
        await register(email, password);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="app-shell auth-shell">
      <h1>AI Text Analyzer</h1>

      <div className="auth-toggle" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "sign-in"}
          className={mode === "sign-in" ? "toggle-btn toggle-btn--active" : "toggle-btn"}
          onClick={() => switchMode("sign-in")}
          disabled={submitting}
        >
          Sign in
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "create-account"}
          className={mode === "create-account" ? "toggle-btn toggle-btn--active" : "toggle-btn"}
          onClick={() => switchMode("create-account")}
          disabled={submitting}
        >
          Create account
        </button>
      </div>

      {mode === "sign-in" && (
        <p className="hint">
          Demo account: <code>demo@example.com</code> / <code>demo1234</code>
        </p>
      )}

      <form onSubmit={(e) => void handleSubmit(e)} className="auth-form">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={submitting}
        />

        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          required
          minLength={mode === "create-account" ? 8 : undefined}
          autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={submitting}
        />
        {mode === "create-account" && <p className="field-hint">At least 8 characters.</p>}

        {error && <ErrorBanner message={error} />}

        <button type="submit" disabled={submitting}>
          {submitting ? "Please wait…" : mode === "sign-in" ? "Sign in" : "Create account"}
        </button>
      </form>
    </main>
  );
}
