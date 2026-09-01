from PySide6.QtCore import QObject, Slot

class Api(QObject):
    """
    Pont exposé au JavaScript via QWebChannel.
    Vide pour l'étape 1 : la carte fonctionne entièrement côté JS.
    On le garde en place pour brancher les étapes suivantes (points, GPX...).
    """
    @Slot(float, float)
    def add_point(self, lat, lng) :
        print("Nouveau point :", lat, lng)