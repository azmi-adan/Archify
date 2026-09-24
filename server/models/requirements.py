
from extensions import db, iso, utcnow

# name: (min, max, default). default None => must be supplied on creation.
INT_FIELDS = {
    "branches": (0, 100, 0),
    "buildings": (1, 50, 1),
    "floors_per_building": (1, 30, 1),
    "employees": (1, 100000, None),
    "wired_devices": (0, 200000, 0),
    "wireless_devices": (0, 200000, 0),
    "servers": (0, 5000, 0),
    "printers": (0, 5000, 0),
    "voip_phones": (0, 100000, 0),
    "cctv_cameras": (0, 20000, 0),
    "iot_devices": (0, 200000, 0),
    "expected_growth_percent": (0, 500, 20),
    "branch_users_percent": (0, 90, None),  # optional: share of staff/devices at branches
}
OPTIONAL_INT_FIELDS = {"branch_users_percent"}
BOOL_FIELDS = (
    "internet",
    "guest_wifi",
    "staff_wifi",
    "voip",
    "cctv",
    "iot",
    "high_availability",
    "scalability",
)
ENUM_FIELDS = {
    "budget_level": ("low", "medium", "high", "medium"),
    "security_level": ("basic", "standard", "high", "standard"),
    "performance_level": ("standard", "high", "standard"),
    "addressing_method": ("auto", "flsm", "vlsm", "auto"),
}
STRING_FIELDS = {"location": 120, "notes": 1000}
# A service flag is switched on automatically when its device count is > 0.
FLAG_FOR_COUNT = {
    "voip_phones": "voip",
    "cctv_cameras": "cctv",
    "iot_devices": "iot",
    "wireless_devices": "staff_wifi",
}
READ_ONLY_KEYS = {"id", "organization_id", "user_id", "created_at", "updated_at"}
ALIASES = {"floors": "floors_per_building", "users": "employees"}
MAX_DEPARTMENTS = 60
MAX_TOTAL_FLOORS = 500

# Complete set of engine inputs with their defaults (used by the engine as a safety net).
REQUIREMENT_DEFAULTS = {
    "location": None,
    "notes": None,
    "branches": 0,
    "buildings": 1,
    "floors_per_building": 1,
    "employees": 0,
    "departments": [],
    "wired_devices": 0,
    "wireless_devices": 0,
    "servers": 0,
    "printers": 0,
    "voip_phones": 0,
    "cctv_cameras": 0,
    "iot_devices": 0,
    "internet": True,
    "guest_wifi": False,
    "staff_wifi": False,
    "voip": False,
    "cctv": False,
    "iot": False,
    "high_availability": False,
    "scalability": False,
    "expected_growth_percent": 20,
    "budget_level": "medium",
    "budget_amount_usd": None,
    "security_level": "standard",
    "performance_level": "standard",
    "addressing_method": "auto",
    "branch_users_percent": None,
}
ENGINE_FIELDS = tuple(REQUIREMENT_DEFAULTS.keys())


