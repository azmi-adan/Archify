
import hashlib
import heapq
import ipaddress
import json
import math
from collections import OrderedDict, deque

from extensions import db, iso, utcnow
from models.requirements import REQUIREMENT_DEFAULTS

ENGINE_VERSION = "1.0.0"


class DesignError(ValueError):
    """Raised when requirements are impossible or exceed what the engine can design."""


# --------------------------------------------------------------------------- #
# Catalogue (generic model classes, indicative list prices in USD)
# --------------------------------------------------------------------------- #
CATALOG = {
    "access_24": {"category": "Access Switch", "model": "24-port Gigabit managed access switch (4x SFP+ uplinks)", "ports": 24, "poe_w": 0, "cost": 550},
    "access_48": {"category": "Access Switch", "model": "48-port Gigabit managed access switch (4x SFP+ uplinks)", "ports": 48, "poe_w": 0, "cost": 950},
    "access_24_poe": {"category": "Access Switch", "model": "24-port Gigabit PoE+ managed access switch, 370 W (4x SFP+ uplinks)", "ports": 24, "poe_w": 370, "cost": 1100},
    "access_48_poe": {"category": "Access Switch", "model": "48-port Gigabit PoE+ managed access switch, 740 W (4x SFP+ uplinks)", "ports": 48, "poe_w": 740, "cost": 2100},
    "dist_l3": {"category": "Distribution Switch", "model": "24-port 10G SFP+ Layer-3 distribution switch", "ports": 24, "cost": 7500},
    "core_star": {"category": "Core Switch", "model": "24-port Layer-3 switch with 10G uplinks (collapsed core)", "ports": 24, "cost": 3200},
    "core_24": {"category": "Core Switch", "model": "24-port 10G SFP+ Layer-3 core switch", "ports": 24, "cost": 9000},
    "core_48": {"category": "Core Switch", "model": "48-port 10/25G Layer-3 core switch", "ports": 48, "cost": 16000},
    "core_chassis": {"category": "Core Switch", "model": "Modular Layer-3 core chassis (up to 96 x 10/25G ports)", "ports": 96, "cost": 45000},
    "server_sw": {"category": "Server Access Switch", "model": "24-port 10G SFP+ top-of-rack server switch", "ports": 24, "cost": 5500},
    "fw_small": {"category": "Firewall", "model": "Next-generation firewall (~1 Gbps threat-protection throughput)", "cost": 2200},
    "fw_medium": {"category": "Firewall", "model": "Next-generation firewall (~5 Gbps threat-protection throughput)", "cost": 8500},
    "fw_large": {"category": "Firewall", "model": "Next-generation firewall (~20 Gbps threat-protection throughput)", "cost": 32000},
    "branch_router": {"category": "Branch Router / Firewall", "model": "Branch router-firewall with site-to-site VPN (SD-WAN ready)", "cost": 1400},
    "ap": {"category": "Wireless Access Point", "model": "Wi-Fi 6 (802.11ax) indoor access point, PoE powered", "cost": 400},
    "wlc": {"category": "Wireless Controller", "model": "Wireless LAN controller (appliance, virtual or cloud-managed)", "cost": 4500},
    "pbx": {"category": "Voice", "model": "IP PBX / call-control server", "cost": 3000},
    "nvr": {"category": "Surveillance", "model": "64-channel network video recorder (NVR) with RAID storage", "cost": 4500},
    "ups_access": {"category": "Power", "model": "1 kVA rack UPS (network closet)", "cost": 450},
    "ups_core": {"category": "Power", "model": "3 kVA rack UPS (core / server room)", "cost": 2200},
    "fiber_run": {"category": "Cabling", "model": "Inter-building single-mode fibre backbone run (2 pairs)", "cost": 3000},
    "cable_drop": {"category": "Cabling", "model": "Structured cabling drop (Cat6A, installed and tested)", "cost": 140},
}

# Behavioural rules per organization type.
PROFILES = {
    "enterprise": {"clients_per_ap": 30, "security_bias": 0, "ha_recommended": False},
    "office": {"clients_per_ap": 30, "security_bias": 0, "ha_recommended": False},
    "school": {"clients_per_ap": 25, "security_bias": 0, "ha_recommended": False},
    "university": {"clients_per_ap": 25, "security_bias": 0, "ha_recommended": False},
    "hospital": {"clients_per_ap": 25, "security_bias": 1, "ha_recommended": True},
    "financial": {"clients_per_ap": 30, "security_bias": 1, "ha_recommended": True},
    "government": {"clients_per_ap": 30, "security_bias": 1, "ha_recommended": True},
    "retail": {"clients_per_ap": 30, "security_bias": 0, "ha_recommended": False},
    "manufacturing": {"clients_per_ap": 30, "security_bias": 0, "ha_recommended": False},
    "hospitality": {"clients_per_ap": 25, "security_bias": 0, "ha_recommended": False},
    "ngo": {"clients_per_ap": 30, "security_bias": 0, "ha_recommended": False},
    "other": {"clients_per_ap": 30, "security_bias": 0, "ha_recommended": False},
}

FLOOR_KEYS = ("employees", "wired", "wireless", "printers", "voip", "cctv", "iot_wired", "iot_wireless", "guest")
UPLINK_TIERS = (1000, 10000, 20000, 40000)
INTERNET_TIERS = (50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000)
WAN_TIERS = (20, 50, 100, 200, 500, 1000)
MAX_SEGMENT_HOSTS = 500  # keeps every broadcast domain at /23 or smaller
POOLS = ("192.168.0.0/16", "172.16.0.0/12", "10.0.0.0/8")

VLAN_IDS = {"management": 10, "servers": 20, "voip": 30, "cctv": 40, "iot": 50, "guest": 60, "printers": 80}
SEGMENT_META = {
    "management": ("management", "Network device management only. Reachable from admin workstations / jump host; no internet; SSH, HTTPS and SNMPv3 only."),
    "servers": ("servers", "Servers and controllers. Inbound only on published service ports; outbound restricted."),
    "voip": ("voice", "IP phones. QoS (DSCP EF) end to end; reachable only to the call server and voice gateway."),
    "cctv": ("surveillance", "Cameras and recorders. Isolated; cameras talk only to the NVR; no internet."),
    "iot": ("iot", "IoT devices. Isolated; internet or gateway access on required ports only; no access to user or server VLANs."),
    "guest": ("guest", "Guest Wi-Fi. Internet only, client isolation, bandwidth limits, captive portal; blocked from every internal network."),
    "printers": ("printers", "Printers. Reachable from user VLANs on print ports only."),
    "users": ("trusted", "Staff endpoints. Access to servers and internet per role; 802.1X / dynamic VLAN assignment recommended."),
}


