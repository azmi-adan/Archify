import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import "../styles/generation.css";

const API_BASE = "http://127.0.0.1:5000/api";

function authHeaders() {
  const token = localStorage.getItem("archify_token");
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

const RUN_STAGES = [
  "Reading requirements",
  "Choosing methodology",
  "Segmenting VLANs",
  "Allocating IP addressing",
  "Selecting hardware",
  "Analyzing topology",
];


function EngineOrb({ running }) {
  return (
    <div className={`orb ${running ? "orb-running" : ""}`} aria-hidden="true">
      <svg viewBox="0 0 200 200">
        <circle cx="100" cy="100" r="88" className="orb-ring orb-ring-1" />
        <circle cx="100" cy="100" r="66" className="orb-ring orb-ring-2" />
        <circle cx="100" cy="100" r="44" className="orb-ring orb-ring-3" />
        {[0, 60, 120, 180, 240, 300].map((deg) => (
          <circle key={deg} cx="100" cy="12" r="4" className="orb-sat" transform={`rotate(${deg} 100 100)`} />
        ))}
        <circle cx="100" cy="100" r="20" className="orb-core" />
        <text x="100" y="105" textAnchor="middle" className="orb-text">A</text>
      </svg>
    </div>
  );
}

export default function Generation() {
  const { orgId } = useParams();
  const [design, setDesign] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/organizations/${orgId}/design`, { headers: authHeaders() });
      const json = await res.json();
      setDesign(json.success ? json.data.design : null);
    } catch (err) {
      setError("Could not load the design.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  const handleGenerate = async () => {
    setGenerating(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/organizations/${orgId}/generate`, {
        method: "POST",
        headers: authHeaders(),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.message + (json.details && json.details.reason ? `: ${json.details.reason}` : ""));
        return;
      }
      setDesign(json.data.design);
    } catch (err) {
      setError("Could not reach the server.");
    } finally {
      setGenerating(false);
    }
  };

  if (loading) return <p className="status-text">Loading...</p>;

  const result = design && design.design;

  return (
    <div className="gen-screen">
      <Link to={`/organizations/${orgId}`} className="gen-back">
        &larr; Back to organization
      </Link>
      <span className="eyebrow">Design engine</span>
      <h1 className="gen-title">Generation <span className="glow-text">engine</span></h1>
      <p className="gen-subtitle">Run the rule-based engine to turn requirements into a full network design.</p>

      {error && <div className="auth-error gen-banner">{error}</div>}

      <div className="gen-stage-wrap">
        <EngineOrb running={generating} />
        <ol className="gen-pipeline">
          {RUN_STAGES.map((stage, i) => (
            <li key={stage} className={generating || design ? "gen-pipe-on" : ""} style={{ animationDelay: `${i * 0.25}s` }}>
              <span className="mono">{String(i + 1).padStart(2, "0")}</span>
              {stage}
            </li>
          ))}
        </ol>
      </div>

      <div className="gen-console panel">
        <div className="gen-console-head">
          <span className="gen-dot" />
          <span className="gen-dot" />
          <span className="gen-dot" />
          <span className="gen-console-title mono">archify-engine</span>
        </div>
        <div className="gen-console-body">
          {generating ? (
            <ul className="gen-stage-list mono">
              {RUN_STAGES.map((stage, i) => (
                <li key={stage} style={{ animationDelay: `${i * 0.18}s` }}>
                  <span className="gen-stage-bullet" />
                  {stage}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mono gen-console-idle">
              {design ? `> last run: v${design.version} · engine ${design.engine_version}` : "> awaiting first run"}
            </p>
          )}
        </div>
        <button className="btn btn-primary gen-btn" onClick={handleGenerate} disabled={generating}>
          {generating ? "Generating..." : design ? "Regenerate design" : "Generate design"}
        </button>
      </div>

      {!design && !generating && (
        <p className="gen-empty">
          No design has been generated yet. Make sure requirements are saved first, then generate.
        </p>
      )}

      {result && (
        <div className="gen-summary panel">
          <div className="gen-summary-header">
            <h2>{result.methodology && result.methodology.name}</h2>
            <span className="badge">
              v{design.version} · engine {design.engine_version}
            </span>
          </div>
          <p className="gen-overview-text">{result.overview && result.overview.summary}</p>

          <div className="gen-stat-grid">
            <div className="gen-stat">
              <span className="mono">{result.overview.totals.vlans}</span>VLANs
            </div>
            <div className="gen-stat">
              <span className="mono">{result.overview.totals.subnets}</span>Subnets
            </div>
            <div className="gen-stat">
              <span className="mono">{result.overview.totals.access_switches}</span>Access switches
            </div>
            <div className="gen-stat">
              <span className="mono">{result.overview.totals.access_points}</span>Access points
            </div>
            <div className="gen-stat">
              <span className="mono">${result.overview.totals.estimated_cost_usd.toLocaleString()}</span>Estimated cost
            </div>
          </div>

          <div className="gen-layers">
            <span className="gen-layers-title mono">generated layers</span>
            {[["Core", 1], ["Distribution", 2], ["Access", 3]].map(([name, w]) => (
              <div key={name} className="gen-layer" style={{ width: `${40 + w * 20}%` }}>{name}</div>
            ))}
          </div>

          <Link to={`/organizations/${orgId}/dashboard`} className="btn btn-primary gen-dashboard-link">
            Open full dashboard
          </Link>
        </div>
      )}
    </div>
  );
}