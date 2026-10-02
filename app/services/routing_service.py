import requests

BROUTER_URL = "http://localhost:17777/brouter"
DEFAULT_PROFILE = "alpine"

class RoutingService:
    def _request(self, waypoints):
        lonlats = "|".join(f"{lon},{lat}" for lat, lon in waypoints)
        params = {"lonlats": lonlats, "profile": DEFAULT_PROFILE,
                  "alternativeidx": 0, "format": "geojson"}
        r = requests.get(BROUTER_URL, params=params, timeout=30)
        r.raise_for_status()
        return r.json()["features"][0]["geometry"]["coordinates"]

    def calculate_route(self, waypoints):
        if len(waypoints) < 2:
            return [[lon, lat] for lat, lon in waypoints]
        try:
            return self._request(waypoints)
        except requests.exceptions.ConnectionError:
            print("[RoutingService] BRouter injoignable")
            return [[lon, lat] for lat, lon in waypoints]
        except requests.exceptions.RequestException as e:
            body = getattr(getattr(e, "response", None), "text", "")
            print(f"[RoutingService] échec global : {e}\n{body[:300]}")

        coords = []
        for a, b in zip(waypoints, waypoints[1:]):
            try:
                part = self._request([a, b])
            except requests.exceptions.RequestException:
                part = [[a[1], a[0]], [b[1], b[0]]]  # ligne droite pour ce tronçon seul
            for c in part:
                if not coords or coords[-1][:2] != c[:2]:
                    coords.append(c)
        return coords