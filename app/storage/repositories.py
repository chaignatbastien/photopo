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

class RouteRepository:
    def create(self, name, color, point_ids):
        conn = get_connection()
        cur = conn.execute(
            "INSERT INTO routes (name, color) VALUES (?, ?)", (name, color)
        )
        route_id = cur.lastrowid
        for order, point_id in enumerate(point_ids):
            conn.execute(
                "INSERT INTO route_points (route_id, point_id, sequence_order) VALUES (?, ?, ?)",
                (route_id, point_id, order)
            )
        conn.commit()
        conn.close()
        return route_id

    def list_all(self):
        conn = get_connection()
        routes = conn.execute("SELECT * FROM routes").fetchall()
        result = []
        for route in routes:
            points = conn.execute("""
                SELECT p.id, p.name, p.lat, p.lon, p.photo_filename
                FROM route_points rp
                JOIN points p ON p.id = rp.point_id
                WHERE rp.route_id = ?
                ORDER BY rp.sequence_order
            """, (route["id"],)).fetchall()
            result.append({
                "id": route["id"], "name": route["name"], "color": route["color"],
                "points": [dict(p) for p in points]
            })
        conn.close()
        return result