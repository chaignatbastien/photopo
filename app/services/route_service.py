from app.storage.repositories import RouteRepository, PointRepository
from app.services.routing_service import RoutingService


class RouteService:
    def __init__(self):
        self._repo = RouteRepository()
        self._point_repo = PointRepository()
        self._routing = RoutingService()

    def calculate_route(self, waypoints):
        return self._routing.calculate_route(waypoints)

    def create_route(self, name, color, point_ids, is_free_flags, geometry):
        return self._repo.create(name, color, point_ids, geometry, is_free_flags)

    def update_route(self, route_id, name, color, point_ids, is_free_flags, geometry):
        self._repo.update(route_id, name, color, point_ids, is_free_flags, geometry)

    def update_route_style(self, route_id, name, color):
        self._repo.update_style(route_id, name, color)

    def get_route_points(self, route_id):
        return self._repo.get_route_points(route_id)

    def list_routes(self):
        return self._repo.list_all()

    def get_route(self, route_id):
        return self._repo.get(route_id)

    def delete_route(self, route_id):
        orphan_ids = self._repo.get_deletable_route_point_ids(route_id)
        self._repo.delete(route_id)
        for point_id in orphan_ids:
            self._point_repo.delete(point_id)

    def update_route_tags(self, route_id, tags):
        self._repo.update_tags(route_id, tags)
