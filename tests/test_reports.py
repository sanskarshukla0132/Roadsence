"""Basic tests for creating and retrieving hazard reports."""

from io import BytesIO
from pathlib import Path

import pytest

from app import create_app

TINY_PNG = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
    b"\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00"
    b"\x00\x0cIDATx\x9cc\xf8\xcf\xc0\x00\x00\x00\x03\x00\x01"
    b"\x00\x05\xfe\xd4\x00\x00\x00\x00IEND\xaeB`\x82"
)


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
            "WTF_CSRF_ENABLED": False,
        }
    )
    with app.test_client() as test_client:
        yield test_client, upload_folder


def _login(client, username="alice", password="password123"):
    """Register and log in a user, returning the CSRF token from the session."""
    client.get("/login")
    with client.session_transaction() as sess:
        token = sess["csrf_token"]
    client.post(
        "/register",
        data={"username": username, "password": password, "csrf_token": token},
    )
    with client.session_transaction() as sess:
        return sess["csrf_token"]


def test_home_page_loads(client):
    test_client, _upload_folder = client
    response = test_client.get("/")
    assert response.status_code == 200
    assert b"Report a Hazard" in response.data


def test_reports_start_empty(client):
    test_client, _upload_folder = client
    response = test_client.get("/api/reports")
    assert response.status_code == 200
    assert response.get_json() == {"reports": []}


def test_create_and_retrieve_report(client):
    test_client, _upload_folder = client
    token = _login(test_client)
    response = test_client.post(
        "/api/reports",
        data={
            "hazard_type": "Pothole",
            "description": "Deep pothole near the crossing.",
            "latitude": "28.613900",
            "longitude": "77.209000",
            "csrf_token": token,
        },
    )
    assert response.status_code == 201
    created = response.get_json()["report"]
    assert created["hazard_type"] == "Pothole"
    assert created["status"] == "Reported"
    assert created["photo_url"] is None

    listed = test_client.get("/api/reports").get_json()["reports"]
    assert len(listed) == 1
    assert listed[0]["id"] == created["id"]
    assert listed[0]["description"] == "Deep pothole near the crossing."


def test_rejects_invalid_hazard_type(client):
    test_client, _upload_folder = client
    token = _login(test_client)
    response = test_client.post(
        "/api/reports",
        data={
            "hazard_type": "Alien landing",
            "description": "This should be rejected.",
            "latitude": "28.6",
            "longitude": "77.2",
            "csrf_token": token,
        },
    )
    assert response.status_code == 400
    assert "error" in response.get_json()


def test_rejects_missing_location(client):
    test_client, _upload_folder = client
    token = _login(test_client)
    response = test_client.post(
        "/api/reports",
        data={
            "hazard_type": "Waterlogging",
            "description": "Standing water after rain.",
            "csrf_token": token,
        },
    )
    assert response.status_code == 400


def test_anonymous_report_is_rejected(client):
    test_client, _upload_folder = client
    test_client.get("/")
    with test_client.session_transaction() as sess:
        token = sess["csrf_token"]
    response = test_client.post(
        "/api/reports",
        data={
            "hazard_type": "Pothole",
            "description": "Should be rejected without login.",
            "latitude": "28.613900",
            "longitude": "77.209000",
            "csrf_token": token,
        },
    )
    assert response.status_code == 401


def test_saves_photo_with_safe_filename(client):
    test_client, upload_folder = client
    token = _login(test_client)
    response = test_client.post(
        "/api/reports",
        data={
            "hazard_type": "Damaged Road",
            "description": "Broken pavement on the left lane.",
            "latitude": "19.076000",
            "longitude": "72.877700",
            "csrf_token": token,
            "photo": (BytesIO(TINY_PNG), "unsafe name.png"),
        },
        content_type="multipart/form-data",
    )
    assert response.status_code == 201
    report = response.get_json()["report"]
    assert report["photo_url"].startswith("/uploads/")
    saved_name = Path(report["photo_url"]).name
    assert saved_name != "unsafe name.png"
    assert (upload_folder / saved_name).is_file()


def test_rejects_out_of_range_coordinates(client):
    test_client, _upload_folder = client
    token = _login(test_client)
    response = test_client.post(
        "/api/reports",
        data={
            "hazard_type": "Pothole",
            "description": "Pothole with out-of-range coordinates.",
            "latitude": "95.000000",
            "longitude": "77.209000",
            "csrf_token": token,
        },
    )
    assert response.status_code == 400
    assert "error" in response.get_json()


def test_preserves_exact_coordinates(client):
    test_client, _upload_folder = client
    token = _login(test_client)
    lat = 28.613945
    lng = 77.209012
    response = test_client.post(
        "/api/reports",
        data={
            "hazard_type": "Waterlogging",
            "description": "Exact coordinate waterlogging report.",
            "latitude": str(lat),
            "longitude": str(lng),
            "csrf_token": token,
        },
    )
    assert response.status_code == 201
    created = response.get_json()["report"]
    assert created["latitude"] == lat
    assert created["longitude"] == lng

    res_get = test_client.get("/api/reports")
    assert res_get.status_code == 200
    reports = res_get.get_json()["reports"]
    matching = [r for r in reports if r["id"] == created["id"]]
    assert len(matching) == 1
    assert matching[0]["latitude"] == lat
    assert matching[0]["longitude"] == lng

