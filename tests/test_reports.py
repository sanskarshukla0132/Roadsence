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


def test_theme_switcher_rendered_in_base_template(client):
    test_client, _upload_folder = client
    response = test_client.get("/")
    assert response.status_code == 200
    assert b'id="theme-toggle"' in response.data
    assert b'theme-toggle-btn' in response.data
    assert b'theme-icon-sun' in response.data
    assert b'theme-icon-moon' in response.data
    assert b'roadsense-theme' in response.data



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


def test_ola_uber_map_elements_present(client):
    test_client, _upload_folder = client
    response = test_client.get("/")
    assert response.status_code == 200
    html = response.get_data(as_text=True)
    assert "ola-map-shell" in html
    assert "hazard-map" in html
    assert "route-panel" in html
    assert "nearby-panel" in html
    assert "ola-floating-legend" in html
    assert "photo-modal" in html
    assert "leaflet-heat.js" in html


def test_osm_keyless_tiles_configured(client):
    test_client, _upload_folder = client
    response = test_client.get("/static/js/script.js")
    assert response.status_code == 200
    js_code = response.get_data(as_text=True)
    assert "tile.openstreetmap.org" in js_code
    assert "OpenStreetMap" in js_code
    assert "switchTileLayer(\"osm\")" in js_code
    assert "cartocdn" not in js_code


def test_about_page_loads(client):
    test_client, _upload_folder = client
    response = test_client.get("/about")
    assert response.status_code == 200
    html = response.get_data(as_text=True)
    assert "about-3d-canvas" in html
    assert "three.min.js" in html
    assert "about.js" in html
    assert "Why RoadSense Exists" in html
    assert "Pothole Dynamics" in html
    assert "The Future Scope of RoadSense" in html


def test_report_page_redirects_unauthenticated(client):
    test_client, _upload_folder = client
    response = test_client.get("/report")
    assert response.status_code == 302
    assert "/login?next=" in response.headers.get("Location", "")
    assert "report" in response.headers.get("Location", "")


def test_report_page_loads_for_authenticated_user(client):
    test_client, _upload_folder = client
    _login(test_client, username="reporter1", password="password123")
    response = test_client.get("/report")
    assert response.status_code == 200
    html = response.get_data(as_text=True)
    # Check Header & Stepper
    assert "Report a Road Hazard" in html
    assert "stepper-shell" in html
    assert "step-node-1" in html
    # Check Hazard Selection Cards
    assert "hazard-cards-grid" in html
    assert "card-pothole" in html
    assert "card-damaged" in html
    assert "card-waterlogging" in html
    assert "card-other" in html
    # Check Character Counter & Description
    assert "char-counter" in html
    assert "desc-status-badge" in html
    # Check Drag-and-Drop Uploader
    assert "drop-zone" in html
    assert "photo-preview-wrap" in html
    assert "remove-photo-btn" in html
    # Check Location & Light Map
    assert "btn-report-locate" in html
    assert "report-mini-map" in html
    assert "report-geo-search" in html
    # Check Script & Success Panel
    assert "report.js" in html
    assert "report-success-view" in html


def test_report_js_file_available(client):
    test_client, _upload_folder = client
    response = test_client.get("/static/js/report.js")
    assert response.status_code == 200
    code = response.get_data(as_text=True)
    assert "tile.openstreetmap.org" in code
    assert "initMiniMap" in code
    assert "autoDetectLocation" in code
    assert "selectHazardCard" in code
    assert "handleDescriptionInput" in code


def test_home_page_report_elements_upgraded(client):
    test_client, _upload_folder = client
    _login(test_client, username="home_reporter", password="password123")
    response = test_client.get("/")
    assert response.status_code == 200
    html = response.get_data(as_text=True)
    assert "hazard-cards-compact" in html
    assert "card-pothole" in html
    assert "card-damaged" in html
    assert "card-waterlogging" in html
    assert "char-counter" in html
    assert "drop-zone" in html


def test_geocode_empty_query(client):
    test_client, _upload_folder = client
    res = test_client.get("/api/geocode?q=")
    assert res.status_code == 200
    assert res.get_json() == {"results": []}

    res_short = test_client.get("/api/geocode?q=a")
    assert res_short.status_code == 200
    assert res_short.get_json() == {"results": []}


def test_geocode_local_hazard_matching(client):
    test_client, _upload_folder = client
    token = _login(test_client, username="geotester", password="password123")
    create_res = test_client.post(
        "/api/reports",
        data={
            "csrf_token": token,
            "hazard_type": "Pothole",
            "description": "Deep asphalt trench near central metro station",
            "latitude": "28.613900",
            "longitude": "77.209000",
        },
    )
    assert create_res.status_code == 201

    search_res = test_client.get("/api/geocode?q=metro")
    assert search_res.status_code == 200
    data = search_res.get_json()
    assert "results" in data
    assert any(r.get("type") == "hazard" and "metro" in r.get("display_name", "").lower() for r in data["results"])


def test_reverse_geocode_endpoint(client):
    test_client, _upload_folder = client
    res = test_client.get("/api/reverse-geocode?lat=28.6139&lon=77.2090")
    assert res.status_code == 200
    data = res.get_json()
    assert "display_name" in data
    assert len(data["display_name"]) > 0

    res_missing = test_client.get("/api/reverse-geocode")
    assert res_missing.status_code == 400






