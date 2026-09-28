import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import "../styles/splash.css";

const API_BASE = "http://127.0.0.1:5000/api";

function TopologyArt() {
  const core = { x: 260, y: 60 };
  const dist = [
    { x: 110, y: 165 },
    { x: 260, y: 175 },
    { x: 410, y: 165 },
  ];
  const access = [
    { x: 55, y: 280 }, { x: 155, y: 290 },
    { x: 225, y: 280 }, { x: 295, y: 290 },
    { x: 365, y: 280 }, { x: 465, y: 290 },
  ];
  const parentOf = [0, 0, 1, 1, 2, 2];

  return (
    <svg viewBox="0 0 520 330" className="topo-art" role="img" aria-label="Layered network topology — core, distribution, access">
      <defs>
        <radialGradient id="nodeGlow" cx="50%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#7bf2b6" />
          <stop offset="100%" stopColor="#2fcb84" />
        </radialGradient>
      </defs>
      {dist.map((d, i) => (
        <line key={`cd${i}`} x1={core.x} y1={core.y} x2={d.x} y2={d.y} className="topo-link topo-link-core" />
      ))}
      {access.map((a, i) => {
        const p = dist[parentOf[i]];
        return <line key={`da${i}`} x1={p.x} y1={p.y} x2={a.x} y2={a.y} className="topo-link" />;
      })}
      <circle cx={core.x} cy={core.y} r="15" fill="url(#nodeGlow)" className="topo-node topo-node-core" />
      {dist.map((d, i) => (
        <circle key={`dn${i}`} cx={d.x} cy={d.y} r="10" className="topo-node topo-node-dist" />
      ))}
      {access.map((a, i) => (
        <circle key={`an${i}`} cx={a.x} cy={a.y} r="6" className="topo-node topo-node-access" style={{ animationDelay: `${i * 0.3}s` }} />
      ))}
      <text x={core.x} y={core.y - 26} textAnchor="middle" className="topo-label">CORE</text>
      <text x="8" y="170" className="topo-label topo-label-side">DISTRIBUTION</text>
      <text x="8" y="315" className="topo-label topo-label-side">ACCESS</text>
    </svg>
  );
}

function PreviewDonut() {
  const rows = [
    { label: "switches", value: 42, color: "#2fcb84" },
    { label: "access points", value: 27, color: "#55e6a5" },
    { label: "cabling", value: 18, color: "#e7b256" },
    { label: "servers", value: 13, color: "#86ab97" },
  ];
  const total = rows.reduce((s, r) => s + r.value, 0);
  const size = 118, stroke = 16, r = (size - stroke) / 2, circ = 2 * Math.PI * r;
  let acc = 0;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="preview-donut">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-raised)" strokeWidth={stroke} />
      {rows.map((row) => {
        const dash = (row.value / total) * circ;
        const el = (
          <circle key={row.label} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={row.color}
            strokeWidth={stroke} strokeDasharray={`${dash} ${circ - dash}`} strokeDashoffset={-acc}
            transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        );
        acc += dash;
        return el;
      })}
    </svg>
  );
}

const STATS = [
  { value: "2", label: "Addressing methods", detail: "FLSM & VLSM, chosen automatically" },
  { value: "3", label: "Redundancy tiers", detail: "Matched to organization size" },
  { value: "Every design", label: "SPOF analysis included", detail: "Topology graphed and stress-checked" },
  { value: "Instant", label: "Regeneration", detail: "Edit a requirement, re-run the engine" },
];

const CAPABILITIES = [
  { label: "Methodology", text: "Picks a redundancy and hierarchy model sized to the organization, with a documented rationale.", icon: "◈" },
  { label: "IP & VLANs", text: "Segments every site into VLANs and calculates a subnet plan under FLSM or VLSM automatically.", icon: "▤" },
  { label: "Hardware & cost", text: "Selects switches, access points and cabling by category, priced against the stated budget.", icon: "◫" },
  { label: "Failure analysis", text: "Graphs the topology to surface single points of failure and worst-case hop counts before you build.", icon: "◉" },
];

const STEPS = [
  { n: "1", title: "Describe the org", text: "Sites, headcount, devices, services and budget — one guided flow." },
  { n: "2", title: "Generate", text: "The rule-based engine turns that into a complete, versioned design in seconds." },
  { n: "3", title: "Review the dashboard", text: "VLANs, IP plan, hardware, topology diagram and warnings, all in one view." },
];

