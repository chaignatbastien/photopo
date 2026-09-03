from app.storage.repositories import RouteRepository


class RouteService:
    def __init__(self):
        self._repo = RouteRepository()

    def create_route(self, name, color, point_ids):
        return self._repo.create(name, color, point_ids)

    def list_routes(self):
        return self._repo.list_all()