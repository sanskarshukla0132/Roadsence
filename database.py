"""SQLite helpers for road hazard reports and users."""

import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from werkzeug.security import check_password_hash, generate_password_hash

CREATE_USERS_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);
"""

CREATE_REPORTS_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hazard_type TEXT NOT NULL,
    description TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    photo_filename TEXT,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    user_id INTEGER
);
"""

ALLOWED_STATUSES = ("Reported", "In Progress", "Resolved", "Dismissed")


def get_connection(db_path):
    """Open a SQLite connection that returns rows as dictionaries."""
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(db_path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def _column_exists(connection, table, column):
    rows = connection.execute(f"PRAGMA table_info({table})").fetchall()
    return any(row["name"] == column for row in rows)


def init_db(db_path):
    """Create tables and migrate the schema if needed."""
    connection = get_connection(db_path)
    try:
        connection.execute(CREATE_USERS_TABLE_SQL)
        connection.execute(CREATE_REPORTS_TABLE_SQL)
        if not _column_exists(connection, "reports", "user_id"):
            connection.execute("ALTER TABLE reports ADD COLUMN user_id INTEGER")
        connection.commit()
    finally:
        connection.close()


def create_user(db_path, username, password, is_admin=False):
    """Insert a user with a hashed password. Returns the new row or None on conflict."""
    created_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    password_hash = generate_password_hash(password)
    connection = get_connection(db_path)
    try:
        cursor = connection.execute(
            """
            INSERT INTO users (username, password_hash, is_admin, created_at)
            VALUES (?, ?, ?, ?)
            """,
            (username, password_hash, 1 if is_admin else 0, created_at),
        )
        connection.commit()
        return get_user_by_id(db_path, cursor.lastrowid)
    except sqlite3.IntegrityError:
        return None
    finally:
        connection.close()


def get_user_by_id(db_path, user_id):
    connection = get_connection(db_path)
    try:
        row = connection.execute(
            "SELECT * FROM users WHERE id = ?", (user_id,)
        ).fetchone()
        return dict(row) if row else None
    finally:
        connection.close()


def get_user_by_username(db_path, username):
    connection = get_connection(db_path)
    try:
        row = connection.execute(
            "SELECT * FROM users WHERE username = ?", (username,)
        ).fetchone()
        return dict(row) if row else None
    finally:
        connection.close()


def verify_password(user, password):
    """Check a plaintext password against a user's stored hash."""
    if not user:
        return False
    return check_password_hash(user["password_hash"], password)


def create_report(
    db_path,
    hazard_type,
    description,
    latitude,
    longitude,
    photo_filename=None,
    status="Reported",
    user_id=None,
):
    """Insert one report and return the new row as a dict."""
    created_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    connection = get_connection(db_path)
    try:
        cursor = connection.execute(
            """
            INSERT INTO reports (
                hazard_type, description, latitude, longitude,
                photo_filename, status, created_at, user_id
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                hazard_type,
                description,
                latitude,
                longitude,
                photo_filename,
                status,
                created_at,
                user_id,
            ),
        )
        connection.commit()
        return get_report(db_path, cursor.lastrowid)
    finally:
        connection.close()


def get_report(db_path, report_id):
    connection = get_connection(db_path)
    try:
        row = connection.execute(
            "SELECT * FROM reports WHERE id = ?", (report_id,)
        ).fetchone()
        return dict(row) if row else None
    finally:
        connection.close()


def list_reports(db_path, user_id=None):
    """Return reports, newest first. Filter by user_id when provided."""
    connection = get_connection(db_path)
    try:
        if user_id is None:
            rows = connection.execute(
                "SELECT * FROM reports ORDER BY id DESC"
            ).fetchall()
        else:
            rows = connection.execute(
                "SELECT * FROM reports WHERE user_id = ? ORDER BY id DESC",
                (user_id,),
            ).fetchall()
        return [dict(row) for row in rows]
    finally:
        connection.close()


def list_all_reports_with_users(db_path):
    """Admin view: reports joined with usernames, newest first."""
    connection = get_connection(db_path)
    try:
        rows = connection.execute(
            """
            SELECT reports.*, users.username AS reporter_username
            FROM reports
            LEFT JOIN users ON reports.user_id = users.id
            ORDER BY reports.id DESC
            """
        ).fetchall()
        return [dict(row) for row in rows]
    finally:
        connection.close()


def update_report_status(db_path, report_id, status):
    """Update a report's status. Returns the updated row or None if not found."""
    if status not in ALLOWED_STATUSES:
        return None
    connection = get_connection(db_path)
    try:
        cursor = connection.execute(
            "UPDATE reports SET status = ? WHERE id = ?",
            (status, report_id),
        )
        connection.commit()
        if cursor.rowcount == 0:
            return None
        return get_report(db_path, report_id)
    finally:
        connection.close()
