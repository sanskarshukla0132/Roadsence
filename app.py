"""
RoadSense — Phase 3
Flask app with user authentication, report ownership, and an admin dashboard.
Hazard reports are stored in SQLite and shown on an interactive Leaflet map.
"""

import os
import secrets
from functools import wraps
from pathlib import Path
from uuid import uuid4

from flask import (
    Flask,
    abort,
    flash,
    jsonify,
    redirect,
    render_template,
    request,
    send_from_directory,
    session,
    url_for,
)
from werkzeug.exceptions import RequestEntityTooLarge


from database import (
    ALLOWED_STATUSES,
    create_report,
    create_user,
    get_connection,
    get_report,
    get_user_by_id,
    get_user_by_username,
    init_db,
    list_all_reports_with_users,
    list_reports,
    update_report_status,
    verify_password,
)


BASE_DIR = Path(__file__).resolve().parent
ALLOWED_HAZARD_TYPES = ("Pothole", "Damaged Road", "Waterlogging", "Other")
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
FILE_SIGNATURES = {
    ".jpg": (b"\xff\xd8\xff",),
    ".jpeg": (b"\xff\xd8\xff",),
    ".png": (b"\x89PNG\r\n\x1a\n",),
    ".webp": (b"RIFF",),
}
MIN_DESCRIPTION_LENGTH = 10
MAX_DESCRIPTION_LENGTH = 1000
MIN_USERNAME_LENGTH = 3
MAX_USERNAME_LENGTH = 32
MIN_PASSWORD_LENGTH = 8


