
import logging
import os
import secrets
from datetime import timedelta

from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_jwt_extended import create_access_token, get_jwt_identity, jwt_required
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from werkzeug.exceptions import HTTPException

load_dotenv()

from extensions import bcrypt, db, jwt, migrate  # noqa: E402

# Importing every model here registers it with SQLAlchemy metadata (needed by Flask-Migrate).
from models.signup import User, validate_signup_payload  # noqa: E402
from models.login import LoginAttempt, LoginService, validate_login_payload  # noqa: E402,F401
from models.organization import Organization, validate_organization_payload  # noqa: E402
from models.requirements import NetworkRequirement, validate_requirements  # noqa: E402
from models.generation import (  # noqa: E402
    ENGINE_VERSION,
    DesignError,
    GeneratedDesign,
    generate_design,
    requirements_hash,
)
from models.dashboard import DashboardService  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("archify")

# =========================================================================== #
# APP CONFIG (all secrets come from .env)
# =========================================================================== #
app = Flask(__name__)

database_url = os.getenv("DATABASE_URL", "sqlite:///archify.db")
if database_url.startswith("postgres://"):  # Supabase/Heroku style URLs
    database_url = database_url.replace("postgres://", "postgresql://", 1)

jwt_secret = os.getenv("JWT_SECRET_KEY")
if not jwt_secret:
    jwt_secret = secrets.token_urlsafe(48)
    logger.warning("JWT_SECRET_KEY is not set; using a temporary secret. Tokens will stop working on restart.")

app.config["SQLALCHEMY_DATABASE_URI"] = database_url
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {"pool_pre_ping": True}
app.config["JWT_SECRET_KEY"] = jwt_secret
app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(hours=int(os.getenv("JWT_EXPIRES_HOURS", "24")))
app.config["BCRYPT_LOG_ROUNDS"] = int(os.getenv("BCRYPT_LOG_ROUNDS", "12"))
app.config["MAX_CONTENT_LENGTH"] = 1 * 1024 * 1024  # 1 MB request bodies
app.config["JSON_SORT_KEYS"] = False

db.init_app(app)
migrate.init_app(app, db, compare_type=True)
bcrypt.init_app(app)
jwt.init_app(app)

allowed_origins = [
    o.strip()
    for o in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000").split(",")
    if o.strip()
]
CORS(
    app,
    resources={r"/api/*": {"origins": allowed_origins}},
    supports_credentials=True,
    allow_headers=["Content-Type", "Authorization"],
    methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
)


# =========================================================================== #
# RESPONSE HELPERS
# =========================================================================== #
def ok(message, data=None, status=200):
    return jsonify({"success": True, "message": message, "data": data if data is not None else {}}), status


def fail(message, error, status, details=None):
    body = {"success": False, "message": message, "error": error}
    if details:
        body["details"] = details
    return jsonify(body), status


def read_json():
    """Return (payload, error_response). Only JSON objects are accepted."""
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return None, fail("Request body must be a JSON object.", "invalid_json", 400)
    return payload, None


def current_user_id():
    """The authenticated user's id, taken ONLY from the verified JWT."""
    try:
        return int(get_jwt_identity())
    except (TypeError, ValueError):
        return None


def get_current_user():
    uid = current_user_id()
    user = db.session.get(User, uid) if uid is not None else None
    return user if user is not None and user.is_active else None


def get_owned_organization(org_id):
    """Fetch an organization ONLY if it belongs to the caller.

    Foreign or missing ids both yield None, so callers answer 404 and never reveal
    whether another user's organization exists (IDOR protection). Every nested
    resource (requirements, design, dashboard) is reached through this function.
    """
    uid = current_user_id()
    if uid is None:
        return None
    return Organization.query.filter_by(id=org_id, user_id=uid).first()


def org_not_found():
    return fail("Organization not found.", "not_found", 404)


def validation_failed(errors):
    return fail("Validation failed.", "validation_error", 422, errors)


