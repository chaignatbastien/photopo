import requests

BROUTER_URL = "https://brouter.de/brouter"
DEFAULT_PROFILE = "hiking-mountain"
# "foot-hiking" n'existe pas dans les profils standards livrés avec BRouter
# (trekking, hiking-mountain, shortest, safety, fastbike, moped, car-test...).
# Un nom de profil inconnu fait planter le serveur public brouter.de côté
# back-end, ce qui se traduit systématiquement par un 500 — peu importe où
# sont placés les points. "hiking-mountain" est l'équivalent pédestre en
# terrain de randonnée ; "trekking" est une alternative plus générique si
# celui-ci ne convient pas.


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
        try:
            response = requests.get(BROUTER_URL, params=params, timeout=15)
            response.raise_for_status()
            return response.json()["features"][0]["geometry"]["coordinates"]
        except requests.exceptions.RequestException as e:
            # BRouter (serveur public brouter.de) peut échouer temporairement,
            # ou ne pas trouver de chemin de randonnée assez proche des points
            # choisis. On ne bloque plus tout l'itinéraire dans ce cas : on
            # relie les points par une ligne droite, et on log l'erreur reçue
            # (le corps de la réponse contient souvent la vraie raison, ex.
            # "PointNotFound") pour pouvoir investiguer.
            body = getattr(getattr(e, "response", None), "text", "")
            print(f"[RoutingService] BRouter a échoué : {e}\n{body[:300]}")
            return [[lon, lat] for lat, lon in waypoints]