def create_app(test_config=None):
    """Build the Flask app. Tests can pass a temporary database path."""
    app = Flask(__name__)
    app.config.update(
        DATABASE=str(BASE_DIR / "instance" / "roadsense.db"),
        UPLOAD_FOLDER=str(BASE_DIR / "uploads"),
        MAX_CONTENT_LENGTH=5 * 1024 * 1024,  # 5 MB photo limit
        SECRET_KEY=os.environ.get("SECRET_KEY") or "roadsense-dev-only-secret",
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",
        SESSION_COOKIE_SECURE=False,
    )
    if test_config:
        app.config.update(test_config)

    Path(app.config["UPLOAD_FOLDER"]).mkdir(parents=True, exist_ok=True)
    init_db(app.config["DATABASE"])

    # ------------------------------------------------------------------
    # Helpers: current user, CSRF, auth decorators
    # ------------------------------------------------------------------

    def current_user():
        user_id = session.get("user_id")
        if user_id is None:
            return None
        return get_user_by_id(app.config["DATABASE"], user_id)

    def csrf_token():
        if "csrf_token" not in session:
            session["csrf_token"] = secrets.token_hex(32)
        return session["csrf_token"]

    def validate_csrf():
        token = request.form.get("csrf_token") or request.headers.get(
            "X-CSRF-Token"
        )
        if not token or not secrets.compare_digest(token, csrf_token()):
            abort(400, "Invalid or missing CSRF token.")

    @app.before_request
    def _csrf_protect():
        if request.method in ("POST", "PUT", "PATCH", "DELETE"):
            validate_csrf()

    def login_required(view):
        @wraps(view)
        def wrapped(*args, **kwargs):
            if current_user() is None:
                if request.path.startswith("/api/"):
                    return jsonify({"error": "Please log in to report a hazard."}), 401
                return redirect(url_for("login", next=request.path))
            return view(*args, **kwargs)
        return wrapped

    def admin_required(view):
        @wraps(view)
        def wrapped(*args, **kwargs):
            user = current_user()
            if user is None:
                return redirect(url_for("login", next=request.path))
            if not user["is_admin"]:
                abort(403)
            return view(*args, **kwargs)
        return wrapped

    @app.context_processor
    def inject_globals():
        user = current_user()
        return {
            "current_user": user,
            "csrf_token": csrf_token(),
        }

    # ------------------------------------------------------------------
    # Public pages
    # ------------------------------------------------------------------

    @app.route("/")
    def home():
        """Show the RoadSense landing page."""
        return render_template("index.html")

    @app.route("/api/reports", methods=["GET"])
    def get_reports():
        """Return saved reports as JSON for the public map."""
        reports = [
            _public_report(row) for row in list_reports(app.config["DATABASE"])
        ]
        return jsonify({"reports": reports})

    @app.route("/api/reports", methods=["POST"])
    @login_required
    def post_report():
        """Validate a new report, save it, and return the stored row."""
        error = _validate_report_form(request.form)
        if error:
            return jsonify({"error": error}), 400

        photo_filename = None
        photo = request.files.get("photo")
        if photo and photo.filename:
            saved_name, photo_error = _save_photo(
                photo, app.config["UPLOAD_FOLDER"]
            )
            if photo_error:
                return jsonify({"error": photo_error}), 400
            photo_filename = saved_name

        row = create_report(
            app.config["DATABASE"],
            hazard_type=request.form["hazard_type"].strip(),
            description=request.form["description"].strip(),
            latitude=float(request.form["latitude"]),
            longitude=float(request.form["longitude"]),
            photo_filename=photo_filename,
            user_id=current_user()["id"],
        )
        return jsonify({"report": _public_report(row)}), 201

    @app.route("/uploads/<path:filename>")
    def uploaded_file(filename):
        """Serve an uploaded photo from the uploads folder only."""
        return send_from_directory(app.config["UPLOAD_FOLDER"], filename)

    @app.errorhandler(RequestEntityTooLarge)
    def too_large(_error):
        return jsonify({"error": "The photo is too large. Maximum size is 5 MB."}), 413

    # ------------------------------------------------------------------
    # Authentication
    # ------------------------------------------------------------------

    @app.route("/register", methods=["GET", "POST"])
    def register():
        if request.method == "POST":
            username = (request.form.get("username") or "").strip()
            password = request.form.get("password") or ""

            if not (MIN_USERNAME_LENGTH <= len(username) <= MAX_USERNAME_LENGTH):
                flash(
                    f"Username must be {MIN_USERNAME_LENGTH}-{MAX_USERNAME_LENGTH} characters."
                )
                return render_template("register.html"), 400
            if len(password) < MIN_PASSWORD_LENGTH:
                flash(f"Password must be at least {MIN_PASSWORD_LENGTH} characters.")
                return render_template("register.html"), 400

            existing = get_user_by_username(app.config["DATABASE"], username)
            if existing:
                flash("That username is already taken.")
                return render_template("register.html"), 400

            user = create_user(app.config["DATABASE"], username, password, is_admin=False)
            if user is None:
                flash("Could not create that account. Try a different username.")
                return render_template("register.html"), 400

            session.clear()
            session["user_id"] = user["id"]
            session["csrf_token"] = secrets.token_hex(32)
            return redirect(url_for("home"))

        return render_template("register.html")

    @app.route("/login", methods=["GET", "POST"])
    def login():
        if request.method == "POST":
            username = (request.form.get("username") or "").strip()
            password = request.form.get("password") or ""
            user = get_user_by_username(app.config["DATABASE"], username)

            if not user or not verify_password(user, password):
                flash("Invalid username or password.")
                return render_template("login.html"), 401

            session.clear()
            session["user_id"] = user["id"]
            session["csrf_token"] = secrets.token_hex(32)
            next_url = request.args.get("next") or url_for("home")
            if not next_url.startswith("/"):
                next_url = url_for("home")
            return redirect(next_url)

        return render_template("login.html")

    @app.route("/logout", methods=["POST"])
    def logout():
        session.clear()
        return redirect(url_for("home"))

    # ------------------------------------------------------------------
    # My Reports
    # ------------------------------------------------------------------

    @app.route("/my-reports")
    @login_required
    def my_reports():
        reports = list_reports(app.config["DATABASE"], user_id=current_user()["id"])
        return render_template("my_reports.html", reports=reports)

    # ------------------------------------------------------------------
    # Admin dashboard
    # ------------------------------------------------------------------

    @app.route("/admin")
    @admin_required
    def admin_dashboard():
        reports = list_all_reports_with_users(app.config["DATABASE"])
        return render_template(
            "admin.html", reports=reports, allowed_statuses=ALLOWED_STATUSES
        )

    @app.route("/admin/reports/<int:report_id>/status", methods=["POST"])
    @admin_required
    def admin_update_status(report_id):
        status = (request.form.get("status") or "").strip()
        updated = update_report_status(app.config["DATABASE"], report_id, status)
        if updated is None:
            flash("Could not update that report.")
            return redirect(url_for("admin_dashboard"))
        flash(f"Report #{report_id} status set to {updated['status']}.")
        return redirect(url_for("admin_dashboard"))

    # ------------------------------------------------------------------
    # CLI: create the first admin account
    # ------------------------------------------------------------------

    @app.cli.command("create-admin")
    def create_admin_cli():
        """Create an administrator account. Usage: flask create-admin USERNAME PASSWORD"""
        import sys

        args = sys.argv[2:]
        if len(args) < 2:
            print("Usage: flask create-admin <username> <password>")
            return
        create_admin_account(app.config["DATABASE"], args[0], args[1])

    return app


