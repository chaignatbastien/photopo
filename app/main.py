import sys
import os
from PySide6.QtWidgets import QApplication, QMainWindow
from PySide6.QtWebChannel import QWebChannel
from PySide6.QtCore import QUrl

from app.api import Api
from app.webview import MapWebView
from app.storage.database import init_db
from app.storage.repositories import PointRepository
from app.services.photo_service import PhotoService
from app.services.brouter_server import BRouterServer

def get_frontend_path():
    if getattr(sys, "frozen", False):
        base_path = sys._MEIPASS
    else:
        base_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    return os.path.join(base_path, "frontend", "index.html")

class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Itinéraires")
        self.resize(1200, 800)

        point_repository = PointRepository()
        photo_service = PhotoService()

        self.browser = MapWebView(photo_service, point_repository)
        self.setCentralWidget(self.browser)

        settings = self.browser.settings()
        from PySide6.QtWebEngineCore import QWebEngineSettings
        settings.setAttribute(QWebEngineSettings.WebAttribute.LocalContentCanAccessRemoteUrls, True)
        settings.setAttribute(QWebEngineSettings.WebAttribute.LocalContentCanAccessRemoteUrls, True)
        settings.setAttribute(QWebEngineSettings.WebAttribute.LocalContentCanAccessFileUrls, True)

        self.channel = QWebChannel()
        self.api = Api()
        self.channel.registerObject("api", self.api)
        self.browser.page().setWebChannel(self.channel)

        self.browser.load(QUrl.fromLocalFile(get_frontend_path()))


def main():
    init_db()
    app = QApplication(sys.argv)
    brouter = BRouterServer()
    brouter.start()
    app.aboutToQuit.connect(brouter.stop)
    window = MainWindow()
    window.show()
    sys.exit(app.exec())


if __name__ == "__main__":
    main()