def regenerate_design(organization):
    """requirements -> engine -> stored design. Adds to the session; caller commits."""
    engine_input = organization.requirements.to_engine_input(organization)
    result = generate_design(engine_input)  # may raise DesignError
    return GeneratedDesign.save_for(organization, result, requirements_hash(engine_input))


def impossible(exc):
    return fail("The requirements cannot be turned into a valid network design.", "impossible_requirements", 422, {"reason": str(exc)})


# =========================================================================== #
# HEALTH
# =========================================================================== #
@app.route("/api/health", methods=["GET"])
def health():
    return ok("Archify API is running.", {"status": "ok", "engine_version": ENGINE_VERSION})


# =========================================================================== #
# AUTH ROUTES
# =========================================================================== #
@app.route("/api/auth/signup", methods=["POST"])
def signup():
    payload, err = read_json()
    if err:
        return err
    clean, errors = validate_signup_payload(payload)
    if errors:
        return validation_failed(errors)

    if User.find_by_username(clean["username"]):
        return fail("Username is already taken.", "duplicate_username", 409)
    if User.find_by_email(clean["email"]):
        return fail("An account with this email already exists.", "duplicate_email", 409)

    user = User(username=clean["username"], email=clean["email"])
    user.set_password(clean["password"])
    db.session.add(user)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return fail("Username or email is already in use.", "duplicate_account", 409)
    return ok("Account created successfully.", {"user": user.to_dict()}, 201)


@app.route("/api/auth/login", methods=["POST"])
def login():
    payload, err = read_json()
    if err:
        return err
    clean, errors = validate_login_payload(payload)
    if errors:
        return validation_failed(errors)

    user, code = LoginService.authenticate(clean["identifier"], clean["password"], request.remote_addr)
    if code == "locked":
        return fail("Too many failed attempts. Try again in 15 minutes.", "too_many_attempts", 429)
    if code:
        return fail("Invalid username or password.", "invalid_credentials", 401)

    token = create_access_token(identity=str(user.id))
    return ok(
        "Login successful.",
        {
            "access_token": token,
            "token": token,
            "token_type": "Bearer",
            "expires_in": int(app.config["JWT_ACCESS_TOKEN_EXPIRES"].total_seconds()),
            "user": user.to_dict(),
        },
    )


@app.route("/api/auth/me", methods=["GET"])
@jwt_required()
def me():
    user = get_current_user()
    if user is None:
        return fail("Account not found or disabled.", "unauthorized", 401)
    return ok("Authenticated user.", {"user": user.to_dict()})


# =========================================================================== #
# ORGANIZATION ROUTES
# =========================================================================== #
@app.route("/api/organizations", methods=["POST"])
@jwt_required()
def create_organization():
    payload, err = read_json()
    if err:
        return err
    clean, errors = validate_organization_payload(payload)
    if errors:
        return validation_failed(errors)

    uid = current_user_id()
    if get_current_user() is None:
        return fail("Account not found or disabled.", "unauthorized", 401)
    duplicate = Organization.query.filter(
        Organization.user_id == uid, func.lower(Organization.name) == clean["name"].lower()
    ).first()
    if duplicate:
        return fail("You already have an organization with this name.", "duplicate_organization", 409)

    org = Organization(user_id=uid, **clean)  # user_id comes from the JWT, never the request body
    db.session.add(org)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return fail("You already have an organization with this name.", "duplicate_organization", 409)
    return ok("Organization created.", {"organization": org.to_dict()}, 201)


@app.route("/api/organizations", methods=["GET"])
@jwt_required()
def list_organizations():
    orgs = (
        Organization.query.filter_by(user_id=current_user_id())
        .order_by(Organization.created_at.desc(), Organization.id.desc())
        .all()
    )
    return ok("Organizations retrieved.", {"organizations": [o.to_dict() for o in orgs], "count": len(orgs)})


@app.route("/api/organizations/<int:org_id>", methods=["GET"])
@jwt_required()
def get_organization(org_id):
    org = get_owned_organization(org_id)
    if org is None:
        return org_not_found()
    return ok("Organization retrieved.", {"organization": org.to_dict()})


