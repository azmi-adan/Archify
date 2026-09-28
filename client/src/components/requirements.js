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

const STEPS = [
  { key: "site", title: "Your sites", icon: "⌂", blurb: "Where does the network live?" },
  { key: "devices", title: "Devices", icon: "▣", blurb: "What will connect to it?" },
  { key: "people", title: "People", icon: "☰", blurb: "Who uses it, and in which teams?" },
  { key: "services", title: "Services", icon: "◈", blurb: "What must the network provide?" },
  { key: "goals", title: "Goals", icon: "◎", blurb: "How should it be built?" },
  { key: "review", title: "Review", icon: "✓", blurb: "Check it and launch the engine." },
];

const DEVICE_TILES = [
  ["wired_devices", "Wired devices", "⌨"],
  ["wireless_devices", "Wireless devices", "⌁"],
  ["servers", "Servers", "▤"],
  ["printers", "Printers", "⎙"],
  ["voip_phones", "VoIP phones", "☏"],
  ["cctv_cameras", "CCTV cameras", "◉"],
  ["iot_devices", "IoT devices", "✦"],
];

const SERVICE_TILES = [
  ["internet", "Internet", "🌐", "Uplink to the outside world"],
  ["guest_wifi", "Guest Wi-Fi", "☕", "Isolated visitor access"],
  ["staff_wifi", "Staff Wi-Fi", "📶", "Secure wireless for employees"],
  ["voip", "VoIP", "☎", "Voice-over-IP with QoS"],
  ["cctv", "CCTV", "📷", "Camera network segment"],
  ["iot", "IoT", "✦", "Sensors and smart devices"],
  ["high_availability", "High availability", "⛨", "Redundant core, no single failure"],
  ["scalability", "Scalability", "⇗", "Spare capacity for growth"],
];

function Counter({ label, icon, value, onChange, min = 0 }) {
  const n = Number(value || 0);
  return (
    <div className="rq-counter">
      <span className="rq-counter-icon">{icon}</span>
      <span className="rq-counter-label">{label}</span>
      <div className="rq-counter-ctrl">
        <button type="button" onClick={() => onChange(Math.max(min, n - 1))} aria-label={`decrease ${label}`}>−</button>
        <input type="number" min={min} value={value} onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))} />
        <button type="button" onClick={() => onChange(n + 1)} aria-label={`increase ${label}`}>+</button>
      </div>
    </div>
  );
}

function Segmented({ options, value, onChange }) {
  return (
    <div className="rq-seg">
      {options.map(([val, label, hint]) => (
        <button type="button" key={val} className={`rq-seg-opt ${value === val ? "rq-seg-active" : ""}`} onClick={() => onChange(val)}>
          <strong>{label}</strong>
          {hint && <span>{hint}</span>}
        </button>
      ))}
    </div>
  );
}

