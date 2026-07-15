import type { ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import "./App.css";
import { useAuth } from "./auth/AuthContext";
import { StatusFooter } from "./components/StatusFooter";
import { TopBar } from "./components/TopBar";
import { AnalyzePage } from "./pages/AnalyzePage";
import { HistoryPage } from "./pages/HistoryPage";
import { LoginPage } from "./pages/LoginPage";
import { ResultsPage } from "./pages/ResultsPage";

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === "loading") {
    return (
      <main className="app-shell">
        <p>Loading…</p>
      </main>
    );
  }

  if (status === "anonymous") {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return (
    <>
      <TopBar />
      <main className="app-shell">{children}</main>
    </>
  );
}

function RootRedirect() {
  const { status } = useAuth();

  if (status === "loading") {
    return (
      <main className="app-shell">
        <p>Loading…</p>
      </main>
    );
  }

  return <Navigate to={status === "authenticated" ? "/analyze" : "/login"} replace />;
}

function App() {
  return (
    <div className="app">
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/analyze"
          element={
            <ProtectedRoute>
              <AnalyzePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/results/:id"
          element={
            <ProtectedRoute>
              <ResultsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/history"
          element={
            <ProtectedRoute>
              <HistoryPage />
            </ProtectedRoute>
          }
        />
        <Route path="/" element={<RootRedirect />} />
        <Route path="*" element={<RootRedirect />} />
      </Routes>
      <StatusFooter />
    </div>
  );
}

export default App;