class NetworkRequirement(db.Model):
    __tablename__ = "network_requirements"

    id = db.Column(db.Integer, primary_key=True)
    organization_id = db.Column(
        db.Integer,
        db.ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )

    # organization details
    location = db.Column(db.String(120), nullable=True)
    notes = db.Column(db.String(1000), nullable=True)

    # sites
    branches = db.Column(db.Integer, nullable=False, default=0)
    buildings = db.Column(db.Integer, nullable=False, default=1)
    floors_per_building = db.Column(db.Integer, nullable=False, default=1)
    branch_users_percent = db.Column(db.Integer, nullable=True)

    # people and devices
    employees = db.Column(db.Integer, nullable=False)
    departments = db.Column(db.JSON, nullable=False, default=list)
    wired_devices = db.Column(db.Integer, nullable=False, default=0)
    wireless_devices = db.Column(db.Integer, nullable=False, default=0)
    servers = db.Column(db.Integer, nullable=False, default=0)
    printers = db.Column(db.Integer, nullable=False, default=0)
    voip_phones = db.Column(db.Integer, nullable=False, default=0)
    cctv_cameras = db.Column(db.Integer, nullable=False, default=0)
    iot_devices = db.Column(db.Integer, nullable=False, default=0)

    # services
    internet = db.Column(db.Boolean, nullable=False, default=True)
    guest_wifi = db.Column(db.Boolean, nullable=False, default=False)
    staff_wifi = db.Column(db.Boolean, nullable=False, default=False)
    voip = db.Column(db.Boolean, nullable=False, default=False)
    cctv = db.Column(db.Boolean, nullable=False, default=False)
    iot = db.Column(db.Boolean, nullable=False, default=False)

    # design goals
    high_availability = db.Column(db.Boolean, nullable=False, default=False)
    scalability = db.Column(db.Boolean, nullable=False, default=False)
    expected_growth_percent = db.Column(db.Integer, nullable=False, default=20)
    budget_level = db.Column(db.String(10), nullable=False, default="medium")
    budget_amount_usd = db.Column(db.Float, nullable=True)
    security_level = db.Column(db.String(10), nullable=False, default="standard")
    performance_level = db.Column(db.String(10), nullable=False, default="standard")
    addressing_method = db.Column(db.String(10), nullable=False, default="auto")

    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=utcnow, onupdate=utcnow)

    organization = db.relationship("Organization", back_populates="requirements")

    def engine_dict(self):
        """The requirement fields only (no ids / timestamps)."""
        return {name: getattr(self, name) for name in ENGINE_FIELDS}

    def to_engine_input(self, organization):
        """Everything the generation engine needs, including organization name/type."""
        data = self.engine_dict()
        data["organization_name"] = organization.name
        data["organization_type"] = organization.organization_type
        return data

    def apply(self, clean):
        for key, value in clean.items():
            setattr(self, key, value)

    def to_dict(self):
        data = self.engine_dict()
        data.update(
            {
                "id": self.id,
                "organization_id": self.organization_id,
                "created_at": iso(self.created_at),
                "updated_at": iso(self.updated_at),
            }
        )
        return data


# --------------------------------------------------------------------------- #
# Validation
# --------------------------------------------------------------------------- #
def _parse_int(value, low, high):
    if isinstance(value, bool):
        raise ValueError("must be a whole number")
    if isinstance(value, float):
        if not value.is_integer():
            raise ValueError("must be a whole number")
        value = int(value)
    elif isinstance(value, str) and value.strip().lstrip("-").isdigit():
        value = int(value.strip())
    if not isinstance(value, int):
        raise ValueError("must be a whole number")
    if value < low or value > high:
        raise ValueError(f"must be between {low} and {high}")
    return value


def _parse_departments(value):
    if not isinstance(value, list):
        raise ValueError('must be a list like [{"name": "Finance", "users": 50}]')
    if len(value) > MAX_DEPARTMENTS:
        raise ValueError(f"at most {MAX_DEPARTMENTS} departments are supported")
    clean, seen = [], set()
    for index, item in enumerate(value):
        if not isinstance(item, dict):
            raise ValueError(f"item {index} must be an object with 'name' and 'users'")
        name = item.get("name")
        if not isinstance(name, str) or not (1 <= len(name.strip()) <= 60):
            raise ValueError(f"item {index}: 'name' must be 1-60 characters")
        name = " ".join(name.split())
        if name.lower() in seen:
            raise ValueError(f"duplicate department name '{name}'")
        seen.add(name.lower())
        try:
            users = _parse_int(item.get("users"), 1, 100000)
        except ValueError as exc:
            raise ValueError(f"item {index}: 'users' {exc}") from None
        clean.append({"name": name, "users": users})
    return clean


