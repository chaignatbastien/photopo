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
            photo_date TEXT,
            is_route_point INTEGER NOT NULL DEFAULT 0,
            tags TEXT NOT NULL DEFAULT '[]'
        )
    """)

    # Migration : ta base existe déjà sans cette colonne, il faut l'ajouter
    existing_columns = [row["name"] for row in conn.execute("PRAGMA table_info(points)").fetchall()]
    if "is_route_point" not in existing_columns:
        conn.execute("ALTER TABLE points ADD COLUMN is_route_point INTEGER NOT NULL DEFAULT 0")
    if "tags" not in existing_columns:
        conn.execute("ALTER TABLE points ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'")

    conn.execute("""
        CREATE TABLE IF NOT EXISTS routes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            color TEXT NOT NULL DEFAULT '#3388ff',
            geometry TEXT NOT NULL,
            tags TEXT NOT NULL DEFAULT '[]'
        )
    """)

    # Migration : idem pour "routes" — ta base a été créée avant l'ajout de la
    # colonne "geometry", donc CREATE TABLE IF NOT EXISTS ne l'a jamais ajoutée.
    # C'est ce qui provoquait "table routes has no column named geometry".
    existing_route_columns = [row["name"] for row in conn.execute("PRAGMA table_info(routes)").fetchall()]
    if "geometry" not in existing_route_columns:
        conn.execute("ALTER TABLE routes ADD COLUMN geometry TEXT NOT NULL DEFAULT '[]'")
    if "tags" not in existing_route_columns:
        conn.execute("ALTER TABLE routes ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'")
    if "done_date" not in existing_route_columns:
        conn.execute("ALTER TABLE routes ADD COLUMN done_date TEXT")
    if "actual_minutes" not in existing_route_columns:
        conn.execute("ALTER TABLE routes ADD COLUMN actual_minutes INTEGER")

    conn.execute("""
        CREATE TABLE IF NOT EXISTS route_points (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            route_id INTEGER NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
            point_id INTEGER NOT NULL REFERENCES points(id) ON DELETE CASCADE,
            sequence_order INTEGER NOT NULL,
            is_free INTEGER NOT NULL DEFAULT 0
        )
    """)

    # Migration : l'ancienne table "route_points" n'avait pas ON DELETE CASCADE
    # sur point_id, ce qui provoquait "FOREIGN KEY constraint failed" dès qu'on
    # essayait de supprimer un point utilisé dans un itinéraire. SQLite ne
    # permet pas de modifier une contrainte de clé étrangère avec ALTER TABLE,
    # donc on recrée la table et on recopie les données.
    fk_list = conn.execute("PRAGMA foreign_key_list(route_points)").fetchall()
    point_fk_has_cascade = any(
        fk["table"] == "points" and fk["on_delete"] == "CASCADE" for fk in fk_list
    )
    if not point_fk_has_cascade:
        conn.execute("PRAGMA foreign_keys = OFF")
        conn.execute("ALTER TABLE route_points RENAME TO route_points_old")
        conn.execute("""
            CREATE TABLE route_points (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                route_id INTEGER NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
                point_id INTEGER NOT NULL REFERENCES points(id) ON DELETE CASCADE,
                sequence_order INTEGER NOT NULL,
                is_free INTEGER NOT NULL DEFAULT 0
            )
        """)
        old_columns = [row["name"] for row in conn.execute("PRAGMA table_info(route_points_old)").fetchall()]
        copy_cols = "id, route_id, point_id, sequence_order" + (", is_free" if "is_free" in old_columns else "")
        conn.execute(f"INSERT INTO route_points ({copy_cols}) SELECT {copy_cols} FROM route_points_old")
        conn.execute("DROP TABLE route_points_old")
        conn.execute("PRAGMA foreign_keys = ON")

    # Migration : ajoute "is_free" si la table existait déjà (avec la cascade)
    # mais sans cette colonne — distingue un point de cheminement (routé via
    # BRouter) d'un point libre (relié en ligne droite), utile pour recharger
    # un itinéraire existant en mode édition avec le bon rendu.
    existing_route_points_columns = [row["name"] for row in conn.execute("PRAGMA table_info(route_points)").fetchall()]
    if "is_free" not in existing_route_points_columns:
        conn.execute("ALTER TABLE route_points ADD COLUMN is_free INTEGER NOT NULL DEFAULT 0")

    if "photo_date" not in existing_columns:
        conn.execute("ALTER TABLE points ADD COLUMN photo_date TEXT")

    conn.commit()
    conn.close()