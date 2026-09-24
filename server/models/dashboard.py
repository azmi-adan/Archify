
from collections import Counter

from extensions import iso
from models.generation import requirements_hash


class DashboardService:
    @staticmethod
    def build(organization):
        requirements = organization.requirements
        design = organization.design

        payload = {
            "status": "no_requirements",
            "organization": organization.to_dict(),
            "requirements": requirements.to_dict() if requirements else None,
            "design": None,
            "overview": None,
            "methodology": None,
            "topology": None,
            "hardware": None,
            "vlans": None,
            "ip_plan": None,
            "network_analysis": None,
            "assumptions": [],
            "warnings": [],
            "charts": None,
        }
        if requirements is None:
            return payload
        payload["status"] = "requirements_saved"
        if design is None:
            return payload

        result = design.result or {}
        stale = design.requirements_hash != requirements_hash(requirements.to_engine_input(organization))
        payload["status"] = "stale" if stale else "ready"
        payload["design"] = {
            "id": design.id,
            "version": design.version,
            "engine_version": design.engine_version,
            "generated_at": iso(design.generated_at),
            "is_stale": stale,
        }
        for section in ("overview", "methodology", "topology", "hardware", "vlans", "ip_plan",
                        "network_analysis", "assumptions", "warnings"):
            payload[section] = result.get(section, [] if section in ("assumptions", "warnings") else None)

        hardware = result.get("hardware") or {}
        subnets = (result.get("ip_plan") or {}).get("subnets", [])
        severity = Counter(w.get("severity", "info") for w in payload["warnings"])
        payload["charts"] = {
            "cost_by_category": [
                {"category": row["category"], "cost_usd": row["cost_usd"], "quantity": row["quantity"]}
                for row in hardware.get("totals_by_category", [])
            ],
            "address_utilization": [
                {
                    "name": s["name"],
                    "site": s["site"],
                    "cidr": s["cidr"],
                    "current_percent": s["utilization_percent"],
                    "planned_percent": s["planned_utilization_percent"],
                }
                for s in subnets
            ],
            "warnings_by_severity": {k: severity.get(k, 0) for k in ("critical", "warning", "info")},
        }
        return payload