def validate_requirements(payload, existing=None):
    """Validate a create (existing=None) or update (existing=engine_dict) payload.

    Returns (clean_full_dict, errors). On update, `clean_full_dict` is the merged
    result so the caller can apply it directly; unspecified fields keep their value.
    """
    if not isinstance(payload, dict):
        return {}, {"body": "A JSON object is required."}

    errors, parsed = {}, {}
    incoming = {}
    for key, value in payload.items():
        if key in READ_ONLY_KEYS:
            continue  # never trusted; silently ignored
        incoming[ALIASES.get(key, key)] = value

    known = set(INT_FIELDS) | set(BOOL_FIELDS) | set(ENUM_FIELDS) | set(STRING_FIELDS)
    known |= {"departments", "budget_amount_usd"}
    for key in incoming:
        if key not in known:
            errors[key] = "Unknown field."

    for name, (low, high, _default) in INT_FIELDS.items():
        if name in incoming:
            if incoming[name] is None and name in OPTIONAL_INT_FIELDS:
                parsed[name] = None
                continue
            try:
                parsed[name] = _parse_int(incoming[name], low, high)
            except ValueError as exc:
                errors[name] = f"{exc}."

    for name in BOOL_FIELDS:
        if name in incoming:
            if isinstance(incoming[name], bool):
                parsed[name] = incoming[name]
            else:
                errors[name] = "must be true or false."

    for name, spec in ENUM_FIELDS.items():
        if name in incoming:
            options = spec[:-1]
            value = incoming[name]
            if isinstance(value, str) and value.strip().lower() in options:
                parsed[name] = value.strip().lower()
            else:
                errors[name] = "must be one of: " + ", ".join(options) + "."

    for name, limit in STRING_FIELDS.items():
        if name in incoming:
            value = incoming[name]
            if value is None or value == "":
                parsed[name] = None
            elif isinstance(value, str) and len(value.strip()) <= limit:
                parsed[name] = value.strip()
            else:
                errors[name] = f"must be text of at most {limit} characters."

    if "budget_amount_usd" in incoming:
        value = incoming["budget_amount_usd"]
        if value is None:
            parsed["budget_amount_usd"] = None
        elif isinstance(value, bool) or not isinstance(value, (int, float)) or value < 0 or value > 1e9:
            errors["budget_amount_usd"] = "must be a number between 0 and 1,000,000,000."
        else:
            parsed["budget_amount_usd"] = float(value)

    if "departments" in incoming:
        try:
            parsed["departments"] = _parse_departments(incoming["departments"])
        except ValueError as exc:
            errors["departments"] = f"{exc}."

    if errors:
        return {}, errors

    # ---- merge with existing values / defaults -----------------------------
    merged = dict(REQUIREMENT_DEFAULTS)
    if existing:
        merged.update({k: existing[k] for k in ENGINE_FIELDS if k in existing})
    merged.update(parsed)

    # employees can be derived from departments on creation
    dept_total = sum(d["users"] for d in merged["departments"])
    if existing is None and "employees" not in parsed:
        if dept_total > 0:
            merged["employees"] = dept_total
        else:
            errors["employees"] = "Provide 'employees' or a 'departments' list."
    if dept_total > merged["employees"] > 0:
        errors["departments"] = (
            f"Department users ({dept_total}) exceed total employees ({merged['employees']})."
        )

    # service flags: switch on automatically when devices exist, unless explicitly disabled
    for count_field, flag in FLAG_FOR_COUNT.items():
        if merged[count_field] > 0 and not merged[flag]:
            if flag in parsed and parsed[flag] is False:
                errors[flag] = f"'{count_field}' is {merged[count_field]} but '{flag}' is false."
            else:
                merged[flag] = True

    # cross-field checks
    if merged["branches"] == 0 and (merged.get("branch_users_percent") or 0) > 0:
        errors["branch_users_percent"] = "Requires at least one branch."
    if merged["buildings"] * merged["floors_per_building"] > MAX_TOTAL_FLOORS:
        errors["buildings"] = (
            f"buildings x floors_per_building must not exceed {MAX_TOTAL_FLOORS}; "
            "model very large estates as separate organizations."
        )
    endpoints = sum(
        merged[k]
        for k in (
            "wired_devices",
            "wireless_devices",
            "servers",
            "printers",
            "voip_phones",
            "cctv_cameras",
            "iot_devices",
        )
    )
    if endpoints < 1:
        errors["devices"] = "At least one device (wired, wireless, server, printer, phone, camera or IoT) is required."

    if errors:
        return {}, errors
    return merged, {}