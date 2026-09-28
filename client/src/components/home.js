import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/home.css";

const API_BASE = "http://127.0.0.1:5000/api";
const ORG_TYPES = [
  "enterprise", "office", "school", "university", "hospital", "financial",
  "government", "retail", "manufacturing", "hospitality", "ngo", "other",
];

function authHeaders() {
  const token = localStorage.getItem("archify_token");
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}


function ProgressRing({ pct }) {
  const size = 56, stroke = 6, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="ring-svg" aria-label={`${pct}% complete`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-raised)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--emerald)" strokeWidth={stroke}
        strokeDasharray={`${(pct / 100) * c} ${c}`} strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="54%" textAnchor="middle" className="ring-text">{pct}%</text>
    </svg>
  );
}

function MiniTopo({ active }) {
  return (
    <svg viewBox="0 0 120 50" className={`mini-topo ${active ? "mini-topo-active" : ""}`} aria-hidden="true">
      <line x1="60" y1="8" x2="25" y2="26" /><line x1="60" y1="8" x2="95" y2="26" />
      <line x1="25" y1="26" x2="10" y2="44" /><line x1="25" y1="26" x2="40" y2="44" />
      <line x1="95" y1="26" x2="80" y2="44" /><line x1="95" y1="26" x2="110" y2="44" />
      <circle cx="60" cy="8" r="4" /><circle cx="25" cy="26" r="3" /><circle cx="95" cy="26" r="3" />
      <circle cx="10" cy="44" r="2.5" /><circle cx="40" cy="44" r="2.5" /><circle cx="80" cy="44" r="2.5" /><circle cx="110" cy="44" r="2.5" />
    </svg>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", organization_type: "other", description: "" });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const loadOrgs = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/organizations`, { headers: authHeaders() });
      if (res.status === 401 || res.status === 422) {
        localStorage.removeItem("archify_token");
        navigate("/login", { replace: true });
        return;
      }
      const json = await res.json();
      if (!json.success) throw new Error(json.message);
      setOrgs(json.data.organizations);
    } catch (err) {
      setError(err.message || "Could not load organizations.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrgs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFormError("");
    try {
      const res = await fetch(`${API_BASE}/organizations`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!json.success) {
        setFormError(json.message || "Could not create organization.");
        return;
      }
      setShowForm(false);
      setForm({ name: "", organization_type: "other", description: "" });
      navigate(`/organizations/${json.data.organization.id}`);
    } catch (err) {
      setFormError("Could not reach the server.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this organization and everything under it?")) return;
    try {
      const res = await fetch(`${API_BASE}/organizations/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      const json = await res.json();
      if (json.success) setOrgs((prev) => prev.filter((o) => o.id !== id));
    } catch (err) {
      // keep list as-is on failure
    }
  };

  const withDesign = orgs.filter((o) => o.has_design).length;
  const withRequirements = orgs.filter((o) => o.has_requirements).length;

  return (
    <div className="home-screen">
      <div className="home-header">
        <div>
          <span className="eyebrow">Workspace</span>
          <h1 className="home-title">Your <span className="glow-text">organizations</span></h1>
          <p className="home-subtitle">
            Each organization has its own requirements, generated design and dashboard.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Cancel" : "+ New organization"}
        </button>
      </div>

      {orgs.length > 0 && (
        <div className="home-stats">
          <div className="home-stat panel">
            <span className="home-stat-value mono">{orgs.length}</span>
            <span className="home-stat-label">Organizations</span>
          </div>
          <div className="home-stat panel">
            <span className="home-stat-value mono">{withRequirements}</span>
            <span className="home-stat-label">Requirements defined</span>
          </div>
          <div className="home-stat panel">
            <span className="home-stat-value mono">{withDesign}</span>
            <span className="home-stat-label">Designs generated</span>
          </div>
        </div>
      )}

      {showForm && (
        <form className="home-form panel" onSubmit={handleCreate}>
          {formError && <div className="auth-error">{formError}</div>}
          <div className="home-form-row">
            <label>
              Name
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </label>
            <label>
              Type
              <select
                value={form.organization_type}
                onChange={(e) => setForm({ ...form, organization_type: e.target.value })}
              >
                {ORG_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Description (optional)
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
            />
          </label>
          <button type="submit" className="btn btn-primary home-save-btn" disabled={saving}>
            {saving ? "Creating..." : "Create organization"}
          </button>
        </form>
      )}

      {loading && <p className="status-text">Loading organizations...</p>}
      {error && <p className="status-text status-text-error">{error}</p>}
      {!loading && !error && orgs.length === 0 && (
        <div className="home-empty panel">
          <p>No organizations yet. Create your first one to generate a network design.</p>
        </div>
      )}

      <div className="home-grid">
        {orgs.map((org) => (
          <div key={org.id} className="org-card panel" onClick={() => navigate(`/organizations/${org.id}`)}>
            <MiniTopo active={org.has_design} />
            <div className="org-card-top">
              <div>
                <h2>{org.name}</h2>
                <span className="badge">{org.organization_type}</span>
              </div>
              <ProgressRing pct={org.has_design ? 100 : org.has_requirements ? 50 : 10} />
            </div>
            {org.description && <p className="org-card-desc">{org.description}</p>}
            <div className="org-card-status">
              <span className={`status-dot ${org.has_requirements ? "status-dot-done" : ""}`}>Requirements</span>
              <span className={`status-dot ${org.has_design ? "status-dot-done" : ""}`}>
                Design{org.design_version ? ` v${org.design_version}` : ""}
              </span>
            </div>
            <button
              className="btn btn-danger org-card-delete"
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(org.id);
              }}
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}