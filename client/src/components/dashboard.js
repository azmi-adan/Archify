import React, { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import "../styles/dashboard.css";

const API_BASE = "http://127.0.0.1:5000/api";

function authHeaders() {
  const token = localStorage.getItem("archify_token");
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

const DONUT_COLORS = ["#2fcb84", "#55e6a5", "#e7b256", "#86ab97", "#4a9d75", "#c98f3a"];

/* ------------------------------------------------------------------ */
/*  Network helpers                                                    */
/* ------------------------------------------------------------------ */

const ipToInt = (ip) => ip.split(".").reduce((a, o) => a * 256 + Number(o), 0);
const intToIp = (n) => [24, 16, 8, 0].map((s) => (n >>> s) & 255).join(".");

function cidrInfo(cidr) {
  const [ip, p] = cidr.split("/");
  const prefix = Number(p);
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const net = (ipToInt(ip) & mask) >>> 0;
  const size = 2 ** (32 - prefix);
  const bcast = net + size - 1;
  return {
    prefix,
    net,
    bcast,
    size,
    usable: Math.max(size - 2, 0),
    address: intToIp(net),
    mask: intToIp(mask),
    wildcard: intToIp(~mask >>> 0),
    broadcast: intToIp(bcast),
    first: intToIp(net + 1),
    last: intToIp(bcast - 1),
  };
}

const CATEGORIES = {
  management: { label: "Management", color: "#e7b256", icon: "shield" },
  servers: { label: "Servers", color: "#2fcb84", icon: "server" },
  voip: { label: "VoIP", color: "#6aa7ff", icon: "phone" },
  cctv: { label: "CCTV", color: "#e2604f", icon: "camera" },
  iot: { label: "IoT", color: "#4fd1c5", icon: "chip" },
  guest: { label: "Guest Wi-Fi", color: "#c792ea", icon: "wifi" },
  printers: { label: "Printers", color: "#9aa5b1", icon: "printer" },
  users: { label: "Users & teams", color: "#55e6a5", icon: "users" },
};

function categorize(name = "") {
  const n = name.toLowerCase();
  if (n.includes("manage")) return "management";
  if (n.includes("server")) return "servers";
  if (n.includes("voip") || n.includes("voice") || n.includes("phone")) return "voip";
  if (n.includes("cctv") || n.includes("camera")) return "cctv";
  if (n.includes("iot")) return "iot";
  if (n.includes("guest")) return "guest";
  if (n.includes("print")) return "printers";
  return "users";
}

const ICON_PATHS = {
  shield: "M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6l8-3z M9 12l2 2 4-4",
  server: "M4 4h16v6H4z M4 14h16v6H4z M8 7h.01 M8 17h.01",
  phone:
    "M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z",
  camera: "M23 7l-7 5 7 5V7z M1 5h15v14H1z",
  chip: "M5 5h14v14H5z M9 9h6v6H9z M9 2v3 M15 2v3 M9 19v3 M15 19v3 M2 9h3 M2 15h3 M19 9h3 M19 15h3",
  wifi: "M5 12.55a11 11 0 0 1 14.08 0 M1.42 9a16 16 0 0 1 21.16 0 M8.53 16.11a6 6 0 0 1 6.95 0 M12 20h.01",
  printer: "M6 9V2h12v7 M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2 M6 14h12v8H6z",
  users:
    "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75",
  copy: "M9 9h11v11H9z M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1",
  check: "M20 6L9 17l-5-5",
  chevron: "M6 9l6 6 6-6",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.35-4.35",
  alert: "M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z M12 9v4 M12 17h.01",
  globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M3 12h18 M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z",
  database: "M12 8c4.4 0 8-1.3 8-3s-3.6-3-8-3-8 1.3-8 3 3.6 3 8 3z M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5 M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3",
  zap: "M13 2L3 14h9l-1 8 10-12h-9l1-8z",
  layers: "M12 2L2 7l10 5 10-5-10-5z M2 17l10 5 10-5 M2 12l10 5 10-5",
  coins: "M12 1v22 M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
  gauge: "M12 14l4-4 M3.34 19a10 10 0 1 1 17.32 0",
  route: "M6 3v12 M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M18 9a9 9 0 0 1-9 9",
  info: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 16v-4 M12 8h.01",
};

function Icon({ name, size = 18 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}

function useCopy() {
  const [copied, setCopied] = useState("");
  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
      setTimeout(() => setCopied(""), 1400);
    } catch {
      /* clipboard unavailable — ignore */
    }
  };
  return [copied, copy];
}

/* ------------------------------------------------------------------ */
/*  Existing dashboard widgets (unchanged)                             */
/* ------------------------------------------------------------------ */

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

function spread(n, width, pad = 70) {
  if (n === 1) return [width / 2];
  const step = (width - pad * 2) / (n - 1);
  return Array.from({ length: n }, (_, i) => pad + step * i);
}

function LayeredTopology({ sites, accessSwitches, accessPoints, redundant, maxHops }) {
  const W = 760, H = 380;
  const MAX_DIST = 6, MAX_ACC = 10;
  const distCount = Math.min(Math.max(sites, 1), MAX_DIST);
  const accCount = Math.min(Math.max(accessSwitches, 1), MAX_ACC);
  const coreX = redundant ? [W / 2 - 55, W / 2 + 55] : [W / 2];
  const distX = spread(distCount, W - 120, 60).map((x) => x + 60);
  const accX = spread(accCount, W - 120, 40).map((x) => x + 60);
  const yCore = 60, yDist = 190, yAcc = 320;
  const overflowAcc = accessSwitches - accCount;
  const overflowDist = sites - distCount;

  return (
    <div className="topo-wrap">
      <div className="topo-scroll">
      <svg viewBox={`0 0 ${W} ${H}`} className="topo-diagram" role="img" aria-label="Suggested layered network topology">
        <defs>
          <linearGradient id="bandCore" x1="0" x2="1"><stop offset="0" stopColor="rgba(47,203,132,0.10)" /><stop offset="1" stopColor="rgba(47,203,132,0)" /></linearGradient>
        </defs>
        <rect x="0" y={yCore - 42} width={W} height="84" rx="10" fill="url(#bandCore)" />
        <rect x="0" y={yDist - 42} width={W} height="84" rx="10" fill="url(#bandCore)" opacity="0.6" />
        <rect x="0" y={yAcc - 42} width={W} height="84" rx="10" fill="url(#bandCore)" opacity="0.35" />
        <text x="14" y={yCore - 26} className="topo-layer-label">CORE</text>
        <text x="14" y={yDist - 26} className="topo-layer-label">DISTRIBUTION</text>
        <text x="14" y={yAcc - 26} className="topo-layer-label">ACCESS</text>

        {coreX.map((cx) => distX.map((dx, i) => (
          <line key={`cd-${cx}-${i}`} x1={cx} y1={yCore} x2={dx} y2={yDist} className="topo-edge topo-edge-core" />
        )))}
        {coreX.length === 2 && <line x1={coreX[0]} y1={yCore} x2={coreX[1]} y2={yCore} className="topo-edge topo-edge-core" strokeDasharray="4 4" />}
        {accX.map((ax, i) => (
          <line key={`da-${i}`} x1={distX[i % distCount]} y1={yDist} x2={ax} y2={yAcc} className="topo-edge" />
        ))}

        {coreX.map((cx, i) => (
          <g key={`core-${i}`} className="topo-core">
            <circle cx={cx} cy={yCore} r="20" />
            <text x={cx} y={yCore + 4} textAnchor="middle" className="topo-node-text">CORE</text>
          </g>
        ))}
        {distX.map((dx, i) => (
          <g key={`dist-${i}`} className="topo-dist">
            <rect x={dx - 15} y={yDist - 15} width="30" height="30" rx="7" transform={`rotate(45 ${dx} ${yDist})`} />
            <text x={dx} y={yDist + 30} textAnchor="middle" className="topo-caption">Site {i + 1}</text>
          </g>
        ))}
        {overflowDist > 0 && <text x={W - 50} y={yDist + 4} className="topo-caption">+{overflowDist} sites</text>}
        {accX.map((ax, i) => (
          <g key={`acc-${i}`} className="topo-acc">
            <rect x={ax - 11} y={yAcc - 11} width="22" height="22" rx="4" />
            {i < accCount && <circle cx={ax} cy={yAcc + 30} r="3" className="topo-ap" />}
          </g>
        ))}
        {overflowAcc > 0 && <text x={W - 40} y={yAcc + 4} className="topo-caption">+{overflowAcc}</text>}
      </svg>
      </div>
      <div className="topo-legend">
        <span><i className="lg lg-core" />Core {redundant ? "(redundant pair)" : "switch"}</span>
        <span><i className="lg lg-dist" />Distribution per site ({sites})</span>
        <span><i className="lg lg-acc" />Access switches ({accessSwitches})</span>
        <span><i className="lg lg-ap" />Access points ({accessPoints})</span>
        <span className="mono topo-hops">max {maxHops} hops to access</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  NEW: shared site tabs                                              */
/* ------------------------------------------------------------------ */

function SiteTabs({ sites, value, onChange, counts, allCount }) {
  return (
    <div className="site-tabs" role="tablist" aria-label="Filter by site">
      {allCount != null && (
        <button
          role="tab"
          aria-selected={value === "all"}
          className="site-tab"
          onClick={() => onChange("all")}
        >
          All sites <i>{allCount}</i>
        </button>
      )}
      {sites.map((s) => (
        <button
          key={s}
          role="tab"
          aria-selected={value === s}
          className="site-tab"
          onClick={() => onChange(s)}
        >
          {s} {counts && <i>{counts[s]}</i>}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  NEW: VLAN explorer (cards + table)                                 */
/* ------------------------------------------------------------------ */

const TICKS = 20;

function HostMeter({ pct }) {
  const on = pct > 0 ? Math.max(1, Math.round((pct / 100) * TICKS)) : 0;
  return (
    <div className="hostmeter" aria-hidden="true">
      {Array.from({ length: TICKS }, (_, i) => (
        <span key={i} className={i < on ? "tick tick-on" : "tick"} />
      ))}
    </div>
  );
}

function VlanCard({ v, index, showSite, open, onToggle, copied, onCopy }) {
  const c = CATEGORIES[v.cat];
  const fact = (label, value) => (
    <div>
      <dt>{label}</dt>
      <dd className="mono">{value}</dd>
    </div>
  );
  return (
    <article
      className={`vcard ${open ? "vcard-open" : ""}`}
      style={{ "--accent": c.color, "--i": Math.min(index, 14) }}
    >
      <button className="vcard-head" onClick={onToggle} aria-expanded={open}>
        <span className="vcard-icon"><Icon name={c.icon} /></span>
        <span className="vcard-title">
          <strong>{v.name}</strong>
          <em>{showSite ? v.site : c.label}</em>
        </span>
        <span className="vcard-id mono" aria-label={`VLAN ${v.vlan_id}`}>
          <small>VLAN</small>
          {v.vlan_id}
        </span>
      </button>

      <div className="vcard-subnet">
        <span className="mono">
          {v.info.address}
          <b>/{v.info.prefix}</b>
        </span>
        <button
          className="copy-btn"
          onClick={() => onCopy(v.subnet)}
          aria-label={`Copy ${v.subnet}`}
          title="Copy subnet"
        >
          <Icon name={copied === v.subnet ? "check" : "copy"} size={15} />
        </button>
      </div>

      <HostMeter pct={v.pct} />
      <div className="vcard-foot">
        <span>
          gw <span className="mono">{v.gateway}</span>
        </span>
        <span className={v.pct >= 80 ? "vcard-hot" : ""}>
          <span className="mono">{v.hosts_planned}</span> / {v.usable} hosts
        </span>
      </div>

      {open && (
        <dl className="vcard-detail">
          {fact("Network", v.info.address)}
          {fact("Broadcast", v.info.broadcast)}
          {fact("First usable", v.info.first)}
          {fact("Last usable", v.info.last)}
          {fact("Mask", v.info.mask)}
          {fact("Wildcard", v.info.wildcard)}
        </dl>
      )}
    </article>
  );
}

function VlanExplorer({ vlans, subnets }) {
  const [site, setSite] = useState("");
  const [cat, setCat] = useState(null);
  const [q, setQ] = useState("");
  const [view, setView] = useState("cards");
  const [open, setOpen] = useState(null);
  const [copied, copy] = useCopy();

  const subnetByCidr = useMemo(() => Object.fromEntries(subnets.map((s) => [s.cidr, s])), [subnets]);

  const rows = useMemo(
    () =>
      vlans.map((v) => {
        const info = cidrInfo(v.subnet);
        const usable = subnetByCidr[v.subnet]?.usable_hosts ?? info.usable;
        const pct = usable ? Math.min(100, Math.round((v.hosts_planned / usable) * 100)) : 0;
        return { ...v, info, usable, pct, cat: categorize(v.name), key: `${v.site}-${v.vlan_id}-${v.subnet}` };
      }),
    [vlans, subnetByCidr]
  );

  const sites = useMemo(() => [...new Set(rows.map((r) => r.site))], [rows]);
  const counts = useMemo(() => {
    const m = {};
    rows.forEach((r) => (m[r.site] = (m[r.site] || 0) + 1));
    return m;
  }, [rows]);

  const activeSite = site || sites[0] || "all";
  const scoped = activeSite === "all" ? rows : rows.filter((r) => r.site === activeSite);

  const catCounts = useMemo(() => {
    const m = {};
    scoped.forEach((r) => (m[r.cat] = (m[r.cat] || 0) + 1));
    return m;
  }, [scoped]);

  const needle = q.trim().toLowerCase();
  const visible = scoped.filter(
    (r) =>
      (!cat || r.cat === cat) &&
      (!needle || `${r.name} ${r.site} ${r.subnet} ${r.gateway} ${r.vlan_id}`.toLowerCase().includes(needle))
  );

  const totalHosts = scoped.reduce((s, r) => s + r.hosts_planned, 0);
  const totalAddr = scoped.reduce((s, r) => s + r.info.size, 0);
  const avgUtil = scoped.length ? Math.round(scoped.reduce((s, r) => s + r.pct, 0) / scoped.length) : 0;

  const changeSite = (s) => {
    setSite(s);
    setCat(null);
    setOpen(null);
  };

  return (
    <section className="dash-section panel vx">
      <div className="vx-head">
        <div>
          <h2>VLANs</h2>
          <p className="vx-sub">Every segment, its address block and how full it is planned to get.</p>
        </div>
        <div className="vx-tools">
          <label className="vx-search">
            <Icon name="search" size={15} />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, subnet, gateway"
              aria-label="Search VLANs"
            />
          </label>
          <div className="seg" role="group" aria-label="View">
            <button aria-pressed={view === "cards"} onClick={() => setView("cards")}>Cards</button>
            <button aria-pressed={view === "table"} onClick={() => setView("table")}>Table</button>
          </div>
        </div>
      </div>

      <SiteTabs sites={sites} value={activeSite} onChange={changeSite} counts={counts} allCount={rows.length} />

      <div className="vx-stats">
        <div><span className="mono">{scoped.length}</span>VLANs</div>
        <div><span className="mono">{totalHosts.toLocaleString()}</span>hosts planned</div>
        <div><span className="mono">{totalAddr.toLocaleString()}</span>addresses allocated</div>
        <div><span className="mono">{avgUtil}%</span>average fill</div>
      </div>

      <div className="vx-chips" role="group" aria-label="Filter by VLAN type">
        {Object.entries(CATEGORIES)
          .filter(([k]) => catCounts[k])
          .map(([k, c]) => (
            <button
              key={k}
              className="vx-chip"
              style={{ "--accent": c.color }}
              aria-pressed={cat === k}
              onClick={() => setCat(cat === k ? null : k)}
            >
              <i />
              {c.label}
              <b className="mono">{catCounts[k]}</b>
            </button>
          ))}
      </div>

      {visible.length === 0 ? (
        <div className="vx-empty">
          <p>No VLANs match these filters.</p>
          <button className="btn" onClick={() => { setQ(""); setCat(null); }}>Clear filters</button>
        </div>
      ) : view === "cards" ? (
        <div className="vcard-grid" key={activeSite}>
          {visible.map((v, i) => (
            <VlanCard
              key={v.key}
              v={v}
              index={i}
              showSite={activeSite === "all"}
              open={open === v.key}
              onToggle={() => setOpen(open === v.key ? null : v.key)}
              copied={copied}
              onCopy={copy}
            />
          ))}
        </div>
      ) : (
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
                <th>Fill</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((v) => (
                <tr key={v.key}>
                  <td className="mono">{v.vlan_id}</td>
                  <td>
                    <span className="dot" style={{ background: CATEGORIES[v.cat].color }} />
                    {v.name}
                  </td>
                  <td>{v.site}</td>
                  <td className="mono">{v.subnet}</td>
                  <td className="mono">{v.gateway}</td>
                  <td className="mono">{v.hosts_planned}</td>
                  <td className="mono">{v.pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  NEW: address space (heatmap, strip, bit inspector)                 */
/* ------------------------------------------------------------------ */

function AddressHeatmap({ baseNetwork, infos, activeSite }) {
  const base = cidrInfo(baseNetwork);
  if (base.prefix > 24) return null;
  const n = Math.min(256, 2 ** (24 - base.prefix));
  const cells = Array.from({ length: n }, (_, i) => {
    const start = base.net + i * 256;
    const end = start + 255;
    let filled = 0;
    let mine = false;
    infos.forEach((s) => {
      const lo = Math.max(start, s.info.net);
      const hi = Math.min(end, s.info.bcast);
      if (hi >= lo) {
        filled += hi - lo + 1;
        if (s.site === activeSite) mine = true;
      }
    });
    return { i, start, fill: Math.min(1, filled / 256), mine };
  });

  return (
    <div className="heat-wrap">
      <div className="heat" role="img" aria-label={`Allocation map of ${baseNetwork}, one square per /24`}>
        {cells.map((c) => (
          <span
            key={c.i}
            className={`heat-cell ${c.fill ? "heat-used" : ""} ${c.mine ? "heat-mine" : ""}`}
            style={c.fill ? { opacity: 0.35 + 0.65 * c.fill } : undefined}
            title={`${intToIp(c.start)}/24 · ${Math.round(c.fill * 100)}% allocated`}
          />
        ))}
      </div>
      <div className="heat-legend">
        <span><i className="heat-key heat-key-mine" />selected site</span>
        <span><i className="heat-key heat-key-used" />other sites</span>
        <span><i className="heat-key" />free /24</span>
      </div>
    </div>
  );
}

function BitInspector({ s }) {
  const octets = s.info.address.split(".").map(Number);
  const fact = (label, value) => (
    <div>
      <dt>{label}</dt>
      <dd className="mono">{value}</dd>
    </div>
  );
  const c = CATEGORIES[s.cat];
  return (
    <div className="inspect" style={{ "--accent": c.color }}>
      <div className="inspect-title">
        <span className="vcard-icon"><Icon name={c.icon} /></span>
        <div>
          <strong>{s.name}</strong>
          <span>{s.site}</span>
        </div>
        <span className="inspect-cidr mono">{s.cidr}</span>
      </div>

      <div className="bits" role="img" aria-label={`${s.info.prefix} network bits, ${32 - s.info.prefix} host bits`}>
        {octets.map((o, oi) => (
          <div className="octet" key={oi}>
            <div className="octet-bits">
              {Array.from({ length: 8 }, (_, j) => {
                const idx = oi * 8 + j;
                return (
                  <span key={j} className={idx < s.info.prefix ? "bit bit-net" : "bit bit-host"}>
                    {(o >> (7 - j)) & 1}
                  </span>
                );
              })}
            </div>
            <span className="octet-dec mono">{o}</span>
          </div>
        ))}
      </div>
      <div className="bits-legend">
        <span><i className="bit-key bit-net" />{s.info.prefix} network bits</span>
        <span><i className="bit-key bit-host" />{32 - s.info.prefix} host bits</span>
      </div>

      <dl className="inspect-facts">
        {fact("Network", s.info.address)}
        {fact("Broadcast", s.info.broadcast)}
        {fact("First usable", s.info.first)}
        {fact("Last usable", s.info.last)}
        {fact("Mask", s.info.mask)}
        {fact("Wildcard", s.info.wildcard)}
        {fact("Usable hosts", s.usable_hosts)}
        {fact("Planned fill", `${s.planned_utilization_percent}%`)}
      </dl>
    </div>
  );
}

function AddressSpace({ ipPlan }) {
  const { subnets, base_network: baseNetwork, method } = ipPlan;
  const [site, setSite] = useState("");
  const [sel, setSel] = useState(null);

  const infos = useMemo(
    () => subnets.map((s) => ({ ...s, info: cidrInfo(s.cidr), cat: categorize(s.name) })),
    [subnets]
  );
  const sites = useMemo(() => [...new Set(infos.map((s) => s.site))], [infos]);
  const activeSite = site || sites[0];
  const mine = useMemo(
    () => infos.filter((s) => s.site === activeSite).sort((a, b) => a.info.net - b.info.net),
    [infos, activeSite]
  );
  const selected = mine.find((s) => s.cidr === sel) || mine[0];

  const base = cidrInfo(baseNetwork);
  const allocated = infos.reduce((sum, s) => sum + s.info.size, 0);
  const allocPct = ((allocated / base.size) * 100).toFixed(1);
  const siteSize = mine.reduce((sum, s) => sum + s.info.size, 0);
  const siteStart = mine.length ? mine[0].info.net : 0;
  const siteEnd = mine.length ? Math.max(...mine.map((s) => s.info.bcast)) : 0;

  if (!infos.length) return null;

  return (
    <section className="dash-section panel ax">
      <div className="vx-head">
        <div>
          <h2>IP addressing — {method}</h2>
          <p className="vx-sub">
            Carved from <code className="mono">{baseNetwork}</code>. Pick a site, then a subnet to see its bits.
          </p>
        </div>
      </div>

      <div className="ax-overview">
        <AddressHeatmap baseNetwork={baseNetwork} infos={infos} activeSite={activeSite} />
        <div className="ax-stats">
          <div><span className="mono">{allocated.toLocaleString()}</span>addresses allocated</div>
          <div><span className="mono">{allocPct}%</span>of {baseNetwork}</div>
          <div><span className="mono">{infos.length}</span>subnets across {sites.length} sites</div>
        </div>
      </div>

      <SiteTabs sites={sites} value={activeSite} onChange={(s) => { setSite(s); setSel(null); }} />

      <div className="strip-head">
        <span className="mono">{intToIp(siteStart)}</span>
        <span>{siteSize.toLocaleString()} addresses · {mine.length} subnets</span>
        <span className="mono">{intToIp(siteEnd)}</span>
      </div>
      <div className="strip" role="group" aria-label={`Address blocks for ${activeSite}`}>
        {mine.map((s) => (
          <button
            key={s.cidr}
            className={`strip-seg ${selected && selected.cidr === s.cidr ? "strip-seg-on" : ""}`}
            style={{ "--accent": CATEGORIES[s.cat].color, flexGrow: s.info.size }}
            onClick={() => setSel(s.cidr)}
            title={`${s.name} · ${s.cidr}`}
          >
            <span className="strip-name">{s.name}</span>
            <b className="mono">/{s.info.prefix}</b>
          </button>
        ))}
      </div>

      <div className="ax-split">
        <ul className="ledger">
          {mine.map((s) => (
            <li key={s.cidr}>
              <button
                className={`ledger-row ${selected && selected.cidr === s.cidr ? "ledger-row-on" : ""}`}
                style={{ "--accent": CATEGORIES[s.cat].color }}
                onClick={() => setSel(s.cidr)}
              >
                <i className="dot" />
                <span className="ledger-name">{s.name}</span>
                <span className="mono ledger-cidr">{s.cidr}</span>
                <span className="ledger-bar">
                  <span style={{ width: `${Math.min(100, s.planned_utilization_percent)}%` }} />
                </span>
                <span className="mono ledger-pct">{s.planned_utilization_percent}%</span>
              </button>
            </li>
          ))}
        </ul>
        {selected && <BitInspector s={selected} />}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  NEW: hero, warnings and assumptions                                */
/* ------------------------------------------------------------------ */

/* Highlights figures such as 20%, 7 W, 4 Mbps, 127.0 TB, /30 inside a sentence */
function Rich({ text }) {
  const parts = text.split(/(\d+(?:\.\d+)?\s?(?:%|Mbps|TB|W\b)|\/30)/g);
  return parts.map((p, i) =>
    i % 2 ? (
      <b key={i} className="fig">{p}</b>
    ) : (
      <React.Fragment key={i}>{p}</React.Fragment>
    )
  );
}

function useCountUp(target) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!Number.isFinite(target)) return undefined;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setV(target);
      return undefined;
    }
    let raf;
    let start;
    const step = (t) => {
      if (start == null) start = t;
      const p = Math.min(1, (t - start) / 900);
      setV(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return v;
}

function SpecTile({ label, value, prefix = "", note, accent }) {
  const numeric = typeof value === "number";
  const shown = useCountUp(numeric ? value : 0);
  return (
    <div className={`spec ${accent ? "spec-accent" : ""}`}>
      <dt>{label}</dt>
      <dd className="mono">{numeric ? `${prefix}${shown.toLocaleString()}` : value}</dd>
      {note && <small>{note}</small>}
    </div>
  );
}

function Hero({ name, summary = "", ipPlan, cost, version, stale }) {
  const grab = (re) => {
    const m = summary.match(re);
    return m ? Number(m[1].replace(/,/g, "")) : null;
  };
  const staff = grab(/([\d,]+)\s+staff/i);
  const endpoints = grab(/([\d,]+)\s+planned endpoints/i);
  return (
    <header className="hero">
      <div className="hero-copy">
        <div className="hero-badges">
          {stale && <span className="badge dash-stale-badge">Stale — requirements changed</span>}
          <span className="badge">Design v{version}</span>
        </div>
        <h1>{name}</h1>
        <p className="hero-summary">{summary}</p>
      </div>
      <dl className="hero-specs">
        {staff != null && <SpecTile label="Staff" value={staff} note="people on the network" />}
        {endpoints != null && <SpecTile label="Planned endpoints" value={endpoints} note="including growth" />}
        <SpecTile label="Addressing" value={ipPlan.method} note={ipPlan.base_network} />
        <SpecTile label="Hardware cost" value={cost} prefix="$" note="indicative estimate" accent />
      </dl>
    </header>
  );
}

const SEV_ORDER = ["high", "medium", "low"];
const SEV_LABEL = { high: "High", medium: "Medium", low: "Low" };
const WARN_TYPES = [
  [/address|subnet|utiliz/i, { label: "Address usage", icon: "route" }],
  [/phone|PBX|telephony|voip/i, { label: "Voice resilience", icon: "phone" }],
  [/WAN|LTE|backup/i, { label: "WAN redundancy", icon: "globe" }],
  [/\bTB\b|retention|storage/i, { label: "Storage", icon: "database" }],
];

function classifyWarning(w) {
  const msg = w.message || "";
  const sev = SEV_ORDER.includes(w.severity) ? w.severity : "medium";
  const m = msg.match(
    /^(.*?) router is a single point of failure: losing it cuts off (\d+) nodes? \((\d+) endpoints?, ([\d.]+)% of the network\)/i
  );
  if (m) return { kind: "spof", sev, site: m[1], nodes: +m[2], endpoints: +m[3], pct: parseFloat(m[4]) };
  if (/single points? of failure/i.test(msg)) {
    const more = msg.match(/(\d+) further/i);
    return { kind: "spof-more", sev, more: more ? +more[1] : null };
  }
  const t = (WARN_TYPES.find(([re]) => re.test(msg)) || [null, { label: "Heads up", icon: "alert" }])[1];
  return { kind: "note", sev, msg, ...t };
}

function WarningsPanel({ warnings }) {
  const [sev, setSev] = useState(null);
  const items = useMemo(() => warnings.map(classifyWarning), [warnings]);
  const counts = useMemo(() => {
    const c = { high: 0, medium: 0, low: 0 };
    items.forEach((i) => (c[i.sev] += 1));
    return c;
  }, [items]);

  const shown = items.filter((i) => !sev || i.sev === sev);
  const spofs = shown.filter((i) => i.kind === "spof");
  const more = shown.find((i) => i.kind === "spof-more");
  const notes = shown.filter((i) => i.kind === "note");
  const maxPct = Math.max(1, ...spofs.map((s) => s.pct));
  const exposed = spofs.reduce((sum, s) => sum + s.endpoints, 0);

  return (
    <section className="dash-section panel wn">
      <div className="vx-head">
        <div>
          <h2>Warnings</h2>
          <p className="vx-sub">{warnings.length} items to review before this design goes to build.</p>
        </div>
        <div className="sev-chips" role="group" aria-label="Filter by severity">
          {SEV_ORDER.filter((k) => counts[k]).map((k) => (
            <button
              key={k}
              className={`sev-chip sev-${k}`}
              aria-pressed={sev === k}
              onClick={() => setSev(sev === k ? null : k)}
            >
              <i />
              {SEV_LABEL[k]}
              <b className="mono">{counts[k]}</b>
            </button>
          ))}
        </div>
      </div>

      <div className="wn-grid">
        {(spofs.length > 0 || more) && (
          <div className="wn-spof">
            <div className="wn-spof-head">
              <span className="wn-icon"><Icon name="server" /></span>
              <div>
                <strong>Single points of failure</strong>
                <span>
                  {spofs.length} routers listed · {exposed} endpoints exposed
                </span>
              </div>
            </div>
            <ul className="spof-list">
              {spofs.map((s, i) => (
                <li key={`${s.site}-${i}`} className={`sev-${s.sev}`}>
                  <span className="spof-site">{s.site}</span>
                  <span className="spof-bar" aria-hidden="true">
                    <span style={{ width: `${(s.pct / maxPct) * 100}%` }} />
                  </span>
                  <span className="mono spof-num">
                    {s.endpoints}
                    <small> endpoints</small>
                  </span>
                  <span className="mono spof-pct">{s.pct}%</span>
                </li>
              ))}
            </ul>
            {more && (
              <p className="spof-more">
                {more.more ? `${more.more} more critical nodes` : "More critical nodes"} are not shown here. Open the
                network analysis for the full list.
              </p>
            )}
          </div>
        )}

        <div className="wn-notes">
          {notes.map((n, i) => (
            <article key={i} className={`wnote sev-${n.sev}`}>
              <span className="wn-icon"><Icon name={n.icon} /></span>
              <div>
                <strong>{n.label}</strong>
                <p><Rich text={n.msg} /></p>
              </div>
              <span className="wnote-sev">{SEV_LABEL[n.sev]}</span>
            </article>
          ))}
        </div>
      </div>

      {shown.length === 0 && <p className="vx-empty">No warnings at this severity.</p>}
    </section>
  );
}

const ASSUME_GROUPS = [
  ["power", /PoE|spare ports/i, { label: "Ports & power", icon: "zap", color: "#e7b256" }],
  ["bandwidth", /Mbps|circuit|uplink/i, { label: "Bandwidth", icon: "gauge", color: "#6aa7ff" }],
  ["sizing", /growth|spread evenly|headroom/i, { label: "Sizing & growth", icon: "layers", color: "#2fcb84" }],
  ["wireless", /Wi-Fi|IoT|guest/i, { label: "Wireless & IoT", icon: "wifi", color: "#c792ea" }],
  ["addressing", /gateway|subnet|address|\/30/i, { label: "Addressing", icon: "route", color: "#4fd1c5" }],
  ["cost", /cost|price|licen/i, { label: "Costs", icon: "coins", color: "#d98a5b" }],
];
const ASSUME_FALLBACK = ["general", null, { label: "General", icon: "info", color: "#9aa5b1" }];

function AssumptionsPanel({ items }) {
  const groups = useMemo(() => {
    const map = new Map();
    items.forEach((text) => {
      const [key, , meta] = ASSUME_GROUPS.find(([, re]) => re.test(text)) || ASSUME_FALLBACK;
      if (!map.has(key)) map.set(key, { key, ...meta, items: [] });
      map.get(key).items.push(text);
    });
    return [...ASSUME_GROUPS.map((g) => g[0]), "general"].filter((k) => map.has(k)).map((k) => map.get(k));
  }, [items]);

  return (
    <section className="dash-section panel as">
      <div className="vx-head">
        <div>
          <h2>Assumptions</h2>
          <p className="vx-sub">
            {items.length} rules the design was sized with, grouped by area. Change requirements to regenerate.
          </p>
        </div>
      </div>
      <div className="as-grid">
        {groups.map((g) => (
          <article key={g.key} className="as-card" style={{ "--accent": g.color }}>
            <div className="as-head">
              <span className="vcard-icon"><Icon name={g.icon} /></span>
              <strong>{g.label}</strong>
              <span className="as-count mono">{g.items.length}</span>
            </div>
            <ul className="as-list">
              {g.items.map((t, i) => (
                <li key={i}><Rich text={t} /></li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

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

      <Hero
        name={overview.organization.name}
        summary={overview.summary}
        ipPlan={ip_plan}
        cost={overview.totals.estimated_cost_usd}
        version={design.version}
        stale={data.status === "stale"}
      />

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

      <section className="dash-section panel dash-topo-section">
        <div className="dash-topo-head">
          <div>
            <span className="eyebrow">Suggested design</span>
            <h2>Layered network topology</h2>
          </div>
          <span className="badge">hierarchical model</span>
        </div>
        <LayeredTopology
          sites={overview.totals.sites}
          accessSwitches={overview.totals.network_devices}
          accessPoints={overview.totals.access_points}
          redundant={/redundan|dual|high.?avail/i.test(`${methodology.name} ${methodology.redundancy_description}`)}
          maxHops={network_analysis.hops.max_hops_to_access}
        />
      </section>

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

      <VlanExplorer vlans={vlans} subnets={ip_plan.subnets} />

      <AddressSpace ipPlan={ip_plan} />

      {warnings.length > 0 && <WarningsPanel warnings={warnings} />}

      {assumptions.length > 0 && <AssumptionsPanel items={assumptions} />}
    </div>
  );
}