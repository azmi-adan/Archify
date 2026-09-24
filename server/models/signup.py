
import re

from sqlalchemy import func

from extensions import bcrypt, db, iso, utcnow

USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]{3,30}$")
EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+\-]+@[A-Za-z0-9\-]+(\.[A-Za-z0-9\-]+)*\.[A-Za-z]{2,}$")


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(30), nullable=False, unique=True, index=True)
    email = db.Column(db.String(254), nullable=False, unique=True, index=True)
    password_hash = db.Column(db.String(128), nullable=False)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)

    organizations = db.relationship(
        "Organization",
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    # ---- password handling -------------------------------------------------
    def set_password(self, raw_password):
        self.password_hash = bcrypt.generate_password_hash(raw_password).decode("utf-8")

    def check_password(self, raw_password):
        try:
            return bcrypt.check_password_hash(self.password_hash, raw_password)
        except (ValueError, TypeError):
            return False

    # ---- lookups (case-insensitive) ---------------------------------------
    @staticmethod
    def find_by_username(username):
        return User.query.filter(func.lower(User.username) == username.lower()).first()

    @staticmethod
    def find_by_email(email):
        return User.query.filter(func.lower(User.email) == email.lower()).first()

    @staticmethod
    def find_by_identifier(identifier):
        ident = identifier.lower()
        return User.query.filter(
            (func.lower(User.username) == ident) | (func.lower(User.email) == ident)
        ).first()

    # ---- serialisation: never includes the password hash -------------------
    def to_dict(self):
        return {
            "id": self.id,
            "username": self.username,
            "email": self.email,
            "created_at": iso(self.created_at),
        }


def validate_signup_payload(payload):
    """Return (clean, errors). `errors` maps field name -> message."""
    errors = {}
    if not isinstance(payload, dict):
        return {}, {"body": "A JSON object is required."}

    username = payload.get("username")
    email = payload.get("email")
    password = payload.get("password")

    if not isinstance(username, str) or not USERNAME_RE.match(username.strip()):
        errors["username"] = "Username must be 3-30 characters: letters, numbers, '.', '_' or '-'."
    if not isinstance(email, str) or len(email.strip()) > 254 or not EMAIL_RE.match(email.strip()):
        errors["email"] = "A valid email address is required."
    if not isinstance(password, str):
        errors["password"] = "Password is required."
    else:
        # bcrypt only uses the first 72 bytes, so longer passwords are rejected outright.
        if len(password) < 8 or len(password.encode("utf-8")) > 72:
            errors["password"] = "Password must be 8-72 characters long."
        elif not (re.search(r"[A-Za-z]", password) and re.search(r"\d", password)):
            errors["password"] = "Password must contain at least one letter and one number."

    if errors:
        return {}, errors
    return {
        "username": username.strip(),
        "email": email.strip().lower(),
        "password": password,
    }, {}