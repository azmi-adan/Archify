import React, { useEffect, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import "../styles/navbar.css";

const API_BASE = "http://127.0.0.1:5000/api";

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem("archify_token");
    if (!token) return;

    fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((json) => {
        if (json.success) {
          setUser(json.data.user);
          localStorage.setItem("archify_user", JSON.stringify(json.data.user));
        } else {
          localStorage.removeItem("archify_token");
          navigate("/login", { replace: true });
        }
      })
      .catch(() => {});
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem("archify_token");
    localStorage.removeItem("archify_user");
    navigate("/login", { replace: true });
  };

  const initial = user && user.username ? user.username.charAt(0).toUpperCase() : "?";

  return (
    <nav className="navbar">
      <Link to="/home" className="navbar-brand">
        <span className="navbar-brand-mark">A</span>
        Archify
      </Link>
      <div className="navbar-links">
        <Link to="/home" className={`navbar-link ${location.pathname === "/home" ? "navbar-link-active" : ""}`}>
          Organizations
        </Link>
      </div>
      <div className="navbar-user">
        {user && (
          <span className="navbar-user-chip">
            <span className="navbar-avatar mono">{initial}</span>
            {user.username}
          </span>
        )}
        <button className="btn btn-ghost navbar-logout" onClick={handleLogout}>
          Log out
        </button>
      </div>
    </nav>
  );
}