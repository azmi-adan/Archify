import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import "../styles/requirements.css";

const API_BASE = "http://127.0.0.1:5000/api";

function authHeaders() {
  const token = localStorage.getItem("archify_token");
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

const DEFAULT_FORM = {
  location: "",
  notes: "",
  branches: 0,
  buildings: 1,
  floors_per_building: 1,
  branch_users_percent: "",
  employees: "",
  departments: [],
  wired_devices: 0,
  wireless_devices: 0,
  servers: 0,
  printers: 0,
  voip_phones: 0,
  cctv_cameras: 0,
  iot_devices: 0,
  internet: true,
  guest_wifi: false,
  staff_wifi: false,
  voip: false,
  cctv: false,
  iot: false,
  high_availability: false,
  scalability: false,
  expected_growth_percent: 20,
  budget_level: "medium",
  budget_amount_usd: "",
  security_level: "standard",
  performance_level: "standard",
  addressing_method: "auto",
};

const NUMBER_FIELDS = [
  "branches", "buildings", "floors_per_building",
  "wired_devices", "wireless_devices", "servers", "printers",
  "voip_phones", "cctv_cameras", "iot_devices", "expected_growth_percent",
];

export default function Requirements() {
  const { orgId } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState(DEFAULT_FORM);
  const [exists, setExists] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [notice, setNotice] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/organizations/${orgId}/requirements`, { headers: authHeaders() });
      const json = await res.json();
      if (json.success) {
        setExists(true);
        const r = json.data.requirements;
        setForm({
          ...DEFAULT_FORM,
          ...r,
          branch_users_percent: r.branch_users_percent ?? "",
          budget_amount_usd: r.budget_amount_usd ?? "",
        });
      } else {
        setExists(false);
      }
    } catch (err) {
      setError("Could not load requirements.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  const setField = (name, value) => setForm((f) => ({ ...f, [name]: value }));

  const handleNumberChange = (name, value) => {
    setField(name, value === "" ? "" : Number(value));
  };

  const addDepartment = () => {
    setField("departments", [...form.departments, { name: "", users: 1 }]);
  };
  const updateDepartment = (index, key, value) => {
    const next = [...form.departments];
    next[index] = { ...next[index], [key]: key === "users" ? Number(value) : value };
    setField("departments", next);
  };
  const removeDepartment = (index) => {
    setField("departments", form.departments.filter((_, i) => i !== index));
  };

  const buildPayload = () => {
    const payload = { ...form };
    NUMBER_FIELDS.forEach((f) => {
      if (payload[f] === "") payload[f] = 0;
    });
    payload.branch_users_percent = payload.branch_users_percent === "" ? null : Number(payload.branch_users_percent);
    payload.budget_amount_usd = payload.budget_amount_usd === "" ? null : Number(payload.budget_amount_usd);
    if (payload.employees === "") delete payload.employees;
    else payload.employees = Number(payload.employees);
    payload.location = payload.location || null;
    payload.notes = payload.notes || null;
    return payload;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setFieldErrors({});
    setNotice("");
    try {
      const res = await fetch(`${API_BASE}/organizations/${orgId}/requirements`, {
        method: exists ? "PUT" : "POST",
        headers: authHeaders(),
        body: JSON.stringify(buildPayload()),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.message || "Could not save requirements.");
        setFieldErrors(json.details || {});
        return;
      }
      setExists(true);
      setNotice(
        exists
          ? "Requirements updated and the design was regenerated."
          : "Requirements saved. Redirecting to generate the design..."
      );
      setTimeout(() => navigate(`/organizations/${orgId}/generation`), 900);
    } catch (err) {
      setError("Could not reach the server.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="status-text">Loading...</p>;

  const totalDevices =
    Number(form.wired_devices || 0) +
    Number(form.wireless_devices || 0) +
    Number(form.servers || 0) +
    Number(form.printers || 0) +
    Number(form.voip_phones || 0) +
    Number(form.cctv_cameras || 0) +
    Number(form.iot_devices || 0);

  const activeServices = [
    ["internet", "Internet"],
    ["guest_wifi", "Guest Wi-Fi"],
    ["staff_wifi", "Staff Wi-Fi"],
    ["voip", "VoIP"],
    ["cctv", "CCTV"],
    ["iot", "IoT"],
    ["high_availability", "High availability"],
    ["scalability", "Scalability"],
  ].filter(([key]) => form[key]);

  return (
    <div className="req-screen">
      <Link to={`/organizations/${orgId}`} className="req-back">
        &larr; Back to organization
      </Link>
      <h1 className="req-title">Network requirements</h1>
      <p className="req-subtitle">
        {exists
          ? "Update the requirements below. Saving regenerates the design."
          : "Describe the organization's network needs to generate a design."}
      </p>

      {error && <div className="auth-error req-banner">{error}</div>}
      {notice && <div className="auth-success req-banner">{notice}</div>}

      <div className="req-layout">
        <form className="req-form" onSubmit={handleSubmit}>
          <section className="req-section panel">
            <h2>Organization details</h2>
            <div className="req-grid">
              <label>
                Location
                <input value={form.location || ""} onChange={(e) => setField("location", e.target.value)} />
              </label>
              <label>
                Branches
                <input type="number" min="0" value={form.branches} onChange={(e) => handleNumberChange("branches", e.target.value)} />
              </label>
              <label>
                Buildings
                <input type="number" min="1" value={form.buildings} onChange={(e) => handleNumberChange("buildings", e.target.value)} />
              </label>
              <label>
                Floors per building
                <input
                  type="number"
                  min="1"
                  value={form.floors_per_building}
                  onChange={(e) => handleNumberChange("floors_per_building", e.target.value)}
                />
              </label>
              {Number(form.branches) > 0 && (
                <label>
                  Branch share of staff/devices (%)
                  <input
                    type="number"
                    min="0"
                    max="90"
                    value={form.branch_users_percent}
                    onChange={(e) => setField("branch_users_percent", e.target.value)}
                  />
                </label>
              )}
            </div>
            <label className="req-full">
              Notes
              <textarea rows={2} value={form.notes || ""} onChange={(e) => setField("notes", e.target.value)} />
            </label>
          </section>

          <section className="req-section panel">
            <h2>People and devices</h2>
            <div className="req-grid">
              <label>
                Employees
                <input
                  type="number"
                  min="0"
                  value={form.employees}
                  onChange={(e) => setField("employees", e.target.value)}
                  placeholder="derived from departments if blank"
                />
              </label>
              <label>
                Wired devices
                <input type="number" min="0" value={form.wired_devices} onChange={(e) => handleNumberChange("wired_devices", e.target.value)} />
              </label>
              <label>
                Wireless devices
                <input type="number" min="0" value={form.wireless_devices} onChange={(e) => handleNumberChange("wireless_devices", e.target.value)} />
              </label>
              <label>
                Servers
                <input type="number" min="0" value={form.servers} onChange={(e) => handleNumberChange("servers", e.target.value)} />
              </label>
              <label>
                Printers
                <input type="number" min="0" value={form.printers} onChange={(e) => handleNumberChange("printers", e.target.value)} />
              </label>
              <label>
                VoIP phones
                <input type="number" min="0" value={form.voip_phones} onChange={(e) => handleNumberChange("voip_phones", e.target.value)} />
              </label>
              <label>
                CCTV cameras
                <input type="number" min="0" value={form.cctv_cameras} onChange={(e) => handleNumberChange("cctv_cameras", e.target.value)} />
              </label>
              <label>
                IoT devices
                <input type="number" min="0" value={form.iot_devices} onChange={(e) => handleNumberChange("iot_devices", e.target.value)} />
              </label>
            </div>
          </section>

          <section className="req-section panel">
            <h2>Departments</h2>
            {form.departments.map((d, i) => (
              <div className="req-dept-row" key={i}>
                <input placeholder="Name" value={d.name} onChange={(e) => updateDepartment(i, "name", e.target.value)} />
                <input
                  type="number"
                  min="1"
                  placeholder="Users"
                  value={d.users}
                  onChange={(e) => updateDepartment(i, "users", e.target.value)}
                />
                <button type="button" className="btn btn-danger req-remove-btn" onClick={() => removeDepartment(i)}>
                  Remove
                </button>
              </div>
            ))}
            <button type="button" className="btn btn-ghost" onClick={addDepartment}>
              + Add department
            </button>
          </section>

          <section className="req-section panel">
            <h2>Services</h2>
            <div className="req-checks">
              {[
                ["internet", "Internet"],
                ["guest_wifi", "Guest Wi-Fi"],
                ["staff_wifi", "Staff Wi-Fi"],
                ["voip", "VoIP"],
                ["cctv", "CCTV"],
                ["iot", "IoT"],
                ["high_availability", "High availability"],
                ["scalability", "Scalability"],
              ].map(([key, label]) => (
                <label key={key} className="req-check">
                  <input type="checkbox" checked={form[key]} onChange={(e) => setField(key, e.target.checked)} />
                  {label}
                </label>
              ))}
            </div>
          </section>

          <section className="req-section panel">
            <h2>Design goals</h2>
            <div className="req-grid">
              <label>
                Expected growth (%)
                <input
                  type="number"
                  min="0"
                  max="500"
                  value={form.expected_growth_percent}
                  onChange={(e) => handleNumberChange("expected_growth_percent", e.target.value)}
                />
              </label>
              <label>
                Budget level
                <select value={form.budget_level} onChange={(e) => setField("budget_level", e.target.value)}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </label>
              <label>
                Budget amount (USD, optional)
                <input
                  type="number"
                  min="0"
                  value={form.budget_amount_usd}
                  onChange={(e) => setField("budget_amount_usd", e.target.value)}
                />
              </label>
              <label>
                Security level
                <select value={form.security_level} onChange={(e) => setField("security_level", e.target.value)}>
                  <option value="basic">Basic</option>
                  <option value="standard">Standard</option>
                  <option value="high">High</option>
                </select>
              </label>
              <label>
                Performance level
                <select value={form.performance_level} onChange={(e) => setField("performance_level", e.target.value)}>
                  <option value="standard">Standard</option>
                  <option value="high">High</option>
                </select>
              </label>
              <label>
                Addressing method
                <select value={form.addressing_method} onChange={(e) => setField("addressing_method", e.target.value)}>
                  <option value="auto">Auto</option>
                  <option value="flsm">FLSM</option>
                  <option value="vlsm">VLSM</option>
                </select>
              </label>
            </div>
          </section>

          {Object.keys(fieldErrors).length > 0 && (
            <ul className="req-field-errors">
              {Object.entries(fieldErrors).map(([k, v]) => (
                <li key={k}>
                  <strong>{k}:</strong> {v}
                </li>
              ))}
            </ul>
          )}

          <button type="submit" className="btn btn-primary req-submit-btn" disabled={saving}>
            {saving ? "Saving..." : exists ? "Save and regenerate design" : "Save requirements"}
          </button>
        </form>

        <aside className="req-summary panel">
          <h3>Live summary</h3>
          <div className="req-summary-row">
            <span>Sites</span>
            <span className="mono">{1 + Number(form.branches || 0)}</span>
          </div>
          <div className="req-summary-row">
            <span>Departments</span>
            <span className="mono">{form.departments.length}</span>
          </div>
          <div className="req-summary-row">
            <span>Total devices</span>
            <span className="mono">{totalDevices}</span>
          </div>
          <div className="req-summary-row">
            <span>Growth target</span>
            <span className="mono">{form.expected_growth_percent}%</span>
          </div>
          <div className="req-summary-row">
            <span>Budget</span>
            <span className="mono">{form.budget_level}</span>
          </div>
          <div className="req-summary-divider" />
          <p className="req-summary-label">Active services</p>
          <div className="req-summary-tags">
            {activeServices.length === 0 && <span className="req-summary-empty">None selected</span>}
            {activeServices.map(([key, label]) => (
              <span key={key} className="badge">
                {label}
              </span>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}