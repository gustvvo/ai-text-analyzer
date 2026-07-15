import { useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { analyze, ApiError } from "../api/client";
import { ErrorBanner } from "../components/ErrorBanner";

const MAX_LENGTH = 15000;

interface AnalyzeLocationState {
  text?: string;
}

export function AnalyzePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [text, setText] = useState(() => (location.state as AnalyzeLocationState | null)?.text ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const length = text.length;
  const isOverLimit = length > MAX_LENGTH;
  const isEmpty = text.trim().length === 0;
  const canSubmit = !isEmpty && !isOverLimit && !submitting;

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const { analysis } = await analyze(text);
      navigate(`/results/${analysis.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit();
  }

  return (
    <div className="analyze-page">
      <h1>Analyze text</h1>
      <p className="intro">
        Paste any text below and the AI will summarize it, tag its category, and flag anything it
        isn&apos;t confident about.
      </p>

      <form onSubmit={handleSubmit}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={submitting}
          rows={12}
          placeholder="Paste or type the text you want analyzed…"
          aria-label="Text to analyze"
        />
        <div className={isOverLimit ? "char-counter char-counter--over" : "char-counter"}>
          {length.toLocaleString()} / {MAX_LENGTH.toLocaleString()}
        </div>

        {submitting && <p className="status-line">Analyzing with AI — this usually takes a few seconds…</p>}

        {error && (
          <div className="error-actions">
            <ErrorBanner message={error} />
            <button type="button" onClick={() => void submit()} disabled={submitting}>
              Try again
            </button>
          </div>
        )}

        <button type="submit" disabled={!canSubmit}>
          {submitting ? "Analyzing…" : "Analyze"}
        </button>
      </form>
    </div>
  );
}
