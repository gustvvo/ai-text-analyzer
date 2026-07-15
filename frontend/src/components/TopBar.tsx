import { useAuth } from "../auth/AuthContext";

export function TopBar() {
  const { user, logout } = useAuth();

  return (
    <header className="top-bar">
      <span className="top-bar__brand">AI Text Analyzer</span>
      {user && <span className="top-bar__email">{user.email}</span>}
      <button type="button" className="top-bar__logout" onClick={logout}>
        Logout
      </button>
    </header>
  );
}