function LiveSketch({ sites, accessCount, hasHA }) {
  const dist = Math.min(sites, 5);
  const acc = Math.min(accessCount, 10);
  const xs = (n, w = 240) => Array.from({ length: n }, (_, i) => (w / (n + 1)) * (i + 1) + 10);
  const dx = xs(dist);
  const ax = xs(acc);
  const cx = hasHA ? [95, 165] : [130];
  return (
    <svg viewBox="0 0 260 150" className="rq-sketch" aria-hidden="true">
      {cx.map((c, i) => dx.map((d, j) => <line key={`c${i}${j}`} x1={c} y1="20" x2={d} y2="75" className="rq-sk-link" />))}
      {ax.map((a, i) => <line key={`a${i}`} x1={dx[i % dist]} y1="75" x2={a} y2="130" className="rq-sk-link" />)}
      {cx.map((c, i) => <circle key={`cn${i}`} cx={c} cy="20" r="8" className="rq-sk-core" />)}
      {dx.map((d, i) => <circle key={`dn${i}`} cx={d} cy="75" r="5.5" className="rq-sk-dist" />)}
      {ax.map((a, i) => <circle key={`an${i}`} cx={a} cy="130" r="3.5" className="rq-sk-acc" />)}
    </svg>
  );
}

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
  const [step, setStep] = useState(0);

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
  const handleNumberChange = (name, value) => setField(name, value === "" ? "" : Number(value));

  const addDepartment = () => setField("departments", [...form.departments, { name: "", users: 1 }]);
  const updateDepartment = (index, key, value) => {
    const next = [...form.departments];
    next[index] = { ...next[index], [key]: key === "users" ? Number(value) : value };
    setField("departments", next);
  };
  const removeDepartment = (index) => setField("departments", form.departments.filter((_, i) => i !== index));

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

  const submit = async () => {
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
      setNotice(exists ? "Requirements updated and the design was regenerated." : "Requirements saved. Launching the engine...");
      setTimeout(() => navigate(`/organizations/${orgId}/generation`), 900);
    } catch (err) {
      setError("Could not reach the server.");
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (step < STEPS.length - 1) setStep(step + 1);
    else submit();
  };

  if (loading) return <p className="status-text">Loading...</p>;

  const totalDevices = DEVICE_TILES.reduce((sum, [k]) => sum + Number(form[k] || 0), 0);
  const sites = 1 + Number(form.branches || 0);
  const totalUsers = form.departments.reduce((s, d) => s + Number(d.users || 0), 0);
  const activeServices = SERVICE_TILES.filter(([key]) => form[key]);
  const accessGuess = Math.max(1, Math.ceil(totalDevices / 24));
  const maxDeptUsers = Math.max(1, ...form.departments.map((d) => Number(d.users || 0)));
  const current = STEPS[step];

  return (
    <div className="rq-screen">
      <Link to={`/organizations/${orgId}`} className="rq-back">&larr; Back to organization</Link>

      <header className="rq-hero">
        <span className="eyebrow">Requirements studio</span>
        <h1>Describe the network, <span className="glow-text">we'll design it.</span></h1>
        <p>{exists ? "Update anything below — saving regenerates the design." : "Six quick steps. Watch the sketch on the right grow as you answer."}</p>
      </header>

      <ol className="rq-stepper">
        {STEPS.map((s, i) => (
          <li key={s.key} className={`rq-step ${i === step ? "rq-step-current" : ""} ${i < step ? "rq-step-done" : ""}`}>
            <button type="button" onClick={() => setStep(i)}>
              <span className="rq-step-dot">{i < step ? "✓" : s.icon}</span>
              <span className="rq-step-title">{s.title}</span>
            </button>
          </li>
        ))}
      </ol>
      <div className="rq-progress"><div style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} /></div>

      {error && <div className="auth-error rq-banner">{error}</div>}
      {notice && <div className="auth-success rq-banner">{notice}</div>}

      <div className="rq-layout">
        <form className="rq-card panel" onSubmit={handleSubmit} key={current.key}>
          <div className="rq-card-head">
            <span className="rq-card-icon">{current.icon}</span>
            <div>
              <h2>{current.title}</h2>
              <p>{current.blurb}</p>
            </div>
          </div>

          {current.key === "site" && (
            <div className="rq-fields">
              <label>Location<input value={form.location || ""} onChange={(e) => setField("location", e.target.value)} placeholder="e.g. Nairobi, Kenya" /></label>
              <Counter label="Branch offices" icon="⌖" value={form.branches} onChange={(v) => handleNumberChange("branches", v)} />
              <Counter label="Buildings" icon="▦" value={form.buildings} min={1} onChange={(v) => handleNumberChange("buildings", v)} />
              <Counter label="Floors per building" icon="≡" value={form.floors_per_building} min={1} onChange={(v) => handleNumberChange("floors_per_building", v)} />
              {Number(form.branches) > 0 && (
                <label>Branch share of staff/devices (%)
                  <input type="number" min="0" max="90" value={form.branch_users_percent} onChange={(e) => setField("branch_users_percent", e.target.value)} />
                </label>
              )}
              <label className="rq-wide">Notes<textarea rows={2} value={form.notes || ""} onChange={(e) => setField("notes", e.target.value)} placeholder="Anything the engine should know" /></label>
            </div>
          )}

          {current.key === "devices" && (
            <div className="rq-counters">
              {DEVICE_TILES.map(([key, label, icon]) => (
                <Counter key={key} label={label} icon={icon} value={form[key]} onChange={(v) => handleNumberChange(key, v)} />
              ))}
            </div>
          )}

          {current.key === "people" && (
            <div>
              <label className="rq-inline">Total employees
                <input type="number" min="0" value={form.employees} onChange={(e) => setField("employees", e.target.value)} placeholder="derived from departments if blank" />
              </label>
              <div className="rq-depts">
                {form.departments.map((d, i) => (
                  <div className="rq-dept" key={i}>
                    <div className="rq-dept-row">
                      <input placeholder="Department name" value={d.name} onChange={(e) => updateDepartment(i, "name", e.target.value)} />
                      <input type="number" min="1" value={d.users} onChange={(e) => updateDepartment(i, "users", e.target.value)} />
                      <button type="button" className="btn btn-danger rq-x" onClick={() => removeDepartment(i)}>✕</button>
                    </div>
                    <div className="rq-dept-bar"><span style={{ width: `${(Number(d.users || 0) / maxDeptUsers) * 100}%` }} /></div>
                  </div>
                ))}
              </div>
              <button type="button" className="btn btn-ghost" onClick={addDepartment}>+ Add department</button>
            </div>
          )}

          {current.key === "services" && (
            <div className="rq-tiles">
              {SERVICE_TILES.map(([key, label, icon, hint]) => (
                <button type="button" key={key} className={`rq-tile ${form[key] ? "rq-tile-on" : ""}`} onClick={() => setField(key, !form[key])}>
                  <span className="rq-tile-icon">{icon}</span>
                  <strong>{label}</strong>
                  <span>{hint}</span>
                </button>
              ))}
            </div>
          )}

          {current.key === "goals" && (
            <div className="rq-goals">
              <div>
                <span className="rq-goal-label">Budget level</span>
                <Segmented value={form.budget_level} onChange={(v) => setField("budget_level", v)}
                  options={[["low", "Low", "lean"], ["medium", "Medium", "balanced"], ["high", "High", "premium"]]} />
              </div>
              <div>
                <span className="rq-goal-label">Security level</span>
                <Segmented value={form.security_level} onChange={(v) => setField("security_level", v)}
                  options={[["basic", "Basic"], ["standard", "Standard"], ["high", "High"]]} />
              </div>
              <div>
                <span className="rq-goal-label">Performance</span>
                <Segmented value={form.performance_level} onChange={(v) => setField("performance_level", v)}
                  options={[["standard", "Standard"], ["high", "High"]]} />
              </div>
              <div>
                <span className="rq-goal-label">Addressing method</span>
                <Segmented value={form.addressing_method} onChange={(v) => setField("addressing_method", v)}
                  options={[["auto", "Auto", "engine decides"], ["flsm", "FLSM", "fixed size"], ["vlsm", "VLSM", "variable size"]]} />
              </div>
              <label>Expected growth: <b className="mono">{form.expected_growth_percent}%</b>
                <input type="range" min="0" max="200" value={form.expected_growth_percent} onChange={(e) => handleNumberChange("expected_growth_percent", e.target.value)} />
              </label>
              <label>Budget amount (USD, optional)
                <input type="number" min="0" value={form.budget_amount_usd} onChange={(e) => setField("budget_amount_usd", e.target.value)} />
              </label>
            </div>
          )}

          {current.key === "review" && (
            <div className="rq-review">
              <div className="rq-review-grid">
                <div><span className="mono">{sites}</span>Sites</div>
                <div><span className="mono">{form.buildings}</span>Buildings</div>
                <div><span className="mono">{totalDevices}</span>Devices</div>
                <div><span className="mono">{totalUsers || form.employees || 0}</span>People</div>
                <div><span className="mono">{form.departments.length}</span>Departments</div>
                <div><span className="mono">{form.expected_growth_percent}%</span>Growth</div>
              </div>
              <div className="rq-review-tags">
                {activeServices.map(([k, l]) => <span key={k} className="badge">{l}</span>)}
                <span className="badge">budget: {form.budget_level}</span>
                <span className="badge">security: {form.security_level}</span>
                <span className="badge">{form.addressing_method}</span>
              </div>
              {Object.keys(fieldErrors).length > 0 && (
                <ul className="rq-errors">
                  {Object.entries(fieldErrors).map(([k, v]) => <li key={k}><strong>{k}:</strong> {v}</li>)}
                </ul>
              )}
            </div>
          )}

          <div className="rq-nav">
            <button type="button" className="btn btn-ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</button>
            {step < STEPS.length - 1 ? (
              <button type="submit" className="btn btn-primary">Continue</button>
            ) : (
              <button type="submit" className="btn btn-primary rq-launch" disabled={saving}>
                {saving ? "Saving..." : exists ? "Save & regenerate" : "Save & launch engine"}
              </button>
            )}
          </div>
        </form>

        <aside className="rq-side panel">
          <span className="eyebrow">Live sketch</span>
          <LiveSketch sites={sites} accessCount={accessGuess} hasHA={form.high_availability} />
          <div className="rq-side-stats">
            <div><span className="mono">{sites}</span>sites</div>
            <div><span className="mono">{totalDevices}</span>devices</div>
            <div><span className="mono">{activeServices.length}</span>services</div>
          </div>
          <p className="rq-side-note">A rough preview only — the engine produces the real design.</p>
        </aside>
      </div>
    </div>
  );
}