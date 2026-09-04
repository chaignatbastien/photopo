import json
from app.storage.database import get_connection


class PointRepository:
    def create(self, name, lat, lon, is_route_point=False):
        conn = get_connection()
        cur = conn.execute(
            "INSERT INTO points (name, lat, lon, is_route_point) VALUES (?, ?, ?, ?)",
            (name, lat, lon, int(is_route_point))
        )
        conn.commit()
        point_id = cur.lastrowid
        conn.close()
        return point_id

    def list_all(self):
        conn = get_connection()
        # Un point d'itinéraire n'apparaît que s'il a reçu une photo
        rows = conn.execute(
            "SELECT * FROM points WHERE is_route_point = 0 OR photo_filename IS NOT NULL"
        ).fetchall()
        conn.close()
        return [dict(row) for row in rows]

    def delete(self, point_id):
        conn = get_connection()
        conn.execute("DELETE FROM points WHERE id = ?", (point_id,))
        conn.commit()
        conn.close()

    def set_photo(self, point_id, filename):
        conn = get_connection()
        conn.execute("UPDATE points SET photo_filename = ? WHERE id = ?", (filename, point_id))
        conn.commit()
        conn.close()

    def update_position(self, point_id, lat, lon):
        conn = get_connection()
        conn.execute("UPDATE points SET lat = ?, lon = ? WHERE id = ?", (lat, lon, point_id))
        conn.commit()
        conn.close()

    def update_name(self, point_id, name):
        conn = get_connection()
        conn.execute("UPDATE points SET name = ? WHERE id = ?", (name, point_id))
        conn.commit()
        conn.close()


class RouteRepository:
    def create(self, name, color, point_ids, geometry_coords):
        conn = get_connection()
        cur = conn.execute(
            "INSERT INTO routes (name, color, geometry) VALUES (?, ?, ?)",
            (name, color, json.dumps(geometry_coords))
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
        result = [
            {"id": r["id"], "name": r["name"], "color": r["color"], "geometry": json.loads(r["geometry"])}
            for r in routes
        ]
        conn.close()
        return result

    def delete(self, route_id):
        conn = get_connection()
        conn.execute("DELETE FROM routes WHERE id = ?", (route_id,))
        conn.commit()
        conn.close()