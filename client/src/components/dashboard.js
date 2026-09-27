import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import "../styles/dashboard.css";

const API_BASE = "http://127.0.0.1:5000/api";

function authHeaders() {
  const token = localStorage.getItem("archify_token");
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

const DONUT_COLORS = ["#2fcb84", "#55e6a5", "#e7b256", "#86ab97", "#4a9d75", "#c98f3a"];

function CostDonut({ rows }) {
  const total = rows.reduce((sum, r) => sum + r.cost_usd, 0) || 1;
  const size = 168;
  const stroke = 22;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  let offsetAcc = 0;

  return (
    <div className="donut-wrap">
      <svg viewBox={`0 0 ${size} ${size}`} className="donut-svg" role="img" aria-label="Hardware cost by category">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--surface-raised)" strokeWidth={stroke} />
        {rows.map((r, i) => {
          const pct = r.cost_usd / total;
          const dash = pct * circumference;
          const el = (
            <circle
              key={r.category}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={DONUT_COLORS[i % DONUT_COLORS.length]}
              strokeWidth={stroke}
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offsetAcc}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
              strokeLinecap="butt"
            />
          );
          offsetAcc += dash;
          return el;
        })}
        <text x="50%" y="47%" textAnchor="middle" className="donut-center-value">
          ${Math.round(total / 1000)}k
        </text>
        <text x="50%" y="60%" textAnchor="middle" className="donut-center-label">
          total cost
        </text>
      </svg>
      <ul className="donut-legend">
        {rows.map((r, i) => (
          <li key={r.category}>
            <span className="donut-swatch" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
            <span className="donut-legend-label">{r.category}</span>
            <span className="mono donut-legend-value">${r.cost_usd.toLocaleString()}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BarRow({ label, value, sublabel, accent }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="barrow">
      <div className="barrow-top">
        <span>{label}</span>
        <span className="mono">{sublabel ?? `${value}%`}</span>
      </div>
      <div className="barrow-track">
        <div className="barrow-fill" style={{ width: `${pct}%`, background: accent }} />
      </div>
    </div>
  );
}

function ConnectivityGauge({ connected, nodes, connections }) {
  const size = 128;
  const stroke = 14;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = connected ? 1 : 0.62;
  const color = connected ? "var(--emerald)" : "var(--gold)";

  return (
    <div className="gauge-wrap">
      <svg viewBox={`0 0 ${size} ${size}`} className="gauge-svg">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--surface-raised)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={`${pct * circumference} ${circumference}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text x="50%" y="46%" textAnchor="middle" className="gauge-value mono">
          {nodes}
        </text>
        <text x="50%" y="62%" textAnchor="middle" className="gauge-label">
          nodes
        </text>
      </svg>
      <div className="gauge-caption">
        <strong style={{ color }}>{connected ? "Fully connected" : "Disconnected segments"}</strong>
        <span>{connections} connections</span>
      </div>
    </div>
  );
}

function HopChain({ hops }) {
  const dots = Array.from({ length: hops + 1 });
  return (
    <div className="hopchain">
      {dots.map((_, i) => (
        <React.Fragment key={i}>
          <span className={`hopchain-dot ${i === 0 ? "hopchain-dot-core" : ""} ${i === dots.length - 1 ? "hopchain-dot-access" : ""}`} />
          {i < dots.length - 1 && <span className="hopchain-line" />}
        </React.Fragment>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { orgId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`${API_BASE}/organizations/${orgId}/dashboard`, { headers: authHeaders() });
        const json = await res.json();
        if (!json.success) {
          setError(json.message);
          return;
        }
        setData(json.data);
      } catch (err) {
        setError("Could not reach the server.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [orgId]);

  if (loading) return <p className="status-text">Loading dashboard...</p>;
  if (error) return <p className="status-text status-text-error">{error}</p>;
  if (!data) return null;

  if (data.status === "no_requirements") {
    return (
      <div className="dash-empty panel">
        <p>No requirements have been defined yet.</p>
        <Link to={`/organizations/${orgId}/requirements`} className="btn btn-primary">
          Add requirements
        </Link>
      </div>
    );
  }
  if (data.status === "requirements_saved") {
    return (
      <div className="dash-empty panel">
        <p>Requirements are saved but no design has been generated yet.</p>
        <Link to={`/organizations/${orgId}/generation`} className="btn btn-primary">
          Generate the design
        </Link>
      </div>
    );
  }

  const { overview, methodology, hardware, vlans, ip_plan, network_analysis, assumptions, warnings, design } = data;
  const complexityPct = Math.max(4, Math.min(100, (methodology.complexity_score / 10) * 100));

  return (
    <div className="dash-screen">
      <Link to={`/organizations/${orgId}`} className="dash-back">
        &larr; Back to organization
      </Link>

      <div className="dash-header">
        <div>
          <h1>{overview.organization.name}</h1>
          <p className="dash-summary">{overview.summary}</p>
        </div>
        <div className="dash-header-badges">
          {data.status === "stale" && <span className="badge dash-stale-badge">Stale — requirements changed</span>}
          <span className="badge">v{design.version}</span>
        </div>
      </div>

      <div className="dash-kpi-row">
        <div className="dash-kpi panel">
          <span className="mono">{overview.totals.sites}</span>Sites
        </div>
        <div className="dash-kpi panel">
          <span className="mono">{overview.totals.vlans}</span>VLANs
        </div>
        <div className="dash-kpi panel">
          <span className="mono">{overview.totals.network_devices}</span>Network devices
        </div>
        <div className="dash-kpi panel">
          <span className="mono">{overview.totals.access_points}</span>Access points
        </div>
        <div className="dash-kpi dash-kpi-accent panel">
          <span className="mono">${overview.totals.estimated_cost_usd.toLocaleString()}</span>Est. cost
        </div>
      </div>

      <div className="dash-row">
        <section className="dash-section panel dash-span-2">
          <h2>Methodology</h2>
          <p className="dash-methodology-name">
            <strong>{methodology.name}</strong>
          </p>
          <BarRow label="Complexity score" value={complexityPct} sublabel={`${methodology.complexity_score}`} accent="var(--emerald)" />
          <p className="dash-redundancy">{methodology.redundancy_description}</p>
          <ul className="dash-list">
            {methodology.rationale.slice(0, 6).map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </section>

        <section className="dash-section panel">
          <h2>Network analysis</h2>
          <ConnectivityGauge
            connected={network_analysis.graph.is_connected}
            nodes={network_analysis.graph.nodes}
            connections={network_analysis.graph.connections}
          />
          <div className="dash-hops">
            <span className="dash-hops-label">Max hops to access — {network_analysis.hops.max_hops_to_access}</span>
            <HopChain hops={network_analysis.hops.max_hops_to_access} />
          </div>
        </section>
      </div>

      <div className="dash-row">
        <section className="dash-section panel dash-span-2">
          <h2>Hardware &amp; cost</h2>
          <CostDonut rows={hardware.totals_by_category} />
        </section>

        {network_analysis.single_points_of_failure.length > 0 && (
          <section className="dash-section panel">
            <h2>Single points of failure</h2>
            {network_analysis.single_points_of_failure.slice(0, 6).map((c) => (
              <BarRow
                key={c.node}
                label={c.label}
                value={c.share_of_endpoints_percent}
                sublabel={`${c.endpoints_cut_off} cut off`}
                accent="var(--danger)"
              />
            ))}
          </section>
        )}
      </div>

      <section className="dash-section panel">
        <h2>VLANs</h2>
        <div className="dash-table-wrap">
          <table className="dash-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Site</th>
                <th>Subnet</th>
                <th>Gateway</th>
                <th>Hosts</th>
              </tr>
            </thead>
            <tbody>
              {vlans.map((v) => (
                <tr key={`${v.site}-${v.vlan_id}`}>
                  <td className="mono">{v.vlan_id}</td>
                  <td>{v.name}</td>
                  <td>{v.site}</td>
                  <td className="mono">{v.subnet}</td>
                  <td className="mono">{v.gateway}</td>
                  <td className="mono">{v.hosts_planned}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="dash-section panel">
        <h2>IP addressing — {ip_plan.method}</h2>
        <p className="dash-base-net">
          Base network: <code className="mono">{ip_plan.base_network}</code>
        </p>
        <div className="dash-ip-grid">
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Subnet</th>
                  <th>Site</th>
                  <th>CIDR</th>
                  <th>Usable hosts</th>
                </tr>
              </thead>
              <tbody>
                {ip_plan.subnets.map((s) => (
                  <tr key={s.cidr}>
                    <td>{s.name}</td>
                    <td>{s.site}</td>
                    <td className="mono">{s.cidr}</td>
                    <td className="mono">{s.usable_hosts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="dash-util-list">
            <span className="dash-util-heading">Planned utilization</span>
            {ip_plan.subnets.map((s) => (
              <BarRow key={s.cidr} label={s.name} value={s.planned_utilization_percent} accent="var(--emerald)" />
            ))}
          </div>
        </div>
      </section>

      {warnings.length > 0 && (
        <section className="dash-section panel">
          <h2>Warnings</h2>
          <ul className="dash-warning-list">
            {warnings.map((w, i) => (
              <li key={i} className={`dash-warning dash-warning-${w.severity}`}>
                {w.message}
              </li>
            ))}
          </ul>
        </section>
      )}

      {assumptions.length > 0 && (
        <section className="dash-section panel">
          <h2>Assumptions</h2>
          <ul className="dash-list">
            {assumptions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}