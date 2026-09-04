import requests

BROUTER_URL = "https://brouter.de/brouter"
DEFAULT_PROFILE = "foot-hiking"


class RoutingService:
    def calculate_route(self, waypoints):
        """waypoints : liste de (lat, lon), dans l'ordre. Retourne une liste de [lon, lat]."""
        if len(waypoints) < 2:
            return [[lon, lat] for lat, lon in waypoints]

        lonlats = "|".join(f"{lon},{lat}" for lat, lon in waypoints)
        params = {
            "lonlats": lonlats,
            "profile": DEFAULT_PROFILE,
            "alternativeidx": 0,
            "format": "geojson",
        }
        response = requests.get(BROUTER_URL, params=params, timeout=15)
        response.raise_for_status()
        return response.json()["features"][0]["geometry"]["coordinates"]