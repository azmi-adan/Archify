import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import "../styles/organization.css";

const API_BASE = "http://127.0.0.1:5000/api";
const ORG_TYPES = [
  "enterprise", "office", "school", "university", "hospital", "financial",
  "government", "retail", "manufacturing", "hospitality", "ngo", "other",
];

function authHeaders() {
  const token = localStorage.getItem("archify_token");
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

export default function Organization() {
  const { orgId } = useParams();
  const navigate = useNavigate();
  const [org, setOrg] = useState(null);
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/organizations/${orgId}`, { headers: authHeaders() });
      const json = await res.json();
      if (res.status === 404) {
        setError("Organization not found.");
        return;
      }
      if (!json.success) throw new Error(json.message);
      setOrg(json.data.organization);
      setForm({
        name: json.data.organization.name,
        organization_type: json.data.organization.organization_type,
        description: json.data.organization.description || "",
      });
    } catch (err) {
      setError(err.message || "Could not load organization.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/organizations/${orgId}`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.message);
        return;
      }
      setOrg(json.data.organization);
      setEditing(false);
    } catch (err) {
      setError("Could not save changes.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("Delete this organization permanently?")) return;
    const res = await fetch(`${API_BASE}/organizations/${orgId}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    const json = await res.json();
    if (json.success) navigate("/home", { replace: true });
  };

  if (loading) return <p className="status-text">Loading...</p>;
  if (error) return <p className="status-text status-text-error">{error}</p>;
  if (!org) return null;

  const stepState = (done) => (done ? "done" : "pending");
  const steps = [
    {
      n: 1,
      title: "Requirements",
      status: stepState(org.has_requirements),
      detail: org.has_requirements ? "Defined — view or edit" : "Not defined yet",
      to: `/organizations/${orgId}/requirements`,
      disabled: false,
    },
    {
      n: 2,
      title: "Generation",
      status: stepState(org.has_design),
      detail: org.has_design ? `Design v${org.design_version} generated` : "Not generated yet",
      to: `/organizations/${orgId}/generation`,
      disabled: !org.has_requirements,
    },
    {
      n: 3,
      title: "Dashboard",
      status: stepState(org.has_design),
      detail: "View the full network design",
      to: `/organizations/${orgId}/dashboard`,
      disabled: !org.has_design,
    },
  ];

  return (
    <div className="org-screen">
      <Link to="/home" className="org-back">
        &larr; All organizations
      </Link>

      <div className="org-header panel">
        {!editing ? (
          <>
            <div>
              <h1>{org.name}</h1>
              <span className="badge">{org.organization_type}</span>
              {org.description && <p className="org-desc">{org.description}</p>}
            </div>
            <div className="org-actions">
              <button className="btn btn-ghost" onClick={() => setEditing(true)}>
                Edit
              </button>
              <button className="btn btn-danger" onClick={handleDelete}>
                Delete
              </button>
            </div>
          </>
        ) : (
          <form className="org-edit-form" onSubmit={handleSave}>
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
            <label>
              Description
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
              />
            </label>
            <div className="org-edit-actions">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="org-flow">
        {steps.map((s, i) => (
          <React.Fragment key={s.n}>
            <Link
              to={s.disabled ? "#" : s.to}
              className={`org-flow-card panel org-flow-${s.status} ${s.disabled ? "org-flow-disabled" : ""}`}
              onClick={(e) => s.disabled && e.preventDefault()}
            >
              <span className="org-flow-n mono">{s.n}</span>
              <h3>{s.title}</h3>
              <p>{s.detail}</p>
            </Link>
            {i < steps.length - 1 && <div className={`org-flow-connector ${s.status === "done" ? "org-flow-connector-done" : ""}`} />}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}