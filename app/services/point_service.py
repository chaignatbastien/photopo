import os
from PySide6.QtCore import QUrl
from app.storage.repositories import PointRepository
from app.config import PHOTOS_DIR


class PointService:
    def __init__(self):
        self._repo = PointRepository()

    def _enrich(self, point):
        # Construit une URL locale valide pour l'aperçu photo dans la popup,
        # puisque data/photos/ est en dehors du dossier frontend/
        photo_filename = point.get("photo_filename")
        if photo_filename:
            path = os.path.join(PHOTOS_DIR, photo_filename)
            point["photo_url"] = QUrl.fromLocalFile(path).toString()
        else:
            point["photo_url"] = None
        return point

    def create_point(self, lat, lon, name):
        point_id = self._repo.create(name, lat, lon)
        return self._enrich({
            "id": point_id, "name": name, "lat": lat, "lon": lon, "photo_filename": None
        })

    def list_points(self):
        return [self._enrich(p) for p in self._repo.list_all()]

    def delete_point(self, point_id):
        self._repo.delete(point_id)

    def move_point(self, point_id, lat, lon):
        self._repo.update_position(point_id, lat, lon)

    def rename_point(self, point_id, name):
        self._repo.update_name(point_id, name)