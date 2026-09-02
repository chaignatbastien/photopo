import sqlite3
import os
from app.config import DB_PATH, DATA_DIR, PHOTOS_DIR


def get_connection():
    os.makedirs(DATA_DIR, exist_ok=True)
    os.makedirs(PHOTOS_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row  # permet d'accéder aux colonnes par nom
    return conn


def init_db():
    conn = get_connection()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS points (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            lat REAL NOT NULL,
            lon REAL NOT NULL,
            photo_filename TEXT
        )
    """)
    conn.commit()
    conn.close()