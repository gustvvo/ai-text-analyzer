import { NavLink } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export function TopBar() {
  const { user, logout } = useAuth();

  return (
    <header className="top-bar">
      <span className="top-bar__brand">AI Text Analyzer</span>
      {user && (
        <nav className="top-bar__nav">
          <NavLink to="/analyze" className={({ isActive }) => (isActive ? "top-bar__link top-bar__link--active" : "top-bar__link")}>
            Analyze
          </NavLink>
          <NavLink to="/history" className={({ isActive }) => (isActive ? "top-bar__link top-bar__link--active" : "top-bar__link")}>
            History
          </NavLink>
        </nav>
      )}
      {user && <span className="top-bar__email">{user.email}</span>}
      <button type="button" className="top-bar__logout" onClick={logout}>
        Logout
      </button>
    </header>
  );
}
