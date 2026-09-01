from PySide6.QtCore import QObject

class Api(QObject):
    """
    Pont exposé au JavaScript via QWebChannel.
    Vide pour l'étape 1 : la carte fonctionne entièrement côté JS.
    On le garde en place pour brancher les étapes suivantes (points, GPX...).
    """
    pass