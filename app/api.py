import json
from PySide6.QtCore import QObject, Slot
from app.services.point_service import PointService
from app.services.photo_service import PhotoService
from app.services.route_service import RouteService
from app.storage.repositories import PointRepository


class Api(QObject):
    def __init__(self):
        super().__init__()
        self.point_service = PointService()
        self.photo_service = PhotoService()
        self.point_repository = PointRepository()
        self.route_service = RouteService()

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

    @Slot(str, str, str, str, result=int)
    def create_route(self, name, color, point_ids_json, geometry_json):
        return self.route_service.create_route(
            name, color, json.loads(point_ids_json), json.loads(geometry_json)
        )

    @Slot(result=str)
    def get_routes(self):
        return json.dumps(self.route_service.list_routes())

    @Slot(int)
    def delete_route(self, route_id):
        self.route_service.delete_route(route_id)
