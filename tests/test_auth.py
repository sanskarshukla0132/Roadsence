"""Phase 3 tests: authentication, report ownership, admin authorization."""

import pytest

from app import create_app
from database import create_user, get_report


@pytest.fixture
def client(tmp_path):
    upload_folder = tmp_path / "uploads"
    upload_folder.mkdir()
    app = create_app(
        {
            "TESTING": True,
            "DATABASE": str(tmp_path / "test.db"),
            "UPLOAD_FOLDER": str(upload_folder),
            "SECRET_KEY": "test-secret",
        }
    )
    with app.test_client() as test_client:
        yield test_client, app.config["DATABASE"]


def _csrf(client):
    """Return the CSRF token stored in the session after a GET."""
    with client.session_transaction() as sess:
        return sess.get("csrf_token")


def _register(client, username="alice", password="password123"):
    client.get("/register")
    return client.post(
        "/register",
        data={
            "username": username,
            "password": password,
            "csrf_token": _csrf(client),
        },
    )


def _login(client, username="alice", password="password123"):
    client.get("/login")
    return client.post(
        "/login",
        data={
            "username": username,
            "password": password,
            "csrf_token": _csrf(client),
        },
    )


def _logout(client):
    return client.post(
        "/logout",
        data={"csrf_token": _csrf(client)},
    )


# ---------------- Registration ----------------

def test_register_creates_user_and_logs_in(client):
    test_client, _db = client
    response = _register(test_client)
    assert response.status_code == 302
    with test_client.session_transaction() as sess:
        assert sess.get("user_id") is not None


def test_register_rejects_duplicate_username(client):
    test_client, _db = client
    _register(test_client, "bob", "password123")
    _logout(test_client)
    response = _register(test_client, "bob", "otherpass1")
    assert response.status_code == 400
    assert b"already taken" in response.data


def test_register_rejects_short_password(client):
    test_client, _db = client
    response = _register(test_client, "carol", "short")
    assert response.status_code == 400
    assert b"at least 8 characters" in response.data


def test_register_rejects_short_username(client):
    test_client, _db = client
    response = _register(test_client, "ab", "password123")
    assert response.status_code == 400


def test_registered_user_is_not_admin(client):
    test_client, db_path = client
    _register(test_client, "dave", "password123")
    from database import get_user_by_username

    user = get_user_by_username(db_path, "dave")
    assert user["is_admin"] == 0


# ---------------- Login / Logout ----------------

def test_login_with_correct_credentials(client):
    test_client, _db = client
    _register(test_client, "eve", "password123")
    _logout(test_client)
    response = _login(test_client, "eve", "password123")
    assert response.status_code == 302
    with test_client.session_transaction() as sess:
        assert sess.get("user_id") is not None


def test_login_with_wrong_password_fails(client):
    test_client, _db = client
    _register(test_client, "frank", "password123")
    _logout(test_client)
    response = _login(test_client, "frank", "wrongpass")
    assert response.status_code == 401
    with test_client.session_transaction() as sess:
        assert sess.get("user_id") is None


def test_logout_clears_session(client):
    test_client, _db = client
    _register(test_client, "grace", "password123")
    response = _logout(test_client)
    assert response.status_code == 302
    with test_client.session_transaction() as sess:
        assert sess.get("user_id") is None


# ---------------- Report ownership ----------------

def test_report_is_owned_by_logged_in_user(client):
    test_client, db_path = client
    _register(test_client, "henry", "password123")
    test_client.post(
        "/api/reports",
        data={
            "hazard_type": "Pothole",
            "description": "Deep pothole near the crossing.",
            "latitude": "28.613900",
            "longitude": "77.209000",
            "csrf_token": _csrf(test_client),
        },
    )
    report = get_report(db_path, 1)
    from database import get_user_by_username

    user = get_user_by_username(db_path, "henry")
    assert report["user_id"] == user["id"]