export default function Splash() {
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("archify_token");
    if (!token) {
      setChecked(true);
      return undefined;
    }
    // A saved token only skips the landing page if the server still accepts it.
    let cancelled = false;
    fetch(`${API_BASE}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        let json = {};
        try {
          json = await res.json();
        } catch (e) {
          json = {};
        }
        return res.ok && json.success !== false;
      })
      .catch(() => false)
      .then((valid) => {
        if (cancelled) return;
        if (valid) {
          navigate("/home", { replace: true });
        } else {
          localStorage.removeItem("archify_token");
          localStorage.removeItem("archify_user");
          setChecked(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (!checked) return <div className="land-loading mono">loading…</div>;

  return (
    <div className="land-screen">
      <header className="land-nav">
        <span className="land-brand">
          <span className="land-brand-mark">A</span>
          Archify
        </span>
        <nav className="land-nav-actions">
          <Link to="/login" className="btn btn-ghost">Log in</Link>
          <Link to="/signup" className="btn btn-primary">Get started</Link>
        </nav>
      </header>

      <section className="land-hero grid-backdrop">
        <div className="land-hero-copy fade-up">
          <span className="eyebrow">Network design engine</span>
          <h1 className="land-headline">
            Network architecture,<br /><span className="glow-text">designed by a machine</span><br />that shows its work.
          </h1>
          <p className="land-subhead">
            Archify takes an organization's requirements — sites, devices, budget, growth — and
            generates a complete, versioned network design: VLANs, IP addressing, hardware, cost
            and a topology risk analysis, ready to review on a live dashboard.
          </p>
          <div className="land-cta-row">
            <Link to="/signup" className="btn btn-primary land-cta-lg">Design your first network</Link>
            <Link to="/login" className="btn btn-ghost land-cta-lg">I have an account</Link>
          </div>
        </div>
        <div className="land-hero-art">
          <div className="topo-art-float">
            <TopologyArt />
          </div>
          <span className="land-art-caption mono">core → distribution → access</span>
        </div>
      </section>

      <section className="land-stats">
        {STATS.map((s) => (
          <div key={s.label} className="land-stat panel">
            <span className="land-stat-value">{s.value}</span>
            <span className="land-stat-label">{s.label}</span>
            <span className="land-stat-detail">{s.detail}</span>
          </div>
        ))}
      </section>

      <section className="land-capabilities">
        <span className="eyebrow">Under the hood</span>
        <h2 className="land-section-title">What the engine works out for you</h2>
        <div className="land-cap-grid">
          {CAPABILITIES.map((c) => (
            <div key={c.label} className="land-cap-card panel">
              <span className="land-cap-icon">{c.icon}</span>
              <h3>{c.label}</h3>
              <p>{c.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="land-preview">
        <div className="land-preview-copy">
          <span className="eyebrow">Dashboard preview</span>
          <h2 className="land-section-title">Every design lands on one dashboard</h2>
          <p>
            Cost breakdown, subnet utilization, VLAN tables and a topology risk view — generated
            fresh every time requirements change.
          </p>
        </div>
        <div className="land-preview-card panel">
          <PreviewDonut />
          <div className="land-preview-bars">
            <div className="land-preview-bar"><span style={{ width: "82%" }} /></div>
            <div className="land-preview-bar"><span style={{ width: "61%" }} /></div>
            <div className="land-preview-bar"><span style={{ width: "45%" }} /></div>
          </div>
          <span className="land-preview-caption mono">illustrative example design</span>
        </div>
      </section>

      <section className="land-steps">
        <span className="eyebrow">How it works</span>
        <h2 className="land-section-title">From requirements to dashboard</h2>
        <div className="land-steps-row">
          {STEPS.map((s, i) => (
            <React.Fragment key={s.n}>
              <div className="land-step">
                <span className="land-step-n mono">{s.n}</span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </div>
              {i < STEPS.length - 1 && <div className="land-step-connector" />}
            </React.Fragment>
          ))}
        </div>
      </section>

      <section className="land-final-cta panel">
        <h2>Ready to see your network on paper before it's built?</h2>
        <Link to="/signup" className="btn btn-primary land-cta-lg">Get started free</Link>
      </section>
    </div>
  );
}