@app.route("/api/organizations/<int:org_id>", methods=["PUT"])
@jwt_required()
def update_organization(org_id):
    org = get_owned_organization(org_id)
    if org is None:
        return org_not_found()
    payload, err = read_json()
    if err:
        return err
    clean, errors = validate_organization_payload(payload, partial=True)
    if errors:
        return validation_failed(errors)

    if "name" in clean:
        duplicate = Organization.query.filter(
            Organization.user_id == org.user_id,
            func.lower(Organization.name) == clean["name"].lower(),
            Organization.id != org.id,
        ).first()
        if duplicate:
            return fail("You already have an organization with this name.", "duplicate_organization", 409)

    type_changed = "organization_type" in clean and clean["organization_type"] != org.organization_type
    for key, value in clean.items():
        setattr(org, key, value)

    regenerated = False
    try:
        # organization type influences the rules (Wi-Fi density, security bias), so keep the design in sync
        if type_changed and org.requirements is not None and org.design is not None:
            regenerate_design(org)
            regenerated = True
        db.session.commit()
    except DesignError as exc:
        db.session.rollback()
        return impossible(exc)
    except IntegrityError:
        db.session.rollback()
        return fail("You already have an organization with this name.", "duplicate_organization", 409)

    data = {"organization": org.to_dict(), "design_regenerated": regenerated}
    return ok("Organization updated.", data)


@app.route("/api/organizations/<int:org_id>", methods=["DELETE"])
@jwt_required()
def delete_organization(org_id):
    org = get_owned_organization(org_id)
    if org is None:
        return org_not_found()
    db.session.delete(org)  # cascades to requirements and design
    db.session.commit()
    return ok("Organization and all of its data were deleted.", {"id": org_id})


# =========================================================================== #
# REQUIREMENTS ROUTES
# =========================================================================== #
@app.route("/api/organizations/<int:org_id>/requirements", methods=["POST"])
@jwt_required()
def create_requirements(org_id):
    org = get_owned_organization(org_id)
    if org is None:
        return org_not_found()
    if org.requirements is not None:
        return fail("Requirements already exist for this organization. Use PUT to update them.", "requirements_exist", 409)
    payload, err = read_json()
    if err:
        return err
    clean, errors = validate_requirements(payload)
    if errors:
        return validation_failed(errors)

    record = NetworkRequirement(organization=org)
    record.apply(clean)
    try:
        # dry run: reject requirements the engine cannot satisfy before they are saved
        generate_design(record.to_engine_input(org))
    except DesignError as exc:
        db.session.rollback()
        return impossible(exc)
    db.session.add(record)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return fail("Requirements already exist for this organization.", "requirements_exist", 409)
    return ok(
        "Requirements saved. Call POST /api/organizations/<id>/generate to create the design.",
        {"requirements": record.to_dict()},
        201,
    )


@app.route("/api/organizations/<int:org_id>/requirements", methods=["GET"])
@jwt_required()
def get_requirements(org_id):
    org = get_owned_organization(org_id)
    if org is None:
        return org_not_found()
    if org.requirements is None:
        return fail("No requirements have been defined for this organization.", "not_found", 404)
    return ok("Requirements retrieved.", {"requirements": org.requirements.to_dict()})


@app.route("/api/organizations/<int:org_id>/requirements", methods=["PUT"])
@jwt_required()
def update_requirements(org_id):
    org = get_owned_organization(org_id)
    if org is None:
        return org_not_found()
    record = org.requirements
    if record is None:
        return fail("No requirements exist yet. Use POST to create them.", "not_found", 404)
    payload, err = read_json()
    if err:
        return err
    clean, errors = validate_requirements(payload, existing=record.engine_dict())
    if errors:
        return validation_failed(errors)

    record.apply(clean)
    try:
        # updated requirements -> engine -> new design, in one transaction
        design = regenerate_design(org)
        db.session.commit()
    except DesignError as exc:
        db.session.rollback()  # requirements stay unchanged when the update is impossible
        return impossible(exc)
    return ok(
        "Requirements updated and the design was regenerated.",
        {"requirements": record.to_dict(), "design": design.to_dict(include_result=False)},
    )


