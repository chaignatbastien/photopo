import sqlite3
import os
from app.config import DB_PATH, DATA_DIR, PHOTOS_DIR


def get_connection():
    os.makedirs(DATA_DIR, exist_ok=True)
    os.makedirs(PHOTOS_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row  # permet d'accéder aux colonnes par nom

    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    conn = get_connection()
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS points (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            lat REAL NOT NULL,
            lon REAL NOT NULL,
            photo_filename TEXT,
            is_route_point INTEGER NOT NULL DEFAULT 0
        )
    """)

    # Migration : ta base existe déjà sans cette colonne, il faut l'ajouter
    existing_columns = [row["name"] for row in conn.execute("PRAGMA table_info(points)").fetchall()]
    if "is_route_point" not in existing_columns:
        conn.execute("ALTER TABLE points ADD COLUMN is_route_point INTEGER NOT NULL DEFAULT 0")

    conn.execute("""
        CREATE TABLE IF NOT EXISTS routes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            color TEXT NOT NULL DEFAULT '#3388ff',
            geometry TEXT NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS route_points (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            route_id INTEGER NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
            point_id INTEGER NOT NULL REFERENCES points(id),
            sequence_order INTEGER NOT NULL
        )
    """)
    
    conn.commit()
    conn.close()