# --------------------------------------------------------------------------- #
# Small helpers
# --------------------------------------------------------------------------- #
def ceil_div(a, b):
    return -(-int(a) // int(b))


def next_pow2(n):
    n = max(1, int(n))
    return 1 << (n - 1).bit_length()


def split_even(total, parts):
    parts = max(1, parts)
    q, r = divmod(int(total), parts)
    return [q + 1 if i < r else q for i in range(parts)]


def apportion(total, weights):
    """Largest-remainder method: integer shares that sum exactly to `total`."""
    n = len(weights)
    if n == 0:
        return []
    s = sum(weights)
    if s <= 0:
        return split_even(total, n)
    raw = [total * w / s for w in weights]
    base = [int(math.floor(x)) for x in raw]
    leftover = total - sum(base)
    order = sorted(range(n), key=lambda i: (-(raw[i] - base[i]), i))
    for i in order[:leftover]:
        base[i] += 1
    return base


def pick_tier(value, tiers):
    for tier in tiers:
        if value <= tier:
            return tier
    return tiers[-1]


def fmt_bw(mbps):
    return f"{mbps / 1000:g} Gbps" if mbps >= 1000 else f"{mbps:g} Mbps"


def ports_per_link(uplink_mbps):
    return 1 if uplink_mbps < 10000 else ceil_div(uplink_mbps, 10000)


# --------------------------------------------------------------------------- #
# Graph (adjacency list) + algorithms
# --------------------------------------------------------------------------- #
class Graph:
    """Undirected weighted graph stored as an adjacency list."""

    def __init__(self):
        self.adj = {}
        self._edges = set()

    def add_node(self, node):
        self.adj.setdefault(node, [])

    def add_edge(self, u, v, weight=1.0):
        key = frozenset((u, v))
        if u == v or key in self._edges:
            return
        self._edges.add(key)
        self.add_node(u)
        self.add_node(v)
        self.adj[u].append((v, weight))
        self.adj[v].append((u, weight))

    @property
    def edge_count(self):
        return len(self._edges)

    def bfs(self, start, blocked_nodes=frozenset(), blocked_edges=frozenset()):
        """Hop count from `start` to every reachable node (dict keeps BFS visit order)."""
        if start not in self.adj or start in blocked_nodes:
            return {}
        hops = {start: 0}
        queue = deque([start])
        while queue:
            u = queue.popleft()
            for v, _w in self.adj[u]:
                if v in hops or v in blocked_nodes or frozenset((u, v)) in blocked_edges:
                    continue
                hops[v] = hops[u] + 1
                queue.append(v)
        return hops

    def dfs_order(self, start):
        """Iterative depth-first pre-order (alphabetical neighbour order for determinism)."""
        seen, order, stack = set(), [], [start]
        while stack:
            u = stack.pop()
            if u in seen:
                continue
            seen.add(u)
            order.append(u)
            for v, _w in sorted(self.adj[u], key=lambda item: item[0], reverse=True):
                if v not in seen:
                    stack.append(v)
        return order

    def components(self, blocked_nodes=frozenset()):
        seen, comps = set(), []
        for node in self.adj:
            if node in seen or node in blocked_nodes:
                continue
            comp = list(self.bfs(node, blocked_nodes))
            seen.update(comp)
            comps.append(comp)
        return comps

    def dijkstra(self, source):
        """Shortest weighted distances + predecessor map (binary-heap Dijkstra)."""
        dist, prev, done = {source: 0.0}, {}, set()
        heap = [(0.0, source)]
        while heap:
            d, u = heapq.heappop(heap)
            if u in done:
                continue
            done.add(u)
            for v, w in self.adj[u]:
                nd = d + w
                if nd < dist.get(v, math.inf) - 1e-12:
                    dist[v] = nd
                    prev[v] = u
                    heapq.heappush(heap, (nd, v))
        return dist, prev

    @staticmethod
    def path_to(prev, source, target):
        path, node = [target], target
        while node != source:
            node = prev.get(node)
            if node is None:
                return []
            path.append(node)
        return path[::-1]

    def articulation_points_and_bridges(self):
        """Iterative Tarjan: single-pass DFS with discovery / low-link values."""
        disc, low, parent = {}, {}, {}
        points, bridges = set(), []
        timer = 0
        for root in self.adj:
            if root in disc:
                continue
            disc[root] = low[root] = timer
            timer += 1
            parent[root] = None
            root_children = 0
            stack = [(root, iter(self.adj[root]))]
            while stack:
                u, neighbours = stack[-1]
                advanced = False
                for v, _w in neighbours:
                    if v not in disc:
                        parent[v] = u
                        disc[v] = low[v] = timer
                        timer += 1
                        if u == root:
                            root_children += 1
                        stack.append((v, iter(self.adj[v])))
                        advanced = True
                        break
                    if v != parent[u]:
                        low[u] = min(low[u], disc[v])
                if advanced:
                    continue
                stack.pop()
                if stack:
                    p = stack[-1][0]
                    low[p] = min(low[p], low[u])
                    if low[u] > disc[p]:
                        bridges.append((p, u))
                    if p != root and low[u] >= disc[p]:
                        points.add(p)
            if root_children > 1:
                points.add(root)
        return points, bridges


# --------------------------------------------------------------------------- #
# IP helpers
# --------------------------------------------------------------------------- #
class AddressAllocator:
    """Sequential, alignment-aware allocator over one parent block."""

    def __init__(self, block):
        self.block = block
        self.start = int(block.network_address)
        self.end = int(block.broadcast_address)
        self.cursor = self.start

    def allocate(self, prefix):
        size = 1 << (32 - prefix)
        aligned = -(-self.cursor // size) * size
        if aligned + size - 1 > self.end:
            raise DesignError(f"Address space exhausted while allocating a /{prefix} inside {self.block}.")
        self.cursor = aligned + size
        return ipaddress.IPv4Network((aligned, prefix))

    @property
    def remaining(self):
        return self.end - self.cursor + 1


def describe_network(net, gateway_reserve=1):
    total = net.num_addresses
    usable = total - 2
    first = net.network_address + 1
    last = net.broadcast_address - 1
    info = {
        "network_address": str(net.network_address),
        "cidr": str(net),
        "prefix_length": net.prefixlen,
        "subnet_mask": str(net.netmask),
        "wildcard_mask": str(net.hostmask),
        "total_addresses": total,
        "usable_hosts": usable,
        "first_usable": str(first),
        "last_usable": str(last),
        "broadcast": str(net.broadcast_address),
    }
    if gateway_reserve > 0:
        info["gateway"] = str(first)
        info["reserved_ips"] = [str(first + i) for i in range(gateway_reserve)]
    else:
        info["gateway"] = None
        info["reserved_ips"] = []
    return info


# --------------------------------------------------------------------------- #
# The engine
# --------------------------------------------------------------------------- #
class NetworkDesignEngine:
    def __init__(self, requirements):
        self.r = {**REQUIREMENT_DEFAULTS, **(requirements or {})}
        self.assumptions = []
        self.warnings = []
        self.decisions = []
        self.trace = []

    # ---- public --------------------------------------------------------- #
    def run(self):
        self._prepare()
        model = self._choose_model()
        scope = self._initial_scope()
        plan = None
        for _ in range(6):
            plan = self._build_plan(model, scope)
            if plan["overflow"] == "star_capacity":
                self.trace.append("Star topology outgrew a single 24-port core, so the design was escalated to two-tier.")
                model = "two_tier"
                continue
            if plan["overflow"] == "two_tier_core_capacity":
                self.trace.append("Collapsed core would need more than 48 ports, so the design was escalated to three-tier.")
                model = "three_tier"
                continue
            budget = self.r.get("budget_amount_usd")
            if budget and plan["total_cost"] > budget and scope == "full":
                self.trace.append(
                    f"Full redundancy (estimated ${plan['total_cost']:,.0f}) exceeded the ${budget:,.0f} budget, "
                    "so redundancy was reduced to core/edge only."
                )
                scope = "core_only"
                continue
            break
        self.plan, self.model, self.scope = plan, model, scope
        self.dual = scope != "none"

        self._plan_segments()
        self._plan_addressing()
        self._analyze()
        self._finish_warnings()
        return self._assemble()

    # ---- 1. prepare ----------------------------------------------------- #
    def p(self, n):
        """Apply expected growth using integer maths (avoids float ceil surprises)."""
        return ceil_div(int(n) * (100 + self.pct), 100)

    def _prepare(self):
        r = self.r
        for key in ("employees", "wired_devices", "wireless_devices", "servers", "printers", "voip_phones",
                    "cctv_cameras", "iot_devices", "branches", "buildings", "floors_per_building"):
            if not isinstance(r[key], int) or isinstance(r[key], bool) or r[key] < 0:
                raise DesignError(f"'{key}' must be a non-negative whole number.")
        if r["buildings"] < 1 or r["floors_per_building"] < 1:
            raise DesignError("At least one building with one floor is required.")

        self.pct = int(r["expected_growth_percent"])
        self.hr = 125 if r["scalability"] else 110  # headroom percentage on top of growth
        self.spare = 125 if r["scalability"] else 120  # spare switch-port percentage
        self.org_type = r.get("organization_type") or "other"
        self.profile = PROFILES.get(self.org_type, PROFILES["other"])
        self.buildings = r["buildings"]
        self.floors = r["floors_per_building"]
        self.branches = r["branches"]
        self.ha = bool(r["high_availability"])

        sec = {"basic": 0, "standard": 1, "high": 2}[r["security_level"]] + self.profile["security_bias"]
        self.security = "high" if sec >= 2 else "standard" if sec == 1 else "basic"
        self.perf_high = r["performance_level"] == "high"

        # departments (users are people; endpoints are apportioned across them)
        depts = [{"name": d["name"], "users": int(d["users"])} for d in (r.get("departments") or [])]
        dept_total = sum(d["users"] for d in depts)
        emp = r["employees"] or dept_total
        if emp < 1:
            raise DesignError("At least one employee is required.")
        if not depts:
            depts = [{"name": "Staff", "users": emp}]
            self.assumptions.append("No departments were supplied, so all staff are placed in one 'Staff' VLAN.")
        elif dept_total > emp:
            raise DesignError(f"Department users ({dept_total}) exceed total employees ({emp}).")
        elif dept_total < emp:
            depts.append({"name": "General (unassigned staff)", "users": emp - dept_total})
            self.assumptions.append(
                f"{emp - dept_total} employees are not assigned to a department and were grouped into a 'General' VLAN."
            )
        self.departments, self.employees = depts, emp

        iot = r["iot_devices"]
        iot_wired = ceil_div(iot * 40, 100)
        guest = max(10, ceil_div(emp * 20, 100)) if r["guest_wifi"] else 0
        total = {
            "employees": emp,
            "wired": r["wired_devices"],
            "wireless": r["wireless_devices"],
            "servers": r["servers"],
            "printers": r["printers"],
            "voip": r["voip_phones"],
            "cctv": r["cctv_cameras"],
            "iot_wired": iot_wired,
            "iot_wireless": iot - iot_wired,
            "guest": guest,
        }
        if not any(total[k] for k in total if k not in ("employees", "guest")):
            raise DesignError("The requirements contain no devices to connect.")
        self.total = total

        # wireless coverage
        self.wifi_enabled = bool(r["staff_wifi"] or r["guest_wifi"] or (r["iot"] and total["iot_wireless"] > 0))
        self.clients_per_ap = min(self.profile["clients_per_ap"], 20 if self.perf_high else 30)

        # branches take a share of staff and devices (servers stay at HQ)
        bp = r.get("branch_users_percent")
        if self.branches > 0:
            if bp is None:
                bp = 20
                self.assumptions.append("Branch offices host 20% of staff and devices in total (split evenly) because no share was given.")
            branch_totals = {k: (total[k] * bp + 50) // 100 for k in total if k != "servers"}
        else:
            branch_totals = {k: 0 for k in total if k != "servers"}
        campus = {k: total[k] - branch_totals.get(k, 0) for k in total}
        self.campus = campus
        per_branch = {k: split_even(branch_totals[k], self.branches) for k in branch_totals} if self.branches else {}

        # campus: buildings then floors
        by_building = {k: split_even(campus[k], self.buildings) for k in FLOOR_KEYS}
        self.campus_floors = []
        for b in range(self.buildings):
            by_floor = {k: split_even(by_building[k][b], self.floors) for k in FLOOR_KEYS}
            for f in range(self.floors):
                counts = {k: by_floor[k][f] for k in FLOOR_KEYS}
                plan = self._floor_plan(counts)
                if plan:
                    self.campus_floors.append({"building": b, "floor": f, "counts": counts, "plan": plan})
        if self.buildings > 1 or self.floors > 1:
            self.assumptions.append("Staff and devices are spread evenly across buildings and floors; servers sit in Building 1.")

        # branches
        self.branch_sites = []
        for i in range(self.branches):
            counts = {k: per_branch[k][i] for k in FLOOR_KEYS}
            plan = self._floor_plan(counts)
            users = self.p(counts["employees"])
            wan = pick_tier(max(20, users * 2 + self.p(counts["guest"])), WAN_TIERS)
            self.branch_sites.append({"name": f"Branch {i + 1}", "counts": counts, "plan": plan, "wan_mbps": wan})

        # internet sizing: ~2 Mbps per staff member and guest at busy hour + voice
        mbps = self.p(emp) * 2 + self.p(guest) * 2 + self.p(total["voip"]) * 0.1
        self.internet_mbps = pick_tier(mbps, INTERNET_TIERS) if r["internet"] else 0

        self.endpoints_planned = sum(
            self.p(total[k]) for k in ("wired", "wireless", "servers", "printers", "voip", "cctv", "iot_wired", "iot_wireless")
        )
        self._score_complexity()
        self._base_assumptions()

    def _floor_plan(self, c):
        """Size one floor closet (or one branch): ports, PoE, APs, switches, uplink."""
        p = self.p
        if not any(c[k] > 0 for k in FLOOR_KEYS):
            return None
        wired_ep = p(c["wired"]) + p(c["printers"]) + p(c["voip"]) + p(c["cctv"]) + p(c["iot_wired"])
        wifi_clients = p(c["wireless"]) + p(c["iot_wireless"]) + p(c["guest"])
        aps = max(1, ceil_div(wifi_clients, self.clients_per_ap)) if self.wifi_enabled else 0
        ports = max(1, ceil_div((wired_ep + aps) * self.spare, 100))
        poe_w = math.ceil((p(c["voip"]) * 7 + p(c["cctv"]) * 15.4 + aps * 25 + p(c["iot_wired"]) * 8) * 1.2)
        size = 48 if ports > 24 else 24
        key = f"access_{size}" + ("_poe" if poe_w > 0 else "")
        switches = max(ceil_div(ports, size), ceil_div(poe_w, CATALOG[key]["poe_w"]) if poe_w > 0 else 1)
        load = (p(c["wired"]) * 10 + p(c["printers"]) + p(c["voip"]) * 0.1 + p(c["cctv"]) * 4
                + p(c["iot_wired"]) * 0.5 + wifi_clients * 5)
        uplink = pick_tier(load / 0.7, UPLINK_TIERS)
        if switches >= 2 or self.perf_high:
            uplink = max(uplink, 10000)
        return {
            "wired_endpoints": wired_ep,
            "wifi_clients": wifi_clients,
            "endpoints": wired_ep + wifi_clients,
            "aps": aps,
            "ports": ports,
            "poe_watts": poe_w,
            "switch_key": key,
            "switches": switches,
            "load_mbps": round(load, 1),
            "uplink_mbps": uplink,
        }

    def _score_complexity(self):
        r = self.r
        services = sum([bool(r["voip"]), bool(r["cctv"]), bool(r["iot"]), bool(r["guest_wifi"]), r["servers"] > 0])
        ep = self.endpoints_planned
        factors = [
            ("Planned endpoints", ep, 0 if ep < 50 else 1 if ep < 250 else 2 if ep < 1000 else 3 if ep < 5000 else 4),
            ("Buildings", self.buildings, 0 if self.buildings == 1 else 1 if self.buildings <= 3 else 2),
            ("Branch offices", self.branches, 0 if self.branches == 0 else 1 if self.branches <= 3 else 2),
            ("Departments", len(self.departments), 0 if len(self.departments) <= 3 else 1 if len(self.departments) <= 8 else 2),
            ("Services (VoIP, CCTV, IoT, guest Wi-Fi, servers)", services, 0 if services <= 1 else 1 if services <= 3 else 2),
            ("High availability", self.ha, 1 if self.ha else 0),
            ("Security posture", self.security, 1 if self.security == "high" else 0),
            ("Performance level", r["performance_level"], 1 if self.perf_high else 0),
            ("Scalability requirement", bool(r["scalability"]), 1 if r["scalability"] else 0),
        ]
        self.score_breakdown = [{"factor": f, "value": v, "points": pts} for f, v, pts in factors]
        self.score = sum(pts for _f, _v, pts in factors)

    def _base_assumptions(self):
        r, a = self.r, self.assumptions
        a.append(f"Expected growth of {self.pct}% is applied to every device count, plus {self.hr - 100}% address headroom per VLAN.")
        a.append(f"Switches keep {self.spare - 100}% spare ports; phones, cameras, APs and wired IoT each use one PoE port (no PC pass-through).")
        a.append("PoE budgets assume 7 W per phone, 15.4 W per camera, 25 W per access point, 8 W per wired IoT device, plus 20% margin.")
        if r["iot_devices"]:
            a.append("40% of IoT devices are wired (PoE); the remaining 60% connect over Wi-Fi.")
        if r["guest_wifi"]:
            a.append("Guest Wi-Fi is sized for 20% of staff concurrently (minimum 10 guests).")
        a.append(f"Wi-Fi capacity is planned at {self.clients_per_ap} clients per access point.")
        a.append("Traffic model for uplinks: 10 Mbps per wired user, 5 Mbps per Wi-Fi client, 4 Mbps per camera; uplinks are sized to stay below 70% load.")
        if self.internet_mbps:
            a.append("Internet capacity assumes ~2 Mbps per staff member/guest at busy hour and is rounded to a standard circuit size.")
        a.append("The first usable address in every subnet is the default gateway; point-to-point links use /30.")
        a.append("Costs are indicative list-price estimates for hardware and cabling only; licences, installation labour and ISP fees are excluded.")

    def _choose_model(self):
        if self.buildings >= 3 or self.endpoints_planned > 1500 or self.score >= 10:
            return "three_tier"
        if self.score >= 5 or self.ha or self.buildings >= 2 or self.endpoints_planned > 250:
            return "two_tier"
        return "star"

    def _initial_scope(self):
        if not self.ha:
            return "none"
        if self.r["budget_level"] == "low":
            self.trace.append("Budget level is 'low', so redundancy was limited to core and internet edge.")
            return "core_only"
        return "full"

    # ---- 2. plan (hardware + topology) ---------------------------------- #
    def _build_plan(self, model, scope):
        r = self.r
        dual = scope != "none"
        full = scope == "full"
        n_core = 2 if dual else 1
        nodes, edges, hardware, p2p = [], [], [], []
        mgmt = {"Campus": 0}
        counter = {"e": 0}

        def add_node(nid, label, ntype, layer, site="Campus", building=None, qty=1, model_key=None, **attrs):
            nodes.append({
                "id": nid, "label": label, "type": ntype, "layer": layer, "site": site,
                "building": building, "quantity": qty,
                "model": CATALOG[model_key]["model"] if model_key else None, "attributes": attrs,
            })

        def add_edge(a, b, bw, link_type, medium=None, redundant=False, label=None):
            counter["e"] += 1
            edges.append({
                "id": f"link-{counter['e']}", "source": a, "target": b, "bandwidth_mbps": bw,
                "link_type": link_type, "medium": medium or ("fiber" if bw >= 10000 else "copper"),
                "redundant": redundant, "weight": round(10000 / bw, 4), "label": label or fmt_bw(bw),
            })

        def add_hw(key, qty, site, reason, manage=False):
            if qty <= 0:
                return
            item = CATALOG[key]
            hardware.append({
                "category": item["category"], "model": item["model"], "quantity": int(qty), "site": site,
                "unit_cost_usd": item["cost"], "total_cost_usd": item["cost"] * int(qty), "reason": reason,
            })
            if manage:
                mgmt[site] = mgmt.get(site, 0) + int(qty)

        # -- campus access groups ------------------------------------------
        groups = []
        for fl in self.campus_floors:
            groups.append({
                "id": f"access-b{fl['building'] + 1}-f{fl['floor'] + 1}", "building": fl["building"],
                "floor": fl["floor"], "plan": fl["plan"], "ppl": ports_per_link(fl["plan"]["uplink_mbps"]),
            })

        # -- supporting services -------------------------------------------
        has_internet = bool(r["internet"])
        n_fw = n_core if (has_internet or self.security == "high") else 0
        servers_p = self.p(self.campus["servers"])
        n_srv_sw = srv_direct = 0
        if servers_p > 0:
            if servers_p <= 8:
                srv_direct = servers_p
            else:
                n_srv_sw = ceil_div(servers_p, 20) * (2 if dual else 1)
        total_aps = sum(g["plan"]["aps"] for g in groups) + sum(b["plan"]["aps"] for b in self.branch_sites if b["plan"])
        n_wlc = (2 if dual else 1) if total_aps > 15 else 0
        n_pbx = (2 if dual else 1) if self.p(self.total["voip"]) > 0 else 0
        cams_campus = self.p(self.campus["cctv"])
        n_nvr = ceil_div(cams_campus, 64) if cams_campus > 0 else 0

        # -- distribution bins (first-fit decreasing) ------------------------
        dist_bins = {}
        if model == "three_tier":
            for b in range(self.buildings):
                bins = []
                for g in sorted((x for x in groups if x["building"] == b), key=lambda x: (-x["ppl"], x["id"])):
                    for one in bins:
                        if one["ports"] + g["ppl"] <= 20:
                            one["groups"].append(g)
                            one["ports"] += g["ppl"]
                            break
                    else:
                        bins.append({"ports": g["ppl"], "groups": [g]})
                dist_bins[b] = bins
            n_dist = sum(len(v) for v in dist_bins.values()) * (2 if full else 1)
            downlink = n_dist
        else:
            downlink = sum(g["ppl"] for g in groups)

        need = downlink + n_fw + n_srv_sw + srv_direct + n_wlc + n_pbx + n_nvr + (2 if dual else 0)
        core_ports = ceil_div(need * 120, 100)

        base_plan = {"model": model, "scope": scope, "overflow": None, "total_cost": 0}
        if model == "star":
            if core_ports > 20 or len(groups) > 3:
                return {**base_plan, "overflow": "star_capacity"}
            core_key = "core_star"
        elif core_ports <= 24:
            core_key = "core_24"
        elif core_ports <= 48:
            core_key = "core_48"
        elif model == "two_tier":
            return {**base_plan, "overflow": "two_tier_core_capacity"}
        elif core_ports <= 96:
            core_key = "core_chassis"
        else:
            raise DesignError(
                "The campus needs more than 96 core ports even with three tiers. "
                "Split the estate into several organizations or reduce buildings/floors."
            )

        # -- nodes and edges ---------------------------------------------------
        if has_internet:
            add_node("internet", "Internet", "cloud", "external", bandwidth_mbps=self.internet_mbps, external=True)
            for i in range(n_fw):
                add_node(f"isp-{i + 1}", f"ISP {i + 1}", "isp", "external", bandwidth_mbps=self.internet_mbps)
                add_edge("internet", f"isp-{i + 1}", self.internet_mbps, "wan", "fiber", n_fw > 1, f"ISP circuit {fmt_bw(self.internet_mbps)}")
        fw_need = self.internet_mbps * (2 if self.security == "high" else 1.5) if has_internet else (1000 if self.endpoints_planned < 1000 else 5000)
        fw_key = "fw_small" if fw_need <= 1000 else "fw_medium" if fw_need <= 5000 else "fw_large"
        for i in range(n_fw):
            label = f"Firewall {i + 1}" if has_internet else f"Internal segmentation firewall {i + 1}"
            add_node(f"fw-{i + 1}", label, "firewall", "edge", model_key=fw_key, security=self.security)
            if has_internet:
                add_edge(f"isp-{i + 1}", f"fw-{i + 1}", self.internet_mbps, "wan", "fiber", False, "Internet handoff")
        if n_fw == 2:
            add_edge("fw-1", "fw-2", 10000, "ha-peer", "copper", True, "HA pair")

        for j in range(n_core):
            add_node(f"core-{j + 1}", f"Core switch {j + 1}" if n_core > 1 else "Core switch", "core", "core",
                     model_key=core_key, ports_required=core_ports)
        if n_core == 2:
            add_edge("core-1", "core-2", 20000, "ha-peer", "fiber", True, "Core interconnect 2x10G")
        for i in range(n_fw):
            for j in range(n_core):
                add_edge(f"fw-{i + 1}", f"core-{j + 1}", 10000, "fw-core", "fiber", n_core > 1)
                p2p.append({"name": f"Firewall {i + 1} - Core {j + 1}", "a": f"fw-{i + 1}", "b": f"core-{j + 1}"})

        core_ids = [f"core-{j + 1}" for j in range(n_core)]

        if self.branches:
            add_node("wan", "Site-to-site VPN / WAN", "cloud", "wan", external=True)
            hq_edge = [f"fw-{i + 1}" for i in range(n_fw)] or core_ids
            hq_bw = min(10000, sum(b["wan_mbps"] for b in self.branch_sites))
            for node in hq_edge:
                add_edge(node, "wan", hq_bw, "wan", "fiber", len(hq_edge) > 1, "HQ WAN attachment")

        # distribution + access (campus)
        oversub = []
        access_switch_counts = {}
        access_uplink_parents = {}
        if model == "three_tier":
            for b, bins in dist_bins.items():
                for k, one in enumerate(bins):
                    dist_ids = []
                    for side in (("a", "b") if full else ("",)):
                        did = f"dist-b{b + 1}-{k + 1}{side}"
                        dist_ids.append(did)
                        add_node(did, f"Distribution B{b + 1}-{k + 1}{side.upper()}", "distribution", "distribution",
                                 building=b, model_key="dist_l3", ports_used=one["ports"])
                        for j in range(n_core):
                            add_edge(did, core_ids[j], 10000, "dist-core", "fiber", n_core > 1)
                            p2p.append({"name": f"Dist B{b + 1}-{k + 1}{side.upper()} - Core {j + 1}", "a": did, "b": core_ids[j]})
                    if len(dist_ids) == 2:
                        add_edge(dist_ids[0], dist_ids[1], 20000, "ha-peer", "fiber", True, "Distribution pair 2x10G")
                    for g in one["groups"]:
                        access_uplink_parents[g["id"]] = dist_ids
        else:
            for idx, g in enumerate(groups):
                access_uplink_parents[g["id"]] = core_ids if full else [core_ids[idx % n_core]]

        for g in groups:
            pl = g["plan"]
            parents = access_uplink_parents[g["id"]]
            building_name = "Main building" if self.buildings == 1 else f"Building {g['building'] + 1}"
            floor_name = f"Floor {g['floor'] + 1}" if self.floors > 1 else "Access"
            add_node(g["id"], f"{building_name} - {floor_name}", "access", "access", building=g["building"], qty=pl["switches"],
                     model_key=pl["switch_key"], endpoints=pl["endpoints"], aps=pl["aps"], ports=pl["ports"],
                     poe_watts=pl["poe_watts"], uplink_mbps=pl["uplink_mbps"], floor=g["floor"])
            for parent in parents:
                medium = "fiber" if (g["building"] > 0 or pl["uplink_mbps"] >= 10000) else "copper"
                add_edge(g["id"], parent, pl["uplink_mbps"], "uplink", medium, len(parents) > 1)
            access_switch_counts[pl["switch_key"]] = access_switch_counts.get(pl["switch_key"], 0) + pl["switches"]
            oversub.append({
                "node": g["id"], "access_ports": pl["wired_endpoints"] + pl["aps"], "uplink_mbps": pl["uplink_mbps"] * len(parents),
                "ratio": round(((pl["wired_endpoints"] + pl["aps"]) * 1000) / (pl["uplink_mbps"] * len(parents)), 2),
            })

        # servers and shared services (dual-homed to every core)
        for i in range(n_srv_sw):
            add_node(f"server-sw-{i + 1}", f"Server switch {i + 1}", "server_switch", "services", model_key="server_sw",
                     servers=min(20, servers_p))
            for cid in core_ids:
                add_edge(f"server-sw-{i + 1}", cid, 10000, "server-uplink", "fiber", len(core_ids) > 1)
        for i in range(n_wlc):
            add_node(f"wlc-{i + 1}", f"Wireless controller {i + 1}", "controller", "services", model_key="wlc")
            for cid in core_ids:
                add_edge(f"wlc-{i + 1}", cid, 10000 if n_core == 1 else 1000, "service", "copper", len(core_ids) > 1)
        for i in range(n_pbx):
            add_node(f"pbx-{i + 1}", f"IP PBX {i + 1}", "pbx", "services", model_key="pbx")
            for cid in core_ids:
                add_edge(f"pbx-{i + 1}", cid, 1000, "service", "copper", len(core_ids) > 1)
        for i in range(n_nvr):
            add_node(f"nvr-{i + 1}", f"NVR {i + 1}", "nvr", "services", model_key="nvr", cameras=min(64, cams_campus))
            for cid in core_ids:
                add_edge(f"nvr-{i + 1}", cid, 1000, "service", "copper", len(core_ids) > 1)

        # branches
        for i, br in enumerate(self.branch_sites):
            rid, aid = f"branch-{i + 1}-router", f"branch-{i + 1}-access"
            add_node(rid, f"{br['name']} router", "branch_router", "branch", site=br["name"], model_key="branch_router")
            add_edge("wan", rid, br["wan_mbps"], "wan", "fiber", False, f"WAN {fmt_bw(br['wan_mbps'])}")
            p2p.append({"name": f"WAN HQ - {br['name']}", "a": "wan", "b": rid})
            pl = br["plan"]
            if pl:
                add_node(aid, f"{br['name']} access", "access", "branch-access", site=br["name"], qty=pl["switches"],
                         model_key=pl["switch_key"], endpoints=pl["endpoints"], aps=pl["aps"], ports=pl["ports"],
                         poe_watts=pl["poe_watts"], uplink_mbps=pl["uplink_mbps"])
                add_edge(aid, rid, pl["uplink_mbps"], "uplink", "copper" if pl["uplink_mbps"] < 10000 else "fiber")
                oversub.append({
                    "node": aid, "access_ports": pl["wired_endpoints"] + pl["aps"], "uplink_mbps": pl["uplink_mbps"],
                    "ratio": round(((pl["wired_endpoints"] + pl["aps"]) * 1000) / pl["uplink_mbps"], 2),
                })

        # -- hardware bill of materials --------------------------------------
        for key, qty in sorted(access_switch_counts.items()):
            add_hw(key, qty, "Campus", f"{qty} switches across {len(groups)} floor closets; sized for endpoints + APs with {self.spare - 100}% spare ports and the PoE load of phones, cameras and APs.", True)
        add_hw("ap", sum(g["plan"]["aps"] for g in groups), "Campus",
               f"{self.clients_per_ap} clients per AP for {self.org_type} density, with at least one AP per active floor.", True)
        if model == "three_tier":
            add_hw("dist_l3", sum(1 for n in nodes if n["type"] == "distribution"), "Campus",
                   "One distribution pair per building (single switch without full redundancy); access closets are packed onto distribution switches with first-fit-decreasing port allocation.", True)
        add_hw(core_key, n_core, "Campus", f"{core_ports} core ports required (downlinks, firewall, servers, services, peer link, 20% spare)." + (" Two units for core redundancy." if n_core == 2 else ""), True)
        add_hw("server_sw", n_srv_sw, "Campus", f"{servers_p} planned servers exceed the 8 that can attach directly to the core." + (" Deployed as A/B pairs." if dual else ""), True)
        add_hw(fw_key, n_fw, "Campus", (f"Sized for {fmt_bw(self.internet_mbps)} internet with threat inspection." if has_internet else "Internal segmentation firewall for a high-security posture without internet."), True)
        add_hw("wlc", n_wlc, "Campus", f"{total_aps} access points exceed 15, so central Wi-Fi management is required.", True)
        add_hw("pbx", n_pbx, "Campus", f"{self.p(self.total['voip'])} planned phones need call control (branches use it over VPN).")
        add_hw("nvr", n_nvr, "Campus", f"{cams_campus} planned campus cameras at 64 channels per NVR; about {cams_campus * 1.296:,.1f} TB for 30-day retention at 4 Mbps.", True)

        for i, br in enumerate(self.branch_sites):
            add_hw("branch_router", 1, br["name"], "Terminates the site-to-site VPN and provides local routing/firewalling.", True)
            pl = br["plan"]
            if pl:
                add_hw(pl["switch_key"], pl["switches"], br["name"], "Local access layer.", True)
                add_hw("ap", pl["aps"], br["name"], "Local Wi-Fi coverage.", True)
            if self.p(br["counts"]["cctv"]) > 0:
                add_hw("nvr", 1, br["name"], "Local recording for branch cameras.", True)
            add_hw("ups_access", 1, br["name"], "Power protection for the branch rack.")

        add_hw("ups_core", n_core, "Campus", "Core/server room power protection.")
        closets = len(groups) + sum(1 for n in nodes if n["type"] == "distribution")
        add_hw("ups_access", closets, "Campus", "One UPS per floor closet and distribution switch.")
        if self.buildings > 1:
            add_hw("fiber_run", (self.buildings - 1) * (2 if full else 1), "Campus",
                   "Inter-building fibre backbone" + (" with diverse duplicate paths." if full else "."))
        drops = sum(g["plan"]["wired_endpoints"] + g["plan"]["aps"] for g in groups)
        drops += sum(b["plan"]["wired_endpoints"] + b["plan"]["aps"] for b in self.branch_sites if b["plan"])
        add_hw("cable_drop", drops, "All sites", "One structured cabling drop per wired endpoint and access point.")

        total_cost = sum(h["total_cost_usd"] for h in hardware)
        return {
            **base_plan, "nodes": nodes, "edges": edges, "hardware": hardware, "mgmt": mgmt, "p2p": p2p,
            "total_cost": total_cost, "core_ports": core_ports, "core_key": core_key, "groups": groups,
            "n_core": n_core, "n_fw": n_fw, "n_wlc": n_wlc, "n_pbx": n_pbx, "n_nvr": n_nvr, "n_srv_sw": n_srv_sw,
            "servers_planned": servers_p, "oversub": oversub, "total_aps": total_aps,
            "cctv_storage_tb": round(self.p(self.total["cctv"]) * 1.296, 1),
            "access_parents": access_uplink_parents,
        }

    # ---- 3. segments (VLANs) --------------------------------------------- #
    def _plan_segments(self):
        plan = self.plan
        gw_reserve = 3 if self.dual else 1
        self.gw_reserve = gw_reserve
        self.site_segments = OrderedDict()

        def build(site, counts, mgmt_devices, dept_alloc, extra_servers=0, extra_cctv=0):
            segs, nxt = [], [100]

            def add(name, purpose, current):
                if current <= 0:
                    return
                required = max(2, ceil_div(self.p(current) * self.hr, 100))
                chunks = 1 if required <= MAX_SEGMENT_HOSTS else ceil_div(required, MAX_SEGMENT_HOSTS)
                for i, cur in enumerate(split_even(current, chunks)):
                    if cur <= 0:
                        continue
                    planned = self.p(cur)
                    if purpose in VLAN_IDS and i == 0:
                        vid = VLAN_IDS[purpose]
                    else:
                        vid = nxt[0]
                        nxt[0] += 1
                    zone, policy = SEGMENT_META[purpose if purpose in SEGMENT_META else "users"]
                    segs.append({
                        "site": site, "name": name if chunks == 1 else f"{name}-{i + 1}", "purpose": purpose,
                        "vlan_id": vid, "hosts_current": cur, "hosts_planned": planned,
                        "hosts_required": max(2, ceil_div(planned * self.hr, 100)), "zone": zone, "policy": policy,
                        "split": chunks > 1,
                    })

            add("Management", "management", mgmt_devices)
            add("Servers", "servers", counts["servers"] + extra_servers)
            add("VoIP", "voip", counts["voip"])
            add("CCTV", "cctv", counts["cctv"] + extra_cctv)
            add("IoT", "iot", counts["iot_wired"] + counts["iot_wireless"])
            add("Guest Wi-Fi", "guest", counts["guest"])
            add("Printers", "printers", counts["printers"])
            for name, devices in dept_alloc:
                add(name, "users", devices)
            if nxt[0] > 4094 or any(s["vlan_id"] > 4094 for s in segs):
                raise DesignError("The design needs more than 4094 VLANs; reduce the number of departments or endpoints.")
            return segs

        campus_devices = self.campus["wired"] + self.campus["wireless"]
        shares = apportion(campus_devices, [d["users"] for d in self.departments])
        dept_alloc = [(d["name"], s) for d, s in zip(self.departments, shares)]
        campus_counts = dict(self.campus)
        self.site_segments["Campus"] = build(
            "Campus", campus_counts, plan["mgmt"].get("Campus", 0), dept_alloc,
            extra_servers=plan["n_wlc"] + plan["n_pbx"], extra_cctv=plan["n_nvr"],
        )
        for br in self.branch_sites:
            c = br["counts"]
            self.site_segments[br["name"]] = build(
                br["name"], {**c, "servers": 0}, plan["mgmt"].get(br["name"], 0),
                [(f"{br['name']} Users", c["wired"] + c["wireless"])],
            )
        for segs in self.site_segments.values():
            for s in segs:
                s["gateway_reserve"] = gw_reserve
                s["vlsm_block"] = max(8, next_pow2(s["hosts_required"] + gw_reserve + 2))

    # ---- 4. addressing ---------------------------------------------------- #
    def _plan_addressing(self):
        lan = [s for segs in self.site_segments.values() for s in segs]
        if not lan:
            raise DesignError("The requirements produce no addressable network segments.")
        p2p = self.plan["p2p"]
        max_block = max(s["vlsm_block"] for s in lan)
        planned_hosts = sum(s["hosts_planned"] for s in lan)
        vlsm_alloc = sum(s["vlsm_block"] for s in lan)
        flsm_alloc = len(lan) * max_block
        eff_v = planned_hosts / vlsm_alloc * 100
        eff_f = planned_hosts / flsm_alloc * 100
        requested = self.r["addressing_method"]

        reasons = [
            f"FLSM would give all {len(lan)} segments a /{32 - int(math.log2(max_block))} ({max_block} addresses) = {flsm_alloc:,} addresses at {eff_f:.0f}% efficiency.",
            f"VLSM sizes each segment individually = {vlsm_alloc:,} addresses at {eff_v:.0f}% efficiency.",
        ]
        if requested == "vlsm":
            method = "VLSM"
            reasons.append("VLSM was requested explicitly.")
        elif requested == "flsm":
            method = "FLSM"
            reasons.append("FLSM was requested explicitly.")
        elif len(lan) <= 8 and eff_f >= 70:
            method = "FLSM"
            reasons.append("Segments are few and similar in size (FLSM efficiency >= 70%), so the simpler fixed mask was chosen.")
        else:
            method = "VLSM"
            reasons.append("Segment sizes differ widely or there are many segments, so VLSM was chosen to avoid wasting address space.")

        def site_totals(m):
            out = OrderedDict()
            for site, segs in self.site_segments.items():
                raw = sum(s["vlsm_block"] for s in segs) if m == "VLSM" else len(segs) * max_block
                out[site] = next_pow2(raw)
            return out

        transit_size = next_pow2(4 * len(p2p)) if p2p else 0

        def choose_pool(m):
            needed_m = sum(site_totals(m).values()) + transit_size
            for cidr in POOLS:
                candidate = ipaddress.IPv4Network(cidr)
                if needed_m * 4 <= candidate.num_addresses:
                    return candidate, f"{needed_m:,} addresses are required; {cidr} leaves at least 4x room for growth and summarisation."
            largest = ipaddress.IPv4Network(POOLS[-1])
            if needed_m <= largest.num_addresses:
                return largest, f"{needed_m:,} addresses nearly fill even 10.0.0.0/8, so the largest private block was used."
            return None, None

        pool_choice, pool_reason = choose_pool(method)
        if pool_choice is None and method == "FLSM" and requested == "auto":
            method = "VLSM"
            reasons.append("FLSM does not fit any private range, so VLSM was used instead.")
            pool_choice, pool_reason = choose_pool(method)
        if pool_choice is None:
            if method == "FLSM":
                raise DesignError("FLSM needs more addresses than the largest private range provides; choose VLSM or reduce sizing.")
            raise DesignError("The requirements need more addresses than any private IPv4 range can provide.")

        if method == "FLSM" and eff_f < 50:
            self._warn("warning", "FLSM_WASTE", f"FLSM was requested but wastes {100 - eff_f:.0f}% of the allocated addresses; VLSM would use {eff_v:.0f}% efficiently.")

        # site supernets, largest first (keeps every block aligned without gaps)
        totals = site_totals(method)
        order = sorted(totals.items(), key=lambda kv: (-kv[1], list(totals).index(kv[0])))
        pool_alloc = AddressAllocator(pool_choice)
        supernets, subnets = OrderedDict(), []
        for site, size in order:
            supernets[site] = pool_alloc.allocate(32 - int(math.log2(size)))
        transit_net = pool_alloc.allocate(32 - int(math.log2(transit_size))) if transit_size else None

        allocation_order = []
        for site, segs in self.site_segments.items():
            allocator = AddressAllocator(supernets[site])
            if method == "VLSM":
                ordered = sorted(segs, key=lambda s: (-s["vlsm_block"], s["name"]))  # largest -> smallest
                prefix_for = lambda s: 32 - int(math.log2(s["vlsm_block"]))
            else:
                ordered = segs
                prefix_for = lambda s: 32 - int(math.log2(max_block))
            for seg in ordered:
                net = allocator.allocate(prefix_for(seg))
                info = describe_network(net, self.gw_reserve)
                usable = info["usable_hosts"]
                remaining_now = usable - self.gw_reserve - seg["hosts_current"]
                remaining_grown = usable - self.gw_reserve - seg["hosts_planned"]
                if remaining_grown < 0:
                    raise DesignError(f"Segment '{seg['name']}' does not fit in {net}.")
                subnets.append({
                    "name": seg["name"], "site": site, "vlan_id": seg["vlan_id"], "purpose": seg["purpose"],
                    **info, "hosts_current": seg["hosts_current"], "hosts_planned": seg["hosts_planned"],
                    "hosts_required": seg["hosts_required"], "remaining_capacity": remaining_now,
                    "remaining_after_growth": remaining_grown,
                    "utilization_percent": round(seg["hosts_current"] / usable * 100, 1),
                    "planned_utilization_percent": round(seg["hosts_planned"] / usable * 100, 1),
                    "zone": seg["zone"], "policy": seg["policy"],
                })
                allocation_order.append(seg["name"] + f" ({site})")
            seg_alloc_remaining = allocator.remaining
            supernets[site] = {"net": supernets[site], "free": seg_alloc_remaining}

        transit = []
        if transit_net is not None:
            allocator = AddressAllocator(transit_net)
            for link in sorted(p2p, key=lambda l: l["name"]):
                net = allocator.allocate(30)
                info = describe_network(net, 0)
                transit.append({"name": link["name"], "endpoint_a": link["a"], "endpoint_b": link["b"], **info})

        subnets.sort(key=lambda s: int(ipaddress.IPv4Address(s["network_address"])))
        site_list = []
        for site, entry in supernets.items():
            net = entry["net"]
            site_list.append({
                "site": site, "cidr": str(net), "total_addresses": net.num_addresses,
                "summary_route": f"{net.network_address} {net.netmask}", "unallocated_addresses": entry["free"],
            })
        used_alloc = vlsm_alloc if method == "VLSM" else flsm_alloc
        self.ip_plan = {
            "method": method,
            "method_reasons": reasons,
            "base_network": str(pool_choice),
            "base_network_reason": pool_reason,
            "site_supernets": site_list,
            "transit_supernet": str(transit_net) if transit_net else None,
            "subnets": subnets,
            "transit_links": transit,
            "allocation_order": allocation_order,
            "comparison": {
                "flsm": {"prefix": 32 - int(math.log2(max_block)), "addresses_allocated": flsm_alloc, "efficiency_percent": round(eff_f, 1)},
                "vlsm": {"addresses_allocated": vlsm_alloc, "efficiency_percent": round(eff_v, 1)},
                "addresses_saved_by_vlsm": flsm_alloc - vlsm_alloc,
            },
            "efficiency_percent": round(planned_hosts / used_alloc * 100, 1),
            "pool_addresses_remaining": pool_alloc.remaining,
            "gateway_convention": "First usable address; first three usable addresses reserved (VIP + two physical) when high availability is applied.",
        }
        self.address_efficiency = planned_hosts / used_alloc * 100
        self.decisions.append({"decision": f"Addressing method: {method}", "reason": " ".join(reasons[-2:])})
        self.decisions.append({"decision": f"Address pool: {pool_choice}", "reason": pool_reason})

    # ---- 5. analysis (graph algorithms) ------------------------------------ #
    def _analyze(self):
        nodes, edges = self.plan["nodes"], self.plan["edges"]
        by_id = {n["id"]: n for n in nodes}
        graph = Graph()
        for n in nodes:
            graph.add_node(n["id"])
        for e in edges:
            graph.add_edge(e["source"], e["target"], e["weight"])

        root = "internet" if "internet" in by_id else "core-1"
        hops = graph.bfs(root)
        components = graph.components()
        isolated = sorted(n for n, nb in graph.adj.items() if not nb)
        unreachable = sorted(n for n in graph.adj if n not in hops)
        dist, prev = graph.dijkstra(root)
        dfs = graph.dfs_order(root)

        access_ids = [n["id"] for n in nodes if n["type"] == "access"]
        reach = [a for a in access_ids if a in hops]
        hop_values = [hops[a] for a in reach]
        farthest = sorted(reach, key=lambda a: (-dist[a], a))[:5]
        paths = []
        for a in farthest:
            path = Graph.path_to(prev, root, a)
            paths.append({
                "from": root, "to": a, "hops": hops[a], "cost": round(dist[a], 3),
                "path": path, "path_labels": [by_id[x]["label"] for x in path],
            })

        points, bridges = graph.articulation_points_and_bridges()
        total_endpoints = sum(n["attributes"].get("endpoints", 0) for n in nodes) or 1

        def impact(blocked_nodes=frozenset(), blocked_edges=frozenset()):
            start = root if root not in blocked_nodes else next((n for n in graph.adj if n not in blocked_nodes), None)
            reached = graph.bfs(start, blocked_nodes, blocked_edges) if start else {}
            cut = [n for n in graph.adj if n not in reached and n not in blocked_nodes]
            eps = sum(by_id[n]["attributes"].get("endpoints", 0) for n in cut)
            return cut, eps

        critical_nodes = []
        for pt in sorted(points):
            if pt == root:
                continue
            cut, eps = impact(frozenset({pt}))
            critical_nodes.append({
                "node": pt, "label": by_id[pt]["label"], "type": by_id[pt]["type"],
                "external": bool(by_id[pt]["attributes"].get("external")),
                "nodes_cut_off": len(cut), "endpoints_cut_off": eps,
                "share_of_endpoints_percent": round(eps / total_endpoints * 100, 1),
            })
        critical_nodes.sort(key=lambda c: (-c["endpoints_cut_off"], -c["nodes_cut_off"], c["node"]))
        critical_links = []
        for a, b in bridges[:200]:
            cut, eps = impact(blocked_edges=frozenset({frozenset((a, b))}))
            critical_links.append({"source": a, "target": b, "nodes_cut_off": len(cut), "endpoints_cut_off": eps})
        critical_links.sort(key=lambda c: (-c["endpoints_cut_off"], c["source"]))

        oversub = sorted(self.plan["oversub"], key=lambda o: -o["ratio"])
        layers = OrderedDict()
        for n in nodes:
            layers.setdefault(n["layer"], []).append(n["id"])
        cyclomatic = graph.edge_count - len(graph.adj) + len(components)
        self.analysis = {
            "root_node": root,
            "graph": {
                "nodes": len(graph.adj), "connections": graph.edge_count,
                "average_degree": round(2 * graph.edge_count / max(1, len(graph.adj)), 2),
                "connected_components": len(components), "is_connected": len(components) == 1,
                "isolated_nodes": isolated, "unreachable_from_root": unreachable,
                "redundant_path_count": cyclomatic,
                "has_redundant_paths": cyclomatic > 0,
            },
            "hops": {
                "max_hops_to_access": max(hop_values) if hop_values else 0,
                "average_hops_to_access": round(sum(hop_values) / len(hop_values), 2) if hop_values else 0,
                "distribution": {str(h): hop_values.count(h) for h in sorted(set(hop_values))},
                "by_layer": {layer: max(hops.get(i, 0) for i in ids) for layer, ids in layers.items()},
            },
            "shortest_paths": {"metric": "Dijkstra, link cost = 10000 / bandwidth_mbps (faster links cost less)", "farthest_access_paths": paths},
            "traversal": {"bfs_order": list(hops)[:200], "dfs_order": dfs[:200]},
            "critical_nodes": critical_nodes,
            "critical_links": critical_links[:25],
            "single_points_of_failure": [c for c in critical_nodes if not c["external"]],
            "oversubscription": {
                "worst_ratio": oversub[0]["ratio"] if oversub else 0,
                "note": "Access port capacity (1 Gbps per port) divided by uplink capacity.",
                "groups": oversub[:25],
            },
        }

    # ---- warnings ------------------------------------------------------------ #
    def _warn(self, severity, code, message):
        self.warnings.append({"severity": severity, "code": code, "message": message})

    def _finish_warnings(self):
        r, plan, an = self.r, self.plan, self.analysis
        spofs = an["single_points_of_failure"]
        for c in spofs[:8]:
            severity = "critical" if c["share_of_endpoints_percent"] >= 50 else "warning"
            self._warn(severity, "SINGLE_POINT_OF_FAILURE",
                       f"{c['label']} is a single point of failure: losing it cuts off {c['nodes_cut_off']} nodes "
                       f"({c['endpoints_cut_off']} endpoints, {c['share_of_endpoints_percent']}% of the network).")
        if len(spofs) > 8:
            self._warn("info", "MORE_SPOFS", f"{len(spofs) - 8} further single points of failure exist (see network_analysis.critical_nodes).")
        if self.ha and self.scope == "core_only":
            self._warn("warning", "REDUNDANCY_REDUCED",
                       "High availability was requested but is limited to the core and internet edge; access and distribution layers are single-homed.")
        if not self.ha and self.profile["ha_recommended"]:
            self._warn("warning", "HA_RECOMMENDED",
                       f"{self.org_type.title()} networks are normally mission-critical; enabling high availability is strongly recommended.")
        if not self.ha and self.security == "high":
            self._warn("info", "SECURITY_WITHOUT_HA", "A high-security posture without redundancy leaves the security stack as a single point of failure.")
        for o in an["oversubscription"]["groups"]:
            if o["ratio"] > 20:
                self._warn("warning", "OVERSUBSCRIBED_UPLINK", f"{o['node']} has a {o['ratio']}:1 access-to-uplink ratio; consider faster uplinks.")
                break
        if self.address_efficiency < 55:
            self._warn("info", "LOW_ADDRESS_EFFICIENCY", f"Only {self.address_efficiency:.0f}% of allocated addresses are planned for use; acceptable for growth, but review sizing.")
        if any(s["split"] for segs in self.site_segments.values() for s in segs):
            self._warn("info", "SPLIT_BROADCAST_DOMAIN", "Large departments were split into several VLANs to keep each broadcast domain at /23 or smaller.")
        if self.buildings > 3 and self.model != "three_tier":
            self._warn("warning", "L2_SPAN", "VLANs span more than three buildings; consider routing per building.")
        if self.buildings > 1:
            self._warn("info", "VLAN_SPAN", "VLANs are campus-wide and trunked between buildings; use routed access if broadcast domains grow.")
        if not r["internet"]:
            self._warn("info", "NO_INTERNET", "No internet service was requested; cloud, updates and remote access will be unavailable.")
            if r["guest_wifi"]:
                self._warn("warning", "GUEST_WITHOUT_INTERNET", "Guest Wi-Fi is enabled but there is no internet service, so guests would have no useful access.")
        if r["scalability"] is False and self.pct >= 50:
            self._warn("info", "GROWTH_WITHOUT_SCALABILITY", f"{self.pct}% growth is expected but scalability is off; only {self.hr - 100}% address headroom was added.")
        if r["budget_level"] == "low" and (self.security == "high" or self.perf_high):
            self._warn("warning", "BUDGET_CONFLICT", "A low budget conflicts with the high security/performance goals; expect compromises.")
        if r["voip"] and self.branches:
            self._warn("info", "BRANCH_VOICE", "Branch phones register to the central PBX over VPN; enable survivable telephony on branch routers.")
        if self.branches:
            self._warn("info", "BRANCH_SINGLE_HOMED", "Each branch has a single router and one WAN link; add a second WAN/LTE backup for critical branches.")
        if r["cctv"] and plan["cctv_storage_tb"]:
            self._warn("info", "CCTV_STORAGE", f"CCTV needs roughly {plan['cctv_storage_tb']} TB for 30-day retention at 4 Mbps per camera.")
        for g in plan["groups"]:
            if g["plan"]["switches"] > 8:
                self._warn("warning", "LARGE_CLOSET", f"{g['id']} needs {g['plan']['switches']} access switches; split it into several closets.")
        budget = r.get("budget_amount_usd")
        if budget and plan["total_cost"] > budget:
            over = (plan["total_cost"] / budget - 1) * 100
            self._warn("critical", "OVER_BUDGET", f"Estimated hardware cost ${plan['total_cost']:,.0f} exceeds the ${budget:,.0f} budget by {over:.0f}%.")
        elif budget:
            self._warn("info", "WITHIN_BUDGET", f"Estimated hardware cost ${plan['total_cost']:,.0f} is within the ${budget:,.0f} budget.")

    # ---- 6. assemble ------------------------------------------------------------- #
    def _assemble(self):
        r, plan, model = self.r, self.plan, self.model
        names = {
            "star": "Star Topology with Collapsed Core",
            "two_tier": "Two-Tier Collapsed-Core Hierarchical Design",
            "three_tier": "Three-Tier Hierarchical Design (Core - Distribution - Access)",
        }
        layers = {
            "star": ["Core/L3 switch", "Access"],
            "two_tier": ["Core (collapsed core + distribution)", "Access"],
            "three_tier": ["Core", "Distribution (per building)", "Access"],
        }[model]
        redundancy_text = {
            "none": "No redundancy (not requested).",
            "core_only": "Redundant core and internet edge; access/distribution single-homed.",
            "full": "Full redundancy: dual core, dual distribution, dual-homed access, dual ISP and firewalls.",
        }[self.scope]
        rationale = []
        for row in self.score_breakdown:
            if row["points"]:
                rationale.append(f"{row['factor']}: {row['value']} adds {row['points']} complexity point(s).")
        rationale.append(f"Complexity score {self.score} with {self.endpoints_planned:,} planned endpoints across {self.buildings} building(s) "
                         f"and {self.branches} branch(es) selected '{names[model]}'.")
        rationale.extend(self.trace)
        if self.branches:
            rationale.append("Branch offices connect to the campus through a hub-and-spoke site-to-site VPN/WAN overlay.")
        summary_line = next(x for x in rationale if x.startswith("Complexity score"))
        self.decisions.insert(0, {"decision": f"Methodology: {names[model]}", "reason": " ".join([summary_line] + self.trace)})
        self.decisions.append({"decision": f"Redundancy scope: {self.scope}", "reason": redundancy_text})
        uplinks = sorted({g["plan"]["uplink_mbps"] for g in plan["groups"]})
        if uplinks:
            self.decisions.append({"decision": "Access uplink speeds: " + ", ".join(fmt_bw(u) for u in uplinks),
                                   "reason": "Chosen as the smallest tier keeping estimated peak load under 70% of the link."})
        if self.internet_mbps:
            self.decisions.append({"decision": f"Internet circuit: {fmt_bw(self.internet_mbps)}", "reason": "About 2 Mbps per staff member/guest at busy hour, rounded up to a standard circuit."})

        vlans = []
        for s in self.ip_plan["subnets"]:
            vlans.append({
                "vlan_id": s["vlan_id"], "name": s["name"], "site": s["site"], "purpose": s["purpose"], "zone": s["zone"],
                "subnet": s["cidr"], "gateway": s["gateway"], "hosts_planned": s["hosts_planned"], "policy": s["policy"],
            })
        vlans.sort(key=lambda v: (v["site"] != "Campus", v["site"], v["vlan_id"]))

        hw = plan["hardware"]
        by_cat = OrderedDict()
        for h in hw:
            entry = by_cat.setdefault(h["category"], {"quantity": 0, "cost_usd": 0})
            entry["quantity"] += h["quantity"]
            entry["cost_usd"] += h["total_cost_usd"]
        network_devices = sum(plan["mgmt"].values())
        access_switches = sum(n["quantity"] for n in plan["nodes"] if n["type"] == "access")

        overview = {
            "organization": {"name": r.get("organization_name"), "type": self.org_type, "location": r.get("location")},
            "sizing": {
                "employees": self.employees, "departments": len(self.departments), "buildings": self.buildings,
                "floors_per_building": self.floors, "branches": self.branches,
                "endpoints_current": sum(r[k] for k in ("wired_devices", "wireless_devices", "servers", "printers", "voip_phones", "cctv_cameras", "iot_devices")),
                "endpoints_planned": self.endpoints_planned, "growth_percent": self.pct,
                "internet_bandwidth_mbps": self.internet_mbps,
            },
            "totals": {
                "sites": 1 + self.branches, "vlans": len(vlans), "subnets": len(self.ip_plan["subnets"]),
                "network_devices": network_devices, "access_switches": access_switches, "access_points": plan["total_aps"],
                "estimated_cost_usd": plan["total_cost"],
            },
            "posture": {"security": self.security, "high_availability_requested": self.ha, "redundancy_applied": self.scope,
                        "performance": r["performance_level"], "budget_level": r["budget_level"]},
            "summary": (f"{names[model]} for {self.employees:,} staff and {self.endpoints_planned:,} planned endpoints "
                        f"using {self.ip_plan['method']} addressing in {self.ip_plan['base_network']}; "
                        f"estimated hardware cost ${plan['total_cost']:,.0f}."),
        }
        layer_map = OrderedDict()
        for n in plan["nodes"]:
            layer_map.setdefault(n["layer"], []).append(n["id"])
        topology = {
            "type": names[model] + (" + hub-and-spoke WAN" if self.branches else ""),
            "description": redundancy_text,
            "layers": [{"layer": k, "nodes": v} for k, v in layer_map.items()],
            "nodes": plan["nodes"],
            "connections": plan["edges"],
        }
        return {
            "engine_version": ENGINE_VERSION,
            "overview": overview,
            "methodology": {
                "name": names[model], "model": model, "tiers": layers, "redundancy_scope": self.scope,
                "redundancy_description": redundancy_text, "complexity_score": self.score,
                "score_breakdown": self.score_breakdown, "rationale": rationale, "decisions": self.decisions,
                "addressing_method": self.ip_plan["method"],
            },
            "topology": topology,
            "hardware": {
                "items": hw, "totals_by_category": [{"category": k, **v} for k, v in by_cat.items()],
                "estimated_cost_usd": plan["total_cost"],
                "cost_note": "Indicative list-price estimate for hardware and cabling; excludes licences, labour and ISP fees.",
                "core_ports_required": plan["core_ports"],
                "poe_watts_total": sum(g["plan"]["poe_watts"] for g in plan["groups"]) + sum(b["plan"]["poe_watts"] for b in self.branch_sites if b["plan"]),
                "cctv_storage_tb": plan["cctv_storage_tb"],
            },
            "vlans": vlans,
            "reserved_vlans": [
                {"vlan_id": 1, "purpose": "Default VLAN - unused, do not assign ports"},
                {"vlan_id": 998, "purpose": "Parking VLAN for shut-down / unused ports"},
                {"vlan_id": 999, "purpose": "Native VLAN for trunks (carries no traffic)"},
            ],
            "ip_plan": self.ip_plan,
            "network_analysis": self.analysis,
            "assumptions": self.assumptions,
            "warnings": self.warnings,
        }


# --------------------------------------------------------------------------- #
# Public helpers
# --------------------------------------------------------------------------- #
def generate_design(requirements):
    """Run the engine. Raises DesignError for impossible requirements."""
    return NetworkDesignEngine(requirements).run()


def requirements_hash(requirements):
    """Stable fingerprint of the engine input; used to detect stale designs."""
    return hashlib.sha256(json.dumps(requirements, sort_keys=True, default=str).encode("utf-8")).hexdigest()


# --------------------------------------------------------------------------- #
# Persistence
# --------------------------------------------------------------------------- #
class GeneratedDesign(db.Model):
    __tablename__ = "generated_designs"

    id = db.Column(db.Integer, primary_key=True)
    organization_id = db.Column(
        db.Integer,
        db.ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    version = db.Column(db.Integer, nullable=False, default=1)
    engine_version = db.Column(db.String(20), nullable=False)
    requirements_hash = db.Column(db.String(64), nullable=False)
    methodology = db.Column(db.String(120), nullable=False)
    result = db.Column(db.JSON, nullable=False)
    generated_at = db.Column(db.DateTime, nullable=False, default=utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=utcnow, onupdate=utcnow)

    organization = db.relationship("Organization", back_populates="design")

    @classmethod
    def save_for(cls, organization, result, req_hash):
        """Create the design, or replace it and bump `version` (regeneration). Does not commit."""
        design = organization.design
        if design is None:
            design = cls(organization=organization, version=1)
        else:
            design.version = (design.version or 0) + 1
        design.engine_version = result["engine_version"]
        design.requirements_hash = req_hash
        design.methodology = result["methodology"]["name"]
        design.result = result  # reassigned (not mutated) so the JSON change is always detected
        design.generated_at = utcnow()
        db.session.add(design)
        return design

    def to_dict(self, include_result=True):
        data = {
            "id": self.id,
            "organization_id": self.organization_id,
            "version": self.version,
            "engine_version": self.engine_version,
            "methodology": self.methodology,
            "generated_at": iso(self.generated_at),
            "updated_at": iso(self.updated_at),
        }
        if include_result:
            data["design"] = self.result
        return data