def create_admin_account(db_path, username, password):
    """Create an admin account or promote an existing account."""
    existing = get_user_by_username(db_path, username)

    if existing:
        with get_connection(db_path) as conn:
            conn.execute(
                "UPDATE users SET is_admin = 1 WHERE id = ?",
                (existing["id"],),
            )
            conn.commit()

        print(f"Existing user '{username}' promoted to admin.")
        return get_user_by_id(db_path, existing["id"])

    user = create_user(db_path, username, password, is_admin=True)

    if user is None:
        print("Failed to create admin account.")
        return None

    print(f"Admin account '{username}' created (id={user['id']}).")
    return user


# ----------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------

def _public_report(row):
    """Shape a database row for the browser. Never send a raw file path."""
    filename = row.get("photo_filename")
    return {
        "id": row["id"],
        "hazard_type": row["hazard_type"],
        "description": row["description"],
        "latitude": row["latitude"],
        "longitude": row["longitude"],
        "photo_url": f"/uploads/{filename}" if filename else None,
        "status": row["status"],
        "created_at": row["created_at"],
    }


def _validate_report_form(form):
    hazard_type = (form.get("hazard_type") or "").strip()
    description = (form.get("description") or "").strip()
    latitude_raw = (form.get("latitude") or "").strip()
    longitude_raw = (form.get("longitude") or "").strip()

    if hazard_type not in ALLOWED_HAZARD_TYPES:
        return "Choose a valid hazard type."

    if len(description) < MIN_DESCRIPTION_LENGTH:
        return "Please write a description of at least 10 characters."
    if len(description) > MAX_DESCRIPTION_LENGTH:
        return "The description is too long (1000 characters maximum)."

    try:
        latitude = float(latitude_raw)
        longitude = float(longitude_raw)
    except ValueError:
        return "Click the map to choose a location."

    if not -90 <= latitude <= 90 or not -180 <= longitude <= 180:
        return "The chosen map location is not valid."

    return None


def _save_photo(photo, upload_folder):
    """Store a photo under a generated name. Never use the original filename."""
    original_name = photo.filename or ""
    extension = Path(original_name).suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        return None, "Photos must be JPG, JPEG, PNG, or WEBP."

    header = photo.stream.read(16)
    photo.stream.seek(0)
    if not _has_allowed_signature(extension, header):
        return None, "That file does not look like a valid image."

    filename = f"{uuid4().hex}{extension}"
    destination = Path(upload_folder) / filename
    photo.save(destination)
    return filename, None


def _has_allowed_signature(extension, header):
    signatures = FILE_SIGNATURES.get(extension, ())
    if extension == ".webp":
        return header.startswith(b"RIFF") and header[8:12] == b"WEBP"
    return any(header.startswith(signature) for signature in signatures)


app = create_app()


if __name__ == "__main__":
    if len(os.sys.argv) >= 4 and os.sys.argv[1] == "create-admin":
        create_admin_account(
            app.config["DATABASE"], os.sys.argv[2], os.sys.argv[3]
        )
    elif len(os.sys.argv) >= 2 and os.sys.argv[1] == "create-admin":
        print("Usage: python app.py create-admin <username> <password>")
    else:
        # debug=True reloads the server when you save files (useful while learning).
        app.run(debug=True)