def test_my_reports_only_shows_current_user_reports(client):
    test_client, db_path = client
    _register(test_client, "ivy", "password123")
    test_client.post(
        "/api/reports",
        data={
            "hazard_type": "Pothole",
            "description": "Ivy's pothole report.",
            "latitude": "28.613900",
            "longitude": "77.209000",
            "csrf_token": _csrf(test_client),
        },
    )
    _logout(test_client)
    _register(test_client, "jack", "password123")
    response = test_client.get("/my-reports")
    assert response.status_code == 200
    assert b"Ivy's pothole report" not in response.data


def test_my_reports_requires_login(client):
    test_client, _db = client
    response = test_client.get("/my-reports")
    assert response.status_code == 302
    assert "/login" in response.headers["Location"]


def test_existing_reports_without_user_remain_null(client):
    _test_client, db_path = client
    from database import create_report

    create_report(
        db_path,
        hazard_type="Waterlogging",
        description="Pre-auth legacy report.",
        latitude=19.0,
        longitude=72.0,
    )
    report = get_report(db_path, 1)
    assert report["user_id"] is None


# ---------------- Admin authorization ----------------

def test_non_admin_cannot_access_admin_dashboard(client):
    test_client, _db = client
    _register(test_client, "kate", "password123")
    response = test_client.get("/admin")
    assert response.status_code == 403


def test_anonymous_cannot_access_admin_dashboard(client):
    test_client, _db = client
    response = test_client.get("/admin")
    assert response.status_code == 302
    assert "/login" in response.headers["Location"]


def test_admin_can_access_dashboard(client):
    test_client, db_path = client
    create_user(db_path, "admin", "password123", is_admin=True)
    _login(test_client, "admin", "password123")
    response = test_client.get("/admin")
    assert response.status_code == 200


def test_non_admin_cannot_update_status(client):
    test_client, db_path = client
    _register(test_client, "leo", "password123")
    test_client.post(
        "/api/reports",
        data={
            "hazard_type": "Pothole",
            "description": "Leo's pothole.",
            "latitude": "28.613900",
            "longitude": "77.209000",
            "csrf_token": _csrf(test_client),
        },
    )
    response = test_client.post(
        "/admin/reports/1/status",
        data={"status": "Resolved", "csrf_token": _csrf(test_client)},
    )
    assert response.status_code == 403
    report = get_report(db_path, 1)
    assert report["status"] == "Reported"


def test_admin_can_update_status(client):
    test_client, db_path = client
    create_user(db_path, "admin", "password123", is_admin=True)
    from database import create_report

    create_report(
        db_path,
        hazard_type="Pothole",
        description="A pothole.",
        latitude=28.6,
        longitude=77.2,
    )
    _login(test_client, "admin", "password123")
    response = test_client.post(
        "/admin/reports/1/status",
        data={"status": "Resolved", "csrf_token": _csrf(test_client)},
    )
    assert response.status_code == 302
    report = get_report(db_path, 1)
    assert report["status"] == "Resolved"


def test_admin_status_update_rejects_invalid_status(client):
    test_client, db_path = client
    create_user(db_path, "admin", "password123", is_admin=True)
    from database import create_report

    create_report(
        db_path,
        hazard_type="Pothole",
        description="A pothole.",
        latitude=28.6,
        longitude=77.2,
    )
    _login(test_client, "admin", "password123")
    test_client.post(
        "/admin/reports/1/status",
        data={"status": "NotARealStatus", "csrf_token": _csrf(test_client)},
    )
    report = get_report(db_path, 1)
    assert report["status"] == "Reported"


# ---------------- CSRF ----------------

def test_post_without_csrf_is_rejected(client):
    test_client, _db = client
    _register(test_client, "mia", "password123")
    response = test_client.post(
        "/api/reports",
        data={
            "hazard_type": "Pothole",
            "description": "Missing CSRF token here.",
            "latitude": "28.613900",
            "longitude": "77.209000",
        },
    )
    assert response.status_code == 400
