import json
from PySide6.QtCore import QObject, Slot
from PySide6.QtWidgets import QFileDialog
from app.services.point_service import PointService
from app.services.photo_service import PhotoService
from app.services.route_service import RouteService
from app.services.gpx_service import GpxService
from app.storage.repositories import PointRepository


class Api(QObject):
    def __init__(self):
        super().__init__()
        self.point_service = PointService()
        self.photo_service = PhotoService()
        self.point_repository = PointRepository()
        self.route_service = RouteService()
        self.gpx_service = GpxService()

    @Slot(float, float, str, result=str)
    def add_point(self, lat, lon, name):
        point = self.point_service.create_point(lat, lon, name)
        return json.dumps(point)

    @Slot(result=str)
    def get_points(self):
        return json.dumps(self.point_service.list_points())

    @Slot(int)
    def delete_point(self, point_id):
        self.point_service.delete_point(point_id)

    @Slot(int, float, float)
    def update_point_position(self, point_id, lat, lon):
        self.point_service.move_point(point_id, lat, lon)

    @Slot(int, str)
    def rename_point(self, point_id, name):
        self.point_service.rename_point(point_id, name)

    @Slot(int, str, str, result=str)
    def add_photo_from_data(self, point_id, filename, data_url):
        photo_url = self.photo_service.save_photo_from_bytes(
            self.point_repository, point_id, filename, data_url
        )
        return json.dumps(photo_url)

    @Slot(float, float, str, result=str)
    def add_route_point(self, lat, lon, name):
        return json.dumps(self.point_service.create_route_point(lat, lon, name))

    @Slot(str, result=str)
    def calculate_route(self, waypoints_json):
        waypoints = json.loads(waypoints_json)  # liste de [lat, lon]
        coords = self.route_service.calculate_route([(w[0], w[1]) for w in waypoints])
        return json.dumps(coords)

    @Slot(str, str, str, str, str, result=int)
    def create_route(self, name, color, point_ids_json, is_free_json, geometry_json):
        return self.route_service.create_route(
            name, color,
            json.loads(point_ids_json), json.loads(is_free_json), json.loads(geometry_json)
        )

    @Slot(int, str, str, str, str, str)
    def update_route(self, route_id, name, color, point_ids_json, is_free_json, geometry_json):
        self.route_service.update_route(
            route_id, name, color,
            json.loads(point_ids_json), json.loads(is_free_json), json.loads(geometry_json)
        )

    @Slot(int, str, str)
    def update_route_style(self, route_id, name, color):
        self.route_service.update_route_style(route_id, name, color)

    @Slot(int, result=str)
    def get_route_points(self, route_id):
        points = self.route_service.get_route_points(route_id)
        # On réutilise l'enrichissement de PointService (ajoute photo_url)
        # pour que ces points se comportent comme les autres dans les popups.
        enriched = [self.point_service._enrich(p) for p in points]
        return json.dumps(enriched)

    @Slot(result=str)
    def get_routes(self):
        return json.dumps(self.route_service.list_routes())

    @Slot(int)
    def delete_route(self, route_id):
        self.route_service.delete_route(route_id)

    @Slot(int)
    def export_route_gpx(self, route_id):
        route = self.route_service.get_route(route_id)
        if route is None:
            return
        file_path, _ = QFileDialog.getSaveFileName(
            None, "Exporter l'itinéraire en GPX", f"{route['name']}.gpx", "Fichiers GPX (*.gpx)"
        )
        if not file_path:
            return  # l'utilisateur a annulé
        if not file_path.lower().endswith(".gpx"):
            file_path += ".gpx"
        self.gpx_service.export_gpx(file_path, route["name"], route["geometry"])

    @Slot(result=str)
    def import_gpx_route(self):
        file_path, _ = QFileDialog.getOpenFileName(
            None, "Importer un itinéraire GPX", "", "Fichiers GPX (*.gpx)"
        )
        if not file_path:
            return json.dumps(None)  # l'utilisateur a annulé

        try:
            parsed = self.gpx_service.parse_gpx(file_path)
        except Exception:
            return json.dumps({"error": "Ce fichier n'a pas pu être lu comme un GPX valide."})

        geometry = parsed["geometry"]
        if len(geometry) < 2:
            return json.dumps({"error": "Aucune trace exploitable n'a été trouvée dans ce fichier."})

        # On ne crée pas un point pour chaque coordonnée de la trace (souvent
        # des milliers) : seuls le départ et l'arrivée deviennent des points
        # "libres" éditables, la trace complète reste dans la géométrie.
        start_lon, start_lat = geometry[0][0], geometry[0][1]
        end_lon, end_lat = geometry[-1][0], geometry[-1][1]
        start_point = self.point_service.create_route_point(start_lat, start_lon, f"{parsed['name']} (départ)")
        end_point = self.point_service.create_route_point(end_lat, end_lon, f"{parsed['name']} (arrivée)")

        color = "#3388ff"
        route_id = self.route_service.create_route(
            parsed["name"], color,
            [start_point["id"], end_point["id"]],
            [True, True],
            geometry
        )

        return json.dumps({
            "id": route_id, "name": parsed["name"], "color": color, "geometry": geometry,
            "start_point": start_point, "end_point": end_point,
        })

    @Slot(int, str)
    def update_point_tags(self, point_id, tags_json):
        self.point_service.update_point_tags(point_id, json.loads(tags_json))

    @Slot(int, str)
    def update_route_tags(self, route_id, tags_json):
        self.route_service.update_route_tags(route_id, json.loads(tags_json))

    @Slot(int, str, int)
    def update_route_done_info(self, route_id, done_date, actual_minutes):
        self.route_service.update_route_done_info(
            route_id,
            done_date or None,
            actual_minutes if actual_minutes >= 0 else None
        )
