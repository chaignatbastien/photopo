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

    def update_tags(self, point_id, tags):
        conn = get_connection()
        conn.execute("UPDATE points SET tags = ? WHERE id = ?", (json.dumps(tags), point_id))
        conn.commit()
        conn.close()


class RouteRepository:
    def create(self, name, color, point_ids, geometry_coords, is_free_flags=None, tags=None):
        if is_free_flags is None:
            is_free_flags = [False] * len(point_ids)

        conn = get_connection()
        cur = conn.execute(
            "INSERT INTO routes (name, color, geometry, tags) VALUES (?, ?, ?, ?)",
            (name, color, json.dumps(geometry_coords), json.dumps(tags or []))
        )
        route_id = cur.lastrowid
        for order, (point_id, is_free) in enumerate(zip(point_ids, is_free_flags)):
            conn.execute(
                "INSERT INTO route_points (route_id, point_id, sequence_order, is_free) VALUES (?, ?, ?, ?)",
                (route_id, point_id, order, int(is_free))
            )
        conn.commit()
        conn.close()
        return route_id

    def update(self, route_id, name, color, point_ids, is_free_flags, geometry_coords):
        conn = get_connection()
        conn.execute(
            "UPDATE routes SET name = ?, color = ?, geometry = ? WHERE id = ?",
            (name, color, json.dumps(geometry_coords), route_id)
        )
        # On recrée entièrement la liste des points de l'itinéraire : plus
        # simple et fiable que de réconcilier ajouts/suppressions/réordonnancement.
        conn.execute("DELETE FROM route_points WHERE route_id = ?", (route_id,))
        for order, (point_id, is_free) in enumerate(zip(point_ids, is_free_flags)):
            conn.execute(
                "INSERT INTO route_points (route_id, point_id, sequence_order, is_free) VALUES (?, ?, ?, ?)",
                (route_id, point_id, order, int(is_free))
            )
        conn.commit()
        conn.close()

    def update_style(self, route_id, name, color):
        conn = get_connection()
        conn.execute("UPDATE routes SET name = ?, color = ? WHERE id = ?", (name, color, route_id))
        conn.commit()
        conn.close()

    def update_tags(self, route_id, tags):
        conn = get_connection()
        conn.execute("UPDATE routes SET tags = ? WHERE id = ?", (json.dumps(tags), route_id))
        conn.commit()
        conn.close()

    def get_route_points(self, route_id):
        conn = get_connection()
        rows = conn.execute("""
            SELECT p.id, p.name, p.lat, p.lon, p.photo_filename, p.is_route_point, p.tags, rp.is_free
            FROM route_points rp
            JOIN points p ON p.id = rp.point_id
            WHERE rp.route_id = ?
            ORDER BY rp.sequence_order
        """, (route_id,)).fetchall()
        conn.close()
        return [dict(row) for row in rows]

    def list_all(self):
        conn = get_connection()
        routes = conn.execute("SELECT * FROM routes").fetchall()
        result = [
            {
                "id": r["id"], "name": r["name"], "color": r["color"],
                "geometry": json.loads(r["geometry"]),
                "tags": json.loads(r["tags"]) if r["tags"] else [],
            }
            for r in routes
        ]
        conn.close()
        return result

    def get(self, route_id):
        conn = get_connection()
        row = conn.execute("SELECT * FROM routes WHERE id = ?", (route_id,)).fetchone()
        conn.close()
        if row is None:
            return None
        return {
            "id": row["id"], "name": row["name"], "color": row["color"],
            "geometry": json.loads(row["geometry"]),
            "tags": json.loads(row["tags"]) if row["tags"] else [],
        }

    def delete(self, route_id):
        conn = get_connection()
        conn.execute("DELETE FROM routes WHERE id = ?", (route_id,))
        conn.commit()
        conn.close()