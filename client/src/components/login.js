import React, { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import "../styles/login.css";

const API_BASE = "http://127.0.0.1:5000/api";


function AuthArt() {
  const pts = [[60,60],[150,30],[240,70],[320,40],[90,140],[180,120],[270,150],[340,120],[40,220],[130,210],[220,230],[310,215]];
  const links = [[0,1],[1,2],[2,3],[0,4],[1,5],[2,5],[2,6],[3,7],[4,5],[5,6],[6,7],[4,8],[5,9],[6,10],[7,11],[8,9],[9,10],[10,11]];
  return (
    <svg viewBox="0 0 380 260" className="auth-art" aria-hidden="true">
      {links.map(([a, b], i) => (
        <line key={i} x1={pts[a][0]} y1={pts[a][1]} x2={pts[b][0]} y2={pts[b][1]} className="auth-art-link" style={{ animationDelay: `${i * 0.15}s` }} />
      ))}
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i === 5 ? 7 : 4} className={i === 5 ? "auth-art-hub" : "auth-art-node"} style={{ animationDelay: `${i * 0.2}s` }} />
      ))}
    </svg>
  );
}

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const registered = location.state && location.state.registered;
  const [form, setForm] = useState({ identifier: registered || "", password: "" });
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
      let json = {};
      try {
        json = await res.json();
      } catch (e) {
        json = {};
      }
      if (!res.ok || json.success === false) {
        throw new Error(json.message || json.msg || json.error || "Login failed.");
      }
      const payload = json.data || json;
      const token = payload.access_token || payload.token || payload.accessToken;
      if (!token) throw new Error("Login succeeded but the server sent no access token.");
      localStorage.setItem("archify_token", token);
      localStorage.setItem("archify_user", JSON.stringify(payload.user || {}));
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
        <AuthArt />
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

          {registered && !error && (
            <div className="auth-success">Account created — log in to continue.</div>
          )}
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