# RoadSense — Smart Road Safety Platform

RoadSense is a web app for reporting and exploring road hazards. This repository includes **Phase 3**: a Flask landing page, an interactive OpenStreetMap view, a report form, local SQLite storage, user authentication, a My Reports page, and an admin dashboard.

There are no invented map markers. Markers appear only after someone submits a report.

## What you need

- Windows 10 or 11
- [Python 3.10 or newer](https://www.python.org/downloads/)
  - During install, check **Add python.exe to PATH**
- An internet connection (needed for OpenStreetMap tiles and Leaflet)

## Setup and run (Windows)

Open **Command Prompt** or **PowerShell**, then run these commands one by one.

```bat
cd C:\Users\Lenovo\Desktop\Roadsence
```

Create a virtual environment (skip this if `venv` already exists):

```bat
python -m venv venv
```

Activate it:

```bat
venv\Scripts\activate
```

Install packages:

```bat
pip install -r requirements.txt
```

Start the website:

```bat
python app.py
```

Open your browser and go to:

```
http://127.0.0.1:5000
```

To stop the server, press `Ctrl + C` in the terminal.

To leave the virtual environment later:

```bat
deactivate
```

## Database migration

The first time the app starts after upgrading to Phase 3 it automatically:

- creates a `users` table (id, username, password_hash, is_admin, created_at);
- adds a nullable `user_id` column to the existing `reports` table.

Reports created before authentication keep `user_id = NULL` and are **not** assigned to any user. They still appear on the public map.

A backup of the previous database is stored at `instance/roadsense.db.phase2.bak`. If you need to roll back, stop the server, replace `instance/roadsense.db` with the backup, and restart.

## Create an administrator account

The admin role can only be granted through the command line — there is no web form that lets a user become an admin.

With the virtual environment activated:

```bat
python app.py create-admin adminname yourpassword
```

Or via the Flask CLI:

```bat
set FLASK_APP=app.py
flask create-admin adminname yourpassword
```

Use a strong password. The password is stored as a salted PBKDF2-SHA256 hash, never as plaintext.

## Try Phase 3 locally

1. Open http://127.0.0.1:5000
2. Click **Register** and create an account (username 3–32 chars, password at least 8 chars).
3. You are logged in automatically. The nav now shows your username and **Log out**.
4. Scroll to **Report a Hazard**, click the map to choose a location, fill in type and description, optionally attach a photo, and submit.
5. Click **My Reports** in the nav to see only your submissions.
6. Open a separate browser or log out and register another account — its My Reports page will not show the first user's reports.
7. Create an admin account (see above), log in as that admin, and click **Admin** in the nav.
8. In the admin dashboard, change a report's status (Reported → In Progress → Resolved) and click **Update**.
9. A normal (non-admin) user who visits `/admin` gets a 403 Forbidden page.

The default map view is New Delhi. You can click anywhere in the world to set a location.

## Run tests

With the virtual environment activated:

```bat
cd C:\Users\Lenovo\Desktop\Roadsence
venv\Scripts\activate
python -m pytest -q
```

Tests use a temporary database. They do not change `instance/roadsense.db`.

## Project folders

```
Roadsence/
├── app.py                 Flask app, routes, auth, admin, CLI
├── database.py            SQLite helpers (reports + users)
├── requirements.txt       Python packages to install
├── README.md              This file
├── instance/              Created automatically; holds roadsense.db
├── uploads/               Saved photos (not stored in the database)
├── tests/
│   ├── test_reports.py    Map, reporting, upload, ownership tests
│   └── test_auth.py       Registration, login, logout, admin, CSRF tests
├── templates/
│   ├── base.html          Shared header/footer + CSRF meta
│   ├── index.html         Landing page, map, and form
│   ├── register.html      Registration form
│   ├── login.html         Login form
│   ├── my_reports.html    Current user's reports
│   └── admin.html         Admin dashboard
└── static/
    ├── css/style.css      Page styles
    └── js/script.js       Menu, Leaflet map, and form submit
```

## Phase 3 features

- Secure user registration, login, and logout (salted PBKDF2-SHA256 password hashes via Werkzeug)
- HttpOnly, SameSite=Lax session cookies
- CSRF tokens on all state-changing form submissions
- Report ownership: every new report is linked to the logged-in user
- My Reports page showing only the current user's submissions
- Admin dashboard to review all reports and update statuses (Reported, In Progress, Resolved, Dismissed)
- Server-side authorization: non-admins cannot reach `/admin` or change statuses
- CLI-only admin creation (no self-service admin elevation)
- Existing pre-auth reports preserved with `user_id = NULL`

AI features and live traffic feeds are not part of this phase.
