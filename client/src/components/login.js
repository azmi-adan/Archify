import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "../styles/login.css";

const API_BASE = "http://127.0.0.1:5000/api";

export default function Login() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ identifier: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || "Login failed.");
      }
      localStorage.setItem("archify_token", json.data.access_token);
      localStorage.setItem("archify_user", JSON.stringify(json.data.user));
      navigate("/home", { replace: true });
    } catch (err) {
      setError(err.message || "Unable to reach the server.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-screen">
      <aside className="auth-brand">
        <Link to="/" className="auth-brand-mark">
          <span>A</span>Archify
        </Link>
        <div className="auth-brand-copy">
          <h2>Every design, versioned and explained.</h2>
          <p>
            Requirements in, a complete network architecture out — VLANs, IP plan, hardware and a
            failure analysis you can hand straight to a build team.
          </p>
        </div>
        <div className="auth-brand-grid mono">
          <span>VLAN_SEGMENTATION</span>
          <span>VLSM / FLSM</span>
          <span>COST_MODEL</span>
          <span>SPOF_ANALYSIS</span>
        </div>
      </aside>

      <main className="auth-main">
        <form className="auth-card" onSubmit={handleSubmit}>
          <h1 className="auth-title">Welcome back</h1>
          <p className="auth-subtitle">Log in to continue designing with Archify.</p>

          {error && <div className="auth-error">{error}</div>}

          <label className="auth-label">
            Username or email
            <input
              className="auth-input"
              name="identifier"
              type="text"
              value={form.identifier}
              onChange={handleChange}
              autoComplete="username"
              required
            />
          </label>

          <label className="auth-label">
            Password
            <input
              className="auth-input"
              name="password"
              type="password"
              value={form.password}
              onChange={handleChange}
              autoComplete="current-password"
              required
            />
          </label>

          <button className="btn btn-primary auth-button" type="submit" disabled={loading}>
            {loading ? "Logging in..." : "Log in"}
          </button>

          <p className="auth-switch">
            Don't have an account? <Link to="/signup">Create one</Link>
          </p>
        </form>
      </main>
    </div>
  );
}