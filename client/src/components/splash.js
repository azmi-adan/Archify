import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import "../styles/splash.css";

function TopologyArt() {
  // A stylised core/distribution/access topology — the actual shape
  // Archify's engine produces — used as the hero's live visual.
  const core = { x: 260, y: 70 };
  const dist = [
    { x: 130, y: 160 },
    { x: 390, y: 160 },
  ];
  const access = [
    { x: 60, y: 260 },
    { x: 170, y: 270 },
    { x: 320, y: 270 },
    { x: 440, y: 260 },
  ];

  return (
    <svg viewBox="0 0 520 320" className="topo-art" role="img" aria-label="Generated network topology">
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
        const parent = dist[i < 2 ? 0 : 1];
        return <line key={`da${i}`} x1={parent.x} y1={parent.y} x2={a.x} y2={a.y} className="topo-link" />;
      })}

      <circle cx={core.x} cy={core.y} r="15" fill="url(#nodeGlow)" className="topo-node topo-node-core" />
      {dist.map((d, i) => (
        <circle key={`dn${i}`} cx={d.x} cy={d.y} r="10" className="topo-node topo-node-dist" />
      ))}
      {access.map((a, i) => (
        <circle key={`an${i}`} cx={a.x} cy={a.y} r="6.5" className="topo-node topo-node-access" style={{ animationDelay: `${i * 0.4}s` }} />
      ))}
    </svg>
  );
}

const CAPABILITIES = [
  {
    label: "Methodology",
    text: "Picks a redundancy and hierarchy model sized to the organization, with a documented rationale.",
  },
  {
    label: "IP & VLANs",
    text: "Segments every site into VLANs and calculates a subnet plan under FLSM or VLSM automatically.",
  },
  {
    label: "Hardware & cost",
    text: "Selects switches, access points and cabling by category, priced against the stated budget.",
  },
  {
    label: "Failure analysis",
    text: "Graphs the topology to surface single points of failure and worst-case hop counts before you build.",
  },
];

const STEPS = [
  { n: "1", title: "Describe the org", text: "Sites, headcount, devices, services and budget — one structured form." },
  { n: "2", title: "Generate", text: "The rule-based engine turns that into a complete, versioned design in seconds." },
  { n: "3", title: "Review the dashboard", text: "VLANs, IP plan, hardware, topology risk and warnings, all in one view." },
];

export default function Splash() {
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("archify_token");
    if (token) {
      navigate("/home", { replace: true });
      return;
    }
    setChecked(true);
  }, [navigate]);

  if (!checked) return null;

  return (
    <div className="land-screen">
      <header className="land-nav">
        <span className="land-brand">
          <span className="land-brand-mark">A</span>
          Archify
        </span>
        <nav className="land-nav-actions">
          <Link to="/login" className="btn btn-ghost">
            Log in
          </Link>
          <Link to="/signup" className="btn btn-primary">
            Get started
          </Link>
        </nav>
      </header>

      <section className="land-hero">
        <div className="land-hero-copy">
          <h1 className="land-headline">
            Network architecture, designed by a machine that shows its work.
          </h1>
          <p className="land-subhead">
            Archify takes an organization's requirements — sites, devices, budget, growth — and
            generates a complete, versioned network design: VLANs, IP addressing, hardware, cost
            and a topology risk analysis, ready to review on a live dashboard.
          </p>
          <div className="land-cta-row">
            <Link to="/signup" className="btn btn-primary land-cta-lg">
              Design your first network
            </Link>
            <Link to="/login" className="btn btn-ghost land-cta-lg">
              I have an account
            </Link>
          </div>
        </div>
        <div className="land-hero-art">
          <TopologyArt />
          <span className="land-art-caption mono">core → distribution → access</span>
        </div>
      </section>

      <section className="land-capabilities">
        <h2 className="land-section-title">What the engine works out for you</h2>
        <div className="land-cap-grid">
          {CAPABILITIES.map((c) => (
            <div key={c.label} className="land-cap-card panel">
              <h3>{c.label}</h3>
              <p>{c.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="land-steps">
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

      <footer className="land-footer">
        <span>Archify</span>
        <span className="land-footer-fade">Rule-based network design engine</span>
      </footer>
    </div>
  );
}