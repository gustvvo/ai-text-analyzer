import { useEffect, useState } from "react";
import { health } from "../api/client";

type HealthState = { kind: "loading" } | { kind: "connected" } | { kind: "db-down" } | { kind: "unreachable" };

const LABELS: Record<HealthState["kind"], string> = {
  loading: "Checking API…",
  connected: "API: connected",
  "db-down": "API: DB down",
  unreachable: "API: unreachable",
};

export function StatusFooter() {
  const [state, setState] = useState<HealthState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;

    health()
      .then((res) => {
        if (cancelled) return;
        setState(res.db === "connected" ? { kind: "connected" } : { kind: "db-down" });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "unreachable" });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <footer className="status-footer">
      <span className={`status-dot status-dot--${state.kind}`} aria-hidden="true" />
      {LABELS[state.kind]}
    </footer>
  );
}
