import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "../styles/signup.css";

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

export default function Signup() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: "", email: "", password: "", confirm: "" });
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  // After a successful signup, go to the login page (with the username prefilled).
  useEffect(() => {
    if (!success) return undefined;
    const t = setTimeout(
      () => navigate("/login", { replace: true, state: { registered: form.username } }),
      1000
    );
    return () => clearTimeout(t);
  }, [success, navigate, form.username]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setFieldErrors({});

    if (form.password !== form.confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: form.username,
          email: form.email,
          password: form.password,
        }),
      });
      let json = {};
      try {
        json = await res.json();
      } catch (e) {
        json = {};
      }
      if (!res.ok || json.success === false) {
        setFieldErrors(json.details || {});
        setError(json.message || json.msg || json.error || "Signup failed.");
        return;
      }
      setSuccess(true);
    } catch (err) {
      setError("Could not reach the server.");
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
          <h2>Set up once, regenerate as requirements change.</h2>
          <p>
            Edit a requirement and Archify re-runs the engine — the dashboard always reflects the
            current design, with the previous version kept for comparison.
          </p>
        </div>
        <ul className="auth-brand-list">
          <li>Unlimited organizations</li>
          <li>Versioned design history</li>
          <li>Cost estimates by hardware category</li>
        </ul>
      </aside>

      <main className="auth-main">
        <form className="auth-card" onSubmit={handleSubmit}>
          <h1 className="auth-title">Create your account</h1>
          <p className="auth-subtitle">Start designing network architectures with Archify.</p>

          {error && <div className="auth-error">{error}</div>}
          {success && (
            <div className="auth-success">
              Account created. Redirecting to login... <Link to="/login" state={{ registered: form.username }}>Log in now</Link>
            </div>
          )}

          <label className="auth-label">
            Username
            <input className="auth-input" name="username" value={form.username} onChange={handleChange} required />
            {fieldErrors.username && <span className="auth-field-error">{fieldErrors.username}</span>}
          </label>

          <label className="auth-label">
            Email
            <input className="auth-input" name="email" type="email" value={form.email} onChange={handleChange} required />
            {fieldErrors.email && <span className="auth-field-error">{fieldErrors.email}</span>}
          </label>

          <label className="auth-label">
            Password
            <input className="auth-input" name="password" type="password" value={form.password} onChange={handleChange} required />
            {fieldErrors.password && <span className="auth-field-error">{fieldErrors.password}</span>}
          </label>

          <label className="auth-label">
            Confirm password
            <input className="auth-input" name="confirm" type="password" value={form.confirm} onChange={handleChange} required />
          </label>

          <button className="btn btn-primary auth-button" type="submit" disabled={loading || success}>
            {loading ? "Creating account..." : "Sign up"}
          </button>

          <p className="auth-switch">
            Already have an account? <Link to="/login">Log in</Link>
          </p>
        </form>
      </main>
    </div>
  );
}