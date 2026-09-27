import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "../styles/signup.css";

const API_BASE = "http://127.0.0.1:5000/api";

export default function Signup() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: "", email: "", password: "", confirm: "" });
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

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
      const json = await res.json();
      if (!res.ok || !json.success) {
        setFieldErrors(json.details || {});
        setError(json.message || "Signup failed.");
        return;
      }
      setSuccess(true);
      setTimeout(() => navigate("/login", { replace: true }), 1200);
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
          {success && <div className="auth-success">Account created. Redirecting to login...</div>}

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

          <button className="btn btn-primary auth-button" type="submit" disabled={loading}>
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