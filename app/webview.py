import os
import json
from PySide6.QtWebEngineWidgets import QWebEngineView


class MapWebView(QWebEngineView):
    """
    Sous-classe de QWebEngineView pour intercepter le dépôt de fichiers
    AVANT qu'il n'atteigne la page web — c'est ce qui nous donne accès
    au vrai chemin absolu du fichier (impossible à obtenir en JS pur).
    """

    def __init__(self, photo_service, point_repository, parent=None):
        super().__init__(parent)
        self.setAcceptDrops(True)
        self.photo_service = photo_service
        self.point_repository = point_repository

    def dragEnterEvent(self, event):
        if event.mimeData().hasUrls():
            event.acceptProposedAction()
        else:
            super().dragEnterEvent(event)

    def dragMoveEvent(self, event):
        if event.mimeData().hasUrls():
            event.acceptProposedAction()
        else:
            super().dragMoveEvent(event)

    def dropEvent(self, event):
        if not event.mimeData().hasUrls():
            super().dropEvent(event)
            return

        file_path = event.mimeData().urls()[0].toLocalFile()
        if not file_path or not os.path.isfile(file_path):
            return

        # Position du dépôt dans la fenêtre (en pixels)
        pos = event.position()
        x, y = pos.x(), pos.y()

        def on_point_id_found(point_id):
            if point_id:
                result = self.photo_service.save_photo_for_point(
                    self.point_repository, int(point_id), file_path
                )
                self.page().runJavaScript(
                    f"markerHasPhoto({point_id}, {json.dumps(result)})"
                )

        self.page().runJavaScript(f"getPointIdAtPixel({x}, {y})", on_point_id_found)
        event.acceptProposedAction()