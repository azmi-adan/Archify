"""Organization: the ownership container.

User -> Organization -> NetworkRequirement -> GeneratedDesign
Everything beneath an organization is reached *through* it, so a single
ownership check (organization.user_id == JWT identity) protects the whole tree.
"""
from extensions import db, iso, utcnow

ORGANIZATION_TYPES = (
    "enterprise",
    "office",
    "school",
    "university",
    "hospital",
    "financial",
    "government",
    "retail",
    "manufacturing",
    "hospitality",
    "ngo",
    "other",
)


class Organization(db.Model):
    __tablename__ = "organizations"
    __table_args__ = (db.UniqueConstraint("user_id", "name", name="uq_organizations_user_name"),)

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name = db.Column(db.String(120), nullable=False)
    organization_type = db.Column(db.String(40), nullable=False, default="other")
    description = db.Column(db.String(500), nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=utcnow, onupdate=utcnow)

    user = db.relationship("User", back_populates="organizations")
    requirements = db.relationship(
        "NetworkRequirement",
        back_populates="organization",
        uselist=False,
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    design = db.relationship(
        "GeneratedDesign",
        back_populates="organization",
        uselist=False,
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "organization_type": self.organization_type,
            "description": self.description,
            "has_requirements": self.requirements is not None,
            "has_design": self.design is not None,
            "design_version": self.design.version if self.design else None,
            "created_at": iso(self.created_at),
            "updated_at": iso(self.updated_at),
        }


def validate_organization_payload(payload, partial=False):
    """Return (clean, errors). `user_id` and any unknown key is ignored, never trusted."""
    if not isinstance(payload, dict):
        return {}, {"body": "A JSON object is required."}

    clean, errors = {}, {}

    if "name" in payload or not partial:
        name = payload.get("name")
        if not isinstance(name, str) or not (2 <= len(name.strip()) <= 120):
            errors["name"] = "Name is required and must be 2-120 characters."
        else:
            clean["name"] = " ".join(name.split())

    if "organization_type" in payload or not partial:
        org_type = payload.get("organization_type", "other")
        if not isinstance(org_type, str) or org_type.strip().lower() not in ORGANIZATION_TYPES:
            errors["organization_type"] = "Must be one of: " + ", ".join(ORGANIZATION_TYPES) + "."
        else:
            clean["organization_type"] = org_type.strip().lower()

    if "description" in payload:
        description = payload.get("description")
        if description is None or description == "":
            clean["description"] = None
        elif not isinstance(description, str) or len(description.strip()) > 500:
            errors["description"] = "Description must be text of at most 500 characters."
        else:
            clean["description"] = description.strip()

    if partial and not clean and not errors:
        errors["body"] = "Provide at least one of: name, organization_type, description."

    return (clean, errors) if not errors else ({}, errors)