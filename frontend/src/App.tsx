import { useEffect, useState } from "react";
import "./App.css";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

type HealthResponse = {
  status: string;
  db: "connected" | "disconnected";
};

type HealthState =
  | { kind: "loading" }
  | { kind: "success"; health: HealthResponse }
  | { kind: "error" };

function App() {
  const [state, setState] = useState<HealthState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function fetchHealth() {
      try {
        const response = await fetch(`${API_URL}/health`);
        if (!response.ok) {
          throw new Error(`Unexpected status ${response.status}`);
        }
        const health = (await response.json()) as HealthResponse;
        if (!cancelled) {
          setState({ kind: "success", health });
        }
      } catch {
        if (!cancelled) {
          setState({ kind: "error" });
        }
      }
    }

    void fetchHealth();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="app">
      <h1>AI Text Analyzer</h1>
      {state.kind === "loading" && <p>Checking backend…</p>}
      {state.kind === "success" && (
        <p>
          Backend: {state.health.status} · DB: {state.health.db}
        </p>
      )}
      {state.kind === "error" && <p>Backend unreachable</p>}
    </main>
  );
}

export default App;
