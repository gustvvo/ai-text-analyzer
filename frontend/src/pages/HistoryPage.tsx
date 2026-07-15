import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, listAnalyses } from "../api/client";
import type { AnalysisListItem } from "../api/types";
import { ErrorBanner } from "../components/ErrorBanner";

const PAGE_SIZE = 20;
const SUMMARY_TRUNCATE_LENGTH = 140;

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "loaded" };

function formatCategory(category: string): string {
  return category.charAt(0).toUpperCase() + category.slice(1);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

function truncateSummary(summary: string | null): string {
  if (!summary) return "—";
  if (summary.length <= SUMMARY_TRUNCATE_LENGTH) return summary;
  return `${summary.slice(0, SUMMARY_TRUNCATE_LENGTH).trimEnd()}…`;
}

export function HistoryPage() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [items, setItems] = useState<AnalysisListItem[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });

    listAnalyses(PAGE_SIZE, 0)
      .then((res) => {
        if (cancelled) return;
        setItems(res.analyses);
        setOffset(res.analyses.length);
        setHasMore(res.analyses.length === PAGE_SIZE);
        setState({ kind: "loaded" });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({ kind: "error", message: err instanceof ApiError ? err.message : "Something went wrong." });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function loadMore() {
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const res = await listAnalyses(PAGE_SIZE, offset);
      setItems((prev) => [...prev, ...res.analyses]);
      setOffset((prev) => prev + res.analyses.length);
      setHasMore(res.analyses.length === PAGE_SIZE);
    } catch (err) {
      setLoadMoreError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setLoadingMore(false);
    }
  }

  if (state.kind === "loading") {
    return (
      <div className="history-page">
        <h1>History</h1>
        <p>Loading your analyses…</p>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="history-page">
        <h1>History</h1>
        <ErrorBanner message={state.message} />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="history-page">
        <h1>History</h1>
        <p>No analyses yet — analyze your first text.</p>
        <Link to="/analyze">Analyze text</Link>
      </div>
    );
  }

  return (
    <div className="history-page">
      <h1>History</h1>

      <div className="history-table" role="table">
        <div className="history-table__row history-table__row--header" role="row">
          <span role="columnheader">Date</span>
          <span role="columnheader">Category</span>
          <span role="columnheader">Status</span>
          <span role="columnheader">Summary</span>
          <span role="columnheader" />
        </div>
        {items.map((item) => (
          <div className="history-table__row" role="row" key={item.id}>
            <span className="history-table__date" role="cell">
              {formatDate(item.createdAt)}
            </span>
            <span role="cell">{item.category ? <span className="chip">{formatCategory(item.category)}</span> : "—"}</span>
            <span role="cell">
              <span className={`status-badge status-badge--${item.status}`}>{item.status}</span>
            </span>
            <span className="history-table__summary" role="cell">
              {truncateSummary(item.summary)}
            </span>
            <span role="cell">
              <Link to={`/results/${item.id}`}>View</Link>
            </span>
          </div>
        ))}
      </div>

      {hasMore && (
        <div>
          <button type="button" className="load-more-btn" onClick={() => void loadMore()} disabled={loadingMore}>
            {loadingMore ? "Loading…" : "Load more"}
          </button>
          {loadMoreError && <ErrorBanner message={loadMoreError} />}
        </div>
      )}
    </div>
  );
}
