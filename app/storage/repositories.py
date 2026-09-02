from app.storage.database import get_connection


class PointRepository:
    def create(self, name, lat, lon):
        conn = get_connection()
        cur = conn.execute(
            "INSERT INTO points (name, lat, lon) VALUES (?, ?, ?)",
            (name, lat, lon)
        )
        conn.commit()
        point_id = cur.lastrowid
        conn.close()
        return point_id

    def list_all(self):
        conn = get_connection()
        rows = conn.execute("SELECT * FROM points").fetchall()
        conn.close()
        return [dict(row) for row in rows]

    def delete(self, point_id):
        conn = get_connection()
        conn.execute("DELETE FROM points WHERE id = ?", (point_id,))
        conn.commit()
        conn.close()

    def set_photo(self, point_id, filename):
        conn = get_connection()
        conn.execute(
            "UPDATE points SET photo_filename = ? WHERE id = ?",
            (filename, point_id)
        )
        conn.commit()
        conn.close()

    def update_position(self, point_id, lat, lon):
        conn = get_connection()
        conn.execute(
            "UPDATE points SET lat = ?, lon = ? WHERE id = ?",
            (lat, lon, point_id)
        )
        conn.commit()
        conn.close()

    def update_name(self, point_id, name):
        conn = get_connection()
        conn.execute("UPDATE points SET name = ? WHERE id = ?", (name, point_id))
        conn.commit()
        conn.close()