@app.route("/api/organizations/<int:org_id>/requirements", methods=["DELETE"])
@jwt_required()
def delete_requirements(org_id):
    org = get_owned_organization(org_id)
    if org is None:
        return org_not_found()
    if org.requirements is None:
        return fail("No requirements have been defined for this organization.", "not_found", 404)
    had_design = org.design is not None
    if had_design:
        db.session.delete(org.design)  # a design cannot outlive the requirements it came from
    db.session.delete(org.requirements)
    db.session.commit()
    return ok("Requirements deleted." + (" The generated design was removed as well." if had_design else ""), {"design_deleted": had_design})


# =========================================================================== #
# GENERATION ROUTES
# =========================================================================== #
@app.route("/api/organizations/<int:org_id>/generate", methods=["POST"])
@jwt_required()
def generate(org_id):
    """Generate the design, or regenerate it (version increases each time)."""
    org = get_owned_organization(org_id)
    if org is None:
        return org_not_found()
    if org.requirements is None:
        return fail("Define requirements before generating a design.", "requirements_missing", 409)
    first_time = org.design is None
    try:
        design = regenerate_design(org)
        db.session.commit()
    except DesignError as exc:
        db.session.rollback()
        return impossible(exc)
    message = "Design generated." if first_time else "Design regenerated."
    return ok(message, {"design": design.to_dict()}, 201 if first_time else 200)


@app.route("/api/organizations/<int:org_id>/design", methods=["GET"])
@jwt_required()
def get_design(org_id):
    org = get_owned_organization(org_id)
    if org is None:
        return org_not_found()
    if org.design is None:
        return fail("No design has been generated yet.", "not_found", 404)
    return ok("Design retrieved.", {"design": org.design.to_dict()})


# =========================================================================== #
# DASHBOARD ROUTE
# =========================================================================== #
@app.route("/api/organizations/<int:org_id>/dashboard", methods=["GET"])
@jwt_required()
def dashboard(org_id):
    org = get_owned_organization(org_id)
    if org is None:
        return org_not_found()
    return ok("Dashboard retrieved.", DashboardService.build(org))


# =========================================================================== #
# ERROR HANDLING (never leak stack traces or internals)
# =========================================================================== #
HTTP_MESSAGES = {
    400: "Bad request.",
    404: "Resource not found.",
    405: "Method not allowed.",
    413: "Request body is too large.",
    415: "Unsupported media type.",
    429: "Too many requests.",
}


@app.errorhandler(HTTPException)
def handle_http_exception(exc):
    code = exc.code or 500
    return fail(HTTP_MESSAGES.get(code, exc.name), exc.name.lower().replace(" ", "_"), code)


@app.errorhandler(SQLAlchemyError)
def handle_database_error(exc):
    db.session.rollback()
    logger.exception("Database error")
    return fail("A database error occurred.", "database_error", 500)


@app.errorhandler(Exception)
def handle_unexpected_error(exc):
    db.session.rollback()
    logger.exception("Unhandled error")
    return fail("An unexpected error occurred.", "internal_error", 500)


@jwt.unauthorized_loader
def missing_token(reason):
    return fail("Authentication required. Send 'Authorization: Bearer <token>'.", "unauthorized", 401)


@jwt.invalid_token_loader
def invalid_token(reason):
    return fail("Invalid authentication token.", "invalid_token", 401)


@jwt.expired_token_loader
def expired_token(jwt_header, jwt_payload):
    return fail("Your session has expired. Please log in again.", "token_expired", 401)


@app.after_request
def security_headers(response):
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    if request.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


# =========================================================================== #
# RUN
# =========================================================================== #
if __name__ == "__main__":
    app.run(
        host=os.getenv("HOST", "127.0.0.1"),
        port=int(os.getenv("PORT", "5000")),
        debug=os.getenv("FLASK_DEBUG", "true").lower() == "true",
    )