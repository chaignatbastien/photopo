import json
from PySide6.QtCore import QObject, Slot
from app.services.point_service import PointService


class Api(QObject):
    def __init__(self):
        super().__init__()
        self.point_service = PointService()

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
        