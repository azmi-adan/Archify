
from datetime import timedelta

from sqlalchemy import func

from extensions import bcrypt, db, utcnow
from models.signup import User

MAX_FAILED_ATTEMPTS = 5
LOCKOUT_WINDOW = timedelta(minutes=15)

_dummy_hash = None  # computed lazily (needs the Flask app context for bcrypt rounds)


class LoginAttempt(db.Model):
    __tablename__ = "login_attempts"

    id = db.Column(db.Integer, primary_key=True)
    identifier = db.Column(db.String(254), nullable=False, index=True)
    success = db.Column(db.Boolean, nullable=False, default=False)
    ip_address = db.Column(db.String(45), nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow, index=True)


class LoginService:
    @staticmethod
    def log_attempt(identifier, success, ip_address=None):
        """Record an attempt. Auditing must never break the login flow."""
        try:
            db.session.add(
                LoginAttempt(
                    identifier=(identifier or "unknown")[:254].lower(),
                    success=bool(success),
                    ip_address=(ip_address or "")[:45] or None,
                )
            )
            db.session.commit()
        except Exception:  # noqa: BLE001 - logging failure must not block auth
            db.session.rollback()

    @staticmethod
    def is_locked(identifier):
        """True after MAX_FAILED_ATTEMPTS failures since the last success in the window."""
        ident = identifier.lower()
        since = utcnow() - LOCKOUT_WINDOW
        last_success = (
            db.session.query(func.max(LoginAttempt.created_at))
            .filter(LoginAttempt.identifier == ident, LoginAttempt.success.is_(True))
            .scalar()
        )
        if last_success and last_success > since:
            since = last_success
        failures = (
            LoginAttempt.query.filter(
                LoginAttempt.identifier == ident,
                LoginAttempt.success.is_(False),
                LoginAttempt.created_at > since,
            ).count()
        )
        return failures >= MAX_FAILED_ATTEMPTS

    @staticmethod
    def authenticate(identifier, password, ip_address=None):
        """Return (user, error_code). error_code is None, 'locked' or 'invalid_credentials'."""
        global _dummy_hash
        if LoginService.is_locked(identifier):
            return None, "locked"

        user = User.find_by_identifier(identifier)
        if user is None or not user.is_active:
            # Burn comparable CPU time so response time does not reveal whether the account exists.
            if _dummy_hash is None:
                _dummy_hash = bcrypt.generate_password_hash("archify-timing-equaliser").decode("utf-8")
            try:
                bcrypt.check_password_hash(_dummy_hash, password)
            except (ValueError, TypeError):
                pass
            LoginService.log_attempt(identifier, False, ip_address)
            return None, "invalid_credentials"

        if not user.check_password(password):
            LoginService.log_attempt(identifier, False, ip_address)
            return None, "invalid_credentials"

        LoginService.log_attempt(identifier, True, ip_address)
        return user, None


def validate_login_payload(payload):
    """Accepts `identifier`, `username` or `email` plus `password`."""
    if not isinstance(payload, dict):
        return {}, {"body": "A JSON object is required."}
    errors = {}
    identifier = payload.get("identifier") or payload.get("username") or payload.get("email")
    password = payload.get("password")

    if not isinstance(identifier, str) or not identifier.strip() or len(identifier) > 254:
        errors["identifier"] = "Username or email is required."
    if not isinstance(password, str) or not password or len(password) > 128:
        errors["password"] = "Password is required."
    if errors:
        return {}, errors
    return {"identifier": identifier.strip(), "password": password}, {}