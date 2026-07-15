import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError, getAnalysis, reportAnalysis } from "../api/client";
import type { AnalysisDetail } from "../api/types";
import { ConfidenceBadge } from "../components/ConfidenceBadge";
import { ErrorBanner } from "../components/ErrorBanner";
import { WarningsBanner } from "../components/WarningsBanner";

type LoadState =
  | { kind: "loading" }
  | { kind: "not-found" }
  | { kind: "error"; message: string }
  | { kind: "success"; analysis: AnalysisDetail };

function formatCategory(category: string): string {
  return category.charAt(0).toUpperCase() + category.slice(1);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

export function ResultsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [justReported, setJustReported] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setState({ kind: "loading" });

    getAnalysis(id)
      .then((res) => {
        if (!cancelled) setState({ kind: "success", analysis: res.analysis });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setState({ kind: "not-found" });
        } else {
          setState({ kind: "error", message: err instanceof ApiError ? err.message : "Something went wrong." });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  async function submitReport() {
    if (state.kind !== "success") return;
    setReportSubmitting(true);
    setReportError(null);
    try {
      const res = await reportAnalysis(state.analysis.id);
      setState({ kind: "success", analysis: res.analysis });
      setJustReported(true);
    } catch (err) {
      setReportError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setReportSubmitting(false);
    }
  }

  if (state.kind === "loading") {
    return <p>Loading analysis…</p>;
  }

  if (state.kind === "not-found") {
    return (
      <div className="results-page">
        <p>Analysis not found.</p>
        <Link to="/analyze">Back to analyze</Link>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="results-page">
        <p>{state.message}</p>
        <Link to="/analyze">Back to analyze</Link>
      </div>
    );
  }

  const { analysis } = state;
  const isReported = analysis.reportedAt !== null;

  return (
    <div className="results-page">
      <h1>Analysis result</h1>

      {analysis.status === "failed" ? (
        <p>This analysis did not complete successfully.</p>
      ) : (
        <>
          {analysis.summary && <p className="summary">{analysis.summary}</p>}

          <div className="result-meta-row">
            {analysis.category && <span className="chip">{formatCategory(analysis.category)}</span>}
            {analysis.confidence !== null && <ConfidenceBadge confidence={analysis.confidence} />}
          </div>

          <h2>Key points</h2>
          <ul>
            {analysis.keyPoints.map((point, index) => (
              <li key={`${index}-${point}`}>{point}</li>
            ))}
          </ul>

          <WarningsBanner warnings={analysis.warnings} />
        </>
      )}

      <p className="disclaimer">AI-generated analysis — it may contain errors. Review before relying on it.</p>

      <div className="report-action">
        <button
          type="button"
          className="report-btn"
          onClick={() => void submitReport()}
          disabled={reportSubmitting || isReported}
        >
          {isReported ? "Reported" : reportSubmitting ? "Reporting…" : "Report this result"}
        </button>
        {justReported && isReported && (
          <p className="report-confirmation">Reported — thank you. This helps us review model quality.</p>
        )}
        {reportError && <ErrorBanner message={reportError} />}
      </div>

      <p className="metadata-row">
        {analysis.provider} · {analysis.model} · {analysis.promptVersion} · tokens in/out:{" "}
        {analysis.tokensIn ?? "—"}/{analysis.tokensOut ?? "—"} · {formatDate(analysis.createdAt)}
      </p>

      <details>
        <summary>Show analyzed text</summary>
        <p>{analysis.inputText}</p>
      </details>

      <div className="results-actions">
        <button type="button" onClick={() => navigate("/analyze", { state: { text: analysis.inputText } })}>
          Edit &amp; re-run
        </button>
        <button type="button" onClick={() => navigate("/analyze")}>
          New analysis
        </button>
      </div>
    </div>
  );
}
